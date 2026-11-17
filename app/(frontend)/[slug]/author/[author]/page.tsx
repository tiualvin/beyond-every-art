import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getPostsByAuthor, getSiteSettings } from '@/lib/content/queries'
import { alternatesForPath } from '@/lib/i18n/alternates'
import { getLocaleIndex } from '@/lib/i18n/locale-index'
import { isPrefixedLocale, type Locale } from '@/lib/i18n/locales'
import { logMissingRoute } from '@/lib/observability/missing-route'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { localeAuthorPath } from '@/lib/seo/site'

import { LocaleArchive, localeArchiveMetadata } from '../../../locale-pages'

// An author's archive in a translated language: `/{locale}/author/{slug}/`.
// Author slugs are the same in every language — a byline is a name — and only
// the bio is translated. It exists only while the author has at least one
// article live in that language; otherwise a 404.
export const dynamic = 'force-dynamic'

type Params = { slug: string; author: string }

const resolve = cache(async (locale: string, author: string) => {
  if (!isPrefixedLocale(locale)) return null
  await requireLookupableSlug(author)
  const archive = await getPostsByAuthor(author, locale as Locale)
  if (!archive) await recordSlugMiss()
  return archive
})

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug: locale, author } = await params
  const archive = await resolve(locale, author)
  if (!archive) return { title: 'Not found' }
  const path = localeAuthorPath(archive.slug, locale as Locale)
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

export default async function TranslatedAuthorPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug: locale, author } = await params
  const archive = await resolve(locale, author)
  if (!archive) {
    if (isPrefixedLocale(locale)) {
      await logMissingRoute(localeAuthorPath(author, locale as Locale))
    }
    notFound()
  }
  return (
    <LocaleArchive locale={locale as Locale} archive={archive} kind="author" />
  )
}
