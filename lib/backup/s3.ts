// A minimal, dependency-free S3 (and Cloudflare R2) client.
//
// The rest of the app talks to R2 through @payloadcms/storage-s3, but the
// backup pipeline runs as a standalone Node process (locally and inside the
// `backup` container) where pulling in the full AWS SDK would be heavy and add
// a build step. Everything here is implemented with node:crypto and the global
// fetch shipped with Node 20, so `pnpm backup:db` runs anywhere Node runs.
//
// Only the four operations the backup pipeline needs are implemented:
// putObject, getObject, listObjects, and deleteObject. Requests use path-style
// addressing (`{endpoint}/{bucket}/{key}`), which R2 and modern S3 both accept.

import { createHash, createHmac } from 'node:crypto'

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Optional STS session token, included as x-amz-security-token when set. */
  sessionToken?: string
}

const SERVICE = 's3'
const ALGORITHM = 'AWS4-HMAC-SHA256'
const UNSIGNED_EMPTY_BODY_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Uint8Array | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

/**
 * Percent-encode per RFC 3986, the encoding SigV4 canonical requests require.
 * Unlike encodeURIComponent this also escapes `!'()*`. When `encodeSlash` is
 * false, `/` is preserved so object keys keep their path structure.
 */
export function encodeRfc3986(value: string, encodeSlash = true): string {
  return value
    .split('')
    .map((char) => {
      if (/[A-Za-z0-9\-._~]/.test(char)) return char
      if (char === '/' && !encodeSlash) return char
      return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
    })
    .join('')
}

/** Build a sorted, encoded canonical query string from a plain object. */
export function canonicalQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
    .join('&')
}

/** Format a Date as the two SigV4 timestamps (amzDate + short datestamp). */
export function amzDates(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

export interface SignInput {
  method: string
  /** Canonical URI, already RFC 3986 encoded (e.g. `/bucket/my%20key`). */
  canonicalUri: string
  query: Record<string, string>
  host: string
  payloadHash: string
  date: Date
  config: S3Config
}

/**
 * Produce the headers (including Authorization) for a signed S3 request. Pure
 * and deterministic for a fixed `date`, which is what makes it unit-testable.
 */
export function signRequest(input: SignInput): Record<string, string> {
  const { method, canonicalUri, query, host, payloadHash, date, config } = input
  const { amzDate, dateStamp } = amzDates(date)

  const baseHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  if (config.sessionToken) {
    baseHeaders['x-amz-security-token'] = config.sessionToken
  }

  const signedHeaderNames = Object.keys(baseHeaders).sort()
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${baseHeaders[name]}\n`)
    .join('')
  const signedHeaders = signedHeaderNames.join(';')

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signature = hmac(
    signingKey(config.secretAccessKey, dateStamp, config.region),
    stringToSign,
  ).toString('hex')

  const authorization =
    `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { ...baseHeaders, Authorization: authorization }
}

interface RequestInput {
  method: string
  /** Object key, or undefined for bucket-level requests (e.g. list). */
  key?: string
  query?: Record<string, string>
  body?: Uint8Array
}

async function s3Fetch(
  config: S3Config,
  input: RequestInput,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const { method, key, query = {}, body } = input
  const endpoint = config.endpoint.replace(/\/+$/, '')
  const host = new URL(endpoint).host

  const encodedKey = key ? `/${encodeRfc3986(key, false)}` : ''
  const canonicalUri = `/${encodeRfc3986(config.bucket)}${encodedKey}`
  const payloadHash = body ? sha256Hex(body) : UNSIGNED_EMPTY_BODY_HASH

  const headers = signRequest({
    method,
    canonicalUri,
    query,
    host,
    payloadHash,
    date: now(),
    config,
  })

  const qs = canonicalQuery(query)
  const url = `${endpoint}${canonicalUri}${qs ? `?${qs}` : ''}`

  return fetch(url, {
    method,
    headers,
    body: body as BodyInit | undefined,
  })
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const detail = await response.text().catch(() => '')
  throw new Error(
    `S3 ${action} failed: ${response.status} ${response.statusText}` +
      (detail ? `\n${detail}` : ''),
  )
}

/** Upload an object. */
export async function putObject(
  config: S3Config,
  key: string,
  body: Uint8Array,
  now?: () => Date,
): Promise<void> {
  const response = await s3Fetch(config, { method: 'PUT', key, body }, now)
  await assertOk(response, `PUT ${key}`)
}

/** Download an object as a Buffer. */
export async function getObject(
  config: S3Config,
  key: string,
  now?: () => Date,
): Promise<Buffer> {
  const response = await s3Fetch(config, { method: 'GET', key }, now)
  await assertOk(response, `GET ${key}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Delete an object. */
export async function deleteObject(
  config: S3Config,
  key: string,
  now?: () => Date,
): Promise<void> {
  const response = await s3Fetch(config, { method: 'DELETE', key }, now)
  await assertOk(response, `DELETE ${key}`)
}

/** Pull every `<Key>` out of an S3 ListObjectsV2 XML body. */
export function parseListKeys(xml: string): string[] {
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) =>
    decodeXmlEntities(match[1]),
  )
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * List object keys under a prefix, following ListObjectsV2 continuation
 * tokens so more than 1000 backups are still handled correctly.
 */
export async function listObjects(
  config: S3Config,
  prefix: string,
  now?: () => Date,
): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const query: Record<string, string> = {
      'list-type': '2',
      prefix,
    }
    if (continuationToken) query['continuation-token'] = continuationToken

    const response = await s3Fetch(config, { method: 'GET', query }, now)
    await assertOk(response, `LIST ${prefix}`)
    const xml = await response.text()

    keys.push(...parseListKeys(xml))

    const tokenMatch = xml.match(
      /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/,
    )
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
    continuationToken = truncated && tokenMatch ? tokenMatch[1] : undefined
  } while (continuationToken)

  return keys
}
