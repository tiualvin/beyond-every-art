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
import type { Block, Field, Payload, RichTextField } from 'payload'

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
/**
 * The `content` field, wherever the edit view puts it.
 *
 * This used to look only at the top level of `fields`, which was true until
 * Posts and Pages were arranged into tabs — and then it was false in a way
 * nothing caught until an agent tried to draft an article and was told the
 * collection had no rich-text body. An unnamed tab changes no schema and no
 * stored document, so every other reader of the field carried on working; this
 * one was reading the *config* rather than the data, and the config is exactly
 * what a tab reshapes.
 *
 * So it walks containers now, and the shape of the edit screen stops being
 * something the MCP tools have an opinion about.
 */
function findRichText(
  fields: Field[] | undefined,
  name: string,
): RichTextField | undefined {
  for (const field of fields ?? []) {
    if ('name' in field && field.name === name && field.type === 'richText') {
      return field as RichTextField
    }

    const container = field as {
      fields?: Field[]
      tabs?: { fields?: Field[] }[]
    }
    const nested =
      findRichText(container.fields, name) ??
      container.tabs?.reduce<RichTextField | undefined>(
        (found, tab) => found ?? findRichText(tab.fields, name),
        undefined,
      )
    if (nested) return nested
  }
  return undefined
}

export function contentEditorConfig(
  payload: Payload,
  collection: MarkdownCollection,
): EditorConfig {
  const field = findRichText(
    payload.collections[collection]?.config.fields,
    'content',
  )

  if (!field) {
    throw new Error(
      `No rich-text \`content\` field found on \`${collection}\`.`,
    )
  }

  return editorConfigFactory.fromField({ field })
}

function fromMarkdown(editorConfig: EditorConfig, markdown: string) {
  return convertMarkdownToLexical({
    editorConfig,
    markdown,
  }) as unknown as EditorState
}

function toMarkdown(
  editorConfig: EditorConfig,
  data: EditorState | null | undefined,
): string {
  if (!data) return ''
  return convertLexicalToMarkdown({
    data: data as unknown as Parameters<
      typeof convertLexicalToMarkdown
    >[0]['data'],
    editorConfig,
  })
}

export function markdownToLexical(
  payload: Payload,
  collection: MarkdownCollection,
  markdown: string,
): EditorState {
  return fromMarkdown(contentEditorConfig(payload, collection), markdown)
}

export function lexicalToMarkdown(
  payload: Payload,
  collection: MarkdownCollection,
  data: EditorState | null | undefined,
): string {
  return toMarkdown(contentEditorConfig(payload, collection), data)
}

// --- Rich text inside a block ---------------------------------------------
//
// An FAQ answer, a callout, a dropdown panel: rich-text fields that live inside
// a block in the body. None of them uses the body's editor — they are given
// the plain one, which is what stops a module being nested inside a module —
// so converting one against `contentEditorConfig` would be converting against
// the wrong feature set. Each is converted against its own field instead,
// found in the sanitized config. Sanitizing is what gives such a field its
// editor at all: the definitions in `blocks/schema.ts` have none.

/** The body's insertable blocks, as Payload sanitized them. */
function contentBlocks(
  payload: Payload,
  collection: MarkdownCollection,
): Block[] {
  const feature = contentEditorConfig(
    payload,
    collection,
  ).resolvedFeatureMap.get('blocks')
  return (
    (feature?.sanitizedServerFeatureProps as { blocks?: Block[] } | undefined)
      ?.blocks ?? []
  )
}

/**
 * A copy of `data` with every rich-text value in it as Markdown.
 *
 * Driven by the block's schema rather than by the shape of the data, so a
 * field is converted because it *is* rich text, never because a value happens
 * to look like editor state.
 */
function withMarkdown(
  schema: Field[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  let out: Record<string, unknown> = { ...data }

  for (const field of schema) {
    if (!('name' in field)) {
      // A row or a collapsible: it lays fields out without nesting their data.
      const nested = (field as { fields?: Field[] }).fields
      if (nested) out = withMarkdown(nested, out)
      continue
    }

    const value = out[field.name]
    if (value === null || value === undefined) continue

    if (field.type === 'richText') {
      // Converted only when it is editor state. The converter reads anything
      // else as an empty document and answers "", which would report a broken
      // module as a blank one.
      const root = (value as { root?: { children?: unknown } }).root
      if (!Array.isArray(root?.children)) continue
      try {
        out[field.name] = toMarkdown(
          editorConfigFactory.fromField({ field: field as RichTextField }),
          value as EditorState,
        )
      } catch {
        // A value the converter cannot read is reported as stored. A review
        // tool that failed on one malformed module would hide every other one.
      }
    } else if (field.type === 'array' && Array.isArray(value)) {
      out[field.name] = value.map((row) =>
        row && typeof row === 'object'
          ? withMarkdown(field.fields, row as Record<string, unknown>)
          : row,
      )
    } else if (field.type === 'group' && typeof value === 'object') {
      out[field.name] = withMarkdown(
        field.fields,
        value as Record<string, unknown>,
      )
    }
  }

  return out
}

/**
 * A block's stored fields as the read tools report them: rich text as
 * Markdown, everything else as stored. A block type this config does not
 * know is returned untouched.
 */
export function blockFieldsForReading(
  payload: Payload,
  collection: MarkdownCollection,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const block = contentBlocks(payload, collection).find(
    (candidate) => candidate.slug === fields.blockType,
  )
  return block ? withMarkdown(block.fields, fields) : fields
}

/**
 * Markdown converted for a rich-text field inside a block, against that
 * field's own editor. `path` names the field through any arrays on the way to
 * it: `['items', 'answer']` for an FAQ answer.
 */
export function markdownToBlockRichText(
  payload: Payload,
  collection: MarkdownCollection,
  blockType: string,
  path: string[],
  markdown: string,
): EditorState {
  let fields = contentBlocks(payload, collection).find(
    (block) => block.slug === blockType,
  )?.fields
  let field: Field | undefined

  for (const name of path) {
    field = fields?.find(
      (candidate) => 'name' in candidate && candidate.name === name,
    )
    fields = (field as { fields?: Field[] } | undefined)?.fields
  }

  if (field?.type !== 'richText') {
    throw new Error(
      `No rich-text \`${path.join('.')}\` on the \`${blockType}\` block.`,
    )
  }

  return fromMarkdown(
    editorConfigFactory.fromField({ field: field as RichTextField }),
    markdown,
  )
}
