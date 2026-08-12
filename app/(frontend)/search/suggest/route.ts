import { NextResponse } from 'next/server'

import { searchPosts } from '@/lib/content/queries'
import { postPath } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

const LIMIT = 8

/**
 * Results for the header's search drawer.
 *
 * The drawer needs to answer while someone is still typing, which a page
 * navigation cannot do. It reuses `searchPosts` rather than building a second
 * index, so the drawer and `/search` always agree — including the published
 * filter, which is what keeps drafts from surfacing here. Members-only pieces
 * are findable, as they are on the rest of the site; each result carries only
 * the title and excerpt.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!query) return NextResponse.json({ results: [] })

  const posts = await searchPosts(query, LIMIT)

  return NextResponse.json(
    {
      results: posts.map((post) => ({
        title: post.title,
        excerpt: post.excerpt,
        href: postPath(post.slug),
        tag: post.tag,
        readingTime: post.readingTime,
      })),
    },
    // Someone typing produces a request per keystroke against the same few
    // terms; a short shared cache absorbs that without going stale.
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } },
  )
}
