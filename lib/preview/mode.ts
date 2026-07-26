import { cookies, draftMode, headers } from 'next/headers'
import { cache } from 'react'

import { LIVE_PREVIEW_COOKIE } from './live-preview'
import { hasPreviewSession } from './session'

export type PreviewMode = {
  /** Draft mode is on and the reader is entitled to it, so drafts render. */
  draft: boolean
  /** The page is being rendered inside the admin's Live Preview iframe. */
  live: boolean
}

const PUBLIC: PreviewMode = { draft: false, live: false }

/**
 * How the current request should be rendered.
 *
 * Draft mode is only honoured for a request that still carries an editorial
 * Payload session. The cookie Next.js sets proves nothing by itself, so it is
 * treated as an intent to preview rather than as permission: a stale or copied
 * one falls back to exactly what a reader sees, which for an unpublished
 * document is a 404.
 *
 * `live` is narrower still. An editor who clicked "Preview" is reading the site
 * in a normal tab and needs the draft banner and its exit link; an editor
 * inside the Live Preview iframe has the admin's own controls around them and
 * needs the refresh listener instead.
 *
 * Memoized per request so the layout, the page, and `generateMetadata` share
 * one session check rather than authenticating three times.
 */
export const getPreviewMode = cache(async (): Promise<PreviewMode> => {
  const draft = await draftMode()
  // Public traffic carries no draft cookie and must never pay for the check.
  if (!draft.isEnabled) return PUBLIC

  const [jar, requestHeaders] = await Promise.all([cookies(), headers()])
  if (!(await hasPreviewSession(requestHeaders))) return PUBLIC

  return {
    draft: true,
    live: jar.get(LIVE_PREVIEW_COOKIE)?.value === '1',
  }
})
