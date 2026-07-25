import type { CollectionConfig } from 'payload'

import { adminOnly, isAdmin } from '../access/roles'

/**
 * Durable log of everything a billing provider has told us.
 *
 * Three jobs, per docs/SUBSCRIPTION_WEBHOOKS.md:
 *
 * 1. **Idempotency.** `eventKey` is `provider:eventID` with a unique index, so
 *    a redelivered event cannot be recorded twice — the constraint does the
 *    deduplication, the same trick the migration uses with `ghostID`.
 * 2. **Replay.** `rawEvent` keeps what actually arrived, not only our reading
 *    of it, which is the cheapest way to recover from a bug in the handler.
 * 3. **Continuity.** Until the `accounts` collection exists (Phase 2, see
 *    docs/ACCOUNT_MODEL.md) there is nothing to write a subscription state
 *    onto. Every event is still captured and resolved here, so the state that
 *    accrues between the Stripe takeover and the paywall is not lost.
 *
 * Written only by the webhook route and the reconciliation script, both through
 * the Local API with `overrideAccess`. Administrators can read it; nobody else
 * can, because raw provider payloads carry customer identifiers.
 */
export const BillingEvents: CollectionConfig = {
  slug: 'billing-events',
  admin: {
    group: 'Billing',
    hidden: ({ user }) => !isAdmin(user),
    useAsTitle: 'eventKey',
    defaultColumns: ['eventKey', 'type', 'occurredAt', 'processingState'],
    description:
      'Raw subscription events from Stripe (and later RevenueCat), kept for idempotency and replay.',
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'eventKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          'provider:eventID. The unique index here is what makes duplicate delivery a no-op.',
      },
    },
    {
      name: 'provider',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'stripe',
      options: ['stripe', 'revenuecat'],
    },
    { name: 'eventID', type: 'text', required: true },
    { name: 'type', type: 'text', required: true },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'webhook',
      options: ['webhook', 'reconciliation'],
    },
    {
      name: 'occurredAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        description:
          "The provider's own timestamp. Ordering key: never apply an older event on top of newer state.",
      },
    },
    {
      name: 'livemode',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'False for test-mode events.' },
    },
    { name: 'subscriptionID', type: 'text', index: true },
    { name: 'customerID', type: 'text', index: true },
    {
      name: 'processingState',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'stored',
      options: [
        // Persisted, not yet interpreted.
        'stored',
        // Interpreted; resolvedStatus and expiresAt below are current.
        'resolved',
        // Could not be interpreted (e.g. Stripe unreachable). The
        // reconciliation sweep is what closes this gap.
        'unresolved',
        // Not a billing signal we act on.
        'ignored',
        // Arrived after newer state for the same subscription; not applied.
        'superseded',
      ],
    },
    {
      name: 'resolvedStatus',
      type: 'select',
      options: ['active', 'expired', 'none'],
      admin: {
        description: "Our account vocabulary, not the provider's.",
      },
    },
    { name: 'expiresAt', type: 'date' },
    {
      name: 'note',
      type: 'textarea',
      admin: {
        description: 'Why an event is unresolved, ignored, or superseded.',
      },
    },
    {
      name: 'rawEvent',
      type: 'json',
      required: true,
      admin: {
        description:
          'The payload exactly as received. Never expose publicly; it carries customer identifiers.',
      },
    },
  ],
}
