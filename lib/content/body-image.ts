// An image placed in an article's rich-text body, as the page renders it.
//
// The editor's upload node holds a Media relationship and, optionally, a
// caption and credit of its own for that placement (`BODY_IMAGE_FIELDS` in
// `lib/content/editor.ts`). This decides what a figure shows from the two,
// once, so the figure, its ImageObject JSON-LD and the sitemap's image entries
// cannot describe one picture three ways.

import type { BodyNode, BodyRoot } from './body'
import { toMediaImage, type MediaImage } from './media'

export type BodyImage = {
  image: MediaImage
  /** The placement's caption, else the Media record's. */
  caption: string | null
  /** The placement's credit, else the Media record's. */
  credit: string | null
  /**
   * Where the credit links, vetted by `toCreditURL`. Only ever the Media
   * record's own link, and only when the credit shown is the record's: a
   * placement that names somebody else must not inherit a link to whoever the
   * record credits.
   */
  creditURL: string | null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

/** True for a Lexical upload node pointing at the Media collection. */
export function isMediaUploadNode(node: BodyNode | null | undefined): boolean {
  return node?.type === 'upload' && node.relationTo === 'media'
}

/**
 * The figure an upload node renders as, or null.
 *
 * Null when the node is not a Media upload, or when its relationship arrived
 * unpopulated or points at a record with no file — a draft mid-edit, a read
 * made too shallow, an image since deleted. Nothing is rendered for those
 * rather than a broken frame, as the gallery does.
 */
export function toBodyImage(
  node: BodyNode | null | undefined,
): BodyImage | null {
  if (!node || !isMediaUploadNode(node)) return null
  const image = toMediaImage(node.value)
  if (!image) return null

  const fields = (node.fields ?? {}) as Record<string, unknown>
  const ownCredit = text(fields.credit)
  const credit = ownCredit ?? image.credit

  return {
    image,
    caption: text(fields.caption) ?? image.caption,
    credit,
    creditURL: credit && credit === image.credit ? image.creditURL : null,
  }
}

/**
 * Every body image in a rich-text body, in reading order.
 *
 * Walks the whole tree rather than the top level: an upload is a top-level
 * node when the editor makes one, but nothing stops one arriving inside a list
 * item from an import, and an image the page shows should not be missing from
 * what it says about itself.
 */
export function collectBodyImages(
  content: BodyRoot | null | undefined,
): BodyImage[] {
  const found: BodyImage[] = []
  const walk = (nodes: BodyNode[] | undefined) => {
    for (const node of nodes ?? []) {
      const image = toBodyImage(node)
      if (image) found.push(image)
      else walk(node.children)
    }
  }
  walk(content?.root?.children)
  return found
}
