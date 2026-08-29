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
> This must be closed before the public cutover. The repository now carries
> everything it can: the image is built and in use, and the challenge switch is
> a single variable. What remains is operator work in the production `.env` and
> the Cloudflare and Hetzner dashboards — steps 1 and 3 through 6 below.

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

Both are wired into `docker-compose.yml` now, along with `CADDY_ACME` and
`CLOUDFLARE_API_TOKEN`, and all of it is inert until those variables are set —
which is the point. What is left is configuration.

The image is no longer compiled on the VPS. That was the original plan's one
bad assumption: building Caddy with this module set pulls in the AWS, GCP and
Smithy SDKs, and on a 4GB machine the Go link step ran for seventeen minutes
without finishing and killed the deploy on its own timeout. CI builds it in
under a minute and publishes it; the server pulls a few megabytes. The
`build:` section stays as a fallback so a machine that cannot reach the
registry still comes up — slowly, and saying so in the log.

**This server is arm64** (a Hetzner CAX) and the runner that builds is amd64.
The first attempt published an amd64-only image, which could not execute here
at all: the container exec-failed and restarted forever, the site answered
nothing on 80 or 443, and the deploy reported success. The image is a manifest
list covering both architectures now, built by cross-compiling rather than
emulating — the builder stage is pinned to the runner's own platform and Go
emits the foreign binary at native speed.

The deploy also asserts that Caddy is _running_ fifteen seconds after the
containers are replaced. Nothing else could see it: the service has no
healthcheck, Compose treats a service without one as ready the moment it is
running — which a container that starts and immediately exits satisfies for
just long enough — and the post-deploy health probe fetches `/health` from
inside the app container, so it never crosses the proxy.

## The procedure

1. **Create a Cloudflare API token.** Scope it to `Zone → DNS → Edit` for this
   zone only. Not the Global API Key — that credential can do anything to the
   account. Put it in the production `.env` as `CLOUDFLARE_API_TOKEN`, and never
   in git. `docker-compose.yml` already passes it through to the `caddy`
   service, so nothing else has to change to make it readable; nothing reads it
   either until step 3.

> [!IMPORTANT]
> **One-time: make the published Caddy image public.**
>
> CI builds the image and pushes it to
> `ghcr.io/tiualvin/beyond-every-art-caddy`, and the VPS pulls it anonymously.
> **Images published to GHCR are private until someone changes that**, so until
> this is done every deploy falls back to compiling Caddy on the server — which
> takes about seventeen minutes there and is what killed the 2026-08-27 deploy.
>
> On GitHub: the repository's **Packages** (or your profile's Packages) →
> `beyond-every-art-caddy` → **Package settings** → **Change visibility** →
> **Public**. The image is upstream Caddy plus a public DNS plugin; it carries
> no configuration and no credentials.
>
> The deploy log says which path it took — look for the
> `WARNING: could not pull the Caddy image` line. Authenticating the host to
> `ghcr.io` instead of making the package public works too; the point is that
> one of the two has to be true.
>
> **If `CADDY_IMAGE` is set in the production `.env`, remove it.** It was added
> on 27 Aug to pin the server to a locally built image, after a published
> amd64-only one could not run on this arm64 host. The published image covers
> both architectures now, so the pin only keeps the server on whatever it built
> last.

2. **Switch the Caddy service to the custom image** — **done (#103)**.
   `docker-compose.yml` builds `caddy` from `docker/caddy/Dockerfile`, and the
   module sat unused behind it for weeks, which is exactly what this step was
   for: the image and the challenge change never share a deploy, so a site that
   stops serving has one suspect rather than two.

3. **Move every site block to DNS-01** — **done (29 Aug)**. See "How DNS-01 was
   actually proven" below; the short version is that the obvious tests all pass
   without exercising the credential once. This is one line in the production
   `.env`, not an edit to tracked files:

   ```
   CADDY_ACME=acme-cloudflare
   ```

   The `Caddyfile` defines two snippets — `acme-default` (empty, which is
   HTTP-01, Caddy's own behaviour) and `acme-cloudflare` (the `tls` block with
   the Cloudflare DNS provider) — and every site block imports whichever
   `CADDY_ACME` names. All three blocks move together, the redirect host
   included: it holds a certificate of its own, and leaving it on HTTP-01 breaks
   _its_ renewal the moment the proxy goes on.

   Validate before deploying, because the `deploy` job checks the app's health
   from inside the app container and would not notice Caddy failing to start:

   ```bash
   docker compose exec caddy caddy validate \
     --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   Then deploy and confirm a certificate has been obtained through the new
   challenge before going further:
   `docker compose logs caddy | grep -i "certificate obtained"`.
   Forcing a renewal is the honest test — an existing certificate will keep
   working regardless of whether the new challenge is functioning.

   > [!NOTE]
   > Leave `CADDY_ACME` blank to stay on HTTP-01; blank and absent both resolve
   > to `acme-default`. That is handled in `docker-compose.yml` with `:-` rather
   > than left to the Caddyfile, and the difference is not cosmetic: Caddy's own
   > `{$VAR:default}` falls back only when a variable is **unset**, so a
   > `CADDY_ACME=` line would adapt to a bare `import` and Caddy would refuse to
   > start at all. A typo'd snippet name fails the same way — hence the
   > validate step above.

4. **Only now, turn on the orange cloud** for the site record in Cloudflare —
   **done for `staging` (29 Aug)**. Set SSL/TLS mode to **Full (strict)** first;
   anything less lets the edge accept an invalid origin certificate, and
   "Flexible" sends plain HTTP to the origin, which Caddy redirects back to
   HTTPS — a loop.

   **Verify from somewhere that is not this server.** A box curling its own
   public hostname is the least reliable place to ask whether a proxy sits in
   front of it: the VPS held the pre-proxy address in its resolver cache and
   kept answering itself directly long after the toggle took effect, which reads
   exactly like a toggle that did not work. From a laptop:

   ```bash
   curl -sSI https://staging.beyondeveryart.com/ | grep -iE 'cf-ray|^server'
   dig +short staging.beyondeveryart.com
   ```

   `cf-ray` and `server: cloudflare` are the facts; Cloudflare adds both to
   every proxied response. Do not grep a truncated header dump — in HTTP/2 the
   headers are lowercase and `cf-ray` sorts late, so `head -5` hides it.

5. **Set `TRUST_CLOUDFLARE_IP=1`** in the production `.env`, so the rate limiters
   key on the real visitor rather than on Cloudflare's edge address. Getting this
   wrong in the other direction is worse than leaving it unset: every visitor
   would share a handful of buckets and throttle each other.

   `docker compose up -d app` may print `Running` rather than `Started` and
   leave the container untouched, because it does not always treat an `env_file`
   edit as a reason to recreate. Confirm the value is actually inside the
   container rather than only in the file:

   ```bash
   docker compose exec app printenv TRUST_CLOUDFLARE_IP   # want: 1
   docker compose up -d --force-recreate app              # if it is not
   ```

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

## How DNS-01 was actually proven

Worth writing down, because every obvious test passed while the Cloudflare
credential had not been exercised once. The failure this guards against is
silent for sixty days and then presents as a browser warning.

**What proved nothing:**

- **`caddy validate` passing.** It parses the config. It does not call
  Cloudflare.
- **The site still serving 200 after the switch.** The existing certificate
  keeps working regardless of which challenge is configured — that is the whole
  reason this is dangerous.
- **Deleting a certificate and watching Caddy re-issue it.** This looked like
  the honest test and is not. Let's Encrypt caches a _valid authorization_ per
  account and identifier for about 30 days, so a new order for a hostname
  validated recently is created already-authorized: no challenge runs at all.
  The tell is the timing — issuance completed in **three seconds** with no line
  mentioning a challenge, a TXT record, or Cloudflare. A DNS-01 challenge cannot
  finish that fast; it has to write a record and wait for it to be visible.

**What did prove it**, in two parts.

First, the credential, against Cloudflare's API directly — this isolates the
question and takes seconds. Token validity, zone visibility, and then the part
that matters, because read access passes the first two and fails every renewal:

```bash
TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' .env | cut -d= -f2-)
ZONE=<zone id from the zones call>

# create a throwaway TXT record — the exact permission DNS-01 needs
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"_acme-permission-check","content":"dns-01 write test","ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
# then DELETE it by the returned id
```

The token only ever travels in a header, never through `echo`.

Second, a real challenge, using a hostname Let's Encrypt has **no cached
authorization for**. `SITE_REDIRECT_FROM` is already a site block, so this needs
no code change and no DNS record — DNS-01 does not require the name to resolve
to this server:

```bash
echo 'SITE_REDIRECT_FROM=www.beyondeveryart.com' >> .env
docker compose up -d caddy
docker compose logs -f caddy
# then revert: sed -i '/^SITE_REDIRECT_FROM=/d' .env && docker compose up -d caddy
```

The lines that constitute proof:

```
trying to solve challenge   challenge_type: "dns-01"
authorization finalized     authz_status: "valid"
certificate obtained successfully
```

Nine seconds between the first and second — a TXT record written, propagated,
and read back. Revert the variable afterwards: it means something different at
cutover, when it becomes the apex redirecting to the canonical host. The
certificate stays in storage, which is one fewer thing to obtain on the day.

### A known error the switch introduces

Selecting `acme-cloudflare` makes Caddy retry a public certificate for
`redirect-disabled.localhost` — the placeholder host used when
`SITE_REDIRECT_FROM` is unset — forever, with backoff:

```
[redirect-disabled.localhost] Obtain: subject 'redirect-disabled.localhost'
does not qualify for a public certificate
```

This corrects reasoning previously written here and in #107, which held that
non-public names are unaffected because Caddy issues those from its internal CA
regardless of the configured issuer. **It does not.** Naming an explicit ACME
issuer in a `tls` block overrides the automatic internal-CA selection, so a
`.localhost` subject gets an ACME attempt that can never succeed.

It is noise rather than breakage: real certificates are unaffected, the site
serves, and the retry backs off. It disappears when `SITE_REDIRECT_FROM` is set
to a real hostname at cutover. A proper fix would give that block `tls internal`
when the name cannot hold a public certificate.

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

Do it in two passes. The firewall is worth having before Cloudflare exists —
it closes every port that is not one of the three below — and the sources
cannot be narrowed to Cloudflare until Cloudflare is actually the one
connecting. Narrowing them early blocks the real visitors instead.

**Pass one — done, 24 Aug.** `console.hetzner.cloud` → the project →
**Firewalls** → **Create Firewall**, three inbound rules, `Any IPv4` and
`Any IPv6` as the source of each:

| Protocol | Port | Source | Why                                      |
| -------- | ---- | ------ | ---------------------------------------- |
| TCP      | 22   | Any    | SSH, including the deploy workflow's     |
| TCP      | 80   | Any    | HTTP→HTTPS redirect, and HTTP-01 renewal |
| TCP      | 443  | Any    | the site                                 |

Leave the outbound rules empty — adding one switches outbound from
allow-everything to allow-only-these, and the deploy loses its own network
access. Attach it under **Apply to**, and create; rules take effect
immediately.

Port 80 is not optional in this pass. Certificates still renew over HTTP-01
until step 3 of the procedure above changes that, and a firewall without port
80 breaks renewal in the silent, six-weeks-later way this document opens by
warning about.

**Pass two — after step 4, once the proxy is on.** Edit only the port 80 and
443 rules and replace `Any` with Cloudflare's ranges, published as plain text
at [cloudflare.com/ips-v4](https://www.cloudflare.com/ips-v4) and
[cloudflare.com/ips-v6](https://www.cloudflare.com/ips-v6) — around twenty
entries in total, comfortably inside Hetzner's per-rule limit. **Both lists go
into both rules.** This is the pass that actually closes the origin; pass one
only removes the ports nothing was serving.

**Both address families, or neither.** In pass two: Caddy listens on `0.0.0.0`
and `::`, and Cloudflare reaches an origin over whichever family the DNS record
offers. Allow only the IPv4 ranges while an `AAAA` record exists and Cloudflare
will arrive over IPv6 and be dropped — a site that is down behind a firewall
that reads as correct.

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

### Confirm pass one, from outside

The opposite of the pass-two check below: everything must answer. Run it
straight after attaching the firewall, because both ports failing closed is
silent — the Compose healthcheck runs inside the container, where no firewall
applies, so the deploy stays green while the site is unreachable.

```bash
curl -I --connect-timeout 10 http://<origin-ip>
# HTTP/1.1 308 Permanent Redirect, Server: Caddy

curl -I --connect-timeout 10 https://staging.beyondeveryart.com
# HTTP/1.1 200, or 401 from the staging Basic Auth gate
```

Read curl's exit code rather than the word "error", because the two failures
mean opposite things:

| Result                            | Meaning                                             |
| --------------------------------- | --------------------------------------------------- |
| `(28) Timeout was reached`        | the port is shut — a rule is missing or narrowed    |
| `(35) tlsv1 alert internal error` | the port is **open**; TLS just had nothing to serve |

The second is the expected answer to `https://<origin-ip>`, and is not a
failure. Connecting by address sends no SNI, and Caddy holds certificates for
three named hosts and no catch-all, so it cannot choose one and closes the
handshake. Test HTTPS by hostname, where the name selects the certificate.

A timeout on port 80 here is the important one to catch. Certificates still
renew over HTTP-01 until step 3, so a firewall that omits port 80 — or narrows
it to Cloudflare before Cloudflare is in front — breaks renewal in the silent,
weeks-later way this document opens by warning about.

### Confirm pass two, from outside

After pass two only — during pass one every one of these answers, which is the
point. A firewall is only believed once the thing it forbids actually fails.
From a machine that is not the VPS, with the site up through Cloudflare:

```bash
curl -I --connect-timeout 10 http://<origin-ip>     # must time out
curl -I --connect-timeout 10 https://<origin-ip>    # must time out
curl -sI https://www.beyondeveryart.com | head -1   # must still be 200
```

A response to either of the first two means the rules are not being reached —
on a Docker host, almost always because they were written where `ufw` put them.

### Order

Pass one stands alone and is already done. Pass two belongs after step 4, not
before: narrowing the sources to Cloudflare while requests still arrive
straight from browsers blocks the visitors, and narrowing port 80 while Caddy
still renews over HTTP-01 breaks renewal silently. Once step 3 has moved
issuance to DNS-01 and step 4 has put the proxy in front, both are safe and
port 80 carries nothing but redirects to HTTPS.

One consequence of pass one worth knowing: ICMP is not among the three rules,
so the server no longer answers `ping`. That is expected, not a symptom.

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
- Media is served by Node out of R2, not off local disk — R2 was configured on
  22 Aug (`DEPLOYMENT_STATUS.md` item 0.4). `S3_PUBLIC_URL` is deliberately
  empty, so Payload streams each file from `/api/media/file/<name>` rather than
  handing out a bucket URL, and every image still occupies an app worker for the
  length of the transfer. Caching at the edge is what removes that; a public
  bucket on a custom domain is the alternative, and it is the reason media and
  backups are in separate buckets.
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
