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
- **A connector publishes only where it was granted that and its user is an
  administrator.** Two gates, neither implying the other, and the capability is
  never pre-ticked on the consent screen — see
  [Publishing](#publishing--reversed-narrowly). This reverses an earlier
  "never", deliberately and for a stated reason.
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

### Publishing — reversed, narrowly

**This section used to say a grant may never publish. It now may, under two
conditions that have to hold together.** The reversal was asked for by the
repository owner, for the case the OAuth layer exists to serve: drafting and
publishing from a phone. It is recorded here as a reversal rather than edited
into looking like the original decision, because the reasoning it replaced is
still true and still the reason the conditions are what they are.

**What has not changed:** a grant is the least supervised credential this
project issues. It runs from a vendor's cloud, over content that includes
migrated articles an attacker may have influenced, and `/oauth/register` is
unauthenticated by design (RFC 7591) — anybody can present a connector for
approval. An API key, by contrast, is held by a person who put it in a config
file on a machine they control.

**What changed:** the answer to that is no longer "never". It is two
independent gates, and `mayPublish` requires both:

| Gate                                  | Where it is decided                                      | What it stops                                                                                              |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The grant's `publish.live` capability | the consent screen, per connector, per approval          | a connector nobody deliberately trusted — including one that registered itself and was approved in a hurry |
| The bound user's role is `admin`      | [`access/roles.ts`](../access/roles.ts), as for API keys | a connector approved by an editor, whatever its capability says                                            |

Neither is derived from the other, and that is the point. "May this person
publish" and "did anybody decide _this connector_ should" are different
questions; an administrator connecting a phone has not thereby decided the
phone may publish. They decide that by ticking a box that is **never
pre-ticked**, for one connector at a time.

The capability is stored on the same `payload-mcp-api-keys` document the
consent screen already writes, so revoking it is deleting that document — the
revocation path that already existed, unchanged. The column defaults to
`false`, so every grant approved before this shipped keeps drafting and
nothing is retroactively widened.

**What this does not gate, honestly stated.** A publish may carry content
changes in the same call — a single tool call can write a body and make it
live. That was a deliberate choice: the alternative, restricting a publish to
a bare status flip, would have made an injected instruction able to promote
only text a person had already written and reviewed. It was considered and
declined in favour of fewer round trips from a phone. So the containment for
prompt injection now rests on the two gates above, on the alert below, and on
not pointing a publishing connector at read-then-write work over migrated
articles.

**Every connector publish alerts, immediately.** `recordMcpConnectorPublish`
posts to `ALERT_WEBHOOK_URL` on each one — no threshold and no cooldown,
unlike the failed-authentication alarm, because one is interesting and a
cooldown would hide the second. It names the collection and document and says
how to revoke; it does not carry the connector's name, which is chosen by
whoever registered and would be attacker-controlled text arriving in a chat
room. `mcp_auth` records the client per request, which is where an
investigation should get it. Unset `ALERT_WEBHOOK_URL` and none of this is
sent — which also means a deployment that wants connector publishing should
set it.

[`MCP_SERVER.md`](MCP_SERVER.md)'s Decision 2 still governs API keys, and is
unchanged: an admin-bound key publishes, an editor-bound one does not.

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
  read a `redirect_uri` a user edited in the DOM. The seal also names the user
  it was rendered for and the POST refuses a mismatch, so it cannot be obtained
  by one account and spent in another's browser. It is _not_ the CSRF defence —
  an earlier version of this document said it was. A seal is a bearer value, not
  a per-session token; what stops a forged cross-site POST is Payload's
  `SameSite=Lax` session cookie and its `csrf` origin allowlist.
- **The consent page refuses to be framed.** `X-Frame-Options: DENY` and
  `frame-ancestors 'none'` are set on the response itself rather than left to
  the site-wide policy, which is report-only until `CSP_MODE=enforce` and which
  omits `X-Frame-Options` globally for Live Preview's sake. Neither reason
  applies to a page with an Approve button on it.
- **Nothing is stored in a replayable form.** Codes and both token kinds are
  kept as HMACs under `PAYLOAD_SECRET`, so rotating that secret revokes every
  connector — the same property the API keys already have.
- **Refresh tokens rotate, and a replay burns the grant.** The grant remembers
  one generation back (`previousRefreshTokenHash`), which is what makes replay
  detectable at all: without it a rotated-away token hashes to a value no row
  holds, so presenting a stolen secret is indistinguishable from presenting a
  made-up one and the grant carries on serving the thief. Matching the
  superseded hash means the secret leaked, so everything issued under that grant
  stops — including the pair the rotation just produced, which is what a thief
  would be holding.
- **A replayed authorization code burns the grant** for the same reason. The
  code hash is deliberately kept after redemption rather than nulled; nulling it
  looked tidy and quietly disabled this, because the replayed code then matched
  no row.
- **A grant has an absolute lifetime of ninety days**, set at consent and never
  extended by a refresh. Rotation alone gives a stolen chain an indefinite life,
  since every refresh pushes the expiry out again. The cost is real and stated
  here rather than left as a surprise: **a connector stops working after ninety
  days until somebody approves it again**, and an unattended one will simply
  stop. See [Revoking](#revoking) for what that looks like.
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

Grants also expire on their own after ninety days, whatever their tokens say.
When that happens the connector's next refresh fails with `invalid_grant` and
the client asks to be authorized again — reconnect it and approve the consent
screen. Nothing is lost; a new grant replaces the old one. If a scheduled task
goes quiet, this is the first thing to check.

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
