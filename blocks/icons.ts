// Small drawings for the block picker.
//
// The picker listed fourteen modules as a column of names. "Media text" and
// "Feature list" are not words that tell an editor what they are about to
// insert, and the only way to find out was to insert one and look — which on a
// published article means inserting it, looking, and deleting it again.
//
// These are `data:` URIs rather than files in `public/`. Payload takes a URL
// string, a data URI is one, and `img-src` in `lib/security/csp.ts` already
// permits `data:` — its comment says "for inlined icons", which is this. The
// alternative is a public asset directory that has to survive the Dockerfile's
// copy steps and the R2 rewrite, for fourteen pictures that are under 300 bytes
// each.
//
// One fixed colour, not `currentColor`: these render inside an `<img>`, where a
// stylesheet cannot reach them. The muted ink below is legible on the admin's
// paper background and on its dark theme, which is the whole requirement.

const STROKE = '#6f665c'

/**
 * A 20x20 line drawing, as a URL the admin can put in an `img`.
 *
 * `encodeURIComponent` rather than base64: the result is shorter, and it stays
 * readable in a diff, which matters for a file whose whole content is markup
 * nobody can see rendered.
 */
function icon(body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" ` +
    `stroke="${STROKE}" stroke-width="1.4" stroke-linecap="round" ` +
    `stroke-linejoin="round">${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Stacked lines, the shorthand for a run of text. */
const lines = (ys: number[], x1 = 3, x2 = 17): string =>
  ys.map((y) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`).join('')

export const BLOCK_ICONS = {
  accordion: icon(
    `<rect x="2.5" y="3" width="15" height="4.5" rx="1"/>` +
      `<rect x="2.5" y="10" width="15" height="7" rx="1"/>` +
      `<path d="M13 5.25h2"/>`,
  ),
  pullQuote: icon(
    `<path d="M4 12c0-3 1.5-5 4-5.5M11 12c0-3 1.5-5 4-5.5"/>` +
      `<path d="M4 12h3v3H4zM11 12h3v3h-3z"/>`,
  ),
  signup: icon(
    `<rect x="2.5" y="5" width="15" height="10" rx="1.5"/>` +
      `<path d="m3.5 6.5 6.5 5 6.5-5"/>`,
  ),
  callout: icon(
    `<rect x="2.5" y="4" width="15" height="12" rx="1.5"/>` +
      `<path d="M10 7.5v3.5M10 13h.01"/>`,
  ),
  button: icon(`<rect x="3" y="7" width="14" height="6" rx="3"/>`),
  gallery: icon(
    `<rect x="2.5" y="4" width="15" height="12" rx="1.5"/>` +
      `<circle cx="7" cy="8" r="1.3"/><path d="m3.5 14 4-4 3.5 3 3-2.5 2.5 2"/>`,
  ),
  bookmark: icon(`<path d="M5 3h10v14l-5-3.5L5 17z"/>`),
  embed: icon(
    `<rect x="2.5" y="4" width="15" height="12" rx="1.5"/>` +
      `<path d="m8.5 8 3 2-3 2z"/>`,
  ),
  paywall: icon(
    `<rect x="4" y="9" width="12" height="7" rx="1.5"/>` +
      `<path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>`,
  ),
  keyTakeaways: icon(
    `<path d="m3 5.5 1.5 1.5L7.5 4M3 10.5 4.5 12l3-3M3 15.5 4.5 17l3-3"/>` +
      lines([5.5, 10.5, 15.5], 10, 17),
  ),
  faq: icon(
    `<circle cx="10" cy="10" r="7"/>` +
      `<path d="M8.2 8a1.8 1.8 0 1 1 1.8 2v1M10 14h.01"/>`,
  ),
  featureList: icon(
    `<circle cx="4.5" cy="5.5" r="1.3"/><circle cx="4.5" cy="10" r="1.3"/>` +
      `<circle cx="4.5" cy="14.5" r="1.3"/>` +
      lines([5.5, 10, 14.5], 8, 17),
  ),
  mediaText: icon(
    `<rect x="2.5" y="5" width="7" height="10" rx="1"/>` +
      lines([7, 10, 13], 12, 17.5),
  ),
  comparisonTable: icon(
    `<rect x="2.5" y="4" width="15" height="12" rx="1"/>` +
      `<path d="M2.5 8h15M8 4v12M13 4v12"/>`,
  ),
} as const

export type BlockIconName = keyof typeof BLOCK_ICONS

/**
 * How the picker groups the fourteen modules.
 *
 * Named for what an editor is trying to do rather than for how the module is
 * built — "Audience" holds the signup and the members-only cut because both are
 * about who is reading, not because they share any implementation.
 */
export const BLOCK_GROUPS = {
  accordion: 'Text',
  pullQuote: 'Text',
  callout: 'Text',
  keyTakeaways: 'Text',
  faq: 'Text',
  gallery: 'Media',
  mediaText: 'Media',
  embed: 'Media',
  bookmark: 'Media',
  featureList: 'Lists & tables',
  comparisonTable: 'Lists & tables',
  button: 'Lists & tables',
  signup: 'Audience',
  paywall: 'Audience',
} as const satisfies Record<BlockIconName, string>
