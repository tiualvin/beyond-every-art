import Image from 'next/image'
import Link from 'next/link'

import {
  getRecentPosts,
  getSiteSettings,
  getTagsWithCounts,
  type PostCard,
} from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import {
  HOME_TOPICS_ID,
  JOURNAL_PATH,
  NEWSLETTER_PATH,
  postPath,
} from '@/lib/seo/site'

import { CoverField } from './components/cover-field'
import { EntryRow } from './components/entry-row'
import { TopicSwatches } from './components/topic-swatches'
import { FadeIn } from './components/motion/fade-in'
import { Reveal } from './components/motion/reveal'
import { StaggerChildren, StaggerItem } from './components/motion/stagger'
import { thumbnailSrc } from '@/lib/content/media'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [settings, posts, topics] = await Promise.all([
    getSiteSettings(),
    getRecentPosts(7),
    getTagsWithCounts(6),
  ])

  const [latest, ...rest] = posts
  const featured = rest.length > 0 ? rest : posts

  return (
    <main>
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

      {/* ── Latest ──
          The cover carries the publication rather than a story, so the newest
          piece needs its own entry point before the curated sections begin. */}
      {latest && <LatestBand post={latest} />}

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

          {featured.length > 0 ? (
            <StaggerChildren>
              {featured.map((post) => (
                <StaggerItem key={post.id}>
                  <EntryRow post={post} />
                </StaggerItem>
              ))}
            </StaggerChildren>
          ) : (
            <p className="muted">
              Stories will appear here once content is published. Run{' '}
              <code>pnpm seed:dev</code> to load sample content locally.
            </p>
          )}
        </div>
      </section>

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
                  Fill height shows how much of the archive each subject
                  accounts for.
                </p>
              </div>
            </Reveal>
            <TopicSwatches topics={topics} />
          </div>
        </section>
      )}
    </main>
  )
}

function LatestBand({ post }: { post: PostCard }) {
  const byline = post.authors.map((author) => author.name).join(', ')
  const meta = [post.publishedAt ? formatDate(post.publishedAt) : null]
    .concat(`${post.readingTime} min`)
    .filter(Boolean)
    .join(' · ')

  return (
    <Link href={postPath(post.slug)} className="latest">
      <div className="container latest__inner">
        <span className="latest__plate">
          {post.image && (
            <Image
              src={thumbnailSrc(post.image)}
              alt=""
              fill
              sizes="(max-width: 56rem) 4.5rem, 6.5rem"
              style={{ objectFit: 'cover' }}
            />
          )}
        </span>

        <div>
          <p className="eyebrow">
            {['Latest', post.tags[0]?.name].filter(Boolean).join(' · ')}
          </p>
          <h2 className="latest__title">{post.title}</h2>
          {post.excerpt && <p className="latest__excerpt">{post.excerpt}</p>}
        </div>

        <p className="latest__meta">
          {byline && <span>{byline}</span>}
          <span>{meta}</span>
        </p>

        <span className="latest__arrow" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
