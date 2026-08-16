import Link from 'next/link'

import type {
  ButtonAlignment,
  ButtonData,
  ButtonVariant,
} from '@/blocks/schema'
import { BUTTON_ALIGNMENTS, BUTTON_VARIANTS } from '@/blocks/schema'
import { safeHref } from '@/lib/content/embed'

function toVariant(value: ButtonData['variant']): ButtonVariant {
  return BUTTON_VARIANTS.includes(value as ButtonVariant)
    ? (value as ButtonVariant)
    : 'primary'
}

function toAlign(value: ButtonData['align']): ButtonAlignment {
  return BUTTON_ALIGNMENTS.includes(value as ButtonAlignment)
    ? (value as ButtonAlignment)
    : 'left'
}

/**
 * A call to action.
 *
 * `safeHref` runs again here even though the field validator already refused
 * anything but a path or `https:`. Validators run on write, and a document can
 * also arrive from a restore, an import, or a direct database edit that never
 * went through one — and the value's destination is an anchor `href`, where a
 * `javascript:` URL is script. A link this cannot vouch for is dropped rather
 * than rendered, so the failure is a missing button, not a live one.
 *
 * Internal paths go through `next/link` for client-side navigation; external
 * ones are a plain anchor with `rel="noopener"`.
 */
export function ActionButton({ data }: { data: ButtonData }) {
  const label = data.label?.trim()
  const href = safeHref(data.href)
  if (!label || !href) return null

  const className = `button button--${toVariant(data.variant)}`
  const internal = href.startsWith('/')

  return (
    <div
      className={`module module--button button-block button-block--${toAlign(data.align)}`}
    >
      {internal ? (
        <Link href={href} className={className}>
          {label}
        </Link>
      ) : (
        <a
          href={href}
          className={className}
          rel="noopener noreferrer"
          target="_blank"
        >
          {label}
        </a>
      )}
    </div>
  )
}
