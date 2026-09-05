// The bound on an address a stranger may submit.
//
// Both public signup actions used to carry their own copy of the regex and no
// length check at all, so the only thing stopping a megabyte of text reaching
// Postgres was the size limit on a btree index entry. These pin the bound in
// the application, where it can be reasoned about.

import { describe, expect, it } from 'vitest'

import { isSubmittableEmail, MAX_EMAIL_LENGTH } from '../../lib/security/email'

describe('isSubmittableEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isSubmittableEmail('reader@example.com')).toBe(true)
  })

  it('accepts an address at exactly the ceiling', () => {
    // Nothing deliverable is longer, so the limit must not bite one this size.
    const local = 'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length)
    const address = `${local}@example.com`
    expect(address).toHaveLength(MAX_EMAIL_LENGTH)
    expect(isSubmittableEmail(address)).toBe(true)
  })

  it('refuses an address one character past the ceiling', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length + 1)
    expect(isSubmittableEmail(`${local}@example.com`)).toBe(false)
  })

  it('refuses a body-sized string that satisfies the pattern', () => {
    // The shape this exists for: no whitespace, one @, one dot, so the regex
    // alone said yes and handed it to a query and an insert.
    expect(isSubmittableEmail(`${'a'.repeat(500_000)}@example.com`)).toBe(false)
  })

  it('is the RFC 5321 forward-path limit, not a number someone liked', () => {
    expect(MAX_EMAIL_LENGTH).toBe(254)
  })

  it('still refuses the shapes that are not addresses', () => {
    expect(isSubmittableEmail('')).toBe(false)
    expect(isSubmittableEmail('reader')).toBe(false)
    expect(isSubmittableEmail('reader@example')).toBe(false)
    expect(isSubmittableEmail('reader @example.com')).toBe(false)
  })
})
