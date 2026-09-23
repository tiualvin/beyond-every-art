# Migration Website Comparator

`pnpm migration:compare` performs the automated crawl comparison required by
the migration rehearsal. It makes read-only `GET` requests to a legacy/source
origin and the staging/target origin, then writes:

- a detailed JSON artifact containing crawl evidence and every finding; and
- a concise text report suitable for a rehearsal log or CI output.

The comparison covers terminal and initial status, redirect chains, titles,
meta descriptions, canonical paths, robots directives, H1 text, JSON-LD types,
image presence and alt-text regressions, legacy image hotlinks, legacy-origin
links, and broken internal links observed during the bounded crawl.

## Run it

```bash
pnpm migration:compare \
  --source https://legacy.example.com \
  --target https://staging.example.com \
  --allow-target-noindex \
  --json .migration-reports/staging-comparison.json \
  --report .migration-reports/staging-comparison.txt
```

The default limits are four concurrent requests, 500 source pages, 1,000 target
pages, eight redirects per URL, a 10-second response timeout, 2 MB per HTML
response, and 500 links/images retained per page. The target defaults to twice
the source page cap (up to the hard 10,000-page bound), leaving capacity for
target-only discovery after every source path is seeded. Set
`--target-max-pages` to choose that independent budget explicitly. View every
option with:

```bash
pnpm migration:compare --help
```

The homepage, `/robots.txt`, `/sitemap.xml`, and `/rss` are seeded by default.
Same-origin URLs listed by robots and sitemap XML (including sitemap indexes)
join the crawl. Use repeatable `--seed /path/` flags for additional important
pages. The target crawl is automatically seeded with every source path, so
removing a navigation link cannot hide a missing legacy URL. Query strings and
fragments are intentionally discarded to avoid crawler traps.

The `--source` and `--target` values must be bare origins such as
`https://example.com`; paths, queries, fragments, and credentials are rejected
instead of silently widening a narrower-looking URL into a whole-origin crawl.

By default, any error exits with status 1. `--fail-on warning` makes warnings
fail too; `--fail-on never` always exits successfully while still reporting all
findings. A source crawl that hits `--max-pages` is an error because coverage is
incomplete. Raise the bound and rerun rather than signing off a partial crawl.

## Safety boundary

The crawler follows redirects and discovers links only on the exact supplied
origin. Cross-origin redirects are recorded but not followed. It accepts no
cookies, inline/URL/CLI credential values, Ghost/Payload exports, or arbitrary
authorization headers. The sole authentication mechanism is the optional
in-memory, environment-backed Basic header described below. Output files are
created with owner-only permissions. By default both reports are placed in the
git-ignored `.migration-reports/` directory, but they should still be treated
as operational artifacts and reviewed before sharing. If you pass `--json` or
`--report`, you are responsible for choosing an ignored, private custom path;
the comparator does not modify `.gitignore` for arbitrary destinations.

For a password-protected staging site, run from an allowlisted environment or
name an environment variable containing the `user:password` pair:

```bash
STAGING_CRAWL_BASIC_AUTH='crawler-user:temporary-password' \
  pnpm migration:compare \
  --source https://legacy.example.com \
  --target https://staging.example.com \
  --target-basic-auth-env STAGING_CRAWL_BASIC_AUTH
```

`--source-basic-auth-env` is available under the same rules. The flags accept
only an environment variable **name**, never credentials. The value and encoded
Authorization header remain in memory and are never included in URLs, errors,
JSON, text reports, or crawl options. Do not commit the variable to an env file;
set it only for the command and rotate the temporary credential after the
rehearsal.

Staging must remain `noindex` during rehearsal. Pass
`--allow-target-noindex` there: it ignores only `index`, `follow`, `noindex`,
`nofollow`, and the expected empty-versus-root `Disallow` polarity while
continuing to compare every non-root `Disallow` and other robots directive.
Absolute `Sitemap` origins are normalized for source/target comparison while
their paths and queries must still match. Omit the flag for a production
comparison so an accidental production `noindex` remains a hard failure.

The command never reads `robots.txt` to expand crawl permission: staging is
expected to be `noindex`, and robots behavior is evidence that must be compared.
It still remains bounded and exact-origin. Coordinate the rehearsal with site
operators so the configured concurrency is appropriate.

## Reading findings

Errors represent migration acceptance failures or incomplete evidence, such as
an unexpected target 404, changed title/description/canonical, newly introduced
`noindex`, newly introduced temporary redirect, lost image/missing alt
attribute, old-origin media hotlink, or crawl failure. Warnings identify review
items such as changed headings,
structured-data types, robots differences that do not add `noindex`, or links
that still point at the old site.

Canonical comparison intentionally compares path and query rather than hostname
because source and target origins differ. Separately, every target canonical is
required to point to the target origin.

An explicit empty alt attribute (`alt=""`) is valid evidence for a decorative
image. The comparator reports an alt regression only when the target has more
images with the attribute entirely missing than the source.

Images are counted **beneath the chrome**. `images_lost` is an error and asks
whether a page has no images at all, which stops being a useful question the
moment a template puts one on every page — as a masthead wordmark did here on
18 Sep, making the check unable to fire sitewide however much a page had lost.
So the comparator first works out what is sitewide on each side (an image source
on at least 90% of that side's successfully crawled pages, and only where there
are at least five to judge from), subtracts it, and warns as `images_reduced`
when a page's remaining content images are fewer on the target than the source.

It is a warning, not an error, and deliberately: the two sides are different
themes, so a difference of one is ordinary and only an eye can judge the rest.
Read it as a list of pages to look at, not as a gate. A crawl too small to tell
a template from a coincidence subtracts nothing rather than guessing.

## After cutover: replaying the source

Once DNS moves, the old site is no longer anywhere a crawler can reach. The
domain answers from the new site, and Ghost(Pro) answers its own hostname with a
redirect back to the domain for every public path — a crawl of it records one
out-of-scope redirect per seed, discovers nothing, and fails without having
compared a single page.

So the source is read back from the last crawl that could see it. Every JSON
report keeps the whole source crawl under `.source`, and `--source-crawl`
compares that against a fresh target crawl instead of crawling a source:

```bash
pnpm migration:compare \
  --source-crawl rehearsal/site-comparison.json \
  --target https://www.example.com
```

The target is seeded with every source path exactly as in a live run, and the
report states that the source was replayed so it is never taken for a live
crawl. `parseStoredCrawl` (`lib/migration-verification/replay.ts`) refuses a
file with no pages, a source origin that is not a bare origin, or a crawl that
hit its page cap — live, that last one is an error, and a replay must not turn
it into evidence. `--seed`, `--max-pages` and `--source-basic-auth-env` only
shape a source crawl, so they are refused alongside `--source-crawl` rather than
quietly ignored; `--target-max-pages` still sets the target's budget.

**Two checks change meaning when both sides share an origin**, which after
cutover they do. `legacy_origin_link` is skipped: every link on the new site
points at the old site's origin, because it is the same one. `legacy_image_hotlink`
keeps its purpose by becoming a path — an image still requested from Ghost's
`/content/images/`, directly or through `next/image`, which nothing on this site
serves.

The production run itself — what to check first, the exact command, and the
findings to expect — is in
[`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) §6, "The production run".

This comparator complements rather than replaces manual rendering checks,
Payload admin/draft checks, sitemap/RSS validation, backup restoration, or
post-cutover monitoring described in `docs/MIGRATION_REHEARSAL.md`.
