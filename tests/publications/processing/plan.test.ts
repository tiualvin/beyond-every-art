import { describe, expect, it } from 'vitest'

import {
  isActive,
  isStale,
  LIMITS,
  pageImageFilename,
  pagesToProcess,
  parsePageSelection,
  progressPercent,
  RENDITION,
} from '../../../lib/publications/processing/plan'

describe('isStale', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('leaves a run alone while it is still reporting', () => {
    expect(
      isStale({ status: 'processing-pages', updatedAt: ago(60_000) }, now),
    ).toBe(false)
  })

  it('fails a run that stopped reporting, as a killed one does', () => {
    expect(
      isStale(
        { status: 'processing-pages', updatedAt: ago(LIMITS.staleAfterMs + 1) },
        now,
      ),
    ).toBe(true)
    expect(isStale({ status: 'downloading', updatedAt: null }, now)).toBe(true)
  })

  it('never calls a finished run stale', () => {
    expect(
      isStale(
        { status: 'ready', updatedAt: ago(10 * LIMITS.staleAfterMs) },
        now,
      ),
    ).toBe(false)
    expect(isStale({ status: 'failed', updatedAt: null }, now)).toBe(false)
    expect(isActive('ready')).toBe(false)
    expect(isActive('cleaning-up')).toBe(true)
  })
})

describe('parsePageSelection', () => {
  it('reads pages and ranges, sorted and once each', () => {
    expect(parsePageSelection('7, 3,5-6,3')).toEqual([3, 5, 6, 7])
    expect(parsePageSelection('1')).toEqual([1])
  })

  it('refuses anything that is not a page or a forward range from 1', () => {
    expect(() => parsePageSelection('0')).toThrow(/from 1/)
    expect(() => parsePageSelection('5-3')).toThrow(/from 1/)
    expect(() => parsePageSelection('a')).toThrow(/not a page/)
    expect(() => parsePageSelection('2,')).toThrow(/not a page/)
    expect(() => parsePageSelection('-2')).toThrow(/not a page/)
    expect(() => parsePageSelection('1-100000')).toThrow(/more pages/)
  })
})

describe('pagesToProcess', () => {
  const done = (pageNumber: number, extra: object = {}) => ({
    pageNumber,
    sourceSha256: 'abc',
    rendition: RENDITION.version,
    status: 'ready',
    ...extra,
  })

  it('draws every page the first time', () => {
    expect(
      pagesToProcess({ pageCount: 3, sourceSha256: 'abc', existing: [] }),
    ).toEqual([1, 2, 3])
  })

  it('resumes: skips pages already drawn from this file at this rendition', () => {
    expect(
      pagesToProcess({
        pageCount: 4,
        sourceSha256: 'abc',
        existing: [done(1), done(2)],
      }),
    ).toEqual([3, 4])
  })

  it('redraws a page that failed, or came from another file or rendition', () => {
    expect(
      pagesToProcess({
        pageCount: 4,
        sourceSha256: 'abc',
        existing: [
          done(1, { status: 'failed' }),
          done(2, { sourceSha256: 'old' }),
          done(3, { rendition: RENDITION.version - 1 }),
          done(4),
        ],
      }),
    ).toEqual([1, 2, 3])
  })

  it('redraws the pages it is told to, whatever their state', () => {
    const existing = [done(1), done(2), done(3)]
    expect(
      pagesToProcess({
        pageCount: 3,
        sourceSha256: 'abc',
        existing,
        force: [2],
      }),
    ).toEqual([2])
    expect(
      pagesToProcess({
        pageCount: 3,
        sourceSha256: 'abc',
        existing,
        force: 'all',
      }),
    ).toEqual([1, 2, 3])
  })
})

describe('progressPercent', () => {
  it('reaches 100 only when every page is done', () => {
    expect(progressPercent(0, 96)).toBe(0)
    expect(progressPercent(95, 96)).toBe(98)
    expect(progressPercent(199, 200)).toBe(99)
    expect(progressPercent(96, 96)).toBe(100)
    expect(progressPercent(0, 0)).toBe(0)
  })
})

describe('pageImageFilename', () => {
  const bytes = new TextEncoder().encode('a rendered page')

  it('names an image after its content, with an extension Payload serves', () => {
    expect(pageImageFilename(7, bytes)).toMatch(/^[0-9a-f]{32}\.webp$/)
    expect(pageImageFilename(7, bytes)).toBe(pageImageFilename(7, bytes))
    expect(pageImageFilename(7, bytes)).not.toBe(
      pageImageFilename(7, new TextEncoder().encode('a redrawn page')),
    )
  })

  it('gives the same page in two issues two names', () => {
    // Clearing out one issue's images must never delete another's.
    expect(pageImageFilename(7, bytes)).not.toBe(pageImageFilename(8, bytes))
  })
})
