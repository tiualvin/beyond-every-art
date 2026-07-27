import { describe, expect, it } from 'vitest'

import {
  buildCspHeaders,
  buildCspPolicy,
  buildReportingEndpoints,
  cspHeaderName,
  cspMode,
  frameOrigins,
  mediaOrigin,
} from '../../lib/security/csp'

/** Pull one directive out of the policy string. */
function directive(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
}

describe('cspMode', () => {
  it('defaults to report-only so an unset variable cannot enforce silently', () => {
    expect(cspMode({})).toBe('report-only')
    expect(cspMode({ CSP_MODE: '' })).toBe('report-only')
    expect(cspMode({ CSP_MODE: 'nonsense' })).toBe('report-only')
  })

  it('accepts the two deliberate modes', () => {
    expect(cspMode({ CSP_MODE: 'enforce' })).toBe('enforce')
    expect(cspMode({ CSP_MODE: ' ENFORCE ' })).toBe('enforce')
    expect(cspMode({ CSP_MODE: 'off' })).toBe('off')
  })
})

describe('cspHeaderName', () => {
  it('reports without blocking until explicitly told to enforce', () => {
    expect(cspHeaderName('report-only')).toBe(
      'Content-Security-Policy-Report-Only',
    )
    expect(cspHeaderName('enforce')).toBe('Content-Security-Policy')
    expect(cspHeaderName('off')).toBeNull()
  })
})

describe('mediaOrigin', () => {
  it('reduces the public media URL to an origin', () => {
    expect(
      mediaOrigin({ S3_PUBLIC_URL: 'https://cdn.example.com/media/' }),
    ).toBe('https://cdn.example.com')
  })

  it('returns null when unset or unparseable rather than emitting junk', () => {
    expect(mediaOrigin({})).toBeNull()
    expect(mediaOrigin({ S3_PUBLIC_URL: 'not a url' })).toBeNull()
  })
})

describe('frameOrigins', () => {
  it('accepts a comma- or space-separated list', () => {
    expect(
      frameOrigins({
        CSP_FRAME_SRC: 'https://a.example, https://b.example https://c.example',
      }),
    ).toEqual(['https://a.example', 'https://b.example', 'https://c.example'])
  })

  it('is empty when unset', () => {
    expect(frameOrigins({})).toEqual([])
  })
})

describe('buildCspPolicy', () => {
  it('closes the destructive legacy vectors outright', () => {
    const policy = buildCspPolicy({ env: {} })
    expect(directive(policy, 'object-src')).toBe("object-src 'none'")
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(policy, 'form-action')).toBe("form-action 'self'")
    expect(directive(policy, 'default-src')).toBe("default-src 'self'")
  })

  it("keeps frame-ancestors at 'self' so Live Preview still frames the site", () => {
    // The admin renders the public site in an iframe on the same origin, so
    // 'none' here would break preview rather than protect anything.
    expect(directive(buildCspPolicy({ env: {} }), 'frame-ancestors')).toBe(
      "frame-ancestors 'self'",
    )
  })

  it('admits the analytics origins only when the tag is configured', () => {
    const without = buildCspPolicy({ env: {} })
    expect(without).not.toContain('googletagmanager.com')

    const with_ = buildCspPolicy({ env: { NEXT_PUBLIC_GA_ID: 'G-123' } })
    expect(directive(with_, 'script-src')).toContain(
      'https://www.googletagmanager.com',
    )
    expect(directive(with_, 'connect-src')).toContain(
      'https://www.google-analytics.com',
    )
  })

  it('admits the media origin so R2 images are not violations', () => {
    const policy = buildCspPolicy({
      env: { S3_PUBLIC_URL: 'https://cdn.example.com' },
    })
    expect(directive(policy, 'img-src')).toContain('https://cdn.example.com')
    expect(directive(policy, 'media-src')).toContain('https://cdn.example.com')
  })

  it('carries configured embed origins into frame-src', () => {
    const policy = buildCspPolicy({
      env: { CSP_FRAME_SRC: 'https://www.youtube-nocookie.com' },
    })
    expect(directive(policy, 'frame-src')).toBe(
      "frame-src 'self' https://www.youtube-nocookie.com",
    )
  })

  it('adds the dev-only allowances only in development', () => {
    const dev = buildCspPolicy({ env: {}, isDevelopment: true })
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(dev, 'connect-src')).toContain('ws:')
    // Dev is served over plain http, so upgrading every request breaks it.
    expect(directive(dev, 'upgrade-insecure-requests')).toBeUndefined()

    const prod = buildCspPolicy({ env: {} })
    expect(directive(prod, 'script-src')).not.toContain("'unsafe-eval'")
    expect(directive(prod, 'upgrade-insecure-requests')).toBe(
      'upgrade-insecure-requests',
    )
  })

  it('points reports at the built-in endpoint unless overridden', () => {
    expect(directive(buildCspPolicy({ env: {} }), 'report-uri')).toBe(
      'report-uri /csp-report',
    )
    expect(
      directive(
        buildCspPolicy({
          env: { CSP_REPORT_URI: 'https://collector.example' },
        }),
        'report-uri',
      ),
    ).toBe('report-uri https://collector.example')
  })

  it("still carries 'unsafe-inline' in script-src, which is the known limit", () => {
    // Next.js streams the RSC payload through inline scripts and the GA4 init
    // block is inline, so this phase cannot block injected inline script.
    // Asserted so that removing it is a deliberate, test-breaking decision
    // rather than an accident — see phase 3 in the rollout doc.
    expect(directive(buildCspPolicy({ env: {} }), 'script-src')).toContain(
      "'unsafe-inline'",
    )
  })
})

describe('buildReportingEndpoints', () => {
  it('names the group the report-to directive refers to', () => {
    expect(buildReportingEndpoints({})).toBe('csp-endpoint="/csp-report"')
  })
})

describe('buildCspHeaders', () => {
  it('emits the report-only header plus its reporting group by default', () => {
    const headers = buildCspHeaders({ env: {} })
    expect(headers.map((h) => h.key)).toEqual([
      'Content-Security-Policy-Report-Only',
      'Reporting-Endpoints',
    ])
  })

  it('emits nothing at all when the policy is switched off', () => {
    expect(buildCspHeaders({ env: { CSP_MODE: 'off' } })).toEqual([])
  })
})
