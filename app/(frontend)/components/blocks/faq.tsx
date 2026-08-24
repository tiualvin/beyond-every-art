import { RichText } from '@payloadcms/richtext-lexical/react'

import type { FaqData } from '@/blocks/schema'
import { isEmptyRichText } from '@/lib/content/richtext'

const DEFAULT_HEADING = 'Frequently asked questions'

/**
 * Questions and their answers.
 *
 * Built on `<details>`/`<summary>` for the same reasons the dropdown is — the
 * browser's disclosure widget already has the keyboard behavior, the announced
 * expanded state and find-in-page integration — but with two differences that
 * matter and are not visual.
 *
 * Each question is an `<h3>` inside its `<summary>`, so the questions appear in
 * the document outline instead of being anonymous bold text; and each carries
 * an anchor, so an answer can be linked to on its own. Collapsed text is still
 * indexed, so nothing is hidden from search by being closed.
 *
 * `preview` forces every panel open, because autosave refreshes the Live
 * Preview route roughly every 800ms and an editor writing inside a closed
 * panel would watch it snap shut under their hands.
 */
export function Faq({
  data,
  anchors,
  headingAnchor,
  preview = false,
}: {
  data: FaqData
  /** Page-unique id per question, in item order. From the block registry. */
  anchors: string[]
  /** Page-unique id for the section heading. */
  headingAnchor: string
  preview?: boolean
}) {
  // A question with no text has no control to open it, so it is unreachable
  // rather than merely untidy. Dropped, exactly as an untitled dropdown panel
  // is — and the anchor list is indexed alongside so the two stay in step.
  const items = (data.items ?? []).flatMap((item, index) => {
    const question = item?.question?.trim()
    if (!question) return []
    return [{ question, answer: item?.answer, id: item?.id, index }]
  })

  if (items.length === 0) return null

  const heading = data.heading?.trim() || DEFAULT_HEADING

  return (
    <section className="module module--faq faq" aria-labelledby={headingAnchor}>
      <h2 className="module__heading faq__heading" id={headingAnchor}>
        {heading}
      </h2>
      <div className="faq__items">
        {items.map((item) => (
          <details
            key={item.id ?? item.index}
            className="faq__item"
            open={preview}
          >
            <summary className="faq__summary">
              <h3 className="faq__question" id={anchors[item.index]}>
                {item.question}
              </h3>
              <span className="faq__marker" aria-hidden="true" />
            </summary>
            {!isEmptyRichText(item.answer) && (
              <div className="faq__answer">
                <RichText
                  data={item.answer as never}
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
