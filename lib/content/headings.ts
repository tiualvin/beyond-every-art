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

// --- Anchors a heading keeps --------------------------------------------
//
// A heading converted from a migrated article keeps the `id` Ghost gave it,
// stored on the node itself as Lexical node state: `{ "$": { "anchor": "…" } }`.
// Those ids are not always what `toAnchorSlug` would make — Ghost numbers a
// repeat `pros-1` where this file numbers it `pros-2`, and drops characters
// this file turns into hyphens — and they are the addresses search engines
// already show as sitelinks under the article. Deriving them again from the
// text would move them; rewording a heading would move them again.
//
// Node state is Lexical's own mechanism for exactly this: a key it does not
// recognise is carried through import and export untouched, so the anchor
// survives an editor opening and saving the article in the admin panel
// (`tests/content/heading-anchors.test.ts` loads one through the real editor
// to check). The Markdown tools carry it as a `{#anchor}` suffix on the
// heading line — see `lib/mcp/anchors.ts`.

/**
 * What a kept anchor may be: Ghost's ids and this file's slugs both fit, and
 * nothing that would need escaping in an attribute, a URL fragment or a
 * Markdown heading does.
 */
export const KEPT_ANCHOR = /^[A-Za-z0-9][A-Za-z0-9_.%-]{0,199}$/

/** The anchor a heading node keeps, or null when it derives one from its text. */
export function keptAnchor(node: unknown): string | null {
  const state = (node as { $?: { anchor?: unknown } } | null | undefined)?.$
  const anchor = state?.anchor
  return typeof anchor === 'string' && KEPT_ANCHOR.test(anchor) ? anchor : null
}

/** Every anchor kept by a heading among `nodes`, so an allocator can step round them. */
export function keptAnchors(
  nodes: Array<{ type?: string }> | undefined,
): Set<string> {
  const anchors = new Set<string>()
  for (const node of nodes ?? []) {
    if (node.type !== 'heading') continue
    const anchor = keptAnchor(node)
    if (anchor) anchors.add(anchor)
  }
  return anchors
}

/** Hands out one anchor per call; see `createAnchorAllocator`. */
export type AnchorAllocator = (text: string, kept?: string | null) => string

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
 *
 * `reserved` are the anchors headings in this document keep
 * (`keptAnchors`). Nothing derived from text is handed one of those, so an
 * FAQ question or a later heading can never take the address a migrated
 * section already has, whichever renders first. A heading passes its own kept
 * anchor as `kept` and gets it back — unless an earlier heading already
 * claimed it, as a heading copied in the admin panel along with its state
 * would, in which case it falls back to its text like any other.
 */
export function createAnchorAllocator(
  reserved: Iterable<string> = [],
): AnchorAllocator {
  const used = new Set<string>()
  const held = new Set(reserved)

  return (text: string, kept?: string | null): string => {
    if (kept && KEPT_ANCHOR.test(kept) && !used.has(kept)) {
      used.add(kept)
      return kept
    }

    const base = toAnchorSlug(text) || FALLBACK_ANCHOR

    let candidate = base
    let suffix = 1
    while (used.has(candidate) || held.has(candidate)) {
      suffix += 1
      candidate = `${base}-${suffix}`
    }

    used.add(candidate)
    return candidate
  }
}
