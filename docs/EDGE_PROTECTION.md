# Edge Protection

> [!WARNING]
>
> **The origin is unprotected, and this is the largest open risk in the
> deployment.** Cloudflare holds the DNS for `beyondeveryart.com` but every
> record is set to **DNS only** — the grey cloud, not the orange one. Nothing
> filters, caches, or absorbs traffic in front of the VPS: every request lands
> on a €5 box, and the origin's IP address is published in DNS for anyone who
> looks.
>
> This must be closed before the public cutover. It is not closed by any change
> in this repository so far; the work below is written out and the image is
> built, but **it cannot be finished without a Cloudflare API token**, which is
> an operator action.

## Do not simply turn the proxy on

Switching a record to "Proxied" in the Cloudflare dashboard — one toggle, from a
phone, and tempting — **will break certificate renewal and take the site down**
when the current certificate expires.

Caddy proves it owns the domain over the **HTTP-01** challenge, which requires
Let's Encrypt to reach this server directly on port 80. Cloudflare's proxy
terminates the connection at their edge, so the challenge never arrives. The
certificate does not fail immediately — it fails at renewal, roughly 30 days
before expiry, quietly, and the first visible symptom is a browser warning on
the live site.

The proxy and the challenge method have to change **together**, in the order
below.

## Why it is worth doing

- **DDoS absorption.** Cloudflare's free tier includes unmetered L3/L4/L7
  mitigation. Today a single machine can saturate the VPS.
- **The origin IP stops being public.** Once proxied, DNS returns Cloudflare's
  addresses. An attacker who already recorded the current IP can still reach it
  directly, which is why the firewall step below matters.
- **Caching.** Static assets and images stop touching the app on every request.
  This is also what makes the `s-maxage` header on `/search/suggest` mean
  something: it is currently written for a shared cache that does not exist.
- **A real rate limiter.** The in-process limiters in `lib/security/rate-limit.ts`
  are per-container and bound abuse from one source; they are explicitly not a
  defence against a distributed attacker. Cloudflare's WAF is.

## What is already prepared

- `docker/caddy/Dockerfile` — Caddy built with `caddy-dns/cloudflare`, which is
  what lets it answer the DNS-01 challenge. Additive: with no Caddyfile change
  this image behaves exactly like the stock one.
- `TRUST_CLOUDFLARE_IP` — read by `clientKey()` in `lib/security/rate-limit.ts`.
  Until it is set, the rate limiters key on the last `X-Forwarded-For` hop,
  which is the peer Caddy actually accepted. `CF-Connecting-IP` is deliberately
  ignored while the proxy is off, because anyone can send that header when
  Cloudflare is not the one setting it.

Neither is wired into `docker-compose.yml`, on purpose: building Caddy from
source runs a Go toolchain on the production VPS, and `DEPLOYMENT_STATUS.md`
already notes CPU contention during the ~2–3 minute app build. Adopt the image
in its own quiet deploy, not during a cutover.

## The procedure

1. **Create a Cloudflare API token.** Scope it to `Zone → DNS → Edit` for this
   zone only. Not the Global API Key — that credential can do anything to the
   account. Put it in the production `.env` as `CLOUDFLARE_API_TOKEN`, and never
   in git.

2. **Switch the Caddy service to the custom image**, and deploy that alone.
   Confirm the site still serves normally — at this point nothing has changed
   behaviour, which is the entire point of doing it as a separate step.

   ```yaml
   caddy:
     build:
       context: .
       dockerfile: docker/caddy/Dockerfile
   ```

3. **Move both site blocks to DNS-01**, passing the token through to Caddy.
   In `docker-compose.yml`, add it to the `caddy` service's environment; in the
   `Caddyfile`, add to each site block:

   ```
   tls {
     dns cloudflare {env.CLOUDFLARE_API_TOKEN}
   }
   ```

   Deploy, then confirm Caddy has issued certificates through the new challenge
   before going further: `docker compose logs caddy | grep -i "certificate obtained"`.
   Forcing a renewal is the honest test — an existing certificate will keep
   working regardless of whether the new challenge is functioning.

4. **Only now, turn on the orange cloud** for the site record in Cloudflare.
   Set SSL/TLS mode to **Full (strict)**; anything less lets the edge accept an
   invalid origin certificate, and "Flexible" sends plain HTTP to the origin.

5. **Set `TRUST_CLOUDFLARE_IP=1`** in the production `.env`, so the rate limiters
   key on the real visitor rather than on Cloudflare's edge address. Getting this
   wrong in the other direction is worse than leaving it unset: every visitor
   would share a handful of buckets and throttle each other.

6. **Close the origin to direct traffic.** Proxying hides the IP from DNS but
   does not stop anyone who already has it — and this address has been public
   since July. Skipping this leaves an attacker who recorded it able to bypass
   every one of the protections above. The procedure is
   ["Closing the origin"](#closing-the-origin) below.

7. **Keep `cms.beyondeveryart.com` unproxied, or proxied with care.** Payload
   Admin and the MCP endpoint live there. MCP is called by Anthropic's and
   OpenAI's servers, so anything that challenges or rate-limits non-browser
   clients will break it — see `docs/MCP_SERVER.md`.

   Note what that hostname used to mean for the rules on the site's address.
   The `Caddyfile` refuses `/api*` and `/admin*` on the public hostname, with a
   careful paragraph explaining why `?limit=0` makes an anonymous collection
   read worth refusing — and then served the same application, with the same
   endpoints, unconditionally on this one. Both names point at the same VPS, so
   `GET /api/posts?limit=0` was refused on one address and answered on the
   other. A rule that holds on one of two public hostnames is not a rule. The
   CMS vhost now refuses `/api*` for requests carrying no credential at all,
   allowing through the endpoints that must answer without one: `/api/mcp`, the
   auth routes, `/api/access`, `/api/media/file/*`, and `/api/preview*`. It is a
   credential-_presence_ check, not authentication — Payload still decides
   whether a session or key is valid. What it removes is the anonymous case,
   which is the one that reaches Postgres before anything is checked.

## Closing the origin

Step 6 above, written out, because the obvious way to do it does not work.

### `ufw` cannot do this

`docker-compose.yml` publishes Caddy's ports as `80:80` and `443:443`. Docker
implements a published port by writing its own `iptables` rules, and those are
evaluated **before** the `INPUT` chain that `ufw` manages. So `ufw deny 80/tcp`
reports success, `ufw status` lists the port as denied, and the port stays open
to the entire internet. The rule is not wrong; it is never reached.

Only two placements actually filter traffic to a published container port: a
firewall **outside** the machine, or rules in Docker's own `DOCKER-USER` chain.

`postgres` and `app` need no rule either way — they publish to `127.0.0.1`, so
they are already unreachable from outside the host. Caddy is the only service
exposed, which is what makes this a small change.

### Preferred: the Hetzner Cloud Firewall

Free, applied in Hetzner's network before packets reach the server, and
therefore impossible for Docker to bypass. A mistake is also recoverable from
the web console rather than requiring the SSH access the mistake just removed.

Cloud servers only. A Robot/dedicated machine has no such firewall and needs
the `DOCKER-USER` rules below instead. If the server appears in the project
list at `console.hetzner.cloud`, it is a Cloud server.

1. `console.hetzner.cloud` → the project → **Firewalls** → **Create Firewall**.
2. Add three inbound rules. Anything not listed is denied; leave the outbound
   rules alone, or the deploy loses its own network access.

   | Protocol | Port | Source                                      |
   | -------- | ---- | ------------------------------------------- |
   | TCP      | 22   | Any, or an address that is definitely yours |
   | TCP      | 80   | Cloudflare's IPv4 **and** IPv6 ranges       |
   | TCP      | 443  | Cloudflare's IPv4 **and** IPv6 ranges       |

   The ranges are published as plain text at
   [cloudflare.com/ips-v4](https://www.cloudflare.com/ips-v4) and
   [cloudflare.com/ips-v6](https://www.cloudflare.com/ips-v6): around twenty
   entries in total, comfortably inside Hetzner's per-rule limit.

3. Attach it to the server under **Apply to**, and create. Rules take effect
   immediately.

**Both address families, or neither.** Caddy listens on `0.0.0.0` and `::`, and
Cloudflare reaches an origin over whichever family the DNS record offers. Allow
only the IPv4 ranges while an `AAAA` record exists and Cloudflare will arrive
over IPv6 and be dropped — a site that is down behind a firewall that reads as
correct.

**Port 22 is the way back in.** Add that rule before attaching the firewall, and
confirm a fresh SSH session still works before closing the one already open.
Restricting it to a single address is better than `Any`, but only where that
address is genuinely static; a dynamic one locks the operator out on the next
lease. Leaving it open is no worse than today's exposure — though it is worth
reading alongside `DEPLOYMENT_STATUS.md`'s note that root SSH still accepts
password authentication, which matters rather more once this is the only
unrestricted port left.

### Fallback: the `DOCKER-USER` chain

For a machine with no cloud firewall in front of it. `DOCKER-USER` is the one
chain Docker leaves to the operator and consults before its own rules, so it is
the only in-machine placement that holds.

Allow each Cloudflare range to reach 80 and 443, then drop the rest — and write
the same rules with `ip6tables` for the IPv6 list. They do not survive a reboot
on their own; `netfilter-persistent save` (from `iptables-persistent`) is what
keeps them. Nothing here should touch port 22: SSH is a host service, reached
through `INPUT`, and is not affected by `DOCKER-USER` at all.

### Confirm it, from outside

A firewall is only believed once the thing it forbids actually fails. From a
machine that is not the VPS, with the site up through Cloudflare:

```bash
curl -I --connect-timeout 10 http://<origin-ip>     # must time out
curl -I --connect-timeout 10 https://<origin-ip>    # must time out
curl -sI https://www.beyondeveryart.com | head -1   # must still be 200
```

A response to either of the first two means the rules are not being reached —
on a Docker host, almost always because they were written where `ufw` put them.

### Order

After step 4, not before. Restricting port 80 removes the HTTP-01 challenge's
route to the server, so doing this while Caddy still renews over HTTP-01 breaks
renewal — silently, and visibly only weeks later, which is the same failure this
document opens by warning about. Once step 3 has moved issuance to DNS-01,
port 80 carries nothing but redirects to HTTPS and can be closed freely.

## What this does not solve

Cloudflare protects the edge. It does nothing about the application-level
concerns already handled in the repo, and nothing about these:

- The in-process rate limiters reset when the container restarts, and there is
  one container. That is a deliberate trade (`lib/security/rate-limit.ts`), not
  an oversight, but it means a deploy clears every window.
- `/health` is exempt from the staging Basic Auth gate so uptime monitors can
  reach it, which means an anonymous caller can too. It is now a single
  `SELECT slug FROM posts LIMIT 1` — constant time, whatever the archive grows
  to — rather than the `COUNT(*)` it used to run
  ([`lib/observability/health.ts`](../lib/observability/health.ts)). Still an
  uncached round-trip to Postgres from an anonymous caller, so the endpoint
  remains something the edge should absorb; until it does, it is rate limited
  per address (`RATE_LIMIT_HEALTH_PER_MINUTE`, 60).
- `/csp-report` is rate limited the same way
  (`RATE_LIMIT_CSP_REPORT_PER_MINUTE`, 60), and always answers 204 either way so
  a prober learns nothing from being throttled. The cap is there because an
  accepted report costs a log line and the log file is rotated: a flood could
  otherwise push genuine violations out of the window during exactly the
  report-only phase when they are the only evidence there is.
- Media is served by Node from local disk (`useR2` is false — no object storage
  is configured). Every image occupies an app worker. Caching at the edge hides
  this rather than fixing it; moving media to R2 is the actual fix, and R2 has
  no egress charge.
- **Uploads through the admin panel are capped in the application, not at the
  edge.** Payload v3's `UploadConfig` has no size option, so `collections/Media.ts`
  can restrict the format and nothing else, and an upload was once bounded only
  by disk. `refuseOversizedUpload` in [`lib/security/uploads.ts`](../lib/security/uploads.ts)
  now runs in `beforeOperation` — before Payload reads `req.file` — and refuses
  anything over 25MB with a `413`, tunable with `MEDIA_MAX_UPLOAD_MB`. The MCP
  path keeps its own lower ceiling of 8MB, because those bytes arrive as base64
  through a model's context.

  That bounds what gets **stored**, not what a stranger can make the server
  **receive**: the bytes have already been buffered by the time a collection
  hook runs. The real defence is still a request body limit in front of
  Payload's route — Caddy's `request_body max_size` on `/api/media*` is the
  obvious place — once the Cloudflare work above settles what sits in front of
  the origin.

- **Backups are unencrypted.** `pg_dump | gzip` uploads to R2 as-is, and the
  dump contains the whole `members` archive: addresses, Stripe customer and
  subscription identifiers, internal notes, engagement statistics. Retention is
  bounded and the bucket is credentialed, but that is personal data at rest in
  the clear. The same `S3_*` credentials serve media and backups, so one leaked
  key exposes both — `BACKUP_S3_BUCKET` already exists to separate the buckets,
  and separate credentials should follow.
