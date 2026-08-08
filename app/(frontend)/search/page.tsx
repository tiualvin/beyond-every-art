import type { Metadata } from 'next'

import { searchPosts } from '@/lib/content/queries'
import { absoluteUrl, getSiteUrl, SEARCH_PATH } from '@/lib/seo/site'

import { FadeIn } from '../components/motion/fade-in'
import { StaggerChildren, StaggerItem } from '../components/motion/stagger'
import { StoryCard } from '../components/story-card'

export const dynamic = 'force-dynamic'

type SearchParams = { q?: string }

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
  const posts = query ? await searchPosts(query) : []

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
          {query ? (
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
