// Stripe webhook signature verification, implemented with node:crypto.
//
// Stripe signs every webhook request with the endpoint's secret and sends the
// result in a `Stripe-Signature` header:
//
//   t=1753400000,v1=5257a869e7...,v1=<older secret during rotation>
//
// The signed message is `${t}.${rawBody}`, HMAC-SHA256, hex encoded. Two
// details matter and are easy to get wrong:
//
//   1. It covers the *raw bytes* of the request. Parsing the body to JSON and
//      re-serialising it changes whitespace and key order, and the signature
//      then never matches. Callers must pass `await request.text()`.
//   2. The timestamp is part of the signed message and must be checked against
//      the clock. Without the tolerance check a captured request stays
//      replayable forever, because its signature never stops being valid.
//
// This is the whole of Stripe's verification algorithm, which is why the
// official SDK is not a dependency here — the same reasoning as the hand-rolled
// SigV4 client in lib/backup/s3.ts and the fetch-based adapter in
// lib/email/resend.ts.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Stripe's own default, and the one their documentation recommends keeping. */
export const DEFAULT_TOLERANCE_SECONDS = 300

/** The only signature scheme Stripe currently issues. */
const SCHEME = 'v1'

export type SignatureFailureReason =
  | 'missing_signature_header'
  | 'malformed_signature_header'
  | 'timestamp_outside_tolerance'
  | 'no_matching_signature'

export type SignatureVerification =
  | { verified: true; timestamp: number }
  | { verified: false; reason: SignatureFailureReason }

export interface ParsedSignatureHeader {
  /** Unix seconds the signature was generated at. */
  timestamp: number
  /** Every `v1` signature in the header; more than one during key rotation. */
  signatures: string[]
}

/**
 * Parse a `Stripe-Signature` header into its timestamp and `v1` signatures.
 * Returns null when the header is absent, has no usable `t`, or carries no
 * signature of a scheme we understand.
 */
export function parseSignatureHeader(
  header: string | null | undefined,
): ParsedSignatureHeader | null {
  if (!header) return null

  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of header.split(',')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!value) continue

    if (key === 't') {
      // Stripe sends integer unix seconds; anything else is not a Stripe header.
      if (!/^\d+$/.test(value)) return null
      timestamp = Number(value)
    } else if (key === SCHEME) {
      signatures.push(value)
    }
  }

  if (timestamp === null || signatures.length === 0) return null
  return { timestamp, signatures }
}

/** The signature Stripe should have sent for this body at this timestamp. */
export function computeSignature(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex')
}

/**
 * Compare two hex digests without leaking, through timing, how much of the
 * value matched. Length is checked first because timingSafeEqual throws on
 * mismatched lengths — and a wrong length is already a mismatch.
 */
function secureEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

export interface VerifyInput {
  /** The raw request body, exactly as received. */
  payload: string
  /** The `Stripe-Signature` request header. */
  header: string | null | undefined
  /** The endpoint's signing secret (`whsec_...`). */
  secret: string
  /** Current time; injected so tests are deterministic. */
  now?: Date
  toleranceSeconds?: number
}

/**
 * Verify a Stripe webhook signature against the raw body.
 *
 * Every failure is reported as a reason rather than an exception so the route
 * can log which check failed — "signature rejected" alone is not enough to tell
 * a clock-skew problem from a wrong secret from an attacker.
 */
export function verifyStripeSignature(
  input: VerifyInput,
): SignatureVerification {
  const {
    payload,
    header,
    secret,
    now = new Date(),
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = input

  if (!header) return { verified: false, reason: 'missing_signature_header' }

  const parsed = parseSignatureHeader(header)
  if (!parsed) return { verified: false, reason: 'malformed_signature_header' }

  // Reject replays in both directions: an old capture, and a timestamp from the
  // future (which would otherwise stay valid for as long as it is ahead).
  const ageSeconds = Math.abs(
    Math.floor(now.getTime() / 1000) - parsed.timestamp,
  )
  if (ageSeconds > toleranceSeconds) {
    return { verified: false, reason: 'timestamp_outside_tolerance' }
  }

  const expected = computeSignature(payload, secret, parsed.timestamp)
  const matched = parsed.signatures.some((candidate) =>
    secureEquals(candidate, expected),
  )
  if (!matched) return { verified: false, reason: 'no_matching_signature' }

  return { verified: true, timestamp: parsed.timestamp }
}

/**
 * Build a `Stripe-Signature` header for a payload. Used by tests and by local
 * verification against a synthetic event; production only ever verifies.
 */
export function buildSignatureHeader(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  return `t=${timestamp},${SCHEME}=${computeSignature(payload, secret, timestamp)}`
}
