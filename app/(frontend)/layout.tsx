import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'

import { getFooter, getHeader, getSiteSettings } from '@/lib/content/queries'
import { getPreviewMode } from '@/lib/preview/mode'
import { isNoindex } from '@/lib/seo/indexing'
import { getSiteUrl } from '@/lib/seo/site'

import { resolveAnalyticsTag } from '@/lib/analytics/tag'

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

  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
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
        {analyticsTag && <Analytics tag={analyticsTag} />}
        {preview.live && <LivePreviewListener serverURL={getSiteUrl()} />}
      </body>
    </html>
  )
}
