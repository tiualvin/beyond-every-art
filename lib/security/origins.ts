// The origins this deployment answers on, as Payload needs to be told them.
//
// Payload uses this list for two things, and leaving it empty broke both.
//
// **The CSRF check.** `extractJWT` will only read the session cookie off a
// request whose `Origin` is on this list — *unless* the list is empty, in which
// case it accepts any origin at all. An empty `csrf` is not a strict default;
// it is the check turned off, leaving the browser's `SameSite=Lax` cookie
// default as the only thing standing between a cross-site page and an
// authenticated write. Payload ships the origin check precisely because
// SameSite alone is a browser policy rather than a server one.
//
// **Password reset links.** `getRequestOrigin` builds the origin of a
// transactional email's links from the request's own `Host` header, and will
// only trust it when it appears on this list. With nothing listed it logs a
// warning and falls back to an empty string, so `forgotPassword` emails a bare
// `/admin/reset/<token>` — a relative path, in an email, where there is no page
// for it to be relative to. Admin password recovery does not work at all until
// this list is populated.
//
// Pure and env-driven, in the same shape as `csp.ts` and `lib/seo/indexing.ts`,
// so it can be unit-tested rather than discovered in production.

type Env = Record<string, string | undefined>

/**
 * Hostnames that are only ever reached over plain HTTP, so a derived origin
 * for them should not claim otherwise.
 */
function isLocal(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  )
}

/** An absolute origin, or null when the value is missing or not a URL. */
function toOrigin(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * The origin Caddy serves the admin panel and MCP endpoint on.
 *
 * `CMS_ADDRESS` is a bare hostname — it is Caddy's site address, not a URL —
 * so the scheme has to be supplied. Caddy provisions HTTPS for anything that
 * is not a local name, which is what decides it here. `PAYLOAD_PUBLIC_CMS_URL`
 * overrides the derivation for a deployment that fronts the admin differently.
 */
export function cmsOrigin(env: Env = process.env): string | null {
  const explicit = toOrigin(env.PAYLOAD_PUBLIC_CMS_URL)
  if (explicit) return explicit

  const address = env.CMS_ADDRESS?.trim()
  if (!address) return null

  const scheme = isLocal(address.split(':')[0]) ? 'http' : 'https'
  return toOrigin(`${scheme}://${address}`)
}

/** The public origin of the website, in the same order `getSiteUrl` prefers. */
export function siteOrigin(env: Env = process.env): string | null {
  return (
    toOrigin(env.NEXT_PUBLIC_SITE_URL) ??
    toOrigin(env.NEXT_PUBLIC_SERVER_URL) ??
    toOrigin(env.PAYLOAD_PUBLIC_SERVER_URL)
  )
}

/**
 * Where this process can reach itself, for a server-side request that must not
 * leave the container.
 *
 * The middleware needs this because it cannot reach Postgres and has to fetch
 * `/redirects-map` over HTTP instead. What it must not use is
 * `request.nextUrl.origin`: Next builds that from the server's bind address
 * (`HOSTNAME`, which the Dockerfile sets to `0.0.0.0`) and the scheme from
 * `X-Forwarded-Proto` — which Caddy sets to `https` — so behind TLS it reads
 * `https://0.0.0.0:3000`, and a fetch to it fails the handshake against a
 * listener that only speaks plain HTTP. The visible symptom is every migrated
 * Ghost URL answering 404 while nothing looks broken.
 *
 * Loopback rather than `0.0.0.0`, because this is a connection being made
 * rather than an interface being bound to.
 */
export function internalOrigin(env: Env = process.env): string {
  const explicit = toOrigin(env.INTERNAL_ORIGIN)
  if (explicit) return explicit

  const port = Number(env.PORT)
  return `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : 3000}`
}

/**
 * The origin the reader actually used, reconstructed from what the proxy
 * forwarded.
 *
 * Middleware has no other way to know it. `request.nextUrl.origin` is the
 * server's bind address — `https://0.0.0.0:3000` behind Caddy — so anything
 * resolved against it points at an address no client can reach, and Next
 * insists on an absolute `Location` (its edge adapter parses the header as a
 * URL), so there is no way to sidestep the question by staying relative.
 *
 * The `Host` header is chosen by whoever sent the request, which is worth being
 * clear about rather than quiet about: a caller can set it to anything and get
 * a redirect to that host. It buys them nothing. A browser sends the host it
 * dialled, so a forged value can only appear in the attacker's own request and
 * only redirects themselves; the *path* comes from the redirect table either
 * way, never from the request. This is the same reconstruction every
 * reverse-proxied framework does, including Next itself under
 * `trustHostHeader`.
 *
 * A host that is not a plausible authority is discarded rather than passed to
 * the URL parser, so a malformed header degrades to the fallback instead of
 * throwing inside middleware and turning a redirect into a 500.
 */
const PLAUSIBLE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i

export function forwardedOrigin(headers: Headers, fallback: string): string {
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || headers.get('host')?.trim()
  if (!host || !PLAUSIBLE_HOST.test(host)) return fallback

  const forwardedProto = headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()
  const scheme = forwardedProto === 'https' ? 'https' : 'http'

  return `${scheme}://${host}`
}

/**
 * Every origin Payload should trust, both schemes where the host is served
 * over HTTPS.
 *
 * The `http://` twin is here for `getRequestOrigin`, which compares against a
 * scheme it derives from the request rather than from the proxy — behind
 * Caddy that can read as `http` on a connection the reader made over TLS, and
 * a near-miss there silently costs the password-reset link again. It is not a
 * meaningful widening of the CSRF list: to send `Origin: http://<host>` a
 * browser has to have loaded a page from `http://<host>`, and Caddy answers
 * that with a redirect to HTTPS rather than a page.
 */
export function trustedOrigins(env: Env = process.env): string[] {
  const origins = new Set<string>()

  for (const origin of [siteOrigin(env), cmsOrigin(env)]) {
    if (!origin) continue
    origins.add(origin)
    if (origin.startsWith('https://')) {
      origins.add(`http://${origin.slice('https://'.length)}`)
    }
  }

  return [...origins]
}
