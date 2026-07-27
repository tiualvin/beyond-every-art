import { describe, expect, it } from 'vitest'

import {
  buildCspLogEntry,
  parseCspPayload,
  parseCspReport,
  sanitizeUri,
} from '../../lib/observability/csp-report'

describe('sanitizeUri', () => {
  it('drops the query string, which on this site can hold a search term', () => {
    expect(
      sanitizeUri('https://beyondeveryart.com/search/?q=private+thing'),
    ).toBe('https://beyondeveryart.com/search/')
  })

  it('reduces data and blob URLs to their scheme', () => {
    // These can embed an entire payload; the scheme is the only useful part.
    expect(sanitizeUri('data:text/html;base64,PHNjcmlwdD4=')).toBe('data:')
    expect(sanitizeUri('blob:https://example.com/abc-123')).toBe('blob:')
  })

  it('keeps the bare keywords browsers send', () => {
    expect(sanitizeUri('inline')).toBe('inline')
    expect(sanitizeUri('eval')).toBe('eval')
  })

  it('caps length so one report cannot flood the log', () => {
    expect(sanitizeUri('x'.repeat(500))?.length).toBe(200)
  })

  it('returns null for non-strings and blanks', () => {
    expect(sanitizeUri(undefined)).toBeNull()
    expect(sanitizeUri(42)).toBeNull()
    expect(sanitizeUri('   ')).toBeNull()
  })
})

describe('parseCspReport', () => {
  it('reads the legacy report-uri shape', () => {
    const violation = parseCspReport({
      'csp-report': {
        'effective-directive': 'script-src',
        'blocked-uri': 'https://evil.example/x.js',
        'document-uri': 'https://beyondeveryart.com/a-post/?utm=1',
        disposition: 'report',
      },
    })

    expect(violation).toEqual({
      directive: 'script-src',
      blockedURI: 'https://evil.example/x.js',
      documentURI: 'https://beyondeveryart.com/a-post/',
      sourceFile: null,
      disposition: 'report',
    })
  })

  it('reads the Reporting API shape', () => {
    const violation = parseCspReport({
      type: 'csp-violation',
      body: {
        effectiveDirective: 'img-src',
        blockedURL: 'https://old-ghost.example/img.png',
        documentURL: 'https://beyondeveryart.com/a-post/',
      },
    })

    expect(violation?.directive).toBe('img-src')
    expect(violation?.blockedURI).toBe('https://old-ghost.example/img.png')
  })

  it('falls back to violated-directive when effective is absent', () => {
    const violation = parseCspReport({
      'csp-report': {
        'violated-directive': "style-src 'self'",
        'blocked-uri': 'inline',
      },
    })
    expect(violation?.directive).toBe("style-src 'self'")
  })

  it('rejects junk rather than logging it', () => {
    // The endpoint is unauthenticated, so anything can POST it.
    expect(parseCspReport(null)).toBeNull()
    expect(parseCspReport('a string')).toBeNull()
    expect(parseCspReport({})).toBeNull()
    expect(parseCspReport({ 'csp-report': {} })).toBeNull()
    expect(parseCspReport({ 'csp-report': { foo: 'bar' } })).toBeNull()
  })
})

describe('parseCspPayload', () => {
  it('handles the array the Reporting API posts and the single legacy object', () => {
    const batch = parseCspPayload([
      { body: { effectiveDirective: 'script-src', blockedURL: 'inline' } },
      { body: { effectiveDirective: 'img-src', blockedURL: 'data:' } },
    ])
    expect(batch).toHaveLength(2)

    const single = parseCspPayload({
      'csp-report': { 'effective-directive': 'font-src', 'blocked-uri': 'x' },
    })
    expect(single).toHaveLength(1)
  })

  it('drops unusable entries from an otherwise valid batch', () => {
    const batch = parseCspPayload([
      { body: { effectiveDirective: 'script-src', blockedURL: 'inline' } },
      { nonsense: true },
    ])
    expect(batch).toHaveLength(1)
  })
})

describe('buildCspLogEntry', () => {
  it('produces one structured line alongside the other observability events', () => {
    const entry = buildCspLogEntry(
      {
        directive: 'script-src',
        blockedURI: 'https://evil.example/x.js',
        documentURI: 'https://beyondeveryart.com/a-post/',
        sourceFile: null,
        disposition: 'report',
      },
      new Date('2026-07-26T12:00:00.000Z'),
    )

    expect(entry).toMatchObject({
      level: 'warn',
      event: 'csp_violation',
      time: '2026-07-26T12:00:00.000Z',
      directive: 'script-src',
    })
    expect(() => JSON.stringify(entry)).not.toThrow()
  })
})
