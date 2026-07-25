import { describe, expect, it } from 'vitest'

import {
  reconcile,
  reconciliationEventID,
  summarizeSubscription,
  type MemberBillingRecord,
  type StripeSubscriptionSummary,
} from '../../lib/billing/reconcile'

const PERIOD_END = 1_785_542_400 // 2026-08-01T00:00:00Z

function stripeSub(
  overrides: Partial<StripeSubscriptionSummary> = {},
): StripeSubscriptionSummary {
  return {
    subscriptionID: 'sub_1',
    customerID: 'cus_1',
    stripeStatus: 'active',
    mappedStatus: 'active',
    expiresAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function member(
  overrides: Partial<MemberBillingRecord> = {},
): MemberBillingRecord {
  return {
    id: 1,
    status: 'paid',
    stripeCustomerID: 'cus_1',
    stripeSubscriptionID: 'sub_1',
    ...overrides,
  }
}

describe('summarizeSubscription', () => {
  it('reduces a Stripe subscription to the comparable fields', () => {
    expect(
      summarizeSubscription({
        id: 'sub_1',
        status: 'past_due',
        customer: { id: 'cus_1' },
        current_period_end: PERIOD_END,
      }),
    ).toEqual({
      subscriptionID: 'sub_1',
      customerID: 'cus_1',
      stripeStatus: 'past_due',
      mappedStatus: 'active',
      expiresAt: '2026-08-01T00:00:00.000Z',
    })
  })
})

describe('reconcile', () => {
  it('reports ok when both sides agree', () => {
    const report = reconcile([stripeSub()], [member()])
    expect(report.ok).toBe(true)
    expect(report.differences).toEqual([])
    expect(report).toMatchObject({
      stripeSubscriptions: 1,
      membersWithStripeCustomer: 1,
      payingMembers: 1,
      matched: 1,
    })
  })

  it('ignores free members entirely', () => {
    const report = reconcile(
      [stripeSub()],
      [
        member(),
        {
          id: 2,
          status: 'free',
          stripeCustomerID: null,
          stripeSubscriptionID: null,
        },
      ],
    )
    expect(report.ok).toBe(true)
    expect(report.payingMembers).toBe(1)
  })

  it('flags a live subscription with no member record', () => {
    // Stripe is billing someone we would never grant access to.
    const report = reconcile([stripeSub({ customerID: 'cus_unknown' })], [])
    expect(report.ok).toBe(false)
    expect(report.differences).toHaveLength(1)
    expect(report.differences[0]).toMatchObject({
      kind: 'stripe_subscription_without_member',
      subscriptionID: 'sub_1',
      customerID: 'cus_unknown',
    })
  })

  it('flags a member the export did not mark as paying', () => {
    const report = reconcile([stripeSub()], [member({ status: 'free' })])
    expect(report.differences.map((difference) => difference.kind)).toContain(
      'member_not_marked_paying',
    )
  })

  it('accepts a comped member with a live subscription', () => {
    const report = reconcile([stripeSub()], [member({ status: 'comped' })])
    expect(
      report.differences.filter(
        (difference) => difference.kind === 'member_not_marked_paying',
      ),
    ).toEqual([])
  })

  it('flags a member whose recorded subscription is not the live one', () => {
    const report = reconcile(
      [stripeSub()],
      [member({ stripeSubscriptionID: 'sub_old' })],
    )
    expect(report.ok).toBe(false)
    expect(report.differences[0]).toMatchObject({
      kind: 'subscription_id_mismatch',
      memberIDs: [1],
    })
  })

  it('flags a paying member Stripe no longer bills', () => {
    // The dangerous direction: access granted for a subscription that ended.
    const report = reconcile([], [member()])
    expect(report.differences).toHaveLength(1)
    expect(report.differences[0]).toMatchObject({
      kind: 'paying_member_without_active_subscription',
      memberIDs: [1],
      customerID: 'cus_1',
    })
  })

  it('matches a paying member by subscription ID when the customer differs', () => {
    const report = reconcile(
      [stripeSub({ customerID: 'cus_other' })],
      [member({ stripeCustomerID: null })],
    )
    expect(
      report.differences.map((difference) => difference.kind),
    ).not.toContain('paying_member_without_active_subscription')
  })

  it('flags a paying member the export preserved no Stripe identifiers for', () => {
    const report = reconcile(
      [],
      [member({ stripeCustomerID: null, stripeSubscriptionID: null })],
    )
    expect(report.differences[0]).toMatchObject({
      kind: 'paying_member_without_stripe_ids',
      memberIDs: [1],
    })
  })

  it('flags two member records claiming the same Stripe customer', () => {
    const report = reconcile(
      [stripeSub()],
      [member(), member({ id: 2, stripeSubscriptionID: 'sub_1' })],
    )
    const duplicate = report.differences.find(
      (difference) => difference.kind === 'duplicate_customer_id',
    )
    expect(duplicate).toMatchObject({
      customerID: 'cus_1',
      memberIDs: [1, 2],
    })
  })

  it('never puts personal data in the report', () => {
    const report = reconcile([stripeSub({ customerID: 'cus_x' })], [])
    expect(JSON.stringify(report)).not.toMatch(/@/)
  })

  it('is order-independent, so a rerun produces the same report', () => {
    const subscriptions = [
      stripeSub(),
      stripeSub({ subscriptionID: 'sub_2', customerID: 'cus_2' }),
    ]
    const members = [
      member(),
      member({
        id: 2,
        stripeCustomerID: 'cus_2',
        stripeSubscriptionID: 'sub_2',
      }),
    ]
    expect(reconcile(subscriptions, members)).toEqual(
      reconcile([...subscriptions].reverse(), [...members].reverse()),
    )
  })
})

describe('reconciliationEventID', () => {
  it('is stable while the observed state is unchanged', () => {
    expect(reconciliationEventID(stripeSub())).toBe(
      'reconcile:sub_1:active:2026-08-01T00:00:00.000Z',
    )
    // Same state, same key: a second sweep the same day writes nothing.
    expect(reconciliationEventID(stripeSub())).toBe(
      reconciliationEventID(stripeSub()),
    )
  })

  it('changes when the status or the period does', () => {
    expect(
      reconciliationEventID(stripeSub({ stripeStatus: 'past_due' })),
    ).not.toBe(reconciliationEventID(stripeSub()))
    expect(reconciliationEventID(stripeSub({ expiresAt: null }))).toBe(
      'reconcile:sub_1:active:no-expiry',
    )
  })
})
