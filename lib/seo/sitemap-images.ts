// Which images a post's sitemap entry lists, decided without a database.
//
// Google discovers most images by rendering a page, but an image sitemap
// entry states "this picture belongs to this article" outright, and is how a
// picture gets found before the page is re-rendered. Each post lists its
// featured image and the images in its body — the same pictures the page
// shows, and no others.

import { normalizeMediaUrl } from '../content/media'
import { isEmptyRichText } from '../content/richtext'

/** Where uploads are served from; the only image paths this site vouches for. */
const MEDIA_PATH = '/api/media/file/'

type Node = {
  type?: string
  relationTo?: unknown
  value?: unknown
  children?: Node[]
}

/** The id a relationship holds, populated or not. */
function relationId(value: unknown): string | null {
  const id =
    typeof value === 'object' && value !== null
      ? (value as { id?: unknown }).id
      : value
  return typeof id === 'number' || (typeof id === 'string' && id)
    ? String(id)
    : null
}

/** Media ids of every image placed in a rich-text body, in reading order. */
export function bodyMediaIds(content: unknown): string[] {
  const ids: string[] = []
  const walk = (nodes: Node[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'upload' && node.relationTo === 'media') {
        const id = relationId(node.value)
        if (id) ids.push(id)
      } else walk(node.children)
    }
  }
  walk((content as { root?: { children?: Node[] } } | null)?.root?.children)
  return ids
}

/**
 * `src`s in preserved Ghost HTML that this site serves itself.
 *
 * Anything else — a Ghost `/content/images/` path the migration rewrote or
 * missed, a hotlink — is either not ours to vouch for or not there at all.
 */
export function legacyMediaPaths(html: unknown): string[] {
  if (typeof html !== 'string' || !html) return []
  const paths: string[] = []
  for (const [, src] of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*"([^"]+)"/gi)) {
    const path = src.replace(/^https?:\/\/[^/]+/i, '')
    if (path.startsWith(MEDIA_PATH)) paths.push(normalizeMediaUrl(path))
  }
  return paths
}

export type PostImageSource = {
  featuredImage?: unknown
  content?: unknown
  legacyHTML?: unknown
  visibility?: unknown
}

/** Every Media id a post's entry needs resolved to a URL. */
export function postMediaIds(post: PostImageSource): string[] {
  const featured = relationId(post.featuredImage)
  return [...(featured ? [featured] : []), ...bodyMediaIds(post.content)]
}

/**
 * The image paths a post's sitemap entry lists: featured image first, then the
 * body's, each once.
 *
 * The body is read the way the page reads it — rich text when it has any, else
 * the Ghost HTML — and **not at all for a members-only or subscriber-only
 * post**, whose body a crawler is served only the opening of. Listing a picture
 * the page does not show is a claim the page contradicts.
 *
 * `urls` maps a Media id to its file path; an id missing from it (deleted,
 * trashed, never uploaded) is skipped rather than guessed at.
 */
export function postImagePaths(
  post: PostImageSource,
  urls: ReadonlyMap<string, string>,
): string[] {
  const resolve = (id: string | null) => (id ? urls.get(id) : undefined)
  const paths: string[] = []

  const featured = resolve(relationId(post.featuredImage))
  if (featured) paths.push(featured)

  const visibility = post.visibility ?? 'public'
  if (visibility === 'public') {
    if (!isEmptyRichText(post.content)) {
      for (const id of bodyMediaIds(post.content)) {
        const path = resolve(id)
        if (path) paths.push(path)
      }
    } else {
      paths.push(...legacyMediaPaths(post.legacyHTML))
    }
  }

  return [...new Set(paths)]
}
