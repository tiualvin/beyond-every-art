import Image from 'next/image'
import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { visibilityLabel } from '@/lib/membership'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { DEFAULT_LOCALE, localeConfig, type Locale } from '@/lib/i18n/locales'
import { localePostPath } from '@/lib/seo/site'

import { Reveal } from './motion/reveal'
import { thumbnailSrc } from '@/lib/content/media'

const PLATE_SIZES = '(max-width: 46rem) 100vw, (max-width: 64rem) 50vw, 22rem'

/**
 * The three-up "Read next" that closes an article.
 *
 * The row is one `Reveal` rather than a staggered one per card because the
 * cards are laid out on a subgrid: a per-card wrapper would become the grid
 * child, and the plates, titles and meta lines would stop lining up with each
 * other — which is the whole reason the prototype uses subgrid here.
 */
export function ReadNext({
  posts,
  topic,
  locale = DEFAULT_LOCALE,
}: {
  posts: PostCard[]
  topic?: string | null
  /** The page's language; its cards carry their own. */
  locale?: Locale
}) {
  if (posts.length === 0) return null
  const t = dictionaryFor(locale)

  return (
    <section className="read-next">
      <div className="container">
        <Reveal>
          <div className="read-next__head">
            <div>
              <p className="eyebrow">{t.readNext.eyebrow}</p>
              <h2>
                {topic ? t.readNext.moreOn(topic) : t.readNext.moreFromJournal}
              </h2>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="read-next__grid">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={localePostPath(post.slug, post.locale ?? DEFAULT_LOCALE)}
                className="read-next__item"
              >
                <div className="read-next__plate">
                  {post.image && (
                    <Image
                      src={thumbnailSrc(post.image)}
                      alt=""
                      fill
                      sizes={PLATE_SIZES}
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </div>
                <p className="eyebrow">
                  {post.tags[0]?.name ?? t.common.journal}
                </p>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <p className="read-next__meta">
                  {[
                    visibilityLabel(post.visibility, post.locale),
                    t.common.minutes(post.readingTime),
                    formatDate(
                      post.publishedAt,
                      localeConfig(post.locale ?? DEFAULT_LOCALE).dateLocale,
                    ),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
