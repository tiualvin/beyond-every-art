'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useActionState, useEffect, useRef, useState } from 'react'

import { subscribeFromModal } from '@/app/(frontend)/newsletter/actions'
import type { NavLink } from '@/lib/content/queries'
import { SEARCH_PATH } from '@/lib/seo/site'

import { editorial, quick } from './motion/variants'
import { SearchIcon } from './icons'

type Overlay = 'menu' | 'search' | 'subscribe' | null

/**
 * The masthead's actions and the three overlays they open.
 *
 * One component owns all of it because the overlays are mutually exclusive —
 * opening search from inside the menu has to close the menu — and because they
 * share the scroll lock. Splitting them would mean lifting that state into a
 * context for no gain.
 *
 * The overlays are portalled to `document.body`: the header becomes
 * `position: fixed` with a `transform` on scroll, and a transformed ancestor
 * is a containing block for `position: fixed` descendants, which would pin
 * every overlay to the header instead of the viewport.
 */
export function SiteChrome({ links, cta }: { links: NavLink[]; cta: NavLink }) {
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  // A link inside an overlay navigates; the overlay must not survive it.
  useEffect(() => setOverlay(null), [pathname])

  useEffect(() => {
    if (!overlay) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOverlay(null)
      toggleRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay])

  useEffect(() => {
    document.body.style.overflow = overlay ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [overlay])

  const menuOpen = overlay === 'menu'

  return (
    <>
      {/* `data-ready` appears only once this component has mounted on the
          client. Every control in here is React state, so a click that lands
          before hydration silently does nothing — this is the signal the
          browser tests wait on instead of guessing with a timeout. */}
      <div className="site-header__actions" data-ready={mounted || undefined}>
        <button
          type="button"
          className="icon-button"
          // "Open search", not "Search": it opens the drawer rather than
          // running a query, and /search already has a button called Search.
          aria-label="Open search"
          onClick={() => setOverlay('search')}
        >
          <SearchIcon size={18} />
        </button>

        <button
          type="button"
          className="button button--primary button--compact site-header__subscribe"
          onClick={() => setOverlay('subscribe')}
        >
          {cta.label}
        </button>

        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setOverlay(menuOpen ? null : 'menu')}
        >
          <motion.span
            animate={
              menuOpen
                ? { y: 3.25, rotate: 45, transition: quick }
                : { y: 0, rotate: 0, transition: quick }
            }
          />
          <motion.span
            animate={
              menuOpen
                ? { y: -3.25, rotate: -45, transition: quick }
                : { y: 0, rotate: 0, transition: quick }
            }
          />
        </button>
      </div>

      {mounted &&
        createPortal(
          <>
            <MobileDrawer
              open={menuOpen}
              links={links}
              cta={cta}
              onClose={() => setOverlay(null)}
              onSubscribe={() => setOverlay('subscribe')}
            />
            <SearchDrawer
              open={overlay === 'search'}
              onClose={() => setOverlay(null)}
            />
            <SubscribeModal
              open={overlay === 'subscribe'}
              onClose={() => setOverlay(null)}
            />
          </>,
          document.body,
        )}
    </>
  )
}

// --- Mobile menu ---------------------------------------------------------

function MobileDrawer({
  open,
  links,
  cta,
  onClose,
  onSubscribe,
}: {
  open: boolean
  links: NavLink[]
  cta: NavLink
  onClose: () => void
  onSubscribe: () => void
}) {
  const reduced = useReducedMotion()
  const router = useRouter()
  const [term, setTerm] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const query = term.trim()
    if (!query) return
    onClose()
    router.push(`${SEARCH_PATH}?q=${encodeURIComponent(query)}`)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-nav"
          className="mobile-nav"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={editorial}
        >
          <motion.form
            className="mobile-nav__search"
            role="search"
            onSubmit={submit}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...editorial, delay: 0.04 }}
          >
            <SearchIcon size={17} />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search the archive"
              aria-label="Search the archive"
            />
          </motion.form>

          <nav className="mobile-nav__links" aria-label="Primary">
            {links.map((link, i) => (
              <motion.div
                key={`${link.label}-${link.url}`}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...editorial, delay: 0.04 * (i + 2) }}
              >
                <Link href={link.url}>{link.label}</Link>
              </motion.div>
            ))}
          </nav>

          <motion.div
            className="mobile-nav__foot"
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...editorial, delay: 0.04 * (links.length + 2) }}
          >
            <button
              type="button"
              className="button button--primary"
              onClick={onSubscribe}
            >
              {cta.label}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// --- Search --------------------------------------------------------------

type Result = {
  title: string
  excerpt: string
  href: string
  tag: string | null
  readingTime: number
}

function SearchDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const reduced = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setTerm('')
      setResults([])
    }
  }, [open])

  // Debounced so a fast typist issues one request, not one per keystroke; the
  // AbortController means a slow earlier response cannot overwrite a newer one.
  useEffect(() => {
    const query = term.trim()
    if (!query) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${SEARCH_PATH}suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
        const data = (await response.json()) as { results: Result[] }
        setResults(data.results)
      } catch {
        // An aborted request is the normal case here, not a failure.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 180)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [term])

  const query = term.trim()

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="overlay-scrim"
            onClick={onClose}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={quick}
          />
          <motion.div
            className="search-panel"
            role="search"
            aria-label="Search the archive"
            initial={reduced ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={editorial}
          >
            <div className="container">
              <div className="search__field">
                <SearchIcon size={22} />
                <input
                  ref={inputRef}
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search the archive"
                  aria-label="Search the archive"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close search"
                  onClick={onClose}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <p className="search__meta" aria-live="polite">
                <span>
                  {!query
                    ? 'Type to search'
                    : loading
                      ? 'Searching…'
                      : `${results.length} ${
                          results.length === 1 ? 'result' : 'results'
                        }`}
                </span>
                <span className="search__hint">
                  <kbd>Esc</kbd> to close
                </span>
              </p>

              <ul className="search__results">
                {results.map((result) => (
                  <li key={result.href}>
                    <Link href={result.href} className="search__result">
                      <span className="search__result-body">
                        <span className="search__result-title">
                          {result.title}
                        </span>
                        {result.excerpt && <span>{result.excerpt}</span>}
                      </span>
                      <span className="search__result-meta">
                        {[result.tag, `${result.readingTime} min`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {query && !loading && results.length === 0 && (
                <p className="search__empty">
                  Nothing matches <b>{query}</b> yet.
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// --- Subscribe -----------------------------------------------------------

function SubscribeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const reduced = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Focus the dialog rather than the input: focusing a field near the bottom
    // scrolls the modal past everything above it.
    if (open) dialogRef.current?.focus({ preventScroll: true })
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay-scrim overlay-scrim--modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={quick}
        >
          <motion.div
            ref={dialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscribe-title"
            tabIndex={-1}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={editorial}
          >
            <button
              type="button"
              className="modal__close"
              aria-label="Close"
              onClick={onClose}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <SubscribeBody onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SubscribeBody({ onClose }: { onClose: () => void }) {
  const [status, formAction, pending] = useActionState(subscribeFromModal, null)

  if (status === 'success') {
    return (
      <div className="modal__body modal__done">
        <h2 id="subscribe-title">You&rsquo;re on the list</h2>
        <p>
          New stories on materials, technique, and meaning — delivered when
          they&rsquo;re ready.
        </p>
        {/* "Done", not "Close": the dismiss ✕ above is already called Close,
            and two controls with one name is a genuine ambiguity, not just a
            test inconvenience. */}
        <button
          type="button"
          className="button button--primary"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="modal__body">
      <h2 id="subscribe-title">Stay close to the work</h2>
      <p className="modal__lede">
        One email when a piece is ready. No schedule, no filler, and nothing
        else sent to your address.
      </p>

      <form className="modal__form" action={formAction}>
        <input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          aria-label="Email address"
          autoComplete="email"
        />
        {status === 'invalid' && (
          <p className="modal__error">
            That address doesn&rsquo;t look right — check it and try again.
          </p>
        )}
        {status === 'error' && (
          <p className="modal__error">
            Something went wrong on our end. Please try again in a moment.
          </p>
        )}
        <button
          className="button button--primary"
          type="submit"
          disabled={pending}
        >
          {pending ? 'Subscribing…' : 'Subscribe'}
        </button>
        <p className="modal__small">
          Free. Unsubscribe from any email, any time.
        </p>
      </form>
    </div>
  )
}
