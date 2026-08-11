'use server'

import { redirect } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload'
import { NEWSLETTER_PATH } from '@/lib/seo/site'

/** Basic RFC 5322-ish check; Payload's `email` field re-validates on write. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SignupStatus = 'success' | 'invalid' | 'error'

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
