import Link from 'next/link'

import { getRecentPosts, getSiteSettings } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { JOURNAL_PATH, postPath } from '@/lib/seo/site'

import { StoryCard } from './components/story-card'
import { FadeIn } from './components/motion/fade-in'
import { Reveal } from './components/motion/reveal'
import { StaggerChildren, StaggerItem } from './components/motion/stagger'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [settings, posts] = await Promise.all([
    getSiteSettings(),
    getRecentPosts(7),
  ])

  const [lead, ...rest] = posts
  const featured = rest.length > 0 ? rest : posts

  return (
    <main>
      <section className="hero">
        <div className="container hero__inner">
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
      </section>

      {lead && (
        <Reveal>
          <section className="section">
            <div className="container">
              <p className="eyebrow">Latest</p>
              <h2
                style={{
                  fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                  maxWidth: '40rem',
                }}
              >
                <Link href={postPath(lead.slug)}>{lead.title}</Link>
              </h2>
              {lead.excerpt && (
                <p className="muted" style={{ maxWidth: '40rem' }}>
                  {lead.excerpt}
                </p>
              )}
              <p className="story-card__meta">
                {[
                  lead.authors.map((a) => a.name).join(', '),
                  formatDate(lead.publishedAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </section>
        </Reveal>
      )}

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
            <StaggerChildren className="card-grid">
              {featured.map((post) => (
                <StaggerItem key={post.id}>
                  <StoryCard post={post} />
                </StaggerItem>
              ))}
            </StaggerChildren>
          ) : (
            <p className="muted" style={{ textAlign: 'center' }}>
              Stories will appear here once content is published. Run{' '}
              <code>pnpm seed:dev</code> to load sample content locally.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
