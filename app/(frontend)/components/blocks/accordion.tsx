import { RichText } from '@payloadcms/richtext-lexical/react'

import type { AccordionData } from '@/blocks/schema'
import { isEmptyRichText } from '@/lib/content/richtext'

/**
 * A dropdown of collapsible panels.
 *
 * Built on `<details>`/`<summary>` and ships no JavaScript at all. That is not
 * minimalism for its own sake: the browser's own disclosure widget already has
 * the keyboard behavior, the focus ring, the screen-reader expanded/collapsed
 * state, and the find-in-page integration that a hand-rolled version has to
 * reimplement and usually gets subtly wrong. It also means the module still
 * opens on a page whose JavaScript failed to load.
 *
 * `preview` forces every panel open. Posts and Pages autosave every 800ms and
 * the Live Preview listener refreshes the route on each save, so an editor
 * writing inside a panel would otherwise watch it snap shut under their hands
 * every time they paused typing.
 */
export function Accordion({
  data,
  preview = false,
}: {
  data: AccordionData
  preview?: boolean
}) {
  // A panel with no title has no control to open it, so it is unreachable
  // rather than merely untidy. Dropped instead of rendered blank.
  const items = (data.items ?? []).filter((item) => item?.title?.trim())
  if (items.length === 0) return null

  return (
    <section className="module module--accordion">
      {data.heading?.trim() && (
        <h2 className="module__heading">{data.heading}</h2>
      )}
      <div className="accordion">
        {items.map((item, index) => (
          <details
            key={item.id ?? index}
            className="accordion__item"
            open={preview || Boolean(item.defaultOpen)}
          >
            <summary className="accordion__summary">
              <span className="accordion__title">{item.title}</span>
              <span className="accordion__marker" aria-hidden="true" />
            </summary>
            {!isEmptyRichText(item.content) && (
              <div className="accordion__panel">
                <RichText
                  data={item.content as never}
                  disableContainer
                  disableTextAlign
                />
              </div>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}
