// How a post is published one language at a time.
//
// `_status` is one value for the whole document and keeps meaning what it has
// always meant: the English article is on the site. Each translation carries
// its own `translationStatus` and `translationPublishedAt`, and the public site
// serves `/{locale}/{slug}/` only when both say so (`liveIn` in
// `lib/content/schedule.ts`). Payload's own per-locale status
// (`experimental.localizeStatus`) was the other option and was not taken: it is
// labelled beta, has open data-loss reports, and would have moved `_status` for
// every English post. docs/LOCALIZATION.md has the reasoning.
//
// What that leaves to this file is Payload's write path. A publish copies the
// newest version onto the live row, and the newest version holds every
// language — so without these hooks, publishing Spanish would also publish an
// English draft sitting in the same version, and publishing English would
// overwrite a live Spanish translation with whatever Spanish draft was last
// saved. Payload already has the right primitive, `publishSpecificLocale`,
// which merges one locale onto the last *published* version and leaves the
// others as they were. These hooks decide when to use it and close the gaps
// around it:
//
// - **Which publishes are isolated.** Every write in a translated locale, and
//   an English write to an article that already has a translation on the site.
//   An English-only article — every one of the 324 that existed on the day this
//   shipped — keeps exactly the write path it had, because
//   `publishSpecificLocale` also saves a draft "snapshot" as the newest version
//   and that would make every English publish look unfinished to the admin and
//   to `editorialStatus`.
// - **Fields that have no language.** Payload's merge takes tags, authors, the
//   cover, visibility and `publishedAt` from the draft whatever locale is being
//   published (checked against `mergeLocalizedData` at 3.90.2), so a Spanish
//   publish would ship an English draft's new tags. A write in a translated
//   locale is therefore pinned to the live row's values for every field that is
//   not localized — including `_status`, which a write that left it out would
//   otherwise take from a draft and so unpublish the English article.
// - **No translation without the original.** A translation can only go live
//   over a published English article: x-default points at it, and Payload's
//   merge has no published version to merge onto otherwise and would publish
//   every language's draft at once.
// - **Unpublish stays whole.** `_status` is shared, so "Unpublish" pressed while
//   the editor shows Spanish would take the English article down. It is
//   refused there; a translation comes down by setting its own status to
//   Draft and publishing.

import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type PayloadRequest,
} from 'payload'

import {
  DEFAULT_LOCALE,
  isLocale,
  isPrefixedLocale,
  type Locale,
} from './locales'

export const TRANSLATION_STATUSES = ['none', 'draft', 'published'] as const
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number]

type Row = Record<string, unknown>

/** Payload's bookkeeping — never pinned, never copied. */
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt'])

/**
 * The live row in every locale: localized fields come back as
 * `{ en: …, es: … }`. Read through the adapter so no access rule or hook can
 * change the answer, inside the caller's transaction.
 */
export async function readLiveRowAllLocales(
  req: PayloadRequest,
  collection: 'posts',
  id: number | string,
): Promise<Row | null> {
  const doc = await req.payload.db.findOne({
    collection,
    locale: 'all',
    req,
    where: { id: { equals: id } },
  })
  return (doc as Row | null) ?? null
}

/** The prefixed locales whose translation is published on the live row. */
export function publishedTranslations(row: Row | null): Locale[] {
  const status = row?.translationStatus
  if (!status || typeof status !== 'object') return []
  return Object.entries(status as Record<string, unknown>)
    .filter(([code, value]) => isPrefixedLocale(code) && value === 'published')
    .map(([code]) => code as Locale)
}

/** The value a localized field has in `locale`, from an all-locales row. */
export function inLocale(value: unknown, locale: Locale): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (value as Record<string, unknown>)[locale]
  }
  return undefined
}

type UpdateArgs = {
  data?: Row
  draft?: boolean
  id?: number | string
  publishAllLocales?: boolean
  publishSpecificLocale?: string
  unpublishAllLocales?: boolean
}

/**
 * Isolates a publish to the locale it is made in. See the header.
 *
 * `beforeOperation`, because `publishSpecificLocale` and `data` can still be
 * changed here and nowhere later: by `beforeChange`, Payload has already merged
 * the write onto the newest version.
 */
export const isolateLocalePublish: CollectionBeforeOperationHook = async ({
  args,
  collection,
  operation,
  req,
}) => {
  if (operation !== 'update') return args
  const update = args as UpdateArgs
  // A draft save writes a version and leaves the live row alone, which is
  // already per-locale: nothing is published, so nothing needs isolating.
  if (update.draft === true) return args
  if (
    update.publishSpecificLocale ||
    update.publishAllLocales ||
    update.unpublishAllLocales
  ) {
    return args
  }

  const locale = req.locale
  if (!isLocale(locale)) return args

  if (locale === DEFAULT_LOCALE) {
    // English: isolated only once there is a translation on the site to
    // protect, so an English-only article publishes exactly as it always has.
    if (update.id === undefined) return args
    const live = await readLiveRowAllLocales(req, 'posts', update.id)
    return publishedTranslations(live).length > 0
      ? { ...args, publishSpecificLocale: locale }
      : args
  }

  // A translated locale. Bulk writes have no single live row to check
  // against, and nothing in this project makes one: refuse rather than guess.
  if (update.id === undefined) {
    throw new APIError(
      `Publish a translation one article at a time. A bulk write in "${locale}" ` +
        'cannot be checked against each article’s English original.',
      400,
    )
  }

  if (update.data?._status === 'draft') {
    throw new APIError(
      'This would unpublish the article in every language, English included — ' +
        'status is shared. To take only this translation down, set ' +
        '“Translation” to Draft and publish. To unpublish the whole article, ' +
        'switch the editor to English first.',
      400,
    )
  }

  const live = await readLiveRowAllLocales(req, 'posts', update.id)
  if (!live || live._status !== 'published') {
    throw new APIError(
      'Publish the English article before any translation of it. A translation ' +
        'points readers and search engines at the English original, which is ' +
        'not on the site.',
      400,
    )
  }

  // Every field without a language keeps its live value: this write publishes
  // one translation and nothing else. Read from the collection's own config so
  // a field added later is pinned without anyone remembering to list it.
  const pinned: Row = {}
  for (const field of collection.flattenedFields) {
    if (!('name' in field) || field.localized) continue
    if (SYSTEM_FIELDS.has(field.name)) continue
    if (field.name in live) pinned[field.name] = live[field.name]
  }

  return {
    ...args,
    data: { ...(update.data ?? {}), ...pinned },
    publishSpecificLocale: locale,
  }
}

/** The value a field will hold after this write, patch or not. */
function effective(
  key: string,
  data: Row | undefined,
  original: Row | undefined,
) {
  const incoming = data?.[key]
  return incoming !== undefined ? incoming : original?.[key]
}

/**
 * Stamps the dates a locale's publish moves, in that locale only.
 *
 * `modifiedAt` is what the sitemap's lastmod, JSON-LD `dateModified` and
 * `og:modified_time` read. They used `updatedAt`, which is one value for the
 * document and is reset by *any* publish — so a Spanish publish would have
 * moved the English URL's lastmod. The migration copied every English
 * `updatedAt` here, so English values did not change on the day it shipped.
 *
 * Stamped on a write that lands on the live row: `_status` is `published` in
 * the data, or absent from a write that keeps a published status. A draft save
 * always arrives with `_status: 'draft'` (Payload sets it), so it never stamps.
 */
export const stampLocaleDates: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  const status =
    data?._status !== undefined ? data._status : originalDoc?._status
  if (status !== 'published') return data

  const now = new Date().toISOString()
  const next: Row = { ...data, modifiedAt: now }

  if (isPrefixedLocale(req.locale)) {
    const translation = effective('translationStatus', data, originalDoc)
    if (translation === 'published') {
      const at = effective('translationPublishedAt', data, originalDoc)
      if (typeof at !== 'string' || !at.trim())
        next.translationPublishedAt = now
    }
  }
  return next
}

/**
 * Records which English text a translation was made from, the first time it is
 * saved, unless the caller said so itself (`saveTranslation` always does).
 *
 * The admin compares this with English's `modifiedAt` to say "English has
 * changed since this translation". Set once rather than on every save, so a
 * typo fixed in Spanish does not quietly claim the whole piece was re-checked
 * against a newer English.
 */
export const stampTranslatedFrom: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!isPrefixedLocale(req.locale)) return data
  const id = (originalDoc as Row | undefined)?.id
  if (id === undefined) return data
  const given = (data?.translatedFrom as Row | undefined)?.englishModifiedAt
  const existing = (originalDoc?.translatedFrom as Row | undefined)
    ?.englishModifiedAt
  if (given || existing) return data

  const source = await englishSource(req, id as number | string)
  if (!source) return data
  return { ...data, translatedFrom: source }
}

/**
 * The English text a translation made now would be made from: the newest
 * published version of the article, and the moment English was last published.
 *
 * The version id is what `readArticleVersion` takes, so a translator told
 * "English has changed" can read exactly what they translated and compare. The
 * date is what the comparison runs on — it moves on every English publish and
 * on nothing else.
 */
export async function englishSource(
  req: PayloadRequest,
  id: number | string,
): Promise<{ englishModifiedAt: string; version: string | null } | null> {
  const live = await readLiveRowAllLocales(req, 'posts', id)
  if (!live || live._status !== 'published') return null
  const at = inLocale(live.modifiedAt, DEFAULT_LOCALE) ?? live.updatedAt
  if (typeof at !== 'string' && !(at instanceof Date)) return null

  let version: string | null = null
  try {
    // The adapter, not the Local API: `payload.findVersions({ req, locale })`
    // writes its `locale` onto the shared `req`, and this runs inside a save
    // in another language — the rest of that save would then land in English.
    // Found by doing exactly that: a Spanish draft saved as the English one.
    const { docs } = await req.payload.db.findVersions({
      collection: 'posts',
      limit: 1,
      locale: DEFAULT_LOCALE,
      pagination: false,
      req,
      sort: '-createdAt',
      where: {
        and: [
          { parent: { equals: id } },
          { 'version._status': { equals: 'published' } },
        ],
      },
    })
    version = docs[0] ? String(docs[0].id) : null
  } catch {
    // The date alone still answers "has English changed"; the id is a
    // convenience for reading the old text, not a requirement.
  }
  return {
    englishModifiedAt: at instanceof Date ? at.toISOString() : at,
    version,
  }
}
