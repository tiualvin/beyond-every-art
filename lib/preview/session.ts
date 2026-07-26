import { getPayloadClient } from '../payload'
import { isPreviewRole } from './live-preview'

/**
 * Whether a request carries a Payload admin session allowed to see drafts.
 *
 * Checked twice on purpose: once by `/api/preview` before draft mode is turned
 * on, and again while rendering. Draft mode on its own is a bare cookie with no
 * identity attached, so without the second check anyone who obtained one —
 * copied from a shared browser, kept after an account was removed — could read
 * every unpublished document, including the `members` and `paid` posts that
 * stay staff-only until subscriber access is rebuilt.
 */
export async function hasPreviewSession(
  requestHeaders: Headers,
): Promise<boolean> {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: requestHeaders })
    return isPreviewRole(user)
  } catch {
    // A database or configuration failure must not read as a valid session.
    return false
  }
}
