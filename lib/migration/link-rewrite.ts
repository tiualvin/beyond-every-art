// Pure helper for resolving Ghost's `__GHOST_URL__` placeholder in ordinary
// links.
//
// `media-rewrite.ts` is the sibling of this file and covers the media case: it
// swaps a migrated asset's old URL for its new one, keyed on the media map the
// import built. That map only ever contains media, so a placeholder sitting in
// an `href` to another article was never a candidate for replacement —
// `resolveUrl` in `media-import.ts` expands the placeholder too, but only far
// enough to download a file.
//
// Nothing else in the import path touched it, so those links shipped verbatim.
// A browser reads `href="__GHOST_URL__/some-post/"` as a *relative* path and
// resolves it against the current article, producing
// `/the-current-post/__GHOST_URL__/some-post/`. That path has no dot in it, so
// the middleware matcher does not skip it (`middleware.ts`), nothing routes it,
// and it 404s.
//
// The replacement is an empty string rather than the site origin. The domain
// and the paths are unchanged by this migration — that is the same fact the
// redirect audit rests on, where all 127 indexed Ghost URLs answered 200
// directly instead of redirecting — so `/some-post/` is already correct and
// root-relative links survive a domain change we are not making anyway.

/** Ghost's export placeholder for the site origin. */
export const GHOST_URL_PLACEHOLDER = '__GHOST_URL__'

export interface PlaceholderRewrite {
  /** The body with every placeholder removed. */
  html: string
  /** How many placeholders were replaced. */
  replaced: number
}

/**
 * Strip every `__GHOST_URL__` placeholder from a body, leaving the path behind
 * as a root-relative URL.
 *
 * Plain string splitting, not a regex, so nothing in the surrounding markup
 * needs escaping. Idempotent: a body that carries no placeholder comes back
 * unchanged with `replaced: 0`, which is what makes a rerun safe.
 */
export function stripGhostUrlPlaceholders(
  html: string | null | undefined,
): PlaceholderRewrite {
  if (!html) return { html: html ?? '', replaced: 0 }
  const parts = html.split(GHOST_URL_PLACEHOLDER)
  return { html: parts.join(''), replaced: parts.length - 1 }
}

/** Every distinct placeholder URL in a body, for reporting what changed. */
export function findGhostUrlPlaceholders(
  html: string | null | undefined,
): string[] {
  if (!html) return []
  const pattern = new RegExp(`${GHOST_URL_PLACEHOLDER}[^"'<>\\s]*`, 'g')
  return [...new Set(html.match(pattern) ?? [])]
}

// ---------------------------------------------------------------------------
// Escaped-quote artefacts.
//
// One migrated post arrived from Ghost with every `href` value wrapped in a
// backslash-escaped entity:
//
//   <a href="\&quot;https://example.com/\&quot;">text</a>
//
// The browser decodes the entities and reads the attribute as
// `\"https://example.com/\"` — a *relative* path beginning with `\"`, resolved
// against the current article. Every one of that post's seven links 404s. The
// same body carries `\"` in its prose, where it renders as visible backslashes
// around quoted words.
//
// `\&quot;` is removed rather than turned into a quote: the attribute already
// has its real delimiters, so substituting one would produce `href=""url""`
// and break the markup a second way. `\"` in text becomes the quote it was
// meant to be.
//
// This shipped from Ghost, so the old site has the same dead links. It is
// repaired here rather than left alone because migrating breakage forward is a
// choice, and this one costs a string replacement.

/** The two artefacts, longest first so neither can clip the other. */
const ESCAPED_ARTEFACTS: Array<[string, string]> = [
  ['\\&quot;', ''],
  ['\\"', '"'],
]

/**
 * Repair backslash-escaped quote artefacts in a migrated body.
 *
 * Idempotent — a repaired body contains neither pattern, so a rerun replaces
 * nothing and reports zero.
 */
export function repairEscapedQuotes(
  html: string | null | undefined,
): PlaceholderRewrite {
  if (!html) return { html: html ?? '', replaced: 0 }
  let output = html
  let replaced = 0
  for (const [pattern, replacement] of ESCAPED_ARTEFACTS) {
    const parts = output.split(pattern)
    replaced += parts.length - 1
    output = parts.join(replacement)
  }
  return { html: output, replaced }
}
