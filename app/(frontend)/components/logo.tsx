import {
  LOGO_GRADIENT_ID,
  LOGO_INK_BRIGHT,
  LOGO_INK_DEEP,
  LOGO_MARK_PATH,
  LOGO_MARK_VIEWBOX,
} from '@/lib/design/logo'

/**
 * The mark on its own, inline so it inherits the masthead's size and needs no
 * second request. Decorative: the lockup around it already carries the name.
 *
 * `lib/design/logo.ts` holds the geometry, and the favicons are generated from
 * the same constants, so the tab icon and the masthead cannot drift apart.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={LOGO_MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={LOGO_GRADIENT_ID}
          x1="0.05"
          y1="0.05"
          x2="0.95"
          y2="0.95"
        >
          <stop offset="0" stopColor={LOGO_INK_DEEP} />
          <stop offset="1" stopColor={LOGO_INK_BRIGHT} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${LOGO_GRADIENT_ID})`}
        fillRule="evenodd"
        d={LOGO_MARK_PATH}
      />
    </svg>
  )
}

/**
 * The masthead lockup: the mark, then the site's name set as the wordmark.
 *
 * The name stays live text rather than lettering baked into the SVG. It is what
 * a screen reader announces for the home link, it is what the site is called in
 * Payload, and renaming the publication there should not leave a picture of the
 * old name in the corner of every page.
 */
export function BrandLockup({ siteTitle }: { siteTitle: string }) {
  return (
    <>
      <BrandMark className="brand__mark" />
      <span className="brand__word">{siteTitle}</span>
    </>
  )
}
