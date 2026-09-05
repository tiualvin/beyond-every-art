// Whether a request actually arrived through Cloudflare.
//
// `clientKey` trusts `CF-Connecting-IP` when `TRUST_CLOUDFLARE_IP` is set, and
// that header means something only when Cloudflare is the one writing it. When
// anything else can reach the application, the header is just a string the
// caller chose — and because it becomes the rate-limit key, choosing a new one
// per request buys a fresh allowance per request. Every in-process limiter is
// then off: login, password reset, preview, images, CSP reports, slug misses,
// Stripe failures, and MCP key guessing.
//
// Two things make that reachable today rather than hypothetically:
//
//   - `docs/EDGE_PROTECTION.md` step 6 is open. Ports 80 and 443 are still
//     sourced from `Any` in the Hetzner firewall, and the origin address has
//     been public since July, so a request can skip Cloudflare entirely.
//   - `cms.beyondeveryart.com` is deliberately never proxied (step 7), so the
//     MCP endpoint keeps answering non-browser clients. On that hostname the
//     header is forgeable permanently — closing the origin does not fix it,
//     and `/api/users/*` and `/api/mcp*` are reachable there without a
//     credential by design.
//
// So the question this answers is not "is the variable set" but "did this
// request come from Cloudflare", which is a property of the peer and not of
// anything the peer can write.
//
// The peer is knowable. Caddy appends the address it accepted the connection
// from to `X-Forwarded-For`, so the last hop is the one entry in that header
// the client did not choose — the same reasoning `clientKey` already relies on.
// When that hop is inside Cloudflare's published ranges, `CF-Connecting-IP` was
// written by Cloudflare and names the real visitor. When it is not, the request
// reached the origin some other way and the header is discarded.

/**
 * Cloudflare's published IPv4 and IPv6 ranges.
 *
 * From https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6,
 * which are the same lists `EDGE_PROTECTION.md` pass two puts into the Hetzner
 * firewall rules. Kept here as data rather than fetched at runtime: a limiter
 * that needs a network call to decide how to bucket a request is a limiter that
 * fails open the first time the call does.
 *
 * These change rarely — Cloudflare announces additions well in advance — but
 * they do change, and a stale list fails in the safe direction: an unrecognised
 * peer is treated as not-Cloudflare, so its `CF-Connecting-IP` is ignored and
 * the limiter keys on the peer instead. That throttles a shared address more
 * tightly than intended; it never waves anyone through.
 *
 * `tests/security/cloudflare.test.ts` pins the shape of every entry, so a
 * malformed line fails on the way in rather than silently matching nothing.
 */
export const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
] as const

export const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const

/** An address parsed to its bytes, or null when it is not an address at all. */
function toBytes(address: string): Uint8Array | null {
  return address.includes(':') ? toIpv6Bytes(address) : toIpv4Bytes(address)
}

function toIpv4Bytes(address: string): Uint8Array | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null

  const bytes = new Uint8Array(4)
  for (let index = 0; index < 4; index += 1) {
    const part = parts[index]
    // Rejected rather than coerced, leading zeroes included: `Number('')` is 0
    // and `Number('016')` is 16, so a permissive parse accepts strings that are
    // not addresses and reads them as ones inside a range. Some resolvers treat
    // a zero-prefixed octet as octal, so the same text can mean two addresses —
    // never a thing to extend trust on.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    bytes[index] = value
  }
  return bytes
}

function toIpv6Bytes(address: string): Uint8Array | null {
  // An IPv4-mapped address (`::ffff:1.2.3.4`) is how a dual-stack listener
  // reports an IPv4 peer, so it has to compare against the IPv4 ranges.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)
  if (mapped) return toIpv4Bytes(mapped[1])

  const halves = address.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null

  const groups = [
    ...head,
    ...(halves.length === 2 ? Array<string>(missing).fill('0') : []),
    ...tail,
  ]

  const bytes = new Uint8Array(16)
  for (let index = 0; index < 8; index += 1) {
    const group = groups[index]
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    const value = Number.parseInt(group, 16)
    bytes[index * 2] = value >> 8
    bytes[index * 2 + 1] = value & 0xff
  }
  return bytes
}

/** Whether `address` falls inside `cidr`, both already known to be well formed. */
function withinRange(addressBytes: Uint8Array, cidr: string): boolean {
  const [network, prefixText] = cidr.split('/')
  const networkBytes = toBytes(network)
  if (!networkBytes || networkBytes.length !== addressBytes.length) return false

  const prefix = Number(prefixText)
  const wholeBytes = Math.floor(prefix / 8)
  for (let index = 0; index < wholeBytes; index += 1) {
    if (addressBytes[index] !== networkBytes[index]) return false
  }

  const remainingBits = prefix % 8
  if (remainingBits === 0) return true

  // Compare only the leading bits of the byte the prefix stops inside.
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return (addressBytes[wholeBytes] & mask) === (networkBytes[wholeBytes] & mask)
}

/**
 * Whether `address` is one of Cloudflare's edge servers.
 *
 * Anything unparseable answers `false`, which is the safe direction: the caller
 * falls back to keying on the peer, and a request whose peer cannot even be
 * read is not one to extend trust to.
 */
export function isCloudflareAddress(address: string | undefined): boolean {
  if (!address) return false

  const trimmed = address.trim()
  // A peer may arrive with a zone suffix (`fe80::1%eth0`) or, if something
  // upstream is written loosely, a port. Neither belongs in the comparison.
  const bare = trimmed.split('%')[0]
  const bytes = toBytes(bare)
  if (!bytes) return false

  const ranges = bytes.length === 4 ? CLOUDFLARE_IPV4 : CLOUDFLARE_IPV6
  return ranges.some((cidr) => withinRange(bytes, cidr))
}
