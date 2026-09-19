// Turning a stored credit into the link a reader clicks.
//
// Every feature image on this site is an Unsplash photograph, and every credit
// arrived from Ghost as `Photo by <name> / Unsplash` wrapped around a link to
// the photographer's profile. The import kept the name and dropped the link,
// because `media.credit` is plain text and React escapes what it renders — so
// the site has spent the migration crediting 102 photographers and linking to
// none of them. `media.creditURL` is where the link goes back; this is what
// makes it safe to render and correct to follow.
//
// **The href is not trusted.** `creditURL` is a text field an editor types
// into and a script writes to, and React hands an `href` to the DOM verbatim —
// `javascript:` included, with a development-only console warning and nothing
// at all in production. The field validates on write. This validates again on
// read, because a value written before that validation existed, or by a script
// that passed `overrideAccess`, would otherwise reach the page. Same reasoning
// as `vetImageBytes` in `lib/mcp/tools.ts`: the check belongs where the value
// is used, not only where it arrived.
//
// **Unsplash asks for referral parameters**, and they are added here rather
// than stored. Its API guidelines require an attribution link carrying
// `utm_source` and `utm_medium=referral`; keeping them out of the database
// means the field holds the photographer's actual profile URL, one place
// decides what this site calls itself, and a change of name does not need a
// pass over every media row. See `docs/STOCK_IMAGERY.md`.
//
// They are added for Unsplash and nowhere else. On a museum's collection page
// or a photographer's own site they are noise at best, and at worst a tracking
// parameter appended to somebody's URL because this file could not tell the
// difference between a referral programme and a link.

/** What this site calls itself in a referral parameter. */
const UTM_SOURCE = 'beyond_every_art'

/** Hosts whose guidelines ask for the referral parameters above. */
const REFERRAL_HOSTS = new Set(['unsplash.com', 'www.unsplash.com'])

/**
 * A credit URL that is safe to put in an `href`, or null.
 *
 * https only, matching `lib/security/outbound-fetch.ts` rather than being
 * merely stricter for its own sake: anyone who can answer for a name on a
 * reader's network can answer plaintext, and a credit line is not worth a
 * downgrade. Everything that is not a parseable https URL — `javascript:`,
 * `data:`, a bare word, an empty string — is null, which renders as the plain
 * text credit the site shows today.
 */
export function toCreditURL(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/**
 * The address a credit link points at, or null if it should not be a link.
 *
 * Vets first and decorates second, in one function, so that a component cannot
 * render an `href` this module did not approve. Returning null rather than a
 * best-effort string is what makes that structural: there is no value a caller
 * can pass that yields a usable href and skips the check, and a null falls
 * back to the plain text credit the site showed before links existed.
 *
 * The alternative — vet in the mapper, decorate here — worked only while every
 * caller remembered to do both, which is the kind of invariant that holds
 * until somebody adds a second place that renders a credit.
 */
export function attributionHref(url: unknown): string | null {
  const safe = toCreditURL(url)
  if (!safe) return null

  // Parsed once already by `toCreditURL`, so this cannot throw.
  const parsed = new URL(safe)
  if (!REFERRAL_HOSTS.has(parsed.hostname.toLowerCase())) return safe

  parsed.searchParams.set('utm_source', UTM_SOURCE)
  parsed.searchParams.set('utm_medium', 'referral')
  return parsed.toString()
}

/**
 * Strip the referral parameters a source added, leaving the address itself.
 *
 * Ghost wrote `utm_source=ghost&utm_medium=referral&utm_campaign=api-credit`
 * into every credit link it made, naming a site this publication no longer is.
 * Storing that would mean crediting photographers on behalf of the CMS we
 * migrated off, and `attributionHref` would then have to fight it at render.
 * Only `utm_*` keys are removed, so a URL that carries a meaningful query — a
 * museum's object id, say — survives intact.
 */
export function withoutTrackingParams(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) parsed.searchParams.delete(key)
  }
  return parsed.toString()
}
