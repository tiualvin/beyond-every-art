// Stable `id` attributes for the headings inside a body.
//
// A heading without an `id` cannot be linked to, which costs more than the
// convenience of a copyable deep link: search engines build "jump to section"
// results out of anchored headings, and an article about how one pigment
// behaves in four binders is exactly the shape that wants its sections
// addressable individually rather than as one page.
//
// The rules here are deliberately not `slugFromTitle` in `lib/seo/slug-format.ts`.
// That function derives a *stored* slug and is allowed to return an empty
// string, because an editor is standing there to be asked for a better one. An
// anchor is generated at render time with nobody to ask, so it must always
// produce something addressable, and it must be unique within the document —
// two sections called "Method" are an ordinary thing to write and a duplicate
// `id` is invalid HTML that makes both anchors ambiguous.

/** A serialized Lexical node, as much of one as an anchor needs to see. */
type TextNode = {
  text?: string
  children?: TextNode[]
}

/** Used when a heading has no usable characters at all — "第一章", or "?!". */
const FALLBACK_ANCHOR = 'section'

/**
 * The readable text of a heading node, including nested formatting runs.
 *
 * Trimming happens once, at the end. Trimming each recursive call instead
 * would eat the space either side of an emphasised phrase and fuse its
 * neighbours: "Why *burnt sienna* behaves" would anchor as
 * `whyburnt-siennabehaves`.
 */
export function headingText(node: TextNode): string {
  return collectText(node).trim()
}

function collectText(node: TextNode): string {
  const own = node.text ?? ''
  const children = (node.children ?? []).map(collectText).join('')
  return `${own}${children}`
}

/**
 * The anchor a heading's text wants, before uniqueness is considered.
 *
 * Diacritics are folded rather than dropped, so "Découpage" anchors as
 * `decoupage` instead of `d-coupage`. Everything outside `a-z0-9` then
 * collapses to a single hyphen, which is the same shape `SLUG_PATTERN` allows
 * for stored slugs — an anchor and a slug should not look like they came from
 * different systems.
 *
 * Returns the empty string when nothing survives; `createAnchorAllocator` is
 * what turns that into a usable id.
 */
export function toAnchorSlug(text: string): string {
  return (
    text
      .normalize('NFKD')
      // Combining marks left behind by the decomposition above.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Apostrophes join rather than separate: "artist's" is one word.
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}

/**
 * An allocator that hands out a unique anchor per call.
 *
 * Stateful by design, and the state is one document's worth: call it once per
 * render so the counter starts clean. A repeat of an anchor already given out
 * gets `-2`, then `-3`, matching what readers are used to from every other
 * anchor scheme they have met.
 *
 * The suffixed candidate is itself checked against the set rather than assumed
 * free, because a document can legitimately contain "Method", "Method" and
 * "Method 2" — the third heading would otherwise be handed `method-2` twice.
 */
export function createAnchorAllocator(): (text: string) => string {
  const used = new Set<string>()

  return (text: string): string => {
    const base = toAnchorSlug(text) || FALLBACK_ANCHOR

    let candidate = base
    let suffix = 1
    while (used.has(candidate)) {
      suffix += 1
      candidate = `${base}-${suffix}`
    }

    used.add(candidate)
    return candidate
  }
}
