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

/**
 * The body HTML of a post or page.
 *
 * Rich text wins when an editor has written any, and the preserved Ghost
 * `legacyHTML` is the fallback. Every migrated document arrives with
 * `legacyHTML` set and `content` empty, so migrated bodies keep rendering
 * exactly as they did; the moment someone edits a document in the Lexical
 * editor, what they wrote is what the site shows.
 */
export function toBodyHtml(doc: {
  content?: unknown
  legacyHTML?: string | null
}): string {
  return richTextToHtml(doc.content) || doc.legacyHTML || ''
}
