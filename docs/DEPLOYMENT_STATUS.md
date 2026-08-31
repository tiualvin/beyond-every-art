# Deployment Status

A working snapshot of VPS setup and Ghost migration progress, so this can be
picked up in a later session without re-deriving it. Update or delete this
file once cutover is complete; it is a progress note, not a runbook.

Related: [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md),
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md),
[`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md).

## Pick up here

Last worked on **30 Aug 2026**. The content audit below closed most of the
rehearsal's §4 list and found four real defects, none of which a crawl of
staging would have surfaced. Read "The content audit" under Done before
touching content again.

Previously worked on **29 Aug 2026**. The deploy pipeline broke and was repaired; the
detail is in "The 27–28 Aug deploy outage" below, and it is worth reading before
the next infrastructure change because two of the three failures were invisible
to CI. The server now runs everything through #121.

Closed since the last update: the migrations baseline (confirmed directly, not
inferred), encrypted backups **with a proven restore** and the plaintext ones
deleted, the paying-subscriber question, and the redirect audit. The box also
gained 4GB of swap and went from 2.3GB free to 19GB.

Closed on 29 Aug, clearing the whole "minutes each" group: the plaintext backups
are deleted, Caddy is unpinned onto the published arm64 image, the box has been
rebooted and its swap comes back, and `main` is protected by a ruleset.

Also closed on 29 Aug: **the redirect layer**, and **edge protection except for
closing the origin**. 127 indexed Ghost URLs were checked against staging and
every one returned 200 — served directly, no redirect needed, because the domain
and the paths do not change. And DNS-01 now issues certificates from behind
Cloudflare's proxy, proven with a real challenge rather than inferred from a
site that still serves.

Newly on the list and easy to miss: **capture the pre-migration search
baseline**, and check that Search Console's verification does not depend on
Ghost serving the domain. The verification is the part that can actually lock
you out — the history itself survives, because the domain is not changing.
Procedure in [`SEO_BASELINE_CAPTURE.md`](SEO_BASELINE_CAPTURE.md).

In dependency order, what is left before the public cutover:

1. **Work [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) end to end.** Much
   of §4 closed on 30 Aug by querying Postgres rather than crawling — see "The
   content audit" below. What is left there needs a browser or a live probe:
   the one post carrying a `<table>`, draft URLs actually returning 404, the
   admin panel and draft preview, the forms, the email-delivery test, and §5–§6.

   Two items from that audit are still open and both are small: **media id 4
   has no bytes in R2** and needs re-uploading through the admin under a
   filename ending `.jpeg`, and the **tag count** is 10 in Payload against 9 in
   Ghost's sitemap, which an unpublished or empty tag would explain but nobody
   has confirmed.

2. **Members CSV.** Export from Ghost Admin and import. Low stakes now — there
   are no paying members, so this is the newsletter list rather than billing
   identifiers, and the Stripe takeover is off the critical path to cancelling
   Ghost.

3. **Close the origin** — [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md#closing-the-origin),
   step 6, and the only part of edge protection still open. Steps 1–5 are done
   (29 Aug): DNS-01 is live and **proven end to end**, `staging` is proxied
   behind Full (strict), `cms` is deliberately left unproxied so the MCP
   endpoint keeps answering non-browser clients, and `TRUST_CLOUDFLARE_IP=1` is
   set.

   Proxying hides the origin from DNS but does not stop anyone who already
   recorded the address, and this one has been public since July — so until this
   is done, an attacker with the old IP bypasses every protection just added. It
   is the step where a wrong rule locks the operator out too, so it wants a
   fresh sitting rather than being tacked onto the end of another change.

4. **Flip.** Unset `NEXT_PUBLIC_NOINDEX`, move `SITE_ADDRESS` and
   `NEXT_PUBLIC_SITE_URL` to the production domain, then change DNS.
   `STAGING_BASIC_AUTH` is already unset — staging has been deliberately public
   since 28 Aug, which is why `NEXT_PUBLIC_NOINDEX` is now the **only** thing
   keeping a complete copy of the site out of search results. Do not unset it
   before the domain moves.

The reboot that was pending here is done — see "The swap survives a reboot"
below.

## Done

- **The admin panel has been blank since 22 Aug, and why nothing caught it
  (31 Aug).** Found by finally opening it — the rehearsal's "Payload admin
  loads and editing works" box had never been ticked.

  `payload.config.ts` adds the S3 storage plugin **conditionally**, only when
  `S3_BUCKET` and `S3_ENDPOINT` are set. The import map was generated on a
  machine without them, so it was complete for that machine and missing
  `@payloadcms/storage-s3/client#S3ClientUploadHandler` everywhere else. The map
  was filled in on 16 Aug (#…, "Fill in the admin import map"); R2 was
  configured on the server on 22 Aug. From that moment Payload asked for a
  component the map did not have, and rendered nothing.

  The only symptom was a `getFromImportMap` line in the container logs. The
  page returned **200 with 43KB of HTML** and every script loaded — so from
  outside it looked entirely healthy.

  **Regenerating needs the S3 variables set**, or the same gap comes straight
  back. Placeholders are enough; the generator reads the config's shape, never
  the bucket:

  ```
  S3_BUCKET=x S3_ENDPOINT=https://x pnpm generate:importmap
  ```

  Three separate reasons the existing guard could not see it, all now fixed.
  Its `REQUIRED` list did not name the S3 key. Its key regex was `[A-Za-z]+`,
  which cannot match `S3ClientUploadHandler` because of the digit — so the one
  key that mattered was invisible to the assertions written for exactly this
  failure. And CI runs without S3 configured, so regenerating there produces
  the same incomplete map and reports no drift. The test now names the key and
  admits digits, confirmed by reverting the map and watching it go red.

  **Two diagnostic notes worth keeping.** A keyword-filtered `docker compose
logs` showed the map as `{ }` and led to a wrong conclusion — the filter
  matched the first and last lines of a multi-line object and dropped the
  contents. `--since 90s` after a deliberate page reload is what produced the
  real key. And the browser console's only message was a CSP warning about
  `upgrade-insecure-requests` in a report-only policy, which is unrelated
  noise: this failure is entirely server-side.

- **Caddy serves a stale config until its container is recreated (31 Aug).**
  The single most likely thing to waste an hour on cutover day, so it is first.

  `Caddyfile` and `ads.txt` reach the container through single-file bind mounts,
  which bind the _inode_, not the path. Git never edits in place — it writes a
  new file and renames it over the old — so after any checkout the running
  container keeps serving what it started with, and `docker compose up -d` will
  not replace it, because the service definition is unchanged and Compose does
  not hash the contents of mounted files.

  **Editing either file needs `docker compose up -d --force-recreate caddy`.
  A reload is not enough**: `caddy reload` re-read the stale inode and reported
  success, which is how a change that had not deployed looked exactly like one
  that had. The deploy job now compares both files against the container,
  recreates when they differ, and fails if a mount is still stale afterwards.

  `ads.txt` had the same exposure and nobody had noticed: `ADVERTISING.md`
  reasons that mounting it keeps one copy so buyers always read the committed
  file, which was true only until the next deploy touched it.

- **Ghost's four child sitemaps are answered (31 Aug).** `/sitemap-posts.xml`,
  `-pages`, `-tags` and `-authors` were 404s — Ghost's URL shape, which this
  site does not use, and which no redirect row can serve because the middleware
  matcher skips dotted paths. They now 301 to `/sitemap.xml`, verified against
  the live host: all four redirect, following one lands on 200 `application/xml`,
  and `/ads.txt` and `/sitemap.xml` are unaffected.

  It took two wrong attempts, both of which _looked_ like they had worked. The
  first never reached Caddy (the bind mount above). The second used
  `redir /sitemap.xml 301` inside a `handle` block — but `redir` takes an
  optional matcher first, so Caddy read `/sitemap.xml` as the matcher and `301`
  as the destination, adapting to `status: 302, Location: "301"` on a route that
  could never fire; the handle block then answered 200 with an empty body. Its
  test passed throughout, because it asserted the file _contained_ that string.
  `caddy adapt --config Caddyfile` prints the adapted JSON and is what settled
  it. **A Caddy change is not verified until it is probed from outside the
  stack** — the same lesson as the 27 Aug outage below.

  Also measured while there: `/sitemap.xml` carries 129 URLs and reconciles
  exactly — 113 published posts, 2 pages, the homepage, `/journal/`, 10 tags,
  2 authors — and **no published post or page is missing from it**. `/tag/news/`
  is in it and is an empty tag, so it answers 200 with page chrome and no posts:
  a soft 404 rather than a broken one. Deleting the tag closes it.

- **The content audit (30 Aug).** Every article body, every media record and the
  Ghost export itself, checked by querying Postgres directly rather than by
  crawling staging. That choice is the reason this found anything: a crawl
  cannot see drafts, and three of the four defects below sat in documents or
  fields a crawler never reaches.

  **Nothing hotlinks Ghost.** The original worry — bodies still pointing at
  `/content/images`, which would 404 the moment DNS moved — is empty, and for a
  structural reason worth recording: **no article body contains an inline image
  at all.** Across 117 posts there are zero `<img>` tags, zero `src=`
  attributes in any quoting, zero `<figure>`, zero `figcaption`, zero
  `<iframe>` and zero `srcset`. Bodies are prose, 7.8KB to 56.8KB, averaging
  30KB. Every image in the publication is a feature image rendered by Payload
  from `featuredImage`, and R2 holds exactly 327 objects — 3 × 109, an original
  plus `card` plus `og` for every image except media 4.

  So the srcset gap in `lib/migration/media.ts` is real (the header comment
  claims `ATTR_URL` matches srcset entries; it cannot, because `src` followed
  by `set=` fails the `\s*=`) but this content never exercises it. Worth
  knowing before importing anything else.

  **Four defects, three fixed.**

  1. **35 `__GHOST_URL__` links, 23 of them on published documents.** The
     import resolves that placeholder for media only, so a placeholder in an
     ordinary `href` shipped verbatim; a browser reads it as a relative path
     and 404s. Fixed by `pnpm fix:ghost-links` and verified by re-querying all
     four tables, including the version tables. All 25 links on published
     documents resolved to real targets, so the repair needed no editorial
     judgement; the 10 that point nowhere are all in drafts 116 and 117 and
     stay an editorial question.
  2. **110 photo credits dropped.** Ghost keeps `feature_image_caption` in
     `posts_meta`, a table `plan.ts` already loads and reads four other fields
     from — the field simply was not on `GhostPostMeta`. Every one is
     `Photo by <name> / Unsplash`, 102 distinct. Restored by
     `pnpm repair:content` into `media.credit`, which `FeaturedFigure` already
     renders, rather than `media.caption`: these are attributions, not
     description. Confirmed rendering on a real page.
  3. **One post with seven dead links.** Every `href` in
     `the-alchemical-canvas-…` was wrapped in `\&quot;`, which decodes to a
     relative path and 404s; the same body carried `\"` in its prose. It
     arrived from Ghost that way, so the old site has the same dead links.
     Repaired in the same pass.
  4. **Media id 4 has no bytes in R2 — still open.** The orphan question left
     in item 0.4.4 below is answered: it is an Unsplash URL that was linked
     rather than stored, it _is_ used (feature image of a published post), and
     the 22 Aug restore never recovered it. Its source URL still returns 200
     with 222497 bytes, matching the row's `filesize` exactly, so it is
     recoverable.

     It also has **no file extension**, and that is a second, independent
     defect: `trailingSlash: true` adds a slash to any path without a dot, and
     Payload's route only answers the unslashed form, so an extensionless media
     filename is permanently unreachable through the app. Re-uploading it
     through the admin under `photo-1689659721022-3aa475803e19.jpeg` fixes both
     at once. **Any future upload without an extension will break the same way,
     silently** — worth a `beforeChange` hook on Media if it recurs.

  **Two things that looked like problems and were not.** Ghost had no alt text
  to lose: 118 `posts_meta` rows, zero non-empty `feature_image_alt`. The
  filenames the importer put in `alt` never reach a reader either, because
  `toAltText` in `lib/content/media.ts` already collapses an alt equal to its
  filename to the empty string — confirmed in the rendered HTML, where both
  images carry `alt=""`. And a bracket-and-parenthesis construct that looked
  like a markdown link in a published body was an artefact of how a URL rendered when
  terminal output was pasted; `has_markdown_link` is 0 across all 117.

  **The counts are settled, and by set equality rather than by matching
  totals.** 113 published posts + 4 drafts + 2 published pages, against Ghost's
  sitemap of 113 posts and 3 pages (one being the homepage), and 119 rows in
  the export's `posts` table, which holds pages too. Because the 29 Aug audit
  requested all 127 indexed Ghost URLs on staging and every one returned 200,
  every Ghost post is known to exist here — so equal totals mean identical
  sets, not a coincidence of arithmetic. The one loose thread is tags: 10
  imported against 9 in Ghost's sitemap, which an empty or unpublished tag
  would explain and nobody has checked.

  **A methodological note worth keeping.** Counting matches is not the same as
  proving the query works. Every scan in this audit carried a positive control
  — a column that had to be non-zero if the query was running against real
  data — and the first one earned its keep immediately: a clean-looking result
  of all zeros turned out to mean "no body references an image in any form",
  which is a completely different fact from "no body hotlinks Ghost", and only
  the control distinguished them.

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

- **`main` is protected (29 Aug).** A repository ruleset named `Main`, Active,
  targeting the default branch, with an **empty bypass list** — a bypass for the
  only person here would have quietly restored the behaviour the rule exists to
  prevent.

  It requires a pull request, blocks force pushes, and requires four status
  checks: `checks`, `browser-smoke`, `backup-image`, `app-image`. Above all it
  requires **branches to be up to date before merging**, which is the specific
  rule that would have caught the three Dependabot merges: each was green on its
  own branch, none was ever tested against the other two, and git merged three
  lockfile edits as text into something no YAML parser accepts (#120).

  Two jobs are deliberately **not** required, and should stay that way:

  - `deploy` is gated on `github.ref == 'refs/heads/main' && github.event_name
== 'push'`, so it never runs on a pull request. Requiring it would block
    every PR forever, waiting on a check that cannot start.
  - `audit` argues its own exclusion at the top of `audit.yml`: an advisory
    published upstream turns it red with no commit involved, and shipping an
    urgent fix must not wait on it. Requiring it hands a stranger's publishing
    schedule a veto over merges here.

  Expect Dependabot pull requests to start showing an **Update branch** button
  before they will merge. That friction is the feature.

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
