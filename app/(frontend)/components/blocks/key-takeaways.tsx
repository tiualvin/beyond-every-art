import type { KeyTakeawaysData } from '@/blocks/schema'

const DEFAULT_HEADING = 'Key takeaways'

/**
 * The points a reader should leave with.
 *
 * A `<section>` with a heading and an `<ol>`, and the element choice is the
 * whole point of the module — see `KeyTakeawaysBlock` in `blocks/schema.ts`
 * for why this is not a callout. Nothing here is interactive, so there is no
 * JavaScript and nothing for keyboard or reduced motion to do.
 *
 * The heading is labelled through `aria-labelledby` rather than left implicit,
 * so the section is announced by name when a screen reader lists the landmarks
 * and regions on the page.
 */
export function KeyTakeaways({
  data,
  anchor,
}: {
  data: KeyTakeawaysData
  /** Page-unique id for the heading. Supplied by the block registry. */
  anchor: string
}) {
  const items = (data.items ?? []).flatMap((item) => {
    const text = item?.text?.trim()
    return text ? [{ text, id: item?.id }] : []
  })

  if (items.length === 0) return null

  const heading = data.heading?.trim() || DEFAULT_HEADING

  return (
    <section
      className="module module--takeaways takeaways"
      aria-labelledby={anchor}
    >
      <h2 className="module__heading takeaways__heading" id={anchor}>
        {heading}
      </h2>
      <ol className="takeaways__list">
        {items.map((item, index) => (
          <li className="takeaways__item" key={item.id ?? index}>
            {item.text}
          </li>
        ))}
      </ol>
    </section>
  )
}
