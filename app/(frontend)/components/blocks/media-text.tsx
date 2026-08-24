import { RichText } from '@payloadcms/richtext-lexical/react'
import Image from 'next/image'

import type { MediaSide, MediaTextData } from '@/blocks/schema'
import { MEDIA_SIDES } from '@/blocks/schema'
import { toMediaImage } from '@/lib/content/media'
import { isEmptyRichText } from '@/lib/content/richtext'

// Full width on a phone, a little under half the body column beside the text.
const SIZES = '(max-width: 47rem) 100vw, 21rem'

function toSide(value: MediaTextData['imageSide']): MediaSide {
  return MEDIA_SIDES.includes(value as MediaSide)
    ? (value as MediaSide)
    : 'left'
}

/**
 * An image beside a passage of text.
 *
 * The image always comes first in the markup and `imageSide` moves it with CSS
 * `order`, so the sequence a screen reader announces and a crawler reads is the
 * same in both directions. Alternating rows down a page is a visual rhythm; it
 * should not quietly reorder the content for everyone not looking at it.
 *
 * A missing or unpopulated upload drops the figure and keeps the text, rather
 * than rendering an empty frame — that is the normal state of a draft mid-edit
 * and of any query run at a depth too shallow to populate the relation.
 */
export function MediaText({
  data,
  anchor,
}: {
  data: MediaTextData
  /** Page-unique id for the heading, used only when there is one. */
  anchor: string
}) {
  const image = toMediaImage(data.image)
  const hasBody = !isEmptyRichText(data.body)
  if (!image && !hasBody) return null

  const heading = data.heading?.trim()

  return (
    <section
      className={`module module--media-text media-text media-text--${toSide(data.imageSide)}`}
      {...(heading ? { 'aria-labelledby': anchor } : {})}
    >
      {image && (
        <div className="media-text__figure">
          <span className="media-text__frame">
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes={SIZES}
              style={{ objectFit: 'cover' }}
            />
          </span>
          {image.caption && (
            <p className="media-text__caption">{image.caption}</p>
          )}
        </div>
      )}
      <div className="media-text__body">
        {heading && (
          <h2 className="module__heading media-text__heading" id={anchor}>
            {heading}
          </h2>
        )}
        {hasBody && (
          <RichText
            data={data.body as never}
            disableContainer
            disableTextAlign
          />
        )}
      </div>
    </section>
  )
}
