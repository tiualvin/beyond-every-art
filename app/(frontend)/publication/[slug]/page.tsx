import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { shareImageSrc } from '@/lib/content/media'
import { formatDate } from '@/lib/format'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { getPreviewMode } from '@/lib/preview/mode'
import {
  groupContents,
  type PublicationDetail,
} from '@/lib/publications/content'
import { publicationRoutesOpen } from '@/lib/publications/launch'
import { getPublicationBySlug } from '@/lib/publications/queries'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import {
  absoluteUrl,
  getSiteUrl,
  PUBLICATION_PATH,
  publicationPath,
} from '@/lib/seo/site'

import { FadeIn } from '../../components/motion/fade-in'

// Rendered per request so canonical URLs come from the running container's
// environment rather than the build's; the reads behind it are cached and
// purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }

/**
 * The issue for this request, or null for a 404.
 *
 * Resolved once per request; `generateMetadata` and the page share it, and so
 * share both gates. Before launch a reader is turned away here, before the slug
 * reaches Postgres or counts as a miss — a closed route is not a probe. After
 * it, the slug gate in `lib/security/slug-requests.ts` applies exactly as it
 * does on the apps route; preview is exempt for the reason given there.
 */
const resolve = cache(
  async (slug: string): Promise<PublicationDetail | null> => {
    const preview = await getPreviewMode()
    if (!publicationRoutesOpen(preview)) return null

    const { draft, user } = preview
    if (!draft) await requireLookupableSlug(slug)

    const issue = await getPublicationBySlug(slug, { draft, user })
    if (!issue && !draft) await recordSlugMiss()
    return issue
  },
)

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const issue = await resolve(slug)
  if (!issue) return { title: 'Not found' }

  const siteUrl = getSiteUrl()
  const canonical = absoluteUrl(publicationPath(issue.slug), siteUrl)
  const description =
    issue.metaDescription || issue.description || issue.subtitle || undefined
  // The cover is what a shared link should show, as a feature image is for an
  // article.
  const images = issue.cover
    ? [
        {
          url: absoluteUrl(shareImageSrc(issue.cover), siteUrl),
          alt: issue.cover.alt,
        },
      ]
    : undefined
  return {
    title: issue.metaTitle || issue.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: issue.title,
      description,
      url: canonical,
      images,
    },
  }
}

function Contents({ issue }: { issue: PublicationDetail }) {
  const sections = groupContents(issue.contents)
  if (sections.length === 0) return null

  return (
    <section className="issue-contents" aria-labelledby="issue-contents">
      <h2 id="issue-contents">Contents</h2>
      {sections.map((group, index) => (
        <div
          className="issue-contents__group"
          key={`${group.section}-${index}`}
        >
          {group.section && <h3>{group.section}</h3>}
          <ol>
            {group.entries.map((entry, row) => (
              <li key={`${entry.title}-${row}`}>
                <span className="issue-contents__title">{entry.title}</span>
                {entry.page !== null && (
                  <span className="issue-contents__page">
                    <span className="visually-hidden">page </span>
                    {entry.page}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}

export default async function PublicationIssuePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const issue = await resolve(slug)

  if (!issue) {
    // Logged only once the routes are open: before launch every request here
    // is a 404 by design, and a log line per one would bury real misses.
    if (publicationRoutesOpen(await getPreviewMode())) {
      await logMissingRoute(publicationPath(slug))
    }
    notFound()
  }

  const date = formatDate(issue.publishedAt)
  const meta = [issue.series, issue.issueNumber].filter(Boolean).join(' · ')

  return (
    <main>
      <article className="section issue-page">
        <div className="container issue-page__grid">
          <FadeIn>
            <div className="issue-page__cover">
              {issue.cover ? (
                <Image
                  src={issue.cover.url}
                  alt={issue.cover.alt}
                  width={issue.cover.width ?? 1200}
                  height={issue.cover.height ?? 1600}
                  // Capped at 26rem in either layout (app/globals.css).
                  sizes="(max-width: 30rem) 100vw, 26rem"
                  priority
                />
              ) : (
                <span className="issue__plate" />
              )}
            </div>
          </FadeIn>

          <div className="issue-page__body">
            <FadeIn>
              <p className="eyebrow">
                <Link href={PUBLICATION_PATH}>Publication</Link>
              </p>
              {meta && <p className="issue__meta">{meta}</p>}
              <h1 className="issue-page__title">{issue.title}</h1>
              {issue.subtitle && (
                <p className="issue-page__subtitle">{issue.subtitle}</p>
              )}
              {date && (
                <p className="issue__date">
                  <time dateTime={issue.publishedAt ?? undefined}>{date}</time>
                </p>
              )}
              {issue.description && (
                <p className="issue-page__description">{issue.description}</p>
              )}
            </FadeIn>

            <Contents issue={issue} />
          </div>
        </div>
      </article>
    </main>
  )
}
