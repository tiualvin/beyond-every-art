import Image from 'next/image'
import Link from 'next/link'

import { FALLBACK_CTA, FALLBACK_NAV } from '@/lib/content/fallback-nav'
import type { NavLink } from '@/lib/content/queries'

import logo from './logo.png'
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
            <Image
              src={logo}
              // The wordmark spells out the site's name, so the link is named
              // the same either way: by the image when it loads, by this text
              // when it does not. `siteTitle` rather than a literal, because
              // the name is editable in site settings and the alt text should
              // not be the one copy that disagrees.
              alt={siteTitle}
              className="brand__logo"
              // Otherwise `next/image` lazy-loads it, and the masthead of every
              // page starts life with a hole where the brand goes.
              priority
            />
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
