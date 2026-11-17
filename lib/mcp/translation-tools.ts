// The connector's half of translations.
//
// Three things live here. `localized()` wraps an existing article tool so it
// takes a `locale` and works on that language's version — a call without one
// is the call it always was. `saveTranslation` and `translationStatus` are new
// tools. And `publishTranslation` is what `publishArticle` does when it is
// given a translated language.
//
// The invariants every one of them keeps (see docs/LOCALIZATION.md):
//
// - **English is never written by a translation tool.** Every write names its
//   locale and is a draft save or a single-language publish; Payload carries
//   every other language forward from the newest version untouched, and
//   `saveTranslation` checks afterwards that English came back unchanged.
// - **A translation goes live only over a live English article, only in its
//   own words**: a module still holding the English text it was copied from,
//   or an image with no alt text in that language, refuses the publish.
// - **Every Local API call that reads another language goes without `req`.**
//   Payload writes a call's `locale` onto the `req` it is given, so reading
//   English with the tool's `req` in the middle of a Spanish write would turn
//   the rest of the write into an English one.

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { PayloadRequest, TypedUser, Where } from 'payload'
import { z } from 'zod'

import { isScheduled } from '../content/schedule'
import {
  englishSource,
  inLocale,
  readLiveRowAllLocales,
} from '../i18n/publishing'
import {
  DEFAULT_LOCALE,
  isLocale,
  isPrefixedLocale,
  LOCALE_CODES,
  PREFIXED_LOCALES,
  type Locale,
} from '../i18n/locales'
import { buildPreviewUrl } from '../preview/live-preview'
import { validateLocalizedContentSlug } from '../seo/reserved-slugs'
import { isWellFormedSlug, slugFormatError } from '../seo/slug-format'
import { absoluteUrl, getSiteUrl, localePostPath, postPath } from '../seo/site'
import { restoreAnchors } from './anchors'
import { indexBlocks, restoreBlocks, type BlockRef } from './blocks'
import { markdownToLexical, type EditorState } from './markdown'
import { mayPublishThrough } from './publish-guard'
import { resolvePublishAt } from './publish-time'

type McpTool = NonNullable<NonNullable<MCPPluginConfig['mcp']>['tools']>[number]
type Row = Record<string, unknown>

const text = (value: unknown) => ({
  content: [
    {
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      type: 'text' as const,
    },
  ],
})

const COLLECTION = 'posts'

// --- `locale` on the existing tools ----------------------------------------

export const localeParameter = z
  .enum(LOCALE_CODES as unknown as [Locale, ...Locale[]])
  .optional()
  .describe(
    'The language to work in: en (the default), or a translation — ' +
      `${PREFIXED_LOCALES.join(', ')}. Leave it out for English; the call then ` +
      'behaves exactly as it always has. With a translated language, `slug` is ' +
      "that language's slug (the English slug also finds the article).",
  )

/** The language a tool call is working in, as `localized()` set it. */
export function requestLocale(req: PayloadRequest): Locale {
  return isLocale(req.locale) ? req.locale : DEFAULT_LOCALE
}

/**
 * The tool, taking `locale`.
 *
 * It sets the request's locale before the tool runs, so every Local API call
 * the tool makes with `req` — reads, the draft save, the publish — is made in
 * that language without each call having to say so. Without `locale` it sets
 * English, which is what the request already was.
 */
export function localized(tool: McpTool): McpTool {
  return {
    ...tool,
    description:
      `${tool.description} Pass \`locale\` (${PREFIXED_LOCALES.join(', ')}) ` +
      "to work on that language's translation instead of English.",
    parameters: { ...tool.parameters, locale: localeParameter },
    handler: async (args, req, extra) => {
      const { locale, ...rest } = args as { locale?: unknown }
      if (locale !== undefined && !isLocale(locale)) {
        throw new Error(
          `Unknown locale \`${String(locale)}\`. Use one of ${LOCALE_CODES.join(', ')}.`,
        )
      }
      req.locale = (locale ?? DEFAULT_LOCALE) as typeof req.locale
      return tool.handler(rest, req, extra)
    },
  }
}

// --- Where a translation stands --------------------------------------------

export type TranslationReaders = 'live' | 'scheduled' | 'unpublished'

/**
 * What readers of one language see of an article right now, from its live
 * row: the translation's own switch and date, and English's — a translation
 * of an article whose English is not out is not out either.
 */
export async function translationOnSite(
  req: PayloadRequest,
  id: number | string,
  locale: Locale,
  now: Date = new Date(),
): Promise<{
  readers: TranslationReaders
  englishPublished: boolean
  publishedAt: string | null
  slug: string | null
  url: string | null
  live: Row | null
}> {
  const live = await readLiveRowAllLocales(req, COLLECTION, id)
  const englishPublished = live?._status === 'published'
  const status = inLocale(live?.translationStatus, locale)
  const at = inLocale(live?.translationPublishedAt, locale)
  const slug = inLocale(live?.slug, locale)
  const publishedAt =
    at instanceof Date ? at.toISOString() : typeof at === 'string' ? at : null
  const slugText = typeof slug === 'string' && slug ? slug : null

  let readers: TranslationReaders = 'unpublished'
  if (englishPublished && status === 'published') {
    const englishScheduled = isScheduled(
      'published',
      live?.publishedAt instanceof Date
        ? live.publishedAt.toISOString()
        : live?.publishedAt,
      now,
    )
    readers =
      englishScheduled ||
      (publishedAt && Date.parse(publishedAt) > now.getTime())
        ? 'scheduled'
        : 'live'
  }
  return {
    readers,
    englishPublished,
    publishedAt,
    slug: slugText,
    url:
      readers !== 'unpublished' && slugText
        ? absoluteUrl(localePostPath(slugText, locale), getSiteUrl())
        : null,
    live,
  }
}

/** The `readers`/`note` pair a draft-only write reports, for a translation. */
export async function translationReaders(
  req: PayloadRequest,
  id: number | string,
  locale: Locale,
): Promise<{ readers: TranslationReaders; note?: string }> {
  const site = await translationOnSite(req, id, locale)
  if (site.readers === 'live') {
    return {
      readers: 'live',
      note:
        `Saved as a draft over a live ${locale} translation: readers of ` +
        `${site.url} still see the published one. Publish it with ` +
        `\`publishArticle\` and \`locale: "${locale}"\`.`,
    }
  }
  if (site.readers === 'scheduled') {
    return {
      readers: 'scheduled',
      note:
        `Saved as a draft over a ${locale} translation scheduled for ` +
        `${site.publishedAt}. It goes out as last published unless published ` +
        'again before then.',
    }
  }
  return { readers: 'unpublished' }
}

/** English's last published change, as `translatedFrom` is compared against. */
function englishModifiedAt(live: Row | null): string | null {
  const value = inLocale(live?.modifiedAt, DEFAULT_LOCALE) ?? live?.updatedAt
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' && value ? value : null
}

function translatedFromOf(doc: Row | null | undefined): {
  version: string | null
  englishModifiedAt: string | null
} | null {
  const group = doc?.translatedFrom as Row | null | undefined
  if (!group) return null
  const at = group.englishModifiedAt
  return {
    version: typeof group.version === 'string' ? group.version : null,
    englishModifiedAt:
      at instanceof Date
        ? at.toISOString()
        : typeof at === 'string'
          ? at
          : null,
  }
}

/** Whether English has been republished since `translatedFrom`. */
export function englishChangedSince(
  live: Row | null,
  translatedFrom: { englishModifiedAt: string | null } | null,
): boolean | null {
  const english = englishModifiedAt(live)
  if (!english || !translatedFrom?.englishModifiedAt) return null
  return Date.parse(english) > Date.parse(translatedFrom.englishModifiedAt)
}

/** What `readArticleMarkdown` adds about a translation it reads. */
export async function translationSummary(
  req: PayloadRequest,
  doc: Row,
  locale: Locale,
) {
  const site = await translationOnSite(req, doc.id as number | string, locale)
  const translatedFrom = translatedFromOf(doc)
  return {
    locale,
    translationStatus: doc.translationStatus ?? 'none',
    readers: site.readers,
    url: site.url,
    publishedAt: site.publishedAt,
    translatedFrom,
    englishChangedSince: englishChangedSince(site.live, translatedFrom),
  }
}

// --- What a translation may not go live with -------------------------------

/** Keys that hold structure, addresses or choices rather than words. */
const NOT_WORDS = new Set([
  'id',
  'blockType',
  'blockName',
  'url',
  'href',
  'sourceURL',
  'relationship',
  'variant',
  'tone',
  'layout',
  'align',
  'imageSide',
  'emoji',
  'type',
  'format',
  'direction',
  'version',
  'mode',
  'style',
  'textFormat',
  'textStyle',
  'relationTo',
  'tag',
  'listType',
])

/** Whether a block holds any words a reader would read. */
function holdsWords(value: unknown, key?: string): boolean {
  if (key && NOT_WORDS.has(key)) return false
  if (typeof value === 'string') return /\p{L}/u.test(value)
  if (Array.isArray(value)) return value.some((item) => holdsWords(item))
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => holdsWords(v, k))
  }
  return false
}

/**
 * Modules in a translated body that are still exactly the English ones: copied
 * across by `saveTranslation` to keep their place and not translated since. A
 * module with no words in it — an embed, a gallery without captions — is not
 * one; it has nothing to translate.
 */
export function untranslatedBlocks(
  translated: EditorState | null | undefined,
  english: EditorState | null | undefined,
): BlockRef[] {
  const englishByKey = new Map(
    indexBlocks(english).map(({ key, node }) => [key, node]),
  )
  return indexBlocks(translated).flatMap(({ key, node }) => {
    const original = englishByKey.get(key)
    if (!original) return []
    const same = JSON.stringify(original.fields) === JSON.stringify(node.fields)
    return same && holdsWords(node.fields)
      ? [{ key, blockType: String(node.fields.blockType) }]
      : []
  })
}

/** Every media id an article shows: its cover, body images, module images. */
export function imagesIn(
  content: unknown,
  featuredImage: unknown,
): Array<number | string> {
  const found = new Set<number | string>()
  const add = (value: unknown) => {
    const id =
      value && typeof value === 'object' && 'id' in value
        ? (value as { id: unknown }).id
        : value
    if (typeof id === 'number' || (typeof id === 'string' && id)) found.add(id)
  }
  add(featuredImage)
  const walk = (value: unknown, key?: string) => {
    if (Array.isArray(value)) return value.forEach((item) => walk(item))
    if (!value || typeof value !== 'object') return
    const node = value as Row
    if (node.type === 'upload' && node.relationTo === 'media') add(node.value)
    for (const [k, v] of Object.entries(node)) {
      if (k === 'image' && key !== 'image') add(v)
      walk(v, k)
    }
  }
  walk(content)
  return [...found]
}

/** Images the article shows that have no alt text in `locale`. */
async function imagesMissingAlt(
  req: PayloadRequest,
  ids: Array<number | string>,
  locale: Locale,
): Promise<Array<number | string>> {
  if (ids.length === 0) return []
  // Without `req`: see the header.
  const { docs } = await req.payload.find({
    collection: 'media',
    depth: 0,
    fallbackLocale: false,
    limit: ids.length,
    locale,
    overrideAccess: false,
    pagination: false,
    select: { alt: true },
    user: req.user as TypedUser,
    where: { id: { in: ids } },
  })
  const withAlt = new Set(
    (docs as unknown as Row[])
      .filter((doc) => typeof doc.alt === 'string' && doc.alt.trim())
      .map((doc) => String(doc.id)),
  )
  return ids.filter((id) => !withAlt.has(String(id)))
}

// --- Reading an article in two languages -----------------------------------

/** The newest version, read in `locale`. Without `req`; see the header. */
async function newestIn(
  req: PayloadRequest,
  id: number | string,
  locale: Locale,
): Promise<Row> {
  return (await req.payload.findByID({
    collection: COLLECTION,
    depth: 0,
    draft: true,
    fallbackLocale: false,
    id,
    locale,
    overrideAccess: false,
    user: req.user as TypedUser,
  })) as unknown as Row
}

/** The article a translation tool was pointed at, by id or English slug. */
async function articleId(
  req: PayloadRequest,
  target: { id?: string; slug?: string },
  locale?: Locale,
): Promise<number | string> {
  if (target.id) return target.id
  if (!target.slug) throw new Error('Provide either `id` or `englishSlug`.')
  // The slug in the translated language first, then English's.
  for (const where of [locale, DEFAULT_LOCALE].filter(Boolean) as Locale[]) {
    const { docs } = await req.payload.find({
      collection: COLLECTION,
      depth: 0,
      draft: true,
      fallbackLocale: false,
      limit: 1,
      locale: where,
      overrideAccess: false,
      select: {},
      user: req.user as TypedUser,
      where: { slug: { equals: target.slug } },
    })
    if (docs[0]) return docs[0].id
  }
  throw new Error(`No article has the slug \`${target.slug}\`.`)
}

const READER_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'content',
  'legacyHTML',
  'metaTitle',
  'metaDescription',
] as const

function englishFingerprint(doc: Row): string {
  return JSON.stringify(READER_FIELDS.map((field) => doc[field] ?? null))
}

// --- saveTranslation --------------------------------------------------------

const translatedLocale = z
  .string()
  .describe(
    `The language of the translation: ${PREFIXED_LOCALES.join(', ')}. Not en — ` +
      'English is written with draftArticle and updateArticleMarkdown.',
  )

function refuseEnglish(locale: unknown): Locale {
  if (locale === DEFAULT_LOCALE) {
    throw new Error(
      'saveTranslation writes translations and never English. Edit the English ' +
        'article with updateArticleMarkdown (and the block tools) instead.',
    )
  }
  if (!isPrefixedLocale(locale)) {
    throw new Error(
      `Unknown locale \`${String(locale)}\`. Translations are written in ` +
        `${PREFIXED_LOCALES.join(', ')}.`,
    )
  }
  return locale
}

export const saveTranslationTool: McpTool = {
  description:
    'Write the translation of an existing article into one language, as a ' +
    'draft in that language only. Never changes the English article, and ' +
    'never publishes — publish with `publishArticle` and the same `locale`. ' +
    'Name the article by `id` or `englishSlug`. `markdown` is the translated ' +
    'body; keep the block markers (`<!-- block:faq:<key> -->`) from ' +
    '`readArticleMarkdown` where the modules go: each is carried over — from ' +
    'this translation if it already has that module, otherwise copied from ' +
    'English — and then translated with `setFAQBlock`, `setTableBlock` or ' +
    '`setKeyFactsBlock` with the same `locale`. A module still in English ' +
    'blocks the publish, and so does an image with no alt text in this ' +
    'language: give them in `imageAlt`. `slug` is the translated address ' +
    '(lowercase ASCII, hyphens); left out, it is made from the title on the ' +
    'first save (accents dropped, German ü → ue). Records which English ' +
    'version the translation was made from. Saving again replaces the draft.',
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const {
      englishSlug,
      excerpt,
      id: givenId,
      imageAlt = [],
      locale: requested,
      markdown,
      metaDescription,
      metaTitle,
      slug,
      title,
    } = args as {
      englishSlug?: string
      excerpt?: string
      id?: string
      imageAlt?: Array<{
        mediaId: number | string
        alt: string
        caption?: string
      }>
      locale: string
      markdown: string
      metaDescription?: string
      metaTitle?: string
      slug?: string
      title: string
    }
    const locale = refuseEnglish(requested)
    const id = await articleId(req, { id: givenId, slug: englishSlug }, locale)

    // Both languages' newest versions, read without `req`.
    const english = await newestIn(req, id, DEFAULT_LOCALE)
    const current = await newestIn(req, id, locale)
    const before = englishFingerprint(english)

    if (slug !== undefined) {
      if (!isWellFormedSlug(slug)) throw new Error(slugFormatError(slug))
      const reserved = validateLocalizedContentSlug(slug)
      if (reserved !== true) throw new Error(reserved)
      const { docs } = await req.payload.find({
        collection: COLLECTION,
        depth: 0,
        draft: true,
        limit: 1,
        locale,
        overrideAccess: true,
        select: {},
        where: {
          and: [{ slug: { equals: slug } }, { id: { not_equals: id } }],
        },
      })
      if (docs[0]) {
        throw new Error(
          `Another article already uses \`${slug}\` in ${locale}. Choose another slug.`,
        )
      }
    }

    // Markers resolve against this translation's modules first, so a module
    // already translated keeps its translation, and against English's for the
    // rest, which are copied across to be translated next.
    const translatedBlocks = indexBlocks(current.content as EditorState)
    const englishBlocks = indexBlocks(english.content as EditorState)
    const translatedKeys = new Set(translatedBlocks.map(({ key }) => key))
    const pool: EditorState = {
      root: {
        type: 'root',
        children: [
          ...translatedBlocks.map(({ node }) => node),
          ...englishBlocks
            .filter(({ key }) => !translatedKeys.has(key))
            .map(({ node }) => node),
        ],
      },
    } as unknown as EditorState
    const { state: content, kept } = restoreBlocks(
      restoreAnchors(markdownToLexical(req.payload, COLLECTION, markdown)),
      pool,
    )

    // Alt text and captions, in this language, for images in this article.
    const shown = new Set(
      imagesIn(content, english.featuredImage).map((value) => String(value)),
    )
    for (const entry of imageAlt) {
      if (!shown.has(String(entry.mediaId))) {
        throw new Error(
          `Media ${String(entry.mediaId)} is not an image in this article's ` +
            'translation. imageAlt sets alt text only for images it shows.',
        )
      }
    }

    const source = await englishSource(req, id)
    const status =
      current.translationStatus === 'published' ? 'published' : 'draft'

    const saved = (await req.payload.update({
      collection: COLLECTION,
      data: {
        _status: 'draft',
        title,
        content,
        translationStatus: status,
        ...(source ? { translatedFrom: source } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(excerpt !== undefined ? { excerpt } : {}),
        ...(metaTitle !== undefined ? { metaTitle } : {}),
        ...(metaDescription !== undefined ? { metaDescription } : {}),
      },
      depth: 0,
      draft: true,
      id,
      locale,
      overrideAccess: false,
      req,
      user: req.user as TypedUser,
    })) as unknown as Row

    for (const entry of imageAlt) {
      await req.payload.update({
        collection: 'media',
        data: {
          alt: entry.alt,
          ...(entry.caption !== undefined ? { caption: entry.caption } : {}),
        },
        depth: 0,
        id: entry.mediaId,
        locale,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })
    }

    const after = await newestIn(req, id, DEFAULT_LOCALE)
    const englishUnchanged = englishFingerprint(after) === before
    if (!englishUnchanged) {
      // Not expected to be reachable — every write above names its locale —
      // and said loudly if it ever is.
      throw new Error(
        'The translation was saved, but the English draft no longer matches ' +
          'what it was before this call. Check the article’s English version ' +
          'with readArticleMarkdown before publishing anything.',
      )
    }

    const copied = kept.filter(({ key }) => !translatedKeys.has(key))
    const stillEnglish = untranslatedBlocks(
      content,
      english.content as EditorState,
    )
    const missingAlt = await imagesMissingAlt(req, [...shown], locale)

    return text({
      id,
      locale,
      slug: saved.slug,
      title: saved.title,
      status: 'draft',
      translationStatus: status,
      englishUnchanged,
      translatedFrom: source,
      preview: buildPreviewUrl({
        collection: COLLECTION,
        slug: saved.slug,
        locale,
      }),
      blocks: { kept, copiedFromEnglish: copied },
      ...(stillEnglish.length
        ? {
            untranslatedBlocks: stillEnglish,
            untranslatedNote:
              'These modules still hold the English text. Translate each with ' +
              `the block tool and \`locale: "${locale}"\` (same key) before ` +
              'publishing; publishArticle refuses while any is still English.',
          }
        : {}),
      ...(missingAlt.length
        ? {
            imagesMissingAlt: missingAlt,
            imagesNote:
              `These images have no alt text in ${locale}. Pass it in \`imageAlt\` ` +
              'on another saveTranslation call; publishArticle refuses until ' +
              'every image in the article has it.',
          }
        : {}),
      ...(await translationReaders(req, id, locale)),
    })
  },
  name: 'saveTranslation',
  parameters: {
    id: z
      .string()
      .optional()
      .describe('The article id. Provide this or `englishSlug`.'),
    englishSlug: z
      .string()
      .optional()
      .describe("The article's English slug. Provide this or `id`."),
    locale: translatedLocale,
    title: z.string().min(1).describe('The translated title.'),
    slug: z
      .string()
      .optional()
      .describe(
        'The translated slug: lowercase ASCII letters, numbers and hyphens, no ' +
          'accents. Left out, it is made from the title on the first save.',
      ),
    excerpt: z.string().optional().describe('The translated standfirst.'),
    metaTitle: z.string().optional().describe('The translated SEO title.'),
    metaDescription: z
      .string()
      .optional()
      .describe('The translated SEO description.'),
    markdown: z
      .string()
      .describe(
        'The translated body, in Markdown, with the block markers kept where ' +
          'the modules go.',
      ),
    imageAlt: z
      .array(
        z.object({
          mediaId: z.union([z.string(), z.number()]),
          alt: z.string().min(1).describe('Alt text in this language.'),
          caption: z.string().optional().describe('Caption in this language.'),
        }),
      )
      .max(50)
      .optional()
      .describe(
        "Alt text (and captions) in this language for the article's images — " +
          'its cover, body images and module images. An image is one media ' +
          'item, so this applies wherever else it is used in this language.',
      ),
  },
}

// --- publishArticle, in a translated language ------------------------------

/**
 * `publishArticle` with a translated `locale`: publishes, or schedules, only
 * that language. English, and every other language, are left exactly as they
 * are — `isolateLocalePublish` makes Payload's write a single-language one.
 */
export async function publishTranslation(
  args: Record<string, unknown>,
  req: PayloadRequest,
  locale: Locale,
) {
  const {
    dryRun = false,
    publishAt,
    ...target
  } = args as {
    dryRun?: boolean
    id?: string
    publishAt?: string
    slug?: string
  }
  const now = new Date()
  const id = await articleId(req, target, locale)
  const draft = await newestIn(req, id, locale)
  const english = await newestIn(req, id, DEFAULT_LOCALE)
  const site = await translationOnSite(req, id, locale, now)

  if (!site.englishPublished) {
    throw new Error(
      'The English article is not published. A translation goes live only ' +
        'over a published English original — publish English first.',
    )
  }
  if (typeof draft.title !== 'string' || !draft.title.trim()) {
    throw new Error(
      `There is no ${locale} translation of this article to publish. Write ` +
        'one with saveTranslation first.',
    )
  }

  const problems: string[] = []
  const stillEnglish = untranslatedBlocks(
    draft.content as EditorState,
    english.content as EditorState,
  )
  if (stillEnglish.length) {
    problems.push(
      `Modules still in English: ${stillEnglish
        .map((ref) => `${ref.blockType}:${ref.key}`)
        .join(
          ', ',
        )}. Translate each with its block tool and \`locale: "${locale}"\`.`,
    )
  }
  const missingAlt = await imagesMissingAlt(
    req,
    imagesIn(draft.content, draft.featuredImage),
    locale,
  )
  if (missingAlt.length) {
    problems.push(
      `Images with no alt text in ${locale}: media ${missingAlt.join(', ')}. ` +
        'Give it with saveTranslation `imageAlt`.',
    )
  }
  if (problems.length) {
    throw new Error(
      `Not published — the ${locale} page would show readers English or ` +
        `unlabelled images. ${problems.join(' ')}`,
    )
  }

  const requested = resolvePublishAt(publishAt, now)
  if (site.readers === 'live' && requested !== undefined) {
    throw new Error(
      `This translation has been live since ${site.publishedAt}, and its date ` +
        'is not moved here. Leave `publishAt` out to publish its changes in place.',
    )
  }
  const draftDate =
    typeof draft.translationPublishedAt === 'string'
      ? draft.translationPublishedAt
      : null
  if (
    site.readers === 'unpublished' &&
    requested === undefined &&
    draftDate &&
    Date.parse(draftDate) <= now.getTime()
  ) {
    throw new Error(
      `This translation is not live, and the date it carries (${draftDate}) ` +
        'has passed. Pass `publishAt: "now"` to publish it today, or a time ' +
        'ahead to schedule it.',
    )
  }
  const publishedAt =
    site.readers === 'live'
      ? site.publishedAt
      : (requested ?? draftDate ?? now.toISOString())
  const goesOut =
    publishedAt && Date.parse(publishedAt) > now.getTime()
      ? 'scheduled'
      : 'live'

  const slug = String(draft.slug ?? '')
  const movedFrom =
    site.readers !== 'unpublished' && site.slug && site.slug !== slug
      ? site.slug
      : null
  const described = {
    id,
    locale,
    slug,
    title: draft.title,
    before: site.readers,
    after: goesOut,
    publishedAt,
    url: absoluteUrl(localePostPath(slug, locale), getSiteUrl()),
    english: absoluteUrl(postPath(String(english.slug ?? '')), getSiteUrl()),
    ...(movedFrom
      ? {
          redirect: {
            from: localePostPath(movedFrom, locale),
            to: localePostPath(slug, locale),
            note: 'The old address is redirected (301) to the new one when this publishes.',
          },
        }
      : {}),
  }

  if (dryRun) {
    return text({
      ...described,
      dryRun: true,
      mayPublish: mayPublishThrough(req),
    })
  }

  // `refuseMcpPublish` decides here, on the same rule `mayPublish` read.
  const updated = (await req.payload.update({
    collection: COLLECTION,
    data: {
      _status: 'published',
      translationStatus: 'published',
      translationPublishedAt: publishedAt,
    },
    depth: 0,
    draft: false,
    id,
    locale,
    overrideAccess: false,
    req,
    user: req.user as TypedUser,
  })) as unknown as Row

  return text({
    ...described,
    dryRun: false,
    status: updated.translationStatus,
    appears:
      goesOut === 'scheduled'
        ? `On ${publishedAt}, within 10 minutes. Nothing else needs to happen.`
        : 'Now, within 10 minutes at most as cached pages turn over.',
  })
}

// --- translationStatus ------------------------------------------------------

type LocaleState = {
  state: 'published' | 'scheduled' | 'draft' | 'missing'
  slug: string | null
  url: string | null
  publishedAt: string | null
  englishChangedSince: boolean | null
}

const asIso = (value: unknown): string | null =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === 'string' && value
      ? value
      : null

/** One language's state for one article, from its live row and newest version. */
export function localeState(
  live: Row | null,
  newest: Row | null,
  locale: Locale,
  now: Date,
): LocaleState {
  const slug = (inLocale(live?.slug, locale) ??
    inLocale(newest?.slug, locale)) as string | undefined
  const englishLive =
    live?._status === 'published' &&
    !isScheduled('published', asIso(live?.publishedAt), now)
  const status = inLocale(live?.translationStatus, locale)
  const at = asIso(inLocale(live?.translationPublishedAt, locale))
  const translatedFrom = (inLocale(live?.translatedFrom, locale) ??
    inLocale(newest?.translatedFrom, locale)) as Row | undefined
  const changed = englishChangedSince(live, {
    englishModifiedAt: asIso(translatedFrom?.englishModifiedAt),
  })

  let state: LocaleState['state'] = 'missing'
  if (live?._status === 'published' && status === 'published') {
    state =
      englishLive && at && Date.parse(at) <= now.getTime()
        ? 'published'
        : 'scheduled'
  } else if (
    inLocale(newest?.title, locale) ||
    inLocale(newest?.translationStatus, locale) === 'draft'
  ) {
    state = 'draft'
  }
  return {
    state,
    slug: slug ?? null,
    url:
      state === 'published' && slug
        ? absoluteUrl(localePostPath(slug, locale), getSiteUrl())
        : null,
    publishedAt: state === 'published' || state === 'scheduled' ? at : null,
    englishChangedSince: state === 'missing' ? null : changed,
  }
}

const STATUS_SELECT = {
  slug: true,
  title: true,
  _status: true,
  publishedAt: true,
  updatedAt: true,
  modifiedAt: true,
  translationStatus: true,
  translationPublishedAt: true,
  translatedFrom: true,
} as const

export const translationStatusTool: McpTool = {
  description:
    'Where every article stands in each language, read-only: for each, ' +
    'whether its translation in each language is published, scheduled, a ' +
    'draft or missing, the translated address, and whether English has been ' +
    'republished since the translation was made (`englishChangedSince`). ' +
    'Newest English articles first. Pass `locale` to report one language.',
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const {
      limit = 50,
      locale,
      page = 1,
    } = args as {
      limit?: number
      locale?: string
      page?: number
    }
    if (locale !== undefined && !isPrefixedLocale(locale)) {
      throw new Error(
        `\`locale\` is one of ${PREFIXED_LOCALES.join(', ')}; English has no translation status.`,
      )
    }
    const locales = locale ? [locale as Locale] : PREFIXED_LOCALES
    const now = new Date()
    const access = {
      overrideAccess: false,
      user: req.user as TypedUser,
    } as const

    const live = await req.payload.find({
      collection: COLLECTION,
      ...access,
      depth: 0,
      limit,
      locale: 'all',
      page,
      select: STATUS_SELECT,
      sort: '-publishedAt',
    })
    const ids = live.docs.map((doc) => doc.id)
    const newest = ids.length
      ? await req.payload.find({
          collection: COLLECTION,
          ...access,
          depth: 0,
          draft: true,
          limit: ids.length,
          locale: 'all',
          pagination: false,
          select: STATUS_SELECT,
          where: { id: { in: ids } } as Where,
        })
      : { docs: [] }
    const newestById = new Map(
      (newest.docs as unknown as Row[]).map((doc) => [String(doc.id), doc]),
    )

    return text({
      now: now.toISOString(),
      locales,
      page: live.page,
      totalPages: live.totalPages,
      totalArticles: live.totalDocs,
      articles: (live.docs as unknown as Row[]).map((doc) => {
        const englishSlug = inLocale(doc.slug, DEFAULT_LOCALE) as
          string | undefined
        const fresh = newestById.get(String(doc.id)) ?? null
        return {
          id: doc.id,
          title: inLocale(doc.title, DEFAULT_LOCALE) ?? null,
          englishSlug: englishSlug ?? null,
          englishUrl: englishSlug
            ? absoluteUrl(postPath(englishSlug), getSiteUrl())
            : null,
          englishStatus:
            doc._status !== 'published'
              ? 'unpublished'
              : isScheduled('published', asIso(doc.publishedAt), now)
                ? 'scheduled'
                : 'live',
          translations: Object.fromEntries(
            locales.map((code) => [code, localeState(doc, fresh, code, now)]),
          ),
        }
      }),
    })
  },
  name: 'translationStatus',
  parameters: {
    locale: z
      .string()
      .optional()
      .describe(
        `One language to report: ${PREFIXED_LOCALES.join(', ')}. Default: all.`,
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Articles per page, newest first. Defaults to 50; at most 200.',
      ),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page of results. Defaults to 1.'),
  },
}
