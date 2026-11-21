'use client'

import { dictionaryFor } from '@/lib/i18n/dictionaries'

import type { PostVisibility } from '@/lib/content/queries'

import { openSubscribeModal } from './subscribe-signal'

/**
 * What a reader gets where the rest of a restricted piece would be.
 *
 * There is no sign-in on this site yet and no checkout behind the paid plan,
 * so this promises nothing it cannot do: it says the piece is for members and
 * that membership is coming, and offers the one thing that works today, which
 * is the list. When memberships open, this copy is where the paywall goes.
 */
export function MembershipGate({
  visibility,
  locale,
}: {
  visibility: PostVisibility
  /** The page's language. English when absent. */
  locale?: string
}) {
  const t = dictionaryFor(locale).gate
  const audience = visibility === 'paid' ? t.subscribers : t.members

  return (
    <aside className="gate" aria-labelledby="gate-title">
      <p className="eyebrow">
        {visibility === 'paid' ? t.subscribersOnly : t.membersOnly}
      </p>
      <h2 id="gate-title" className="gate__title">
        {t.restIsFor}
        {audience}
      </h2>
      <p className="gate__body">{t.body}</p>
      <button
        type="button"
        className="button button--primary"
        onClick={openSubscribeModal}
      >
        {t.join}
      </button>
      <p className="gate__small">{t.small}</p>
    </aside>
  )
}
