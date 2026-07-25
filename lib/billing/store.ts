// Persistence for billing events: the idempotent write, and the ordering check
// that keeps a late delivery from overwriting newer state.
//
// The pure decisions live in subscription-state.ts; this module is the thin
// layer that reads the last resolved observation out of Payload, asks that
// logic what to do, and records the answer.

import type { Payload } from 'payload'

import { billingEventKey, type BillingProvider } from './stripe-events'
import {
  applySubscriptionState,
  type AccountSubscriptionState,
} from './subscription-state'

export const BILLING_EVENTS = 'billing-events'

export type ProcessingState =
  'stored' | 'resolved' | 'unresolved' | 'ignored' | 'superseded'

export interface RecordEventInput {
  provider: BillingProvider
  eventID: string
  type: string
  /** The provider's timestamp, ISO. */
  occurredAt: string
  livemode: boolean
  source: 'webhook' | 'reconciliation'
  rawEvent: unknown
  subscriptionID?: string | null
  customerID?: string | null
}

export interface RecordedEvent {
  id: string | number
  /** True when this exact event had already been stored. */
  duplicate: boolean
  processingState: ProcessingState
}

function docID(doc: { id?: unknown }): string | number {
  const { id } = doc
  if (typeof id === 'string' || typeof id === 'number') return id
  throw new Error('Billing event was written without an id')
}

/**
 * Store a provider event, keyed on `provider:eventID`.
 *
 * All three providers deliver at least once, so a redelivery is normal traffic.
 * The lookup handles the common case and the unique index handles the race: two
 * concurrent deliveries of the same event cannot both create a row, and the
 * loser re-reads the winner's instead of failing the request.
 */
export async function recordBillingEvent(
  payload: Payload,
  input: RecordEventInput,
): Promise<RecordedEvent> {
  const eventKey = billingEventKey(input.provider, input.eventID)

  const existing = await findByKey(payload, eventKey)
  if (existing) return existing

  try {
    const created = await payload.create({
      collection: BILLING_EVENTS,
      overrideAccess: true,
      data: {
        eventKey,
        provider: input.provider,
        eventID: input.eventID,
        type: input.type,
        source: input.source,
        occurredAt: input.occurredAt,
        livemode: input.livemode,
        subscriptionID: input.subscriptionID ?? null,
        customerID: input.customerID ?? null,
        processingState: 'stored',
        // Payload's json field wants a JSON-shaped value; the caller's input is
        // exactly that (a parsed provider payload) but arrives as `unknown`
        // because nothing upstream should be trusting its shape.
        rawEvent: input.rawEvent as Record<string, unknown>,
      },
    })
    return {
      id: docID(created),
      duplicate: false,
      processingState: 'stored',
    }
  } catch (error) {
    // Lost a race against a concurrent delivery of the same event, or the
    // unique index rejected it for the same reason. Either way it is stored.
    const raced = await findByKey(payload, eventKey)
    if (raced) return raced
    throw error
  }
}

async function findByKey(
  payload: Payload,
  eventKey: string,
): Promise<RecordedEvent | null> {
  const result = await payload.find({
    collection: BILLING_EVENTS,
    overrideAccess: true,
    depth: 0,
    limit: 1,
    where: { eventKey: { equals: eventKey } },
  })
  const doc = result.docs[0]
  if (!doc) return null
  return {
    id: docID(doc),
    duplicate: true,
    processingState:
      (doc.processingState as ProcessingState | undefined) ?? 'stored',
  }
}

/**
 * The newest state we have already resolved for a subscription, or null when
 * this is the first observation of it. Sorted by the provider's timestamp, not
 * by insertion order: which event arrived first says nothing about which one
 * describes newer state.
 */
export async function latestResolvedState(
  payload: Payload,
  subscriptionID: string,
): Promise<AccountSubscriptionState | null> {
  const result = await payload.find({
    collection: BILLING_EVENTS,
    overrideAccess: true,
    depth: 0,
    limit: 1,
    sort: '-occurredAt',
    where: {
      and: [
        { subscriptionID: { equals: subscriptionID } },
        { processingState: { equals: 'resolved' } },
      ],
    },
  })

  const doc = result.docs[0]
  if (!doc) return null

  const occurredAt = doc.occurredAt
  return {
    subscriptionStatus:
      (doc.resolvedStatus as AccountSubscriptionState['subscriptionStatus']) ??
      'none',
    subscriptionSource: 'stripe',
    subscriptionExpiresAt: toIsoOrNull(doc.expiresAt),
    stripeCustomerID: (doc.customerID as string | null) ?? null,
    stripeSubscriptionID: (doc.subscriptionID as string | null) ?? null,
    observedAt: toIsoOrNull(occurredAt) ?? new Date(0).toISOString(),
    eventID: (doc.eventID as string | null) ?? null,
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return null
}

export interface ApplyResult {
  applied: boolean
  processingState: ProcessingState
  reason?: 'duplicate' | 'stale'
}

/**
 * Record an interpreted observation against a stored event.
 *
 * An observation that describes older state than we already hold is written as
 * `superseded` rather than dropped: the raw event stays queryable, and the
 * admin shows why it did not take effect.
 */
export async function applyObservation(
  payload: Payload,
  eventDocID: string | number,
  incoming: AccountSubscriptionState,
): Promise<ApplyResult> {
  const current = incoming.stripeSubscriptionID
    ? await latestResolvedState(payload, incoming.stripeSubscriptionID)
    : null

  const outcome = applySubscriptionState(current, incoming)
  const processingState: ProcessingState = outcome.applied
    ? 'resolved'
    : 'superseded'

  await payload.update({
    collection: BILLING_EVENTS,
    id: eventDocID,
    overrideAccess: true,
    data: {
      processingState,
      resolvedStatus: incoming.subscriptionStatus,
      expiresAt: incoming.subscriptionExpiresAt,
      customerID: incoming.stripeCustomerID,
      subscriptionID: incoming.stripeSubscriptionID,
      note: outcome.applied
        ? null
        : `Not applied: ${outcome.reason}. Held state came from event ${current?.eventID ?? 'unknown'} at ${current?.observedAt ?? 'unknown'}.`,
    },
  })

  return outcome.applied
    ? { applied: true, processingState }
    : { applied: false, processingState, reason: outcome.reason }
}

/** Mark a stored event as not interpretable, or as nothing we act on. */
export async function markEvent(
  payload: Payload,
  eventDocID: string | number,
  processingState: Extract<ProcessingState, 'unresolved' | 'ignored'>,
  note: string,
): Promise<void> {
  await payload.update({
    collection: BILLING_EVENTS,
    id: eventDocID,
    overrideAccess: true,
    data: { processingState, note },
  })
}
