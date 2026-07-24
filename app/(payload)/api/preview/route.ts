import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { pagePath, postPath } from '@/lib/seo/site'

const COLLECTIONS = new Set(['posts', 'pages'])

/**
 * Entry point for Payload's admin "Preview" button. Verifies the shared
 * secret, enables Next.js draft mode, and redirects to the content's real
 * URL, which then renders the latest draft instead of the published version.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug')
  const collection = searchParams.get('collection')

  if (!process.env.PAYLOAD_PREVIEW_SECRET) {
    return new Response('Preview is not configured', { status: 501 })
  }
  if (secret !== process.env.PAYLOAD_PREVIEW_SECRET) {
    return new Response('Invalid preview secret', { status: 401 })
  }
  if (!slug || !collection || !COLLECTIONS.has(collection)) {
    return new Response('Invalid preview request', { status: 400 })
  }

  const draft = await draftMode()
  draft.enable()

  redirect(collection === 'pages' ? pagePath(slug) : postPath(slug))
}
