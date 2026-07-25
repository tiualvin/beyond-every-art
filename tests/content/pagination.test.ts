import { describe, expect, it } from 'vitest'

import {
  archivePagePath,
  buildPagination,
  parsePageParam,
} from '../../lib/content/pagination'

describe('parsePageParam', () => {
  it('reads a whole page number', () => {
    expect(parsePageParam('2')).toBe(2)
    expect(parsePageParam(' 17 ')).toBe(17)
  })

  it('falls back to the first page for anything unusable', () => {
    expect(parsePageParam(undefined)).toBe(1)
    expect(parsePageParam(null)).toBe(1)
    expect(parsePageParam('')).toBe(1)
    expect(parsePageParam('0')).toBe(1)
    expect(parsePageParam('-3')).toBe(1)
    expect(parsePageParam('2.5')).toBe(1)
    expect(parsePageParam('two')).toBe(1)
    expect(parsePageParam('1; DROP TABLE posts')).toBe(1)
  })

  it('reads the first value when the parameter is repeated', () => {
    expect(parsePageParam(['3', '9'])).toBe(3)
    expect(parsePageParam([])).toBe(1)
  })
})

describe('archivePagePath', () => {
  it('leaves the first page on the bare canonical path', () => {
    expect(archivePagePath('/journal', 1)).toBe('/journal')
    expect(archivePagePath('/journal', 0)).toBe('/journal')
  })

  it('adds a page parameter from the second page on', () => {
    expect(archivePagePath('/journal', 2)).toBe('/journal?page=2')
  })
})

describe('buildPagination', () => {
  const basePath = '/journal'

  it('links forward only from the first page', () => {
    expect(buildPagination({ basePath, page: 1, totalPages: 3 })).toEqual({
      page: 1,
      totalPages: 3,
      prevPath: null,
      nextPath: '/journal?page=2',
    })
  })

  it('links both ways in the middle', () => {
    expect(buildPagination({ basePath, page: 2, totalPages: 3 })).toEqual({
      page: 2,
      totalPages: 3,
      prevPath: '/journal',
      nextPath: '/journal?page=3',
    })
  })

  it('links back only from the last page', () => {
    const pagination = buildPagination({ basePath, page: 3, totalPages: 3 })
    expect(pagination.prevPath).toBe('/journal?page=2')
    expect(pagination.nextPath).toBeNull()
  })

  it('offers no links when everything fits on one page', () => {
    expect(buildPagination({ basePath, page: 1, totalPages: 1 })).toEqual({
      page: 1,
      totalPages: 1,
      prevPath: null,
      nextPath: null,
    })
  })

  it('clamps a page beyond the end back into range', () => {
    expect(buildPagination({ basePath, page: 99, totalPages: 3 }).page).toBe(3)
  })

  it('treats an empty archive as a single page', () => {
    expect(buildPagination({ basePath, page: 1, totalPages: 0 })).toEqual({
      page: 1,
      totalPages: 1,
      prevPath: null,
      nextPath: null,
    })
  })
})
