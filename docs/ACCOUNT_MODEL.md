# Account and Subscription Model

The decision record for how readers sign in and how a paid subscription is
recognised across the website and the mobile apps.

**Nothing here is built during Phase 1.** The Ghost migration ships with content
only: no reader accounts, no paywall, no subscription checks. This document
exists so Phase 2 does not have to invent the model under time pressure, and so
the Phase 1 data model stays compatible with it.

The one item with a real deadline is
[taking over Stripe's webhooks](#stripe-webhooks-at-ghost-shutdown), which must
happen before Ghost is switched off. Implementation guidance for all three
billing sources is in [`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

## The goal

Someone subscribes — on the website or inside an app — and is recognised as a
subscriber everywhere they sign in.

## Decisions

### 1. Reader accounts live in their own collection

A new `accounts` collection, separate from both existing collections:

| Collection | Purpose                                             | Who can read it     |
| ---------- | --------------------------------------------------- | ------------------- |
| `users`    | CMS staff (admin, editor, author). Backs the admin. | Staff               |
| `members`  | Frozen archive of the Ghost member export.          | Administrators only |
| `accounts` | Reader accounts for the website and the apps.       | The account owner   |

`members` is **not** converted into a login collection, and no fields are added
to it. Keeping the archive separate from live accounts means:

- Nothing sensitive leaks. `members` rows carry `rawGhostData`, internal `note`
  text, and email engagement statistics. An authenticated user can always read
  their own record through Payload's `/me` endpoint, so any sensitive field on
  a login collection needs its own field-level rule — one missed field is a
  leak of internal notes to the person they describe.
- Deletion stays answerable. An account can be deleted on request without
  destroying migration provenance.
- Account counts stay honest. Enabling auth on `members` would instantly create
  thousands of accounts nobody has ever claimed.
- The schema is not inherited from Ghost's newsletter model (`subscribed`,
  `comped`, `emailOpenRate`, `newsletters`), which describes an audience rather
  than an account.

There are no credentials to migrate either way: Ghost signs members in with
emailed links and the export contains no password hashes.

### 2. Sign-in is an emailed link

Passwordless. Enter an email, receive a link, tap it — same flow on web and
mobile, and the same email resolves to the same account on both.

No third-party social sign-in for v1. Beyond keeping the flow simple, offering
social login on iOS obliges you to offer Sign in with Apple, whose private relay
addresses hide the real email and break matching against the Ghost archive.

Practical consequence: sign-in sends a transactional email per attempt. Resend's
free tier is limited (3,000/month at the time of writing) and a launch
announcement to the migrated member list can exceed it in a day.

### 3. One subscription state, on the account

`accounts` carries the merged answer, not the billing detail:

- `subscriptionStatus` — `active`, `expired`, or `none`
- `subscriptionSource` — `stripe`, `apple`, `google`, or `comped`
- `subscriptionExpiresAt`
- `stripeCustomerID` — set when the subscription came from the website
- `revenueCatID` — the app-store side (see below)
- `member` — optional relationship to the archived Ghost record

No separate entitlements collection while there is a single thing to subscribe
to. Add one when the creative apps introduce tiers that differ per product;
until then it is a table with one meaningful row per person.

Apps and the website ask one question — "is this account a subscriber?" — and
never interpret billing state themselves.

### 4. Existing Ghost members are claimed on first sign-in

When someone signs in for the first time, match their email against `members`.
On a match, link the records; if the archived member was paying, set the account
active. Nobody has to re-subscribe, and nothing is claimed automatically for a
person who never signs in.

## Billing

Subscriptions can start in three places. The account's `subscriptionStatus` is
the merged result — active if any source says so.

| Source        | Who handles it                   |
| ------------- | -------------------------------- |
| Website       | Stripe, direct to our own server |
| iOS App Store | RevenueCat                       |
| Google Play   | RevenueCat                       |

RevenueCat also supports Stripe, which would put everything in one dashboard.
We deliberately do not use it that way: the existing web subscriptions were
created by Ghost and carry no RevenueCat identifiers, so adopting it for Stripe
too would require backfilling every legacy customer. Handling Stripe directly
needs one webhook we have to write for the website paywall regardless, and it
keeps Payload as the source of truth.

### Join keys

Use the **Payload account ID** as the RevenueCat app user ID — never the email.
Emails change, and it keeps personal data out of a third-party service. Together
with `stripeCustomerID`, those two fields are the entire link between our
database and the billing systems.

### Rules that are not optional

- **Never trust the client.** The device does not decide whether someone has
  paid. Stripe, Apple, and Google each notify the server on renewal, lapse,
  refund, and failed payment; the server flips the flag.
- **Require sign-in before purchase.** Store purchases attach to an Apple or
  Google account, not ours. A purchase made before sign-in is an orphan payment
  and a support ticket.
- **Implement "Restore Purchases".** Apple requires it, and reinstalling or
  changing device is otherwise a dead end.
- **Hide the purchase option when the account is already active**, so nobody
  pays twice across two platforms.
- **Store subscriptions cannot be cancelled from our server.** Direct those
  users to their App Store or Play settings, and say so in the interface rather
  than appearing to stonewall.

Apple and Google both take 15% of subscription revenue for small developers
(under $1M/year), not 30%. In the United States, apps may also link out to web
payment without commission; the rules differ by country and continue to change,
so treat that as an opportunity to revisit, not part of the plan.

## Stripe webhooks at Ghost shutdown

Existing website subscriptions keep billing in Stripe after Ghost is switched
off, but Ghost is what has been listening for renewals, cancellations, and
failed payments. Once it is gone, nothing is — paying subscribers will drift out
of sync with whatever access they are granted, silently.

**Decision: we take the webhooks over.** Subscription state is not allowed to
freeze at export time — a paying subscriber whose renewal, cancellation, or
failed payment goes unrecorded is either being charged for access they lost or
keeping access they stopped paying for, and neither is discoverable after the
fact without a manual Stripe audit.

The migration preserves `stripeCustomerID` and `stripeSubscriptionID` on every
archived member (see `collections/Members.ts`), which is what makes the handover
possible: existing subscriptions can be matched to accounts by those IDs rather
than re-derived.

The steps, including the backfill and the reconciliation check that must happen
before Ghost is cancelled, are in
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md#taking-over-from-ghost),
and the deadline is tracked in the [cutover runbook](CUTOVER_RUNBOOK.md).

## What Phase 1 must not do

- Do not add authentication to `members`.
- Do not add app or subscription fields to `members`; it is an archive.
- Do not build `accounts`, entitlements, or a paywall before the reader app work
  is actually scheduled.

The Stripe webhook handover is the exception: it is billing continuity for
subscribers who already exist, not app work, and it is due before Ghost is
switched off.

Phase 1's obligations are already met: member records, their Stripe
identifiers, and each post's `visibility` (`public`, `members`, `paid`) are all
preserved, and non-public posts are withheld from anonymous API readers.

On the website those posts are listed, searched and syndicated like any other
published post, and their URLs serve the opening paragraphs followed by a
membership gate — the teaser Ghost served, which is what keeps the pages and
their rankings through cutover. The rest of the body is left out of the
response rather than hidden in it. Until sign-in exists the gate says
membership is coming rather than offering a way in, because there is not one
yet: `lib/billing` reconciles Stripe webhooks but nothing here authenticates a
member or sells them anything.
