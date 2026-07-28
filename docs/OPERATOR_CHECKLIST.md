# Operator Checklist

Everything that needs a human, in dependency order, from where the project
stands today to a live cutover.

This is a **sequencing and copy-paste** document. It does not restate the
procedures in [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md),
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md), or
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) — it tells you when to open
them and what to have ready first. Status lives in
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md).

## Already done — do not redo

- VPS provisioned, Docker installed, repo cloned, `.env` configured.
- `postgres`, `app`, `caddy`, `backup` all run under `docker compose`.
- Auto-deploy on merge to `main`, verified end to end.
- Ghost export dry runs clean: 117 posts, 2 pages, 10 tags, 2 authors,
  0 duplicate slugs, 0 missing authors/tags, 1 redirect planned.

## Where commands run

Each block is labelled. Getting this wrong is the most common way to waste an
hour.

| Label       | Where                                           |
| ----------- | ----------------------------------------------- |
| **[vps]**   | SSH session on the VPS, in the deploy directory |
| **[dns]**   | Your DNS provider's web console                 |
| **[gh]**    | GitHub web UI                                   |
| **[local]** | Your own machine, in a clone of this repo       |

---

## Step 0 — Preflight (5 min, do this first)

**[vps]**

```bash
ssh root@YOUR_VPS_IP
cd /path/to/deploy          # your VPS_DEPLOY_PATH

docker compose ps           # expect: postgres, app, caddy, backup — all up
test -f .env && echo ".env present" || echo ".env MISSING"
node -v                     # expect v20+
pnpm -v                     # expect a version
df -h /                     # expect comfortable free space
```

**If `node` or `pnpm` is missing, stop and fix that first.** The migration
scripts cannot run inside the `app` container — its image contains only the
compiled Next.js server, not `scripts/` or the dev toolchain. They run from the
repo checkout on the VPS host, connecting to Postgres through the
`127.0.0.1:5432` port that `docker-compose.yml` deliberately exposes.

To install, on the VPS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -   # Debian/Ubuntu
apt-get install -y nodejs
corepack enable
```

Then, in the repo checkout on the VPS: `pnpm install --frozen-lockfile`.

- [ ] All four services up
- [ ] `.env` present
- [ ] Node 20+ and pnpm available on the host
- [ ] Dependencies installed in the checkout

---

## Step 1 — Staging DNS and TLS

Unblocks everything else. Nothing downstream can start until this is done.

**Do not point the apex domain at the VPS.** `beyondeveryart.com` still serves
live Ghost, and `AGENTS.md` requires Ghost stays up until every cutover gate
passes. Use a staging subdomain.

### 1a. Edit `.env` — **[vps]**

```bash
nano .env
```

These keys already exist with empty values — **edit them in place**, do not
append duplicates:

```
NEXT_PUBLIC_NOINDEX=1
STAGING_BASIC_AUTH=someuser:somelongpassword
SITE_ADDRESS=staging.beyondeveryart.com
NEXT_PUBLIC_SITE_URL=https://staging.beyondeveryart.com
NEXT_PUBLIC_SERVER_URL=https://staging.beyondeveryart.com
PAYLOAD_PUBLIC_SERVER_URL=https://staging.beyondeveryart.com
```

Save with `Ctrl+O`, `Enter`, `Ctrl+X`. Using an editor rather than
`echo >>` keeps the Basic Auth password out of your shell history.

Rules that bite if broken:

- `SITE_ADDRESS` is a **bare hostname** (Caddy site block, no scheme).
- The other three are **full origins**, `https://`, **no trailing slash**.
- All three origins must be **byte-identical**. Live Preview embeds that origin
  in an iframe and only trusts save messages from it, and the draft-mode cookie
  only returns if they match. A mismatch shows up as preview silently not
  updating — an hour of confusion for one stray character.

### 1b. Add the DNS record — **[dns]**

- Type `A`, name `staging`, value your VPS IPv4, TTL `300`.
- Add `AAAA` **only** if the VPS actually serves IPv6. A resolving AAAA that
  does not answer makes Let's Encrypt fail issuance.

### 1c. Wait for resolution — **[vps]**

```bash
dig +short staging.beyondeveryart.com     # must return your VPS IP
```

Do not proceed until it does. Restarting early means Caddy's first ACME attempt
fails and backs off, and you will read a confusing error.

Ports 80 and 443 must be open to the internet. **Port 80 is not optional** —
the ACME HTTP-01 challenge uses it.

### 1d. Restart — **[vps]**

```bash
docker compose up -d
```

A restart is sufficient; no rebuild is needed. Every `NEXT_PUBLIC_*` read in
this codebase is server-side, so the values are picked up from the runtime
environment.

### 1e. Verify — **[vps]**

```bash
curl -I http://staging.beyondeveryart.com                    # 308 → https
curl -I https://staging.beyondeveryart.com                   # 401
curl -I -u someuser:somelongpassword https://staging.beyondeveryart.com   # 200
curl -s https://staging.beyondeveryart.com/health            # {"status":"ok","db":"up"}
docker compose logs caddy | tail -30                         # certificate obtained
```

`/health` is exempt from the Basic Auth gate by design, so it answers without
credentials.

- [ ] HTTPS serves a valid certificate
- [ ] Basic Auth challenges anonymous requests
- [ ] `/health` reports `db: up`

---

## Step 2 — Rehearsal

Follow [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) from §1. Step 1 above
completed its §0.

Have ready before starting:

- [ ] Ghost content + settings JSON export
- [ ] `redirects.json`
- [ ] **Members CSV** — exported separately from Ghost Admin
      (Members → Settings → Export all members). It is _not_ in the site
      archive, and this is the item most likely to stall you.
- [ ] The complete media archive

Keep all of it out of git — `.gitignore` already blocks it.

The command sequence, run from the repo checkout — **[vps]**:

```bash
pnpm bootstrap:admin                       # one administrator, then unset the vars
pnpm migrate:ghost     --dry-run --input ghost-export/ghost-content.json
pnpm migrate:ghost               --input ghost-export/ghost-content.json
pnpm migrate:redirects           --input ghost-export/redirects.json
pnpm migrate:members             --input ghost-export/ghost-members.csv
pnpm migrate:validate            --input ghost-export/ghost-content.json
```

Read each importer's JSON report before running the non-dry pass.
`migrate:validate` must report `"ok": true` — fix the root cause and re-run
rather than proceeding.

Then, still in the rehearsal doc: §4 manual checklist, §5 backup and restore,
§6 crawl comparison, §7 sign-off.

- [ ] §3 validate reports `"ok": true`
- [ ] §4 manual checklist complete
- [ ] §5 backup uploads and a restore reproduces content
- [ ] §6 crawl comparison shows no unexpected 404s or lost metadata
- [ ] §7 every problem logged, fixed, re-verified

---

## Step 3 — Review CSP reports

Runs alongside the rehearsal; it needs real traffic and real migrated content,
which the rehearsal produces.

The policy ships in report-only mode and blocks nothing. See
[`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md).

**[vps]**

```bash
docker compose logs app | grep csp_violation
```

While the site is up, exercise the surfaces the automated suite cannot: log into
`/admin`, edit a post, open Live Preview at all three breakpoints, upload an
image, run a search, submit the newsletter form, and open several **migrated**
articles that contain embeds.

Collect every distinct `frame-src` violation — those are your provider embeds.
Put them in `.env` before enforcing:

```
CSP_FRAME_SRC=https://www.youtube-nocookie.com https://player.vimeo.com
```

**Do not set `CSP_MODE=enforce` while `CSP_FRAME_SRC` is empty.** That blanks
every provider embed inside migrated articles.

- [ ] A week of real traffic observed
- [ ] `CSP_FRAME_SRC` filled from actual reports, not guesswork
- [ ] Remaining violations consciously accepted
- [ ] Only then: `CSP_MODE=enforce`

---

## Step 4 — Stripe takeover

Required before Ghost can be cancelled, and not started. Follow
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) § "Paid subscriptions in Stripe" and
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

Summary of what only you can do:

- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set in the production `.env`
- [ ] Webhook endpoint created in **your** Stripe account, pointing at the new site
- [ ] Endpoint verified end to end with a test event from the Stripe dashboard
- [ ] `pnpm reconcile:billing --dry-run` — every difference explained
- [ ] `pnpm reconcile:billing` for real
- [ ] Daily reconciliation scheduled
- [ ] **Only then** remove Ghost's Stripe connection

---

## Step 5 — Cutover

Follow [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) end to end. Do not start until
steps 2–4 are signed off.

The pre-cutover gate that catches people: `NEXT_PUBLIC_NOINDEX` and
`STAGING_BASIC_AUTH` must be **unset** in production, and
`NEXT_PUBLIC_SITE_URL` must be the production URL — otherwise you launch a site
that tells Google not to index it.

Keep Ghost running as a fallback after the DNS flip. Do not cancel it.

---

## Anytime — independent of the above

These block nothing but are worth doing early.

### VPS security hardening — **[vps]**

From `DEPLOYMENT_STATUS.md` item 5:

- [ ] Confirm key-based SSH login works for **every** account that needs access
- [ ] Then set `PasswordAuthentication no` in `/etc/ssh/sshd_config` and
      `systemctl reload sshd`. Root SSH currently accepts passwords.
- [ ] Consider a dedicated low-privilege deploy user in the `docker` group;
      `VPS_USER` is currently `root`

Verify key login **before** disabling passwords, in a second terminal you keep
open. Locking yourself out of your own VPS is a bad afternoon.

### Branch protection — **[gh]**

Settings → Branches → add a rule for `main` requiring `checks`,
`browser-smoke`, `backup-image`, and `app-image`. Nothing currently enforces
green CI before a merge.

- [ ] Rule added

### Dependency PRs — **[gh]**

- [ ] #41 `eslint-config-next` — safe, dev-only
- [ ] #42 `sharp` 0.34 → 0.35 — touches image processing; merge deliberately and
      watch the `app-image` job

---

## What to hand back

If something fails, paste the output rather than a summary of it — the exact
error usually names the cause.

Most useful:

```bash
docker compose ps
docker compose logs caddy | tail -40
docker compose logs app | tail -60
dig +short staging.beyondeveryart.com
curl -sI https://staging.beyondeveryart.com
```

**Never paste**: `.env` contents, SSH private keys, the Basic Auth password,
Stripe keys, or the `PAYLOAD_SECRET`. If an error message contains a secret,
redact that part and say you did.

---

## Known issue, not yet fixed

`next.config.ts`'s `headers()` is evaluated when `pnpm build` runs, and the
Dockerfile's builder stage receives no `.env`. So the deployed CSP is likely
built with `S3_PUBLIC_URL`, `NEXT_PUBLIC_GA_ID`, and `CSP_FRAME_SRC` all unset —
missing the R2 media origin and the analytics origins.

Nothing breaks in report-only mode, but step 3's reports will be noisy with
false positives about your own images and analytics, which is exactly the data
the rollout depends on. The fix is to pass those as build args in the
Dockerfile. Worth doing before you spend a week collecting reports.
