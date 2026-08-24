'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import type { SignupCampaign } from '@/blocks/schema'
import { isCampaignLive } from '@/lib/content/signup-campaign'
import { getPayloadClient } from '@/lib/payload'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
} from '@/lib/security/rate-limit'
import { NEWSLETTER_PATH } from '@/lib/seo/site'

/** Basic RFC 5322-ish check; Payload's `email` field re-validates on write. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SignupStatus = 'success' | 'invalid' | 'error'

/**
 * Nobody subscribes ten times in an hour, and the write is unauthenticated.
 *
 * Without a bound this is an open door onto the database: every submission is a
 * row, and the address is never verified, so the list can be filled with
 * plausible-looking strangers as fast as requests can be made. Ten an hour is
 * far above a person correcting a typo and far below anything worth automating.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_SIGNUP_PER_HOUR', 10),
  60 * 60_000,
)

/** Signals that a write lost to an address that is already on the list. */
function isDuplicate(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const name = error instanceof Error ? error.name : ''
  return (
    name === 'ValidationError' ||
    message.includes('unique') ||
    message.includes('duplicate') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      // Postgres unique_violation.
      (error as { code?: unknown }).code === '23505')
  )
}

async function record(email: string, source: string): Promise<SignupStatus> {
  if (!EMAIL_PATTERN.test(email)) return 'invalid'

  // Answered as a generic failure rather than its own status: a throttled
  // submitter is either a script, which is told nothing useful, or a person who
  // has already subscribed several times over and is best served by stopping.
  if (!limiter.check(clientKey(await headers())).allowed) return 'error'

  try {
    const payload = await getPayloadClient()

    // Subscribing twice is a normal thing for a reader to do, and the honest
    // answer to it is "you're subscribed" — not an error. Matching on the
    // write's error text alone did not survive contact with Payload, which
    // rejects a duplicate as a field validation failure whose message never
    // mentions the constraint, so the address is checked first and the error
    // is treated as the race it would have to be.
    const existing = await payload.find({
      collection: 'newsletter-signups',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) return 'success'

    await payload.create({
      collection: 'newsletter-signups',
      data: { email, source },
      overrideAccess: true,
    })
  } catch (error) {
    if (!isDuplicate(error)) return 'error'
  }

  return 'success'
}

function normalise(formData: FormData): string {
  return String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
}

export async function subscribeToNewsletter(formData: FormData) {
  const status = await record(normalise(formData), 'newsletter-page')
  redirect(`${NEWSLETTER_PATH}?status=${status}`)
}

/**
 * The same signup, for the header's subscribe modal.
 *
 * The page-level action reports itself by redirecting, which would tear the
 * modal down and navigate away from whatever the reader was in the middle of.
 * This one returns the status so the modal can answer in place.
 */
export async function subscribeFromModal(
  _previous: SignupStatus | null,
  formData: FormData,
): Promise<SignupStatus> {
  return record(normalise(formData), 'subscribe-modal')
}

const ARTICLE_SOURCE = 'article-signup'

/**
 * The source to file an article signup under.
 *
 * The form may name a campaign, and that is all it may do. The name is looked
 * up here and the source is built from the *stored* record — so a submission
 * can only ever be attributed to a campaign that exists and is running, and
 * the worst a forged or stale id can achieve is the default attribution.
 * Nothing the client sends reaches the stored value.
 *
 * The same `isCampaignLive` the module renders through, so a module showing
 * its own fallback copy cannot have its signups filed under a campaign that
 * has ended.
 */
async function articleSource(formData: FormData): Promise<string> {
  const id = String(formData.get('campaign') ?? '').trim()
  // Bounded before it reaches a query. An id is short; anything long is not a
  // typo, and there is no reason to hand it to the database to find that out.
  if (!id || id.length > 64) return ARTICLE_SOURCE

  try {
    const payload = await getPayloadClient()
    const campaign = (await payload.findByID({
      collection: 'signup-campaigns',
      id,
      depth: 0,
      overrideAccess: true,
      // A missing id is an ordinary outcome here — a campaign deleted while a
      // page sat open in a tab — so it is a null rather than a thrown 404.
      disableErrors: true,
    })) as SignupCampaign | null

    if (!campaign?.slug || !isCampaignLive(campaign)) return ARTICLE_SOURCE
    return `${ARTICLE_SOURCE}:${campaign.slug}`
  } catch {
    // Attribution is not worth failing a subscription over. The address still
    // gets on the list, filed under the default source.
    return ARTICLE_SOURCE
  }
}

/**
 * The same signup, for a signup module placed inside an article body.
 *
 * Answers in place like the modal does: this form is in the middle of a piece
 * somebody is reading, and redirecting them to the newsletter page would throw
 * away their position in it.
 */
export async function subscribeFromArticle(
  _previous: SignupStatus | null,
  formData: FormData,
): Promise<SignupStatus> {
  return record(normalise(formData), await articleSource(formData))
}
