'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useActionState, useEffect, useRef, useState } from 'react'

import { subscribeFromModal } from '@/app/(frontend)/newsletter/actions'
import type { NavLink } from '@/lib/content/queries'
import {
  type BillingPeriod,
  checkoutUrl,
  PRICES,
  YEARLY_SAVING,
} from '@/lib/membership'
import { dictionaryFor, type Dictionary } from '@/lib/i18n/dictionaries'
import { DEFAULT_LOCALE, isPrefixedLocale } from '@/lib/i18n/locales'
import { localeSearchPath, SEARCH_PATH } from '@/lib/seo/site'

import { editorial, quick } from './motion/variants'
import { SearchIcon } from './icons'
import { SUBSCRIBE_EVENT } from './subscribe-signal'

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
export function SiteChrome({
  links,
  cta,
  locale = DEFAULT_LOCALE,
}: {
  links: NavLink[]
  cta: NavLink
  /** The page's language: the overlays' words, and where search looks. */
  locale?: string
}) {
  const t = dictionaryFor(locale)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  // A link inside an overlay navigates; the overlay must not survive it.
  useEffect(() => setOverlay(null), [pathname])

  // The membership gate on a restricted post opens this same modal.
  useEffect(() => {
    const open = () => setOverlay('subscribe')
    window.addEventListener(SUBSCRIBE_EVENT, open)
    return () => window.removeEventListener(SUBSCRIBE_EVENT, open)
  }, [])

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
          aria-label={t.chrome.openSearch}
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
          aria-label={menuOpen ? t.chrome.closeMenu : t.chrome.openMenu}
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
              t={t}
              locale={locale}
              onClose={() => setOverlay(null)}
              onSubscribe={() => setOverlay('subscribe')}
            />
            <SearchDrawer
              open={overlay === 'search'}
              onClose={() => setOverlay(null)}
              t={t}
              locale={locale}
            />
            <SubscribeModal
              open={overlay === 'subscribe'}
              onClose={() => setOverlay(null)}
              t={t}
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
  t,
  locale,
}: {
  open: boolean
  links: NavLink[]
  cta: NavLink
  onClose: () => void
  onSubscribe: () => void
  t: Dictionary
  locale: string
}) {
  const reduced = useReducedMotion()
  const router = useRouter()
  const [term, setTerm] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const query = term.trim()
    if (!query) return
    onClose()
    const path = isPrefixedLocale(locale)
      ? localeSearchPath(locale)
      : SEARCH_PATH
    router.push(`${path}?q=${encodeURIComponent(query)}`)
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
              placeholder={t.chrome.searchArchive}
              aria-label={t.chrome.searchArchive}
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
  t,
  locale,
}: {
  open: boolean
  onClose: () => void
  t: Dictionary
  locale: string
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
        // The page's language is part of the question: a Spanish page
        // suggests Spanish articles. English sends exactly what it always did.
        const scope = isPrefixedLocale(locale) ? `&locale=${locale}` : ''
        const response = await fetch(
          `${SEARCH_PATH}suggest/?q=${encodeURIComponent(query)}${scope}`,
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
  }, [term, locale])

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
            aria-label={t.chrome.searchArchive}
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
                  placeholder={t.chrome.searchArchive}
                  aria-label={t.chrome.searchArchive}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t.chrome.closeSearch}
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
                    ? t.chrome.typeToSearch
                    : loading
                      ? t.chrome.searching
                      : t.chrome.results(results.length)}
                </span>
                <span className="search__hint">
                  <kbd>Esc</kbd>
                  {t.chrome.toClose}
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
                        {[result.tag, t.common.minutes(result.readingTime)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {query && !loading && results.length === 0 && (
                <p className="search__empty">
                  {t.chrome.nothingMatches[0]}
                  <b>{query}</b>
                  {t.chrome.nothingMatches[1]}
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
  t,
}: {
  open: boolean
  onClose: () => void
  t: Dictionary
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
              aria-label={t.chrome.close}
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
            <SubscribeBody onClose={onClose} t={t.subscribe} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SubscribeBody({
  onClose,
  t,
}: {
  onClose: () => void
  t: Dictionary['subscribe']
}) {
  const [status, formAction, pending] = useActionState(subscribeFromModal, null)
  const [plan, setPlan] = useState<'free' | 'paid'>('free')
  const [period, setPeriod] = useState<BillingPeriod>('monthly')

  if (status === 'success') {
    return (
      <div className="modal__body modal__done">
        <h2 id="subscribe-title">{t.onTheList}</h2>
        <p>{t.onTheListBody}</p>
        {/* "Done", not "Close": the dismiss ✕ above is already called Close,
            and two controls with one name is a genuine ambiguity, not just a
            test inconvenience. */}
        <button
          type="button"
          className="button button--primary"
          onClick={onClose}
        >
          {t.done}
        </button>
      </div>
    )
  }

  const paid = plan === 'paid'
  const checkout = checkoutUrl(period)

  return (
    <div className="modal__body">
      <h2 id="subscribe-title">{t.title}</h2>
      <p className="modal__lede">{t.lede}</p>

      <fieldset className="plans">
        <legend className="visually-hidden">{t.chooseMembership}</legend>

        <label className={`plan${paid ? '' : ' is-selected'}`}>
          <input
            type="radio"
            name="plan"
            value="free"
            checked={!paid}
            onChange={() => setPlan('free')}
          />
          <span className="plan__head">
            <span className="plan__name">{t.free}</span>
            <span className="plan__price">
              <b>$0</b>
            </span>
          </span>
          <Benefits items={t.freeBenefits} />
        </label>

        <label className={`plan${paid ? ' is-selected' : ''}`}>
          <span className="plan__badge">{t.fullAccess}</span>
          <input
            type="radio"
            name="plan"
            value="paid"
            checked={paid}
            onChange={() => setPlan('paid')}
          />
          <span className="plan__head">
            <span className="plan__name">{t.member}</span>
            <span className="plan__price">
              <b>${PRICES[period]}</b>
              {period === 'monthly' ? t.perMonth : t.perYear}
            </span>
          </span>
          <Benefits items={t.paidBenefits} />
        </label>
      </fieldset>

      {paid && (
        <div className="billing" role="group" aria-label={t.billingPeriod}>
          <button
            type="button"
            aria-pressed={period === 'monthly'}
            onClick={() => setPeriod('monthly')}
          >
            {t.monthly}
            <span>{t.aMonth(PRICES.monthly)}</span>
          </button>
          <button
            type="button"
            aria-pressed={period === 'yearly'}
            onClick={() => setPeriod('yearly')}
          >
            {t.yearly}
            <span>{t.save(YEARLY_SAVING)}</span>
          </button>
        </div>
      )}

      {paid ? (
        checkout ? (
          <a className="button button--primary modal__cta" href={checkout}>
            {t.continueToPayment}
          </a>
        ) : (
          <>
            <button className="button button--primary modal__cta" disabled>
              {t.continueToPayment}
            </button>
            {/* Said plainly rather than failing at the click: this site reads
                Stripe webhooks but has no checkout of its own yet. */}
            <p className="modal__small">{t.paidNotOpen}</p>
          </>
        )
      ) : null}

      {!paid && (
        <form className="modal__form" action={formAction}>
          <input
            type="email"
            name="email"
            required
            placeholder={t.emailPlaceholder}
            aria-label={t.emailAddress}
            autoComplete="email"
          />
          {status === 'invalid' && (
            <p className="modal__error">{t.invalidEmail}</p>
          )}
          {status === 'error' && (
            <p className="modal__error">{t.serverError}</p>
          )}
          <button
            className="button button--primary"
            type="submit"
            disabled={pending}
          >
            {pending ? t.subscribing : t.subscribe}
          </button>
          <p className="modal__small">{t.freeSmall}</p>
        </form>
      )}
    </div>
  )
}

function Benefits({ items }: { items: string[] }) {
  return (
    <ul className="plan__list">
      {items.map((item) => (
        <li key={item}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
