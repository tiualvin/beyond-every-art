# Deployment Status

A working snapshot of VPS setup and Ghost migration progress, so this can be
picked up in a later session without re-deriving it. Update or delete this
file once cutover is complete; it is a progress note, not a runbook.

Related: [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md),
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md),
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

## Pick up here

Last worked on **22 Aug 2026**. Storage and backups are now real: R2 configured,
media recovered after a three-week-old loss, first backup uploaded. Details and
the exact commands are in item 0.4.

In dependency order, what is left before the public cutover:

1. **Finish 0.4** — set `BACKUP_ENCRYPTION_KEY`, prove a restore works, delete
   the unencrypted backup. Minutes of work, and the restore is a Phase 1
   acceptance criterion that has never been met.
2. **Work [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) end to end.** Every
   box in §4–§6 is unticked. Its media check can pass now, which it could not
   before. Includes the email-delivery test (item 3 below) and the crawl
   comparison.
3. **Members, then Stripe** — item 1 then item 2 below, in that order:
   reconciliation has nothing to reconcile against until the member records
   exist.
4. **Decide trailing slashes.** [`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md)
   §Pending. Canonical tags, the sitemap and the feed advertise the slashed Ghost
   permalinks while Next.js redirects to the un-slashed form, so every URL the
   site advertises lands on a redirect. Settling it after search engines recrawl
   costs a second round of redirects on every URL.
5. **Decide what happens to paying subscribers.** Phase 1 ships no reader
   accounts and no paywall ([`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md)), but posts
   keep their Ghost `visibility` and render a teaser. On cutover day a paying
   subscriber gets a teaser where Ghost gave them the full piece, with no way to
   sign in. Count the exposure first:
   `SELECT visibility, count(*) FROM posts GROUP BY visibility;`
6. **Edge protection** — [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md), and read the
   ordering warning before touching Cloudflare. Adopt the DNS-01 Caddy image in
   its own quiet deploy, _then_ proxy. Not cutover-day work.
7. **Flip.** Unset `NEXT_PUBLIC_NOINDEX` and `STAGING_BASIC_AUTH`, move
   `SITE_ADDRESS` and `NEXT_PUBLIC_SITE_URL` to the production domain. Leaving
   the noindex on is the quiet failure: the site works perfectly and is invisible
   to search.

## Done

- VPS provisioned (Hetzner), Docker installed, repo cloned; the `postgres`,
  `app`, `caddy`, and `backup` services run via `docker compose up -d`.
- **Automatic deploy on merge to `main`** (`.github/workflows/ci.yml`,
  `deploy` job): after `checks`, `browser-smoke`, `backup-image`, and
  `app-image` all pass, it
  SSHes into the VPS, checks out the exact commit those jobs tested, then runs
  `docker compose up -d --build --wait`. Production deploys are serialized and
  an in-progress deploy is not cancelled midway through a build or container
  replacement; a slower workflow for an older commit also refuses to roll back
  a newer commit that has already deployed. The workflow has bounded
  connection/job timeouts, verifies the internal app `/health` endpoint from
  inside the app container (so no public hostname or working TLS is required),
  prints container state and recent logs on failure, and removes its temporary
  SSH key even after a failed step.
  Requires four repo secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
  `VPS_DEPLOY_PATH` — all set and confirmed working end-to-end (a real merge
  triggered a real deploy successfully before these safety checks were added;
  the next merge should confirm the strengthened path on the VPS).
  - Along the way: the `VPS_SSH_KEY` secret got corrupted by a manual
    copy/paste through an SSH password prompt (fixed by piping the key
    file directly into `gh secret set` instead); and the Dockerfile had a
    broken `COPY --from=builder /app/public ./public` referencing a
    directory that has never existed in this repo (fixed by removing it;
    an `app-image` CI build job was added so a broken app Dockerfile now
    fails CI instead of a live deploy).
- Verified the real Ghost export (a full site archive zip, kept outside
  git per policy) against the existing migration tooling:
  `pnpm migrate:ghost --dry-run` and `pnpm migrate:redirects --dry-run` both
  came back clean — 117 posts, 2 pages, 10 tags, 2 authors, 0 duplicate
  slugs, 0 missing authors/tags, 1 redirect planned. No importer code
  changes are needed; it fetches media over HTTP and the source Ghost site
  (`beyondeveryart.com`) is still live.
- **`.env` on the VPS, actually created.** It turned out not to exist at all
  (the previous version of this doc claimed otherwise) — the stack had been
  running on `docker-compose.yml`'s bare fallback defaults the whole time,
  including the publicly-known `PAYLOAD_SECRET=development-only-change-me`.
  Now created from `.env.example` with a real generated `PAYLOAD_SECRET`,
  `SITE_ADDRESS`/`NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_SERVER_URL`/
  `PAYLOAD_PUBLIC_SERVER_URL` set to the staging domain, `CMS_ADDRESS` set,
  and `NEXT_PUBLIC_NOINDEX=1` / `STAGING_BASIC_AUTH` set so the rehearsal
  site is neither indexed nor public. `MCP_ENABLED` and an MCP API key are
  still not set up — see item 0.5 below, still open.
- **DNS + TLS, for staging.** `staging.beyondeveryart.com` and
  `cms.beyondeveryart.com` both point at the VPS (Cloudflare, DNS-only —
  proxying either would break Let's Encrypt's HTTP-01 challenge) and Caddy
  holds real certificates for both.
- **Real Ghost import, done for real on staging.** Ran `pnpm migrate:ghost`
  and `pnpm migrate:redirects` (for real, not dry-run) against the staging
  environment above: 2 authors, 10 tags, 117 posts, 2 pages, 110/110 media
  imported with zero failures, 1 redirect created. `pnpm migrate:validate`
  confirms `"ok": true` with every collection's expected count matching
  actual. Members are still not imported — see item 3 below, still open.
- **R2 configured and the lost media recovered (22 Aug).** Two buckets, media
  and backups deliberately separate; 109 of 110 images restored from the site
  archive with filenames and document ids intact; first database backup
  uploaded. Full account, and the two steps still outstanding, in item 0.4.
- **Fixed three bugs found while getting the above working**, all merged to
  `main`:
  - The `app` container had been reporting `unhealthy` since it was created
    (11+ days). Cause: Docker sets `HOSTNAME` to the container ID by default,
    and Next's standalone server binds to that instead of `0.0.0.0`, so
    loopback (the Compose healthcheck, and the deploy workflow's own
    post-deploy health check) could never reach it. Fixed with an explicit
    `ENV HOSTNAME="0.0.0.0"` in the `Dockerfile` (#53).
  - `NewsletterBand` rendered on every page including `/newsletter` itself,
    putting two inputs both labeled "Email address" on one page — a real
    duplicate for assistive tech, and the reason `browser-smoke` CI was
    failing on `main`. Fixed by hiding it on the newsletter page itself
    (#54).
  - `.env`'s `DATABASE_URI`, copied verbatim from `.env.example`, pointed at
    `localhost` — correct for `pnpm dev` on a host machine, but inside the
    `app` container `localhost` is its own loopback, not the `postgres`
    container. Fixed by pointing it at the `postgres` service hostname
    instead (`.env` only, not a code change).

## Not done yet

0.1. **Edge protection — the origin is unprotected (operator action).**
Cloudflare holds the DNS but every record is "DNS only", so there is no DDoS
mitigation, no edge cache, and the VPS address is public. This is the largest
open risk in the deployment and it must be closed before the public cutover.
The procedure, the prepared Caddy image (`docker/caddy/Dockerfile`), and the
warning about why the proxy cannot simply be toggled on — it breaks HTTP-01
certificate renewal — are in
[`EDGE_PROTECTION.md`](EDGE_PROTECTION.md). Blocked on a Cloudflare API token.

Two of the six steps are done. The `caddy` service builds from the prepared
image with the `caddy-dns/cloudflare` module (#103), so the DNS-01 switch is a
configuration change rather than a build. And a Hetzner Cloud Firewall now
fronts the server (24 Aug), attached, with three inbound rules — TCP 22, 80 and
443 — each sourced from `Any` for now. That closes every other port; it does
not yet close the origin, because the sources cannot narrow to Cloudflare until
Cloudflare is the one connecting. Doing it there rather than in `ufw` is not a
preference: Docker publishes Caddy's ports with its own iptables rules, which
are evaluated before the chain `ufw` manages, so a `ufw deny 80/tcp` reports
success and changes nothing.

What is left is therefore the token, the DNS-01 configuration, the proxy
toggle, `TRUST_CLOUDFLARE_IP=1`, and one edit to two existing firewall rules.

0. **One-time migration baseline (operator action, before the next deploy).**
   Schema migrations now exist and automatic push is off. The VPS database was
   built by push, so it must be told the initial migration is already applied
   before the first deploy that carries this change — otherwise that migration
   tries to `CREATE TABLE` over live tables and the deploy fails. Take a backup,
   then run the baseline commands in
   [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md). The script refuses
   anything that is not a pre-migrations database, and is safe to rerun.
   CI history matches that story on both ends: the `deploy` job failed with
   exit code 1 on the very first push that shipped schema migrations (#48,
   2026-07-28), then kept failing through the next few pushes while the
   `HOSTNAME`, `NewsletterBand`, and `DATABASE_URI` bugs above were being
   tracked down. Starting with the fix for the second of those (2026-08-09,
   "Don't show the newsletter promo band on the newsletter page", #54), the
   `deploy` job has succeeded on every push to `main` since — 25+ consecutive
   green deploys through 2026-08-22 (#98), with no failures in between. That
   is strong circumstantial evidence the baseline was applied correctly, but
   it is still inferred from a green `docker compose run --rm migrate` exit
   code rather than a direct read of the migrations table. An operator can
   retire this line for good with one command:
   `docker compose run --rm migrate pnpm migrate:db:status`.

0.4. **Media loss and R2 — recovered on 22 Aug. Two small steps left.**

Recorded in full because the failure was invisible for three weeks and the
recovery this note originally prescribed would not have worked.

**What happened.** Uploads went to local disk (`useR2` false, no `S3_*` set).
Before the `media_data` volume existed, `docker compose up -d --build` recreated
the app container and discarded its writable layer, taking `/app/media` with it.
The volume prevents a recurrence but could not undo the one that had happened:
as of 22 Aug the volume was empty and had been since **31 July**. All 110 `media`
rows survived, each pointing at a file that was not there.

**Why the documented recovery could not work.** This note used to say "re-run the
Ghost media import". `importMedia` matches on `ghostURL` and skips every row that
already exists — and the rows all survived — so it reports 110 reused, uploads
nothing, and leaves the site exactly as broken as it found it. Confirmed by
running it: 0 B transferred.

**What was actually done, 22 Aug:**

- Two R2 buckets created: `beyondeveryart-prod` for media, `beyondeveryart-backup`
  for database dumps. **Deliberately separate.** R2 public access is per-bucket
  and all-or-nothing, so if the media bucket is ever given a custom domain — a
  plausible future step, to stop every image request hitting the VPS — anything
  sharing that bucket becomes downloadable. Database dumps must never be in it.
- One account-scoped API token (not a user token, which dies with the user),
  `Object Read & Write`, scoped to both buckets. `S3_*` and `BACKUP_S3_BUCKET`
  set in `.env`. `S3_PUBLIC_URL` deliberately left **empty**: the config does not
  set `disablePayloadAccessControl`, so Payload serves media from
  `/api/media/file/<name>` and streams it out of R2 itself. The bucket stays
  private and needs no public URL.
- 109 of 110 images restored with `pnpm restore:media --from-dir`, sourced from
  the Ghost site archive rather than the live site. Filenames and document ids
  preserved, derivatives rebuilt, images confirmed rendering on staging.
- First database backup taken and uploaded: 2.3 MB, no errors.

**Still to do (minutes of work):**

1. **Set `BACKUP_ENCRYPTION_KEY`.** The first backup uploaded unencrypted and
   said so on the run. A dump carries the users table, OAuth records, and — once
   item 1 below is done — every member email and Stripe identifier. Generate with
   `openssl rand -base64 32`, put it in `.env`, keep a copy somewhere that is
   neither this server nor the backup bucket, then re-run the backup and confirm
   `"encrypted": true`.
2. **Prove a restore works.** Not yet done, and it is a Phase 1 acceptance
   criterion in the handoff:
   `docker compose run --rm --entrypoint tsx backup scripts/restore-database.ts --latest --dry-run`
3. **Delete the unencrypted backup** once an encrypted one exists and step 2 has
   passed — not before, since it is currently the only one.
4. **Media id 4** (`photo-1689659721022-3aa475803e19`) has no copy in the archive
   and carries no file extension, which suggests it was linked directly rather
   than stored in Ghost. Check with
   `SELECT ghost_u_r_l FROM media WHERE id = 4;` and
   `SELECT slug FROM posts WHERE featured_image_id = 4;` — if no post uses it,
   ignore it.

**Two commands worth knowing before touching any of this.** Every SSH session
needs the environment loaded first, or `$S3_*` are empty and tools fail in
confusing ways (an empty bucket name makes rclone try to list _all_ buckets):

```
cd ~/beyond-every-art && set -a && . ./.env && set +a
```

That prints two harmless `command not found` lines — `BACKUP_CRON` and
`EMAIL_FROM_NAME` have unquoted spaces, which bash trips on and Docker Compose
does not. **Do not "fix" them in `.env`**; quoting would make Compose store the
quote characters as part of the value.

And `docker compose run` never rebuilds an image, so it is always one deploy
behind until the deploy rebuilds it. A script added in a merge is not available
until that merge has deployed; `docker compose build migrate` forces it sooner.

0.5. **MCP from mobile — subdomain is live, endpoint is not enabled yet
(operator action).** `cms.beyondeveryart.com` now has a real certificate (see
above) and Payload Admin loads there. Still needed: set `MCP_ENABLED=1`,
create an editor-bound key in Payload Admin under MCP → API Keys, and add it
to the Claude connector. See [`MCP_SERVER.md`](MCP_SERVER.md).

1. **Members CSV.** Not included in the site archive already checked. Export
   separately from Ghost Admin (Members → Settings → Export all members)
   before migrating member records and Stripe IDs.
2. **Stripe webhook takeover (operator action).** Required before Ghost is
   cancelled — see `CUTOVER_RUNBOOK.md`'s "Paid subscriptions in Stripe"
   checklist and `SUBSCRIPTION_WEBHOOKS.md`. The code side is in place: the
   endpoint, the reconciliation script, and now the `reconcile` service that
   runs the sweep nightly and emits `reconcile_ok` / `reconcile_failed` log
   lines. It stays inert until `STRIPE_SECRET_KEY` is set, so restart it after
   writing the key and confirm from its log that it scheduled. What remains is
   operator work in Stripe: the keys, the endpoint, its verification, and the
   backfill.
3. **VPS security hardening**, found while debugging the deploy key:
   - Root SSH login currently accepts **password** authentication, not just
     keys. Disable `PasswordAuthentication` in `sshd_config` once key-based
     login is confirmed working for every account that needs access.
   - The deploy SSH user (`VPS_USER`) is currently `root`. Consider a
     dedicated low-privilege deploy user in the `docker` group instead.
4. **Docker image/layer cleanup (operator action).** Nothing automatically
   prunes old images or layers on the VPS. That is intentional: an unattended
   prune can remove rollback material and consume I/O at the worst time.
   Periodically inspect `docker system df`, then have an operator review and
   remove only confirmed-unused images/layers during a maintenance window.
5. **GitHub branch protection (operator action).** Configure the `main` branch
   in repository settings to require the `checks`, `browser-smoke`,
   `backup-image`, and `app-image` jobs and disallow bypasses appropriate to
   the team. The workflow does not mutate repository protection rules or infer
   who should have bypass authority.
6. **Lower priority / only if needed later:**
   - Move the image build off the production VPS (build in CI, push to a
     registry, VPS just pulls) if frequent merges start causing noticeable
     CPU contention with live traffic during the ~2–3 minute build window.
   - A GitHub Environment with a manual-approval gate in front of the
     `deploy` job, if merges to `main` should not always auto-deploy.

## Reference

- Deploy workflow: `.github/workflows/ci.yml` (`deploy`, `app-image`,
  `backup-image` jobs).
- The real Ghost export used above is a full site archive zip (content
  JSON, ~1,374 media files, redirects, routes, themes, and a full DB dump).
  It is not, and must not be, committed to git.
