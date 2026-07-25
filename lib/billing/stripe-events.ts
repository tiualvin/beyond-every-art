// Reading a Stripe webhook envelope: what happened, to which subscription, and
// whether we care. Pure parsing over untrusted JSON — the signature has already
// been verified by the time anything here runs, but the *shape* is still only
// as trustworthy as Stripe's API version, so nothing is assumed to exist.

import type { StripeSubscription } from './subscription-state'

/** Provider namespace for idempotency keys; RevenueCat joins this later. */
export type BillingProvider = 'stripe' | 'revenuecat'

/**
 * The events this endpoint subscribes to, per docs/SUBSCRIPTION_WEBHOOKS.md.
 * Subscribing narrowly keeps the delivery volume (and the log noise) down;
 * anything outside this list is stored and ignored rather than interpreted.
 */
export const HANDLED_STRIPE_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'checkout.session.completed',
] as const

export type HandledStripeEventType = (typeof HANDLED_STRIPE_EVENT_TYPES)[number]

export function isHandledStripeEventType(
  type: string,
): type is HandledStripeEventType {
  return (HANDLED_STRIPE_EVENT_TYPES as readonly string[]).includes(type)
}

/**
 * What the event asks us to do.
 *
 * - `subscription`: read the subscription's current state (re-fetching it by ID
 *   when the API is configured, which is what makes late delivery harmless) and
 *   write the result
 * - `revoke`: a refund or dispute — take access away now
 * - `ignore`: not a billing signal we act on; the raw event is still stored
 */
export type StripeEventIntent =
  | {
      kind: 'subscription'
      subscriptionID: string
      /** The event's own snapshot, when it carried a subscription object. */
      snapshot: StripeSubscription | null
    }
  | { kind: 'revoke'; customerID: string | null; subscriptionID: string | null }
  | {
      kind: 'ignore'
      why: 'unhandled_type' | 'no_subscription' | 'partial_refund'
    }

export interface StripeEventSummary {
  id: string
  type: string
  /** The event's `created`, as ISO — the ordering key for out-of-order events. */
  createdAt: string
  /** False for test-mode events, which must never touch real accounts. */
  livemode: boolean
  intent: StripeEventIntent
}

type Json = Record<string, unknown>

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Pull a subscription ID out of a value that Stripe may send either as a bare
 * ID or as an expanded object.
 */
function referenceID(value: unknown): string | null {
  const direct = asString(value)
  if (direct) return direct
  return asString(asObject(value)?.id)
}

/**
 * Find the subscription an invoice belongs to.
 *
 * Stripe moved this from `invoice.subscription` to
 * `invoice.parent.subscription_details.subscription` in a 2025 API version;
 * both shapes are in circulation depending on the version an account is pinned
 * to, and reading only one silently drops every renewal on the other.
 */
function invoiceSubscriptionID(invoice: Json): string | null {
  const direct = referenceID(invoice.subscription)
  if (direct) return direct
  const details = asObject(asObject(invoice.parent)?.subscription_details)
  return referenceID(details?.subscription)
}

function subscriptionSnapshot(object: Json): StripeSubscription | null {
  const id = asString(object.id)
  const status = asString(object.status)
  if (!id || !status || !id.startsWith('sub_')) return null
  return object as unknown as StripeSubscription
}

function intentFor(type: string, object: Json): StripeEventIntent {
  if (type.startsWith('customer.subscription.')) {
    const snapshot = subscriptionSnapshot(object)
    const id = snapshot?.id ?? referenceID(object.id)
    if (!id) return { kind: 'ignore', why: 'no_subscription' }
    return { kind: 'subscription', subscriptionID: id, snapshot }
  }

  if (type === 'invoice.paid' || type === 'invoice.payment_failed') {
    const id = invoiceSubscriptionID(object)
    // One-off invoices exist and are not our business.
    if (!id) return { kind: 'ignore', why: 'no_subscription' }
    return { kind: 'subscription', subscriptionID: id, snapshot: null }
  }

  if (type === 'checkout.session.completed') {
    const id = referenceID(object.subscription)
    if (!id) return { kind: 'ignore', why: 'no_subscription' }
    return { kind: 'subscription', subscriptionID: id, snapshot: null }
  }

  if (type === 'charge.refunded') {
    // The event fires for partial refunds too, where `refunded` stays false.
    // Refunding one month of an annual plan is not a reason to cut access, so
    // only a fully refunded charge revokes.
    if (object.refunded !== true)
      return { kind: 'ignore', why: 'partial_refund' }
    return {
      kind: 'revoke',
      customerID: referenceID(object.customer),
      subscriptionID: null,
    }
  }

  if (type === 'charge.dispute.created') {
    // A dispute's object is the dispute; the charge it concerns is nested.
    const charge = asObject(object.charge)
    return {
      kind: 'revoke',
      customerID: referenceID(object.customer) ?? referenceID(charge?.customer),
      subscriptionID: null,
    }
  }

  return { kind: 'ignore', why: 'unhandled_type' }
}

/**
 * Parse a verified Stripe event envelope. Throws when the envelope is not
 * recognisably a Stripe event — a verified body that has no `id` or `type` is a
 * bug or a version change, not something to guess at.
 */
export function summarizeStripeEvent(raw: unknown): StripeEventSummary {
  const event = asObject(raw)
  const id = asString(event?.id)
  const type = asString(event?.type)
  if (!event || !id || !type) {
    throw new Error('Not a Stripe event: missing id or type')
  }

  const created = event.created
  const createdAt =
    typeof created === 'number' && Number.isFinite(created)
      ? new Date(created * 1000).toISOString()
      : new Date(0).toISOString()

  const object = asObject(asObject(event.data)?.object) ?? {}

  return {
    id,
    type,
    createdAt,
    livemode: event.livemode === true,
    intent: isHandledStripeEventType(type)
      ? intentFor(type, object)
      : { kind: 'ignore', why: 'unhandled_type' },
  }
}

/**
 * The idempotency key a billing event is stored under.
 *
 * Namespacing by provider keeps Stripe's `evt_...` and RevenueCat's UUIDs from
 * ever colliding, and a unique index on this one column is what makes duplicate
 * delivery a no-op — the same trick the migration uses with `ghostID`.
 */
export function billingEventKey(provider: BillingProvider, id: string): string {
  return `${provider}:${id}`
}
