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
>
> **And query the database rather than crawling.** The 30 Aug audit did, and it
> is the reason it found anything: a crawl cannot see drafts, and it cannot see
> a field that exists in the export but never reached Payload. Three of the four
> defects it turned up were invisible from outside. Give every scan a positive
> control — a column that must be non-zero if the query is really running
> against real data — because an all-zero result reads identically whether it
> means "clean" or "this query does not match your data", and on the first scan
> here it meant the latter.

- [x] **Content counts** match the Ghost admin (posts, pages, tags, authors).
      Posts, pages and authors are settled (30 Aug): 113 published + 4 draft
      posts and 2 published pages, against Ghost's sitemap of 113 posts and 3
      pages — one of those being the homepage — and 119 rows in the export's
      `posts` table, which carries pages too. This is set equality rather than
      matching totals: the 29 Aug audit requested all 127 indexed Ghost URLs on
      staging and every one returned 200, so every Ghost post is known to be
      here. **Tags: answered on 4 Sep, and it was a defect.** The tenth is
      `news`, filed against nothing. Ghost 404s an empty tag archive; Payload
      served it 200 with "Nothing filed under this topic yet" and listed it in
      the sitemap, so cutover would have offered Google a thin URL the old site
      never had. The sitemap now lists only tags a listed post is filed under
      (`referencedTagIds` in `lib/seo/sitemap.ts`), which is the rule
      `getTagsWithCounts` already applied to the topic chips. Staging's sitemap
      otherwise contains every one of Ghost's 127 URLs — set equality, checked
      by diffing the two sitemaps rather than comparing totals.
- [ ] **Recent posts** render correctly, including embeds and captions.
      Mostly answered in bulk (30 Aug) rather than by sampling, because there is
      nothing to sample: across 117 bodies there are **zero embeds, zero inline
      images and zero figcaptions**. Feature-image credits were dropped by the
      import and have been restored — see `DEPLOYMENT_STATUS.md`. What still
      needs a browser is a general look at a few articles. The single post
      carrying a `<table>`
      (`limited-edition-vs-open-edition-prints-which-is-right-for-you`, the only
      one of 117 with Ghost card markup) serves 200 on staging with its table
      and its one `figcaption` intact (4 Sep).
- [ ] **Drafts** are still drafts and are not publicly reachable. The count has
      survived two write passes at 4 (30 Aug), which is the half of this a query
      can answer. Whether a draft URL actually 404s is still unverified.
- [ ] **Media** loads from R2 (not the old Ghost domain) with alt text intact.
      Loading is verified (30 Aug): 110 records, all `migrated`, R2 holding 327
      objects, and **no body anywhere references the Ghost domain** — see the
      content audit in `DEPLOYMENT_STATUS.md`. One exception: **media id 4 has
      no bytes in R2** and needs re-uploading — confirmed still missing on
      4 Sep, in both the extensionless and `.jpeg` forms, and it is the only
      broken image on the site: every other post's `og:image` was requested and
      all 108 returned 200. The post it belongs to is
      `the-ultimate-guide-to-understanding-different-types-of-art-prints-giclee-lithographs-and-more`,
      which is published and is missing both its feature image and its sharing
      card. "Alt text intact" is neither pass
      nor fail as written, because **Ghost had none** — 118 `posts_meta` rows,
      zero non-empty `feature_image_alt` — so nothing was lost. The importer
      fills `alt` with the filename because the field is required, and
      `toAltText` in `lib/content/media.ts` collapses that to an empty string
      before it reaches a reader, which is correct: a filename read aloud is
      worse than an image marked decorative. Confirmed in the rendered HTML.
- [x] **URLs** preserve the original slugs and trailing-slash structure.
      Verified 29 Aug against real content: every URL in Ghost's four sitemaps —
      113 posts, 3 pages, 9 tags, 2 authors, **127 in total** — was requested on
      staging and **all returned 200**. Served directly, not redirected, which
      is the stronger result: the domain, the paths and the trailing slash are
      all unchanged, so there is nothing to forward.
- [x] **Redirects** validated in full by the command below — not spot-checked.
      Verified 29 Aug: 5 checks, 0 warnings. The one real Ghost redirect plus
      the built-in probes for `/page/2/`, `/page/3/`, `/tag/<slug>/page/2/` and
      `/author/<slug>/page/2/` — the pagination shapes no export covers. Both
      Ghost exports on the VPS contain exactly one rule and it is in the table,
      so nothing was dropped at import. `/ads.txt` failed and is now served by
      Caddy (#123).
- [x] **Canonical URLs**, meta titles, and descriptions are preserved. Checked
      4 Sep across **all 113 posts**, by fetching each from the live Ghost site
      and from staging and comparing the rendered metadata rather than sampling.
      Meta descriptions: 113 of 113 identical. Canonicals: 112 identical, and
      the one difference was a real defect —
      `fine-art-home-guide` declared `.../__GHOST_URL__/fine-art-home-guide/`,
      because the importer passed Ghost's placeholder through and
      `migrate:validate` compares it against the export, where the placeholder
      is exactly what the export says. The importer strips it now, and
      `pnpm fix:ghost-links` repairs the written row. **Titles were the larger
      find**: none of the 113 matched, because the layout templated a suffix
      onto every page. Ghost's own rule — bare on posts and pages, suffixed on
      tag and author archives, brand-plus-tagline on the homepage — is restored
      and pinned by `tests/seo/document-titles.test.ts`.
- [x] **Sitemap** (`/sitemap.xml`), **RSS** (`/rss`), and **robots** are correct.
      Checked 4 Sep on staging: robots serves `Disallow: /` under
      `NEXT_PUBLIC_NOINDEX` with the matching meta tag, all four Ghost child
      sitemaps 301 to `/sitemap.xml`, `/rss` 308s to `/rss/` and carries 20
      items against Ghost's 15. The feed's channel `<description>` was empty
      against Ghost's and now falls back to the site description.
- [ ] **Payload admin** loads and editing works.
- [ ] **Draft preview** works from the admin Preview button.
- [ ] **Forms** (search, newsletter signup) submit successfully.
- [ ] **Email** delivery works (trigger an admin password reset; confirm receipt).
- [ ] **Health** endpoint (`/health`) returns `status: ok`.

The redirect line above is the one item on this list that a spot-check cannot
stand in for: a broken rule looks exactly like a URL nobody has asked for yet,
so checking "several" of them says nothing about the rest. Check all of them.

**Pass `--tag` and `--author` with real slugs.** Without them the run silently
covers only `/page/2/` and `/page/3/`, leaves the tag and author pagination
rules untested, and still reports success. That is the larger surface and the
part no Ghost export mentions.

**Take the URL list from Ghost, never from staging.** A post that failed to
migrate is absent from staging's sitemap too, so sampling there confirms only
that staging is consistent with itself. Ghost's sitemap index is at
`/sitemap.xml` and splits into `sitemap-posts.xml`, `-pages.xml`, `-tags.xml`
and `-authors.xml`; the apex 301s to the `www` form, so follow redirects.

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
