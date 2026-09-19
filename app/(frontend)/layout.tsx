import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'

import { getFooter, getHeader, getSiteSettings } from '@/lib/content/queries'
import { getPreviewMode } from '@/lib/preview/mode'
import { isNoindex } from '@/lib/seo/indexing'
import { getSiteUrl } from '@/lib/seo/site'

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
      types: { 'application/rss+xml': '/rss' },
    },
    ...(isNoindex() ? { robots: { index: false, follow: false } } : {}),
  }
}

export default async function FrontendLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [settings, header, footer, preview] = await Promise.all([
    getSiteSettings(),
    getHeader(),
    getFooter(),
    getPreviewMode(),
  ])

  const analyticsTag = resolveAnalyticsTag()
  const adsenseClient = resolveAdsenseClient()
  // Only where a Google tag will actually load. A consent default with nothing
  // to read it is a script tag for its own sake.
  const googleTags = Boolean(analyticsTag || adsenseClient)

  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
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
        />
        {children}
        <NewsletterBand />
        <SiteFooter
          siteTitle={settings.title}
          links={footer.links}
          copyright={footer.copyright}
        />
        {adsenseClient && <AdSense client={adsenseClient} />}
        {analyticsTag && <Analytics tag={analyticsTag} />}
        {preview.live && <LivePreviewListener serverURL={getSiteUrl()} />}
      </body>
    </html>
  )
}
