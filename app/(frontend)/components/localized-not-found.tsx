import Link from 'next/link'

import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { getRequestLocale } from '@/lib/i18n/request'
import { localeHomePath } from '@/lib/seo/site'

import { FadeIn } from './motion/fade-in'

/**
 * The 404 under a language prefix — `/es/no-such-article/` — in that
 * language, with the way back to that language's home page. Still a real 404:
 * a missing translation is never redirected to English, which would tell a
 * crawler the page exists.
 *
 * Mounted by the `not-found.tsx` files under `[slug]/…`, not by the root one.
 * The root boundary is embedded in every page the site renders, and it is
 * synchronous; making it read the request's language would make it async and
 * change the bytes of every English page. The markup is the root 404's, word
 * for word in English.
 */
export async function LocalizedNotFound() {
  const locale = await getRequestLocale()
  const t = dictionaryFor(locale).notFound
  return (
    <main>
      <section className="section">
        <div className="container" style={{ maxWidth: '34rem' }}>
          <FadeIn>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>{t.title}</h1>
            <p className="muted">{t.body}</p>
            <Link
              href={localeHomePath(locale)}
              className="button button--ghost"
            >
              {t.back}
            </Link>
          </FadeIn>
        </div>
      </section>
    </main>
  )
}
