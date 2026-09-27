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
