import Link from 'next/link'

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

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span className="brand" style={{ color: 'var(--color-on-dark)' }}>
          {siteTitle}
        </span>
        {links.length > 0 && (
          <nav className="site-footer__links" aria-label="Footer">
            {links.map((link) => (
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
