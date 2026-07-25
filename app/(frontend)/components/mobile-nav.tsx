'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { NavLink } from '@/lib/content/queries'

const PANEL_ID = 'mobile-nav'

/**
 * The narrow-viewport navigation. Below 800px the desktop `.site-nav` is
 * hidden, which would otherwise leave every destination unreachable.
 *
 * This is the frontend's only client component: a disclosure needs real state,
 * a keyboard escape hatch, and a way to close itself after a navigation. The
 * links themselves are still rendered on the server and passed in as props, and
 * both the button and the panel are display:none above the breakpoint, so
 * desktop keeps exactly one navigation in the accessibility tree.
 */
export function MobileNav({ links, cta }: { links: NavLink[]; cta: NavLink }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Next.js keeps the layout mounted across client-side navigations, so the
  // panel has to close itself when the route changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Escape can be pressed from a link inside the panel, which is about to
      // be hidden; move focus back to the control that opened it.
      toggleRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="nav-toggle__bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {open ? 'Close' : 'Menu'}
      </button>

      <nav
        id={PANEL_ID}
        className="mobile-nav"
        aria-label="Primary"
        hidden={!open}
      >
        {links.map((link) => (
          <Link key={`${link.label}-${link.url}`} href={link.url}>
            {link.label}
          </Link>
        ))}
        <Link href={cta.url} className="button button--primary mobile-nav__cta">
          {cta.label}
        </Link>
      </nav>
    </>
  )
}
