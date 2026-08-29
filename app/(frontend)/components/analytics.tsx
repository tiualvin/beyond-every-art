import Script from 'next/script'

import type { AnalyticsTag } from '@/lib/analytics/tag'

/**
 * Google Analytics (GA4) tag, loaded directly.
 *
 * Used when no Tag Manager container is configured. `lib/analytics/tag.ts`
 * decides which of these renders and when.
 */
function Ga4({ id }: { id: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  )
}

/**
 * Google Tag Manager container.
 *
 * The container decides what actually fires; this only loads it. Note what is
 * *not* here: the `<noscript><iframe>` half of Google's published snippet. It
 * serves only visitors with JavaScript disabled, for whom a container can fire
 * almost nothing anyway, and including it would mean widening `frame-src` in
 * the CSP for that sliver. See `docs/ANALYTICS.md`.
 */
function TagManager({ id }: { id: string }) {
  return (
    <Script id="gtm-init" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`}
    </Script>
  )
}

/**
 * Render the resolved analytics tag.
 *
 * Rendered only when the deployment is indexable, so staging traffic never
 * reaches the production property — the gate lives in `resolveAnalyticsTag`.
 */
export function Analytics({ tag }: { tag: AnalyticsTag }) {
  return tag.kind === 'gtm' ? <TagManager id={tag.id} /> : <Ga4 id={tag.id} />
}
