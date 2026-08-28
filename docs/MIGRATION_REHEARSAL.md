# Migration Rehearsal

A full dress rehearsal on staging, run before the real cutover. The goal is to
surface every problem while the live Ghost site is still authoritative and
nothing is at risk. Record every issue found; do not schedule the cutover until
a rehearsal completes cleanly.

Related runbooks: [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md),
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md),
[`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md).

## 0. Prepare the staging environment

- Deploy the stack to a staging host with `SITE_ADDRESS=staging.<domain>`.
- Set `NEXT_PUBLIC_NOINDEX=1` and `STAGING_BASIC_AUTH=user:password` so the
  rehearsal site is neither indexed nor publicly reachable.
- Point staging at a **staging database** and a **staging R2 bucket/prefix**,
  never production storage.
- Set the R2 (`S3_*`), email (`RESEND_*`), and `NEXT_PUBLIC_SITE_URL` variables.

## 1. Obtain the Ghost exports

From the live Ghost admin / server (see the handoff doc's "Required Ghost
Exports"):

- Content + settings JSON export
- `redirects.json` (or `.yaml`)
- Members CSV
- The complete media archive (`content/images`)

Keep all of these **out of Git** (`.gitignore` already blocks them).

## 2. Bootstrap and import

Inventory editor cards before importing. The command is read-only; the strict
flag turns any known-but-unhandled or previously unknown Ghost card into a
failing migration gate. Raw HTML cards are reported but do not fail because
their lossless destination is `legacyHTML`. Keep the JSON report outside Git
with the other private rehearsal evidence.

```bash
pnpm inventory:ghost -- \
  --input ghost-export/ghost-content.json \
  --examples \
  --json .migration-reports/ghost-card-inventory.json \
  --fail-on-unhandled
```

Resolve every reported gap or record why preserving it in `legacyHTML` is the
correct migration behavior before continuing.

```bash
pnpm bootstrap:admin                       # one administrator, then unset the vars
pnpm migrate:ghost    --dry-run --input ghost-export/ghost-content.json
pnpm migrate:ghost              --input ghost-export/ghost-content.json
pnpm migrate:redirects          --input ghost-export/redirects.json
pnpm migrate:members            --input ghost-export/ghost-members.csv
```

Review each importer's JSON report for conflicts before the non-dry run.

## 3. Validate the import

```bash
pnpm migrate:validate --input ghost-export/ghost-content.json
```

This exits non-zero and lists discrepancies if any post, page, tag, or author is
missing, a draft flipped to published, a feature image was lost, a slug or
publication date changed, or a meta title, meta description, canonical URL, or
excerpt the export carried did not survive the import. Metadata added after the
import — a description an editor wrote that Ghost never had — is not a
discrepancy. Fix the root cause and re-run until it reports `"ok": true`.

## 4. Manual verification checklist

> [!NOTE]
> **Several of these mechanisms were exercised against a real build on 28 Aug**
> — a local Postgres, the committed migrations, seeded content, a production
> build, and the app served over HTTP. What that establishes is that the
> machinery works; it says nothing about _your_ 117 posts, so none of the boxes
> below are pre-ticked.
>
> Confirmed working: draft posts 404 and appear in neither the sitemap nor the
> feed; a restricted post returns 200 with its withheld body absent from the
> HTML rather than hidden; trailing-slash normalisation; `pnpm validate:redirects`
> exiting zero against a live app, including the built-in Ghost pagination
> rules; redirect `Location` headers resolving to the forwarded host rather than
> the bind address; and `NEXT_PUBLIC_NOINDEX` switching `robots.txt` between
> `Disallow: /` and the public form, with the matching `noindex` meta tag.
>
> So spend the attention on what only real content can show: media loading from
> R2 with alt text, embeds and captions inside migrated bodies, metadata that
> Ghost carried, and the counts matching Ghost admin.

- [ ] **Content counts** match the Ghost admin (posts, pages, tags, authors).
- [ ] **Recent posts** render correctly, including embeds and captions.
- [ ] **Drafts** are still drafts and are not publicly reachable.
- [ ] **Media** loads from R2 (not the old Ghost domain) with alt text intact.
- [ ] **URLs** preserve the original slugs and trailing-slash structure.
- [ ] **Redirects** validated in full by the command below — not spot-checked.
- [ ] **Canonical URLs**, meta titles, and descriptions are preserved.
- [ ] **Sitemap** (`/sitemap.xml`), **RSS** (`/rss`), and **robots** are correct.
- [ ] **Payload admin** loads and editing works.
- [ ] **Draft preview** works from the admin Preview button.
- [ ] **Forms** (search, newsletter signup) submit successfully.
- [ ] **Email** delivery works (trigger an admin password reset; confirm receipt).
- [ ] **Health** endpoint (`/health`) returns `status: ok`.

The redirect line above is the one item on this list that a spot-check cannot
stand in for: a broken rule looks exactly like a URL nobody has asked for yet,
so checking "several" of them says nothing about the rest. Check all of them.

```bash
pnpm validate:redirects --target https://staging.<domain> \
  --input ghost-export/redirects.json \
  --basic-auth-env STAGING_CRAWL_BASIC_AUTH \
  --tag <a-real-tag> --author <a-real-author>
```

It must exit zero. As well as every rule in the export, it checks the built-in
pagination rules — the Ghost URL shapes no export covers — and reports any rule
the middleware matcher can never run. See
[`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md#validating-them).

## 5. Backups and restore

```bash
pnpm backup:db                       # produce a backup to staging R2
pnpm restore:db --latest --dry-run   # verify it decompresses
# Restore into a scratch DB and confirm counts (see BACKUP_AND_RESTORE.md).
```

- [ ] A backup uploads to R2.
- [ ] A restore into a scratch database reproduces the content.

## 6. Crawl comparison

- Run the repository's bounded comparison crawler (see
  [`MIGRATION_WEBSITE_COMPARATOR.md`](MIGRATION_WEBSITE_COMPARATOR.md)):

  ```bash
  pnpm migration:compare \
    --source https://beyondeveryart.com \
    --target https://staging.example.com \
    --target-basic-auth-env STAGING_CRAWL_BASIC_AUTH \
    --allow-target-noindex
  ```

- Review both generated reports. Every important indexed Ghost URL must return
  200 on the new site or a valid permanent redirect — no unexpected 404s,
  changed canonicals, lost metadata/images, or old-origin media hotlinks.
- Supplement the automated evidence with a browser crawler or Search Console
  export when available; important URLs not linked from the source homepage
  should be supplied as explicit `--seed` values.
- Record any gap as a redirect to add before cutover.

## 7. Record and sign off

Log every problem found, its fix, and re-verification. The rehearsal is complete
only when steps 3–6 pass with no outstanding issues. Then proceed to the
[cutover runbook](CUTOVER_RUNBOOK.md).
