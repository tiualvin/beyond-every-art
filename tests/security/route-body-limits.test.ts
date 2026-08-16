// The bodies of both public ingest routes are bounded in lib/security/
// request-body.ts, which has its own unit tests. These are about what the
// routes do with a body that exceeds the limit, because that is the part a
// later refactor can quietly change: the limit is enforced by a thrown
// exception now, and where it is caught decides the status a stranger sees.

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/payload', () => ({
  getPayloadClient: () => {
    throw new Error('the body limit must be enforced before Payload is touched')
  },
}))

import { POST as cspReport } from '../../app/csp-report/route'
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
