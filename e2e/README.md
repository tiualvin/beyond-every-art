# Browser smoke tests

These Playwright tests exercise a small, launch-critical cross-section of the
public site. They are deliberately not a replacement for the migration
validator or a full crawl comparison.

## Local run

The default run owns a local Next.js dev server on `127.0.0.1:3000` but does not
own PostgreSQL. Start the repository's Postgres service, provide the normal
local `DATABASE_URI` and `PAYLOAD_SECRET`, then run:

```bash
pnpm test:e2e:local
```

That command runs the normal development seed first and the small e2e seed
second. Both are idempotent. The e2e seed adds only the launch states absent
from the visual development seed: a draft post, a members-only post, and a
permanent redirect. It refuses production mode and non-local database hosts by
default. Set `E2E_ALLOW_REMOTE_SEED=1` only for an explicitly disposable remote
test database.

Install the Chromium binary once if it is not already present:

```bash
pnpm exec playwright install chromium
```

`pnpm test:e2e` runs the browser suite without seeding. CI uses this after
running `pnpm seed:dev` and `pnpm seed:e2e` against its throwaway Postgres
service. This separation keeps the browser command usable against an already
prepared environment and makes data setup visible in CI logs.

## External environment

Set `PLAYWRIGHT_BASE_URL=https://staging.example.com` to suppress the local
`webServer` and test an already seeded deployment. Do not run the seed commands
against production. The suite assumes the exact synthetic fixture slugs in
`fixtures.ts` exist, so it is intended for local/CI or a disposable rehearsal
database rather than the live editorial database.

Artifacts are written below the ignored `.next/` directory:

- `.next/playwright-report`
- `.next/playwright-results`

The suite covers public route rendering, search and newsletter submission,
metadata plus JSON-LD, robots/sitemap/RSS, health readiness, mobile navigation
keyboard behavior, non-exposure of draft/private content, and redirect status.
Admin editing, authenticated draft preview, email delivery, R2 media delivery,
backup restoration, and the full old-vs-new URL crawl remain rehearsal tasks.
