# Companion App

The Beyond Every Art companion app: a native iOS and Android reading and
discovery app built on the same Payload content as the website. This document
records the decision that let it start, what that decision does not cover, how
the app is laid out and why, what it reads, and what is left for the owner to
decide.

The app lives in [`apps/companion/`](../apps/companion/package.json). It is a
scaffold: it builds, it is tested against the real content contract, and it
reads articles offline. It is not a store-ready product. The read-only content
API it reads from is built into the website under `/app-api/v1/`, and is
**switched off**: every path answers 404 until the owner decides otherwise
([Switching the API on](#switching-the-api-on)).

## The decision

> **Owner decision, 16 Oct 2026:** the Beyond Every Art companion app is in
> scope, and scaffolding may begin now. This lifts the app gate for scaffolding
> only. Reader accounts, sign-in, purchases, push, server-side bookmarks, store
> records and any new Payload collection or field stay gated.

Dated by the owner on 16 Oct 2026, when asked in the session that scaffolded
the app. The brief that commissioned the work carried this decision with its
date left blank, and a decision nobody dated is not one this repository
records.

It answers two things the handoff left open, for scaffolding only:

- Next Action 20 in
  [`GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md)
  — whether a separate companion app remains in scope or the website covers
  that role. It is in scope.
- Priority 6's gate in the same document: "App development begins only after
  the migration, backups, SEO, and production website are stable." Lifted for
  scaffolding, the way the publication system's gate was lifted on 3 Oct 2026
  ([`PUBLICATION_SYSTEM.md`](PUBLICATION_SYSTEM.md), decision 0).

### What scaffolding means here

- An app that builds, is tested against the real content contract, and reads
  articles offline.
- The server endpoint it will eventually read from, built and switched off.

It does not mean a store-ready product.

### What stays gated

Each of these needs its own dated owner decision before any code is written:

- reader accounts and sign-in;
- purchases, subscriptions and store billing;
- push notifications;
- server-side bookmarks, reading history or device tokens;
- App Store and Play Store records, bundle registrations and EAS projects;
- any new Payload collection or field.

### What it must not displace

The open post-cutover items in
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) come first, as they do for the
publication system ([`AUTONOMOUS_WORKSTREAMS.md`](AUTONOMOUS_WORKSTREAMS.md)).
The scaffold adds no load to production and changes nothing a reader of the
website sees.

**Every merge to `main` redeploys the website**, an app-only change included:
`ci.yml` has no path filters and its deploy job runs on every push. Nothing in
`apps/` reaches the image (it is in `.dockerignore`), so such a deploy ships
the same website — but it is still a deploy.

## Layout

### A standalone project, not a workspace

`apps/companion` is an Expo project with its own `package.json`, its own
`pnpm-lock.yaml`, its own `.nvmrc` and its own `engines`. It does **not** join
a pnpm workspace:

- A root `pnpm-workspace.yaml` would change what the production `Dockerfile`
  and every CI job install with `pnpm install --frozen-lockfile`. The website's
  lockfile, `Dockerfile`, Compose file, Caddyfile and deploy job are untouched
  by this work.
- The Expo SDK pins its own React, React Native and Node. SDK 58 needs Node
  22.13 or later; the website runs on Node 20. They need not match, and in a
  workspace they would have to be reconciled.
- The handoff says so itself: "Do not force the initial Ghost migration into
  the full monorepo if doing so threatens the website cutover."

**The full pnpm + Turborepo workspace** — the website moved to `apps/web`,
shared code in `packages/*`, as the handoff's monorepo plan lays out — is a
later, separate migration. It is recorded here and not started. It is on the
owner checklist below.

### The website's tooling stays out

Each root tool walks the whole checkout by default, so each is told to leave
`apps/` alone: `"apps"` in the root `tsconfig.json` `exclude`, `apps/**` in the
ESLint ignores and the Vitest excludes, `/apps/` in `.prettierignore`, and
`apps` in `.dockerignore` so no production image carries the app.

The Prettier entry is anchored on purpose. `.prettierignore` has gitignore
semantics, and an unanchored `apps/` would also match the live route
`app/(frontend)/apps/` and drop it from `format:check` without a word.
[`tests/companion/tooling-isolation.test.ts`](../tests/companion/tooling-isolation.test.ts)
checks every exclusion from both sides: an app path is excluded, and a file
under `app/(frontend)/apps/` is still formatted, linted and typechecked.

### The app stays out of the website's dependencies

A nested project still resolves upward, into the root `node_modules`, where
the website keeps its own React, `@types/react` and `@types/node`. A missing
dependency would be found there and would build — against whatever the
website happens to pin.

- **Install.** `apps/companion/.npmrc` sets `node-linker=hoisted`: a flat
  `node_modules` inside the app, which Expo supports for pnpm projects.
- **Metro and Jest.** Both resolve as they normally would and pass every
  answer through `apps/companion/resolution-guard.js`, which throws if it
  landed outside `apps/companion`. `pnpm export:check` then reads the exported
  source maps and fails if any bundled module came from outside the project,
  because Expo's CLI puts its own resolvers in front of `metro.config.js`.
- **TypeScript.** `typeRoots` is `./node_modules/@types` and `types` is named,
  since TypeScript 6 no longer includes `@types` packages by default.
- **Tests.** `src/__tests__/isolation.test.ts` in the app asserts that `react`
  resolves inside it, that `next` (the website's, not the app's) cannot be
  reached, and that the guard rejects a path two directories up.

**Why a guard rather than `disableHierarchicalLookup`.** The brief asked for
Metro's `resolver.disableHierarchicalLookup` and an absolute Jest
`moduleDirectories`. Both were tried against the real install and both are
wrong for it. The hoisted layout keeps conflicting majors nested: htmlparser2
needs entities 7 in its own `node_modules` while the top level holds entities
4, and expo-router needs react-is 19 over a top-level 18. With hierarchical
lookup off, Metro skips the nested copies and resolves the wrong major without
an error. Bounding the lookup keeps the nested copies and still stops at
`apps/companion` — and the exported iOS bundle shows htmlparser2 reading
`htmlparser2/node_modules/entities`, which is the case that decides it.

### Sharing code without a workspace

The app cannot import from the website, so what it shares is generated.
`pnpm companion:sync` ([`scripts/companion-sync.ts`](../scripts/companion-sync.ts),
run with `tsx`) writes read-only files into `apps/companion/src/generated/`
from tracked sources only:

| File                | From                                                  |
| ------------------- | ----------------------------------------------------- |
| `block-slugs.ts`    | `BLOCK_SLUGS` in `blocks/schema.ts`                   |
| `brand-tokens.ts`   | the two top-level `:root` blocks of `app/globals.css` |
| `reserved-slugs.ts` | `RESERVED_ROOT_SLUGS` in `lib/seo/reserved-slugs.ts`  |
| `contract.ts`       | `lib/app-api/contract.ts`, verbatim                   |

**Brand tokens are colours only, as literal hex.** React Native has no `var()`
and no `color-mix()`, so both are resolved by the sync: `--color-rule`, 26%
ink mixed into paper in sRGB, becomes `#bdb9b3`. Everything else in those
blocks is **omitted**, and the generated file names each omission and why: the
two font stacks (built on next/font variables; the app loads Playfair Display
and Inter itself), the plate gradient, and three layout lengths. The `:root`
inside a media query, which only shortens the masthead on phones, is not read.

Nothing is generated from `payload-types.ts`: it is gitignored, absent in CI's
`checks` job, and new code here stays off it.
[`tests/companion/sync.test.ts`](../tests/companion/sync.test.ts) fails whenever
a generated file no longer matches what the sync would write, and the app's
Prettier and ESLint skip the generated directory so formatting cannot look like
drift.

## Running it

You need Node 22.13 or later (`apps/companion/.nvmrc`) and pnpm, which
Corepack provides from the app's `packageManager` field.

```bash
cd apps/companion
pnpm install
pnpm start          # Expo; press i or a for a simulator, or scan for Expo Go
pnpm test           # Jest, with the React Native preset
pnpm typecheck && pnpm lint && pnpm format:check
pnpm export && pnpm export:check   # the iOS and Android bundles, and where their modules came from
```

**Against fixtures — the default.** With no API configured the app serves
bundled fixtures from an in-process mock of the API, makes no request for
content at all, and says on Today and Read that it is showing sample content.
Fixture images are on a `.invalid` host and never load; the reader shows a
brand plate in their place.

**Against a local website.** Start the website with the API switched on and
bound to an address the phone can reach, against a development database (never
production data). `NEXT_PUBLIC_SITE_URL` must be that same address: the server
builds every article and image URL in an answer from it, and the `.env.example`
value, `localhost`, means the phone itself — every image would fail and every
article link would open in the browser.

```bash
# in the repository root, with .env pointing at a local database
NEXT_PUBLIC_SITE_URL=http://192.168.1.20:3000 APP_API_ENABLED=1 \
pnpm exec next dev --hostname 0.0.0.0 --port 3000
```

Then point the app at it: `EXPO_PUBLIC_API_BASE_URL` at the website, and
`EXPO_PUBLIC_SITE_URL` at the same origin so links to its articles open in the
app — all three the same:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000 \
EXPO_PUBLIC_SITE_URL=http://192.168.1.20:3000 \
pnpm start
```

Never production, until the owner switches the API on there.

## The API contract

The contract is zod schemas with inferred types. Its home is the website, in
[`lib/app-api/contract.ts`](../lib/app-api/contract.ts), because the website is
what keeps it: the routes parse every answer through it, and
[`tests/app-api/contract.test.ts`](../tests/app-api/contract.test.ts) holds it to
`blocks/schema.ts` and the website's search length. The app's copy,
`apps/companion/src/generated/contract.ts`, is written by `pnpm companion:sync`
and checked by the same drift test as the other generated files. The contract
imports nothing but `zod/v4`, which both sides of the repository have — the
website's zod 3.25 ships zod 4 at that subpath — so the copy is verbatim.

Every path is under `/app-api/v1/` and ends in `/`; the website's
`trailingSlash: true` would otherwise answer each call with a 308.

| Endpoint                 | Answers                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `posts/?page=1&limit=12` | a page of live posts, newest first; `limit` is capped at 24                                      |
| `posts/<slug>/`          | one post, or 404                                                                                 |
| `tags/`                  | topics with at least one live post, and their counts                                             |
| `tags/<slug>/`           | a topic and its posts, or 404                                                                    |
| `authors/`               | authors and their counts                                                                         |
| `authors/<slug>/`        | an author and their posts, or 404                                                                |
| `search/?q=…`            | posts whose title or standfirst matches; the term is trimmed, collapsed and cut to 64 characters |

Every error status answers `{ "error": "…" }`.

**What the API serves is what the website shows a signed-out reader,
processed on the server**: live posts only; a gated post's teaser and never the
rest; the leading title heading and comment-only paragraphs removed; paywall
markers removed; links to unpublished articles unlinked. The app renders a
body as received and never runs those rules again — re-stripping a title would
remove a real heading that happens to share its wording.

**A body is a tagged union:**

- `lexical` — an allow-listed projection of Payload's Lexical JSON. The same
  node types and nesting, only the keys a reader needs. Text carries Lexical's
  own format bits. Uploads carry a `Media`. Internal links carry a `slug` and an
  `href`, and nothing of the document they point at. Blocks carry their own
  projected fields.
- `html` — the processed `legacyHTML` most migrated posts render from.
- `empty`.

**Media** has exactly `url`, `alt`, `width`, `height`, `cardUrl` (768px),
`ogUrl` (1200×630), `credit` and `creditHref`, with absolute URLs.
`creditHref` is built on the server by
[`lib/content/attribution.ts`](../lib/content/attribution.ts), the only thing
allowed to build a credit link; the app renders it or renders the credit as
text, and never builds one.

**Forward compatibility.** A newer server may send a node or block type the app
predates. Before validating a body the client runs `markUnsupported`, which
replaces any unknown type with an `unsupported` marker, so one new node costs
that node rather than the article. A known type with the wrong shape still
fails validation — that is a broken server, not a newer one.

### The server side

Seven `GET` routes under [`app/app-api/v1/`](../app/app-api/v1/posts/route.ts),
one per row of the table above. Six read through the reader the website's own
page uses — `getPublishedPosts`, `getPostBySlug`, `getPostsByTag`,
`getPostsByAuthor`, `getTagsWithCounts` and `searchPosts` in
`lib/content/queries.ts` — so `live()`, the teaser cut, the withheld links and
the ten-minute content cache apply exactly as they do on the site. The seventh,
`getAuthorsWithCounts`, is new: the website has no authors index, so it was
added beside `getTagsWithCounts`, in its shape, counting live posts only and
cached the same way. Nothing here queries Payload's REST API, and nothing
re-implements a rule the website already has.

**Two allow-lists stand between a document and a response.**
[`lib/app-api/project.ts`](../lib/app-api/project.ts) builds every body node
and block from named keys only; a media document, an internal link's target
and a block's relationship fields contribute exactly what the contract names
and nothing else. Then each route parses its answer through its contract
schema on the way out, which drops any key nobody listed — so a field added to
a reader type later cannot reach a client by being passed along, and a value
that breaks the contract is a 500 on the server rather than a broken client.
[`tests/app-api/project.test.ts`](../tests/app-api/project.test.ts) feeds the
projection a depth-2 document whose links, uploads and relationships are full
of fields that must not leave, and fails if any does.

Internal links are resolved here, to a slug and an absolute slashed `href`, and
only when the target is live; a link to a draft or a scheduled post arrives as
its text. The website's own renderer does not yet do this for Lexical links an
editor made with the internal-link option — it renders them as `#` — which is
a website issue, recorded rather than fixed here because the fix changes
crawled HTML.

**What it costs a stranger to ask**, all in
[`lib/app-api/http.ts`](../lib/app-api/http.ts) and each route:

- **The switch.** Unless `APP_API_ENABLED=1`, every path answers 404 to every
  method before anything is read, counted or cached. `middleware.ts` answers
  for the whole prefix, because Next implements `OPTIONS` and a 405 for
  methods a route does not export without asking the handler; each handler
  checks again for itself. Only `playwright.config.ts` sets it.
- **Rate limits per source address:** 120 reads and 30 searches a minute, the
  second separate because a search is a scan keyed on the text sent
  (`RATE_LIMIT_APP_API_PER_MINUTE`, `RATE_LIMIT_APP_API_SEARCH_PER_MINUTE`).
  Per container, like every limiter here: Cloudflare is the first line.
- **Slugs** are checked for shape before any read, and a well-formed slug that
  misses spends the same per-source allowance the page routes spend
  (`lib/security/slug-requests.ts`), so guessing through the API and through
  the website draws on one budget.
- **Pages:** `limit` is capped at 24 rather than refused, `page` and `limit`
  must be plain positive integers, and `page` stops at 1000, which bounds the
  cache keys a caller can mint.
- **Search** goes through the website's `normaliseSearchTerm`: trimmed,
  collapsed, cut to 64 characters.
- **Headers.** Answers are `Cache-Control: public, max-age=300,
stale-while-revalidate=300` — half the content cache's lifetime each, so a
  client is never further behind than the website can be. Errors are
  `no-store`. Everything carries `X-Robots-Tag: noindex`.

`app-api` is a reserved root slug (`lib/seo/reserved-slugs.ts`), added with the
routes, so no post or page can be published at the API's path. Nothing else
crawler-facing changed: the sitemap does not list the API, and `robots.txt`
does not mention it — a `Disallow` line is a crawler-facing change, and the
`noindex` header already keeps answers out of results.

[`tests/app-api/routes.test.ts`](../tests/app-api/routes.test.ts) covers each of
those against mocked readers, and [`e2e/app-api.spec.ts`](../e2e/app-api.spec.ts)
covers the real readers against a seeded database: slashed URLs, a gated post
cut to its teaser, a draft that answers like a slug never used, and every
answer unchanged by its schema. In CI a second server from the same build runs
with the switch off, and the spec shows every path, and `OPTIONS`, `POST` and
`DELETE`, answering 404 there.

### Switching the API on

The owner's decision, and the only thing that makes the app useful outside a
development machine. Before setting `APP_API_ENABLED=1` in production:

1. **Cloudflare challenges.** Bot Fight Mode, Browser Integrity Check and any
   managed challenge answer a non-browser client with an HTML page the app
   cannot solve. Exempt `/app-api/` from each with a configuration or WAF
   skip rule, scoped to that path and nothing wider.
2. **An edge rate limit**, optionally: a WAF rate-limiting rule on
   `/app-api/` puts a bound in front of the per-container limiters, which
   reset on every deploy.
3. **Edge caching**, optionally: Cloudflare does not cache JSON by default. A
   cache rule for `/app-api/v1/` that respects the origin's `Cache-Control`,
   with the query string in the cache key, takes repeat reads off the origin;
   without one, every read reaches the content cache in the container.
4. **Set the variable** in the production environment file and redeploy.
   Verify from outside: `/app-api/v1/posts/` answers JSON with
   `X-Robots-Tag: noindex`, and an unslashed path answers 308.

Switching it off again is unsetting the variable and redeploying; nothing is
stored, so there is nothing to clean up.

## The native renderer

The reader lives in `apps/companion/src/reader/`. It is not a web view: every
node and block is drawn with native views.

**Rich text** renders headings, paragraphs (every Lexical format), lists
(nested, numbered from any start, and checklists a screen reader announces),
quotes, horizontal rules, images and links. Each of the 15 blocks has an
explicit renderer, typed as a record over the generated block slugs, so a
block the website adds is a compile error in the app until somebody decides
how it renders on a phone:

| Block             | In the app                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accordion`       | Native: panels that expand on tap, open by default where the editor said so                                                                            |
| `pullQuote`       | Native: the quotation in the display face; the attribution links to `sourceHref` in the browser                                                        |
| `signup`          | **Link-out**: the heading and copy, and a button to the website's newsletter page. No address field                                                    |
| `callout`         | Native, in its tone; the decorative emoji is hidden from screen readers, as on the website                                                             |
| `button`          | **Link-out**: follows the link policy — an article opens in the app, anything else in the browser                                                      |
| `gallery`         | Native: a two-column grid or stacked rows, with captions                                                                                               |
| `bookmark`        | Native card that opens the link in the browser                                                                                                         |
| `embed`           | **Link-out**: a card naming the video and its provider, opening it in the browser. No player, no web view, and no request to the provider until tapped |
| `paywall`         | Nothing. The server cuts at it and removes it; arriving at all would be an error                                                                       |
| `keyTakeaways`    | Native: a heading and a numbered list                                                                                                                  |
| `faq`             | Native: each question a heading, each answer rich text                                                                                                 |
| `featureList`     | Native: numbered when the website numbers it, with optional images                                                                                     |
| `mediaText`       | Native: image first, then text, whichever side the website puts the image on                                                                           |
| `comparisonTable` | Native: one card per row, each cell labelled with its column; missing cells padded, as on the website                                                  |
| `keyFacts`        | Native: label and value pairs                                                                                                                          |

An **unknown node or block** renders nothing and warns once per type in
development. It never crashes the article.

**Migrated HTML** goes through an allow-list built on htmlparser2. Scripts,
styles, frames, forms and media players are dropped with their contents; only a
link's `href`, an image's `src`, `alt` and size, and a list's `start` survive;
unknown elements are unwrapped; links and images resolve against the article's
URL and keep only http(s), or mailto for a link. Links in a legacy body are not
withheld the way rich-text links to unpublished posts are — everything a
migrated post links to was published before it.

**Links.** A link to an article on the site (`https://www.beyondeveryart.com/<slug>/`,
apex or `www`) opens in the app. A one-segment path that a website route owns —
`/journal/`, `/search/`, the generated reserved slugs — and everything else
opens in the system browser. A link to a page rather than an article reaches the
reader, finds no post, and offers the website instead.

**Gated posts** show the website's teaser and say memberships are not open
yet, with no button, nothing to buy and nowhere to sign in. The app never
receives the rest of the piece.

## On the device

Bookmarks, saved-for-offline articles and palettes are device-local, behind a
`LibraryStore` interface in `apps/companion/src/library/`, so a server-backed
version can replace the implementation later without touching a screen.

**expo-sqlite, not MMKV.** expo-sqlite ships inside the Expo SDK, so its version
moves with the SDK and it runs in Expo Go as well as a development build. The
library is a few small tables read in order, not a bag of keys. And the same
engine serves the query cache through `expo-sqlite/kv-store`, so the device has
one storage engine rather than two. MMKV is faster for single keys, which is
not where the time goes. The SQLite store's tests run its real statements
against Node's own SQLite. If the database will not open, the library runs in
memory for the session and the Library tab says so.

**Offline reading.** Saving an article stores the validated copy and
pre-fetches its images into expo-image's disk cache. That is best effort: the
system may evict an image cache it needs the space for, and the words survive
either way. Reading an article tries the network first, refreshes a saved copy
with what the website now says, and falls back to the saved copy offline,
telling the reader which copy they have. Separately, the query cache persists
successful content reads (not searches, not the library) for a week, so an
article read yesterday usually opens on a train today.

## Design

- **Brand.** Paper, ink and burgundy from the generated tokens, Playfair Display
  and Inter bundled from `@expo-google-fonts` one weight per file. Every text
  pairing in every palette is held to WCAG AA by a test.
- **Dark appearance — a PROPOSAL.** The website has no dark palette. The app's
  is derived rather than invented — every colour a brand token or a mix of two
  — and waits on the owner (checklist below).
- **Liquid Glass**, only on navigation chrome: the native tab bar (drawn by iOS
  26 itself) and the reader's floating actions, which use `expo-glass-effect`
  only when the build and the device's API both support it and the reader has
  not turned on Reduce Transparency. Otherwise a solid surface with a hairline.
- **Android** gets its own treatment: a Material tab bar and an elevated tonal
  surface in the brand's colours, not an imitation of Apple's material.
- **Accessibility.** Dynamic Type everywhere (nothing turns font scaling off),
  44-point touch targets, Reduce Motion (nothing animates), Reduce
  Transparency, and Increase Contrast or Android's high-contrast text, which
  switch to a stronger palette. Every control has a label and a role; nothing
  depends on hover or translucency alone.

## CI

`.github/workflows/companion.yml` installs from the app's own lockfile, on the
app's own Node and pnpm, then typechecks, lints, checks formatting, tests,
exports the iOS and Android bundles and checks where their modules came from.
It is path-filtered to `apps/companion/**`, the sync script and the website
sources the sync reads, the contract among them. It is **not** in the website deploy job's `needs`, and
must not be: a red app build is never a reason to hold a website fix. Whether a
generated file is current is checked by `ci.yml`'s `checks` job, on every push.

**Dependabot: yes, one grouped weekly pull request for `/apps/companion`.**
Expo-managed packages are ignored — the SDK sets React, React Native, every
`expo-*` module and `jest-expo` together, and they move on an SDK upgrade with
`npx expo install --fix`, not one at a time. ESLint majors are held for the same
reason as the website's: the plugins in `eslint-config-expo` do not accept
ESLint 10.

**Audit: not yet.** `pnpm audit --prod` in the app measures build tooling. On
16 Oct 2026 it reported four advisories — uuid, node-forge, braces and
sprintf-js — all under the Expo CLI, Metro, Expo's config plugins or Jest, and
the exported source maps show none of them in either bundle. A blocking job on
that number would fail on what never reaches a phone. The audit that would mean
something checks the bundle's own module list, which `pnpm export:check`
already enumerates; build it when the app is headed for a store.

**Not run in CI or in this scaffold's verification: a simulator or emulator.**
`expo export` builds the JavaScript bundles; nothing here has been run on an iOS
simulator, an Android emulator or a device, and the native tab bar, Liquid
Glass and the SQLite database have only been exercised through their
JavaScript interfaces and tests.

## Identifiers and links

- **Bundle identifier and application ID:** `com.beyondeveryart.companion` for
  both platforms — _PROPOSED — owner confirms ownership before any store
  record._ The deep-link scheme `beyondeveryart` is proposed on the same terms.
  Both are in `apps/companion/app.config.ts` so the app can build; neither
  registers anything.
- **No EAS project.** `eas.json` has `development`, `preview` and `production`
  profiles and no `projectId`.

**Universal links and App Links are not added**, because both are crawler-facing
files on the website and need the owner's go-ahead. What they will need:

- An `apple-app-site-association` file at `/.well-known/` naming the Apple Team
  ID (`<TEAMID>.com.beyondeveryart.companion`). It must match post URLs, which
  are single slashed segments — `/*/` — and exclude every reserved root
  segment, which is a route of its own: `/tag/*`, `/author/*`, `/journal/`,
  `/search/`, `/apps/*`, `/publication/*`, `/newsletter/` and the rest of
  `lib/seo/reserved-slugs.ts`.
- An Android `assetlinks.json` at `/.well-known/` with the release signing
  certificate's SHA-256 fingerprint, which exists only once there is a Play
  record.
- Note that `/.well-known/` is already reserved
  (`lib/seo/reserved-slugs.ts`) and that the Caddyfile and middleware treat
  dotted paths specially; serving these is a change to both, not a file drop.

**The ask:** the Apple Team ID, the Play signing fingerprint, and approval to
publish both files.

## Deferred, and what each needs

| Item                               | What it needs                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts and emailed-link sign-in  | The separate `accounts` collection and passwordless emailed links of [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md), no social sign-in in v1. Every sign-in is a send, so a transactional provider becomes required: the Resend adapter exists in `lib/email/resend.ts`. **Not Klaviyo** — a sign-in token never goes through the ESP ([`EMAIL.md`](EMAIL.md)). Mobile clients use secured network APIs and never receive administrative credentials. |
| Server bookmarks and device tokens | Collections and migrations, once scheduled. `LibraryStore` is the seam a server-backed version replaces.                                                                                                                                                                                                                                                                                                                                      |
| Push                               | A provider, undecided, and push credentials per platform.                                                                                                                                                                                                                                                                                                                                                                                     |
| RevenueCat and store billing       | The rules in [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md) and [`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md): one server-decided subscription flag ("never trust the client"), RevenueCat keyed on the Payload account ID and never the email, sign-in required before purchase, Restore Purchases, the purchase option hidden for an active account.                                                                                       |
| Universal links                    | The ask above.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Analytics and consent              | A decision on whether the app measures anything at all; any SDK that sends data off the device is an ask, and none is installed.                                                                                                                                                                                                                                                                                                              |

## Owner checklist

- [ ] **Bundle identifier and app name** — confirm
      `com.beyondeveryart.companion`, the `beyondeveryart` scheme, and the
      name "Beyond Every Art".
- [ ] **Store records** — App Store Connect and Play Console, and the EAS
      project, none of which exist.
- [ ] **App icon and splash artwork** — none is committed; the splash is the
      brand's paper colour alone.
- [ ] **Push provider.**
- [ ] **Analytics** — whether to measure, and with what consent.
- [ ] **Offline policy for gated posts** — today a members-only or
      subscriber-only post can be saved, and the saved copy is the teaser the
      website shows; is that the rule?
- [ ] **Enabling the content API** in production, after the Cloudflare
      steps in [Switching the API on](#switching-the-api-on).
- [ ] **The dark palette** — adopt, change or drop the proposal.
- [ ] **The workspace migration** — when to move to the pnpm + Turborepo
      workspace with the website in `apps/web`.
