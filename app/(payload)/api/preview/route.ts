import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import {
  isPreviewCollection,
  LIVE_PREVIEW_COOKIE,
  previewTargetPath,
} from '@/lib/preview/live-preview'
import { hasPreviewSession } from '@/lib/preview/session'

/**
 * Entry point for Payload's "Preview" button and for the Live Preview iframe.
 * Authorizes the request, enables Next.js draft mode, and redirects to the
 * document's real URL, which then renders the latest draft instead of the
 * published version.
 *
 * The admin and the site are one application on one origin, so both entry
 * points send the Payload session cookie with their request and no secret has
 * to travel in a URL. Draft rendering re-checks that session, so this route
 * grants an intent to preview rather than a durable key to unpublished work.
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

  if (!(await hasPreviewSession(request.headers))) {
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
