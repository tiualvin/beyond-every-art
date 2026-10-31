import type { CSSProperties } from 'react'

/**
 * An entrance: the content rises a little and fades in, once, as it first
 * paints.
 *
 * **CSS, not framer-motion, and that is the reason this file exists.** It
 * wraps the hero of nearly every page — the post's title, standfirst, byline
 * and featured image, the homepage cover — which is to say the Largest
 * Contentful Paint element on every template. The framer-motion version
 * server-rendered `opacity: 0` inline and only revealed the content once React
 * had hydrated and the library had run, so the page's most important pixels
 * waited on the JavaScript bundle. Measured against the live site on a
 * throttled phone, that put LCP at 4.0–4.7s; with the gate removed it was
 * 1.1s, and a CSS fade measured 1.5s. It also meant a reader whose script
 * failed or was blocked never saw the article's title at all.
 *
 * A CSS animation starts on first paint with no script, so the reveal no longer
 * depends on hydration. Three details in `app/globals.css` are load-bearing:
 *
 *  - The rule sits inside `prefers-reduced-motion: no-preference`. The hidden
 *    state exists only as the animation's `from` keyframe, so a reader who asked
 *    for no motion, or a browser that matches neither query, gets the content
 *    as it is rather than content waiting for a reveal that never comes.
 *  - The fill mode is `backwards`, not `both`. `backwards` holds the `from`
 *    frame through the delay, which is what the stagger needs; `forwards` would
 *    keep the animation in effect after it ends, and an element with an
 *    in-effect opacity or transform animation is a stacking context forever —
 *    which would quietly change what the share menu inside the hero can
 *    overlap.
 *  - `ease` is `cubic-bezier(0.25, 0.1, 0.25, 1)`, the curve `editorial` in
 *    `./variants` names, and 0.5s is its duration. The motion is unchanged.
 *
 * Not a client component: it has no state and no effect, so it renders on the
 * server and ships nothing to the browser.
 *
 * `tests/design/fade-in.test.ts` fails if this goes back to gating on script.
 */
export function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  className,
}: {
  children: React.ReactNode
  delay?: number
  direction?: 'up' | 'down' | 'none'
  className?: string
}) {
  const y = direction === 'up' ? 16 : direction === 'down' ? -16 : 0

  // Only what differs from the stylesheet's defaults, so the common case — no
  // delay, rising 16px — adds nothing to the markup but the class.
  const style: Record<string, string> = {}
  if (delay) style['--fade-delay'] = `${delay}s`
  if (y !== 16) style['--fade-y'] = `${y}px`

  return (
    <div
      className={className ? `fade-in ${className}` : 'fade-in'}
      style={Object.keys(style).length ? (style as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
