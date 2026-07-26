import { cookies, draftMode } from 'next/headers'

import { LIVE_PREVIEW_COOKIE } from './live-preview'

export type PreviewMode = {
  /** Draft mode is on, so unpublished content renders. */
  draft: boolean
  /** The page is being rendered inside the admin's Live Preview iframe. */
  live: boolean
}

/**
 * How the current request should be rendered.
 *
 * `live` is deliberately narrower than `draft`: an editor who clicked "Preview"
 * is reading the site in a normal tab and needs the draft banner and its exit
 * link, while an editor inside the Live Preview iframe has the admin's own
 * controls around them and needs the refresh listener instead.
 */
export async function getPreviewMode(): Promise<PreviewMode> {
  const [draft, jar] = await Promise.all([draftMode(), cookies()])
  const draftEnabled = draft.isEnabled
  return {
    draft: draftEnabled,
    live: draftEnabled && jar.get(LIVE_PREVIEW_COOKIE)?.value === '1',
  }
}
