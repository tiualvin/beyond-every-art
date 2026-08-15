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
   does not stop anyone who already has it. Restrict ports 80 and 443 at the VPS
   firewall to [Cloudflare's published ranges](https://www.cloudflare.com/ips/),
   or use a Cloudflare Tunnel and stop exposing them at all. Skipping this leaves
   an attacker who recorded today's address able to bypass every one of the
   protections above.

7. **Keep `cms.beyondeveryart.com` unproxied, or proxied with care.** Payload
   Admin and the MCP endpoint live there. MCP is called by Anthropic's and
   OpenAI's servers, so anything that challenges or rate-limits non-browser
   clients will break it — see `docs/MCP_SERVER.md`.

## What this does not solve

Cloudflare protects the edge. It does nothing about the application-level
concerns already handled in the repo, and nothing about these:

- The in-process rate limiters reset when the container restarts, and there is
  one container. That is a deliberate trade (`lib/security/rate-limit.ts`), not
  an oversight, but it means a deploy clears every window.
- `/health` is exempt from the staging Basic Auth gate so uptime monitors can
  reach it, which means an anonymous caller can too. It is now a single
  `SELECT id FROM posts LIMIT 1` — constant time, whatever the archive grows to
  — rather than the `COUNT(*)` it used to run
  ([`lib/observability/health.ts`](../lib/observability/health.ts)). Still an
  uncached round-trip to Postgres from an anonymous caller, so the endpoint
  remains something the edge should absorb.
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
