# Deployment Status

A working snapshot of VPS setup and Ghost migration progress, so this can be
picked up in a later session without re-deriving it. Update or delete this
file once cutover is complete; it is a progress note, not a runbook.

Related: [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md),
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md),
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

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
- **Pre-launch frontend, caching, and MCP images** (#70, #71, #72 — all merged
  and deployed to staging). What changed, and the decisions behind it, so they
  do not get re-argued:
  - **Members-only and paid posts are teasers, not 404s.** They had been
    filtered out of every query, so a post that imported cleanly then vanished
    from the archive, tags, search, feed and sitemap, and its URL 404'd — while
    Ghost serves the same posts as an indexed public teaser. They are now
    listed and routed like any post; `toPostDetail` replaces the body with its
    opening paragraphs and the rest never enters the response. The gate says
    membership is _coming_ rather than promising a paywall, because there is no
    sign-in and the paid plan has no checkout. Revisit the copy when either
    exists. See [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md).
  - **`/journal` and `/tag/*` follow the approved prototypes**: month groups
    against a sticky date rail, the journal's topic filter (filtering the page
    it is on, as the prototype does), the topic page's pigment-stained head and
    sibling topics. The article page gained the author card and read-next. The
    specimen card is deliberately not ported — `Posts` has no fields for it.
  - **Reads are cached, routes are not.** Database reads go through tagged
    `unstable_cache` entries with a ten-minute backstop, purged by Payload
    hooks on write (`lib/cache/content.ts`). The routes stay `force-dynamic`
    **on purpose**: they resolve `NEXT_PUBLIC_SITE_URL` at render time for
    canonical URLs, feeds and JSON-LD, and the image is built without that
    variable, so statically rendering them would bake `localhost` into all of
    it and the cutover env change would not fix it. Measured: a topic page cost
    8 queries and now costs 8 cold, 0 warm. Full-route caching is available
    later by passing the site URL in as a build arg — that is the unlock, not a
    code change.
  - **Imported bodies no longer print their title twice.** `toBodyHtml` drops a
    leading `h1`–`h3` matching the document title. Render-time only;
    `legacyHTML` keeps the heading, so it is reversible by deleting the call.
  - **`uploadMedia` over MCP**, with a new indexed `media.aiGenerated` flag set
    by default on that path — see item 0.5 and [`MCP_SERVER.md`](MCP_SERVER.md).
  - Two pre-existing defects fixed on the way: `ScrollHeader` rendered the
    whole masthead a second time as its scroll spacer (two of every control,
    duplicate element ids, and two subscribe modals portalled to `body` past
    80px of scroll), and the homepage topic swatches put their labels off the
    pigment on phones, which made a pale pigment's dark ink invisible against
    the dark card.

## Not done yet

0. **One-time migration baseline (operator action, before the next deploy).**
   Schema migrations now exist and automatic push is off. The VPS database was
   built by push, so it must be told the initial migration is already applied
   before the first deploy that carries this change — otherwise that migration
   tries to `CREATE TABLE` over live tables and the deploy fails. Take a backup,
   then run the baseline commands in
   [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md). The script refuses
   anything that is not a pre-migrations database, and is safe to rerun.
   Several deploys have succeeded since this was written (most recently #53,
   #54), so this is likely already resolved — not reconfirmed directly, worth
   a quick `docker compose run --rm migrate pnpm migrate:db:status` check
   before treating it as closed.

0.4. **Set up R2, then re-import the media (operator action).** The runbook's
pre-cutover checklist expects R2, and object storage is still not configured —
so this is also why **database backups are not running**: `buildBackupPlan`
requires `S3_BUCKET` and throws before dumping anything, so the nightly
container fails every run on a missing variable. One bucket fixes both. Steps
are in
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md#creating-the-r2-bucket-first-time-setup);
free tier covers this project's scale. Do it before anything else on the launch
list — right now a host loss takes the images and the backups together.

Uploads are stored on local disk — no object storage is configured, so
`useR2` in `payload.config.ts` is false and Payload writes to `/app/media`
inside the app container. Until the `media_data` volume was added there was
nothing persisting that directory, so `docker compose up -d --build` threw it
away on every release: the container is recreated and its writable layer goes
with it. The `media` rows survived in Postgres, so each post kept pointing at
a file that no longer existed, `/api/media/file/<name>` answered 500 with a
JSON body, and every image on the site rendered as a broken-image icon.

The volume stops it happening again but cannot bring back what was already
discarded. Re-run the Ghost media import once, after a deploy that includes
the volume, and the files will land in the volume and stay there:

```
docker compose run --rm migrate pnpm migrate:ghost --input <export.json>
```

Worth doing before the public cutover regardless, since the same wipe would
have taken any image uploaded through Payload Admin.

0.5. **MCP from mobile — subdomain is live, endpoint is not enabled yet
(operator action).** `cms.beyondeveryart.com` now has a real certificate (see
above) and Payload Admin loads there. Still needed: set `MCP_ENABLED=1`,
create an editor-bound key in Payload Admin under MCP → API Keys, and add it
to the Claude connector. See [`MCP_SERVER.md`](MCP_SERVER.md).

When creating the key, **tick the capability checkboxes**. They default off,
and a key with none ticked still authenticates and still lists the custom
tools — so the failure looks like the generated CRUD tools not existing rather
than like a permissions problem. For the write-an-illustrated-draft loop, tick
`uploadMedia`, `posts.find` and `posts.update`.

That loop is `draftArticle` → `uploadMedia` → `updatePosts` setting the
returned id as `featuredImage`, and it works on **drafts only**. Payload sends
a document's existing `_status` with every update, so an editor-bound key
touching a published post trips `refuseMcpPublish`. That is the guard working
as intended, not a bug to route around.

0.6. **Count the non-public posts (one query, still unanswered).** The teaser
work in #70 shipped without anyone knowing how much content it applies to —
the number could not be read from this environment. Run it against the staging
or production database:

```sql
SELECT visibility, _status, count(*) FROM posts GROUP BY 1,2 ORDER BY 1,2;
```

It decides real things. If members-only and paid posts are a large share of
the 117, the gate is a big part of the archive and sign-in becomes urgent; if
it is three posts, publishing them outright and deleting the gate is a
reasonable alternative. The teaser path is correct either way — this is about
knowing what was recovered from 404, not about whether the change was right.

1. **Members CSV.** Not included in the site archive already checked. Export
   separately from Ghost Admin (Members → Settings → Export all members)
   before migrating member records and Stripe IDs.

1.5. **Sign-in, so the gate can open.** `lib/billing` reconciles Stripe
webhooks into `Members`, but nothing authenticates a member, so a paying
subscriber still cannot read what they pay for and the membership gate can
only promise. This is the largest open piece and the one with real design
questions — magic link versus password, session handling, how `Members`
relates to `Users`. Worth scoping before building, and worth having the
regression net (item 6) in place first. 2. **Stripe webhook takeover.** Required before Ghost is cancelled — see
`CUTOVER_RUNBOOK.md`'s "Paid subscriptions in Stripe" checklist and
`SUBSCRIPTION_WEBHOOKS.md`. Not started. 3. **VPS security hardening**, found while debugging the deploy key:

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
6. **A visual regression net in CI.** Three real defects — the duplicated
   masthead, the off-pigment swatch labels, a missing entrance animation —
   each passed lint, typecheck, the unit suite and the existing browser suite,
   and were only caught by measuring geometry in a real browser. The
   `browser-smoke` job could assert a few invariants cheaply: no horizontal
   overflow at three widths, no text rendered outside the background it was
   coloured for, one `h1` per page. Not screenshot diffing, which is noisy —
   just the handful of assertions that would have caught these.

7. **Lower priority / only if needed later:**
   - Wrap `migrate:db:create` the way `migrate:db` is wrapped; it shares the
     CLI stall and fails silently. See
     [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md).
   - Pass `NEXT_PUBLIC_SITE_URL` into the Docker build so the homepage, tag and
     author pages can be statically rendered with on-demand purging. The data
     cache already removes the database cost; this removes the render.
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
