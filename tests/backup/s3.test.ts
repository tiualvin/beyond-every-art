import { describe, expect, it } from 'vitest'

import {
  amzDates,
  canonicalQuery,
  encodeRfc3986,
  parseListKeys,
  signRequest,
  type S3Config,
} from '../../lib/backup/s3'

const config: S3Config = {
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'backups',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secretExampleKey',
}

describe('encodeRfc3986', () => {
  it('escapes spaces and reserved characters', () => {
    expect(encodeRfc3986('a b+c')).toBe('a%20b%2Bc')
    expect(encodeRfc3986("(x)!*'")).toBe('%28x%29%21%2A%27')
  })

  it('preserves slashes only when asked', () => {
    expect(encodeRfc3986('a/b', false)).toBe('a/b')
    expect(encodeRfc3986('a/b', true)).toBe('a%2Fb')
  })

  it('leaves unreserved characters untouched', () => {
    expect(encodeRfc3986('Aa0-._~')).toBe('Aa0-._~')
  })
})

describe('canonicalQuery', () => {
  it('sorts keys and encodes values', () => {
    expect(canonicalQuery({ prefix: 'db backups/', 'list-type': '2' })).toBe(
      'list-type=2&prefix=db%20backups%2F',
    )
  })

  it('returns an empty string for no query', () => {
    expect(canonicalQuery({})).toBe('')
  })
})

describe('amzDates', () => {
  it('formats both SigV4 timestamps', () => {
    const { amzDate, dateStamp } = amzDates(
      new Date('2026-07-24T03:00:00.000Z'),
    )
    expect(amzDate).toBe('20260724T030000Z')
    expect(dateStamp).toBe('20260724')
  })
})

describe('parseListKeys', () => {
  it('extracts and XML-decodes every key', () => {
    const xml =
      '<ListBucketResult><Contents><Key>db-backups/a.sql.gz</Key></Contents>' +
      '<Contents><Key>db-backups/b&amp;c.sql.gz</Key></Contents></ListBucketResult>'
    expect(parseListKeys(xml)).toEqual([
      'db-backups/a.sql.gz',
      'db-backups/b&c.sql.gz',
    ])
  })
})

describe('signRequest', () => {
  const date = new Date('2026-07-24T03:00:00.000Z')

  it('produces a deterministic AWS4-HMAC-SHA256 authorization header', () => {
    const headers = signRequest({
      method: 'PUT',
      canonicalUri: '/backups/db-backups/x.sql.gz',
      query: {},
      host: 'acct.r2.cloudflarestorage.com',
      payloadHash: 'abc123',
      date,
      config,
    })

    // Stable across calls with identical input (the property that makes it
    // safe to unit test) and structurally well-formed.
    const again = signRequest({
      method: 'PUT',
      canonicalUri: '/backups/db-backups/x.sql.gz',
      query: {},
      host: 'acct.r2.cloudflarestorage.com',
      payloadHash: 'abc123',
      date,
      config,
    })
    expect(headers.Authorization).toBe(again.Authorization)

    expect(headers.Authorization).toContain(
      'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20260724/auto/s3/aws4_request',
    )
    expect(headers.Authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date',
    )
    expect(headers.Authorization).toMatch(/Signature=[0-9a-f]{64}$/)
    expect(headers['x-amz-date']).toBe('20260724T030000Z')
    expect(headers['x-amz-content-sha256']).toBe('abc123')
  })

  it('includes the session token in signed headers when present', () => {
    const headers = signRequest({
      method: 'GET',
      canonicalUri: '/backups',
      query: { 'list-type': '2' },
      host: 'acct.r2.cloudflarestorage.com',
      payloadHash: 'abc123',
      date,
      config: { ...config, sessionToken: 'TOKEN' },
    })
    expect(headers['x-amz-security-token']).toBe('TOKEN')
    expect(headers.Authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token',
    )
  })

  it('changes the signature when the region changes', () => {
    const a = signRequest({
      method: 'GET',
      canonicalUri: '/backups',
      query: {},
      host: 'acct.r2.cloudflarestorage.com',
      payloadHash: 'abc123',
      date,
      config,
    })
    const b = signRequest({
      method: 'GET',
      canonicalUri: '/backups',
      query: {},
      host: 'acct.r2.cloudflarestorage.com',
      payloadHash: 'abc123',
      date,
      config: { ...config, region: 'us-east-1' },
    })
    expect(a.Authorization).not.toBe(b.Authorization)
  })
})
