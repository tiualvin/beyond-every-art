import Script from 'next/script'

/**
 * Google Analytics (GA4) tag. Rendered only when NEXT_PUBLIC_GA_ID is set and
 * the deployment is indexable, so staging traffic never pollutes analytics.
 */
export function Analytics({ gaId }: { gaId: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  )
}
