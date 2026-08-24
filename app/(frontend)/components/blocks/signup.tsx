'use client'

import { useActionState, useId } from 'react'

import { subscribeFromArticle } from '@/app/(frontend)/newsletter/actions'
import type { SignupData } from '@/blocks/schema'
import { resolveSignupCopy } from '@/lib/content/signup-campaign'

/**
 * A newsletter signup placed inside an article body.
 *
 * A client component, and the only one of the modules that is: it has to
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
 *
 * The copy comes from the campaign when one is selected and currently running,
 * and from the block's own fields otherwise — `lib/content/signup-campaign.ts`
 * decides which, and the server action asks it the same question about the
 * same record rather than believing the id this form submits.
 */
export function Signup({ data }: { data: SignupData }) {
  const [status, formAction, pending] = useActionState(
    subscribeFromArticle,
    null,
  )
  // Two signup modules in one article are an ordinary editorial choice — one
  // partway through a long piece and one at the end. With the ids hardcoded
  // both forms claimed the same ones, and a duplicate id does not fail
  // visibly: the browser resolves `for` and `aria-describedby` to whichever
  // element it met first, so the second form's label and consent line both
  // pointed at the first form's input.
  const fieldId = useId()
  const emailId = `${fieldId}-email`
  const consentId = `${fieldId}-consent`
  const copy = resolveSignupCopy(data)

  if (status === 'success') {
    return (
      <section className="module module--signup signup signup--done">
        <p className="signup__done-text">{copy.successMessage}</p>
      </section>
    )
  }

  return (
    <section className="module module--signup signup">
      <h2 className="signup__heading">{copy.heading}</h2>
      {copy.body && <p className="signup__body">{copy.body}</p>}

      <form className="signup__form" action={formAction}>
        {/* Names the campaign; it does not assert anything about it. The
            server re-reads the record and decides for itself whether the
            campaign is live and what to attribute the signup to. */}
        {copy.campaignId && (
          <input type="hidden" name="campaign" value={copy.campaignId} />
        )}
        <label className="visually-hidden" htmlFor={emailId}>
          Email address
        </label>
        <input
          id={emailId}
          className="signup__input"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby={consentId}
        />
        <button className="signup__btn" type="submit" disabled={pending}>
          {pending ? 'Subscribing…' : copy.submitLabel}
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

      <p className="signup__note" id={consentId}>
        {copy.consentText}
        {copy.privacyLink && (
          <>
            {' '}
            <a className="signup__privacy" href={copy.privacyLink}>
              Privacy policy
            </a>
            .
          </>
        )}
      </p>
    </section>
  )
}
