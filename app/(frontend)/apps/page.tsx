import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { getApps, type AppCard } from '@/lib/content/queries'
import { absoluteUrl, appPath, APPS_PATH, getSiteUrl } from '@/lib/seo/site'

import { AppPlate } from '../components/app-plate'
import { FadeIn } from '../components/motion/fade-in'
import { Reveal } from '../components/motion/reveal'

import { joinAppWaitlist } from './actions'
import { Paragraphs } from './paragraphs'
import { thumbnailSrc } from '@/lib/content/media'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

export function generateMetadata(): Metadata {
  return {
    title: 'Apps',
    description:
      'The apps Beyond Every Art is building alongside the magazine. ' +
      'None of them have shipped yet.',
    alternates: { canonical: absoluteUrl(APPS_PATH, getSiteUrl()) },
  }
}

const STATUS_LABELS: Record<AppCard['status'], string> = {
  concept: 'Concept',
  in_development: 'In development',
  coming_soon: 'Coming soon',
  available: 'Available',
}

const PLATFORM_LABELS: Record<string, string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'Web',
}

const WAITLIST_MESSAGES: Record<string, string> = {
  success: 'Thank you. We will write when there is something to try.',
  none: 'Tick at least one of them first.',
  invalid: 'That does not look like an email address.',
  error: 'Something went wrong. Please try again.',
}

/**
 * Stable per app, so a drawing does not change when an editor reorders the
 * list. Slug rather than id: ids move between environments, slugs do not.
 */
function seedFrom(slug: string): number {
  let hash = 2166136261
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const [apps, { status }] = await Promise.all([getApps(), searchParams])
  const message = status ? WAITLIST_MESSAGES[status] : undefined
  const submitted = status === 'success'

  return (
    <main>
      <section className="section apps">
        <div className="container">
          <FadeIn>
            <div className="apps__head">
              <p className="eyebrow">From the studio</p>
              <h1>Apps</h1>
              <p className="apps__intro">
                Beyond Every Art is a magazine about colour, materials, and how
                things are made. These are the apps we want to make to go
                alongside it — for the moment you finish a piece about a limited
                palette and want to go and mix one yourself.
              </p>
            </div>
          </FadeIn>

          {apps.length > 0 ? (
            <FadeIn delay={0.08}>
              <p className="apps__state">
                <strong>None of them exist yet.</strong> Nothing here can be
                downloaded and nothing has a date. If you would like to hear
                when one opens, there is a form at the bottom of this page — and
                which ones you tick is honestly how we will decide what to make
                first.
              </p>
            </FadeIn>
          ) : (
            <p className="muted">
              Nothing to show yet. Apps appear here once an editor publishes one
              in Payload.
            </p>
          )}
        </div>
      </section>

      {apps.length > 0 && (
        <section className="roster">
          <div className="container">
            {apps.map((app, index) => (
              <AppEntry key={app.id} app={app} index={index} />
            ))}
          </div>
        </section>
      )}

      {apps.length > 0 && (
        <section className="waitlist" id="notify">
          <div className="container">
            <div className="waitlist__grid">
              <Reveal>
                <div>
                  <p className="eyebrow">Notify me</p>
                  <h2>Which of these would you actually use?</h2>
                  <p className="waitlist__lede">
                    Tick as many as you like. We will write once, when that one
                    is ready for people to try — and what gets ticked is how we
                    decide what to make first.
                  </p>
                </div>
              </Reveal>

              <Reveal>
                <div>
                  {submitted ? (
                    <div className="waitlist__done" role="status">
                      <h3>Thank you</h3>
                      <p>{message}</p>
                    </div>
                  ) : (
                    <form action={joinAppWaitlist}>
                      <fieldset className="waitlist__fields">
                        <legend>Apps</legend>
                        <div className="waitlist__options">
                          {apps.map((app) => (
                            <label className="pick" key={app.id}>
                              <input
                                type="checkbox"
                                name="app"
                                value={app.slug}
                              />
                              <span>{app.name}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <label
                        className="visually-hidden"
                        htmlFor="waitlist-email"
                      >
                        Email address
                      </label>
                      <div className="waitlist__row">
                        <input
                          id="waitlist-email"
                          type="email"
                          name="email"
                          required
                          autoComplete="email"
                          placeholder="you@example.com"
                        />
                        <button
                          className="button button--primary"
                          type="submit"
                        >
                          Notify me
                        </button>
                      </div>

                      {message && (
                        <p className="waitlist__error" role="alert">
                          {message}
                        </p>
                      )}

                      <p className="waitlist__small">
                        This is separate from the newsletter, so it will not
                        sign you up for that. No countdowns and no reminders —
                        one email per app, then nothing.
                      </p>
                    </form>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

/**
 * Weight falls down the page. The apps are not equal — the first is next and
 * near-certain, the last is furthest off — and an even treatment would deny
 * that, as well as turning four spreads into a card grid at a larger size.
 */
function AppEntry({ app, index }: { app: AppCard; index: number }) {
  const modifiers = [
    index === 0 ? 'app--lead' : '',
    index % 2 === 1 ? 'app--flip' : '',
    index > 0 && index === 3 ? 'app--tail' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const platforms = app.platforms
    .map((p) => PLATFORM_LABELS[p] ?? p)
    .join(' · ')

  return (
    <Reveal>
      <article className={`app ${modifiers}`.trim()}>
        <div className="app__plate" data-plate={app.plate}>
          {app.image ? (
            <Image
              src={thumbnailSrc(app.image)}
              alt={app.image.alt || ''}
              fill
              sizes="(max-width: 56rem) 100vw, 34rem"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <AppPlate plate={app.plate} seed={seedFrom(app.slug)} />
          )}
        </div>

        <div className="app__body">
          <p className="app__index">{String(index + 1).padStart(2, '0')}</p>
          <h2 className="app__name">{app.name}</h2>
          {app.tagline && <p className="app__tagline">{app.tagline}</p>}
          <Paragraphs text={app.summary} className="app__summary" />
          {app.detail && <AppDetailLine detail={app.detail} />}

          <div className="app__meta">
            <span className={`status status--${app.status}`}>
              {STATUS_LABELS[app.status]}
            </span>
            {app.sequence && (
              <span className="app__sequence">{app.sequence}</span>
            )}
            {platforms && <span className="app__platforms">{platforms}</span>}
          </div>

          <Link className="app__link" href={appPath(app.slug)}>
            More about {app.name}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5" />
            </svg>
          </Link>
        </div>
      </article>
    </Reveal>
  )
}

/**
 * The detail line opens with a short bold lead-in. Editors write it as one
 * field with the lead-in ended by a full stop, so the split happens here
 * rather than asking them to manage two.
 */
function AppDetailLine({ detail }: { detail: string }) {
  const match = /^(.{3,80}?[.!?])\s+(.*)$/s.exec(detail.trim())
  if (!match) return <p className="app__detail">{detail}</p>
  return (
    <p className="app__detail">
      <b>{match[1]}</b> {match[2]}
    </p>
  )
}
