import Image from 'next/image'

import type { FeatureListData } from '@/blocks/schema'
import { toMediaImage } from '@/lib/content/media'

// An item's plate is at most the body column on a phone and roughly a third of
// it beside the text on a wide screen. Stated so the browser does not download
// a full-width file to paint a thumbnail.
const ITEM_SIZES = '(max-width: 40rem) 100vw, 16rem'

/**
 * A list of things, each with a title and its own paragraph.
 *
 * Item titles are `<h3>` with anchors rather than styled `<strong>`, which is
 * the difference between a list search engines can address section by section
 * and one long undifferentiated passage. The reasoning is on `FeatureListBlock`
 * in `blocks/schema.ts`.
 *
 * `numbered` picks `<ol>` or `<ul>` rather than styling numbers on, because the
 * choice says whether the order means anything — which is a fact about the
 * content that a reader using a screen reader is entitled to as well.
 */
export function FeatureList({
  data,
  anchors,
  headingAnchor,
}: {
  data: FeatureListData
  /** Page-unique id per item, in item order. From the block registry. */
  anchors: string[]
  /** Page-unique id for the section heading, used only when there is one. */
  headingAnchor: string
}) {
  const items = (data.items ?? []).flatMap((item, index) => {
    const title = item?.title?.trim()
    if (!title) return []
    return [
      {
        title,
        body: item?.body?.trim() || '',
        image: toMediaImage(item?.image),
        id: item?.id,
        index,
      },
    ]
  })

  if (items.length === 0) return null

  const heading = data.heading?.trim()
  const intro = data.intro?.trim()
  // Absent means an older document saved before the field existed; those read
  // as numbered, which is the default an editor would have got.
  const List = data.numbered === false ? 'ul' : 'ol'

  return (
    <section
      className="module module--feature-list feature-list"
      {...(heading ? { 'aria-labelledby': headingAnchor } : {})}
    >
      {heading && (
        <h2
          className="module__heading feature-list__heading"
          id={headingAnchor}
        >
          {heading}
        </h2>
      )}
      {intro && <p className="feature-list__intro">{intro}</p>}
      <List className="feature-list__items">
        {items.map((item) => (
          <li className="feature-list__item" key={item.id ?? item.index}>
            {item.image && (
              <span className="feature-list__frame">
                <Image
                  src={item.image.url}
                  alt={item.image.alt}
                  fill
                  sizes={ITEM_SIZES}
                  style={{ objectFit: 'cover' }}
                />
              </span>
            )}
            <div className="feature-list__text">
              <h3 className="feature-list__title" id={anchors[item.index]}>
                {item.title}
              </h3>
              {item.body && <p className="feature-list__body">{item.body}</p>}
            </div>
          </li>
        ))}
      </List>
    </section>
  )
}
