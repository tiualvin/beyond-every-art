import Image from 'next/image'

import type { GalleryData, GalleryLayout } from '@/blocks/schema'
import { GALLERY_LAYOUTS } from '@/blocks/schema'
import { toMediaImage } from '@/lib/content/media'

// A grid cell is at most half the body column on a phone and a third of it on
// a wide screen. Stated so the browser does not download a full-width file to
// paint a thumbnail.
//
// A gallery is one of the blocks allowed out of the text column, so the widths
// past 1280 are the bleed widths from `app/globals.css`, not the measure: 828
// at 1280, 980 at 1440, 1140 at 1600 and above. A `sizes` still claiming 44rem
// would have the browser fetch the 750w source for a 1140px frame and upscale
// it — soft, on exactly the material photography this site is about.
const GRID_SIZES = '(max-width: 40rem) 50vw, (max-width: 64rem) 33vw, 24rem'
const ROW_SIZES =
  '(max-width: 60rem) 100vw, (max-width: 80rem) 56rem, (max-width: 90rem) 828px, (max-width: 100rem) 980px, 1140px'

function toLayout(value: GalleryData['layout']): GalleryLayout {
  return GALLERY_LAYOUTS.includes(value as GalleryLayout)
    ? (value as GalleryLayout)
    : 'grid'
}

/**
 * A set of images shown together.
 *
 * A grid, not a carousel — see the note on `GalleryBlock` in `blocks/schema.ts`
 * for why. Nothing here is interactive, so there is no JavaScript, no state to
 * reset under Live Preview's autosave, and nothing to do for keyboard or
 * reduced motion beyond what the images already are.
 *
 * An item whose upload is missing or unpopulated is dropped rather than
 * rendered as a broken frame. That is the normal state of a draft mid-edit and
 * of any query that came back at a depth too shallow to populate the relation.
 */
export function Gallery({ data }: { data: GalleryData }) {
  const items = (data.items ?? []).flatMap((item) => {
    const image = toMediaImage(item?.image)
    if (!image) return []
    return [{ image, caption: item?.caption?.trim() || '', id: item?.id }]
  })

  if (items.length === 0) return null

  const layout = toLayout(data.layout)
  const caption = data.caption?.trim()
  const sizes = layout === 'grid' ? GRID_SIZES : ROW_SIZES

  return (
    <figure className={`module module--gallery gallery gallery--${layout}`}>
      <div className="gallery__items">
        {items.map((item, index) => (
          <figure className="gallery__item" key={item.id ?? index}>
            <span className="gallery__frame">
              <Image
                src={item.image.url}
                alt={item.image.alt}
                fill
                sizes={sizes}
                style={{ objectFit: 'cover' }}
              />
            </span>
            {item.caption && (
              <figcaption className="gallery__item-caption">
                {item.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {caption && (
        <figcaption className="gallery__caption">{caption}</figcaption>
      )}
    </figure>
  )
}
