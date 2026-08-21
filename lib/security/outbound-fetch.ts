// Fetching a URL that somebody else chose.
//
// This exists for one tool — `uploadMediaFromUrl` — and it is the reason that
// tool took a second pass to write. "Download the image at this address" reads
// like a one-liner and is the classic server-side request forgery primitive:
// the address is chosen by the caller, the request is made by the server, and
// the server sits inside a private network with a database, a metadata service
// on some hosts, and other containers reachable by name. `http://127.0.0.1:3000`,
// `http://postgres:5432`, `http://169.254.169.254/latest/meta-data/` are all
// addresses this process can reach and the caller cannot.
//
// Four things have to hold, and each closes a different bypass:
//
//   1. **https only.** `file:`, `data:`, `gopher:` and plain `http:` are all
//      refused. http is refused rather than upgraded because an attacker who
//      can answer for a hostname on the local network can answer plaintext.
//   2. **Every resolved address is checked, not the hostname.** A hostname is
//      not an address: `localtest.me` resolves to 127.0.0.1, and any attacker
//      can publish a DNS record pointing at anything they like. `dns.lookup`
//      with `all: true` is used so that a name resolving to several addresses
//      cannot slip one private answer past a check of the first.
//   3. **The checked address is the one connected to.** Validating a name and
//      then handing the name to the HTTP client re-resolves it, and a DNS
//      server under the caller's control can answer differently the second
//      time — that is DNS rebinding, and it defeats naive validation entirely.
//      The address is therefore pinned through a custom `lookup`, so the socket
//      goes to the address that passed. TLS still verifies against the
//      hostname, so pinning does not weaken certificate checking.
//   4. **Redirects are followed by hand.** `fetch`'s automatic following would
//      take a public first hop to a private second one without another check.
//      Each hop is re-validated from scratch.
//
// `node:https` rather than `fetch`, because `fetch` offers no way to pin the
// address it connects to without reaching for undici internals.

import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { isIP } from 'node:net'

/** Hops followed before giving up. Real image URLs need one or two. */
const MAX_REDIRECTS = 3

/** Abandoned after this, so a slow server cannot hold a connection open. */
const TIMEOUT_MS = 10_000

export type FetchedBytes = {
  bytes: Buffer
  contentType: string | null
  /** The address finally connected to, for the audit line. */
  resolvedAddress: string
  /** The URL the bytes came from, after any redirects. */
  url: string
}

/** Parses an IPv4 address into octets, or null if it is not one. */
function octets(address: string): number[] | null {
  if (isIP(address) !== 4) return null
  return address.split('.').map(Number)
}

/**
 * Whether an IPv4 address is a public, routable one.
 *
 * Everything not clearly global unicast is refused, rather than listing what to
 * block and hoping the list is complete. The ranges named below are the ones a
 * request forgery actually aims at.
 */
function isPublicIPv4(address: string): boolean {
  const parts = octets(address)
  if (!parts || parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return false
  }

  const [a, b] = parts

  if (a === 0) return false // "this network"
  if (a === 10) return false // RFC 1918
  if (a === 127) return false // loopback
  if (a === 169 && b === 254) return false // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false // RFC 1918
  if (a === 192 && b === 168) return false // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a === 192 && b === 0) return false // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
  if (a === 198 && b === 51) return false // TEST-NET-2
  if (a === 203 && b === 0) return false // TEST-NET-3
  if (a >= 224) return false // multicast, reserved, broadcast

  return true
}

/** Whether an IPv6 address is public, including the v4 it may embed. */
function isPublicIPv6(address: string): boolean {
  const value = address
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0]

  // An IPv4-mapped or IPv4-compatible address is an IPv4 address wearing a hat.
  // `::ffff:127.0.0.1` is loopback, and checking it as "some IPv6 string" would
  // wave it straight through.
  const embedded = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
  if (embedded) return isPublicIPv4(embedded[1])

  if (value === '::' || value === '::1') return false
  if (/^f[cd]/.test(value)) return false // unique local, fc00::/7
  if (/^fe[89ab]/.test(value)) return false // link-local, fe80::/10
  if (value.startsWith('ff')) return false // multicast
  if (value.startsWith('64:ff9b')) return false // NAT64, wraps IPv4
  if (value.startsWith('2002:')) return false // 6to4, wraps IPv4

  return true
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isPublicIPv4(address)
  if (family === 6) return isPublicIPv6(address)
  return false
}

/** Rejections a model can act on, rather than a generic failure. */
export class OutboundFetchError extends Error {}

/**
 * Validates the scheme and resolves the host, returning the addresses to pin.
 *
 * Throws rather than returning a result, because there is no useful "partly
 * allowed" state and every caller's correct response to a refusal is the same.
 */
async function resolvePublicHost(url: URL): Promise<string[]> {
  if (url.protocol !== 'https:') {
    throw new OutboundFetchError(
      `Only https URLs can be fetched; ${url.protocol}// is refused.`,
    )
  }

  // A literal address in the URL is checked directly — there is nothing to
  // resolve, and `dns.lookup` would simply hand it back.
  const literal = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(literal)) {
    if (!isPublicAddress(literal)) {
      throw new OutboundFetchError(
        `${url.hostname} is not a public address, so it will not be fetched.`,
      )
    }
    return [literal]
  }

  let resolved: Array<{ address: string }>
  try {
    resolved = await dnsLookup(url.hostname, { all: true })
  } catch {
    throw new OutboundFetchError(`${url.hostname} could not be resolved.`)
  }

  if (!resolved.length) {
    throw new OutboundFetchError(`${url.hostname} resolved to no addresses.`)
  }

  // Every answer, not the first: a name that resolves to one public and one
  // private address must be refused, or the choice of which to connect to
  // becomes the attacker's.
  for (const { address } of resolved) {
    if (!isPublicAddress(address)) {
      throw new OutboundFetchError(
        `${url.hostname} resolves to ${address}, which is not a public address.`,
      )
    }
  }

  return resolved.map((entry) => entry.address)
}

/** One request, to a pinned address, with the body capped as it arrives. */
function requestOnce(
  url: URL,
  address: string,
  maxBytes: number,
): Promise<{
  bytes: Buffer
  contentType: string | null
  location: string | null
  status: number
}> {
  const options: RequestOptions = {
    headers: {
      // Named so an operator reading their own access log knows what called.
      'User-Agent': 'beyond-every-art-mcp/1.0 (+uploadMediaFromUrl)',
      Accept: 'image/png,image/jpeg,image/webp',
    },
    host: url.hostname,
    // The pin. TLS still validates the certificate against `servername`, so
    // connecting by address does not weaken verification.
    lookup: (_hostname, _opts, callback) => {
      // The three-argument form, which is what `https.request` calls. Every
      // resolution for this request returns the address already validated
      // above, so a DNS server cannot answer differently the second time.
      callback(null, address, isIP(address))
    },
    method: 'GET',
    path: `${url.pathname}${url.search}`,
    port: url.port || 443,
    servername: url.hostname,
    timeout: TIMEOUT_MS,
  }

  return new Promise((resolve, reject) => {
    const req = httpsRequest(options, (res) => {
      const status = res.statusCode ?? 0
      const location = res.headers.location ?? null

      // A redirect carries no bytes worth keeping.
      if (status >= 300 && status < 400) {
        res.resume()
        resolve({ bytes: Buffer.alloc(0), contentType: null, location, status })
        return
      }

      // Checked before reading, when the server volunteers it — and again
      // below while reading, because the header is the server's claim and the
      // stream is the truth.
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy()
        reject(
          new OutboundFetchError(
            `The image is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`,
          ),
        )
        return
      }

      const chunks: Buffer[] = []
      let total = 0

      res.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > maxBytes) {
          res.destroy()
          reject(
            new OutboundFetchError(
              `The image is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`,
            ),
          )
          return
        }
        chunks.push(chunk)
      })

      res.on('end', () =>
        resolve({
          bytes: Buffer.concat(chunks),
          contentType: (res.headers['content-type'] as string) ?? null,
          location: null,
          status,
        }),
      )
      res.on('error', reject)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new OutboundFetchError('The image took too long to download.'))
    })
    req.on('error', (error) =>
      reject(
        new OutboundFetchError(
          `The image could not be downloaded: ${error.message}`,
        ),
      ),
    )
    req.end()
  })
}

/**
 * Fetches bytes from a caller-supplied https URL, refusing anything that is not
 * a public address at every hop.
 */
export async function fetchPublicBytes(
  rawUrl: string,
  maxBytes: number,
): Promise<FetchedBytes> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new OutboundFetchError(`\`${rawUrl}\` is not a valid URL.`)
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const [address] = await resolvePublicHost(url)
    const response = await requestOnce(url, address, maxBytes)

    if (response.status >= 300 && response.status < 400) {
      if (!response.location) {
        throw new OutboundFetchError(
          `${url.host} answered ${response.status} with no redirect target.`,
        )
      }

      // Re-validated from scratch on the next pass. A public first hop
      // redirecting to a private second one is the whole point of following
      // redirects by hand rather than letting the client do it.
      try {
        url = new URL(response.location, url)
      } catch {
        throw new OutboundFetchError(
          `${url.host} redirected to an address that is not a valid URL.`,
        )
      }
      continue
    }

    if (response.status !== 200) {
      throw new OutboundFetchError(
        `${url.host} answered ${response.status} rather than serving an image.`,
      )
    }

    return {
      bytes: response.bytes,
      contentType: response.contentType,
      resolvedAddress: address,
      url: url.href,
    }
  }

  throw new OutboundFetchError(
    `Gave up after ${MAX_REDIRECTS} redirects. Use the image's final address.`,
  )
}
