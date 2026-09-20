// Where a piece is in the reading, as distinct from whether it is published.
//
// The project has three roles — admin, editor, author — and two states, draft
// and published. So an author could write, and there was nowhere to say they
// had finished: no "ready for an editor", no way for an editor to hand it back,
// and no list of what was waiting on whom. The roles described a process the
// CMS did not have, and the process ran in whatever chat window the two people
// happened to share.
//
// Deliberately separate from `_status`, and deliberately not wired to it.
// Payload's draft/published pair is about what readers can see; this is about
// what colleagues owe each other, and collapsing the two would mean either an
// approval gate on publishing — which no one asked for and which an editor
// working alone would route around on day one — or a status field with six
// values that means two things at once.
//
// It has no default. An empty value is "nobody is using this on this piece",
// which is the honest state for a publication whose editor and author are the
// same person, and for every one of the 117 migrated articles. Turning the
// workflow on is choosing a value; it is never imposed.

import type { Field, SelectField } from 'payload'

export const REVIEW_STATES = ['writing', 'ready', 'changes'] as const

export type ReviewState = (typeof REVIEW_STATES)[number]

/** The states that mean somebody is waiting on somebody else. */
export const OPEN_REVIEW_STATES: readonly ReviewState[] = ['ready', 'changes']

export function reviewStateField(): Field {
  return {
    name: 'reviewState',
    label: 'Review',
    type: 'select',
    index: true,
    options: [
      { label: 'Being written', value: 'writing' },
      { label: 'Ready to read', value: 'ready' },
      { label: 'Changes asked for', value: 'changes' },
    ] satisfies Array<{ label: string; value: ReviewState }>,
    admin: {
      position: 'sidebar',
      description:
        'Who this is waiting on. Separate from publishing — it gates nothing, and leaving it empty is fine.',
    },
  } satisfies SelectField
}
