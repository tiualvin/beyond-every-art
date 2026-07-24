'use server'

import { redirect } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload'
import { NEWSLETTER_PATH } from '@/lib/seo/site'

/** Basic RFC 5322-ish check; Payload's `email` field re-validates on write. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function subscribeToNewsletter(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()

  let status: 'success' | 'invalid' | 'error' = 'success'

  if (!EMAIL_PATTERN.test(email)) {
    status = 'invalid'
  } else {
    try {
      const payload = await getPayloadClient()
      await payload.create({
        collection: 'newsletter-signups',
        data: { email, source: 'newsletter-page' },
        overrideAccess: true,
      })
    } catch (error) {
      // A duplicate email just means they're already subscribed.
      const message = error instanceof Error ? error.message : ''
      if (!message.toLowerCase().includes('unique')) status = 'error'
    }
  }

  redirect(`${NEWSLETTER_PATH}?status=${status}`)
}
