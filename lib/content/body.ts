// What a Post, Page or App body *is*, decided once on the server.
//
// This replaces the previous "everything becomes an HTML string" model. That
// model was fine while a body was only text, headings and images, but an
// insertable module is a React component with behavior, and there is no honest
// way to express one as a string that `dangerouslySetInnerHTML` then revives.
//
// So a body is now one of three things, and the caller renders whichever it
// got:
//
//   lexical  — rich text an editor wrote here, rendered as typed React nodes
//   html     — preserved Ghost markup, still injected as a string
//   empty    — nothing worth rendering
//
// The `html` branch is deliberately untouched by any of this. Every migrated
// document arrives with `legacyHTML` set and `content` empty, so migrated
// bodies keep rendering through exactly the code path they rendered through
// before, byte for byte. Blocks only ever reach the `lexical` branch.

import { PAYWALL_BLOCK } from '../../blocks/schema'
import {
  isEmptyRichText,
  stripLeadingTitleHeading,
  TEASER_CHARS,
  toComparableText,
  toTeaserHtml,
} from './richtext'

/** A serialized Lexical node, structurally. */
export type BodyNode = {
  type?: string
  tag?: string
  text?: string
  children?: BodyNode[]
  fields?: { blockType?: string; [key: string]: unknown }
  [key: string]: unknown
}

export type BodyRoot = {
  root: {
    type?: string
    children?: BodyNode[]
    [key: string]: unknown
  }
}

export type ArticleBody =
  | { kind: 'lexical'; content: BodyRoot }
  | { kind: 'html'; html: string }
  | { kind: 'empty' }

/** The readable text a node and its descendants contribute. */
function nodeTextLength(node: BodyNode): number {
  const own = node.text?.length ?? 0
  const children = (node.children ?? []).reduce(
    (total, child) => total + nodeTextLength(child),
    0,
  )
  return own + children
}

function nodeText(node: BodyNode): string {
  const own = node.text ?? ''
  const children = (node.children ?? []).map(nodeText).join('')
  return `${own}${children}`
}

/**
 * Drops a heading at the top of a body when it repeats the document title.
 *
 * The node-level twin of `stripLeadingTitleHeading`. Same rule, same reason:
 * every template prints the stored title above the body, so a body that opens
 * with its own title heading shows it twice. Only h1–h3 count — a lower level
 * is a section heading that happens to share the wording, not the document's
 * title printed again.
 */
export function stripLeadingTitleNode(
  nodes: BodyNode[],
  title: string | null | undefined,
): BodyNode[] {
  const wanted = toComparableText(title ?? '')
  if (!wanted || nodes.length === 0) return nodes

  const [first] = nodes
  if (first.type !== 'heading') return nodes
  if (!['h1', 'h2', 'h3'].includes(String(first.tag ?? ''))) return nodes
  if (toComparableText(nodeText(first)) !== wanted) return nodes

  return nodes.slice(1)
}

/**
 * The opening paragraphs of a body whose full text is withheld.
 *
 * This is the server-side half of the paywall, and the reason it truncates
 * nodes rather than hiding rendered ones with CSS: a module that reaches the
 * browser has already been sent, and for a `paid` post that is the leak. What
 * this function drops is never serialized into the page, the RSC payload, or a
 * "view source".
 *
 * The rule matches `toTeaserHtml` exactly — leading paragraphs only, taken
 * whole, until roughly `maxChars` of readable text. Anything that is not a
 * paragraph ends the teaser rather than being reproduced, which is what stops
 * a signup module or a dropdown full of withheld copy from riding along into a
 * gated post's teaser.
 */
export function toTeaserNodes(
  nodes: BodyNode[],
  maxChars = TEASER_CHARS,
): BodyNode[] {
  const kept: BodyNode[] = []
  let length = 0

  for (const node of nodes) {
    if (length >= maxChars) break
    if (node.type !== 'paragraph') break
    kept.push(node)
    length += nodeTextLength(node)
  }

  return kept
}

type BodySource = {
  content?: unknown
  legacyHTML?: string | null
  title?: string | null
}

export type BodyOptions = {
  /** Withhold all but the opening paragraphs. Gated posts, read by non-members. */
  restricted?: boolean
  /**
   * An editor is looking at a draft. Keeps editorial markers that a reader
   * never sees — currently the members-only cut.
   */
  preview?: boolean
}

/** True for the block that marks where a gated post stops. */
function isPaywallNode(node: BodyNode): boolean {
  return node.type === 'block' && node.fields?.blockType === PAYWALL_BLOCK
}

/**
 * Where the editor put the members-only cut, or -1.
 *
 * Only the first one counts. A body with two markers is an editing mistake,
 * and the safe reading of it is the earlier cut — withholding more than was
 * intended is recoverable, publishing more than was intended is not.
 */
export function paywallIndex(nodes: BodyNode[]): number {
  return nodes.findIndex(isPaywallNode)
}

/**
 * The body of a document, as the thing that renders it needs to see it.
 *
 * Rich text wins when an editor has written any; preserved `legacyHTML` is the
 * fallback. That is the same precedence `toBodyHtml` has always applied, so the
 * moment someone edits a migrated document in the Lexical editor, what they
 * wrote is what the site shows — modules included.
 */
export function toArticleBody(
  doc: BodySource,
  options: BodyOptions = {},
): ArticleBody {
  const { restricted = false, preview = false } = options

  if (!isEmptyRichText(doc.content)) {
    const source = doc.content as BodyRoot
    let children = stripLeadingTitleNode(source.root?.children ?? [], doc.title)

    // The editor's own cut wins over the character count. It is an explicit
    // decision about where the piece stops being free, and a heuristic that
    // overrode it would be publishing past a line somebody deliberately drew.
    const cut = paywallIndex(children)
    if (restricted) {
      children = cut === -1 ? toTeaserNodes(children) : children.slice(0, cut)
    } else if (!preview) {
      // A marker is editorial, not content. It survives into preview so an
      // editor can see where the cut falls, and never reaches a reader.
      children = children.filter((node) => !isPaywallNode(node))
    }

    if (children.length === 0) return { kind: 'empty' }

    return {
      kind: 'lexical',
      content: { ...source, root: { ...source.root, children } },
    }
  }

  const legacy = stripLeadingTitleHeading(doc.legacyHTML ?? '', doc.title)
  const html = restricted ? toTeaserHtml(legacy) : legacy
  return html ? { kind: 'html', html } : { kind: 'empty' }
}
