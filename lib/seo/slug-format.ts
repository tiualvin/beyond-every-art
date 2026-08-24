/**
 * What a slug is allowed to look like, everywhere one is stored.
 *
 * A slug is a URL path segment, and every collection that has one puts it
 * straight into a route: `/<slug>`, `/tag/<slug>`, `/author/<slug>`,
 * `/apps/<slug>`. Nothing between the admin panel and the address bar cleans it
 * up, so a space, a capital, or a stray `?` becomes a link that is either
 * percent-encoded past recognition or simply wrong — and it becomes that
 * quietly, at publish time, on a URL search engines are already being told
 * about through the sitemap.
 *
 * The shape below is what Ghost itself produced, which is the point: the
 * migrated corpus already satisfies it, so this rejects new mistakes without
 * relitigating old URLs. `lib/migration/plan.ts` checks the export against the
 * same rule during a dry run, so an export that disagrees is reported before an
 * import runs rather than failing partway through one.
 *
 * Deliberately not a normaliser. Rewriting `My Post` to `my-post` on save would
 * be friendlier for a new document and unacceptable for a migrated one, where
 * the slug *is* the thing being preserved and a silent correction is a broken
 * inbound link. Refusing puts the choice in front of the person making it.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isWellFormedSlug(value: string): boolean {
  return SLUG_PATTERN.test(value)
}

/**
 * The rule as a sentence, for validation messages and migration reports.
 *
 * One string so the admin panel and `pnpm migrate:ghost --dry-run` describe the
 * constraint identically; an editor who hits it in one place and an operator
 * who hits it in the other are looking at the same requirement.
 */
export const SLUG_RULE =
  'lowercase letters, numbers and single hyphens between them'

export function slugFormatError(value: string): string {
  return `“${value}” is not a valid slug. Use ${SLUG_RULE} — the value is used verbatim as a URL path segment.`
}

/**
 * Derives a slug from a title, for the create-time convenience default only.
 *
 * Never applied to a value somebody typed, and never applied on update: it
 * fills an empty field on a brand-new document and then gets out of the way.
 * Characters outside the pattern are dropped rather than transliterated, so an
 * all-unicode title yields an empty string and the editor is asked for a slug
 * instead of being handed a mangled one.
 */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
