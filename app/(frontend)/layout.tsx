import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'

import { getFooter, getHeader, getSiteSettings } from '@/lib/content/queries'
import { alternatesForPath } from '@/lib/i18n/alternates'
import { getLocaleIndex } from '@/lib/i18n/locale-index'
import { DEFAULT_LOCALE, localeProp } from '@/lib/i18n/locales'
import { getRequestLocale, getRequestPath } from '@/lib/i18n/request'
import { getPreviewMode } from '@/lib/preview/mode'
import { robotsDirective } from '@/lib/seo/indexing'
import { getSiteUrl, localeFeedPath } from '@/lib/seo/site'

import { resolveAdsenseClient } from '@/lib/ads/adsense'
import { consentBootstrap } from '@/lib/analytics/consent'
import { resolveAnalyticsTag } from '@/lib/analytics/tag'

import { AdSense } from './components/adsense'
import { ConsentMode } from './components/consent-mode'
import { Analytics } from './components/analytics'
import { LivePreviewListener } from './components/live-preview-listener'
import { NewsletterBand } from './components/newsletter-band'
import { SiteFooter } from './components/site-footer'
import { SiteHeader } from './components/site-header'
import '../globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  const locale = await getRequestLocale()
  // No hreflang here, for the homepage or anything else. Home pages are not
  // translations of each other — `/` is the whole English archive, `/es/` the
  // few pieces translated so far — and, measured, the extra read it took made
  // this metadata resolve after the page shell, so Next streamed the
  // homepage's title, description and canonical into the body instead of the
  // head. For crawlers too. The switcher still links the home pages.
  return {
    metadataBase: new URL(getSiteUrl()),
    // Ghost's rule, which the migration has to keep: generated archives carry
    // the suffix (`Art - Beyond Every Art`, hyphen and all), content documents
    // do not. Posts and pages therefore set `title.absolute` — see
    // `app/(frontend)/[slug]/page.tsx`. Every other route is new to this site
    // and keeps the suffix.
    title: {
      default: settings.homeTitle,
      template: `%s - ${settings.title}`,
    },
    description: settings.metaDescription,
    alternates: {
      canonical: '/',
      // A translated page advertises its own language's feed. Every one of
      // them sets its own canonical, so the `/` above is only ever English's.
      types: {
        'application/rss+xml':
          locale === DEFAULT_LOCALE ? '/rss' : localeFeedPath(locale),
      },
    },
    // Inherited by every page that sets no `robots` of its own: noindex on
    // staging, large image previews on the live site. See `robotsDirective`.
    robots: robotsDirective(false),
  }
}

export default async function FrontendLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale()
  const path = await getRequestPath()
  const [settings, header, footer, preview, index] = await Promise.all([
    getSiteSettings(),
    getHeader(locale),
    getFooter(locale),
    getPreviewMode(),
    getLocaleIndex(),
  ])
  // The languages the page under this masthead is published in — the same
  // answer, from the same function, the page itself gives its hreflang.
  const alternates = path ? alternatesForPath(index, path) : null

  const analyticsTag = resolveAnalyticsTag()
  const adsenseClient = resolveAdsenseClient()
  // Only where a Google tag will actually load. A consent default with nothing
  // to read it is a script tag for its own sake.
  const googleTags = Boolean(analyticsTag || adsenseClient)

  return (
    <html
      lang={locale}
      className={`${playfair.variable} ${inter.variable}`}
      // Which tag loaded, for the custom events that have to address it in
      // its own shape — `lib/analytics/events.ts` says why the window cannot
      // be asked instead. Omitted when there is none.
      data-analytics-tag={analyticsTag?.kind}
    >
      {/* An explicit `<head>` for one reason: it is the only placement that
          actually puts the consent default in the head. React still hoists the
          two async loaders above it, which is in time — `consent-mode.tsx` has
          the measurements. */}
      <head>
        {googleTags && <ConsentMode bootstrap={consentBootstrap()} />}
      </head>
      <body>
        <SiteHeader
          siteTitle={settings.title}
          links={header.links}
          cta={header.cta}
          locale={locale}
          alternates={alternates}
        />
        {children}
        <NewsletterBand {...localeProp(locale)} />
        <SiteFooter
          siteTitle={settings.title}
          links={footer.links}
          copyright={footer.copyright}
          locale={locale}
        />
        {adsenseClient && <AdSense client={adsenseClient} />}
        {analyticsTag && <Analytics tag={analyticsTag} />}
        {preview.live && <LivePreviewListener serverURL={getSiteUrl()} />}
      </body>
    </html>
  )
}
