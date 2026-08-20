import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { CODE_CHALLENGE_METHOD, verifyPkce } from '../../lib/oauth/pkce'

const verifier = () => randomBytes(48).toString('base64url')
const challengeFor = (value: string) =>
  createHash('sha256').update(value).digest('base64url')

describe('verifyPkce', () => {
  it('accepts a verifier that hashes to the challenge', () => {
    const value = verifier()
    expect(verifyPkce(value, challengeFor(value))).toBe(true)
  })

  it('refuses a different verifier', () => {
    expect(verifyPkce(verifier(), challengeFor(verifier()))).toBe(false)
  })

  // Without this the whole exchange is unprotected: an attacker holding a
  // stolen code could redeem it by sending no verifier at all.
  it.each(['', ' '])('refuses an empty verifier (%j)', (value) => {
    expect(verifyPkce(value, challengeFor(value))).toBe(false)
  })

  it('refuses an empty challenge', () => {
    expect(verifyPkce(verifier(), '')).toBe(false)
  })

  // RFC 7636 §4.1. A short verifier would still hash correctly, so length is
  // the only thing making it a secret rather than a guessable string.
  it('refuses a verifier below the 43-character minimum', () => {
    const short = 'a'.repeat(42)
    expect(verifyPkce(short, challengeFor(short))).toBe(false)
  })

  it('refuses a verifier above the 128-character maximum', () => {
    const long = 'a'.repeat(129)
    expect(verifyPkce(long, challengeFor(long))).toBe(false)
  })

  it('accepts the exact boundary lengths', () => {
    for (const length of [43, 128]) {
      const value = 'a'.repeat(length)
      expect(verifyPkce(value, challengeFor(value))).toBe(true)
    }
  })

  it('refuses characters outside the unreserved set', () => {
    const value = `${'a'.repeat(42)}/`
    expect(verifyPkce(value, challengeFor(value))).toBe(false)
  })

  // `plain` was removed by OAuth 2.1 and the MCP spec requires S256. A client
  // that could negotiate `plain` could negotiate away the protection entirely.
  it('only advertises S256', () => {
    expect(CODE_CHALLENGE_METHOD).toBe('S256')
  })

  it('refuses a challenge that is the verifier itself (the plain downgrade)', () => {
    const value = verifier()
    expect(verifyPkce(value, value)).toBe(false)
  })
})
