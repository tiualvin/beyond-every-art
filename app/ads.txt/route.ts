import { ADS_TXT_CONTENT_TYPE, renderAdsTxt } from '@/lib/seo/ads-txt'

// Static, unlike the other SEO routes.
//
// `app/robots.ts`, `app/sitemap.ts` and `app/rss/route.ts` are all
// `force-dynamic` because each resolves the site's origin — or its content —
// from the running container. This file depends on neither: it is one constant
// line, identical on every deployment, so it is prerendered at build time and
// served without waking the application.
//
// It lives here rather than in `public/` because this project builds with
// `output: 'standalone'`, and the Dockerfile's runtime stage copies
// `.next/standalone` and `.next/static` only. A file in `public/` would be
// served by `next dev` and by `next start` from a full build, and would be
// missing from the deployed image — the failure mode that is hardest to catch,
// because every local check passes.
export const dynamic = 'force-static'

export function GET(): Response {
  return new Response(renderAdsTxt(), {
    headers: {
      'Content-Type': ADS_TXT_CONTENT_TYPE,
      // Crawlers refetch on their own schedule; an hour bounds how long a
      // corrected publisher ID takes to take effect through any cache in front
      // of the origin.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
