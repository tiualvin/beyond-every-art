// The languages the site publishes in, written once.
//
// Everything that has to agree on the list reads it from here: Payload's
// `localization` config, the reserved root slugs (so no English article can
// take a locale's prefix), the middleware that sets `<html lang>`, the routes
// that answer `/{locale}/…`, the sitemap, hreflang, Open Graph and the MCP
// tools' `locale` parameter. Adding a language is one entry below, a
// dictionary in `dictionaries/`, and the migration `pnpm migrate:db:create`
// generates for it (Postgres keeps the locale codes in an enum). See
// docs/LOCALIZATION.md.
//
// Pure data and pure functions, because the middleware imports it and runs on
// the edge runtime.

export type LocaleConfig = {
  /** ISO 639-1, language only. It is the URL prefix, so never a region. */
  code: string
  /** The language's name in itself — what the switcher shows. */
  label: string
  /** `og:locale` wants language_TERRITORY; this is the territory we claim. */
  ogLocale: string
  /** BCP 47 tag handed to `Intl` for dates. */
  dateLocale: string
  /**
   * Characters replaced before accents are stripped, when the language spells
   * them out rather than dropping the mark — German writes ü as "ue".
   */
  transliterate?: Readonly<Record<string, string>>
}

export const LOCALES = [
  { code: 'en', label: 'English', ogLocale: 'en_US', dateLocale: 'en-US' },
  { code: 'es', label: 'Español', ogLocale: 'es_ES', dateLocale: 'es-ES' },
  {
    code: 'id',
    label: 'Bahasa Indonesia',
    ogLocale: 'id_ID',
    dateLocale: 'id-ID',
  },
  {
    code: 'de',
    label: 'Deutsch',
    ogLocale: 'de_DE',
    dateLocale: 'de-DE',
    transliterate: {
      ä: 'ae',
      ö: 'oe',
      ü: 'ue',
      ß: 'ss',
      Ä: 'Ae',
      Ö: 'Oe',
      Ü: 'Ue',
    },
  },
] as const satisfies readonly LocaleConfig[]

export type Locale = (typeof LOCALES)[number]['code']

/**
 * English, unprefixed. Its URLs are the ones every ranking was earned on, so
 * it never gains an `/en/` prefix and nothing here may change one of them.
 */
export const DEFAULT_LOCALE = 'en' satisfies Locale

export const LOCALE_CODES: readonly Locale[] = LOCALES.map((l) => l.code)

/** Every locale that lives under a prefix — all of them but English. */
export const PREFIXED_LOCALES: readonly Locale[] = LOCALE_CODES.filter(
  (code) => code !== DEFAULT_LOCALE,
)

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALE_CODES.includes(value as Locale)
}

/** A locale that is served under `/{code}/` — any configured one but English. */
export function isPrefixedLocale(value: unknown): value is Locale {
  return isLocale(value) && value !== DEFAULT_LOCALE
}

export function localeConfig(code: Locale): LocaleConfig {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0]
}

/**
 * The locale a request path is in: its first segment when that is a prefixed
 * locale, English otherwise. `/es/` and `/es/foo/` are Spanish; `/es-foo/` and
 * `/foo/` are English.
 */
export function localeOfPath(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0]
  return isPrefixedLocale(first) ? first : DEFAULT_LOCALE
}

/**
 * Turns a locale-agnostic path (`/foo/`, `/tag/x/`, `/`) into the address it
 * has in `locale`. English is returned unchanged.
 */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  const rest = path.startsWith('/') ? path : `/${path}`
  return rest === '/' ? `/${locale}/` : `/${locale}${rest}`
}
