import Link from 'next/link'

import { getRecentPosts, getSiteSettings } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { postPath } from '@/lib/seo/site'

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
          <p className="eyebrow eyebrow--on-dark">
            Science · Materials · Meaning
          </p>
          <h1>Art Lives Beyond What We See</h1>
          <p>{settings.description}</p>
          <Link href="/journal" className="button button--primary">
            Explore the Journal
          </Link>
        </div>
      </section>

      {lead && (
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
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">Featured Stories</p>
            <h2>Ideas. Materials. Inspiration.</h2>
          </div>

          {featured.length > 0 ? (
            <div className="card-grid">
              {featured.map((post) => (
                <article key={post.id} className="story-card">
                  <Link href={postPath(post.slug)} aria-label={post.title}>
                    <span className="story-card__thumb" />
                  </Link>
                  {post.tag && <p className="eyebrow">{post.tag}</p>}
                  <h3>
                    <Link href={postPath(post.slug)}>{post.title}</Link>
                  </h3>
                  {post.excerpt && (
                    <p className="story-card__excerpt">{post.excerpt}</p>
                  )}
                  <p className="story-card__meta">
                    {formatDate(post.publishedAt)}
                  </p>
                </article>
              ))}
            </div>
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
