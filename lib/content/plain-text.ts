// A body reduced to the words in it, with modules included.
//
// Search, RSS and metadata must not read presentation markup: a `<details>`
// element's copy is invisible to a naive tag strip, and a signup form's button
// label is not editorial text that belongs in a feed or a search index.
//
// Nothing consumes this yet, and that is deliberate rather than an oversight.
// The RSS feed emits `excerpt`/`metaDescription` only, and `searchPosts`
// matches `title` and `excerpt` — so wiring either one to block text is a
// change to what that consumer indexes or publishes, with its own relevance,
// performance and full-content-feed decisions. Those are separate pieces of
// work. The obligation here is that the serializer exists and is correct when
// somebody makes that call.

import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  COMPARISON_TABLE_BLOCK,
  EMBED_BLOCK,
  FAQ_BLOCK,
  FEATURE_LIST_BLOCK,
  GALLERY_BLOCK,
  KEY_TAKEAWAYS_BLOCK,
  MEDIA_TEXT_BLOCK,
  PAYWALL_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
  type AccordionData,
  type BlockSlug,
  type BookmarkData,
  type ButtonData,
  type CalloutData,
  type ComparisonTableData,
  type EmbedData,
  type FaqData,
  type FeatureListData,
  type GalleryData,
  type KeyTakeawaysData,
  type MediaTextData,
  type PullQuoteData,
} from '../../blocks/schema'
import type { ArticleBody } from './body'

type PlaintextArgs = Parameters<typeof convertLexicalToPlaintext>[0]
type EditorState = PlaintextArgs['data']
type Converters = NonNullable<PlaintextArgs['converters']>

function isEmptyState(value: unknown): boolean {
  const root = (value as { root?: { children?: unknown[] } } | null | undefined)
    ?.root
  return !root?.children?.length
}

/** The words in a nested rich-text value, such as an accordion panel. */
function nestedPlainText(value: unknown): string {
  if (isEmptyState(value)) return ''
  return convertLexicalToPlaintext({
    converters: blockConverters,
    data: value as EditorState,
  }).trim()
}

function join(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * How each block contributes to the plain text of a body.
 *
 * Typed as `Record<BlockSlug, …>` for the same reason the JSX renderers are:
 * a new block slug must not be able to reach production without somebody
 * deciding what it means to a feed or a search index.
 */
const blockSerializers: Record<BlockSlug, (fields: unknown) => string> = {
  // Everything a reader would see with every panel expanded. A collapsed panel
  // is still published text — hiding it from search because of a presentation
  // choice would make articles unfindable by their own content.
  [ACCORDION_BLOCK]: (fields) => {
    const data = (fields ?? {}) as AccordionData
    return join([
      data.heading,
      ...(data.items ?? []).map((item) =>
        join([item?.title, nestedPlainText(item?.content)]),
      ),
    ])
  },

  // The URL is machinery; the words and who said them are not.
  [PULL_QUOTE_BLOCK]: (fields) => {
    const data = (fields ?? {}) as PullQuoteData
    return join([data.quote, data.attribution])
  },

  // Nothing. The heading and body copy are form chrome — a call to action
  // aimed at a reader on the page, which in a feed or a search result is noise
  // wrapped around a form that isn't there.
  [SIGNUP_BLOCK]: () => '',

  // Editorial prose that happens to sit in a box.
  [CALLOUT_BLOCK]: (fields) =>
    nestedPlainText(((fields ?? {}) as CalloutData).content),

  // The label only. It is often the sole description of where the link goes
  // ("Download the pigment chart"), so dropping it loses real text — but the
  // URL is machinery and never belongs in a feed or an index.
  [BUTTON_BLOCK]: (fields) =>
    ((fields ?? {}) as ButtonData).label?.trim() ?? '',

  // Captions carry the editorial content of a gallery. The images cannot.
  [GALLERY_BLOCK]: (fields) => {
    const data = (fields ?? {}) as GalleryData
    return join([
      ...(data.items ?? []).map((item) => item?.caption),
      data.caption,
    ])
  },

  // What the editor wrote about the link, not the link.
  [BOOKMARK_BLOCK]: (fields) => {
    const data = (fields ?? {}) as BookmarkData
    return join([data.title, data.description, data.publisher])
  },

  // The title is the only human-written text; the URL is machinery.
  [EMBED_BLOCK]: (fields) => ((fields ?? {}) as EmbedData).title?.trim() ?? '',

  // A marker, not content. It should never reach a serializer in the first
  // place — `toArticleBody` strips it — and contributes nothing if it does.
  [PAYWALL_BLOCK]: () => '',

  // The most quotable text in the article, written to stand alone. Whatever
  // eventually derives a description or a feed summary wants this above almost
  // anything else in the body.
  [KEY_TAKEAWAYS_BLOCK]: (fields) => {
    const data = (fields ?? {}) as KeyTakeawaysData
    return join([data.heading, ...(data.items ?? []).map((item) => item?.text)])
  },

  // Questions and answers both. A collapsed answer is still published text —
  // the same rule the dropdown follows, and here the questions are often the
  // exact wording somebody searched for.
  [FAQ_BLOCK]: (fields) => {
    const data = (fields ?? {}) as FaqData
    return join([
      data.heading,
      ...(data.items ?? []).map((item) =>
        join([item?.question, nestedPlainText(item?.answer)]),
      ),
    ])
  },

  // Editorial prose that happens to sit beside a picture. The image cannot
  // contribute text, and its caption belongs to the Media record rather than
  // to this placement.
  [MEDIA_TEXT_BLOCK]: (fields) => {
    const data = (fields ?? {}) as MediaTextData
    return join([data.heading, nestedPlainText(data.body)])
  },

  // Everything a reader would see. A table's caption is often the only
  // sentence stating what the numbers are, so it leads.
  [COMPARISON_TABLE_BLOCK]: (fields) => {
    const data = (fields ?? {}) as ComparisonTableData
    return join([
      data.caption,
      data.rowHeader,
      ...(data.columns ?? []).map((column) => column?.label),
      ...(data.rows ?? []).map((row) =>
        join([row?.label, ...(row?.cells ?? []).map((cell) => cell?.value)]),
      ),
    ])
  },

  [FEATURE_LIST_BLOCK]: (fields) => {
    const data = (fields ?? {}) as FeatureListData
    return join([
      data.heading,
      data.intro,
      ...(data.items ?? []).map((item) => join([item?.title, item?.body])),
    ])
  },
}

const blockConverters: Converters = {
  blocks: Object.fromEntries(
    Object.entries(blockSerializers).map(([slug, serialize]) => [
      slug,
      ({ node }: { node: { fields?: unknown } }) => serialize(node.fields),
    ]),
  ),
}

/** The words in a rich-text value, modules included. */
export function richTextToPlainText(value: unknown): string {
  return nestedPlainText(value)
}

/** The words in preserved Ghost markup. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The words in a body, whichever way it is stored. */
export function bodyToPlainText(body: ArticleBody): string {
  if (body.kind === 'lexical') return richTextToPlainText(body.content)
  if (body.kind === 'html') return htmlToPlainText(body.html)
  return ''
}
