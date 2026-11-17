import Image from 'next/image'
import Link from 'next/link'
import { createElement } from 'react'

import { fallbackNavFor } from '@/lib/content/fallback-nav'
import type { NavLink } from '@/lib/content/queries'
import type { Alternates } from '@/lib/i18n/alternates'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { DEFAULT_LOCALE, localeProp, type Locale } from '@/lib/i18n/locales'
import { localeHomePath } from '@/lib/seo/site'

import logo from './logo.png'
import { LanguageSwitcher } from './language-switcher'
import { ScrollHeader } from './motion/scroll-header'
import { SiteChrome } from './site-chrome'

export function SiteHeader({
  siteTitle,
  links,
  cta,
  locale = DEFAULT_LOCALE,
  alternates = null,
}: {
  siteTitle: string
  links: NavLink[]
  cta: NavLink | null
  /** The page's language. */
  locale?: Locale
  /** The languages the page under this masthead is published in, if two or more. */
  alternates?: Alternates | null
}) {
  const fallback = fallbackNavFor(locale)
  const nav = links.length > 0 ? links : fallback.header
  const action = cta ?? fallback.cta

  const brand = (
    <Link href={localeHomePath(locale)} className="brand">
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
  )
  const primary = (
    <nav className="site-nav" aria-label={dictionaryFor(locale).nav.primary}>
      {nav.map((link) => (
        <Link key={`${link.label}-${link.url}`} href={link.url}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
  const chrome = <SiteChrome links={nav} cta={action} {...localeProp(locale)} />

  return (
    <ScrollHeader>
      <header className="site-header">
        {/* Built with `createElement` and spread children so that a page
            with nothing to switch to gets exactly the three children this
            masthead always had. A `{switcher}` slot that rendered nothing
            would still leave a `null` in the page's RSC payload, and every
            English page would differ by those bytes. */}
        {createElement(
          'div',
          { className: 'container site-header__inner' },
          ...(alternates
            ? [
                brand,
                primary,
                <LanguageSwitcher
                  key="languages"
                  alternates={alternates}
                  current={locale}
                  className="lang-switch lang-switch--header"
                />,
                chrome,
              ]
            : [brand, primary, chrome]),
        )}
      </header>
    </ScrollHeader>
  )
}
