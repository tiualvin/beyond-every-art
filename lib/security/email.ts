// What an anonymous submitter may put in an email field.
//
// Two public server actions accept an address from a stranger — the newsletter
// signup and the app waitlist — and both carried their own copy of the same
// regex. The check itself was right and the bound around it was missing: a
// pattern of "some non-space, an @, some non-space, a dot, some non-space"
// matches a megabyte of text as readily as an address, and Next caps a Server
// Action body at 1 MB rather than at anything to do with email.
//
// What happened next was survivable but accidental. The value went to Postgres
// as a `where` clause and then as an insert, and the column is indexed, so a
// btree entry over roughly 2,700 bytes was refused by the database — an
// exception the caller reports as a generic failure. Nothing broke, but the
// bound was the index's, not ours, and it moves if the index does.
//
// Shared rather than duplicated so the two actions cannot drift, and pure so
// `tests/security/email.test.ts` can assert on it without a request.

/**
 * The longest address accepted.
 *
 * RFC 5321 §4.5.3.1.3 caps a forward path at 256 octets including the angle
 * brackets, which leaves 254 for the address itself. That is the real ceiling
 * for something that has to be deliverable, so nothing legitimate is refused by
 * it, and it is an order of magnitude below what the database would have caught.
 */
export const MAX_EMAIL_LENGTH = 254

/** Basic RFC 5322-ish check; Payload's `email` field re-validates on write. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Whether an address is worth handing to the database.
 *
 * Length first, because it is the cheap half and because it is what stops an
 * unbounded string reaching a regex at all.
 */
export function isSubmittableEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value)
}
