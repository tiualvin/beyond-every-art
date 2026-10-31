// `Critical-CH` on a public page makes Chrome request it twice on a first
// visit. `lib/performance/client-hints.ts` has the measurement; this pins the
// fix against the real `withPayload` and the real `next.config.ts`, so a Payload
// upgrade that changes how it adds the headers fails here rather than in the
// field data a month later.

import { withPayload } from '@payloadcms/next/withPayload'
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import payloadConfig from '../../payload.config'
import {
  ADMIN_ROUTE,
  isColorSchemeHintHeader,
  scopeColorSchemeHintsToAdmin,
  withAdminOnlyColorSchemeHint,
} from '../../lib/performance/client-hints'

type Rules = Awaited<ReturnType<NonNullable<typeof nextConfig.headers>>>

const isAdmin = (source: string) => source.startsWith(`${ADMIN_ROUTE}/`)

/** The header keys a route would be sent, by the rules whose source is it. */
const keysOn = (rules: Rules, source: string) =>
  rules
    .filter((rule) => rule.source === source)
    .flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()))

describe('the deployed config', () => {
  it('sends no colour-scheme client hint outside the admin', async () => {
    const rules = await nextConfig.headers!()
    const leaks = rules
      .filter((rule) => !isAdmin(rule.source))
      .flatMap((rule) => rule.headers.filter(isColorSchemeHintHeader))
    expect(leaks).toEqual([])
  })

  it('still sends it to the admin, exactly as Payload asked', async () => {
    const rules = await nextConfig.headers!()
    const admin = keysOn(rules, `${ADMIN_ROUTE}/:path*`)
    expect(admin).toEqual(
      expect.arrayContaining(['accept-ch', 'critical-ch', 'vary']),
    )
  })

  it('leaves the security headers on every route', async () => {
    const rules = await nextConfig.headers!()
    expect(keysOn(rules, '/:path*')).toEqual(
      expect.arrayContaining(['x-content-type-options', 'referrer-policy']),
    )
  })

  it('agrees with Payload about where the admin is', async () => {
    const config = await payloadConfig
    expect(config.routes.admin).toBe(ADMIN_ROUTE)
  })
})

describe('against the real withPayload', () => {
  // The precondition. If Payload stops adding the hint, this fails and the
  // wrapper is dead code to delete — which is the information wanted.
  it('Payload still adds Critical-CH to every route', async () => {
    const rules = await withPayload({ poweredByHeader: false }).headers!()
    const everywhere = rules.filter((rule) => rule.source === '/:path*')
    expect(
      everywhere.flatMap((rule) => rule.headers).some(isColorSchemeHintHeader),
    ).toBe(true)
  })

  it('keeps what else travels in the same rule on its original scope', async () => {
    // With `poweredByHeader` left on, Payload adds X-Powered-By to the very
    // rule that carries the hints. It must not end up admin-only by accident.
    const rules = await withAdminOnlyColorSchemeHint(withPayload({})).headers!()
    expect(keysOn(rules, '/:path*')).toContain('x-powered-by')
    expect(keysOn(rules, '/:path*')).not.toContain('critical-ch')
  })
})

describe('scopeColorSchemeHintsToAdmin', () => {
  it('recognises the hint inside a list-valued header', () => {
    expect(
      isColorSchemeHintHeader({
        key: 'Vary',
        value: 'Accept, Sec-CH-Prefers-Color-Scheme',
      }),
    ).toBe(true)
    expect(isColorSchemeHintHeader({ key: 'Vary', value: 'Accept' })).toBe(
      false,
    )
  })

  it('does not touch a rule already scoped to the admin', () => {
    const rule = {
      source: '/admin/:path*',
      headers: [{ key: 'Critical-CH', value: 'Sec-CH-Prefers-Color-Scheme' }],
    }
    expect(scopeColorSchemeHintsToAdmin([rule])).toEqual([rule])
  })

  it('drops a rule left empty rather than emitting one with no headers', () => {
    const rules = scopeColorSchemeHintsToAdmin([
      {
        source: '/:path*',
        headers: [{ key: 'Accept-CH', value: 'Sec-CH-Prefers-Color-Scheme' }],
      },
    ])
    expect(rules).toEqual([
      {
        source: '/admin/:path*',
        headers: [{ key: 'Accept-CH', value: 'Sec-CH-Prefers-Color-Scheme' }],
      },
    ])
  })
})
