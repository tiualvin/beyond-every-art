import { describe, expect, it } from 'vitest'

import {
  buildSignatureHeader,
  computeSignature,
  parseSignatureHeader,
  verifyStripeSignature,
} from '../../lib/billing/stripe-signature'

const SECRET = 'whsec_test_secret_value'
const NOW = new Date('2026-07-25T12:00:00.000Z')
const TIMESTAMP = Math.floor(NOW.getTime() / 1000)

const BODY = JSON.stringify({
  id: 'evt_1',
  type: 'customer.subscription.updated',
  created: TIMESTAMP,
})

function signed(body = BODY, timestamp = TIMESTAMP, secret = SECRET): string {
  return buildSignatureHeader(body, secret, timestamp)
}

describe('parseSignatureHeader', () => {
  it('reads the timestamp and every v1 signature', () => {
    const parsed = parseSignatureHeader('t=1753444800,v1=aaa,v0=ignored,v1=bbb')
    expect(parsed).toEqual({
      timestamp: 1753444800,
      signatures: ['aaa', 'bbb'],
    })
  })

  it('tolerates whitespace around the parts', () => {
    expect(parseSignatureHeader('t=1753444800, v1=aaa')).toEqual({
      timestamp: 1753444800,
      signatures: ['aaa'],
    })
  })

  it('returns null for headers it cannot use', () => {
    expect(parseSignatureHeader(null)).toBeNull()
    expect(parseSignatureHeader('')).toBeNull()
    expect(parseSignatureHeader('nonsense')).toBeNull()
    expect(parseSignatureHeader('v1=aaa')).toBeNull() // no timestamp
    expect(parseSignatureHeader('t=1753444800')).toBeNull() // no signature
    expect(parseSignatureHeader('t=not-a-number,v1=aaa')).toBeNull()
    expect(parseSignatureHeader('t=1753444800,v0=aaa')).toBeNull() // scheme we do not accept
  })
})

describe('computeSignature', () => {
  it('signs `${timestamp}.${body}` with HMAC-SHA256, hex encoded', () => {
    const signature = computeSignature('payload', 'secret', 1)
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
    // Same inputs, same answer; a different body or timestamp changes it.
    expect(computeSignature('payload', 'secret', 1)).toBe(signature)
    expect(computeSignature('payload!', 'secret', 1)).not.toBe(signature)
    expect(computeSignature('payload', 'secret', 2)).not.toBe(signature)
    expect(computeSignature('payload', 'other', 1)).not.toBe(signature)
  })
})

describe('verifyStripeSignature', () => {
  it('accepts a correctly signed body', () => {
    expect(
      verifyStripeSignature({
        payload: BODY,
        header: signed(),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ verified: true, timestamp: TIMESTAMP })
  })

  it('accepts a body signed with either secret during rotation', () => {
    const header = `t=${TIMESTAMP},v1=${computeSignature(
      BODY,
      'whsec_retired',
      TIMESTAMP,
    )},v1=${computeSignature(BODY, SECRET, TIMESTAMP)}`

    expect(
      verifyStripeSignature({
        payload: BODY,
        header,
        secret: SECRET,
        now: NOW,
      }).verified,
    ).toBe(true)
  })

  it('rejects a tampered body', () => {
    // The classic attack: a valid capture with the amounts or IDs edited.
    const tampered = BODY.replace('evt_1', 'evt_2')
    expect(
      verifyStripeSignature({
        payload: tampered,
        header: signed(),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ verified: false, reason: 'no_matching_signature' })
  })

  it('rejects a body signed with the wrong secret', () => {
    expect(
      verifyStripeSignature({
        payload: BODY,
        header: signed(BODY, TIMESTAMP, 'whsec_someone_elses_endpoint'),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ verified: false, reason: 'no_matching_signature' })
  })

  it('rejects a signature whose timestamp was edited', () => {
    // Moving the timestamp forward to escape the tolerance window invalidates
    // the signature, because the timestamp is part of the signed message.
    const header = signed().replace(`t=${TIMESTAMP}`, `t=${TIMESTAMP + 10}`)
    expect(
      verifyStripeSignature({
        payload: BODY,
        header,
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ verified: false, reason: 'no_matching_signature' })
  })

  it('rejects a replay of a captured request once the tolerance has passed', () => {
    const sixMinutesLater = new Date(NOW.getTime() + 6 * 60_000)
    expect(
      verifyStripeSignature({
        payload: BODY,
        header: signed(),
        secret: SECRET,
        now: sixMinutesLater,
      }),
    ).toEqual({ verified: false, reason: 'timestamp_outside_tolerance' })
  })

  it('accepts a delivery inside the tolerance window', () => {
    const fourMinutesLater = new Date(NOW.getTime() + 4 * 60_000)
    expect(
      verifyStripeSignature({
        payload: BODY,
        header: signed(),
        secret: SECRET,
        now: fourMinutesLater,
      }).verified,
    ).toBe(true)
  })

  it('rejects timestamps too far in the future', () => {
    const header = signed(BODY, TIMESTAMP + 3600)
    expect(
      verifyStripeSignature({
        payload: BODY,
        header,
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ verified: false, reason: 'timestamp_outside_tolerance' })
  })

  it('honours a custom tolerance', () => {
    const later = new Date(NOW.getTime() + 60_000)
    expect(
      verifyStripeSignature({
        payload: BODY,
        header: signed(),
        secret: SECRET,
        now: later,
        toleranceSeconds: 30,
      }),
    ).toEqual({ verified: false, reason: 'timestamp_outside_tolerance' })
  })

  it('reports a missing or malformed header distinctly', () => {
    expect(
      verifyStripeSignature({ payload: BODY, header: null, secret: SECRET }),
    ).toEqual({ verified: false, reason: 'missing_signature_header' })

    expect(
      verifyStripeSignature({
        payload: BODY,
        header: 'not-a-stripe-header',
        secret: SECRET,
      }),
    ).toEqual({ verified: false, reason: 'malformed_signature_header' })
  })

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on mismatched lengths; a truncated signature must
    // come back as a plain rejection.
    expect(
      verifyStripeSignature({
        payload: BODY,
        header: `t=${TIMESTAMP},v1=abc`,
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ verified: false, reason: 'no_matching_signature' })
  })

  it('is sensitive to byte-for-byte differences that JSON round-tripping causes', () => {
    // Why the route must not parse before verifying: re-serialising changes
    // whitespace and key order, and the signature then never matches.
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 2)
    expect(
      verifyStripeSignature({
        payload: reserialized,
        header: signed(),
        secret: SECRET,
        now: NOW,
      }).verified,
    ).toBe(false)
  })
})
