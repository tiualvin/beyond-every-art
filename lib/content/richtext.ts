import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

/** The serialized editor state Payload stores in a `richText` field. */
type EditorState = Parameters<typeof convertLexicalToHTML>[0]['data']

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
}

/**
 * Node types that render nothing on their own: they are visible only because of
 * the text inside them. Every other type — uploads, horizontal rules, blocks —
 * is content even with no text, so an image-only body is not treated as empty.
 */
const TEXT_BEARING = new Set([
  'heading',
  'linebreak',
  'list',
  'listitem',
  'paragraph',
  'quote',
  'tab',
  'text',
])

function hasVisibleContent(nodes: LexicalNode[] | undefined): boolean {
  return (nodes ?? []).some((node) => {
    if (node.text?.trim()) return true
    if (hasVisibleContent(node.children)) return true
    return !TEXT_BEARING.has(node.type ?? '')
  })
}

/**
 * Whether a rich-text value holds nothing worth rendering.
 *
 * An untouched Lexical editor still serializes a root with one empty
 * paragraph, so a truthiness check on the field is not enough to decide whether
 * an author has written anything.
 */
export function isEmptyRichText(value: unknown): boolean {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root
  return !root || !hasVisibleContent(root.children)
}

/**
 * Renders a Lexical rich-text value to HTML, or an empty string when it holds
 * no content.
 *
 * The container `<div>` is dropped because the frontend supplies its own
 * `.prose` wrapper, which the migrated Ghost HTML is already styled through.
 */
export function richTextToHtml(value: unknown): string {
  if (isEmptyRichText(value)) return ''
  return convertLexicalToHTML({
    data: value as EditorState,
    disableContainer: true,
  }).trim()
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body.startsWith('#x') || body.startsWith('#X')
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0
        ? String.fromCodePoint(code)
        : match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/**
 * A heading or title reduced to the text a reader actually sees, so the two can
 * be compared without tripping over markup an editor cannot see.
 *
 * Typographic quotes and dashes are folded to ASCII because Ghost's editor
 * smartened them inside the body while the stored title often kept the straight
 * characters that were typed, and the two spellings are the same heading.
 */
function toComparableText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// A heading opening the body, after any leading whitespace or HTML comment.
// Only h1–h3 count: a lower level is a section heading that happens to repeat
// the title, not the document's own title printed twice.
const LEADING_HEADING =
  /^(?:\s|<!--[\s\S]*?-->)*<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i

/**
 * Drops a heading at the top of `html` when it says the same thing as `title`.
 *
 * Bodies imported from Ghost open with their own title heading, and every
 * template here prints the stored title above the body, so migrated documents
 * showed it twice. This runs at render time and the stored `legacyHTML` keeps
 * the heading, so the change is reversible by deleting this call.
 */
export function stripLeadingTitleHeading(
  html: string,
  title: string | null | undefined,
): string {
  const wanted = toComparableText(title ?? '')
  if (!html || !wanted) return html
  const match = LEADING_HEADING.exec(html)
  if (!match || toComparableText(match[2]) !== wanted) return html
  return html.slice(match[0].length).replace(/^\s+/, '')
}

/**
 * How much of a restricted body a reader who is not a member gets to see.
 *
 * Ghost auto-generated its excerpt from the first 500 characters of a post's
 * plain text, and that excerpt is what it printed on gated posts and put in
 * their meta description. Matching the length keeps the teasers Google has
 * already indexed roughly the size they were.
 */
const TEASER_CHARS = 500

// A complete top-level paragraph opening the HTML, after whitespace or a
// comment. Whole elements only: half a paragraph would be unbalanced markup.
const LEADING_PARAGRAPH = /^(?:\s|<!--[\s\S]*?-->)*<p\b[^>]*>[\s\S]*?<\/p\s*>/i

function visibleLength(html: string): number {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim().length
}

/**
 * The opening paragraphs of a body, for a post whose full text is withheld.
 *
 * Paragraphs are taken whole from the top until roughly `maxChars` of readable
 * text has accumulated, and the first one is always taken so a long opener
 * still produces a teaser. Anything that is not a paragraph — a figure, a
 * pull quote, an embed — ends the teaser rather than being reproduced.
 */
export function toTeaserHtml(html: string, maxChars = TEASER_CHARS): string {
  const parts: string[] = []
  let remaining = html
  let length = 0

  while (remaining && length < maxChars) {
    const match = LEADING_PARAGRAPH.exec(remaining)
    if (!match) break
    parts.push(match[0].trim())
    length += visibleLength(match[0])
    remaining = remaining.slice(match[0].length)
  }

  return parts.join('\n')
}

/**
 * The body HTML of a post or page.
 *
 * Rich text wins when an editor has written any, and the preserved Ghost
 * `legacyHTML` is the fallback. Every migrated document arrives with
 * `legacyHTML` set and `content` empty, so migrated bodies keep rendering
 * exactly as they did; the moment someone edits a document in the Lexical
 * editor, what they wrote is what the site shows.
 *
 * Pass the document's `title` to suppress a body heading that repeats it.
 */
export function toBodyHtml(doc: {
  content?: unknown
  legacyHTML?: string | null
  title?: string | null
}): string {
  const html = richTextToHtml(doc.content) || doc.legacyHTML || ''
  return stripLeadingTitleHeading(html, doc.title)
}
