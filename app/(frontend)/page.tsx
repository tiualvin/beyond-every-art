import Image from 'next/image'
import Link from 'next/link'

import {
  getRecentPosts,
  getSiteSettings,
  getTagsWithCounts,
} from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { JOURNAL_PATH, postPath } from '@/lib/seo/site'

import { StoryCard } from './components/story-card'
import { TopicCard } from './components/topic-card'
import { FadeIn } from './components/motion/fade-in'
import { ImageReveal } from './components/motion/image-reveal'
import { Parallax } from './components/motion/parallax'
import { Reveal } from './components/motion/reveal'
import { ScrollProgress } from './components/motion/scroll-progress'
import { StaggerChildren, StaggerItem } from './components/motion/stagger'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [settings, posts, topics] = await Promise.all([
    getSiteSettings(),
    getRecentPosts(7),
    getTagsWithCounts(6),
  ])

  const [lead, ...rest] = posts
  const featured = rest.length > 0 ? rest : posts
  const [firstFeatured, ...otherFeatured] = featured

  return (
    <main>
      <ScrollProgress />

      {/* ── Hero ── */}
      <section className="hero">
        <div className="container hero__inner hero__split">
          <div className="hero__text">
            <FadeIn delay={0}>
              <p className="eyebrow eyebrow--on-dark">
                Science · Materials · Meaning
              </p>
            </FadeIn>
            <FadeIn delay={0.08}>
              <hr className="hero__rule" />
            </FadeIn>
            <FadeIn delay={0.15}>
              <h1>Art Lives Beyond What We See</h1>
            </FadeIn>
            <FadeIn delay={0.22}>
              <p>{settings.description}</p>
            </FadeIn>
            <FadeIn delay={0.3}>
              <Link href={JOURNAL_PATH} className="button button--primary">
                Explore the Journal
              </Link>
            </FadeIn>
          </div>
          {lead?.image && (
            <FadeIn delay={0.2} className="hero__image-wrap">
              <Parallax className="hero__parallax" offset={30}>
                <Image
                  src={lead.image.url}
                  alt={lead.image.alt}
                  width={lead.image.width ?? 800}
                  height={lead.image.height ?? 600}
                  className="hero__image"
                  priority
                  sizes="(max-width: 800px) 100vw, 50vw"
                />
              </Parallax>
            </FadeIn>
          )}
        </div>
      </section>

      {/* ── Our Perspective ── */}
      <section className="section perspective">
        <div className="container">
          <Reveal>
            <div className="perspective__inner">
              <blockquote className="perspective__quote">
                &ldquo;We explore the unseen forces that shape art&mdash;the
                chemistry of pigments, the physics of light, the stories
                embedded in every material.&rdquo;
              </blockquote>
              <div className="perspective__body">
                <p className="eyebrow">Our Perspective</p>
                <p>
                  {settings.description} We investigate the stories behind
                  creative practice&mdash;from ancient techniques to
                  contemporary exhibitions.
                </p>
                <Link href={JOURNAL_PATH} className="perspective__link">
                  Read the Journal <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Lead story ── */}
      {lead && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-divider" aria-hidden="true">
              <span className="section-divider__dot" />
            </div>
            <Reveal>
              <div className="lead-story">
                {lead.image && (
                  <ImageReveal className="lead-story__image-wrap">
                    <Link
                      href={postPath(lead.slug)}
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      <Image
                        src={lead.image.url}
                        alt={lead.image.alt}
                        width={lead.image.width ?? 800}
                        height={lead.image.height ?? 530}
                        className="lead-story__image"
                        sizes="(max-width: 800px) 100vw, 55vw"
                      />
                    </Link>
                  </ImageReveal>
                )}
                <div className="lead-story__text">
                  {lead.tag && <p className="eyebrow">{lead.tag}</p>}
                  <p
                    className="eyebrow"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Latest
                  </p>
                  <h2 className="lead-story__title">
                    <Link href={postPath(lead.slug)}>{lead.title}</Link>
                  </h2>
                  {lead.excerpt && (
                    <p className="lead-story__excerpt">{lead.excerpt}</p>
                  )}
                  <p className="story-card__meta">
                    {[
                      lead.authors.map((a) => a.name).join(', '),
                      `${lead.readingTime} min read`,
                      formatDate(lead.publishedAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Featured stories (magazine layout) ── */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-divider" aria-hidden="true">
            <span className="section-divider__dot" />
          </div>
          <Reveal>
            <div className="section__head">
              <p className="eyebrow">Featured Stories</p>
              <h2>Ideas. Materials. Inspiration.</h2>
            </div>
          </Reveal>

          {featured.length > 0 ? (
            <StaggerChildren className="card-grid--magazine">
              {firstFeatured && (
                <StaggerItem className="card-grid__feature">
                  <StoryCard post={firstFeatured} variant="feature" />
                </StaggerItem>
              )}
              <div className="card-grid__side">
                {otherFeatured.map((post) => (
                  <StaggerItem key={post.id}>
                    <StoryCard post={post} />
                  </StaggerItem>
                ))}
              </div>
            </StaggerChildren>
          ) : (
            <p className="muted" style={{ textAlign: 'center' }}>
              Stories will appear here once content is published. Run{' '}
              <code>pnpm seed:dev</code> to load sample content locally.
            </p>
          )}
        </div>
      </section>

      {/* ── Explore by Topic ── */}
      {topics.length > 0 && (
        <section className="section topics">
          <div className="container">
            <Reveal>
              <div className="section__head">
                <p className="eyebrow eyebrow--on-dark">Explore by Topic</p>
                <h2 style={{ color: 'var(--color-on-dark)' }}>
                  Discover What Moves You
                </h2>
              </div>
            </Reveal>
            <StaggerChildren className="topics__grid">
              {topics.map((topic) => (
                <StaggerItem key={topic.slug}>
                  <TopicCard topic={topic} />
                </StaggerItem>
              ))}
            </StaggerChildren>
          </div>
        </section>
      )}
    </main>
  )
}
