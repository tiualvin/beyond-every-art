import { APIError } from 'payload'
import { describe, expect, it } from 'vitest'

import { methodNotAllowedError, rateLimitedError } from '../../lib/mcp/errors'

// The point of these errors is what Payload's `routeError` does with them, and
// it reads exactly two things: `status`, which becomes the HTTP status, and
// `isPublic`, which decides whether the message survives or is replaced with
// "Something went wrong." A plain `Error` fails both checks — that is the bug
// these exist to close, so both properties are asserted rather than assumed.
describe('rateLimitedError', () => {
  it('carries the message it was given', () => {
    expect(rateLimitedError('Try again in 42 seconds.').message).toBe(
      'Try again in 42 seconds.',
    )
  })

  it('answers 429 rather than 500', () => {
    expect(rateLimitedError('nope').status).toBe(429)
  })

  // Without this the retry-after text never reaches the caller, and an agent
  // told only "Something went wrong" has no reason to wait before retrying.
  it('is public, so the message reaches the caller', () => {
    expect(rateLimitedError('nope').isPublic).toBe(true)
  })

  it('is an APIError, which is what routeError reads a status from', () => {
    expect(rateLimitedError('nope')).toBeInstanceOf(APIError)
  })
})

describe('methodNotAllowedError', () => {
  // The transport spec: a server offering no SSE stream at the endpoint answers
  // 405 on GET. The plugin's own handler wraps that in an HTTP 200 instead.
  it('answers 405', () => {
    expect(methodNotAllowedError().status).toBe(405)
  })

  it('is public', () => {
    expect(methodNotAllowedError().isPublic).toBe(true)
  })

  it('says which method the endpoint does accept', () => {
    expect(methodNotAllowedError().message).toContain('POST')
  })
})
