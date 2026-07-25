// Comparing Stripe's subscriptions against the migrated Ghost members.
//
// This is the check docs/SUBSCRIPTION_WEBHOOKS.md requires before Ghost is
// switched off ("verify the two sets agree ... and investigate any difference
// before switching off Ghost, not after"), and afterwards it is the daily
// safety net for whatever the webhooks missed while the server was down.
//
// Pure: scripts/reconcile-billing.ts fetches both sides and feeds them in.
// Nothing here reads email addresses or any other personal field — the report
// is written to disk and pasted into issues, so it carries billing identifiers
// only.

import {
  mapStripeStatus,
  subscriptionCustomerID,
  subscriptionPeriodEnd,
  type StripeSubscription,
  type SubscriptionStatus,
} from './subscription-state'

/** One access-granting subscription, reduced to what reconciliation compares. */
export interface StripeSubscriptionSummary {
  subscriptionID: string
  customerID: string | null
  stripeStatus: string
  mappedStatus: SubscriptionStatus
  expiresAt: string | null
}

/** The billing-relevant fields of an archived Ghost member record. */
export interface MemberBillingRecord {
  id: string | number
  /** Ghost's own member status: `free`, `paid`, or `comped`. */
  status: string | null
  stripeCustomerID: string | null
  stripeSubscriptionID: string | null
}

export type DifferenceKind =
  /** Stripe is billing someone we have no member record for. */
  | 'stripe_subscription_without_member'
  /** The member exists but the export did not mark them as paying. */
  | 'member_not_marked_paying'
  /** The member records a different subscription than the live one. */
  | 'subscription_id_mismatch'
  /** The export marked them paying but Stripe has no live subscription. */
  | 'paying_member_without_active_subscription'
  /** The export marked them paying but preserved no Stripe customer ID. */
  | 'paying_member_without_stripe_ids'
  /** Two member records claim the same Stripe customer. */
  | 'duplicate_customer_id'

export interface Difference {
  kind: DifferenceKind
  detail: string
  subscriptionID?: string
  customerID?: string
  memberIDs?: Array<string | number>
}

export interface ReconciliationReport {
  /** True when Stripe and the member archive agree completely. */
  ok: boolean
  stripeSubscriptions: number
  membersWithStripeCustomer: number
  payingMembers: number
  matched: number
  differences: Difference[]
}

/** Reduce a Stripe subscription object to the fields reconciliation compares. */
export function summarizeSubscription(
  subscription: StripeSubscription,
): StripeSubscriptionSummary {
  const periodEnd = subscriptionPeriodEnd(subscription)
  return {
    subscriptionID: subscription.id,
    customerID: subscriptionCustomerID(subscription),
    stripeStatus: subscription.status,
    mappedStatus: mapStripeStatus(subscription.status),
    expiresAt:
      typeof periodEnd === 'number'
        ? new Date(periodEnd * 1000).toISOString()
        : null,
  }
}

/** Ghost statuses that mean "this member was paying at export time". */
function isPaying(member: MemberBillingRecord): boolean {
  return member.status === 'paid'
}

/**
 * Compare Stripe's access-granting subscriptions against the member archive and
 * report every difference. Read-only and order-independent: the same two inputs
 * always produce the same report, which is what makes the script safe to rerun.
 */
export function reconcile(
  subscriptions: StripeSubscriptionSummary[],
  members: MemberBillingRecord[],
): ReconciliationReport {
  const differences: Difference[] = []

  const byCustomer = new Map<string, MemberBillingRecord[]>()
  for (const member of members) {
    const customerID = member.stripeCustomerID
    if (!customerID) continue
    const bucket = byCustomer.get(customerID)
    if (bucket) bucket.push(member)
    else byCustomer.set(customerID, [member])
  }

  for (const [customerID, bucket] of byCustomer) {
    if (bucket.length > 1) {
      differences.push({
        kind: 'duplicate_customer_id',
        customerID,
        memberIDs: bucket.map((member) => member.id),
        detail: `${bucket.length} member records share Stripe customer ${customerID}`,
      })
    }
  }

  const liveSubscriptionIDs = new Set<string>()
  const liveCustomerIDs = new Set<string>()
  let matched = 0

  for (const subscription of subscriptions) {
    liveSubscriptionIDs.add(subscription.subscriptionID)
    const { customerID } = subscription
    if (customerID) liveCustomerIDs.add(customerID)

    const candidates = customerID ? (byCustomer.get(customerID) ?? []) : []
    if (candidates.length === 0) {
      differences.push({
        kind: 'stripe_subscription_without_member',
        subscriptionID: subscription.subscriptionID,
        customerID: customerID ?? undefined,
        detail: `Stripe subscription ${subscription.subscriptionID} (${subscription.stripeStatus}) matches no migrated member`,
      })
      continue
    }

    matched += 1

    for (const member of candidates) {
      if (!isPaying(member) && member.status !== 'comped') {
        differences.push({
          kind: 'member_not_marked_paying',
          subscriptionID: subscription.subscriptionID,
          customerID: customerID ?? undefined,
          memberIDs: [member.id],
          detail: `Member ${member.id} has Ghost status "${member.status ?? 'unset'}" but Stripe subscription ${subscription.subscriptionID} is ${subscription.stripeStatus}`,
        })
      }

      if (
        member.stripeSubscriptionID &&
        member.stripeSubscriptionID !== subscription.subscriptionID
      ) {
        differences.push({
          kind: 'subscription_id_mismatch',
          subscriptionID: subscription.subscriptionID,
          customerID: customerID ?? undefined,
          memberIDs: [member.id],
          detail: `Member ${member.id} records subscription ${member.stripeSubscriptionID}, Stripe's live subscription is ${subscription.subscriptionID}`,
        })
      }
    }
  }

  let payingMembers = 0
  for (const member of members) {
    if (!isPaying(member)) continue
    payingMembers += 1

    if (!member.stripeCustomerID && !member.stripeSubscriptionID) {
      differences.push({
        kind: 'paying_member_without_stripe_ids',
        memberIDs: [member.id],
        detail: `Member ${member.id} is marked paid but the export preserved no Stripe identifiers`,
      })
      continue
    }

    const hasLiveSubscription =
      (member.stripeCustomerID &&
        liveCustomerIDs.has(member.stripeCustomerID)) ||
      (member.stripeSubscriptionID &&
        liveSubscriptionIDs.has(member.stripeSubscriptionID))

    if (!hasLiveSubscription) {
      differences.push({
        kind: 'paying_member_without_active_subscription',
        customerID: member.stripeCustomerID ?? undefined,
        subscriptionID: member.stripeSubscriptionID ?? undefined,
        memberIDs: [member.id],
        detail: `Member ${member.id} is marked paid but Stripe has no active, trialing, or past-due subscription for them`,
      })
    }
  }

  return {
    ok: differences.length === 0,
    stripeSubscriptions: subscriptions.length,
    membersWithStripeCustomer: byCustomer.size,
    payingMembers,
    matched,
    differences,
  }
}

/**
 * The synthetic event ID a reconciliation observation is stored under.
 *
 * Including the observed status and expiry makes a rerun that sees unchanged
 * state collide with the record already written — so re-running the sweep any
 * number of times a day adds nothing, while a real change writes a new row.
 */
export function reconciliationEventID(
  subscription: StripeSubscriptionSummary,
): string {
  return [
    'reconcile',
    subscription.subscriptionID,
    subscription.stripeStatus,
    subscription.expiresAt ?? 'no-expiry',
  ].join(':')
}
