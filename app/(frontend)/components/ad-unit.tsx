'use client'

import { useEffect, useRef } from 'react'

import { AD_SLOTS, SLOT_SIZES, type Placement } from '@/lib/ads/placements'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * One AdSense display unit, with the label the site puts above every one.
 *
 * The loader is not here. `app/(frontend)/layout.tsx` renders it once for the
 * document (`components/adsense.tsx`), React dedupes it by `src`, and the tag
 * throws if it is evaluated twice on one page — so a unit that brought its own
 * loader would break the moment a second unit appeared. This component renders
 * the `<ins>` and asks the already-loaded tag to fill it.
 *
 * Three things about that request are deliberate:
 *
 * **It is deferred to idle.** `docs/ADVERTISING.md` §8 excludes any unit above
 * the featured image because the image is the LCP element and anything above
 * it competes for the same network. The rail unit is beside the image rather
 * than above it, which is the same network — so the fill is pushed to the
 * first idle callback, with a 2s timeout so a busy page still fills it. This
 * is one of the few places where the UX-friendly choice is also the
 * revenue-friendly one: a unit that arrives after the article is painted has
 * better viewability, not worse.
 *
 * **It is pushed once.** `adsbygoogle.push()` throws
 * "All ins elements in the DOM with class=adsbygoogle already have ads in
 * them" if it is called twice for one `<ins>`, and React's development
 * double-invoked effects are a reliable way to get there. The ref guard and
 * the `data-adsbygoogle-status` check are both needed: the ref catches a
 * second effect in the same mount, the attribute catches a remount over an
 * `<ins>` the tag has already claimed.
 *
 * **It is not refreshed.** The rail unit sits in a sticky group and is in view
 * for most of an article, which is the classic case for refresh and the
 * classic way to turn a rail into a nuisance. One impression, high
 * viewability, no reload — §8's rule, and there is no timer here to break it.
 */
export function AdUnit({
  placement,
  client,
}: {
  placement: Placement
  client: string
}) {
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    const unit = ref.current
    if (!unit || pushed.current) return
    if (unit.dataset.adsbygoogleStatus) return

    const fill = () => {
      if (pushed.current) return
      pushed.current = true
      try {
        ;(window.adsbygoogle = window.adsbygoogle ?? []).push({})
      } catch {
        // A blocked or absent loader is the normal case here, not a failure:
        // the reservation below is what keeps the rail whole without one.
      }
    }

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(fill, { timeout: 2000 })
      return () => window.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(fill, 1200)
    return () => window.clearTimeout(timer)
  }, [])

  const { width, height } = SLOT_SIZES[placement]

  return (
    <>
      <p className="ad-slot__label">Advertisement</p>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'inline-block', width, height }}
        data-ad-client={client}
        data-ad-slot={AD_SLOTS[placement]}
      />
    </>
  )
}
