// Recovering the photo credits Ghost carried for feature images.
//
// Ghost stores `feature_image_alt` and `feature_image_caption` in `posts_meta`,
// not on the post. `lib/migration/plan.ts` already loads that table and reads
// four fields from it — `meta_title`, `meta_description`, `og_image`,
// `twitter_image` — but the two image fields were never in `GhostPostMeta`, so
// the import passed straight over them with the record in hand.
//
// On this publication the caption is a credit every time: 110 of them, every
// one of the form `Photo by <name> / Unsplash`, wrapped in the `<span
// style="white-space: pre-wrap;">` markup Ghost's editor emits and carrying a
// link to the photographer's Unsplash profile. So the destination is
// `media.credit`, which `FeaturedFigure` in `app/(frontend)/components/
// article.tsx` already renders in its own span — not `media.caption`, which
// would read as editorial description of the picture.
//
// The markup does not survive. `credit` is a plain text field and React escapes
// what it renders, so keeping the `<a>` would show readers a literal tag. The
// photographer's name is the part that carries the attribution, and it is
// inside the anchor text, so stripping tags preserves what matters and drops a
// link decorated with `utm_source=ghost` tracking parameters that would be
// wrong on this site anyway.

import { ghostData, isGhostPage, type GhostExport } from './ghost-export'

/** A credit recovered from the export, keyed by the image it belongs to. */
export interface RecoveredCredit {
  /** The Ghost feature image URL — matches `media.ghostURL`. */
  ghostURL: string
  /** Plain-text credit, ready for `media.credit`. */
  credit: string
  /** The post or page it came from, for the report. */
  slug: string
  kind: 'post' | 'page'
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
]

/**
 * Reduce Ghost's caption markup to the text a reader would have seen.
 *
 * Tags first, then entities: decoding first would turn `&lt;b&gt;` into a tag
 * the tag-stripper then eats, losing text that was never markup to begin with.
 */
export function captionToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  let text = html.replace(/<[^>]*>/g, '')
  for (const [pattern, replacement] of ENTITIES) {
    text = text.replace(pattern, replacement)
  }
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Every feature-image credit in an export, keyed by the image URL.
 *
 * Keyed by URL rather than by post because `media` is deduplicated on
 * `ghostURL` — two posts sharing an image share one document, and one of them
 * would otherwise overwrite the other's credit. Where that happens the first
 * one wins and the collision is reported rather than silently resolved.
 */
export function collectFeatureImageCredits(ghost: GhostExport): {
  credits: RecoveredCredit[]
  /** Images two or more documents credit differently. */
  conflicts: Array<{ ghostURL: string; credits: string[] }>
  /** Captions that were markup with no text inside. */
  empty: string[]
} {
  const data = ghostData(ghost)
  const metaByPost = new Map(
    (data.posts_meta ?? []).map((meta) => [meta.post_id, meta]),
  )

  const byUrl = new Map<string, RecoveredCredit>()
  const conflicting = new Map<string, Set<string>>()
  const empty: string[] = []

  for (const post of data.posts ?? []) {
    const caption = metaByPost.get(post.id)?.feature_image_caption
    const image = post.feature_image
    if (!caption || !image) continue

    const credit = captionToPlainText(caption)
    const slug = post.slug ?? post.id
    if (!credit) {
      empty.push(slug)
      continue
    }

    const existing = byUrl.get(image)
    if (!existing) {
      byUrl.set(image, {
        ghostURL: image,
        credit,
        slug,
        kind: isGhostPage(post) ? 'page' : 'post',
      })
    } else if (existing.credit !== credit) {
      const seen = conflicting.get(image) ?? new Set([existing.credit])
      seen.add(credit)
      conflicting.set(image, seen)
    }
  }

  return {
    credits: [...byUrl.values()],
    conflicts: [...conflicting].map(([ghostURL, credits]) => ({
      ghostURL,
      credits: [...credits],
    })),
    empty,
  }
}
