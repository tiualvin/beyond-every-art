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

import { ArchiveFilter } from '../components/archive-filter'
import { FadeIn } from '../components/motion/fade-in'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
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
      <section className="archive">
        <div className="container">
          <FadeIn>
            <div className="archive__head archive__head--wide">
              <p className="eyebrow">The archive</p>
              <h1 className="archive__title">Journal</h1>
              <p className="archive__intro">
                Everything published on materials, colour, technique, art
                history, exhibitions, and conservation — newest first.
              </p>
            </div>
          </FadeIn>

          <ArchiveFilter posts={archive.posts} />

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
