import Link from 'next/link'

import type { NavLink } from '@/lib/content/queries'
import { APPS_PATH, JOURNAL_PATH, NEWSLETTER_PATH } from '@/lib/seo/site'

import { ScrollHeader } from './motion/scroll-header'
import { SiteChrome } from './site-chrome'

const FALLBACK_NAV: NavLink[] = [
  { label: 'Journal', url: JOURNAL_PATH },
  { label: 'Topics', url: '/topics' },
  { label: 'Apps', url: APPS_PATH },
  { label: 'About', url: '/about' },
]

const FALLBACK_CTA: NavLink = { label: 'Subscribe', url: NEWSLETTER_PATH }

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
