// Mapping Stripe's subscription vocabulary onto the single subscription state
// an account carries (docs/ACCOUNT_MODEL.md), plus the ordering rules that make
// duplicate and out-of-order webhook deliveries harmless.
//
// Everything here is pure: no I/O, no Payload, no fetch. The route handler and
// the reconciliation script both feed it provider data and act on the answer.

/** The merged answer stored on an account. `none` means never subscribed. */
export type SubscriptionStatus = 'active' | 'expired' | 'none'

export type SubscriptionSource = 'stripe' | 'apple' | 'google' | 'comped'

/** Stripe's `subscription.status` values. */
export const STRIPE_SUBSCRIPTION_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const

export type StripeSubscriptionStatus =
  (typeof STRIPE_SUBSCRIPTION_STATUSES)[number]

/**
 * The Stripe statuses that grant access. `past_due` is deliberately included:
 * it means the renewal charge failed and Stripe is still retrying (dunning).
 * Cutting access there logs out subscribers who are about to pay successfully,
 * the same mistake as revoking access during a Play grace period. Access ends
 * when Stripe gives up and moves the subscription to `unpaid` or `canceled`.
 */
export const ACCESS_GRANTING_STRIPE_STATUSES: readonly StripeSubscriptionStatus[] =
  ['active', 'trialing', 'past_due']

export function isStripeSubscriptionStatus(
  value: string,
): value is StripeSubscriptionStatus {
  return (STRIPE_SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

/**
 * Map a Stripe subscription status onto our account state.
 *
 * - `active`, `trialing`, `past_due` → `active` (see above)
 * - `incomplete` → `none`: checkout began but the first payment never
 *   completed, so this person has never been a subscriber
 * - everything else, including any status Stripe adds later → `expired`:
 *   no access, and not the same thing as never having subscribed
 */
export function mapStripeStatus(status: string): SubscriptionStatus {
  if ((ACCESS_GRANTING_STRIPE_STATUSES as readonly string[]).includes(status)) {
    return 'active'
  }
  if (status === 'incomplete') return 'none'
  return 'expired'
}

/** The subset of a Stripe subscription object this codebase reads. */
export interface StripeSubscription {
  id: string
  status: string
  /** Customer ID, or an expanded customer object. */
  customer: string | { id?: string } | null
  current_period_end?: number | null
  cancel_at_period_end?: boolean | null
  ended_at?: number | null
  canceled_at?: number | null
  items?: {
    data?: Array<{ current_period_end?: number | null }>
  } | null
}

/** Resolve the customer ID whether or not the field was expanded. */
export function subscriptionCustomerID(
  subscription: StripeSubscription,
): string | null {
  const { customer } = subscription
  if (typeof customer === 'string') return customer || null
  if (customer && typeof customer === 'object') return customer.id ?? null
  return null
}

/**
 * The end of the paid-for period, in unix seconds.
 *
 * Stripe moved `current_period_end` off the subscription and onto each
 * subscription item in a 2025 API version, so both shapes are in circulation
 * depending on the version an account is pinned to. Read the top-level field
 * when present, otherwise take the latest period end across the items.
 */
export function subscriptionPeriodEnd(
  subscription: StripeSubscription,
): number | null {
  if (typeof subscription.current_period_end === 'number') {
    return subscription.current_period_end
  }
  const itemEnds = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number')
  if (itemEnds.length === 0) return null
  return Math.max(...itemEnds)
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) {
    return null
  }
  return new Date(unixSeconds * 1000).toISOString()
}

/**
 * The subscription half of an account record, as derived from one provider
 * observation. `observedAt` is the provider's timestamp for that observation
 * (the event's `created`, or the moment of a reconciliation read) and is the
 * ordering key — never the local clock, which says nothing about which of two
 * deliveries reflects newer state.
 */
export interface AccountSubscriptionState {
  subscriptionStatus: SubscriptionStatus
  subscriptionSource: SubscriptionSource
  subscriptionExpiresAt: string | null
  stripeCustomerID: string | null
  stripeSubscriptionID: string | null
  /** ISO timestamp of the provider observation this state came from. */
  observedAt: string
  /** Provider event ID, when the observation was a webhook delivery. */
  eventID: string | null
}

export interface ObservationContext {
  observedAt: string
  eventID?: string | null
}

/** Derive account state from a Stripe subscription object. */
export function stateFromSubscription(
  subscription: StripeSubscription,
  context: ObservationContext,
): AccountSubscriptionState {
  const status = mapStripeStatus(subscription.status)
  // A cancelled subscription expires when it actually ended; a live one runs to
  // the end of the period already paid for.
  const expiresAt =
    status === 'active'
      ? toIso(subscriptionPeriodEnd(subscription))
      : (toIso(subscription.ended_at) ??
        toIso(subscriptionPeriodEnd(subscription)))

  return {
    subscriptionStatus: status,
    subscriptionSource: 'stripe',
    subscriptionExpiresAt: expiresAt,
    stripeCustomerID: subscriptionCustomerID(subscription),
    stripeSubscriptionID: subscription.id,
    observedAt: context.observedAt,
    eventID: context.eventID ?? null,
  }
}

/**
 * Derive account state from a refund or dispute: access ends immediately.
 *
 * Stripe can refund a charge without the subscription changing status, and a
 * disputed charge is money already gone. Neither shows up as a subscription
 * lifecycle event, so a refunded subscriber keeps access unless this is handled
 * on its own.
 */
export function stateFromRevocation(
  input: { customerID: string | null; subscriptionID?: string | null },
  context: ObservationContext,
): AccountSubscriptionState {
  return {
    subscriptionStatus: 'expired',
    subscriptionSource: 'stripe',
    subscriptionExpiresAt: context.observedAt,
    stripeCustomerID: input.customerID,
    stripeSubscriptionID: input.subscriptionID ?? null,
    observedAt: context.observedAt,
    eventID: context.eventID ?? null,
  }
}

export type ApplyOutcome =
  | { applied: true; state: AccountSubscriptionState }
  | {
      applied: false
      reason: 'duplicate' | 'stale'
      state: AccountSubscriptionState
    }

/**
 * Decide whether an incoming observation should replace the state we hold.
 *
 * All three providers deliver at least once and in no guaranteed order, so both
 * of these arrive in normal operation:
 *
 * - the same event twice (a retry after a slow response) → `duplicate`, and the
 *   held state is returned unchanged, which is what makes redelivery a no-op
 * - a cancellation followed by the renewal that preceded it → `stale`, and the
 *   older observation is discarded rather than resurrecting dead state
 *
 * Observations sharing a timestamp are applied last-writer-wins: Stripe stamps
 * `created` in whole seconds, so a genuine pair of changes can share one.
 */
export function applySubscriptionState(
  current: AccountSubscriptionState | null,
  incoming: AccountSubscriptionState,
): ApplyOutcome {
  if (!current) return { applied: true, state: incoming }

  if (incoming.eventID && incoming.eventID === current.eventID) {
    return { applied: false, reason: 'duplicate', state: current }
  }

  if (Date.parse(incoming.observedAt) < Date.parse(current.observedAt)) {
    return { applied: false, reason: 'stale', state: current }
  }

  return { applied: true, state: incoming }
}
