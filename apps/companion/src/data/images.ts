// Every image an article shows, so saving it can keep them for offline.

import type { Media, PostDetail } from '../api/contract'
import { htmlImageUrls, parseHtml } from '../reader/html'

const isMedia = (value: unknown): value is Media =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as Media).url === 'string' &&
  'alt' in (value as object) &&
  'cardUrl' in (value as object)

function mediaIn(value: unknown): Media[] {
  if (Array.isArray(value)) return value.flatMap(mediaIn)
  if (!value || typeof value !== 'object') return []
  if (isMedia(value)) return [value]
  return Object.values(value).flatMap(mediaIn)
}

export function articleImageUrls(post: PostDetail): string[] {
  const media = [...(post.image ? [post.image] : []), ...mediaIn(post.body)]
  const urls = media.flatMap((item) => [
    item.url,
    ...(item.cardUrl ? [item.cardUrl] : []),
  ])
  if (post.body.kind === 'html')
    urls.push(...htmlImageUrls(parseHtml(post.body.html, post.href)))
  return [...new Set(urls)]
}
