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
import { DEFAULT_LOCALE, localeConfig, type Locale } from '../i18n/locales'

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
export function slugFromTitle(
  title: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  // English keeps the rule it has always had, so no English slug derived from
  // here can come out differently than it did before translations existed.
  const source =
    locale === DEFAULT_LOCALE ? title : transliterate(title, locale)
  return source
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Letters that are not a base letter plus a mark, so stripping marks would
 * drop them instead of spelling them.
 */
const LIGATURES: Readonly<Record<string, string>> = {
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ø: 'o',
  Ø: 'O',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ß: 'ss',
}

/**
 * A translated title as plain ASCII: the language's own spellings first
 * (German ü → ue), then every remaining accent dropped (más → mas, ñ → n).
 *
 * Translations are where accented titles actually occur, and dropping the
 * letter — which is what the English rule does — turns "Pigmentos más caros"
 * into `pigmentos-m-s-caros`.
 */
export function transliterate(text: string, locale: Locale): string {
  const own = localeConfig(locale).transliterate ?? {}
  return [...text]
    .map((char) => own[char] ?? LIGATURES[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
