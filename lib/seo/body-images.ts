// The images a document's body actually carries.
//
// The page's own structured data described one image — the featured one — and
// nothing ever looked inside the body, so an article with six photographs in it
// told a crawler about one of them. `Article.image` is read by image search,
// and a list of the real images on the page is the cheapest part of the answer
// to "what is on this URL".
//
// Three places an image can sit, and this covers all three:
//
//   - a Lexical `upload` node — the rich-text editor's own image
//   - a block that carries images: gallery, image-and-text, feature list,
//     bookmark
//   - an `<img>` in preserved Ghost markup, for a migrated body that has any
//
// Pure: it takes the body the page query already resolved, so it costs no extra
// read and can be unit tested without Payload.
//
// **What it deliberately does not do.** A media relationship that the query did
// not populate arrives as a bare id, and this drops it rather than guessing at
// a URL — the page query runs at `depth: 1` for exactly this reason. A gated
// post is passed its teaser, so the images in the withheld part are not in the
// value this is given and cannot leak into the structured data.

import {
  BOOKMARK_BLOCK,
  FEATURE_LIST_BLOCK,
  GALLERY_BLOCK,
  MEDIA_TEXT_BLOCK,
} from '../../blocks/schema'
import type { ArticleBody, BodyNode } from '../content/body'
import { toMediaImage } from '../content/media'
import { absoluteUrl } from './site'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The image values one module contributes, in the order it stores them.
 *
 * The four block slugs are listed rather than the function iterating every
 * field: a module can hold an upload for a reason that is not a picture of the
 * subject — an author portrait in a callout, a logo in a bookmark's link card —
 * and sweeping in whichever uploads happen to exist would describe the page
 * with things a reader would not call its images.
 */
function blockImageValues(
  fields: Record<string, unknown> | undefined,
): unknown[] {
  if (!fields) return []

  switch (fields.blockType) {
    case GALLERY_BLOCK: {
      const rows = Array.isArray(fields.images) ? fields.images : []
      return rows.map((row) => (isRecord(row) ? row.image : undefined))
    }
    case MEDIA_TEXT_BLOCK:
    case BOOKMARK_BLOCK:
      return [fields.image]
    case FEATURE_LIST_BLOCK: {
      const rows = Array.isArray(fields.items) ? fields.items : []
      return rows.map((row) => (isRecord(row) ? row.image : undefined))
    }
    default:
      return []
  }
}

/** Every image value under a list of Lexical nodes, in document order. */
function collectLexicalImages(
  nodes: readonly BodyNode[],
  into: unknown[],
): void {
  for (const node of nodes) {
    if (node.type === 'upload') {
      into.push(node.value)
    } else if (node.type === 'block') {
      into.push(...blockImageValues(node.fields))
    }

    if (Array.isArray(node.children)) collectLexicalImages(node.children, into)
  }
}

const IMAGE_SOURCE =
  /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi

/**
 * A `src` attribute's value as an absolute URL, or null when it is not one.
 *
 * Two artefacts of the Ghost import reach these attributes — entity-encoded
 * quotes (`&quot;`) and backslash-escaped ones (`\"`). The second is not
 * hypothetical: one migrated body carries it in every link, which is what
 * `repairEscapedQuotes` exists for. A value wrapped in either is not a URL until
 * the wrapper is gone, and one that is left wrapped resolves against the site
 * origin into a path that 404s — a broken image named in structured data is
 * worse than no image named at all.
 */
function toSrcUrl(raw: string, siteUrl: string): string | null {
  const cleaned = raw
    .replace(/&quot;/gi, '"')
    .replace(/\\"/g, '"')
    .replace(/&amp;/gi, '&')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()

  if (!cleaned) return null
  // `data:` is an inline payload rather than a fetchable image, and the rest
  // are not images at all.
  if (/^(data|javascript|mailto|tel):/i.test(cleaned)) return null

  return absoluteUrl(cleaned, siteUrl)
}

/** One candidate as an absolute URL, or null when it has none. */
function toImageUrl(candidate: unknown, siteUrl: string): string | null {
  if (typeof candidate === 'string') return toSrcUrl(candidate, siteUrl)

  const image = toMediaImage(candidate)
  return image ? absoluteUrl(image.url, siteUrl) : null
}

/**
 * The absolute URLs of the images in a body, in document order and without
 * repeats.
 *
 * Repeats are dropped because a gallery can legitimately show the same upload
 * twice and a list of one URL twice says nothing extra to a crawler.
 */
export function collectBodyImages(
  body: ArticleBody,
  siteUrl: string,
): string[] {
  const candidates: unknown[] = []

  if (body.kind === 'lexical') {
    collectLexicalImages(body.content?.root?.children ?? [], candidates)
  } else if (body.kind === 'html') {
    for (const match of body.html.matchAll(IMAGE_SOURCE)) {
      candidates.push(match[1] ?? match[2] ?? match[3] ?? '')
    }
  } else {
    return []
  }

  const images: string[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const url = toImageUrl(candidate, siteUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    images.push(url)
  }

  return images
}
