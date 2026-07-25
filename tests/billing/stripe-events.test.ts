import { describe, expect, it } from 'vitest'

import {
  billingEventKey,
  isHandledStripeEventType,
  summarizeStripeEvent,
} from '../../lib/billing/stripe-events'

const CREATED = 1_785_542_400 // 2026-08-01T00:00:00Z

function event(type: string, object: unknown, overrides = {}) {
  return {
    id: 'evt_1',
    type,
    created: CREATED,
    livemode: true,
    data: { object },
    ...overrides,
  }
}

describe('isHandledStripeEventType', () => {
  it('covers exactly the events the endpoint subscribes to', () => {
    expect(isHandledStripeEventType('customer.subscription.updated')).toBe(true)
    expect(isHandledStripeEventType('charge.refunded')).toBe(true)
    expect(isHandledStripeEventType('customer.created')).toBe(false)
  })
})

describe('summarizeStripeEvent', () => {
  it('reads the envelope', () => {
    const summary = summarizeStripeEvent(
      event('customer.subscription.created', {
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
      }),
    )
    expect(summary.id).toBe('evt_1')
    expect(summary.type).toBe('customer.subscription.created')
    expect(summary.createdAt).toBe('2026-08-01T00:00:00.000Z')
    expect(summary.livemode).toBe(true)
  })

  it('carries the subscription snapshot for subscription events', () => {
    const summary = summarizeStripeEvent(
      event('customer.subscription.deleted', {
        id: 'sub_1',
        status: 'canceled',
        customer: 'cus_1',
      }),
    )
    expect(summary.intent).toEqual({
      kind: 'subscription',
      subscriptionID: 'sub_1',
      snapshot: { id: 'sub_1', status: 'canceled', customer: 'cus_1' },
    })
  })

  it('finds the subscription on both invoice shapes', () => {
    // Older API versions put it on the invoice itself...
    expect(
      summarizeStripeEvent(
        event('invoice.paid', { id: 'in_1', subscription: 'sub_1' }),
      ).intent,
    ).toEqual({ kind: 'subscription', subscriptionID: 'sub_1', snapshot: null })

    // ...newer ones nest it under `parent.subscription_details`.
    expect(
      summarizeStripeEvent(
        event('invoice.payment_failed', {
          id: 'in_2',
          parent: { subscription_details: { subscription: 'sub_2' } },
        }),
      ).intent,
    ).toEqual({ kind: 'subscription', subscriptionID: 'sub_2', snapshot: null })
  })

  it('ignores a one-off invoice that belongs to no subscription', () => {
    expect(
      summarizeStripeEvent(event('invoice.paid', { id: 'in_3' })).intent,
    ).toEqual({ kind: 'ignore', why: 'no_subscription' })
  })

  it('links a completed checkout to its new subscription', () => {
    expect(
      summarizeStripeEvent(
        event('checkout.session.completed', {
          id: 'cs_1',
          subscription: { id: 'sub_9' },
        }),
      ).intent,
    ).toEqual({ kind: 'subscription', subscriptionID: 'sub_9', snapshot: null })
  })

  it('revokes access on a full refund', () => {
    expect(
      summarizeStripeEvent(
        event('charge.refunded', {
          id: 'ch_1',
          customer: 'cus_1',
          refunded: true,
        }),
      ).intent,
    ).toEqual({ kind: 'revoke', customerID: 'cus_1', subscriptionID: null })
  })

  it('leaves access alone on a partial refund', () => {
    // Refunding one month of an annual plan is not a reason to cut access.
    expect(
      summarizeStripeEvent(
        event('charge.refunded', {
          id: 'ch_2',
          customer: 'cus_1',
          refunded: false,
          amount: 5000,
          amount_refunded: 500,
        }),
      ).intent,
    ).toEqual({ kind: 'ignore', why: 'partial_refund' })
  })

  it('revokes access on a dispute, reading the customer off the charge', () => {
    expect(
      summarizeStripeEvent(
        event('charge.dispute.created', {
          id: 'dp_1',
          charge: { id: 'ch_1', customer: 'cus_7' },
        }),
      ).intent,
    ).toEqual({ kind: 'revoke', customerID: 'cus_7', subscriptionID: null })
  })

  it('ignores event types the endpoint does not act on', () => {
    expect(
      summarizeStripeEvent(event('customer.created', { id: 'cus_1' })).intent,
    ).toEqual({ kind: 'ignore', why: 'unhandled_type' })
  })

  it('defaults livemode to false when absent, so test data is never assumed live', () => {
    const summary = summarizeStripeEvent({
      id: 'evt_2',
      type: 'invoice.paid',
      created: CREATED,
      data: { object: { id: 'in_1', subscription: 'sub_1' } },
    })
    expect(summary.livemode).toBe(false)
  })

  it('refuses anything that is not recognisably a Stripe event', () => {
    expect(() => summarizeStripeEvent(null)).toThrow(/Not a Stripe event/)
    expect(() => summarizeStripeEvent({})).toThrow(/Not a Stripe event/)
    expect(() => summarizeStripeEvent({ id: 'evt_1' })).toThrow(
      /Not a Stripe event/,
    )
    expect(() => summarizeStripeEvent('evt_1')).toThrow(/Not a Stripe event/)
  })

  it('survives an event with no data object', () => {
    const summary = summarizeStripeEvent({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      created: CREATED,
    })
    expect(summary.intent).toEqual({ kind: 'ignore', why: 'no_subscription' })
  })
})

describe('billingEventKey', () => {
  it('namespaces the provider so IDs cannot collide', () => {
    expect(billingEventKey('stripe', 'evt_1')).toBe('stripe:evt_1')
    expect(billingEventKey('revenuecat', 'evt_1')).toBe('revenuecat:evt_1')
  })
})
