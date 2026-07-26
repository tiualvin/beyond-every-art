# Deployment Status

A working snapshot of VPS setup and Ghost migration progress, so this can be
picked up in a later session without re-deriving it. Update or delete this
file once cutover is complete; it is a progress note, not a runbook.

Related: [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md),
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md),
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

## Done

- VPS provisioned (Hetzner), Docker installed, repo cloned.
- `.env` configured on the VPS (Postgres, R2, Payload secrets); the
  `postgres`, `app`, `caddy`, and `backup` services run via
  `docker compose up -d`.
- **Automatic deploy on merge to `main`** (`.github/workflows/ci.yml`,
  `deploy` job): after `checks`, `backup-image`, and `app-image` all pass, it
  SSHes into the VPS, runs `git reset --hard origin/main`, then
  `docker compose up -d --build`. Requires four repo secrets: `VPS_HOST`,
  `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH` — all set and confirmed
  working end-to-end (a real merge triggered a real deploy successfully).
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

## Not done yet

1. **DNS + TLS.** No domain points at the VPS yet, and `SITE_ADDRESS` /
   `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_SERVER_URL` /
   `PAYLOAD_PUBLIC_SERVER_URL` in the VPS's `.env` are still placeholders.
   Once a domain's A record points at the VPS, update those variables and
   restart the stack once — Caddy provisions a real Let's Encrypt
   certificate automatically. Until then, HTTP requests correctly 308 to
   HTTPS, but HTTPS itself fails (Let's Encrypt cannot issue a cert for a
   bare IP address) — that failure is expected, not a bug.
2. **Real Ghost import.** Dry runs are clean, but nothing has been imported
   into Payload for real. Do this after DNS/TLS, following
   `MIGRATION_REHEARSAL.md` (set `NEXT_PUBLIC_NOINDEX=1` and
   `STAGING_BASIC_AUTH` first if rehearsing before the site should be
   public).
3. **Members CSV.** Not included in the site archive already checked. Export
   separately from Ghost Admin (Members → Settings → Export all members)
   before migrating member records and Stripe IDs.
4. **Stripe webhook takeover.** Required before Ghost is cancelled — see
   `CUTOVER_RUNBOOK.md`'s "Paid subscriptions in Stripe" checklist and
   `SUBSCRIPTION_WEBHOOKS.md`. Not started.
5. **VPS security hardening**, found while debugging the deploy key:
   - Root SSH login currently accepts **password** authentication, not just
     keys. Disable `PasswordAuthentication` in `sshd_config` once key-based
     login is confirmed working for every account that needs access.
   - The deploy SSH user (`VPS_USER`) is currently `root`. Consider a
     dedicated low-privilege deploy user in the `docker` group instead.
6. **Docker image/layer cleanup.** Nothing prunes old images or layers on
   the VPS. Since every deploy rebuilds in place on the same host, disk
   usage will grow over time — worth a periodic `docker image prune -f`
   (e.g. via the `backup` container's existing scheduler) before it becomes
   a problem.
7. **Lower priority / only if needed later:**
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
