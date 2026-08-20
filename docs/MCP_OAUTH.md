# OAuth for MCP connectors

## Summary

- **Why it exists:** the claude.ai connector dialog offers a URL and two OAuth
  fields, and nothing else. There is no place to put a bearer token unless an
  account has the request-headers beta, so on most accounts the MCP endpoint
  described in [`MCP_SERVER.md`](MCP_SERVER.md) simply cannot be connected. This
  is the layer that makes it connectable.
- **What it is:** a small OAuth 2.1 authorization server — discovery,
  registration, consent, tokens — serving exactly one resource, `/api/mcp`.
- **Off by default.** `MCP_OAUTH_ENABLED=1` mounts it; unset, none of the routes
  exist and the endpoint takes API keys as before.
- **A connector may never publish.** Stricter than an API key, deliberately —
  see [Publishing](#publishing).
- **Everything downstream is unchanged.** A grant resolves to the same
  `payload-mcp-api-keys` document an API key resolves to, so capabilities, the
  audit log, and revocation work on a connector exactly as they already do on a
  key.

## Turning it on

1. `pnpm migrate:db` — the `oauth_clients` and `oauth_grants` tables ship in
   `20260820_005134_add_oauth_clients_and_grants`.
2. Set `MCP_OAUTH_ENABLED=1` alongside `MCP_ENABLED=1`, and make sure
   `CMS_ADDRESS` is set: the issuer is derived from it, and without one every
   endpoint answers 503 rather than advertising a guess.
3. In the client, add a custom connector pointing at
   `https://<CMS_ADDRESS>/api/mcp`. Leave both OAuth fields **empty** — the
   client registers itself.
4. Approve the consent screen when it appears.

There is no key to create and nothing to paste. That is the whole point.

## The flow, as it actually runs

```
Claude                          cms.beyondeveryart.com
  │  POST /api/mcp (no token)
  │ ─────────────────────────────────▶  401
  │ ◀───────────────────────────────── WWW-Authenticate: Bearer
  │                                      resource_metadata="…/.well-known/…"
  │  GET  /.well-known/oauth-protected-resource/api/mcp
  │  GET  /.well-known/oauth-authorization-server
  │  POST /oauth/register                              (RFC 7591)
  │ ◀───────────────────────────────── client_id
  │  ── browser ──▶ GET /oauth/authorize?…&code_challenge=…
  │                   ▶ /admin/login  (see below)
  │                   ◀ consent screen, approved by a person
  │ ◀───────────────────────────────── 302 …/auth_callback?code=…
  │  POST /oauth/token  (code + code_verifier)
  │ ◀───────────────────────────────── access_token, refresh_token
  │  POST /api/mcp  Authorization: Bearer bea_at_…
  │ ◀───────────────────────────────── tools
```

The `WWW-Authenticate` header is the load-bearing part. A client handed only an
endpoint URL discovers everything else from that 401, and a server that omits
the header looks to a well-behaved client like one that is simply refusing it.
It is attached in [`app/(payload)/api/[...slug]/route.ts`](<../app/(payload)/api/[...slug]/route.ts>)
rather than in the plugin, because Payload builds error responses from the
thrown error and an error cannot carry headers.

## Why you log in every time you connect

Arriving at the consent screen from claude.ai is a cross-site navigation, and
Payload declines to read its session cookie off one: `extractJWT` falls back to
`Sec-Fetch-Site` when `csrf` is configured, and answers `cross-site` with "no
session". So `/oauth/authorize` bounces even an already-signed-in administrator
to `/admin/login`, and returns them to consent afterwards — at which point the
navigation is same-origin and the session is read normally.

This looks like a bug and is worth keeping. A grant issued here is standing
authority over the archive, handed to software running in somebody else's
cloud. Requiring a fresh authentication immediately before that decision, rather
than accepting whatever session happens to be open in another tab, is the
behaviour you would choose on purpose.

**It depends on `csrf` being configured**, which means on `CMS_ADDRESS` being a
real hostname. `trustedOrigins()` drops localhost origins under
`NODE_ENV=production`, and Payload treats an empty `csrf` list as "no allowlist
to enforce" — so on a deployment with no CMS origin the bounce does not happen
and a live session is accepted cross-site. That is one more reason `CMS_ADDRESS`
is not optional here; the issuer already refuses to serve without it.

For the same reason there is no end-to-end test of the bounce: CI runs the
production server on loopback, so its `csrf` list is empty by construction and
the assertion could never fire. `e2e/oauth.spec.ts` covers the half that does not
depend on it — no session means a redirect to the login carrying the whole
request — and says so where the test would otherwise have gone.

## What a connector may do

The consent screen shows the same capability grid as the API Keys screen,
derived from the plugin config in [`lib/oauth/capabilities.ts`](../lib/oauth/capabilities.ts)
rather than restated — so adding a collection to the allowlist adds a row here
with no second edit, and the screen can never understate the real reach.

Approving writes a `payload-mcp-api-keys` document with **no bearer key
attached**: a capability record, reachable only through this grant's tokens.
That reuse is the main design decision in this layer, and it is what keeps the
blast radius small — the publish guard, the audit log, the per-capability
checkboxes and revoke-by-delete are all the existing implementations, with no
parallel path to keep in step.

### Publishing

**A grant may never publish, whatever role it acts as.** `refuseMcpPublish`
refuses a draft→published transition whenever the credential was a grant, and
unlike the API-key rule this one does not consult the user's role.

The reasoning: an API key is held by a person who put it in a config file on a
machine they control. A grant is approved once, on a phone, and then runs
unattended from a vendor's cloud over content that includes migrated articles an
attacker may have influenced. Those deserve different answers to "may this write
to the live site", and this is the one place the difference is expressible.
[`MCP_SERVER.md`](MCP_SERVER.md)'s Decision 2 still governs API keys.

## Security notes

Each of these is a decision rather than a default, and the tests under
[`tests/oauth/`](../tests/oauth) hold them:

- **PKCE S256 is mandatory** and `plain` is not implemented. A client that could
  negotiate `plain` could negotiate away the protection entirely.
- **Public clients only.** No client secret is issued, because a client running
  in somebody else's cloud cannot keep one — the metadata says
  `token_endpoint_auth_method: none` so nobody tries.
- **Redirect URIs are matched by exact string equality**, must be `https` (or
  loopback by literal address — `localhost` resolves through DNS and can be
  pointed anywhere), and may carry no fragment. Anything looser is an open
  redirect that hands out authorization codes.
- **An unvalidated redirect URI is never redirected to**, not even to report an
  error. Those cases get a dead-end page.
- **The authorization request is sealed, not hidden.** The consent form carries
  one signed opaque field rather than the OAuth parameters, so the POST cannot
  read a `redirect_uri` a user edited in the DOM. This doubles as the form's
  CSRF defence.
- **Nothing is stored in a replayable form.** Codes and both token kinds are
  kept as HMACs under `PAYLOAD_SECRET`, so rotating that secret revokes every
  connector — the same property the API keys already have.
- **Refresh tokens rotate, and a replay burns the grant.** A presented token the
  grant no longer holds means either a thief or a client that lost the rotation,
  and the two cannot be told apart — so access stops for both rather than
  continuing for one.
- **A replayed authorization code burns the grant** for the same reason.
- **The client name is attacker-controlled** and is escaped everywhere it is
  rendered. It is the one string on the consent page that anybody can choose,
  and it sits next to an Approve button on a page carrying an admin session.
- **Registration is unauthenticated**, as RFC 7591 open registration requires,
  and rate limited per source address. A registered client is worth nothing
  until a person approves it.

## Revoking

Three ways, in increasing order of blast radius:

| To disconnect…                      | Do this                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| one connector                       | delete its **OAuth Grant**, or its **API Key** capability record — either kills it |
| every connector a client ever had   | delete the **OAuth Client**                                                        |
| every connector _and_ every API key | rotate `PAYLOAD_SECRET`                                                            |

Deleting the capability record works because the grant's relationships are
nullable and Payload generates them `ON DELETE SET NULL`: the delete succeeds,
the grant is left pointing at nothing, and `resolveAccessToken` refuses it.
Making those columns `NOT NULL` would turn a revocation into a foreign-key
error, which is why they are not.

An access token already issued stays valid until it expires (one hour) unless
the grant is revoked, which takes effect on the next request.

## What is not built

- **CIMD** (client ID metadata documents), which the 2025-11-25 MCP revision
  prefers over dynamic registration. Registration is the documented fallback and
  the clients this exists for support it, so CIMD buys nothing yet — and it
  means fetching a URL the caller chose, which is SSRF surface this layer does
  not currently have.
- **Scopes beyond `mcp`.** The capability grid does the work scopes would, and
  it is enforced by machinery that already existed.
- **A grant listing for non-administrators.** An editor sees their own grants in
  the admin panel; there is no self-service page outside it.

## References

- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 — Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 — Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 8707 — Resource Indicators](https://datatracker.ietf.org/doc/html/rfc8707)
- [RFC 7009 — Token Revocation](https://datatracker.ietf.org/doc/html/rfc7009)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
