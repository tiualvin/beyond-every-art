'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { NavLink } from '@/lib/content/queries'

import { editorial, quick } from './motion/variants'

const PANEL_ID = 'mobile-nav'

export function MobileNav({ links, cta }: { links: NavLink[]; cta: NavLink }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
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
          <motion.span
            animate={
              open
                ? { rotate: 45, y: 5, transition: quick }
                : { rotate: 0, y: 0, transition: quick }
            }
          />
          <motion.span
            animate={
              open
                ? { opacity: 0, transition: quick }
                : { opacity: 1, transition: quick }
            }
          />
          <motion.span
            animate={
              open
                ? { rotate: -45, y: -5, transition: quick }
                : { rotate: 0, y: 0, transition: quick }
            }
          />
        </span>
        {open ? 'Close' : 'Menu'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.nav
            id={PANEL_ID}
            className="mobile-nav"
            aria-label="Primary"
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={editorial}
            style={{ overflow: 'hidden' }}
          >
            {links.map((link, i) => (
              <motion.div
                key={`${link.label}-${link.url}`}
                initial={reduced ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...editorial, delay: 0.04 * i }}
              >
                <Link href={link.url}>{link.label}</Link>
              </motion.div>
            ))}
            <motion.div
              initial={reduced ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...editorial, delay: 0.04 * links.length }}
            >
              <Link
                href={cta.url}
                className="button button--primary mobile-nav__cta"
              >
                {cta.label}
              </Link>
            </motion.div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  )
}
