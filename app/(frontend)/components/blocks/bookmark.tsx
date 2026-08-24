import Image from 'next/image'

import type { BookmarkData } from '@/blocks/schema'
import { displayHost, safeHref } from '@/lib/content/embed'
import { linkRel } from '@/lib/content/link-rel'
import { toMediaImage } from '@/lib/content/media'

/**
 * A rich link to something off-site.
 *
 * The whole card is one anchor rather than a card containing a link, so there
 * is a single tab stop and a single target the width of the card — on a phone
 * that is the difference between a comfortable hit area and a thin line of
 * text. The thumbnail is `aria-hidden` and the accessible name comes from the
 * title, so the link is not announced twice.
 *
 * No metadata is fetched: the reasoning is on `BookmarkBlock` in
 * `blocks/schema.ts`. What an editor typed is what a reader sees.
 *
 * A bookmark is the block most likely to point at something commercial — a
 * shop, a publisher, a listing — so it carries the same relationship field the
 * button does, and for the same reason.
 */
export function Bookmark({ data }: { data: BookmarkData }) {
  const href = safeHref(data.url)
  const title = data.title?.trim()
  if (!href || !title) return null

  const description = data.description?.trim()
  const publisher = data.publisher?.trim() || displayHost(href)
  const image = toMediaImage(data.image)

  return (
    <div className="module module--bookmark">
      <a
        className="bookmark"
        href={href}
        rel={linkRel(data.relationship, { external: true })}
        target="_blank"
      >
        <span className="bookmark__text">
          <span className="bookmark__title">{title}</span>
          {description && (
            <span className="bookmark__description">{description}</span>
          )}
          {publisher && <span className="bookmark__host">{publisher}</span>}
        </span>
        {image && (
          <span className="bookmark__thumb" aria-hidden="true">
            <Image
              src={image.url}
              alt=""
              fill
              sizes="(max-width: 40rem) 100vw, 12rem"
              style={{ objectFit: 'cover' }}
            />
          </span>
        )}
      </a>
    </div>
  )
}
