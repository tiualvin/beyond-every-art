import Link from 'next/link'

import {
  FEATURED_SLOTS,
  OPENING_SLOTS,
  RECENT_QUERY_SIZE,
  selectPicks,
} from '@/lib/content/homepage'
import {
  getFeaturedPosts,
  getHomepage,
  getRecentPosts,
  getSiteSettings,
  getTagsWithCounts,
} from '@/lib/content/queries'
import {
  buildItemListJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from '@/lib/seo/jsonld'
import {
  absoluteUrl,
  getSiteUrl,
  HOME_TOPICS_ID,
  JOURNAL_PATH,
  NEWSLETTER_PATH,
  postPath,
  SEARCH_PATH,
} from '@/lib/seo/site'

import { CoverField } from './components/cover-field'
import { HomepageNewsletter } from './components/homepage-newsletter'
import { Opening } from './components/opening'
import { Pairing } from './components/pairing'
import { EntryRow } from './components/entry-row'
import { TopicSwatches } from './components/topic-swatches'
import { FadeIn } from './components/motion/fade-in'
import { Reveal } from './components/motion/reveal'
import { StaggerChildren, StaggerItem } from './components/motion/stagger'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [settings, homepage, recent, flagged, topics] = await Promise.all([
    getSiteSettings(),
    getHomepage(),
    getRecentPosts(RECENT_QUERY_SIZE),
    getFeaturedPosts(FEATURED_SLOTS),
    getTagsWithCounts(),
  ])

  // The opening takes the newest work; the picks are what is left, in tier
  // order. Excluding by id rather than slicing is what keeps a piece from
  // appearing twice on one page — including the case of a site with a single
  // published post, where the old band and the list below it both showed it.
  const opening = recent.slice(0, OPENING_SLOTS)
  const picks = selectPicks({
    curated: homepage.picks,
    featured: flagged,
    recent,
    exclude: opening.map((post) => post.id),
  })

  // Ghost served a WebSite node here and this page served none, which the
  // 18 Sep crawl comparison caught. The description is the standfirst rather
  // than `metaDescription`: schema.org asks what the site is, which is the
  // editorial answer, not the search snippet.
  const jsonLd = serializeJsonLd(
    buildWebSiteJsonLd({
      siteName: settings.title,
      siteUrl: getSiteUrl(),
      description: settings.description || undefined,
      searchPath: SEARCH_PATH,
    }),
  )

  // What the page actually lists, in the order it lists it: the opening's
  // lead and its runners, then the picks. `WebSite` says what the site is and
  // said nothing about its contents.
  const siteUrl = getSiteUrl()
  const listJsonLd = serializeJsonLd(
    buildItemListJsonLd({
      name: 'Featured articles',
      items: [...opening, ...picks].map((post) => ({
        url: absoluteUrl(postPath(post.slug), siteUrl),
        name: post.title,
      })),
    }),
  )

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: listJsonLd }}
      />
      {/* ── Cover ── */}
      <section className="cover">
        <CoverField />
        <div className="cover__scrim" aria-hidden="true" />
        <div className="container cover__inner">
          <div className="cover__text">
            <FadeIn delay={0}>
              <p className="cover__kicker">
                <span className="cover__swatch" />
                An independent journal
              </p>
            </FadeIn>
            <FadeIn delay={0.08}>
              <h1 className="cover__title">
                What paintings are actually made of
              </h1>
            </FadeIn>
            <FadeIn delay={0.16}>
              <p className="cover__standfirst">{settings.description}</p>
            </FadeIn>
            <FadeIn delay={0.24}>
              <p className="cover__actions">
                <Link href={JOURNAL_PATH} className="button button--on-dark">
                  Read the journal
                </Link>
                <Link href={NEWSLETTER_PATH} className="cover__secondary">
                  Get the newsletter <span aria-hidden="true">&rarr;</span>
                </Link>
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── The opening ──
          The cover carries the publication rather than a story, so the newest
          work needs its own entry point before the curated sections begin. */}
      {opening.length > 0 && (
        <Opening lead={opening[0]!} runners={opening.slice(1)} />
      )}

      {/* ── Featured ── */}
      <section className="section" id="featured">
        <div className="container">
          <Reveal>
            <div className="section__head">
              <div>
                <p className="eyebrow">Editors&rsquo; picks</p>
                <h2>Featured articles</h2>
              </div>
              <p className="section__note">Pieces worth starting with.</p>
            </div>
          </Reveal>

          {picks.length > 0 ? (
            <StaggerChildren>
              {picks.map((post) => (
                <StaggerItem key={post.id}>
                  <EntryRow post={post} />
                </StaggerItem>
              ))}
            </StaggerChildren>
          ) : (
            // Reachable by a reader now, where it was not before. The opening
            // above takes the six newest pieces, so an archive of six or fewer
            // leaves this section genuinely empty — and it used to need an
            // archive of none. A developer reading `pnpm seed:dev` on a live
            // page was always wrong; at this threshold it is also likely.
            <p className="muted">
              Everything published is in the opening above, for now. More will
              appear here as the archive grows.
            </p>
          )}
        </div>
      </section>

      {/* ── Read together ──
          The one module here a query cannot produce: two pieces and the
          editor's reason for reading them in sequence. Absent until all three
          parts are set. */}
      {homepage.pairing && <Pairing pairing={homepage.pairing} />}

      {/* ── Topics ── */}
      {topics.length > 0 && (
        <section className="section topics" id={HOME_TOPICS_ID}>
          <div className="container">
            <Reveal>
              <div className="section__head">
                <div>
                  <p className="eyebrow eyebrow--on-dark">Browse the archive</p>
                  <h2>What we cover</h2>
                </div>
                <p className="section__note">
                  Fill height is each subject&rsquo;s size against the largest
                  one.
                </p>
              </div>
            </Reveal>
            <TopicSwatches topics={topics} />
          </div>
        </section>
      )}

      {/* ── Subscribe ──
          Replaces the site-wide band here; `NewsletterBand` stands down on
          this path so the page carries one email field, not two. */}
      <HomepageNewsletter />
    </main>
  )
}
