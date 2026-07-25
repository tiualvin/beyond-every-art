import { describe, expect, it } from 'vitest'

import {
  applySubscriptionState,
  mapStripeStatus,
  stateFromRevocation,
  stateFromSubscription,
  subscriptionCustomerID,
  subscriptionPeriodEnd,
  type AccountSubscriptionState,
  type StripeSubscription,
} from '../../lib/billing/subscription-state'

const PERIOD_END = 1_785_542_400 // 2026-08-01T00:00:00Z

function subscription(
  overrides: Partial<StripeSubscription> = {},
): StripeSubscription {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    current_period_end: PERIOD_END,
    ...overrides,
  }
}

describe('mapStripeStatus', () => {
  it('grants access while Stripe still considers the subscription live', () => {
    expect(mapStripeStatus('active')).toBe('active')
    expect(mapStripeStatus('trialing')).toBe('active')
    // Dunning: the renewal failed and Stripe is retrying. Cutting access here
    // logs out subscribers who are about to pay successfully.
    expect(mapStripeStatus('past_due')).toBe('active')
  })

  it('ends access once Stripe has given up or the subscription is gone', () => {
    expect(mapStripeStatus('unpaid')).toBe('expired')
    expect(mapStripeStatus('canceled')).toBe('expired')
    expect(mapStripeStatus('incomplete_expired')).toBe('expired')
    expect(mapStripeStatus('paused')).toBe('expired')
  })

  it('treats an abandoned first payment as never having subscribed', () => {
    expect(mapStripeStatus('incomplete')).toBe('none')
  })

  it('denies access for any status Stripe adds later', () => {
    expect(mapStripeStatus('something_new')).toBe('expired')
  })
})

describe('subscriptionCustomerID', () => {
  it('reads the customer whether or not it was expanded', () => {
    expect(subscriptionCustomerID(subscription())).toBe('cus_1')
    expect(
      subscriptionCustomerID(subscription({ customer: { id: 'cus_2' } })),
    ).toBe('cus_2')
    expect(subscriptionCustomerID(subscription({ customer: null }))).toBeNull()
  })
})

describe('subscriptionPeriodEnd', () => {
  it('prefers the top-level field', () => {
    expect(subscriptionPeriodEnd(subscription())).toBe(PERIOD_END)
  })

  it('falls back to the subscription items, as newer API versions send it', () => {
    const withItems = subscription({
      current_period_end: undefined,
      items: {
        data: [
          { current_period_end: PERIOD_END - 86_400 },
          { current_period_end: PERIOD_END },
        ],
      },
    })
    expect(subscriptionPeriodEnd(withItems)).toBe(PERIOD_END)
  })

  it('returns null when neither shape carries a period', () => {
    expect(
      subscriptionPeriodEnd(subscription({ current_period_end: null })),
    ).toBeNull()
  })
})

describe('stateFromSubscription', () => {
  const context = { observedAt: '2026-07-25T12:00:00.000Z', eventID: 'evt_1' }

  it('maps an active subscription to the account state', () => {
    expect(stateFromSubscription(subscription(), context)).toEqual({
      subscriptionStatus: 'active',
      subscriptionSource: 'stripe',
      subscriptionExpiresAt: '2026-08-01T00:00:00.000Z',
      stripeCustomerID: 'cus_1',
      stripeSubscriptionID: 'sub_1',
      observedAt: context.observedAt,
      eventID: 'evt_1',
    })
  })

  it('expires a cancelled subscription at the moment it actually ended', () => {
    const cancelled = subscription({
      status: 'canceled',
      ended_at: PERIOD_END - 86_400,
    })
    const state = stateFromSubscription(cancelled, context)
    expect(state.subscriptionStatus).toBe('expired')
    expect(state.subscriptionExpiresAt).toBe('2026-07-31T00:00:00.000Z')
  })

  it('keeps access to the end of a paid period that is set to cancel', () => {
    const ending = subscription({ cancel_at_period_end: true })
    const state = stateFromSubscription(ending, context)
    expect(state.subscriptionStatus).toBe('active')
    expect(state.subscriptionExpiresAt).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('stateFromRevocation', () => {
  it('ends access immediately on a refund or dispute', () => {
    const state = stateFromRevocation(
      { customerID: 'cus_1' },
      { observedAt: '2026-07-25T12:00:00.000Z', eventID: 'evt_refund' },
    )
    expect(state).toEqual({
      subscriptionStatus: 'expired',
      subscriptionSource: 'stripe',
      subscriptionExpiresAt: '2026-07-25T12:00:00.000Z',
      stripeCustomerID: 'cus_1',
      stripeSubscriptionID: null,
      observedAt: '2026-07-25T12:00:00.000Z',
      eventID: 'evt_refund',
    })
  })
})

describe('applySubscriptionState', () => {
  const held: AccountSubscriptionState = stateFromSubscription(subscription(), {
    observedAt: '2026-07-25T12:00:00.000Z',
    eventID: 'evt_renewal',
  })

  it('applies the first observation it ever sees', () => {
    expect(applySubscriptionState(null, held)).toEqual({
      applied: true,
      state: held,
    })
  })

  it('treats a redelivery of the same event as a no-op', () => {
    // Stripe delivers at least once; a retry after a slow response is normal.
    const redelivered = { ...held }
    expect(applySubscriptionState(held, redelivered)).toEqual({
      applied: false,
      reason: 'duplicate',
      state: held,
    })
  })

  it('discards an event that describes older state', () => {
    // The cancellation lands, then the renewal that preceded it turns up late.
    const cancelled = stateFromSubscription(
      subscription({ status: 'canceled', ended_at: PERIOD_END }),
      { observedAt: '2026-07-25T13:00:00.000Z', eventID: 'evt_cancel' },
    )
    const lateRenewal = stateFromSubscription(subscription(), {
      observedAt: '2026-07-25T12:30:00.000Z',
      eventID: 'evt_late',
    })

    const outcome = applySubscriptionState(cancelled, lateRenewal)
    expect(outcome).toEqual({
      applied: false,
      reason: 'stale',
      state: cancelled,
    })
    // The account is not resurrected by the late arrival.
    expect(outcome.state.subscriptionStatus).toBe('expired')
  })

  it('applies a newer observation', () => {
    const newer = stateFromSubscription(
      subscription({ status: 'canceled', ended_at: PERIOD_END }),
      { observedAt: '2026-07-25T13:00:00.000Z', eventID: 'evt_cancel' },
    )
    expect(applySubscriptionState(held, newer)).toEqual({
      applied: true,
      state: newer,
    })
  })

  it('applies the later arrival when two events share a timestamp', () => {
    // Stripe stamps `created` in whole seconds, so a genuine pair can collide.
    const sameSecond = stateFromSubscription(
      subscription({ status: 'past_due' }),
      { observedAt: held.observedAt, eventID: 'evt_other' },
    )
    expect(applySubscriptionState(held, sameSecond).applied).toBe(true)
  })
})
