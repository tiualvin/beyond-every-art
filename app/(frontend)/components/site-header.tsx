import Link from 'next/link'

import type { NavLink } from '@/lib/content/queries'

const FALLBACK_NAV: NavLink[] = [
  { label: 'About', url: '/about' },
  { label: 'Art & Stories', url: '/tag/art-stories' },
  { label: 'Journal', url: '/journal' },
  { label: 'Contact', url: '/contact' },
]

export function SiteHeader({
  siteTitle,
  links,
}: {
  siteTitle: string
  links: NavLink[]
}) {
  const nav = links.length > 0 ? links : FALLBACK_NAV

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand">
          {siteTitle}
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {nav.map((link) => (
            <Link key={`${link.label}-${link.url}`} href={link.url}>
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href="/contact" className="button button--primary">
          Consultation
        </Link>
      </div>
    </header>
  )
}
