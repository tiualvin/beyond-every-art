import type { Metadata } from 'next'

import { absoluteUrl, getSiteUrl, NEWSLETTER_PATH } from '@/lib/seo/site'

import { subscribeToNewsletter } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = { status?: string }

export function generateMetadata(): Metadata {
  const canonical = absoluteUrl(NEWSLETTER_PATH, getSiteUrl())
  return { title: 'Newsletter', alternates: { canonical } }
}

const STATUS_MESSAGES: Record<string, string> = {
  success: "You're subscribed. Thanks for joining.",
  invalid: 'Enter a valid email address.',
  error: 'Something went wrong. Please try again.',
}

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { status } = await searchParams
  const message = status ? STATUS_MESSAGES[status] : undefined

  return (
    <main>
      <section className="section">
        <div className="container">
          <div className="archive__head">
            <p className="eyebrow">Newsletter</p>
            <h1>Stay in the loop</h1>
            <p className="muted" style={{ maxWidth: '40rem' }}>
              New articles, color stories, and creative prompts — no spam,
              unsubscribe anytime.
            </p>
            <form className="search-form" action={subscribeToNewsletter}>
              <input
                className="search-form__input"
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                aria-label="Email address"
              />
              <button className="button button--primary" type="submit">
                Subscribe
              </button>
            </form>
            {message && (
              <p className="muted" role="status">
                {message}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
