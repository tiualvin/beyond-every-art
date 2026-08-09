'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { NavLink } from '@/lib/content/queries'
import { SEARCH_PATH } from '@/lib/seo/site'

import { editorial, quick } from './motion/variants'

const PANEL_ID = 'mobile-nav'

const NAV_DESCRIPTIONS: Record<string, string> = {
  Journal: 'All stories, newest first',
  Topics: 'Browse by subject',
  About: 'Our perspective on art & science',
}

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

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`nav-toggle${open ? ' nav-toggle--on-dark' : ''}`}
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
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={editorial}
          >
            <div className="mobile-nav__links">
              {links.map((link, i) => (
                <motion.div
                  key={`${link.label}-${link.url}`}
                  initial={reduced ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...editorial, delay: 0.06 * i }}
                >
                  <Link href={link.url} className="mobile-nav__link">
                    {link.label}
                    {NAV_DESCRIPTIONS[link.label] && (
                      <small>{NAV_DESCRIPTIONS[link.label]}</small>
                    )}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...editorial, delay: 0.06 * links.length }}
              >
                <Link href={SEARCH_PATH} className="mobile-nav__link">
                  Search
                  <small>Find any story</small>
                </Link>
              </motion.div>
            </div>
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...editorial,
                delay: 0.06 * (links.length + 1),
              }}
            >
              <Link href={cta.url} className="mobile-nav__cta">
                Subscribe to {cta.label} &rarr;
              </Link>
            </motion.div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  )
}
