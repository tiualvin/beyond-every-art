import { describe, expect, it } from 'vitest'

import {
  buildBaselineSecurityHeaders,
  buildSecurityHeaders,
  HSTS_MAX_AGE_SECONDS,
  hstsValue,
} from '../../lib/security/headers'

const keys = (headers: Array<{ key: string }>) => headers.map((h) => h.key)

describe('buildBaselineSecurityHeaders', () => {
  it('always sends nosniff, which is what protects the media route', () => {
    const headers = buildBaselineSecurityHeaders({ env: {} })

    expect(headers).toContainEqual({
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    })
  })

  it('keeps full URLs from leaking off-site', () => {
    const headers = buildBaselineSecurityHeaders({ env: {} })

    expect(headers).toContainEqual({
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    })
  })

  it('sends HSTS outside development', () => {
    const headers = buildBaselineSecurityHeaders({
      env: {},
      isDevelopment: false,
    })

    expect(keys(headers)).toContain('Strict-Transport-Security')
  })

  it('withholds HSTS in development, where the site is plain http', () => {
    const headers = buildBaselineSecurityHeaders({
      env: {},
      isDevelopment: true,
    })

    expect(keys(headers)).not.toContain('Strict-Transport-Security')
  })

  it('claims a year and covers subdomains, but never preloads', () => {
    expect(hstsValue()).toBe(
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
    )
    expect(hstsValue()).not.toContain('preload')
  })

  it('does not send X-Frame-Options, which would break Live Preview', () => {
    expect(keys(buildBaselineSecurityHeaders({ env: {} }))).not.toContain(
      'X-Frame-Options',
    )
  })
})

describe('buildSecurityHeaders', () => {
  it('carries both the baseline and the policy', () => {
    const names = keys(buildSecurityHeaders({ env: {} }))

    expect(names).toContain('X-Content-Type-Options')
    expect(names).toContain('Content-Security-Policy-Report-Only')
  })

  it('keeps the baseline when the policy is switched off in an incident', () => {
    // CSP_MODE=off is the escape hatch for the *policy*. Losing nosniff and
    // HSTS with it would make reaching for that hatch quietly expensive.
    const names = keys(buildSecurityHeaders({ env: { CSP_MODE: 'off' } }))

    expect(names).toContain('X-Content-Type-Options')
    expect(names).toContain('Referrer-Policy')
    expect(names).not.toContain('Content-Security-Policy')
    expect(names).not.toContain('Content-Security-Policy-Report-Only')
  })

  it('sends the enforcing policy alongside the baseline', () => {
    const names = keys(buildSecurityHeaders({ env: { CSP_MODE: 'enforce' } }))

    expect(names).toContain('Content-Security-Policy')
    expect(names).toContain('X-Content-Type-Options')
  })
})
