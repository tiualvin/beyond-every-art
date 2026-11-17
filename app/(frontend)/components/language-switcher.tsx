import Link from 'next/link'

import { ordered, type Alternates } from '@/lib/i18n/alternates'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { localeConfig, type Locale } from '@/lib/i18n/locales'

/**
 * The languages this page is published in, each linked straight to its
 * equivalent — never to a home page, and never to a language it is not in.
 *
 * Renders nothing when there is nothing to switch to: `alternates` is null for
 * a page in one language (see `atLeastTwo`), which is every English page with
 * no translation, so those pages carry no trace of it. No language is chosen
 * for the reader by IP or Accept-Language; this is the only way to change one.
 *
 * Each link names its language in that language and says so in markup —
 * `lang` for screen readers, `hreflang` for anything reading the link — and
 * the current one is a marked span rather than a link to itself.
 */
export function LanguageSwitcher({
  alternates,
  current,
  className = 'lang-switch',
}: {
  alternates: Alternates | null | undefined
  current: Locale
  className?: string
}) {
  if (!alternates) return null
  const t = dictionaryFor(current)

  return (
    <nav className={className} aria-label={t.switcher.label}>
      <ul>
        {ordered(alternates).map(([code, href]) => {
          const label = localeConfig(code).label
          return (
            <li key={code}>
              {code === current ? (
                <span lang={code} aria-current="true">
                  {label}
                </span>
              ) : (
                <Link href={href} hrefLang={code} lang={code}>
                  {label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
