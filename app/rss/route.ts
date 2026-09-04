import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { DEFAULT_SITE_SETTINGS } from '@/lib/content/queries'
import { getPayloadClient } from '@/lib/payload'
import { renderRssFeed, type RssItem } from '@/lib/seo/rss'
import { absoluteUrl, FEED_PATH, getSiteUrl, postPath } from '@/lib/seo/site'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
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

/**
 * The feed's data, cached and purged with the posts it lists.
 *
 * The route itself stays dynamic — it resolves the site's own origin at
 * request time — but a feed reader polling every few minutes should not put a
 * query behind every poll.
 */
const readFeed = cachedRead(
  'rss-feed',
  async () => {
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
      // Members-only posts belong in the feed as much as they belong in the
      // archive: an item is a title, a link and an excerpt, which is exactly
      // what a signed-out reader gets on the post itself. No body is rendered
      // here, so nothing gated escapes through the feed.
      where: { _status: { equals: 'published' } },
    })

    return { settings, posts }
  },
  [CONTENT_TAGS.posts, CONTENT_TAGS.globals],
)

export async function GET(): Promise<Response> {
  const siteUrl = getSiteUrl()
  const feedUrl = absoluteUrl(FEED_PATH, siteUrl)

  const rssHeaders = {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=600, s-maxage=600',
  }

  try {
    const { settings, posts } = await readFeed()

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
      title: settingsRecord?.title || DEFAULT_SITE_SETTINGS.title,
      // Ghost's feed carried a channel description; an empty one here is a
      // regression a reader sees in every feed client.
      description:
        settingsRecord?.description || DEFAULT_SITE_SETTINGS.description,
      siteUrl,
      feedUrl,
      items,
    })

    return new Response(xml, { headers: rssHeaders })
  } catch {
    const xml = renderRssFeed({
      title: DEFAULT_SITE_SETTINGS.title,
      description: DEFAULT_SITE_SETTINGS.description,
      siteUrl,
      feedUrl,
      items: [],
    })
    return new Response(xml, { headers: rssHeaders })
  }
}
