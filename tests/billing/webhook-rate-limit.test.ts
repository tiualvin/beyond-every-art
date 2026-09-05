// The one property that makes rate limiting this endpoint safe at all.
//
// `/webhooks/stripe` is unauthenticated, so a caller can spend a megabyte-
// bounded read, an HMAC over it, and a log line per request, and the log file is
// capped and rotated — meaning a flood cannot fill the disk but *can* roll the
// window, pushing out the record of genuine delivery failures. That is the
// evidence there is on the day billing quietly stops working, so the endpoint is
// limited like every other public one.
//
// What makes that safe rather than an outage is that only *rejections* count.
// Stripe retries from its own addresses for about three days and then disables
// an endpoint it cannot deliver to, so a limiter counting every delivery would
// eventually switch the site's billing off by itself. These pin both halves: a
// rejected request spends, a verified one never does.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeSignature } from '../../lib/billing/stripe-signature'

const SECRET = 'whsec_test_secret'

vi.mock('@/lib/payload', () => ({ getPayloadClient: async () => ({}) }))

// The storage layer has its own tests; here it only has to succeed so a valid
// delivery reaches the end of the handler.
vi.mock('@/lib/billing/store', () => ({
  recordBillingEvent: async () => ({ id: 1, duplicate: false }),
  markEvent: async () => {},
  applyObservation: async () => {},
}))

async function loadRoute() {
  vi.resetModules()
  return (await import('../../app/webhooks/stripe/route')).POST
}

/** A delivery Stripe would actually have signed. */
function signedRequest(ip: string, eventId: string): Request {
  const body = JSON.stringify({
    id: eventId,
    // A type with no handler: it is stored and marked ignored, which is a
    // success as far as the response is concerned and reaches no Stripe API.
    type: 'customer.created',
    created: 1_753_444_800,
    livemode: true,
    data: { object: {} },
  })
  const timestamp = Math.floor(Date.now() / 1000)

  return new Request('https://www.beyondeveryart.com/webhooks/stripe/', {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
      'stripe-signature': `t=${timestamp},v1=${computeSignature(body, SECRET, timestamp)}`,
    },
    body,
  })
}

/** The same delivery with a signature that will not verify. */
function forgedRequest(ip: string): Request {
  return new Request('https://www.beyondeveryart.com/webhooks/stripe/', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'stripe-signature': 'nonsense' },
    body: JSON.stringify({ id: 'evt_forged', type: 'customer.created' }),
  })
}

describe('the Stripe webhook limiter', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET)
    vi.stubEnv('RATE_LIMIT_STRIPE_FAILURES', '2')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throttles a source once it has spent its rejections', async () => {
    const post = await loadRoute()

    expect((await post(forgedRequest('203.0.113.20'))).status).toBe(400)
    expect((await post(forgedRequest('203.0.113.20'))).status).toBe(400)
    // Third one is refused before the body is read at all.
    expect((await post(forgedRequest('203.0.113.20'))).status).toBe(429)
  })

  it('never spends the allowance on a delivery it accepted', async () => {
    const post = await loadRoute()

    // Far past the limit of two. Every one carries a valid signature, so none
    // of them may count — this is the assertion that keeps Stripe's own
    // retries from being throttled by their own volume.
    for (let index = 0; index < 10; index += 1) {
      const response = await post(signedRequest('203.0.113.21', `evt_${index}`))
      expect(response.status).toBe(200)
    }
  })

  it('still accepts a real delivery from a source that has not misbehaved', async () => {
    const post = await loadRoute()

    await post(forgedRequest('203.0.113.22'))
    await post(forgedRequest('203.0.113.22'))
    expect((await post(forgedRequest('203.0.113.22'))).status).toBe(429)

    // A different address is untouched: Stripe is not throttled by whoever
    // else is pointing at the endpoint.
    expect((await post(signedRequest('203.0.113.23', 'evt_real'))).status).toBe(
      200,
    )
  })
})
