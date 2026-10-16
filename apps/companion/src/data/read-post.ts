// One article, from the website or, failing that, from the device.

import type { ApiClient } from '../api/client'
import type { PostDetail } from '../api/contract'
import type { LibraryStore } from '../library/types'

export type PostRead =
  | { post: PostDetail; source: 'network' }
  /** A saved copy: the network failed, or the website no longer has it. */
  | { post: PostDetail; source: 'saved'; goneFromWebsite: boolean }
  | { post: null; source: 'network' }

/**
 * Reads an article, keeping a saved copy current and falling back to it.
 *
 * A saved article is refreshed whenever it is read online, so the offline
 * copy is the latest the reader has seen — including a post that has since
 * become members-only, whose saved copy becomes the teaser, as the website
 * would now show it. If the network fails, the saved copy is the answer; if
 * the website no longer has the article, the saved copy is still readable and
 * says so.
 */
export async function readPost(
  api: ApiClient,
  library: LibraryStore,
  slug: string,
): Promise<PostRead> {
  let fresh: PostDetail | null
  try {
    fresh = await api.getPost(slug)
  } catch (error) {
    const saved = await library.getSaved(slug)
    if (saved) return { post: saved, source: 'saved', goneFromWebsite: false }
    throw error
  }

  const saved = await library.getSaved(slug)
  if (fresh) {
    if (saved) await library.saveArticle(fresh)
    return { post: fresh, source: 'network' }
  }
  return saved
    ? { post: saved, source: 'saved', goneFromWebsite: true }
    : { post: null, source: 'network' }
}
