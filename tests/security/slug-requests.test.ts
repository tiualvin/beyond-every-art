// What a request for a page that does not exist is allowed to cost.
//
// Every slug route reads through `cachedRead`, which is `unstable_cache` keyed
// on the slug — so an unbounded run of made-up slugs was an unbounded run of
// Postgres queries and cache files. These cover both halves of the bound: the
// shape check that answers most of it without a query at all, and the miss
// allowance that bounds the rest.

import { describe, expect, it } from 'vitest'

import {
  hasSlugMissAllowance,
  isLookupableSlug,
  MAX_SLUG_LENGTH,
  spendSlugMiss,
} from '../../lib/security/slug-requests'

/** A distinct source per test, so one test's misses cannot spend another's. */
let caller = 0
function from(): Headers {
  caller += 1
  return new Headers({ 'x-forwarded-for': `203.0.113.${caller}` })
}

describe('isLookupableSlug', () => {
  it('accepts the shape every stored slug already has', () => {
    expect(isLookupableSlug('the-chemical-symphony-of-ultramarine')).toBe(true)
    expect(isLookupableSlug('burnt-sienna-2')).toBe(true)
  })

  it('refuses what `fields/slug.ts` would never have stored', () => {
    // The route must not look up values the database cannot contain: the field
    // validates against this same pattern on write.
    for (const value of [
      'My Post',
      'post.json',
      'a//b',
      'UPPER',
      '-leading',
      'trailing-',
      'double--hyphen',
      'unicode-é',
      '',
    ]) {
      expect(isLookupableSlug(value)).toBe(false)
    }
  })

  it('refuses a slug longer than anything that could have been stored', () => {
    // `SLUG_PATTERN` bounds the alphabet but not the length, so without a cap a
    // megabyte of hyphenated lowercase is still "well formed" — and still a
    // query. Ghost stored slugs in a 191-character column.
    const long = 'a'.repeat(MAX_SLUG_LENGTH)
    expect(isLookupableSlug(long)).toBe(true)
    expect(isLookupableSlug(`${long}a`)).toBe(false)
  })
})

describe('the slug miss allowance', () => {
  it('is untouched by a source that has missed nothing', () => {
    expect(hasSlugMissAllowance(from())).toBe(true)
  })

  it('is spent by misses and then refuses further lookups', () => {
    const source = from()

    // The production allowance is 30 a minute; spending it should take exactly
    // that many misses and no fewer.
    for (let i = 0; i < 30; i += 1) {
      expect(hasSlugMissAllowance(source)).toBe(true)
      spendSlugMiss(source)
    }

    expect(hasSlugMissAllowance(source)).toBe(false)
  })

  it('bounds one source without touching another', () => {
    const noisy = from()
    const reader = from()

    for (let i = 0; i < 40; i += 1) spendSlugMiss(noisy)

    expect(hasSlugMissAllowance(noisy)).toBe(false)
    expect(hasSlugMissAllowance(reader)).toBe(true)
  })
})
