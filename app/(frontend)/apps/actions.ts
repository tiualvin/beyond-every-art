'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload'
import { isSubmittableEmail } from '@/lib/security/email'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
} from '@/lib/security/rate-limit'
import { APPS_PATH } from '@/lib/seo/site'

/**
 * The same bound as the newsletter signup, for the same reason.
 *
 * This one writes a row per ticked app rather than one per submission, so an
 * unbounded submitter costs several writes each time — the limit is counted per
 * submission regardless, because that is the action a person takes.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_SIGNUP_PER_HOUR', 10),
  60 * 60_000,
)

export type WaitlistStatus = 'success' | 'invalid' | 'none' | 'error'

/**
 * Apps one submission may name.
 *
 * The form offers a checkbox per app and there will never be many, but the
 * field arrives from the request, so without a ceiling the count of `app`
 * values decides both the `IN` list and the `limit` of the query below — a
 * single post could ask Postgres to match a hundred thousand slugs. The
 * limiter bounds how often that can be sent; this bounds what one of them
 * costs. A submission naming more apps than exist is a script, not a reader.
 */
const MAX_APPS_PER_SUBMISSION = 20

/**
 * A repeat signup, or a race that lost to one.
 *
 * The collection's beforeValidate hook throws `DuplicateWaitlistEntry` for a
 * pair already on file; a genuine race gets past that and is caught by the
 * database instead. Both mean the same thing to the reader — you are on the
 * list — so both are answered as success.
 */
function isDuplicate(error: unknown): boolean {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    name === 'DuplicateWaitlistEntry' ||
    name === 'ValidationError' ||
    message.includes('already on the waitlist') ||
    message.includes('unique') ||
    message.includes('duplicate') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      // Postgres unique_violation.
      (error as { code?: unknown }).code === '23505')
  )
}

/**
 * Records one reader against any number of apps.
 *
 * Each ticked box becomes its own row, because that is the shape of the
 * collection: a `(email, app)` pair, one signup per person per app. Slugs
 * arrive from the form, so every one is resolved against a published app
 * before it is written — an unknown or unpublished slug is skipped rather
 * than failing the whole submission, which would punish the reader for
 * something an editor changed mid-visit.
 */
export async function joinAppWaitlist(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const slugs = [
    ...new Set(
      formData
        .getAll('app')
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_APPS_PER_SUBMISSION)

  if (slugs.length === 0) return redirect(`${APPS_PATH}?status=none`)
  if (!isSubmittableEmail(email)) {
    return redirect(`${APPS_PATH}?status=invalid`)
  }
  if (!limiter.check(clientKey(await headers())).allowed) {
    return redirect(`${APPS_PATH}?status=error`)
  }

  let status: WaitlistStatus = 'success'

  try {
    const payload = await getPayloadClient()
    const apps = await payload.find({
      collection: 'apps',
      overrideAccess: true,
      depth: 0,
      limit: slugs.length,
      where: {
        and: [{ slug: { in: slugs } }, { _status: { equals: 'published' } }],
      },
      select: { slug: true },
    })

    const ids = (apps.docs as Array<{ id?: number }>)
      .map((doc) => doc.id)
      .filter((id): id is number => typeof id === 'number')

    if (ids.length === 0) return redirect(`${APPS_PATH}?status=none`)

    for (const id of ids) {
      try {
        await payload.create({
          collection: 'app-waitlist',
          data: { email, app: id, source: 'apps-page' },
          overrideAccess: true,
        })
      } catch (error) {
        if (!isDuplicate(error)) throw error
      }
    }
  } catch (error) {
    // `redirect` reports itself by throwing; rethrowing anything else here
    // would turn a successful submission into an error page.
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      String((error as { digest?: unknown }).digest).startsWith('NEXT_REDIRECT')
    ) {
      throw error
    }
    status = 'error'
  }

  redirect(`${APPS_PATH}?status=${status}`)
}
