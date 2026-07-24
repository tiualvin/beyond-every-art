import { getPayloadClient } from '@/lib/payload'
import { renderRssFeed, type RssItem } from '@/lib/seo/rss'
import { absoluteUrl, FEED_PATH, getSiteUrl, postPath } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

const FEED_LIMIT = 20

type FeedPost = {
  slug?: string
  title?: string
  excerpt?: string
  metaDescription?: string
  publishedAt?: string
  authors?: Array<{ name?: string } | string | number>
}

function firstAuthorName(post: FeedPost): string | undefined {
  const author = post.authors?.[0]
  if (author && typeof author === 'object' && 'name' in author) {
    return author.name ?? undefined
  }
  return undefined
}

export async function GET(): Promise<Response> {
  const siteUrl = getSiteUrl()
  const feedUrl = absoluteUrl(FEED_PATH, siteUrl)

  const rssHeaders = {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=600, s-maxage=600',
  }

  try {
    const payload = await getPayloadClient()

    const settings = await payload
      .findGlobal({ slug: 'site-settings', overrideAccess: true, depth: 0 })
      .catch(() => null)

    const posts = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit: FEED_LIMIT,
      sort: '-publishedAt',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { visibility: { equals: 'public' } },
        ],
      },
    })

    const settingsRecord = settings as {
      title?: string
      description?: string
    } | null

    const items: RssItem[] = (posts.docs as FeedPost[])
      .filter((post): post is FeedPost & { slug: string } => Boolean(post.slug))
      .map((post) => ({
        title: post.title ?? post.slug,
        link: absoluteUrl(postPath(post.slug), siteUrl),
        description: post.excerpt ?? post.metaDescription ?? '',
        pubDate: post.publishedAt ?? null,
        author: firstAuthorName(post),
      }))

    const xml = renderRssFeed({
      title: settingsRecord?.title ?? 'Beyond Every Art',
      description: settingsRecord?.description ?? '',
      siteUrl,
      feedUrl,
      items,
    })

    return new Response(xml, { headers: rssHeaders })
  } catch {
    const xml = renderRssFeed({
      title: 'Beyond Every Art',
      description: '',
      siteUrl,
      feedUrl,
      items: [],
    })
    return new Response(xml, { headers: rssHeaders })
  }
}
