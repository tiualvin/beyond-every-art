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
  --json rehearsal/site-comparison.json \
  --report rehearsal/site-comparison.txt
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

This comparator complements rather than replaces manual rendering checks,
Payload admin/draft checks, sitemap/RSS validation, backup restoration, or
post-cutover monitoring described in `docs/MIGRATION_REHEARSAL.md`.
