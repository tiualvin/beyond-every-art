'use client'

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
export function MembershipGate({ visibility }: { visibility: PostVisibility }) {
  const audience = visibility === 'paid' ? 'subscribers' : 'members'

  return (
    <aside className="gate" aria-labelledby="gate-title">
      <p className="eyebrow">
        {visibility === 'paid' ? 'Subscribers only' : 'Members only'}
      </p>
      <h2 id="gate-title" className="gate__title">
        The rest of this piece is for {audience}
      </h2>
      <p className="gate__body">
        Memberships are not open yet — the site is moving to a new home first.
        Join the list and you will hear the moment they are, and get every
        public piece in the meantime.
      </p>
      <button
        type="button"
        className="button button--primary"
        onClick={openSubscribeModal}
      >
        Join the list
      </button>
      <p className="gate__small">No account to make, nothing to pay.</p>
    </aside>
  )
}
