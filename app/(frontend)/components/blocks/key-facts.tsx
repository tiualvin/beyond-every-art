import type { KeyFactsData } from '@/blocks/schema'

/**
 * Short facts about the subject, as a description list.
 *
 * `<dl>` because that is what a set of name–value pairs is: a screen reader
 * announces it as a list of so many items and reads each term with its
 * description, where the same facts as a two-column table would be read as a
 * grid to be navigated. Each pair is wrapped in a `<div>`, which HTML allows
 * inside a `<dl>` and which is what lets the pairs lay out as a grid without
 * separating a term from its value.
 *
 * A fact missing either half is dropped rather than shown half-filled. A label
 * with no value is what a draft looks like mid-edit, and "Yield:" followed by
 * nothing reads as a fact the page forgot.
 *
 * The heading is optional because the facts usually sit under a body heading
 * that already introduces them — "The short answer" — and a second heading
 * directly beneath it would say the same thing twice. Without one, the section
 * has no accessible name and so is not announced as a region, which is right:
 * it is then simply part of the section above it.
 */
export function KeyFacts({
  data,
  anchor,
}: {
  data: KeyFactsData
  /** Page-unique id for the heading, when there is one. From the registry. */
  anchor: string
}) {
  const facts = (data.items ?? []).flatMap((item) => {
    const label = item?.label?.trim()
    const value = item?.value?.trim()
    return label && value ? [{ label, value, id: item?.id }] : []
  })

  if (facts.length === 0) return null

  const heading = data.heading?.trim()

  return (
    <section
      className="module module--facts facts"
      aria-labelledby={heading ? anchor : undefined}
    >
      {heading && (
        <h2 className="module__heading facts__heading" id={anchor}>
          {heading}
        </h2>
      )}
      <dl className="facts__list">
        {facts.map((fact, index) => (
          <div className="facts__item" key={fact.id ?? index}>
            <dt className="facts__label">{fact.label}</dt>
            <dd className="facts__value">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
