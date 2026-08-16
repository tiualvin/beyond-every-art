import { describe, expect, it } from 'vitest'

import {
  cmsOrigin,
  csrfProtectionIsUnconfigured,
  forwardedOrigin,
  internalOrigin,
  siteOrigin,
  trustedOrigins,
} from '../../lib/security/origins'

describe('siteOrigin', () => {
  it('prefers the dedicated site URL', () => {
    expect(
      siteOrigin({
        NEXT_PUBLIC_SITE_URL: 'https://beyondeveryart.com',
        NEXT_PUBLIC_SERVER_URL: 'https://other.example',
      }),
    ).toBe('https://beyondeveryart.com')
  })

  it('falls back through the server URLs in order', () => {
    expect(
      siteOrigin({ PAYLOAD_PUBLIC_SERVER_URL: 'https://fallback.example' }),
    ).toBe('https://fallback.example')
  })

  it('reduces a URL with a path to its origin', () => {
    expect(
      siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://a.example/x?y=1' }),
    ).toBe('https://a.example')
  })

  it('is null when nothing is set or the value is not a URL', () => {
    expect(siteOrigin({})).toBeNull()
    expect(
      siteOrigin({ NEXT_PUBLIC_SITE_URL: 'beyondeveryart.com' }),
    ).toBeNull()
  })
})

describe('cmsOrigin', () => {
  it('assumes HTTPS for a real hostname, which is what Caddy provisions', () => {
    expect(cmsOrigin({ CMS_ADDRESS: 'cms.beyondeveryart.com' })).toBe(
      'https://cms.beyondeveryart.com',
    )
  })

  it('assumes plain HTTP for local names, which have no certificate', () => {
    expect(cmsOrigin({ CMS_ADDRESS: 'cms.localhost' })).toBe(
      'http://cms.localhost',
    )
    expect(cmsOrigin({ CMS_ADDRESS: 'localhost:3000' })).toBe(
      'http://localhost:3000',
    )
  })

  it('takes an explicit override ahead of the derived value', () => {
    expect(
      cmsOrigin({
        CMS_ADDRESS: 'cms.beyondeveryart.com',
        PAYLOAD_PUBLIC_CMS_URL: 'https://admin.example.net',
      }),
    ).toBe('https://admin.example.net')
  })

  it('is null when no CMS hostname is configured', () => {
    expect(cmsOrigin({})).toBeNull()
  })
})

describe('trustedOrigins', () => {
  // An empty list is not a strict default in Payload: `extractJWT` reads it as
  // "no allowlist to enforce" and accepts a session cookie from any origin,
  // and `getRequestOrigin` gives up and emails a relative reset link.
  it('lists both hostnames this deployment serves', () => {
    const origins = trustedOrigins({
      CMS_ADDRESS: 'cms.beyondeveryart.com',
      NEXT_PUBLIC_SITE_URL: 'https://beyondeveryart.com',
    })

    expect(origins).toContain('https://beyondeveryart.com')
    expect(origins).toContain('https://cms.beyondeveryart.com')
  })

  it('carries the http twin of an https origin, for origin derivation', () => {
    // getRequestOrigin builds the origin from a scheme it infers per request,
    // which behind a TLS-terminating proxy can read as http. A near-miss there
    // costs the password-reset link, so both spellings are listed.
    expect(
      trustedOrigins({ NEXT_PUBLIC_SITE_URL: 'https://beyondeveryart.com' }),
    ).toEqual(['https://beyondeveryart.com', 'http://beyondeveryart.com'])
  })

  it('does not invent an https twin for a local http origin', () => {
    expect(trustedOrigins({ CMS_ADDRESS: 'cms.localhost' })).toEqual([
      'http://cms.localhost',
    ])
  })

  it('deduplicates when both variables name the same origin', () => {
    const origins = trustedOrigins({
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      PAYLOAD_PUBLIC_CMS_URL: 'http://localhost:3000',
    })

    expect(origins).toEqual(['http://localhost:3000'])
  })

  it('is empty rather than wrong when nothing is configured', () => {
    expect(trustedOrigins({})).toEqual([])
  })

  // A non-empty list is enforced by Payload; an empty one is not. So a list
  // holding only the compose default would reject the admin's own cookie on
  // every write while reads carried on working — worse than listing nothing.
  it('drops a localhost origin in production rather than locking the admin out', () => {
    expect(
      trustedOrigins({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
      }),
    ).toEqual([])
  })

  it('keeps the real origin when production has one, local default and all', () => {
    expect(
      trustedOrigins({
        CMS_ADDRESS: 'cms.beyondeveryart.com',
        NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
        NODE_ENV: 'production',
      }),
    ).toEqual([
      'https://cms.beyondeveryart.com',
      'http://cms.beyondeveryart.com',
    ])
  })

  it('still trusts localhost outside production, where it is the real origin', () => {
    expect(
      trustedOrigins({ NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000' }),
    ).toEqual(['http://localhost:3000'])
  })
})

describe('csrfProtectionIsUnconfigured', () => {
  it('is true when production has named no origin of its own', () => {
    expect(csrfProtectionIsUnconfigured({ NODE_ENV: 'production' })).toBe(true)
    expect(
      csrfProtectionIsUnconfigured({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
      }),
    ).toBe(true)
  })

  it('is false once a real origin is configured', () => {
    expect(
      csrfProtectionIsUnconfigured({
        CMS_ADDRESS: 'cms.beyondeveryart.com',
        NODE_ENV: 'production',
      }),
    ).toBe(false)
  })

  it('says nothing outside production, which is not protecting anything', () => {
    expect(csrfProtectionIsUnconfigured({})).toBe(false)
  })
})

describe('forwardedOrigin', () => {
  const headers = (values: Record<string, string>) => new Headers(values)
  const FALLBACK = 'https://0.0.0.0:3000'

  it('rebuilds the origin the reader actually used', () => {
    expect(
      forwardedOrigin(
        headers({
          host: 'beyondeveryart.com',
          'x-forwarded-proto': 'https',
        }),
        FALLBACK,
      ),
    ).toBe('https://beyondeveryart.com')
  })

  it('prefers X-Forwarded-Host, and takes the first hop of each header', () => {
    expect(
      forwardedOrigin(
        headers({
          host: 'app:3000',
          'x-forwarded-host': 'beyondeveryart.com, inner.example',
          'x-forwarded-proto': 'https,http',
        }),
        FALLBACK,
      ),
    ).toBe('https://beyondeveryart.com')
  })

  it('serves plain http when the proxy did', () => {
    expect(
      forwardedOrigin(
        headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }),
        FALLBACK,
      ),
    ).toBe('http://localhost:3000')
  })

  it('assumes http rather than lying when no scheme was forwarded', () => {
    expect(forwardedOrigin(headers({ host: 'localhost:3000' }), FALLBACK)).toBe(
      'http://localhost:3000',
    )
  })

  it('keeps a bracketed IPv6 authority intact', () => {
    expect(
      forwardedOrigin(
        headers({ host: '[2001:db8::1]:3000', 'x-forwarded-proto': 'https' }),
        FALLBACK,
      ),
    ).toBe('https://[2001:db8::1]:3000')
  })

  it('falls back rather than handing a malformed host to the URL parser', () => {
    // Throwing here would turn a redirect into a 500 for the whole request.
    for (const host of ['not a host', 'host/../evil', '']) {
      expect(forwardedOrigin(headers({ host }), FALLBACK)).toBe(FALLBACK)
    }
    expect(forwardedOrigin(headers({}), FALLBACK)).toBe(FALLBACK)
  })
})

describe('internalOrigin', () => {
  // Never `request.nextUrl.origin`: Next builds that from HOSTNAME (0.0.0.0 in
  // the container) wearing the forwarded scheme (https, from Caddy), so the
  // middleware's own fetch would open a TLS connection to a plain-HTTP port and
  // every migrated URL would stop redirecting.
  it('defaults to loopback on the default port', () => {
    expect(internalOrigin({})).toBe('http://127.0.0.1:3000')
  })

  it('follows PORT', () => {
    expect(internalOrigin({ PORT: '8080' })).toBe('http://127.0.0.1:8080')
  })

  it('ignores a nonsense PORT rather than building a broken origin', () => {
    expect(internalOrigin({ PORT: 'not-a-port' })).toBe('http://127.0.0.1:3000')
    expect(internalOrigin({ PORT: '0' })).toBe('http://127.0.0.1:3000')
  })

  it('takes an explicit override', () => {
    expect(internalOrigin({ INTERNAL_ORIGIN: 'http://app:3000' })).toBe(
      'http://app:3000',
    )
  })

  it('never claims https, which is what the bug it fixes did', () => {
    expect(internalOrigin({ PORT: '3000' })).not.toContain('https')
  })
})
