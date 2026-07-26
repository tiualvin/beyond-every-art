import Image from 'next/image'
import Link from 'next/link'

import type { MediaImage } from '@/lib/content/media'
import type { PostDetail } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { tagPath } from '@/lib/seo/site'

// `.article__inner` is capped at 44rem, so the featured image never renders
// wider than that outside of the full-bleed phone case.
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
              <Link href={tagPath(primaryTag.slug)} className="eyebrow">
                {primaryTag.name}
              </Link>
            )}
            <h1>{post.title}</h1>
            {post.excerpt && <p className="article__dek">{post.excerpt}</p>}
            {byline && <p className="article__byline">{byline}</p>}
          </header>

          {post.image && <FeaturedFigure image={post.image} />}

          {post.bodyHtml ? (
            // First-party editorial content: either HTML built from the
            // Lexical body by `toBodyHtml`, or the preserved Ghost markup it
            // falls back to. Both are authored by trusted editors.
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            <p className="muted">This story has no body content yet.</p>
          )}

          {post.tags.length > 0 && (
            <footer className="article__tags">
              {post.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={tagPath(tag.slug)}
                  className="tag-chip"
                >
                  {tag.name}
                </Link>
              ))}
            </footer>
          )}
        </div>
      </article>
    </main>
  )
}

/**
 * The featured image at its own aspect ratio — an art journal must not crop
 * artwork to a house shape. A record with no stored dimensions cannot reserve
 * intrinsic space, so it falls back to a fixed editorial ratio instead of
 * collapsing to nothing.
 */
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
