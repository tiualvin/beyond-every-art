import Link from 'next/link'

import { FALLBACK_CTA, FALLBACK_NAV } from '@/lib/content/fallback-nav'
import type { NavLink } from '@/lib/content/queries'

import { ScrollHeader } from './motion/scroll-header'
import { SiteChrome } from './site-chrome'

export function SiteHeader({
  siteTitle,
  links,
  cta,
}: {
  siteTitle: string
  links: NavLink[]
  cta: NavLink | null
}) {
  const nav = links.length > 0 ? links : FALLBACK_NAV
  const action = cta ?? FALLBACK_CTA

  return (
    <ScrollHeader>
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
          <SiteChrome links={nav} cta={action} />
        </div>
      </header>
    </ScrollHeader>
  )
}
