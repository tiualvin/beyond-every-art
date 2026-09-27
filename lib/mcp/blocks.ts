// Blocks through the Markdown tools.
//
// The modules an editor inserts into a body — key facts, FAQs, galleries — are
// Lexical block nodes, and none of them has a Markdown form. Payload's converter
// writes each one as the words "Block Field": an agent reviewing a draft could
// not see what was in it, or that anything was there at all.
//
// So the Markdown tools stand a marker in for each block, on a line of its own:
//
//     <!-- block:keyFacts:65f0c0ffee0000000000abcd -->
//
// An HTML comment because it is inert in any Markdown preview an agent might
// render, and reads to a model as machinery to be left alone. The block's
// contents travel beside the Markdown rather than inside it, as plain JSON, so
// nothing about a block depends on its fields surviving a trip through
// Markdown escaping.
//
// On the way back in, each marker is swapped for the block it names, exactly
// as stored. Moving a marker moves its block. Leaving one out removes the
// block, and the update says so. Anything else — a marker naming no block in
// this draft, one used twice, one run into a paragraph — is refused before
// anything is saved, because each of those can only be a mistake, and saving
// it would put a literal `<!-- block:… -->` on the page.

import { headingText } from '../content/headings'
import type { EditorState } from './markdown'

type LexicalNode = {
  [key: string]: unknown
  type: string
  version: number
  children?: LexicalNode[]
  text?: string
}

/** A block as Payload stores it inside a rich-text body. */
export type BlockNode = {
  [key: string]: unknown
  type: 'block'
  version: number
  fields: {
    [key: string]: unknown
    blockType: string
    blockName?: string
    id?: string
  }
}

/** A block as the read tool reports it. */
export type BlockSummary = {
  /** What its marker is keyed on: the block's id, or `n<ordinal>` without one. */
  key: string
  blockType: string
  /** The exact line that stands in for it in the Markdown. */
  marker: string
  /** The nearest heading above it in the body, or null when it precedes them all. */
  afterHeading: string | null
  fields: Record<string, unknown>
}

/**
 * Letters and digits only, in both halves of a marker.
 *
 * Payload's block ids are hex. An underscore would come back from the Markdown
 * converter as `\_`, which reads back correctly but shows the agent a marker it
 * has to copy with a backslash in it — so anything outside this set is keyed by
 * position instead.
 */
const MARKER_PART = /^[A-Za-z0-9]+$/

/** A paragraph that is one marker and nothing else. */
const WHOLE_MARKER = /^<!--\s*block:([A-Za-z0-9]+):([A-Za-z0-9]+)\s*-->$/

/**
 * Anything that starts like a marker. Deliberately looser than the real thing,
 * so a marker with a typo in it is caught rather than saved as text.
 */
const MARKER_LIKE = /<!--\s*block:/

export function isBlockNode(node: unknown): node is BlockNode {
  const candidate = node as Partial<BlockNode> | null | undefined
  return (
    candidate?.type === 'block' &&
    typeof candidate.fields?.blockType === 'string'
  )
}

export function blockMarker(blockType: string, key: string): string {
  return `<!-- block:${blockType}:${key} -->`
}

type IndexedBlock = {
  /** Position among the body's top-level nodes. */
  index: number
  key: string
  node: BlockNode
  afterHeading: string | null
}

/**
 * The body's blocks in document order, each with the key its marker carries.
 *
 * Top level only, because that is where the editor puts them: Payload's block
 * plugin inserts with `$insertNodeToNearestRoot`, which splits whatever the
 * cursor is in and places the block between top-level nodes — never inside a
 * paragraph, a list item, or a quote.
 */
export function indexBlocks(
  state: EditorState | null | undefined,
): IndexedBlock[] {
  const blocks: IndexedBlock[] = []
  let afterHeading: string | null = null

  for (const [index, node] of (state?.root?.children ?? []).entries()) {
    if (node.type === 'heading') {
      afterHeading = headingText(node as LexicalNode) || afterHeading
    }
    if (!isBlockNode(node)) continue

    const id = node.fields.id
    const key =
      typeof id === 'string' && MARKER_PART.test(id) ? id : `n${blocks.length}`
    blocks.push({ index, key, node, afterHeading })
  }

  return blocks
}

/** What the read tool reports about each block. */
export function listBlocks(
  state: EditorState | null | undefined,
): BlockSummary[] {
  return indexBlocks(state).map(({ key, node, afterHeading }) => {
    // `blockName` is the admin's label for one placement, empty unless an
    // editor typed one, and noise to an agent when it is.
    const { blockName, ...fields } = node.fields
    return {
      key,
      blockType: node.fields.blockType,
      marker: blockMarker(node.fields.blockType, key),
      afterHeading,
      fields: blockName ? { blockName, ...fields } : fields,
    }
  })
}

/** A paragraph holding one line of text, the shape a marker converts to. */
function markerParagraph(marker: string): LexicalNode {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children: [
      {
        type: 'text',
        version: 1,
        text: marker,
        format: 0,
        mode: 'normal',
        style: '',
        detail: 0,
      },
    ],
  }
}

/**
 * A copy of `state` with every block replaced by its marker, ready to be
 * written out as Markdown. The original is not touched.
 */
export function markBlocks(state: EditorState): EditorState {
  const markers = new Map(
    indexBlocks(state).map(({ index, key, node }) => [
      index,
      blockMarker(node.fields.blockType, key),
    ]),
  )
  if (!markers.size) return state

  return {
    ...state,
    root: {
      ...state.root,
      children: state.root.children.map((node, index) => {
        const marker = markers.get(index)
        return marker ? markerParagraph(marker) : node
      }) as EditorState['root']['children'],
    },
  }
}

/** A module named by its key and type, as the update reports it. */
export type BlockRef = { key: string; blockType: string }

/** Every word under a node, however it is split into text nodes. */
function textOf(node: LexicalNode): string {
  return `${node.text ?? ''}${(node.children ?? []).map(textOf).join('')}`
}

function quoted(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat
}

/**
 * `converted` with each marker replaced by the block it names from `current`.
 *
 * `converted` is the revision, fresh from Markdown; `current` is the draft it
 * replaces, which is the only place a marker's block can come from. Throws,
 * with a message written for the agent to act on, rather than save anything
 * it cannot place.
 */
export function restoreBlocks(
  converted: EditorState,
  current: EditorState | null | undefined,
): { state: EditorState; kept: BlockRef[]; removed: BlockRef[] } {
  const existing = new Map(
    indexBlocks(current).map(({ key, node }) => [key, node]),
  )
  const kept: BlockRef[] = []

  const children = converted.root.children.map((node) => {
    if (node.type !== 'paragraph') return node
    const match = textOf(node as LexicalNode)
      .trim()
      .match(WHOLE_MARKER)
    if (!match) return node

    const [marker, blockType, key] = match
    const block = existing.get(key)
    if (!block) {
      throw new Error(
        `\`${marker}\` names no module in this article's current draft. A ` +
          'marker can only keep or move a module that is already there. ' +
          'Copy markers exactly as readArticleMarkdown gave them; to add key ' +
          'facts, use setKeyFactsBlock.',
      )
    }
    if (block.fields.blockType !== blockType) {
      throw new Error(
        `\`${marker}\` says ${blockType}, but ${key} is a ` +
          `${block.fields.blockType}. Copy markers exactly as ` +
          'readArticleMarkdown gave them.',
      )
    }
    if (kept.some((ref) => ref.key === key)) {
      throw new Error(
        `\`${marker}\` appears more than once. A module can only be in one ` +
          'place; remove the extra line.',
      )
    }

    kept.push({ key, blockType })
    return block
  }) as EditorState['root']['children']

  for (const node of children) {
    if (isBlockNode(node)) continue
    const text = textOf(node as LexicalNode)
    if (MARKER_LIKE.test(text)) {
      throw new Error(
        'A block marker must be copied exactly as readArticleMarkdown gave it, ' +
          'on a line of its own with a blank line before and after. Found ' +
          `one that is not, in: "${quoted(text)}"`,
      )
    }
  }

  const removed = [...existing]
    .filter(([key]) => !kept.some((ref) => ref.key === key))
    .map(([key, node]) => ({ key, blockType: node.fields.blockType }))

  return {
    state: { ...converted, root: { ...converted.root, children } },
    kept,
    removed,
  }
}
