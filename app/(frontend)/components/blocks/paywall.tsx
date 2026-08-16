import type { PaywallData } from '@/blocks/schema'

/**
 * Where a gated post stops, as an editor sees it.
 *
 * This only ever renders in draft preview. On a published page the marker is
 * removed from the body in `lib/content/body.ts` before anything is built, and
 * on a gated post read by a non-member everything from here down is dropped
 * server-side — so there is no published state in which this component appears.
 *
 * It exists because the cut is otherwise invisible: an editor placing a line
 * that decides what non-members can read needs to see where they put it.
 */
export function PaywallMarker({ data }: { data: PaywallData }) {
  const note = data.note?.trim()

  return (
    <div className="module module--paywall paywall-marker" role="note">
      <span className="paywall-marker__label">Members-only from here</span>
      <span className="paywall-marker__hint">
        {note ||
          'Readers who are not members see everything above this line, and the membership gate instead of the rest.'}
      </span>
    </div>
  )
}
