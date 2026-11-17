// A published translation's old address keeps working when its slug changes.
//
// English slugs are not handled here: changing a live English URL is a
// decision `AGENTS.md` reserves for a person, the MCP tools refuse it, and the
// Redirects collection is where that person records the answer. A translation
// is different by design — its slug is written by a translator, often after
// publication, once a better phrase is found — so the redirect is made for
// them, in the same write, through the same table the middleware already
// serves. A crawler that indexed `/es/old/` follows a 301 to `/es/new/`.

import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { isPrefixedLocale, type Locale } from './locales'
import { inLocale, readLiveRowAllLocales } from './publishing'
import { localePostPath } from '../seo/site'

type Row = Record<string, unknown>

/** Writes `from → to` and repoints anything that led to `from`. */
export async function recordSlugRedirect(
  req: PayloadRequest,
  from: string,
  to: string,
  note: string,
): Promise<void> {
  const { payload } = req

  // Moving back to an address that redirects elsewhere: that redirect would
  // now send readers away from the live page, so it goes.
  await payload.delete({
    collection: 'redirects',
    overrideAccess: true,
    req,
    where: { source: { equals: to } },
  })

  // Chains collapse: whatever pointed at the old address points at the new one.
  await payload.update({
    collection: 'redirects',
    data: { destination: to },
    overrideAccess: true,
    req,
    where: { destination: { equals: from } },
  })

  const existing = await payload.find({
    collection: 'redirects',
    limit: 1,
    overrideAccess: true,
    req,
    where: { source: { equals: from } },
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'redirects',
      id: existing.docs[0].id,
      data: { destination: to, enabled: true, statusCode: '301' },
      overrideAccess: true,
      req,
    })
    return
  }
  await payload.create({
    collection: 'redirects',
    data: {
      source: from,
      destination: to,
      statusCode: '301',
      enabled: true,
      notes: note,
    },
    overrideAccess: true,
    req,
  })
}

/**
 * `beforeChange` on posts: when a write publishes a translation under a new
 * slug, and the old one was live, redirect the old address to the new.
 *
 * Before the change rather than after it, so it reads the live row as it was
 * and runs inside the same transaction: a publish that fails leaves no
 * redirect behind pointing at an address that never went live.
 */
export const redirectChangedTranslationSlug: CollectionBeforeChangeHook =
  async ({ data, originalDoc, req }) => {
    const locale = req.locale
    if (!isPrefixedLocale(locale)) return data
    if (data?._status !== 'published') return data
    const id = (originalDoc as Row | undefined)?.id
    if (id === undefined) return data

    const next = data.slug ?? originalDoc?.slug
    if (typeof next !== 'string' || !next) return data

    const live = await readLiveRowAllLocales(
      req,
      'posts',
      id as number | string,
    )
    const wasLive = inLocale(live?.translationStatus, locale) === 'published'
    const previous = inLocale(live?.slug, locale)
    if (!wasLive || typeof previous !== 'string' || !previous) return data
    if (previous === next) return data

    await recordSlugRedirect(
      req,
      localePostPath(previous, locale as Locale),
      localePostPath(next, locale as Locale),
      `Automatic: the ${locale} translation of post ${String(id)} moved from “${previous}” to “${next}”.`,
    )
    return data
  }
