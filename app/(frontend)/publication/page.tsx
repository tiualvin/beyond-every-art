import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { thumbnailSrc } from '@/lib/content/media'
import { formatDate } from '@/lib/format'
import { getPreviewMode } from '@/lib/preview/mode'
import type { PublicationCard } from '@/lib/publications/content'
import { publicationRoutesOpen } from '@/lib/publications/launch'
import { getPublications } from '@/lib/publications/queries'
import {
  absoluteUrl,
  getSiteUrl,
  PUBLICATION_PATH,
  publicationPath,
} from '@/lib/seo/site'

import { FadeIn } from '../components/motion/fade-in'

// Rendered per request so canonical URLs come from the running container's
// environment rather than the build's; the reads behind it are cached and
// purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  if (!publicationRoutesOpen(await getPreviewMode())) {
    return { title: 'Not found' }
  }
  return {
    title: 'Publication',
    description:
      'Issues of Beyond Every Art, and the guides published alongside them.',
    alternates: { canonical: absoluteUrl(PUBLICATION_PATH, getSiteUrl()) },
  }
}

function IssueEntry({ issue }: { issue: PublicationCard }) {
  const date = formatDate(issue.publishedAt)
  const meta = [issue.series, issue.issueNumber].filter(Boolean).join(' · ')

  return (
    <li className="issue">
      <Link
        href={publicationPath(issue.slug)}
        className="issue__cover"
        // The title link below carries the name; this one is the same
        // destination and would only announce it twice.
        aria-hidden="true"
        tabIndex={-1}
      >
        {issue.cover ? (
          <Image
            src={thumbnailSrc(issue.cover)}
            alt=""
            fill
            sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 22rem"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <span className="issue__plate" />
        )}
      </Link>
      <div className="issue__body">
        {meta && <p className="issue__meta">{meta}</p>}
        <h2 className="issue__title">
          <Link href={publicationPath(issue.slug)}>{issue.title}</Link>
        </h2>
        {issue.subtitle && <p className="issue__subtitle">{issue.subtitle}</p>}
        {issue.description && (
          <p className="issue__description">{issue.description}</p>
        )}
        {date && (
          <p className="issue__date">
            <time dateTime={issue.publishedAt ?? undefined}>{date}</time>
          </p>
        )}
      </div>
    </li>
  )
}

export default async function PublicationArchivePage() {
  if (!publicationRoutesOpen(await getPreviewMode())) notFound()

  const issues = await getPublications()

  return (
    <main>
      <section className="section publication">
        <div className="container">
          <FadeIn>
            <div className="publication__head">
              <h1>Publication</h1>
              <p className="publication__intro">
                Issues of Beyond Every Art, and the guides published alongside
                them — each one laid out to be read page by page.
              </p>
            </div>
          </FadeIn>

          {issues.length > 0 ? (
            <ol className="issues" reversed>
              {issues.map((issue) => (
                <IssueEntry key={issue.id} issue={issue} />
              ))}
            </ol>
          ) : (
            <p className="muted">
              No issues yet. They appear here once an editor publishes one in
              Payload.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
