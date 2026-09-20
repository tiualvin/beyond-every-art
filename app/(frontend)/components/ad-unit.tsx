'use client'

import { useEffect, useRef, useState } from 'react'

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
 *
 * **It knows whether it filled, and says so.** An ad network declines
 * impressions routinely — no demand, no consent, a blocker — and the slot
 * holds its reserved height either way, so a reader gets a labelled empty box
 * unless something else goes in it. `children` is that something, rendered by
 * the server and revealed only once the slot is known to be empty.
 *
 * Two signals, because one of them is missing in the case that matters most.
 * Google sets `data-ad-status` on the `<ins>`, which settles it when the tag
 * ran. When a blocker stopped the loader the attribute never arrives at all,
 * and that is the single most common reason a slot is blank — so a timeout
 * settles it the other way, and the absence of an `<iframe>` is what it reads.
 */
/** What the slot turned out to hold, once anything is known about it. */
type Fill = 'pending' | 'filled' | 'unfilled'

/** How long to wait for a tag that may never answer, after asking it to fill. */
const SETTLE_MS = 3000

export function AdUnit({
  placement,
  client,
  children,
}: {
  placement: Placement
  client: string
  /** Shown in the reserved box when no ad is served. */
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)
  const [fill, setFill] = useState<Fill>('pending')

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

  // Whether anything arrived. Separate from the push above because it has to
  // survive the push failing: a blocked loader throws, or never runs, and that
  // is exactly when the fallback is needed.
  useEffect(() => {
    const unit = ref.current
    if (!unit || !children) return

    // Deliberately not latched. The timeout below guesses `unfilled` when the
    // tag has said nothing, and a tag that was merely slow can still answer
    // afterwards — at which point the fallback is sitting over a real ad,
    // which is both a wasted impression and something an ad network would
    // rightly object to. So Google's word always wins, whenever it arrives.
    const read = () => {
      const status = unit.getAttribute('data-ad-status')
      if (status === 'filled' || status === 'unfilled') {
        setFill(status)
        return true
      }
      return false
    }

    const observer = new MutationObserver(() => {
      read()
    })
    observer.observe(unit, {
      attributes: true,
      attributeFilter: ['data-ad-status'],
    })

    // Nothing from Google by now. An `<iframe>` means it rendered without
    // saying so; no iframe means no ad is coming — a blocked loader, most
    // often, which is the commonest reason of all for an empty slot.
    const timer = window.setTimeout(() => {
      if (read()) return
      setFill(unit.querySelector('iframe') ? 'filled' : 'unfilled')
    }, SETTLE_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [children])

  const { width, height } = SLOT_SIZES[placement]

  return (
    <div className="ad-slot" data-fill={fill}>
      {/* Hidden with the unit when nothing was served. Labelling the house
          promo below "Advertisement" would be both wrong and, since it is our
          own content, a claim we should not be making. */}
      <p className="ad-slot__label">Advertisement</p>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'inline-block', width, height }}
        data-ad-client={client}
        data-ad-slot={AD_SLOTS[placement]}
      />
      {children && <div className="ad-slot__fallback">{children}</div>}
    </div>
  )
}
