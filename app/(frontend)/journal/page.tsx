import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import {
  archivePagePath,
  buildPagination,
  parsePageParam,
} from '@/lib/content/pagination'
import { getPublishedPosts, getSiteSettings } from '@/lib/content/queries'
import { absoluteUrl, getSiteUrl, JOURNAL_PATH } from '@/lib/seo/site'

import { FadeIn } from '../components/motion/fade-in'
import { StaggerChildren, StaggerItem } from '../components/motion/stagger'
import { StoryCard } from '../components/story-card'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const resolve = cache((page: number) => getPublishedPosts({ page }))

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const requested = parsePageParam((await searchParams).page)
  const [settings, archive] = await Promise.all([
    getSiteSettings(),
    resolve(requested),
  ])

  const canonical = absoluteUrl(
    archivePagePath(JOURNAL_PATH, archive.page),
    getSiteUrl(),
  )
  const suffix = archive.page > 1 ? ` — Page ${archive.page}` : ''

  return {
    title: `Journal${suffix}`,
    description: settings.description,
    alternates: { canonical },
    openGraph: { type: 'website', title: 'Journal', url: canonical },
  }
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const requested = parsePageParam((await searchParams).page)
  const archive = await resolve(requested)

  if (requested > 1 && requested > archive.totalPages) notFound()

  const pagination = buildPagination({
    basePath: JOURNAL_PATH,
    page: archive.page,
    totalPages: archive.totalPages,
  })

  return (
    <main>
      <section className="section">
        <div className="container">
          <FadeIn>
            <div className="archive__head">
              <p className="eyebrow">Journal</p>
              <h1>Every story, newest first</h1>
              <p className="muted" style={{ maxWidth: '40rem' }}>
                The full archive of writing on materials, art history, and
                creative practice.
              </p>
            </div>
          </FadeIn>

          <StaggerChildren className="card-grid">
            {archive.posts.map((post) => (
              <StaggerItem key={post.id}>
                <StoryCard post={post} />
              </StaggerItem>
            ))}
          </StaggerChildren>

          {pagination.totalPages > 1 && (
            <nav className="pagination" aria-label="Journal pages">
              {pagination.prevPath ? (
                <Link
                  href={pagination.prevPath}
                  className="button button--ghost"
                  rel="prev"
                >
                  Newer stories
                </Link>
              ) : (
                <span />
              )}
              <p className="pagination__status">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              {pagination.nextPath ? (
                <Link
                  href={pagination.nextPath}
                  className="button button--ghost"
                  rel="next"
                >
                  Older stories
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </section>
    </main>
  )
}
