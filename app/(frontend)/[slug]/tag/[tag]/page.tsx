import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getPostsByTag, getSiteSettings } from '@/lib/content/queries'
import { alternatesForPath } from '@/lib/i18n/alternates'
import { getLocaleIndex } from '@/lib/i18n/locale-index'
import { isPrefixedLocale, type Locale } from '@/lib/i18n/locales'
import { logMissingRoute } from '@/lib/observability/missing-route'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { localeTagPath } from '@/lib/seo/site'

import { LocaleArchive, localeArchiveMetadata } from '../../../locale-pages'

// A tag's archive in a translated language: `/{locale}/tag/{slug}/`, with the
// tag's slug in that language. It exists only while the tag has a name there
// and at least one article live in that language; otherwise a 404.
export const dynamic = 'force-dynamic'

type Params = { slug: string; tag: string }

const resolve = cache(async (locale: string, tag: string) => {
  if (!isPrefixedLocale(locale)) return null
  await requireLookupableSlug(tag)
  const archive = await getPostsByTag(tag, locale as Locale)
  if (!archive) await recordSlugMiss()
  return archive
})

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug: locale, tag } = await params
  const archive = await resolve(locale, tag)
  if (!archive) return { title: 'Not found' }
  const path = localeTagPath(archive.slug, locale as Locale)
  const [settings, index] = await Promise.all([
    getSiteSettings(locale as Locale),
    getLocaleIndex(),
  ])
  return localeArchiveMetadata({
    locale: locale as Locale,
    archive,
    path,
    alternates: alternatesForPath(index, path),
    siteTitle: settings.title,
  })
}

export default async function TranslatedTagPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug: locale, tag } = await params
  const archive = await resolve(locale, tag)
  if (!archive) {
    if (isPrefixedLocale(locale)) {
      await logMissingRoute(localeTagPath(tag, locale as Locale))
    }
    notFound()
  }
  return (
    <LocaleArchive locale={locale as Locale} archive={archive} kind="topic" />
  )
}
