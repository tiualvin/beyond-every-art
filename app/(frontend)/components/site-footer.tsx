import Link from 'next/link'

import { fallbackNavFor } from '@/lib/content/fallback-nav'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
import type { NavLink } from '@/lib/content/queries'

export function SiteFooter({
  siteTitle,
  links,
  copyright,
  locale = DEFAULT_LOCALE,
}: {
  siteTitle: string
  links: NavLink[]
  copyright?: string
  /** The page's language. */
  locale?: Locale
}) {
  const year = new Date().getFullYear()
  const t = dictionaryFor(locale)
  const notice = copyright || t.footer.rights(year, siteTitle)
  // The `footer` global is empty in production, so this fallback is what every
  // page actually closes on — the same arrangement the masthead has had since
  // 4 Sep, and for the same reason. See `FALLBACK_FOOTER_NAV`.
  const nav = links.length > 0 ? links : fallbackNavFor(locale).footer

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span className="brand" style={{ color: 'var(--color-on-dark)' }}>
          {siteTitle}
        </span>
        {nav.length > 0 && (
          <nav className="site-footer__links" aria-label={t.nav.footer}>
            {nav.map((link) => (
              <Link key={`${link.label}-${link.url}`} href={link.url}>
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        <span className="site-footer__copy">{notice}</span>
      </div>
    </footer>
  )
}
