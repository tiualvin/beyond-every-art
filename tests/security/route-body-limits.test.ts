// The bodies of every public ingest route are bounded in lib/security/
// request-body.ts, which has its own unit tests. These are about what the
// routes do with a body that exceeds the limit, because that is the part a
// later refactor can quietly change: the limit is enforced by a thrown
// exception now, and where it is caught decides the status a stranger sees.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/payload', () => ({
  getPayloadClient: () => {
    throw new Error('the body limit must be enforced before Payload is touched')
  },
}))

import { POST as cspReport } from '../../app/csp-report/route'
import { POST as oauthAuthorize } from '../../app/oauth/authorize/route'
import { POST as oauthRevoke } from '../../app/oauth/revoke/route'
import { POST as oauthToken } from '../../app/oauth/token/route'
import { POST as stripeWebhook } from '../../app/webhooks/stripe/route'

/** Distinct per request: the CSP route rate-limits per client address. */
let caller = 0
function headers(extra: Record<string, string> = {}): Record<string, string> {
  caller += 1
  return { 'x-forwarded-for': `203.0.113.${caller}`, ...extra }
}

function streamOf(
  chunk: Uint8Array,
  times: number,
): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= times) return controller.close()
      sent += 1
      controller.enqueue(chunk)
    },
  })
}

describe('POST /csp-report', () => {
  it('answers 204 for a report over the limit, like every other outcome', async () => {
    // A different status here would tell a prober the endpoint is real and how
    // big its buffer is; the route's own comment makes 204-always the point.
    const response = await cspReport(
      new Request('https://beyondeveryart.com/csp-report', {
        method: 'POST',
        headers: headers({ 'content-type': 'application/csp-report' }),
        body: JSON.stringify({
          'csp-report': { 'blocked-uri': 'x'.repeat(20_000) },
        }),
      }),
    )

    expect(response.status).toBe(204)
  })

  it('answers 204 when an oversized body arrives without a content-length', async () => {
    const response = await cspReport(
      new Request('https://beyondeveryart.com/csp-report', {
        method: 'POST',
        headers: headers(),
        // 20 KB in 1 KB chunks, past the 16 KB ceiling, with no declared length.
        body: streamOf(new TextEncoder().encode('x'.repeat(1_024)), 20),
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    )

    expect(response.status).toBe(204)
  })

  it('still accepts a report inside the limit', async () => {
    const response = await cspReport(
      new Request('https://beyondeveryart.com/csp-report', {
        method: 'POST',
        headers: headers({ 'content-type': 'application/csp-report' }),
        body: JSON.stringify({
          'csp-report': {
            'document-uri': 'https://beyondeveryart.com/',
            'violated-directive': 'script-src',
            'blocked-uri': 'inline',
          },
        }),
      }),
    )

    expect(response.status).toBe(204)
  })
})

describe('POST /webhooks/stripe', () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  afterEach(() => {
    if (secret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = secret
  })

  it('rejects an oversized body with 413, before signature verification', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

    const response = await stripeWebhook(
      new Request('https://beyondeveryart.com/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'nonsense' },
        // 2 MiB in 64 KiB chunks, past the 1 MiB ceiling.
        body: streamOf(new TextEncoder().encode('x'.repeat(65_536)), 32),
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    )

    expect(response.status).toBe(413)
    // Not 400: an unverifiable signature and a body we refused to read are
    // different answers, and the mocked Payload client proves nothing got
    // as far as storing the event.
    await expect(response.json()).resolves.toMatchObject({
      error: 'Request body too large',
    })
  })

  it('answers 400 for a body inside the limit with a bad signature', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

    const response = await stripeWebhook(
      new Request('https://beyondeveryart.com/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'nonsense' },
        body: JSON.stringify({ id: 'evt_1', type: 'invoice.paid' }),
      }),
    )

    expect(response.status).toBe(400)
  })
})

// The OAuth endpoints are unauthenticated POSTs — that is what an authorization
// server is — so the caller chooses how much memory one request allocates
// before anything has been validated. They were written after the two routes
// above and did not inherit the ceiling; these pin it, and pin the ordering
// with it: the mocked Payload client throws, so a route that reads its body
// after reaching for Payload fails here rather than passing quietly.
describe('the OAuth endpoints', () => {
  /** Past MAX_OAUTH_BODY_BYTES, with a declared length the reader can refuse. */
  const oversized = (field: string) => `${field}=${'t'.repeat(20_000)}`

  const form = (body: string) =>
    ({
      method: 'POST',
      headers: {
        ...headers(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    }) satisfies RequestInit

  beforeEach(() => {
    // Both are required or the endpoints answer 404 and prove nothing.
    vi.stubEnv('MCP_OAUTH_ENABLED', '1')
    vi.stubEnv('CMS_ADDRESS', 'cms.beyondeveryart.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses an oversized token request without parsing it', async () => {
    const response = await oauthToken(
      new Request(
        'https://cms.beyondeveryart.com/oauth/token',
        form(`grant_type=refresh_token&${oversized('refresh_token')}`),
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_request',
    })
  })

  it('refuses an oversized consent submission before touching Payload', async () => {
    const response = await oauthAuthorize(
      new Request(
        'https://cms.beyondeveryart.com/oauth/authorize',
        form(`decision=approve&${oversized('request')}`),
      ),
    )

    // 400 and not a thrown mock: the body is read, and refused, first.
    expect(response.status).toBe(400)
  })

  it('answers an oversized revocation the same as every other one', async () => {
    const response = await oauthRevoke(
      new Request(
        'https://cms.beyondeveryart.com/oauth/revoke',
        form(oversized('token')),
      ),
    )

    // RFC 7009 §2.2: a revocation endpoint that distinguished outcomes would be
    // an oracle for testing whether a stolen token is still live. Reaching 200
    // without the mocked client throwing is what proves the body was refused
    // rather than looked up.
    expect(response.status).toBe(200)
  })
})
