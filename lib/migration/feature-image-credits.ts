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
// The markup does not survive into `credit`, which is a plain text field React
// escapes — keeping the `<a>` there would show readers a literal tag. The
// photographer's name is the part that carries the attribution and it is
// inside the anchor text, so stripping tags preserves what matters.
//
// **The address does survive now, into `media.creditURL`.** The first version
// of this dropped it, on the grounds that the link was decorated with
// `utm_source=ghost` parameters that would be wrong on this site. That was
// right about the parameters and wrong about the link: Unsplash's API
// guidelines ask for an attribution that reaches the photographer's profile,
// and the profile URL is the only part of this the site cannot reconstruct
// from anything else. So the href is kept, its `utm_*` parameters are stripped
// (`withoutTrackingParams`), and the ones this site wants are added back when
// the link is rendered. See `lib/content/attribution.ts` and
// `docs/STOCK_IMAGERY.md`.

import { toCreditURL, withoutTrackingParams } from '../content/attribution'

import { ghostData, isGhostPage, type GhostExport } from './ghost-export'

/** A credit recovered from the export, keyed by the image it belongs to. */
export interface RecoveredCredit {
  /** The Ghost feature image URL — matches `media.ghostURL`. */
  ghostURL: string
  /** Plain-text credit, ready for `media.credit`. */
  credit: string
  /**
   * The photographer's profile, ready for `media.creditURL`.
   *
   * Null where the caption was text with no link in it, which is a credit the
   * site can still show — just not one it can point anywhere.
   */
  creditURL: string | null
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

function decodeEntities(value: string): string {
  let text = value
  for (const [pattern, replacement] of ENTITIES) {
    text = text.replace(pattern, replacement)
  }
  return text
}

/**
 * Reduce Ghost's caption markup to the text a reader would have seen.
 *
 * Tags first, then entities: decoding first would turn `&lt;b&gt;` into a tag
 * the tag-stripper then eats, losing text that was never markup to begin with.
 */
export function captionToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The address a Ghost caption linked to, ready to store.
 *
 * The opposite order from `captionToPlainText`, and deliberately: here the
 * href is read out of the markup *before* entities are decoded, because Ghost
 * writes the separators as `&amp;` and a URL with a literal `&amp;` between
 * its parameters is a different URL. Decoding the extracted value rather than
 * the whole caption also means an `&lt;` in the surrounding prose cannot
 * manufacture a tag boundary that moves where the href appears to end.
 *
 * Returns null for a caption with no link, and for any href that is not a
 * plain https address — `toCreditURL` is the same gate the field and the
 * renderer use, so nothing reaches the database that the page would refuse.
 */
export function captionToCreditURL(
  html: string | null | undefined,
): string | null {
  if (!html) return null

  const match = /<a\b[^>]*?\shref\s*=\s*["']([^"']*)["']/i.exec(html)
  if (!match) return null

  const url = toCreditURL(decodeEntities(match[1]!))
  return url ? withoutTrackingParams(url) : null
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
        creditURL: captionToCreditURL(caption),
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
