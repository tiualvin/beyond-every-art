// The Beyond Every Art mark, kept as geometry rather than as an image file, so
// the masthead and the favicons are one drawing instead of two files that
// happen to look alike. `scripts/render-brand-icons.ts` writes `app/icon.svg`,
// `app/apple-icon.png` and `app/favicon.ico` from what is below, and
// `tests/design/logo.test.ts` fails if the committed `app/icon.svg` has drifted
// from it.
//
// It also has to live outside `public/`. `output: 'standalone'` does not copy
// that directory and nothing in the Dockerfile does either — see the long note
// beside the `COPY` lines there — so a mark parked in `public/` would render
// perfectly under `next dev` and 404 in production. An inline component and the
// `app/` metadata file conventions both ship inside the build.
//
// --- The drawing ---------------------------------------------------------
//
// An open book whose outer page swells into a heart, drawn as a single path
// with `fill-rule: evenodd`: one outer silhouette followed by the two counters
// that are the pages. Every number is a circle, so the outline can be reasoned
// about rather than nudged:
//
//   arch   centre (146, 202), r 122 — the book: a semicircular top on a
//          straight left edge, standing on the base bar at y 456
//   lobe   centre (356, 330), r 126 — the heart, whose lowest point is exactly
//          on that base bar, which is what gives the mark one flat foot
//   line   24 — the weight of the outline, so each counter is its own shape
//          inset by 24 (arch r 98, lobe r 102) and the spine is one line wide
//
// The two shapes cross in a cleft at (268, 240). Eroding a corner like that by
// the line weight leaves an arc of radius 24 centred on the cleft, and because
// the cleft sits *on* the lobe's circle, that arc is tangent to the lobe's
// counter — 24 + 102 = 126, the lobe's own radius. The counters close without a
// seam because of that coincidence, so moving the lobe means redoing the
// arithmetic, not eyeballing the result.

/**
 * The drawing's own bounds, so an inline mark's box hugs the ink instead of
 * carrying the whitespace a square frame would add. Exact rather than measured:
 * the arch's top is 202 − 122 and the lobe's right edge is 356 + 126.
 */
export const LOGO_MARK_VIEWBOX = '24 80 458 376'

/**
 * The mark as one `evenodd` path: outer silhouette, then the spine-side page,
 * then the outer page.
 */
export const LOGO_MARK_PATH =
  'M24 456V202A122 122 0 0 1 268 202V240A126 126 0 1 1 356 456Z' +
  'M48 432V202A98 98 0 0 1 146 104V432Z' +
  'M170 432V107A98 98 0 0 1 244 202V240A24 24 0 0 0 285 257A102 102 0 0 0 356 432Z'

/** Deep end of the mark's ink, at the top-left of the book. */
export const LOGO_INK_DEEP = '#6b0000'

/** Bright end, out at the right of the heart. */
export const LOGO_INK_BRIGHT = '#8f0409'

/**
 * The gradient's id inside a rendered mark. A document with two marks in it
 * would repeat the id, which is invalid but harmless — both definitions are the
 * same gradient, so whichever one the browser resolves paints the same ink.
 */
export const LOGO_GRADIENT_ID = 'bea-mark-ink'

/**
 * The mark framed for a square tile: the drawing centred with a 20-unit margin
 * at its left and right. A favicon is small enough that the padding a display
 * lockup wants would cost most of the legibility.
 */
export const LOGO_ICON_VIEWBOX = '4 19 498 498'

type IconOptions = {
  /**
   * Pixel width and height to declare, for a rasteriser that needs to be told
   * what size to render at. Omitted for the favicon itself, which is left
   * scalable so a browser can ask for whatever its tab strip wants.
   */
  size?: number
}

/**
 * The mark as a standalone SVG document, framed as a square icon.
 *
 * Written out by hand rather than through a serializer so that the committed
 * `app/icon.svg` is stable byte for byte and its diff is readable.
 */
export function logoIconSvg({ size }: IconOptions = {}): string {
  const dimensions = size ? ` width="${size}" height="${size}"` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_ICON_VIEWBOX}"${dimensions} role="img" aria-label="Beyond Every Art">
  <defs>
    <linearGradient id="${LOGO_GRADIENT_ID}" x1="0.05" y1="0.05" x2="0.95" y2="0.95">
      <stop offset="0" stop-color="${LOGO_INK_DEEP}" />
      <stop offset="1" stop-color="${LOGO_INK_BRIGHT}" />
    </linearGradient>
  </defs>
  <path fill="url(#${LOGO_GRADIENT_ID})" fill-rule="evenodd" d="${LOGO_MARK_PATH}" />
</svg>
`
}
