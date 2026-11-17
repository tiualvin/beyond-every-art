import type { PostVisibility } from '@/lib/content/queries'
import { dictionaryFor } from '@/lib/i18n/dictionaries'

/**
 * How a restricted post is marked in a list, or `null` for a public one.
 *
 * Listings include members-only pieces, so a reader who clicks one meets a
 * teaser. Saying so up front is the difference between a gate and a bait.
 */
export function visibilityLabel(
  visibility: PostVisibility,
  locale?: string,
): string | null {
  const t = dictionaryFor(locale).common
  if (visibility === 'members') return t.members
  if (visibility === 'paid') return t.subscribers
  return null
}

// The two memberships offered in the subscribe modal.
//
// These map onto structures the product already has rather than inventing new
// ones: `Members.status` is free | paid | comped, and `Posts.visibility` is
// public | members | paid. Free covers the public tier; paid covers the other
// two levels of post.

export type BillingPeriod = 'monthly' | 'yearly'

export const PRICES: Record<BillingPeriod, number> = {
  monthly: 5,
  yearly: 50,
}

/** Two months free, stated rather than left for the reader to work out. */
export const YEARLY_SAVING = PRICES.monthly * 12 - PRICES.yearly

// The two plans' benefit lists live in `membership-copy.ts`, which the English
// dictionary reads too; re-exported here so callers keep one import.
export { FREE_BENEFITS, PAID_BENEFITS } from './membership-copy'

/**
 * Where the paid plan sends a reader.
 *
 * This app has no checkout of its own: `lib/billing` reads Stripe webhooks and
 * reconciles subscription state, but nothing here creates a session, and the
 * Stripe takeover from Ghost has not happened yet. A Stripe Payment Link is a
 * real checkout that needs no code — paste one per billing period and the paid
 * plan starts working. Until then the modal says so instead of pretending.
 */
export function checkoutUrl(period: BillingPeriod): string | null {
  const url =
    period === 'yearly'
      ? process.env.NEXT_PUBLIC_CHECKOUT_URL_YEARLY
      : process.env.NEXT_PUBLIC_CHECKOUT_URL_MONTHLY
  return url && url.startsWith('https://') ? url : null
}
