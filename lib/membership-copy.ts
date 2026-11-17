// What each plan in the subscribe modal promises, in English.
//
// Its own module so the English dictionary (`lib/i18n/dictionaries/en.ts`) can
// read it without importing `membership.ts`, which imports the dictionaries.

export const FREE_BENEFITS = [
  'Every public piece, in full',
  'The newsletter when a story is ready',
  'No card, no charge',
]

export const PAID_BENEFITS = [
  'Everything in Free',
  'Members-only and subscriber-only pieces',
  'The complete archive',
  'Supports the reporting and the lab time',
]
