import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { searchPosts } from '@/lib/content/queries'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
} from '@/lib/security/rate-limit'
import { absoluteUrl, getSiteUrl, SEARCH_PATH } from '@/lib/seo/site'

import { FadeIn } from '../components/motion/fade-in'
import { StaggerChildren, StaggerItem } from '../components/motion/stagger'
import { StoryCard } from '../components/story-card'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type SearchParams = { q?: string }

/**
 * Lower than the suggestion drawer's allowance, because this is the deliberate
 * act of submitting a search rather than the incidental traffic of typing one.
 *
 * Going over does not fail the page: the form, the heading and the chrome all
 * render as usual and only the results are withheld, so a reader who is merely
 * quick sees a message they can act on rather than an error page.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_SEARCH_PER_MINUTE', 30),
  60_000,
)

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { q } = await searchParams
  const query = q?.trim()
  const canonical = absoluteUrl(SEARCH_PATH, getSiteUrl())
  return {
    title: query ? `Search: ${query}` : 'Search',
    alternates: { canonical },
    robots: query ? { index: false, follow: true } : undefined,
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''
  const throttled =
    query.length > 0 && !limiter.check(clientKey(await headers())).allowed
  const posts = query && !throttled ? await searchPosts(query) : []

  return (
    <main>
      <section className="section">
        <div className="container">
          <FadeIn>
            <div className="archive__head">
              <p className="eyebrow">Search</p>
              <h1>Search Beyond Every Art</h1>
              <form className="search-form" action={SEARCH_PATH} role="search">
                <input
                  className="search-form__input"
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search articles"
                  aria-label="Search articles"
                />
                <button className="button button--primary" type="submit">
                  Search
                </button>
              </form>
            </div>
          </FadeIn>
          {throttled ? (
            <p className="muted">
              That is a lot of searches at once. Give it a moment and try again.
            </p>
          ) : query ? (
            posts.length > 0 ? (
              <StaggerChildren className="card-grid">
                {posts.map((post) => (
                  <StaggerItem key={post.id}>
                    <StoryCard post={post} />
                  </StaggerItem>
                ))}
              </StaggerChildren>
            ) : (
              <p className="muted">
                No articles found for &ldquo;{query}&rdquo;.
              </p>
            )
          ) : (
            <p className="muted">Enter a search term to find articles.</p>
          )}
        </div>
      </section>
    </main>
  )
}
