# Deployment Status

A working snapshot of VPS setup and Ghost migration progress, so this can be
picked up in a later session without re-deriving it. Update or delete this
file once cutover is complete; it is a progress note, not a runbook.

Related: [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md),
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md),
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

## Pick up here

Last worked on **29 Aug 2026**. The deploy pipeline broke and was repaired; the
detail is in "The 27–28 Aug deploy outage" below, and it is worth reading before
the next infrastructure change because two of the three failures were invisible
to CI. The server now runs everything through #121.

Closed since the last update: the migrations baseline (confirmed directly, not
inferred), encrypted backups **with a proven restore** and the plaintext ones
deleted, the paying-subscriber question, and the redirect audit. The box also
gained 4GB of swap and went from 2.3GB free to 19GB.

Newly on the list and easy to miss: **capture the pre-migration search baseline
before DNS moves** — it is the only item here that cannot be done afterwards.
See [`SEO_CUTOVER_RISK.md`](SEO_CUTOVER_RISK.md).

In dependency order, what is left before the public cutover:

1. **Work [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) end to end.** Every
   box in §4–§6 is unticked, and this is the bulk of what is left. Newly
   unblocked: `pnpm validate:redirects` is deployed and must exit zero, the media
   check can pass, and staging no longer requires Basic Auth so the crawl
   comparison and the validator need no credentials. Includes the
   email-delivery test.

2. **Members CSV.** Export from Ghost Admin and import. Low stakes now — there
   are no paying members, so this is the newsletter list rather than billing
   identifiers, and the Stripe takeover is off the critical path to cancelling
   Ghost.

3. **Edge protection** — [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md). The token
   exists and the repository side is done: `CADDY_ACME=acme-cloudflare` in `.env`
   switches every site block to DNS-01. What remains is that switch, confirming
   a certificate is obtained through it, the orange cloud, `TRUST_CLOUDFLARE_IP=1`,
   and firewall pass two. **Its own quiet deploy, not cutover-day work**, and
   validate the Caddyfile before deploying.

4. **Branch protection (operator action).** Promoted out of the "not done yet"
   list because it stopped being housekeeping on 28 Aug: three Dependabot pull
   requests, each green on its own branch, merged into a `pnpm-lock.yaml` that
   no YAML parser accepts, and `main` could not deploy until it was regenerated
   (#120). Requiring branches to be up to date before merging is the check that
   would have caught it. Cheap now; expensive on cutover day.

5. **Flip.** Unset `NEXT_PUBLIC_NOINDEX`, move `SITE_ADDRESS` and
   `NEXT_PUBLIC_SITE_URL` to the production domain, then change DNS.
   `STAGING_BASIC_AUTH` is already unset — staging has been deliberately public
   since 28 Aug, which is why `NEXT_PUBLIC_NOINDEX` is now the **only** thing
   keeping a complete copy of the site out of search results. Do not unset it
   before the domain moves.

The reboot that was pending here is done — see "The swap survives a reboot"
below.

## Done

- **The 27–28 Aug deploy outage, and what it cost.** Recorded in full because
  two of the three failures were invisible to CI, and the same blind spots would
  have applied on cutover day.

  Moving the Caddy build off the VPS was correct — compiling it there ran
  seventeen minutes and killed one deploy on its own timeout — but the image CI
  published was **amd64 and this server is arm64**. Caddy could not execute,
  entered a restart loop, and nothing answered on 80 or 443. **The deploy
  reported success**: Caddy has no healthcheck, `up --wait` treats a service
  without one as ready the moment it is running, and the post-deploy probe
  fetches `/health` from inside the app container, so it never crosses the
  proxy. Service was restored by pinning `CADDY_IMAGE` to the locally built
  image (#118 fixed the cause; the deploy now also asserts Caddy is running).

  The fix then could not deploy: the Next.js build was killed by the OOM killer
  on a 3.7GB machine with **no swap at all** (#119 builds the images one at a
  time; 4GB of swap was added). And that deploy could not run either, because
  three Dependabot merges had left `pnpm-lock.yaml` unparseable and four of five
  gate jobs failed on it (#120).

  Three ceilings, none of which the pipeline could see: architecture, memory,
  disk. All three are now instrumented or removed.

  **The pin is off and the published image is proven (29 Aug).**
  `CADDY_IMAGE=beyond-every-art-caddy` had held the server on whatever it last
  built locally. Before removing it, the replacement was checked rather than
  assumed: `docker pull` of `ghcr.io/tiualvin/beyond-every-art-caddy:main`
  succeeded **anonymously**, so the GHCR package is public, and
  `docker image inspect --format '{{.Os}}/{{.Architecture}}'` reported
  `linux/arm64` — the manifest list resolves per-architecture, which is the
  specific thing that failed on 27 Aug. Caddy then came up on the pulled image
  and stayed `Up`.

  And the check the outage was missing: `curl` against
  `https://staging.beyondeveryart.com/` returned **200**. That request crosses
  the proxy. The deploy's own probe fetches `/health` from inside the app
  container, so it cannot distinguish a working proxy from a dead one — which
  is exactly how a downed site reported a successful deploy. Any future change
  to Caddy is worth confirming from outside the stack, not from within it.

- **The swap survives a reboot (29 Aug).** Rebooted deliberately, while the
  apex still points at Ghost and the only public thing on this box is staging —
  the same reboot after the flip is a real outage. `/etc/fstab` carries
  `/swapfile none swap sw 0 0`, `findmnt --verify` reported `0 parse errors, 0
errors`, and `/swapfile` is `-rw-------`. Its one warning — "non-bind mount
  source is a directory or regular file" — is `findmnt` checking a swap entry as
  if it were a filesystem mount, where a regular file would be odd; for swap it
  is correct.

  After the reboot: `free -h` shows 4.0Gi of swap, all four containers came back
  on their `restart: unless-stopped` policies with both healthchecks green, and
  staging returned 200. Caddy came back on the GHCR image, which also confirms
  the `CADDY_IMAGE` removal persisted.

  Worth knowing for capacity: **764M of swap was in use before the reboot.** The
  box does not merely have swap, it leans on it — which is what the OOM kill on
  28 Aug was telling us about 3.7GB with none.

- **Backups are encrypted and a restore is proven (27 Aug).** The Phase 1
  acceptance criterion that had never been met. `BACKUP_ENCRYPTION_KEY` is set,
  a backup uploaded reporting `"encrypted": true`, and
  `restore-database.ts --latest --dry-run` decrypted and decompressed it to
  **exactly the same `sqlBytes`** as the known-good unencrypted archive — which
  is what makes it proof of the passphrase rather than proof of a passphrase.
  The dry run decrypts before reporting, and the format is AES-256-GCM, so a
  wrong key fails the authentication tag rather than producing garbage.

  **The plaintext archives are gone (29 Aug).** There were **seven**, not the
  two this file previously claimed — every nightly run from 22 Aug until
  encryption was turned on at 09:13 on 27 Aug. The count was never checked
  against the bucket; listing it first is what corrected it. A fourth encrypted
  backup was taken before deleting, so removing seven objects left three rather
  than two inside a nineteen-hour window. The bucket now holds encrypted
  archives only.

  Listing is not a first-class operation in `backup-database.ts` — `--dry-run`
  reports `existingBackups` as a count, and the keys are only visible through
  `wouldPrune`, which needs `--keep 1` to name them all. That flag is read-only
  **only** in combination with `--dry-run`; on a real run it would prune the
  bucket down to a single object. Worth a `--list` flag if this comes up again.

- **The paying-subscriber question is closed (27 Aug).** Measured rather than
  assumed: every post is `public`, and Ghost reports **zero paying members**. So
  no reader loses access at cutover, the members import is a newsletter list
  rather than billing identifiers, and the entire Stripe webhook takeover leaves
  the critical path to cancelling Ghost. `visibility` remains a working
  teaser gate (`lib/content/richtext.ts`, 500 characters) for whenever
  memberships open — it withholds server-side, so gated text never reaches the
  markup.

- **The migrations baseline, confirmed rather than inferred (27 Aug).**
  `docker compose run --rm migrate pnpm migrate:db:status` lists all ten
  migrations as `Ran: Yes` across batches 1–7. Item 0 below can be retired; it
  had been resting on a green deploy exit code.

- **Redirects, audited (27 Aug).** The 301 layer was checked end to end rather
  than spot-checked, and two gaps were found and closed in code.

  - **Ghost pagination had no answer at all.** Ghost paginates in the path
    (`/page/2/`, `/tag/x/page/2/`, `/author/x/page/3/`); this site paginates in
    the query string. Ghost's `redirects.json` says nothing about them — it
    served those URLs itself — so every one of them was a 404 waiting for
    cutover day, and with 117 posts there are a lot of them. `lib/seo/ghost-urls.ts`
    now redirects each to its unpaginated archive, permanently. A table row for
    the same source still wins.
  - **A redirect row can be silently unservable.** The middleware matcher skips
    any path containing a dot, so a row for `/ads.txt`, `/sitemap-posts.xml`, or
    `/content/images/…` imports cleanly, shows as enabled, and never fires. This
    was known for `/ads.txt` alone; `lib/seo/middleware-coverage.ts` now models
    the matcher, `pnpm migrate:redirects` warns about any such rule at import
    time, and the validator below reports it as an error.
  - **`pnpm validate:redirects` is new** and is what replaces "spot-check a
    handful" in the rehearsal and cutover checklists. It checks every rule
    against a running host — status, destination, that the destination answers
    200, and that the matcher runs on the source — and exits non-zero on any
    failure. See
    [`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md#validating-them).

  Not yet run against staging or production: that is part of the rehearsal
  above, and it needs a host this repository's CI cannot reach.

- **Trailing slashes, decided.** `next.config.ts` sets `trailingSlash: true` to
  match the Ghost permalinks the site is migrating, described in
  [`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md#the-trailing-slash). No longer
  an open decision.
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
  actual. Members are still not imported — see the members CSV item, still open.
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
   the members import is done — every member email and Stripe identifier. Generate with
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
4. **The VPS has no swap, and it is now failing deploys (operator action).**
   Measured 27 Aug: 3.7GB of RAM, **`Swap: 0B`**, about 2.0GB available with
   the stack running. The Next.js production build peaks near that on its own,
   so the deploy of #118 was killed outright by the OOM killer
   (`failed to execute bake: signal: killed`) — after the same build had
   succeeded twice earlier the same day. That is a coin flip, not a margin, and
   it will land on cutover day eventually.

   Add a swapfile. It needs disk, so check first:

   ```bash
   df -h /
   fallocate -l 4G /swapfile && chmod 600 /swapfile
   mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   sysctl -w vm.swappiness=10
   echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
   free -h
   ```

   Low swappiness keeps it as overflow for build spikes rather than something
   the kernel reaches for while serving. The deploy now also builds the two
   images one at a time rather than letting bake run them in parallel, which
   halves the peak — insurance, not a substitute.

5. **Docker image/layer cleanup (operator action).** Nothing automatically
   prunes old images or layers on the VPS. That is intentional: an unattended
   prune can remove rollback material and consume I/O at the worst time.
   Periodically inspect `docker system df`, then have an operator review and
   remove only confirmed-unused images/layers during a maintenance window.

   Measured 27 Aug: **7.9GB of build cache** and 4.2GB of images, of which
   3.3GB (78%) is reclaimable — several of them stale Caddy builds, including
   the amd64 one that could not run here. `docker builder prune` reclaims the
   cache safely; images want the review this item describes, since one of them
   is the rollback.

6. **GitHub branch protection (operator action).** Configure the `main` branch
   in repository settings to require the `checks`, `browser-smoke`,
   `backup-image`, and `app-image` jobs and disallow bypasses appropriate to
   the team. The workflow does not mutate repository protection rules or infer
   who should have bypass authority.
7. **Lower priority / only if needed later:**
   - ~~Move the image build off the production VPS~~ — **done for Caddy, and it
     was not lower priority.** Compiling Caddy with the Cloudflare module ran
     seventeen minutes on this box without finishing and killed the deploy of
     #110 on its 20-minute timeout (CI run 33043176270, 27 Aug); the same build
     takes under a minute on a runner. CI publishes the image to GHCR now and
     the VPS pulls it. **The package must be public, or the server must be
     authenticated to `ghcr.io`, or every deploy silently takes the slow path
     again** — see the note in
     [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md#the-procedure).

     The first attempt at this broke the site. **The VPS is arm64**; GitHub's
     runners are amd64, and the amd64-only image it published could not execute
     here — Caddy exec-failed and restarted forever, nothing answered on 80 or
     443, and the deploy reported success anyway. The image is a two-architecture
     manifest list now, and the deploy asserts Caddy is actually running rather
     than trusting `--wait`, which for a service with no healthcheck treats
     "running" as ready. **Remove `CADDY_IMAGE` from the production `.env`** —
     it was added by hand to restore service and now only pins the server to
     whatever it last built.

   - The **app** image is still built on the VPS, deliberately: its
     `NEXT_PUBLIC_CHECKOUT_URL_*` build arguments come from the production
     `.env`, so moving that build to CI means moving those values into CI
     secrets. Worth doing eventually; it is a separate decision, and getting it
     wrong leaves the subscribe modal saying membership is not open with
     nothing in the logs. Its ~2–3 minute build is not the problem Caddy was.
   - A GitHub Environment with a manual-approval gate in front of the
     `deploy` job, if merges to `main` should not always auto-deploy.

## Reference

- Deploy workflow: `.github/workflows/ci.yml` (`deploy`, `app-image`,
  `backup-image` jobs).
- The real Ghost export used above is a full site archive zip (content
  JSON, ~1,374 media files, redirects, routes, themes, and a full DB dump).
  It is not, and must not be, committed to git.
