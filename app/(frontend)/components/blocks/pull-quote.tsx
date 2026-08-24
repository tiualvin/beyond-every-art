import type { PullQuoteData, PullQuoteVariant } from '@/blocks/schema'
import { PULL_QUOTE_VARIANTS } from '@/blocks/schema'
import { safeHref } from '@/lib/content/embed'

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
 *
 * A source URL becomes both the blockquote's `cite` attribute and a link on the
 * attribution. `cite` alone is not enough: browsers do not surface it and
 * readers cannot follow it, so a quotation with a source nobody can reach is
 * only a claim. The attribute is still set, because it is where a parser looks.
 *
 * `safeHref` runs on the stored value even though the field validator refused
 * anything but `https:`. Validators run on write, and a document can arrive
 * from a restore or an import that never went through one — and this value's
 * destination is an anchor `href`, where `javascript:` is script. The same
 * reasoning as `ActionButton`.
 */
export function PullQuote({ data }: { data: PullQuoteData }) {
  const quote = data.quote?.trim()
  if (!quote) return null

  const attribution = data.attribution?.trim()
  const source = safeHref(data.sourceURL)
  // A relative path is a valid `href` and a meaningless `cite`, which wants a
  // URL identifying the source document. Only an absolute one is used there.
  const cite = source?.startsWith('https://') ? source : undefined

  return (
    <figure
      className={`module module--quote pull-quote pull-quote--${toVariant(data.variant)}`}
    >
      <blockquote className="pull-quote__text" cite={cite}>
        <p>{quote}</p>
      </blockquote>
      {attribution && (
        <figcaption className="pull-quote__by">
          {source ? (
            <a
              className="pull-quote__source"
              href={source}
              rel="noopener noreferrer"
              target="_blank"
            >
              {attribution}
            </a>
          ) : (
            attribution
          )}
        </figcaption>
      )}
    </figure>
  )
}
