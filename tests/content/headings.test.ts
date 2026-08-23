import { describe, expect, it } from 'vitest'

import {
  createAnchorAllocator,
  headingText,
  toAnchorSlug,
} from '../../lib/content/headings'

const text = (value: string) => ({ text: value })

describe('headingText', () => {
  it('reads the text of a plain heading', () => {
    expect(headingText({ children: [text('Binders and behaviour')] })).toBe(
      'Binders and behaviour',
    )
  })

  it('joins the runs of a heading broken up by formatting', () => {
    expect(
      headingText({
        children: [
          text('Why '),
          { children: [text('burnt sienna')] },
          text(' behaves differently'),
        ],
      }),
    ).toBe('Why burnt sienna behaves differently')
  })

  it('is empty for a heading with no text nodes', () => {
    expect(headingText({ children: [] })).toBe('')
    expect(headingText({})).toBe('')
  })
})

describe('toAnchorSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(toAnchorSlug('Binders and Behaviour')).toBe('binders-and-behaviour')
  })

  it('folds diacritics rather than dropping the letters', () => {
    expect(toAnchorSlug('Découpage in Málaga')).toBe('decoupage-in-malaga')
  })

  it('joins across an apostrophe instead of splitting the word', () => {
    expect(toAnchorSlug('The artist’s hand')).toBe('the-artists-hand')
    expect(toAnchorSlug("The artist's hand")).toBe('the-artists-hand')
  })

  it('collapses runs of punctuation and trims the ends', () => {
    expect(toAnchorSlug('  Ultramarine — PB29 (natural)?  ')).toBe(
      'ultramarine-pb29-natural',
    )
  })

  it('is empty when nothing survives', () => {
    expect(toAnchorSlug('?!')).toBe('')
    expect(toAnchorSlug('第一章')).toBe('')
  })
})

describe('createAnchorAllocator', () => {
  it('returns the plain slug for a heading seen once', () => {
    const allocate = createAnchorAllocator()
    expect(allocate('Method')).toBe('method')
  })

  it('numbers repeats from two', () => {
    const allocate = createAnchorAllocator()
    expect(allocate('Method')).toBe('method')
    expect(allocate('Method')).toBe('method-2')
    expect(allocate('Method')).toBe('method-3')
  })

  it('does not hand out a suffixed anchor an earlier heading already took', () => {
    const allocate = createAnchorAllocator()
    expect(allocate('Method')).toBe('method')
    expect(allocate('Method 2')).toBe('method-2')
    // The natural candidate is taken, so this one keeps counting rather than
    // emitting a duplicate id.
    expect(allocate('Method')).toBe('method-3')
  })

  it('falls back to a usable anchor when the heading yields nothing', () => {
    const allocate = createAnchorAllocator()
    expect(allocate('?!')).toBe('section')
    expect(allocate('第一章')).toBe('section-2')
  })

  it('starts clean for each document', () => {
    expect(createAnchorAllocator()('Method')).toBe('method')
    expect(createAnchorAllocator()('Method')).toBe('method')
  })
})
