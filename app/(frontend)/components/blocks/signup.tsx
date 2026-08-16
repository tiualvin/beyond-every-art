'use client'

import { useActionState } from 'react'

import { subscribeFromArticle } from '@/app/(frontend)/newsletter/actions'
import type { SignupData } from '@/blocks/schema'

/**
 * A newsletter signup placed inside an article body.
 *
 * A client component, and the only one of the three modules that is: it has to
 * answer in place. The page-level form reports itself by redirecting to
 * `/newsletter?status=…`, which is right for a page that exists to collect an
 * address and wrong in the middle of a piece somebody is reading.
 *
 * Without JavaScript the form still posts and the action still runs — React
 * form actions submit natively — so the module degrades to a working signup
 * that navigates rather than a dead input.
 *
 * The rate limiting, duplicate handling and validation all live in the action.
 * Nothing about abuse protection is decided here, and the response is
 * deliberately the same whether or not the address was already on the list.
 */
export function Signup({ data }: { data: SignupData }) {
  const [status, formAction, pending] = useActionState(
    subscribeFromArticle,
    null,
  )
  const heading = data.heading?.trim() || 'Stay close to the work'

  if (status === 'success') {
    return (
      <section className="module module--signup signup signup--done">
        <p className="signup__done-text">
          You&rsquo;re on the list. New stories arrive when they&rsquo;re ready.
        </p>
      </section>
    )
  }

  return (
    <section className="module module--signup signup">
      <h2 className="signup__heading">{heading}</h2>
      {data.body?.trim() && <p className="signup__body">{data.body}</p>}

      <form className="signup__form" action={formAction}>
        <label className="visually-hidden" htmlFor="signup-block-email">
          Email address
        </label>
        <input
          id="signup-block-email"
          className="signup__input"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby="signup-block-consent"
        />
        <button className="signup__btn" type="submit" disabled={pending}>
          {pending ? 'Subscribing…' : data.submitLabel?.trim() || 'Subscribe'}
        </button>
      </form>

      {status === 'invalid' && (
        <p className="signup__note signup__note--error" role="status">
          That address doesn&rsquo;t look right. Check it and try again.
        </p>
      )}
      {status === 'error' && (
        <p className="signup__note signup__note--error" role="status">
          Something went wrong. Please try again in a moment.
        </p>
      )}

      {/* The module spec also calls for a privacy-policy link beside the
          consent line. There is no privacy route in this application and no
          `pages` document guaranteed to be at `/privacy`, so linking one here
          would ship a 404 next to a consent notice — worse than the omission.
          Add the link here once that page exists. */}
      <p className="signup__note" id="signup-block-consent">
        Occasional emails about new work. No spam, unsubscribe any time.
      </p>
    </section>
  )
}
