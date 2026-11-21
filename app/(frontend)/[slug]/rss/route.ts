import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { DEFAULT_SITE_SETTINGS } from '@/lib/content/queries'
import { liveIn } from '@/lib/content/schedule'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { isPrefixedLocale, type Locale } from '@/lib/i18n/locales'
import { getPayloadClient } from '@/lib/payload'
import { renderRssFeed, type RssItem } from '@/lib/seo/rss'
import {
  absoluteUrl,
  getSiteUrl,
  localeFeedPath,
  localeHomePath,
  localePostPath,
} from '@/lib/seo/site'

// A translated language's feed: `/{locale}/rss/`, its live translations newest
// first. A language with none has no feed — a 404, not an empty channel, so
// nothing subscribes to a feed that has never had anything in it.
//
// English keeps `/rss/` (`app/rss/route.ts`), untouched.
export const dynamic = 'force-dynamic'

const FEED_LIMIT = 20

type FeedPost = {
  slug?: string
  title?: string
  excerpt?: string
  metaDescription?: string
  translationPublishedAt?: string
  authors?: Array<{ name?: string } | string | number>
}

const readFeed = cachedRead(
  'rss-feed-locale',
  async (locale: Locale) => {
    const payload = await getPayloadClient()
    const settings = await payload
      .findGlobal({
        slug: 'site-settings',
        overrideAccess: true,
        depth: 0,
        locale,
        fallbackLocale: false,
      })
      .catch(() => null)
    const posts = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit: FEED_LIMIT,
      sort: '-translationPublishedAt',
      where: liveIn(locale),
      locale,
      fallbackLocale: false,
    })
    return { settings, posts }
  },
  [CONTENT_TAGS.posts, CONTENT_TAGS.globals],
)

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug: locale } = await params
  if (!isPrefixedLocale(locale)) {
    return new Response('Not found', { status: 404 })
  }

  const { settings, posts } = await readFeed(locale)
  const items: RssItem[] = (posts.docs as FeedPost[])
    .filter((post): post is FeedPost & { slug: string; title: string } =>
      Boolean(post.slug && post.title),
    )
    .map((post) => {
      const author = post.authors?.[0]
      return {
        title: post.title,
        link: absoluteUrl(localePostPath(post.slug, locale), getSiteUrl()),
        description: post.excerpt ?? post.metaDescription ?? '',
        pubDate: post.translationPublishedAt ?? null,
        author:
          author && typeof author === 'object' && 'name' in author
            ? (author.name ?? undefined)
            : undefined,
      }
    })

  if (items.length === 0) return new Response('Not found', { status: 404 })

  const siteUrl = getSiteUrl()
  const t = dictionaryFor(locale)
  const record = settings as { title?: string; description?: string } | null
  const xml = renderRssFeed({
    title: `${record?.title || DEFAULT_SITE_SETTINGS.title} — ${t.languageName}`,
    description: record?.description || t.home.description,
    siteUrl: absoluteUrl(localeHomePath(locale), siteUrl),
    feedUrl: absoluteUrl(localeFeedPath(locale), siteUrl),
    language: locale,
    items,
  })

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  })
}
