'use client'

import { useEffect, useRef, useState } from 'react'

export function ScrollHeader({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'static' | 'hidden' | 'visible'>('static')
  const lastY = useRef(0)
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const threshold = 80

    function onScroll() {
      const y = window.scrollY
      if (y < threshold) {
        setMode('static')
      } else if (y > lastY.current) {
        setMode('hidden')
      } else {
        setMode('visible')
      }
      lastY.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isFixed = mode !== 'static'
  const isHidden = mode === 'hidden'

  return (
    <>
      <div
        ref={headerRef}
        className={[
          isFixed ? 'site-header--fixed' : '',
          isHidden ? 'site-header--hidden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
      {/* Reserves the height the bar gave up when it went fixed. It holds
          nothing: a second copy of the header would mount a second copy of
          every control in it, and the overlays those controls open portal to
          `document.body`, where `visibility: hidden` on this box cannot reach
          them — one click would open two subscribe modals. The height is read
          from the bar itself on the render that fixes it, while it is still in
          flow. */}
      {isFixed && (
        <div
          className="site-header__spacer"
          aria-hidden="true"
          style={{ height: headerRef.current?.offsetHeight }}
        />
      )}
    </>
  )
}
