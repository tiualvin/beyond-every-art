import Image from 'next/image'
import Link from 'next/link'

import { thumbnailSrc, type MediaImage } from '@/lib/content/media'
import type { AuthorSummary, PostDetail } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { authorPath, tagPath } from '@/lib/seo/site'

import { ArticleBody } from './body'
import { MembershipGate } from './membership-gate'
import { FadeIn } from './motion/fade-in'
import { ShareRow } from './share-row'
import { Reveal } from './motion/reveal'
import { StaggerChildren, StaggerItem } from './motion/stagger'

/**
 * The featured image keeps the text width — 42rem — at every desktop size.
 * It is the LCP element on this template (`priority` below says so), and the
 * figures that bleed into the notes margin are the ones further down the page,
 * where a larger source costs nothing that a reader waits for.
 */
const FIGURE_SIZES = '(max-width: 47rem) 100vw, 42rem'

/**
 * A post, in tracks rather than one column.
 *
 * The reading column keeps its measure and is pinned to the left of the block
 * from 1280 up; the space that used to sit empty either side of it becomes a
 * notes margin that captions hang in, and a track for the rail. The grid is in
 * `app/globals.css` under "Article layout", and `docs/POST_PAGE_LAYOUT.md` has
 * the measured widths and why the text column did not get any wider.
 */
export function Article({
  post,
  preview = false,
}: {
  post: PostDetail
  preview?: boolean
}) {
  const primaryTag = post.tags[0]
  const author = post.authors[0]
  const byline = [
    post.authors.map((a) => a.name).join(', '),
    formatDate(post.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main>
      <article className="article">
        <div className="article__shell">
          <div className="article__reading">
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
              <FadeIn delay={0.26}>
                <ShareRow title={post.title} />
              </FadeIn>
            </header>

            {/* The class is on the wrapper because that is what the grid
                sees: `FadeIn` renders a div around the figure, and a width
                cap on the figure itself would be applied to a box already
                held at the measure by its parent. */}
            {post.image && (
              <FadeIn delay={0.25} className="article__figure-frame">
                <FeaturedFigure image={post.image} />
              </FadeIn>
            )}

            <ArticleBody
              body={post.body}
              className={post.restricted ? 'prose prose--teaser' : 'prose'}
              preview={preview}
              emptyMessage={
                post.restricted
                  ? undefined
                  : 'This story has no body content yet.'
              }
            />

            {post.restricted && <MembershipGate visibility={post.visibility} />}

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

            {author && (
              <Reveal>
                <AuthorCard author={author} />
              </Reveal>
            )}
          </div>
        </div>
      </article>
    </main>
  )
}

/**
 * Who wrote the piece, below it.
 *
 * The rail byline from the prototype is not ported: the rail exists to hold
 * the specimen card, which this content model has no fields for, and the share
 * controls it also carried already sit in the article header.
 */
function AuthorCard({ author }: { author: AuthorSummary }) {
  return (
    <div className="author-card">
      {author.image && (
        <span className="author-card__avatar">
          <Image
            src={thumbnailSrc(author.image)}
            alt=""
            fill
            sizes="3.5rem"
            style={{ objectFit: 'cover' }}
          />
        </span>
      )}
      <div>
        <h3>{author.name}</h3>
        {author.bio && <p>{author.bio}</p>}
        {author.slug && (
          <Link href={authorPath(author.slug)} className="author-card__link">
            All pieces by {author.name.split(' ')[0]} &rarr;
          </Link>
        )}
      </div>
    </div>
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
