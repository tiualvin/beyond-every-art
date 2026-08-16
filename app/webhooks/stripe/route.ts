// Stripe webhook endpoint: POST /webhooks/stripe
//
// This is the takeover described in docs/SUBSCRIPTION_WEBHOOKS.md. Ghost has
// been receiving these events for the existing paying members; when Ghost is
// switched off, nothing does, and subscription state freezes at export time.
//
// Deliberate details:
//
// - **Top-level route, not under `/api`.** Payload owns that prefix through its
//   catch-all, so this sits alongside app/health and app/redirects-map.
// - **`middleware.ts` must skip `/webhooks`.** It does (see the matcher there),
//   and it has to: with STAGING_BASIC_AUTH set, middleware would answer every
//   Stripe call with a 401, Stripe would retry for three days and then disable
//   the endpoint, and nothing would look broken from in here.
// - **Raw body.** The signature covers the exact bytes received, so the body is
//   read with `request.text()` and only parsed after verification succeeds.
// - **Verify, persist, answer, then interpret.** Interpretation failures do not
//   fail the response: the raw event is already stored, the record is marked
//   `unresolved`, a JSON log line is emitted, and the daily reconciliation
//   sweep (`pnpm reconcile:billing`) is what closes the gap. Failing instead
//   would buy a retry of work that is already recorded.
//
// Until the `accounts` collection exists (Phase 2, docs/ACCOUNT_MODEL.md) there
// is no account row to write a subscription state onto. Events are captured and
// resolved into our vocabulary in `billing-events` regardless, so nothing that
// happens between the takeover and the paywall is lost.

import { getPayloadClient } from '@/lib/payload'
import {
  resolveStripeConfig,
  retrieveSubscription,
} from '@/lib/billing/stripe-api'
import {
  summarizeStripeEvent,
  type StripeEventSummary,
} from '@/lib/billing/stripe-events'
import {
  applyObservation,
  markEvent,
  recordBillingEvent,
} from '@/lib/billing/store'
import {
  stateFromRevocation,
  stateFromSubscription,
  type StripeSubscription,
} from '@/lib/billing/subscription-state'
import { verifyStripeSignature } from '@/lib/billing/stripe-signature'
import { logWebhookProblem } from '@/lib/observability/webhook'
import {
  readBoundedText,
  RequestBodyTooLarge,
} from '@/lib/security/request-body'

// Signature verification needs node:crypto, and the response must never be
// cached or prerendered.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVIDER = 'stripe'

// Stripe events are ordinarily far smaller than this. Enforce the ceiling
// while streaming: this endpoint is public, and signature verification happens
// only after the body has arrived, so `request.text()` would otherwise let an
// unauthenticated caller choose how much memory one request allocates.
const MAX_WEBHOOK_BODY_BYTES = 1_048_576

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    logWebhookProblem({
      event: 'webhook_rejected',
      provider: PROVIDER,
      reason: 'STRIPE_WEBHOOK_SECRET is not set',
    })
    return Response.json(
      { error: 'Stripe webhooks are not configured' },
      { status: 503 },
    )
  }

  // Raw bytes, before any parsing: re-serialised JSON does not match the
  // signature Stripe computed.
  let body: string
  try {
    body = await readBoundedText(request, MAX_WEBHOOK_BODY_BYTES)
  } catch (error) {
    if (!(error instanceof RequestBodyTooLarge)) throw error
    logWebhookProblem({
      event: 'webhook_rejected',
      provider: PROVIDER,
      reason: 'request body exceeds size limit',
    })
    return Response.json({ error: 'Request body too large' }, { status: 413 })
  }

  const verification = verifyStripeSignature({
    payload: body,
    header: request.headers.get('stripe-signature'),
    secret,
  })
  if (!verification.verified) {
    logWebhookProblem({
      event: 'webhook_rejected',
      provider: PROVIDER,
      reason: verification.reason,
    })
    // 400, not 401: Stripe treats any non-2xx as a failure and retries, and a
    // request we cannot authenticate is one we will never be able to accept.
    return Response.json(
      { error: 'Signature verification failed' },
      { status: 400 },
    )
  }

  let summary: StripeEventSummary
  try {
    summary = summarizeStripeEvent(JSON.parse(body))
  } catch (error) {
    logWebhookProblem({
      event: 'webhook_rejected',
      provider: PROVIDER,
      reason: error instanceof Error ? error.message : 'unparseable payload',
    })
    return Response.json({ error: 'Malformed event' }, { status: 400 })
  }

  const payload = await getPayloadClient()

  let recorded
  try {
    recorded = await recordBillingEvent(payload, {
      provider: PROVIDER,
      eventID: summary.id,
      type: summary.type,
      occurredAt: summary.createdAt,
      livemode: summary.livemode,
      source: 'webhook',
      rawEvent: JSON.parse(body),
      subscriptionID:
        summary.intent.kind === 'subscription'
          ? summary.intent.subscriptionID
          : null,
      customerID:
        summary.intent.kind === 'revoke' ? summary.intent.customerID : null,
    })
  } catch (error) {
    // Nothing was recorded, so Stripe must retry: answer with a failure.
    logWebhookProblem({
      event: 'webhook_storage_failed',
      provider: PROVIDER,
      reason: error instanceof Error ? error.message : String(error),
      eventID: summary.id,
      eventType: summary.type,
    })
    return Response.json({ error: 'Could not store event' }, { status: 500 })
  }

  // Redelivery: the event is already recorded, so this is a no-op.
  if (recorded.duplicate) {
    return Response.json({ received: true, duplicate: true })
  }

  await interpret(payload, recorded.id, summary)

  return Response.json({ received: true })
}

/**
 * Turn a stored event into account state. Best effort by design — see the note
 * at the top of the file — so every failure path marks the record and returns.
 */
async function interpret(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  eventDocID: string | number,
  summary: StripeEventSummary,
): Promise<void> {
  const context = { observedAt: summary.createdAt, eventID: summary.id }

  try {
    // Test-mode events must never touch real records. Sandbox traffic belongs
    // on a separate endpoint with its own secret; in production, a test event
    // reaching this one is stored for inspection and otherwise ignored.
    if (!summary.livemode && process.env.NODE_ENV === 'production') {
      await markEvent(
        payload,
        eventDocID,
        'ignored',
        'Test-mode event received by the production endpoint.',
      )
      return
    }

    if (summary.intent.kind === 'ignore') {
      await markEvent(payload, eventDocID, 'ignored', ignoreNote(summary))
      return
    }

    if (summary.intent.kind === 'revoke') {
      // A refund or dispute takes access away regardless of what the
      // subscription's own status says.
      await applyObservation(
        payload,
        eventDocID,
        stateFromRevocation({ customerID: summary.intent.customerID }, context),
      )
      return
    }

    const subscription = await currentSubscription(summary)
    if (!subscription) {
      logWebhookProblem({
        event: 'webhook_unresolved',
        provider: PROVIDER,
        reason: 'could not read the subscription from Stripe',
        eventID: summary.id,
        eventType: summary.type,
      })
      await markEvent(
        payload,
        eventDocID,
        'unresolved',
        'Stored, but the subscription could not be read. `pnpm reconcile:billing` will resolve it.',
      )
      return
    }

    await applyObservation(
      payload,
      eventDocID,
      stateFromSubscription(subscription, context),
    )
  } catch (error) {
    logWebhookProblem({
      event: 'webhook_unresolved',
      provider: PROVIDER,
      reason: error instanceof Error ? error.message : String(error),
      eventID: summary.id,
      eventType: summary.type,
    })
  }
}

/** Why a stored event was not acted on, recorded on the event itself. */
function ignoreNote(summary: StripeEventSummary): string {
  if (summary.intent.kind !== 'ignore') return ''
  switch (summary.intent.why) {
    case 'unhandled_type':
      return `No handler for ${summary.type}.`
    case 'partial_refund':
      return 'Partial refund; access is not revoked.'
    default:
      return `${summary.type} carried no subscription reference.`
  }
}

/**
 * Read the subscription's current state.
 *
 * Re-fetching by ID rather than trusting the payload's snapshot is what makes
 * out-of-order delivery harmless: a cancellation that arrives after the renewal
 * that preceded it still resolves to what Stripe says right now. When
 * STRIPE_SECRET_KEY is unset (local development, and before the takeover is
 * fully configured) — or when the read fails — the event's own snapshot is used
 * instead, and events that carry none are left for reconciliation.
 */
async function currentSubscription(
  summary: StripeEventSummary,
): Promise<StripeSubscription | null> {
  if (summary.intent.kind !== 'subscription') return null
  const { subscriptionID, snapshot } = summary.intent

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      return await retrieveSubscription(
        resolveStripeConfig(process.env),
        subscriptionID,
      )
    } catch (error) {
      logWebhookProblem({
        event: 'webhook_unresolved',
        provider: PROVIDER,
        reason: `Stripe read failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        eventID: summary.id,
        eventType: summary.type,
      })
    }
  }

  return snapshot
}
