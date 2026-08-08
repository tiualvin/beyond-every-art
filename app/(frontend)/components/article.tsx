import Image from 'next/image'
import Link from 'next/link'

import type { MediaImage } from '@/lib/content/media'
import type { PostDetail } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { tagPath } from '@/lib/seo/site'

import { FadeIn } from './motion/fade-in'
import { Reveal } from './motion/reveal'
import { StaggerChildren, StaggerItem } from './motion/stagger'

const FIGURE_SIZES = '(max-width: 47rem) 100vw, 44rem'

export function Article({ post }: { post: PostDetail }) {
  const primaryTag = post.tags[0]
  const byline = [
    post.authors.map((a) => a.name).join(', '),
    formatDate(post.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main>
      <article className="article">
        <div className="container article__inner">
          <header className="article__header">
            {primaryTag && (
              <FadeIn delay={0}>
                <Link href={tagPath(primaryTag.slug)} className="eyebrow">
                  {primaryTag.name}
                </Link>
              </FadeIn>
            )}
            <FadeIn delay={0.08}>
              <h1>{post.title}</h1>
            </FadeIn>
            {post.excerpt && (
              <FadeIn delay={0.15}>
                <p className="article__dek">{post.excerpt}</p>
              </FadeIn>
            )}
            {byline && (
              <FadeIn delay={0.2}>
                <p className="article__byline">{byline}</p>
              </FadeIn>
            )}
          </header>

          {post.image && (
            <FadeIn delay={0.25}>
              <FeaturedFigure image={post.image} />
            </FadeIn>
          )}

          {post.bodyHtml ? (
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            <p className="muted">This story has no body content yet.</p>
          )}

          {post.tags.length > 0 && (
            <Reveal>
              <footer className="article__tags">
                <StaggerChildren className="article__tags-inner">
                  {post.tags.map((tag) => (
                    <StaggerItem key={tag.slug}>
                      <Link href={tagPath(tag.slug)} className="tag-chip">
                        {tag.name}
                      </Link>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              </footer>
            </Reveal>
          )}
        </div>
      </article>
    </main>
  )
}

function FeaturedFigure({ image }: { image: MediaImage }) {
  const meta = [image.caption, image.credit].filter(Boolean)

  return (
    <figure className="article__figure">
      {image.width && image.height ? (
        <Image
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={FIGURE_SIZES}
          priority
        />
      ) : (
        <span className="article__figure-fill">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes={FIGURE_SIZES}
            priority
          />
        </span>
      )}
      {meta.length > 0 && (
        <figcaption>
          {image.caption}
          {image.credit && (
            <span className="article__figure-credit">{image.credit}</span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
