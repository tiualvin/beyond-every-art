import type { PullQuoteData, PullQuoteVariant } from '@/blocks/schema'
import { PULL_QUOTE_VARIANTS } from '@/blocks/schema'

const DEFAULT_VARIANT: PullQuoteVariant = 'centered'

/**
 * The stored variant, or the default when it is missing or unrecognised.
 *
 * A variant is part of the class name, so an unchecked value would put whatever
 * is in the document into the markup. Documents restored from a backup taken
 * before a variant was renamed are the realistic way that happens.
 */
function toVariant(value: PullQuoteData['variant']): PullQuoteVariant {
  return PULL_QUOTE_VARIANTS.includes(value as PullQuoteVariant)
    ? (value as PullQuoteVariant)
    : DEFAULT_VARIANT
}

/**
 * A quotation lifted out of the flow of the body.
 *
 * `<figure>` wrapping `<blockquote>` rather than a bare blockquote, because the
 * attribution is a caption *about* the quotation, not part of what was said —
 * putting it inside the blockquote attributes words to the speaker that they
 * never uttered, including for a screen reader.
 */
export function PullQuote({ data }: { data: PullQuoteData }) {
  const quote = data.quote?.trim()
  if (!quote) return null

  const attribution = data.attribution?.trim()

  return (
    <figure
      className={`module module--quote pull-quote pull-quote--${toVariant(data.variant)}`}
    >
      <blockquote className="pull-quote__text">
        <p>{quote}</p>
      </blockquote>
      {attribution && (
        <figcaption className="pull-quote__by">{attribution}</figcaption>
      )}
    </figure>
  )
}
