// Markdown ⇄ Lexical conversion for the MCP drafting tools.
//
// The `content` field is Lexical, and the plugin's generated tools derive their
// input schema from the config — which for rich text is the raw editor state:
// a `root` object whose every node needs the right `type`, `version`, `format`,
// `indent`, and `direction`. A model can produce that, but a wrong `version` or
// a missing `format` saves cleanly and renders an empty body, so the failure is
// silent and only visible on the published page.
//
// Converting server-side removes the whole class of problem: agents write
// markdown, Payload stores valid Lexical.

import {
  convertLexicalToMarkdown,
  convertMarkdownToLexical,
  editorConfigFactory,
} from '@payloadcms/richtext-lexical'
import type { Payload, RichTextField } from 'payload'

/** Collections whose `content` field these tools may convert. */
export type MarkdownCollection = 'posts' | 'pages'

type EditorConfig = ReturnType<typeof editorConfigFactory.fromField>

/**
 * Serialised editor state, written to match the shape Payload generates for a
 * `richText` field so a converted body assigns straight into `data.content`.
 *
 * Declared here rather than imported from `lexical`: that package is a
 * transitive dependency of the editor, and depending on it directly would pin a
 * version this project has no other reason to hold. The two casts below are the
 * seam between this shape and the converters' own.
 */
export type EditorState = {
  [k: string]: unknown
  root: {
    children: { [k: string]: unknown; type: string; version: number }[]
    direction: 'ltr' | 'rtl' | null
    format: '' | 'center' | 'end' | 'justify' | 'left' | 'right' | 'start'
    indent: number
    type: string
    version: number
  }
}

/**
 * The editor config for a collection's `content` field.
 *
 * Read from the field itself rather than from the config default, so that
 * customising the editor on `Posts` later cannot silently leave these tools
 * converting against a different feature set than the one that stores the
 * result.
 */
export function contentEditorConfig(
  payload: Payload,
  collection: MarkdownCollection,
): EditorConfig {
  const field = payload.collections[collection]?.config.fields.find(
    (candidate): candidate is RichTextField =>
      'name' in candidate &&
      candidate.name === 'content' &&
      candidate.type === 'richText',
  )

  if (!field) {
    throw new Error(
      `No rich-text \`content\` field found on \`${collection}\`.`,
    )
  }

  return editorConfigFactory.fromField({ field })
}

export function markdownToLexical(
  payload: Payload,
  collection: MarkdownCollection,
  markdown: string,
): EditorState {
  return convertMarkdownToLexical({
    editorConfig: contentEditorConfig(payload, collection),
    markdown,
  }) as unknown as EditorState
}

export function lexicalToMarkdown(
  payload: Payload,
  collection: MarkdownCollection,
  data: EditorState | null | undefined,
): string {
  if (!data) return ''
  return convertLexicalToMarkdown({
    data: data as unknown as Parameters<
      typeof convertLexicalToMarkdown
    >[0]['data'],
    editorConfig: contentEditorConfig(payload, collection),
  })
}
