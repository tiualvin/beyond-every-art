import Image from 'next/image'
import Link from 'next/link'
import { createElement } from 'react'

import { adClientFor } from '@/lib/ads/eligibility'
import { attributionHref } from '@/lib/content/attribution'
import { thumbnailSrc, type MediaImage } from '@/lib/content/media'
import type {
  AuthorSummary,
  PostCard,
  PostDetail,
  RailFallback,
} from '@/lib/content/queries'
import { extractHeadings } from '@/lib/content/toc'
import { formatDate } from '@/lib/format'
import type { Alternates } from '@/lib/i18n/alternates'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import {
  DEFAULT_LOCALE,
  localeConfig,
  localeProp,
  type Locale,
} from '@/lib/i18n/locales'
import { localeAuthorPath, localeTagPath } from '@/lib/seo/site'

import { ArticleRail } from './article-rail'
import { ArticleBody } from './body'
import { LanguageSwitcher } from './language-switcher'
import { MembershipGate } from './membership-gate'
import { FadeIn } from './motion/fade-in'
import { ShareRow } from './share-row'
import { Reveal } from './motion/reveal'
import { StaggerChildren, StaggerItem } from './motion/stagger'

/**
 * The featured image is the LCP element on this template — `priority` below
 * says so — and in the split hero it is 456px, narrower than the reading
 * column rather than wider. One number, because the block is one width at
 * every desktop size. That is the second track of `.article__hero` in
 * `app/globals.css`, and tests/design/article-layout.test.ts recomputes it
 * from the stylesheet so this string cannot quietly stop describing the box it
 * fills.
 */
const FIGURE_SIZES =
  '(max-width: 47rem) 100vw, (max-width: 79.99rem) 44rem, 456px'

/**
 * A post, in two tracks under a split hero.
 *
 * The reading column runs at 704px from 1280 up with a 300px rail beside it,
 * and the block is exactly as wide as the two of them — so no track on the
 * page is empty. Above both, the title and the featured image sit side by side
 * rather than stacked, which brings the first paragraph roughly 440px further
 * up the page and makes the LCP element smaller than the column it replaced.
 *
 * The grid is in `app/globals.css` under "Article layout", and
 * `docs/POST_PAGE_LAYOUT.md` has the measured widths and why the text column
 * did not get any wider.
 */
export function Article({
  post,
  newsletterImage = null,
  railFallback = null,
  inlinePromos = [],
  preview = false,
  alternates = null,
}: {
  post: PostDetail
  /** The rail's signup picture, from `SiteSettings`. */
  newsletterImage?: MediaImage | null
  /** What the rail's ad box holds when no ad is served. */
  railFallback?: RailFallback
  /**
   * What the in-body ad boxes hold when no ad is served: one piece each.
   *
   * Unlike the rail's, these are not an editor's choice. They are the tail of
   * the related-posts pool this page already reads for "Read next", which
   * makes them contextual to the piece for free and different in every slot —
   * and leaves nothing for an editor to keep up to date on every article.
   */
  inlinePromos?: PostCard[]
  preview?: boolean
  /**
   * The languages this article is published in, for the switcher at the top
   * of it. Null — every untranslated article — renders nothing.
   */
  alternates?: Alternates | null
}) {
  const locale: Locale = post.locale ?? DEFAULT_LOCALE
  const t = dictionaryFor(locale)
  const primaryTag = post.tags[0]
  const author = post.authors[0]
  const byline = [
    post.authors.map((a) => a.name).join(', '),
    formatDate(post.publishedAt, localeConfig(locale).dateLocale),
  ]
    .filter(Boolean)
    .join(' · ')

  // Derived here rather than in the route: it is a pure function of the body
  // this component already holds, and no other caller needs it.
  const headings = extractHeadings(post.body)

  // One answer, used by the body and the rail, so the two can never disagree
  // about whether this page carries ads. A restricted teaser carries none —
  // docs/ADVERTISING.md §4.
  const adClient = adClientFor({ restricted: post.restricted })

  // The header's children exactly as they were written before translations:
  // the same values, in the same order, absent ones included. Spread into
  // `createElement` as separate children, so they need no keys — and must not
  // have any: a key is serialized into the RSC payload, which would change the
  // bytes of every untranslated page.
  /* eslint-disable react/jsx-key */
  const headerChildren = [
    primaryTag && (
      <FadeIn delay={0}>
        <Link href={localeTagPath(primaryTag.slug, locale)} className="eyebrow">
          {primaryTag.name}
        </Link>
      </FadeIn>
    ),
    <FadeIn delay={0.08}>
      <h1>{post.title}</h1>
    </FadeIn>,
    post.excerpt && (
      <FadeIn delay={0.15}>
        <p className="article__dek">{post.excerpt}</p>
      </FadeIn>
    ),
    byline && (
      <FadeIn delay={0.2}>
        <p className="article__byline">{byline}</p>
      </FadeIn>
    ),
    <FadeIn delay={0.26}>
      <ShareRow title={post.title} {...localeProp(locale)} />
    </FadeIn>,
  ]
  /* eslint-enable react/jsx-key */

  return (
    <main>
      <article className="article">
        <div className="article__shell">
          <div className="article__hero">
            {/* `createElement` with spread children, so an article in one
                language has exactly the header children it always had: a
                switcher slot that rendered nothing would still leave a `null`
                in the RSC payload, changing every untranslated page's bytes. */}
            {createElement(
              'header',
              { className: 'article__header' },
              ...(alternates
                ? [
                    <LanguageSwitcher
                      key="languages"
                      alternates={alternates}
                      current={locale}
                    />,
                    ...headerChildren,
                  ]
                : headerChildren),
            )}

            {/* The class is on the wrapper because that is what the grid
                sees: `FadeIn` renders a div around the figure, and a width
                cap on the figure itself would be applied to a box already
                held at the measure by its parent. */}
            {post.image && (
              <FadeIn delay={0.25} className="article__figure-frame">
                <FeaturedFigure image={post.image} />
              </FadeIn>
            )}
          </div>

          <div className="article__reading">
            <ArticleBody
              body={post.body}
              className={post.restricted ? 'prose prose--teaser' : 'prose'}
              preview={preview}
              adClient={adClient}
              inlinePromos={inlinePromos}
              locale={locale}
              emptyMessage={post.restricted ? undefined : t.article.emptyBody}
            />

            {post.restricted && (
              <MembershipGate
                visibility={post.visibility}
                {...localeProp(locale)}
              />
            )}

            {post.tags.length > 0 && (
              <Reveal>
                <footer className="article__tags">
                  <StaggerChildren className="article__tags-inner">
                    {post.tags.map((tag) => (
                      <StaggerItem key={tag.slug}>
                        <Link
                          href={localeTagPath(tag.slug, locale)}
                          className="tag-chip"
                        >
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
                <AuthorCard author={author} locale={locale} />
              </Reveal>
            )}
          </div>

          <ArticleRail
            headings={headings}
            newsletterImage={newsletterImage}
            railFallback={railFallback}
            restricted={post.restricted}
            locale={locale}
          />
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
function AuthorCard({
  author,
  locale,
}: {
  author: AuthorSummary
  locale: Locale
}) {
  const [before, after] = dictionaryFor(locale).article.allPiecesBy
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
          <Link
            href={localeAuthorPath(author.slug, locale)}
            className="author-card__link"
          >
            {before}
            {author.name.split(' ')[0]}
            {after}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * The featured image with its caption and credit.
 *
 * Exported because pages render it too — see `app/(frontend)/[slug]/page.tsx`.
 * Keeping one implementation is what stops the two templates drifting on the
 * `sizes` hint, which is the part a reader actually pays for.
 */
export function FeaturedFigure({ image }: { image: MediaImage }) {
  const meta = [image.caption, image.credit].filter(Boolean)
  // Null whenever the record has no link, or has one this site will not put in
  // an href. Either way the credit still renders, as text.
  const creditHref = attributionHref(image.creditURL)

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
            <span className="article__figure-credit">
              {creditHref ? (
                // `noreferrer` is why the referral parameters exist rather
                // than a `Referer` header doing the work: the source is named
                // in the URL, so stripping the header costs the photographer
                // nothing. See `lib/content/attribution.ts`.
                <a href={creditHref} target="_blank" rel="noopener noreferrer">
                  {image.credit}
                </a>
              ) : (
                image.credit
              )}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
