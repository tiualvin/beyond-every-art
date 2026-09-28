// Setting an article's key facts without touching the rest of its body.
//
// The `keyFacts` module is a block inside the rich-text body, not a field
// beside it, so writing one is a question of *where* as much as *what*. The
// rules, in the order they are applied:
//
// - An article has at most one set of key facts through this path. If it has
//   one, it is replaced where it stands; its position is the editor's (or an
//   earlier call's) decision and a new list of facts is not a reason to move it.
// - If it has none, the caller names the body heading they go under. Headings
//   are the only address in a body that an agent and an editor both see, and
//   that survives a revision — a paragraph index would not.
// - If it has more than one, nothing is written. Which one was meant is a
//   guess, and the markers in `readArticleMarkdown` already give the agent a
//   way to remove the extras and ask again.
//
// Every other node in the body is passed through as the same object, so the
// save changes the facts and nothing else.

import {
  KEY_FACTS_BLOCK,
  KEY_FACTS_MAX_ITEMS,
  type KeyFactItem,
} from '../../blocks/schema'
import { blockMarker, textOf, type BlockNode, type LexicalNode } from './blocks'
import type { EditorState } from './markdown'
import {
  blockNode,
  bodyChildren,
  findHeading,
  keptKey,
  objectId,
  singleExisting,
  withChildren,
} from './placement'

export type Fact = { label: string; value: string }

export type KeyFactsInput = {
  facts: Fact[]
  heading?: string
  afterHeading?: string
  replacePipeTable?: boolean
}

export type KeyFactsResult = {
  state: EditorState
  placement: 'inserted' | 'replaced'
  key: string
  marker: string
  /** The heading the facts now sit under, or null when they precede them all. */
  afterHeading: string | null
  removedTable: boolean
}

/**
 * A Markdown table as the body stores one: a single paragraph of pipe-bounded
 * lines, because the editor has no table feature to convert it into.
 */
function isPipeTable(node: LexicalNode | undefined): boolean {
  if (node?.type !== 'paragraph') return false
  const text = textOf(node).trim()
  return text.startsWith('|') && text.endsWith('|')
}

/**
 * The facts as the block stores them, or a refusal naming the first problem.
 *
 * Checked here as well as by the tool's schema: a draft save skips Payload's
 * own field validation, so without this a blank label would be stored, and
 * would only be refused later — at publish, in front of an editor.
 */
function toItems(facts: Fact[] | undefined): KeyFactItem[] {
  if (!facts?.length) {
    throw new Error('Give at least one fact.')
  }
  if (facts.length > KEY_FACTS_MAX_ITEMS) {
    throw new Error(
      `A key facts module holds at most ${KEY_FACTS_MAX_ITEMS} facts; this ` +
        `call gave ${facts.length}. Keep the ones a reader would look up.`,
    )
  }

  return facts.map((fact, index) => {
    const label = fact.label?.trim()
    const value = fact.value?.trim()
    if (!label || !value) {
      throw new Error(
        `Fact ${index + 1} has no ${label ? 'value' : 'label'}. Every fact ` +
          'needs both.',
      )
    }
    return { id: objectId(), label, value }
  })
}

export function setKeyFacts(
  state: EditorState | null | undefined,
  input: KeyFactsInput,
): KeyFactsResult {
  const items = toItems(input.facts)
  const heading = input.heading?.trim()
  const children = bodyChildren(state)
  const existing = singleExisting(state, KEY_FACTS_BLOCK, 'key facts modules')

  // The whole module is described by the call. A heading left out is a
  // heading removed, so what the card shows is always what was last asked for.
  const fieldsFor = (id: string, blockName = ''): BlockNode['fields'] => ({
    id,
    blockName,
    blockType: KEY_FACTS_BLOCK,
    ...(heading ? { heading } : {}),
    items,
  })

  if (existing) {
    const { index, node, afterHeading } = existing
    const key = keptKey(node)
    children[index] = {
      ...node,
      fields: fieldsFor(key, node.fields.blockName ?? ''),
    } as LexicalNode

    return {
      state: withChildren(state, children),
      placement: 'replaced',
      key,
      marker: blockMarker(KEY_FACTS_BLOCK, key),
      afterHeading,
      removedTable: false,
    }
  }

  const { index: headingIndex, text: headingAbove } = findHeading(
    children,
    input.afterHeading,
    { none: 'key facts', placed: 'the facts go' },
  )
  const at = headingIndex + 1
  const key = objectId()
  const node = blockNode(fieldsFor(key))

  if (input.replacePipeTable) {
    if (!isPipeTable(children[at])) {
      throw new Error(
        `There is no Markdown table directly under "${headingAbove}" to ` +
          'replace, so nothing was changed. Call again without ' +
          'replacePipeTable to insert the facts above what is there.',
      )
    }
    children.splice(at, 1, node)
  } else {
    children.splice(at, 0, node)
  }

  return {
    state: withChildren(state, children),
    placement: 'inserted',
    key,
    marker: blockMarker(KEY_FACTS_BLOCK, key),
    afterHeading: headingAbove,
    removedTable: Boolean(input.replacePipeTable),
  }
}
