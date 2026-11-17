import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getPostBySlug, type PostDetail } from '@/lib/content/queries'
import { alternatesForPath } from '@/lib/i18n/alternates'
import { getLocaleIndex } from '@/lib/i18n/locale-index'
import { isPrefixedLocale, type Locale } from '@/lib/i18n/locales'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { getPreviewMode } from '@/lib/preview/mode'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { localePostPath } from '@/lib/seo/site'

import { postMetadata, PostView } from '../../post-view'

// A translated article: `/{locale}/{slug}/`, where `slug` is the article's
// slug *in that language*.
//
// Under `[slug]` because the root already has a dynamic segment and Next will
// not have two side by side — so the first segment is called `slug` here even
// though it holds a language code, and anything that is not a configured
// language other than English is a 404. That is also what keeps `/en/…` from
// existing: English is never prefixed.
//
// A slug with no published translation in this language is a real 404, never a
// redirect to English: a translation that does not exist is not a page.
export const dynamic = 'force-dynamic'

type Params = { slug: string; localizedSlug: string }

const resolve = cache(
  async (locale: string, slug: string): Promise<PostDetail | null> => {
    if (!isPrefixedLocale(locale)) return null
    const { draft, user } = await getPreviewMode()
    if (!draft) await requireLookupableSlug(slug)
    const post = await getPostBySlug(slug, {
      draft,
      user,
      locale: locale as Locale,
    })
    if (!post && !draft) await recordSlugMiss()
    return post
  },
)

async function alternatesFor(post: PostDetail) {
  return alternatesForPath(
    await getLocaleIndex(),
    localePostPath(post.slug, post.locale!),
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug: locale, localizedSlug } = await params
  const post = await resolve(locale, localizedSlug)
  if (!post) return { title: 'Not found' }
  return postMetadata(post, await alternatesFor(post))
}

export default async function TranslatedPostPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug: locale, localizedSlug } = await params
  const { draft, live } = await getPreviewMode()
  const post = await resolve(locale, localizedSlug)

  if (!post) {
    if (isPrefixedLocale(locale)) {
      await logMissingRoute(localePostPath(localizedSlug, locale as Locale))
    }
    notFound()
  }

  return (
    <PostView
      post={post}
      alternates={await alternatesFor(post)}
      showBanner={draft && !live}
      draft={draft}
    />
  )
}
