import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload'
import {
  isPreviewCollection,
  LIVE_PREVIEW_COOKIE,
  previewTargetPath,
} from '@/lib/preview/live-preview'

/** Roles allowed to see unpublished content on the public site. */
const PREVIEW_ROLES = new Set(['admin', 'editor', 'author'])

/**
 * Whether the request carries a Payload admin session with a role that may
 * preview drafts.
 *
 * The admin and the site are one application on one origin, so both the
 * "Preview" button and the Live Preview iframe send the Payload session cookie
 * with their request. Authorizing against it means preview needs no secret in
 * its URL and keeps working when `PAYLOAD_PREVIEW_SECRET` is unset.
 */
async function hasPreviewSession(request: NextRequest): Promise<boolean> {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    const role = (user as { role?: string } | null)?.role
    return Boolean(role && PREVIEW_ROLES.has(role))
  } catch {
    // A database or configuration failure must not read as a valid session.
    return false
  }
}

function matchesPreviewSecret(secret: null | string): boolean {
  const expected = process.env.PAYLOAD_PREVIEW_SECRET
  return Boolean(expected && secret === expected)
}

/**
 * Entry point for Payload's "Preview" button and for the Live Preview iframe.
 * Authorizes the request, enables Next.js draft mode, and redirects to the
 * document's real URL, which then renders the latest draft instead of the
 * published version.
 *
 * The redirect target is rebuilt from the collection and slug rather than taken
 * from the request, so this route cannot be turned into an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const collection = searchParams.get('collection')
  const slug = searchParams.get('slug')
  const live = searchParams.get('live') === '1'

  if (!slug || !isPreviewCollection(collection)) {
    return new Response('Invalid preview request', { status: 400 })
  }

  // The shared secret stays supported for links built outside the admin, but an
  // admin session is the normal path and is checked only when no secret matched.
  const authorized =
    matchesPreviewSecret(searchParams.get('secret')) ||
    (await hasPreviewSession(request))

  if (!authorized) {
    return new Response('Not authorized to preview', { status: 401 })
  }

  const draft = await draftMode()
  draft.enable()

  const jar = await cookies()
  if (live) {
    jar.set(LIVE_PREVIEW_COOKIE, '1', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  } else {
    // A plain preview must not inherit the iframe behaviour of an earlier
    // live-preview session in the same browser.
    jar.delete(LIVE_PREVIEW_COOKIE)
  }

  redirect(previewTargetPath(collection, slug))
}
