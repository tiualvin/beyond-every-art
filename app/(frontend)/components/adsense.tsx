import { adsenseScriptUrl } from '@/lib/ads/adsense'

/**
 * The Google AdSense loader.
 *
 * A plain `<script async>` rather than `next/script`, which is what the
 * neighbouring `analytics.tsx` uses. Two reasons, and they both come from this
 * tag being a bare external loader rather than an inline snippet:
 *
 * React 19 hoists `<script async src>` into `<head>` and dedupes it by `src`,
 * so this lands exactly where Google's own instructions put it, from a
 * component rendered in the layout body. `next/script` would inject it after
 * hydration instead — workable, but later than the tag wants, and Auto ads
 * measure the page as they find it.
 *
 * The deduplication matters more than it looks. The loader throws if it is
 * evaluated twice on one page, and a layout that re-renders is otherwise an
 * easy way to get there.
 *
 * `crossOrigin` is Google's published attribute, not decoration: without it
 * the browser sends the request opaquely and script errors inside the tag
 * arrive as "Script error." with no origin, which is the difference between a
 * debuggable ad problem and an undebuggable one.
 */
export function AdSense({ client }: { client: string }) {
  return <script async src={adsenseScriptUrl(client)} crossOrigin="anonymous" />
}
