import Link from 'next/link'

import type { NavLink } from '@/lib/content/queries'
import { JOURNAL_PATH, NEWSLETTER_PATH, SEARCH_PATH } from '@/lib/seo/site'

import { MobileNav } from './mobile-nav'
import { ScrollHeader } from './motion/scroll-header'

const FALLBACK_NAV: NavLink[] = [
  { label: 'Journal', url: JOURNAL_PATH },
  { label: 'Search', url: SEARCH_PATH },
]

const FALLBACK_CTA: NavLink = { label: 'Newsletter', url: NEWSLETTER_PATH }

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
          <Link
            href={action.url}
            className="button button--primary site-header__cta"
          >
            {action.label}
          </Link>
          <MobileNav links={nav} cta={action} />
        </div>
      </header>
    </ScrollHeader>
  )
}
