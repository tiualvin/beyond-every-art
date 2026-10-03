import { describe, expect, it } from 'vitest'

import {
  arrowStep,
  pageAnnouncement,
  pageIndicator,
  readerPageParam,
  readerPagePath,
  stepSpread,
} from '../../lib/publications/navigation'
import type { Spread } from '../../lib/publications/spreads'

const spread = (pages: number[]): Spread => ({ index: 0, pages, slots: pages })

describe('readerPageParam', () => {
  it('reads the page a link asks for', () => {
    expect(readerPageParam('18', 96)).toBe(18)
    expect(readerPageParam(['18', '40'], 96)).toBe(18)
  })

  it('opens at the first page for anything unusable', () => {
    for (const value of [undefined, null, '', '0', '-2', '1.5', 'eighteen']) {
      expect(readerPageParam(value, 96)).toBe(1)
    }
  })

  it('lands a page past the end on the last page', () => {
    expect(readerPageParam('120', 96)).toBe(96)
  })

  it('never answers below 1, even for an empty publication', () => {
    expect(readerPageParam('5', 0)).toBe(1)
    expect(readerPageParam('5', Number.NaN)).toBe(1)
  })
})

describe('readerPagePath', () => {
  it('opens the reader at a page', () => {
    expect(readerPagePath('spring-2025', 18)).toBe(
      '/publication/spring-2025/read/?page=18',
    )
  })

  it('keeps the first page on the bare reader path', () => {
    expect(readerPagePath('spring-2025', 1)).toBe(
      '/publication/spring-2025/read/',
    )
  })

  it('agrees with readerPageParam', () => {
    const path = readerPagePath('spring-2025', 18)
    const page = new URL(path, 'https://example.com').searchParams.get('page')
    expect(readerPageParam(page, 96)).toBe(18)
  })
})

describe('pageIndicator', () => {
  it('shows a spread as a range and a single page as itself', () => {
    expect(pageIndicator(spread([12, 13]), 96)).toBe('12–13 / 96')
    expect(pageIndicator(spread([1]), 96)).toBe('1 / 96')
  })

  it('reads in page order whatever side each page is on', () => {
    const rtl: Spread = { index: 6, pages: [12, 13], slots: [13, 12] }
    expect(pageIndicator(rtl, 96)).toBe('12–13 / 96')
  })
})

describe('pageAnnouncement', () => {
  it('says the position in words', () => {
    expect(pageAnnouncement(spread([12, 13]), 96)).toBe('Pages 12 and 13 of 96')
    expect(pageAnnouncement(spread([1]), 96)).toBe('Page 1 of 96')
  })
})

describe('arrowStep', () => {
  it('moves forward with the right arrow in a left-to-right issue', () => {
    expect(arrowStep('ArrowRight', 'ltr')).toBe(1)
    expect(arrowStep('ArrowLeft', 'ltr')).toBe(-1)
  })

  it('moves forward with the left arrow in a right-to-left issue', () => {
    expect(arrowStep('ArrowLeft', 'rtl')).toBe(1)
    expect(arrowStep('ArrowRight', 'rtl')).toBe(-1)
  })

  it('ignores every other key', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'a']) {
      expect(arrowStep(key, 'ltr')).toBe(0)
    }
  })
})

describe('stepSpread', () => {
  it('moves by the step', () => {
    expect(stepSpread(4, 1, 49)).toBe(5)
    expect(stepSpread(4, -1, 49)).toBe(3)
  })

  it('stops at either end', () => {
    expect(stepSpread(0, -1, 49)).toBe(0)
    expect(stepSpread(48, 1, 49)).toBe(48)
    expect(stepSpread(60, 0, 49)).toBe(48)
  })

  it('stays at the start of an empty or unusable publication', () => {
    expect(stepSpread(3, 1, 0)).toBe(0)
    expect(stepSpread(3, 1, Number.NaN)).toBe(0)
    expect(stepSpread(Number.NaN, 1, 49)).toBe(1)
    expect(stepSpread(4, Number.NaN, 49)).toBe(4)
  })
})
