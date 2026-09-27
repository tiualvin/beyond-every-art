import Link from 'next/link'

import { FALLBACK_FOOTER_NAV } from '@/lib/content/fallback-nav'
import type { NavLink } from '@/lib/content/queries'

export function SiteFooter({
  siteTitle,
  links,
  copyright,
}: {
  siteTitle: string
  links: NavLink[]
  copyright?: string
}) {
  const year = new Date().getFullYear()
  const notice = copyright || `© ${year} ${siteTitle}. All rights reserved.`
  // The `footer` global is empty in production, so this fallback is what every
  // page actually closes on — the same arrangement the masthead has had since
  // 4 Sep, and for the same reason. See `FALLBACK_FOOTER_NAV`.
  const nav = links.length > 0 ? links : FALLBACK_FOOTER_NAV

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span className="brand" style={{ color: 'var(--color-on-dark)' }}>
          {siteTitle}
        </span>
        {nav.length > 0 && (
          <nav className="site-footer__links" aria-label="Footer">
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
