import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getAppBySlug, type AppDetail } from '@/lib/content/queries'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { getPreviewMode } from '@/lib/preview/mode'
import { absoluteUrl, appPath, APPS_PATH, getSiteUrl } from '@/lib/seo/site'

import { AppPlate } from '../../components/app-plate'
import { FadeIn } from '../../components/motion/fade-in'
import { Reveal } from '../../components/motion/reveal'
import { joinAppWaitlist } from '../actions'
import { Paragraphs } from '../paragraphs'

// Rendered per request so canonical URLs come from the running container's
// environment rather than the build's; the reads behind it are cached and
// purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }

const STATUS_LABELS: Record<AppDetail['status'], string> = {
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

/** What the page says about an app nobody can install yet. */
const STATUS_NOTES: Record<AppDetail['status'], string> = {
  concept:
    'This one is still an idea. Nothing has been built, and there is no date.',
  in_development:
    'This one is being built. There is nothing to install yet, and no date.',
  coming_soon: 'This one is finished and being tested. Not long now.',
  available: 'This one is out.',
}

function seedFrom(slug: string): number {
  let hash = 2166136261
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// Resolved once per request; generateMetadata and the page body share it.
const resolve = cache(async (slug: string): Promise<AppDetail | null> => {
  const { draft, user } = await getPreviewMode()
  return getAppBySlug(slug, { draft, user })
})

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const app = await resolve(slug)
  if (!app) return { title: 'Not found' }

  const canonical = absoluteUrl(appPath(app.slug), getSiteUrl())
  const description = app.metaDescription || app.summary || app.tagline
  return {
    title: app.metaTitle || app.name,
    description: description || undefined,
    alternates: { canonical },
    openGraph: { type: 'website', title: app.name, url: canonical },
  }
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const app = await resolve(slug)

  if (!app) {
    await logMissingRoute(appPath(slug))
    notFound()
  }

  const platforms = app.platforms
    .map((p) => PLATFORM_LABELS[p] ?? p)
    .join(' · ')
  const storeLinks = [
    app.appStoreURL ? { label: 'App Store', url: app.appStoreURL } : null,
    app.playStoreURL ? { label: 'Google Play', url: app.playStoreURL } : null,
  ].filter((link): link is { label: string; url: string } => link !== null)
  // Store links only stand in for the waitlist once there is somewhere to go.
  const showStores = app.status === 'available' && storeLinks.length > 0

  return (
    <main>
      <section className="section app-detail">
        <div className="container">
          <FadeIn>
            <p className="eyebrow">
              <Link href={APPS_PATH}>Apps</Link>
            </p>
            <h1 className="app-detail__name">{app.name}</h1>
            {app.tagline && (
              <p className="app-detail__tagline">{app.tagline}</p>
            )}
            <div className="app__meta app-detail__meta">
              <span className={`status status--${app.status}`}>
                {STATUS_LABELS[app.status]}
              </span>
              {app.sequence && (
                <span className="app__sequence">{app.sequence}</span>
              )}
              {platforms && <span className="app__platforms">{platforms}</span>}
            </div>
          </FadeIn>

          <FadeIn delay={0.08}>
            <div
              className="app-detail__plate app__plate"
              data-plate={app.plate}
            >
              {app.image ? (
                <Image
                  src={app.image.url}
                  alt={app.image.alt || ''}
                  fill
                  sizes="(max-width: 56rem) 100vw, 60rem"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <AppPlate plate={app.plate} seed={seedFrom(app.slug)} />
              )}
            </div>
          </FadeIn>

          <div className="app-detail__body">
            {app.summary && (
              <FadeIn delay={0.12}>
                <div>
                  {/* The first paragraph is the lede; the rest is body. */}
                  <Paragraphs
                    text={app.summary.split(/\n{2,}/)[0] ?? app.summary}
                    className="app-detail__standfirst"
                  />
                  <Paragraphs
                    text={app.summary
                      .split(/\n{2,}/)
                      .slice(1)
                      .join('\n\n')}
                    className="app-detail__para"
                  />
                </div>
              </FadeIn>
            )}

            {app.bodyHtml && (
              <FadeIn delay={0.16}>
                <div
                  className="prose"
                  dangerouslySetInnerHTML={{ __html: app.bodyHtml }}
                />
              </FadeIn>
            )}

            {app.detail && (
              <FadeIn delay={0.2}>
                <p className="app__detail">{app.detail}</p>
              </FadeIn>
            )}
          </div>

          {app.screenshots.length > 0 && (
            <Reveal>
              <ul className="app-detail__shots">
                {app.screenshots.map((shot) => (
                  <li key={shot.image.url}>
                    <Image
                      src={shot.image.url}
                      alt={shot.image.alt || shot.caption || ''}
                      width={shot.image.width || 900}
                      height={shot.image.height || 1600}
                    />
                    {shot.caption && <p>{shot.caption}</p>}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
      </section>

      <section className="waitlist" id="notify">
        <div className="container">
          <div className="waitlist__grid">
            <Reveal>
              <div>
                <p className="eyebrow">{showStores ? 'Get it' : 'Notify me'}</p>
                <h2>
                  {showStores
                    ? `${app.name} is out`
                    : `Hear when ${app.name} is ready`}
                </h2>
                <p className="waitlist__lede">{STATUS_NOTES[app.status]}</p>
              </div>
            </Reveal>

            <Reveal>
              <div>
                {showStores ? (
                  <p className="app-detail__stores">
                    {storeLinks.map((link) => (
                      <a
                        className="button button--primary"
                        href={link.url}
                        key={link.url}
                        rel="noopener"
                      >
                        {link.label}
                      </a>
                    ))}
                  </p>
                ) : (
                  <form action={joinAppWaitlist}>
                    <input type="hidden" name="app" value={app.slug} />
                    <label
                      className="visually-hidden"
                      htmlFor="app-waitlist-email"
                    >
                      Email address
                    </label>
                    <div className="waitlist__row">
                      <input
                        id="app-waitlist-email"
                        type="email"
                        name="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                      />
                      <button className="button button--primary" type="submit">
                        Notify me
                      </button>
                    </div>
                    <p className="waitlist__small">
                      One email, when there is something to try. This is
                      separate from the newsletter.
                    </p>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </main>
  )
}
