// A minimal, dependency-free Stripe REST client.
//
// Only two reads are needed: retrieve one subscription (so a webhook can be
// answered from Stripe's current state rather than the payload's snapshot) and
// list the subscriptions that grant access (the backfill and the daily
// reconciliation sweep). Both are plain GETs with a bearer token, which is why
// the official SDK is not a dependency — see lib/backup/s3.ts and
// lib/email/resend.ts for the same trade-off.

import {
  ACCESS_GRANTING_STRIPE_STATUSES,
  type StripeSubscription,
  type StripeSubscriptionStatus,
} from './subscription-state'

const DEFAULT_API_BASE = 'https://api.stripe.com/v1'

/** Stripe's maximum page size for list endpoints. */
const PAGE_SIZE = 100

/** Guard against an unterminated pagination loop on unexpected responses. */
const MAX_PAGES = 500

export interface StripeApiConfig {
  secretKey: string
  apiBase: string
  /** Pinned API version, or undefined to use the account default. */
  apiVersion?: string
}

type Env = Record<string, string | undefined>

/**
 * Resolve Stripe API configuration from the environment. Throws a clear error
 * naming the missing variable, matching resolveBackupConfig in lib/backup/plan.
 */
export function resolveStripeConfig(env: Env): StripeApiConfig {
  const secretKey = env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Missing required environment variable STRIPE_SECRET_KEY')
  }
  return {
    secretKey,
    apiBase: (env.STRIPE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, ''),
    apiVersion: env.STRIPE_API_VERSION || undefined,
  }
}

/** True for a test-mode key. Test data must never be reconciled into live records. */
export function isTestModeKey(config: StripeApiConfig): boolean {
  return /^sk_test_|^rk_test_/.test(config.secretKey)
}

export type FetchLike = typeof fetch

async function stripeGet(
  config: StripeApiConfig,
  path: string,
  query: Record<string, string> = {},
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const search = new URLSearchParams(query).toString()
  const url = `${config.apiBase}${path}${search ? `?${search}` : ''}`

  const headers: Record<string, string> = {
    authorization: `Bearer ${config.secretKey}`,
    accept: 'application/json',
  }
  if (config.apiVersion) headers['stripe-version'] = config.apiVersion

  const response = await fetchImpl(url, { method: 'GET', headers })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Stripe GET ${path} failed: ${response.status} ${response.statusText}` +
        (detail ? `\n${detail}` : ''),
    )
  }
  return response.json()
}

/** Retrieve a subscription by ID — the authoritative answer for one event. */
export async function retrieveSubscription(
  config: StripeApiConfig,
  subscriptionID: string,
  fetchImpl: FetchLike = fetch,
): Promise<StripeSubscription> {
  const body = (await stripeGet(
    config,
    `/subscriptions/${encodeURIComponent(subscriptionID)}`,
    {},
    fetchImpl,
  )) as StripeSubscription
  if (!body || typeof body.id !== 'string') {
    throw new Error(`Stripe returned no subscription for ${subscriptionID}`)
  }
  return body
}

interface ListResponse {
  data?: StripeSubscription[]
  has_more?: boolean
}

/** List every subscription in one status, following pagination to the end. */
export async function listSubscriptionsByStatus(
  config: StripeApiConfig,
  status: StripeSubscriptionStatus,
  fetchImpl: FetchLike = fetch,
): Promise<StripeSubscription[]> {
  const subscriptions: StripeSubscription[] = []
  let startingAfter: string | undefined

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query: Record<string, string> = {
      status,
      limit: String(PAGE_SIZE),
    }
    if (startingAfter) query.starting_after = startingAfter

    const body = (await stripeGet(
      config,
      '/subscriptions',
      query,
      fetchImpl,
    )) as ListResponse
    const batch = body.data ?? []
    subscriptions.push(...batch)

    if (!body.has_more || batch.length === 0) return subscriptions
    startingAfter = batch[batch.length - 1]?.id
    if (!startingAfter) return subscriptions
  }

  throw new Error(
    `Stripe subscription listing exceeded ${MAX_PAGES} pages for status ${status}`,
  )
}

/**
 * Every subscription that currently grants access.
 *
 * Stripe's list endpoint filters by a single status, and `status=active`
 * excludes `trialing` and `past_due` — both of which our mapping treats as
 * subscribers. Querying each access-granting status keeps the reconciliation
 * set in step with mapStripeStatus instead of quietly under-reporting.
 */
export async function listAccessGrantingSubscriptions(
  config: StripeApiConfig,
  fetchImpl: FetchLike = fetch,
): Promise<StripeSubscription[]> {
  const byID = new Map<string, StripeSubscription>()
  for (const status of ACCESS_GRANTING_STRIPE_STATUSES) {
    for (const subscription of await listSubscriptionsByStatus(
      config,
      status,
      fetchImpl,
    )) {
      byID.set(subscription.id, subscription)
    }
  }
  return [...byID.values()]
}
