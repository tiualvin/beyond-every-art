import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { adClientFor } from '@/lib/ads/eligibility'
import {
  archivePagePath,
  buildPagination,
  parsePageParam,
} from '@/lib/content/pagination'
import {
  getPostsByTag,
  getSiteSettings,
  getTagsWithCounts,
} from '@/lib/content/queries'
import { shareImageSrc } from '@/lib/content/media'
import { assignPigments, pigmentFor } from '@/lib/design/pigments'
import { logMissingRoute } from '@/lib/observability/missing-route'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { buildCollectionPageJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { absoluteUrl, getSiteUrl, JOURNAL_PATH, tagPath } from '@/lib/seo/site'
import { topicMeta } from '@/lib/seo/topic-meta'

import { ArchiveGroups } from '../../components/archive-groups'
import { ArchivePagination } from '../../components/archive-pagination'
import { FadeIn } from '../../components/motion/fade-in'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Enough to move on with, without turning the foot into a second archive. */
const SIBLING_TOPICS = 5

// Resolved once per request, and gated first: a slug that cannot name a tag
// is answered 404 without a query. See `lib/security/slug-requests.ts`.
const resolve = cache(async (slug: string, page: number) => {
  await requireLookupableSlug(slug)
  const archive = await getPostsByTag(slug, page)
  if (!archive) await recordSlugMiss()
  return archive
})

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: SearchParams
}): Promise<Metadata> {
  const { slug } = await params
  const page = parsePageParam((await searchParams).page)
  const archive = await resolve(slug, page)
  if (!archive) return { title: 'Not found' }
  const siteUrl = getSiteUrl()
  // Each page of a hub is its own canonical, as on `/journal/`: page 2 lists
  // different articles from page 1, so pointing it at page 1 would tell a
  // crawler to drop the only links some of them have.
  const canonical = absoluteUrl(
    archivePagePath(tagPath(archive.slug), archive.page),
    siteUrl,
  )
  const settings = await getSiteSettings()
  // The tag's own search fields first, then a sentence built from its
  // articles; the newest article's image when the tag has none of its own.
  // See `lib/seo/topic-meta.ts`.
  const meta = topicMeta(archive, settings.title)
  const images = meta.image
    ? [
        {
          url: absoluteUrl(shareImageSrc(meta.image), siteUrl),
          alt: meta.image.alt,
        },
      ]
    : undefined
  const shareTitle =
    typeof meta.title === 'string' ? meta.title : meta.title.absolute
  // Page 1's title is untouched — it is the one search results already show.
  const suffix = archive.page > 1 ? ` — Page ${archive.page}` : ''
  return {
    title:
      typeof meta.title === 'string'
        ? `${meta.title}${suffix}`
        : { absolute: `${meta.title.absolute}${suffix}` },
    description: meta.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: shareTitle,
      description: meta.description,
      url: canonical,
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description: meta.description,
      images,
    },
  }
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: SearchParams
}) {
  const { slug } = await params
  const requested = parsePageParam((await searchParams).page)
  const archive = await resolve(slug, requested)
  if (!archive) {
    await logMissingRoute(tagPath(slug))
    notFound()
  }
  // Past the end is a 404, as on `/journal/`, never a quietly empty page.
  if (requested > 1 && requested > archive.totalPages) notFound()

  const pagination = buildPagination({
    basePath: tagPath(archive.slug),
    page: archive.page,
    totalPages: archive.totalPages,
  })

  const subjects = await getTagsWithCounts()
  // The topic archive carries listing units on the same terms as the journal.
  const adClient = adClientFor()
  const siblings = subjects
    .filter((topic) => topic.slug !== archive.slug)
    .slice(0, SIBLING_TOPICS)

  // Assigned over every subject, not over the handful this page shows, so a
  // topic is the same colour here as it is in the homepage chart. A tag with
  // no published posts is not in that list at all — it still gets a colour,
  // just an unreserved one, and it has no swatch to clash with.
  const pigments = assignPigments(subjects.map((topic) => topic.slug))
  const pigmentOf = (slug: string) => pigments.get(slug) ?? pigmentFor(slug)

  const pigment = pigmentOf(archive.slug)

  // Ghost emitted `Series` on these; this emits `CollectionPage`, which is what
  // a tag archive actually is. See `lib/seo/jsonld.ts`.
  const settings = await getSiteSettings()
  const siteUrl = getSiteUrl()
  const jsonLd = serializeJsonLd(
    buildCollectionPageJsonLd({
      url: absoluteUrl(
        archivePagePath(tagPath(archive.slug), archive.page),
        siteUrl,
      ),
      name: archive.name,
      // The same sentence the meta description carries, so the two never
      // describe one page differently.
      description: topicMeta(archive, settings.title).description,
      siteName: settings.title,
      siteUrl,
    }),
  )

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {/* The topic's own pigment stains the head, so arriving on a topic feels
          like arriving somewhere rather than landing on a filtered list. */}
      <header
        className="topic-head"
        style={{ '--pigment': pigment.hex } as React.CSSProperties}
      >
        <div className="topic-head__wash" aria-hidden="true" />
        <div className="topic-head__scrim" aria-hidden="true" />
        <div className="container">
          <p className="topic-head__crumb">
            <Link href={JOURNAL_PATH}>Journal</Link>
            <span aria-hidden="true">/</span>
            <span>Topics</span>
          </p>
          <FadeIn>
            <p className="topic-head__kicker">
              <span
                className="topic-head__swatch"
                style={{ background: pigment.hex }}
              />
              <span className="eyebrow">Topic</span>
            </p>
            <h1 className="archive__title">{archive.name}</h1>
            {archive.description && (
              <p className="archive__intro">{archive.description}</p>
            )}
          </FadeIn>
        </div>
      </header>

      <section className="archive">
        <div className="container">
          {archive.posts.length > 0 ? (
            <ArchiveGroups
              posts={archive.posts}
              adClient={adClient}
              fallback={settings.railFallback}
            />
          ) : (
            <p className="archive__empty">
              Nothing filed under this topic yet.
            </p>
          )}
          <ArchivePagination
            pagination={pagination}
            label={`${archive.name} pages`}
          />
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="related">
          <div className="container">
            <p className="related__label">Related topics</p>
            <div className="related__list">
              {siblings.map((topic) => (
                <Link
                  key={topic.slug}
                  href={tagPath(topic.slug)}
                  className="chip"
                >
                  <i style={{ background: pigmentOf(topic.slug).hex }} />
                  {topic.name}
                  <span className="chip__count">{topic.postCount}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
