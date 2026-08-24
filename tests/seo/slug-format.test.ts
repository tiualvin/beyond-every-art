import { describe, expect, it } from 'vitest'

import {
  SLUG_PATTERN,
  isWellFormedSlug,
  slugFormatError,
  slugFromTitle,
} from '../../lib/seo/slug-format'

describe('isWellFormedSlug', () => {
  // The corpus this rule has to accept. If any of these ever fails, the rule
  // has become stricter than the URLs already published under it.
  it('accepts the shape Ghost produced', () => {
    for (const slug of [
      'understanding-ultramarine',
      'a-work-in-progress',
      'notes-from-the-studio',
      'about',
      'top-10-blues',
      '2024-in-review',
    ]) {
      expect(isWellFormedSlug(slug)).toBe(true)
    }
  })

  it('refuses everything that would not survive being a URL segment', () => {
    for (const slug of [
      'My Tag!', // the case that motivated this: spaces and punctuation
      'Understanding-Ultramarine', // capitals percent-encode differently
      'notes/from/the-studio', // a path, not a segment
      'trailing-', // an empty final word
      '-leading',
      'double--hyphen',
      'ultramarine?',
      'café',
      '',
    ]) {
      expect(isWellFormedSlug(slug)).toBe(false)
    }
  })

  it('anchors the pattern, so a valid substring cannot smuggle the rest in', () => {
    expect(SLUG_PATTERN.test('ok\nnot ok')).toBe(false)
  })
})

describe('slugFormatError', () => {
  it('names the offending value and the rule', () => {
    const message = slugFormatError('My Tag!')

    expect(message).toContain('My Tag!')
    expect(message).toContain('lowercase letters')
  })
})

describe('slugFromTitle', () => {
  it('derives the slug an editor would have typed', () => {
    expect(slugFromTitle('Understanding Ultramarine')).toBe(
      'understanding-ultramarine',
    )
    expect(slugFromTitle('A Painter’s Notes: Blue')).toBe(
      'a-painters-notes-blue',
    )
    expect(slugFromTitle('  Spaced   Out  ')).toBe('spaced-out')
  })

  // The derived value is fed straight back through the same validator, so
  // anything this produces has to satisfy it — including the awkward cases.
  it('only ever produces something the validator accepts', () => {
    for (const title of [
      'Hello, World!',
      '— Dashes — Everywhere —',
      'Ünïcødé Title',
      '100% Cotton Rag',
    ]) {
      const slug = slugFromTitle(title)
      if (slug) expect(isWellFormedSlug(slug)).toBe(true)
    }
  })

  // Better to ask for a slug than to hand back a mangled one; the field treats
  // an empty derivation as "no default" and leaves `required` to complain.
  it('gives up rather than guessing when nothing survives', () => {
    expect(slugFromTitle('日本語')).toBe('')
    expect(slugFromTitle('!!!')).toBe('')
  })
})
