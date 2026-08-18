# Subscription Webhooks

How the server learns that someone's subscription started, renewed, lapsed, or
was refunded — from Stripe (website), the App Store, and Google Play.

The account model this feeds is in [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md): every
source below resolves to one `subscriptionStatus` on one account record.

**Stripe is the urgent one.** Ghost currently receives Stripe's webhooks, and
when Ghost is switched off, nothing does — see
[Taking over from Ghost](#taking-over-from-ghost), which also records what the
live Stripe account actually contained when last checked (as of 2026-08-18: no
subscribers, so the handover is about not losing _future_ events rather than
rescuing existing ones). The App Store and Play
sections apply when the apps ship.

External specifics below (retry schedules, deadlines, free-tier limits) were
accurate when written and are exactly the kind of detail providers change.
Confirm against the provider's own documentation before implementing.

## Principles that apply to all three

1. **The server decides, never the device.** A client can say "I just bought
   this"; only a verified provider event or an API lookup can make it true.
2. **A notification is a hint, not state.** Treat every webhook as "something
   changed for this subscription" and read the current state back from the
   provider's API. This is mandatory on Google Play, strongly advised on Apple,
   and the safest habit on Stripe.
3. **Be idempotent, keyed on the provider's event ID.** All three deliver
   at least once, which means duplicates are normal, not exceptional.
   **Write the idempotency record and the account change in the same database
   transaction** — a crash between them leaves work done but not recorded, and
   the retry then does it twice.
4. **Assume events arrive out of order and late.** Never apply an older event on
   top of newer state. Compare the event's timestamp against what you last
   stored, or re-fetch and overwrite with the provider's current answer.
5. **Verify authenticity before parsing.** Each provider has its own mechanism;
   an unverified endpoint means anyone who learns the URL can grant themselves
   a subscription.
6. **Answer fast, work afterwards.** Verify, persist the raw event, return the
   success code, then process. Slow handlers get recorded as failures and
   retried, which multiplies the load exactly when things are already wrong.
7. **Keep the raw payloads.** Store what arrived, not only your interpretation.
   Replay is the cheapest way to recover from a bug in the handler.
8. **Run a reconciliation sweep anyway.** A daily job that re-reads state for
   every known subscriber catches whatever the webhooks missed while the server
   was down or misbehaving. Webhooks are an optimisation over polling, not a
   guarantee.
9. **Separate sandbox from production** — different endpoints, different
   secrets, different credentials. Test events must never touch real accounts.

## Where the endpoints live in this repo

The Stripe half is built: `app/webhooks/stripe/route.ts`, the pure logic in
`lib/billing/`, the `billing-events` collection, and `pnpm reconcile:billing`.
RevenueCat is not, and the layout below is where it goes when it is.

### Paths

| Endpoint               | Route file                         |
| ---------------------- | ---------------------------------- |
| `/webhooks/stripe`     | `app/webhooks/stripe/route.ts`     |
| `/webhooks/revenuecat` | `app/webhooks/revenuecat/route.ts` |

**Not under `/api`.** Payload owns that prefix through its catch-all at
`app/(payload)/api/[...slug]/route.ts`. Top-level route handlers are how this
app already exposes its own endpoints — see `app/health/route.ts` and
`app/redirects-map/route.ts` — and keeping webhooks there avoids arguing with
Payload's router.

### Middleware must be told to skip them

This is the trap. `middleware.ts` excludes Next internals, `admin`, `api`,
`redirects-map`, the SEO files, and anything containing a dot — and, since the
Stripe endpoint landed, `webhooks`. Without that last exclusion middleware runs
on every provider call. Two consequences, both silent:

- With `STAGING_BASIC_AUTH` set, every webhook gets a `401`. Stripe would retry
  for three days and then disable the endpoint; Apple would exhaust five
  attempts and drop the notification.
- Each call triggers a redirect-map fetch before doing anything useful.

Any further webhook route must live under that same `/webhooks` prefix, so the
one exclusion keeps covering it. Do not rely on the in-handler exemption that
`/health` uses — excluding the path outright is what you want here.

### Route handler shape

- `export const dynamic = 'force-dynamic'` (as `app/health/route.ts` does) and
  the Node runtime — signature verification needs `node:crypto`.
- Read the body with `await request.text()`. Never `request.json()` before the
  signature has been checked: parsing and re-serialising changes the bytes the
  signature covers.
- Verify, persist the raw event, return the success status, then process.

### Code layout

Follow the split the repo already uses for the backup pipeline (pure logic in
`lib/`, I/O at the edges, a CLI for operational work):

| Piece                                                   | Where                          |
| ------------------------------------------------------- | ------------------------------ |
| Signature verification, provider status → account state | `lib/billing/*.ts` (pure)      |
| Unit tests for the above                                | `tests/billing/*.test.ts`      |
| HTTP entry points                                       | `app/webhooks/*/route.ts`      |
| Backfill and daily reconciliation                       | `scripts/reconcile-billing.ts` |

The reconciliation script should take `--dry-run` and be safe to rerun, like
`scripts/backup-database.ts` and the migration scripts.

Idempotency wants a store: a small admin-only collection keyed by provider plus
event ID, holding the raw payload, with a unique index on that key. The
uniqueness constraint then does the deduplication for you — the same trick the
migration uses with `ghostID`. That is `collections/BillingEvents.ts`
(`billing-events`), and RevenueCat should share it rather than add its own.

### Dependencies

This repo deliberately avoids new packages: R2 is a hand-rolled SigV4 client
(`lib/backup/s3.ts`) and email is a fetch-based Resend adapter
(`lib/email/resend.ts`). Stripe fits that pattern — signature verification is an
HMAC-SHA256 over `${timestamp}.${rawBody}` compared in constant time, and the
REST calls the backfill needs are plain `fetch`.

Pulling in the official Stripe SDK is still a defensible exception when money is
involved. Decide once, write down which way and why, and keep the two webhook
handlers consistent.

**Decided: no SDK.** The Stripe takeover is `node:crypto` for verification
(`lib/billing/stripe-signature.ts`) and `fetch` for the two reads it needs —
retrieve one subscription, list the ones that grant access
(`lib/billing/stripe-api.ts`). That is the entire surface we use, the
verification algorithm is fully covered by unit tests rather than trusted, and
it keeps the dependency count where the rest of the repo has kept it. RevenueCat
should follow the same approach; revisit only if we start writing to Stripe
(checkout sessions, the customer portal), where the SDK earns its weight.

### Configuration and operations

- Environment variables: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` exist
  as empty placeholders in `.env.example`; `REVENUECAT_WEBHOOK_SECRET` joins
  them when that endpoint is built. Never commit values.
- Caddy needs no change — it already proxies everything to the app — but the
  endpoints must be publicly reachable over HTTPS, which means they cannot be
  tested from behind the staging Basic Auth gate.
- Emit one JSON line per rejected or failed event, matching the existing
  `request_error` and `not_found` shapes in `instrumentation.ts`, so failures
  are visible in `docker compose logs app` rather than only in a provider
  dashboard.

## Stripe (website)

**Verify the signature against the raw request body.** Stripe signs each request
with the endpoint's secret; the check fails if the body has already been parsed
into JSON, so the route needs the raw bytes. The signature includes a timestamp
with a five-minute default tolerance — keep it, or a captured request stays
replayable forever.

**Retries.** Stripe retries failed deliveries with exponential backoff for up to
about three days in live mode (fewer attempts over a few hours in a sandbox).
Endpoints that keep failing can be disabled, so failures need alerting rather
than silence.

**Events worth subscribing to** — subscribe narrowly, not to everything:

| Event                                       | Why                               |
| ------------------------------------------- | --------------------------------- |
| `customer.subscription.created`             | Access begins                     |
| `customer.subscription.updated`             | Plan, status, or period changed   |
| `customer.subscription.deleted`             | Access ends                       |
| `invoice.paid`                              | Renewal succeeded                 |
| `invoice.payment_failed`                    | Dunning starts; access may lapse  |
| `charge.refunded`, `charge.dispute.created` | Revoke access                     |
| `checkout.session.completed`                | Link a new purchase to an account |

Rather than trusting the payload's snapshot, re-fetch the subscription by ID and
write the current `status` and `current_period_end` onto the account. That makes
out-of-order delivery harmless.

**Do not copy Ghost's event selection.** Ghost's endpoint subscribes to
`invoice.payment_succeeded`; this codebase handles `invoice.paid`
(`HANDLED_STRIPE_EVENT_TYPES` in `lib/billing/stripe-events.ts`). They are
different event types, and picking the wrong one is silent: every renewal would
be stored and then marked `ignored` with reason `unhandled_type`, so the
`billing-events` collection fills up while no subscription state ever changes.
Ghost also subscribes to neither `invoice.payment_failed` nor
`charge.dispute.created`, so mirroring its list drops dunning and dispute
handling too. Select the events from the table above, not from Ghost's endpoint.

### Taking over from Ghost

> **Checked against the live Stripe account on 2026-08-18: there is nothing to
> back fill.** `Beyond Every Art, LLC` (`acct_1Qi2PC...`) holds **zero
> customers, zero subscriptions, and zero charges — no payment has ever been
> taken.** The steps below were written expecting a book of live subscribers
> inherited from Ghost; that book is empty, so the backfill is a no-op and the
> "renewals keep charging customers" risk does not currently exist. Re-check
> before cutover rather than trusting this note, but do not plan the migration
> around a subscriber list that is not there.
>
> What _is_ real: the only webhook endpoint on the account is Ghost's
> (`https://www.beyondeveryart.com/members/webhooks/stripe/`, pinned to API
> version `2020-08-27`), and it must be replaced by ours — see the event-name
> trap below.

Ghost owns this integration today. Before Ghost is cancelled:

1. Create your own webhook endpoint in **your** Stripe account (the
   subscriptions live there already — Ghost connected to it, it did not own it).
2. Backfill: list active subscriptions through the Stripe API and match them to
   accounts using the `stripeCustomerID` and `stripeSubscriptionID` preserved on
   every archived member (`collections/Members.ts`).
3. Verify the two sets agree — Stripe's active subscriptions against members the
   export marked as paying — and investigate any difference before switching
   off Ghost, not after.
4. Only then remove Ghost's Stripe connection.

Skipping the backfill means renewals keep charging customers while your
records slowly stop reflecting who is actually paying.

## Apple App Store

Use **App Store Server Notifications V2** (V1 is deprecated).

- **Verify the signed payload.** Notifications arrive as a JWS; validate the
  certificate chain up to Apple's root before trusting anything inside. Apple
  publishes server libraries that do this — use one rather than hand-rolling
  JWT verification.
- **Respond 200** (any 2xx up to 206). Apple retries up to five times — roughly
  1, 12, 24, 48, and 72 hours after the previous attempt — when it does not get
  one. Sandbox notifications are **not** retried at all, so a missed sandbox
  event is simply gone.
- **`originalTransactionId` is the subscription's identity.** Every renewal
  carries it; store it on the account and key all lookups on it.
- **Set `appAccountToken` at purchase time** — a UUID identifying your account,
  which then rides along through renewals, upgrades, and cross-grades. It is
  what links an Apple purchase back to a person in your database. Requiring
  sign-in before purchase is what makes it available.
- **Read state from the App Store Server API.** `Get All Subscription Statuses`
  is the authority; the notification only says something happened.
- **Handle `REFUND` and `REVOKE` by removing access.** Apple can refund without
  asking you, and a refunded subscriber who keeps access is money lost twice.
- **Recover gaps with `Get Notification History`** after any outage, instead of
  waiting for retries that may already be exhausted.
- **Separate sandbox and production endpoints**, and expect sandbox timing to be
  compressed and occasionally unreliable.

## Google Play

Notifications arrive as **Real-time developer notifications** published to a
Cloud Pub/Sub topic you own.

- **The golden rule: the notification carries no state.** It tells you which
  `purchaseToken` changed and what kind of change it was. You must then call
  `purchases.subscriptionsv2.get` in the Play Developer API for the real answer.
- **Acknowledge purchases within three days.** An unacknowledged purchase is
  automatically refunded and revoked by Google. Acknowledge immediately after
  granting access — this is the single most expensive mistake to get wrong.
- **`purchaseToken` is the key, and it changes.** Upgrades, downgrades, and
  resubscribes issue a new token carrying a `linkedPurchaseToken` pointing at
  the old one. Follow that link or one person becomes two subscriptions.
- **Set `obfuscatedExternalAccountId` at purchase** so the purchase can be tied
  back to your account, the Play equivalent of Apple's `appAccountToken`.
- **Deduplicate on the Pub/Sub `messageId`.** Delivery is at least once and
  ordering is not guaranteed.
- **Watch for voided purchases.** Refunds and chargebacks arrive as their own
  notifications, and there is a voided-purchases API for backfilling any missed.
- Handle the full lifecycle, not just purchase and renewal: grace period, on
  hold, paused, restarted, revoked, expired. Grace period and account hold in
  particular mean "still a subscriber, payment is being retried" — cutting
  access there produces angry, still-paying customers.

## If RevenueCat fronts the stores

The plan in [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md) is RevenueCat for the App
Store and Play, Stripe direct. In that shape:

- RevenueCat absorbs the JWS verification, Play acknowledgement, token linking,
  restore handling, and both stores' lifecycle vocabulary.
- Your server consumes **one** RevenueCat webhook instead of two provider
  integrations. Authenticate it with the shared secret RevenueCat sends in the
  `Authorization` header, compared in constant time, and deduplicate on the
  event's `id`. Return 200; anything else counts as a failure.
- You still own Stripe, and you still own the merged flag. RevenueCat is an
  input to your account record, never a replacement for it.
- Use the **Payload account ID** as the RevenueCat app user ID, never the email.

Even with RevenueCat in place, the store rules above still bind your app: the
acknowledgement deadline, "Restore Purchases", and sign-in before purchase are
requirements on the product, not just the backend.

## Testing

- **Stripe**: the Stripe CLI forwards live-mode-shaped events to a local
  endpoint and can trigger specific event types on demand.
- **Apple**: the App Store Server API has a _Request a Test Notification_
  endpoint; use sandbox subscriptions for lifecycle timing (which is heavily
  accelerated).
- **Google Play**: publish a test notification to your Pub/Sub topic from the
  Play Console, and use license testers for real purchase flows without charges.
- **RevenueCat**: sends a `TEST` event from the dashboard.

Cover, at minimum: a duplicate delivery, an out-of-order pair, an unverified or
tampered payload, and a refund. Those four are where real implementations break.
