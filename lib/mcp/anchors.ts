// Kept heading anchors through the Markdown tools.
//
// A heading converted from a migrated article keeps the `id` Ghost gave it, as
// node state (`{ "$": { "anchor": "…" } }` — see `lib/content/headings.ts`).
// Markdown has no place for node state, so a read followed by a revision would
// drop every one of them, and with them the `#section` sitelinks search
// engines show under the article. Nothing on the page would say so: the
// headings would simply start answering to new ids derived from their text.
//
// So the read writes each kept anchor at the end of its heading line, in the
// attribute syntax several Markdown dialects already use:
//
//     ## When Purple Was Worth More Than Your House {#when-purple-was-worth-more-than-your-house}
//
// and the update takes it back off and puts it on the node again. Rewording a
// heading and leaving the suffix keeps the address; deleting the suffix lets
// the heading answer to its text, and the update reports that it did. Headings
// without a kept anchor — every natively written article — read exactly as
// they always have.

import { headingText, KEPT_ANCHOR, keptAnchor } from '../content/headings'
import type { LexicalNode } from './blocks'
import type { EditorState } from './markdown'

/** A `{#…}` at the very end of a heading's text, with what is inside it. */
const SUFFIX = /\s*\{#([^{}]*)\}\s*$/

function plainText(text: string): LexicalNode {
  return {
    type: 'text',
    version: 1,
    text,
    format: 0,
    mode: 'normal',
    style: '',
    detail: 0,
  }
}

/**
 * A copy of `state` in which every heading that keeps an anchor ends with
 * ` {#anchor}`, ready to be written out as Markdown. The original is not
 * touched. Top level only, which is the only place the editor puts headings.
 */
export function markAnchors(state: EditorState): EditorState {
  let changed = false
  const children = state.root.children.map((node) => {
    if (node.type !== 'heading') return node
    const anchor = keptAnchor(node)
    if (!anchor) return node
    changed = true
    const own = (node as LexicalNode).children ?? []
    return { ...node, children: [...own, plainText(` {#${anchor}}`)] }
  })
  if (!changed) return state
  return {
    ...state,
    root: {
      ...state.root,
      children: children as EditorState['root']['children'],
    },
  }
}

/** The anchors each heading keeps, in document order, for reporting a change. */
export function anchorsOf(
  state: EditorState | null | undefined,
): Array<{ heading: string; anchor: string }> {
  return (state?.root?.children ?? []).flatMap((node) => {
    const anchor = node.type === 'heading' ? keptAnchor(node) : null
    return anchor ? [{ heading: headingText(node as LexicalNode), anchor }] : []
  })
}

/**
 * Takes a heading's text off its last text node, from the end.
 *
 * The suffix lands in the heading's final text node when it follows plain
 * text, or in a node of its own after formatted text (`**Pros** {#pros}`);
 * either way it is the tail of the last one.
 */
function withoutSuffix(node: LexicalNode): {
  node: LexicalNode
  anchor: string | null
} {
  const children = [...(node.children ?? [])]
  const last = children.at(-1)
  if (last?.type !== 'text' || typeof last.text !== 'string') {
    return { node, anchor: null }
  }
  const match = last.text.match(SUFFIX)
  if (!match) return { node, anchor: null }

  const anchor = match[1]
  if (!KEPT_ANCHOR.test(anchor)) {
    throw new Error(
      `"${headingText(node)}" ends with {#${anchor}}, which is not an anchor ` +
        'this site can keep: letters, digits, hyphens, underscores, dots and ' +
        'percent signs, starting with a letter or digit. Copy the suffix ' +
        'exactly as readArticleMarkdown gave it, or remove it to let the ' +
        'heading take an anchor from its text.',
    )
  }

  const rest = last.text.slice(0, match.index)
  if (rest) children[children.length - 1] = { ...last, text: rest }
  else children.pop()
  return { node: { ...node, children }, anchor }
}

/**
 * `state` with every heading's `{#anchor}` suffix moved back onto the node.
 *
 * Throws, rather than save anything the page would print: a suffix that is not
 * a valid anchor, or one anchor on two headings — two elements with one id,
 * of which a link reaches only the first.
 */
export function restoreAnchors(state: EditorState): EditorState {
  const seen = new Map<string, string>()
  let changed = false

  const children = state.root.children.map((node) => {
    if (node.type !== 'heading') return node
    const { node: stripped, anchor } = withoutSuffix(node as LexicalNode)
    if (!anchor) return node

    const heading = headingText(stripped)
    const earlier = seen.get(anchor)
    if (earlier !== undefined) {
      throw new Error(
        `{#${anchor}} is on two headings, "${earlier}" and "${heading}". An ` +
          'anchor names one place on the page; remove it from one of them.',
      )
    }
    seen.set(anchor, heading)
    changed = true

    const state = (stripped as { $?: Record<string, unknown> }).$
    return { ...stripped, $: { ...(state ?? {}), anchor } }
  })

  if (!changed) return state
  return {
    ...state,
    root: {
      ...state.root,
      children: children as EditorState['root']['children'],
    },
  }
}

/** Which kept anchors a revision keeps and which it lets go, by anchor. */
export function compareAnchors(
  before: EditorState | null | undefined,
  after: EditorState | null | undefined,
): { kept: string[]; removed: string[]; added: string[] } {
  const was = new Set(anchorsOf(before).map(({ anchor }) => anchor))
  const now = new Set(anchorsOf(after).map(({ anchor }) => anchor))
  return {
    kept: [...now].filter((anchor) => was.has(anchor)),
    removed: [...was].filter((anchor) => !now.has(anchor)),
    added: [...now].filter((anchor) => !was.has(anchor)),
  }
}
