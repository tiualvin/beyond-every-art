import Link from 'next/link'

import type { NavLink } from '@/lib/content/queries'
import { JOURNAL_PATH, NEWSLETTER_PATH, SEARCH_PATH } from '@/lib/seo/site'

import { MobileNav } from './mobile-nav'
import { ScrollHeader } from './motion/scroll-header'

const FALLBACK_NAV: NavLink[] = [
  { label: 'Journal', url: JOURNAL_PATH },
  { label: 'Topics', url: '/topics' },
  { label: 'About', url: '/about' },
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
          <div className="site-header__right">
            <Link
              href={SEARCH_PATH}
              className="site-header__search"
              aria-label="Search"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
            </Link>
            <Link
              href={action.url}
              className="button button--primary site-header__cta"
            >
              {action.label}
            </Link>
          </div>
          <MobileNav links={nav} cta={action} />
        </div>
      </header>
    </ScrollHeader>
  )
}
