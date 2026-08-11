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

export const FREE_BENEFITS = [
  'Every public piece, in full',
  'The newsletter when a story is ready',
  'No card, no charge',
]

export const PAID_BENEFITS = [
  'Everything in Free',
  'Members-only and subscriber-only pieces',
  'The complete archive',
  'Supports the reporting and the lab time',
]

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
