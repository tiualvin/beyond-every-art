# Companion App

The Beyond Every Art companion app: a native iOS and Android reading and
discovery app built on the same Payload content as the website. This document
records the decision that let it start, what that decision does not cover, how
the app is laid out and why, what it reads, and what is left for the owner to
decide.

The app lives in [`apps/companion/`](../apps/companion/package.json). It is a
scaffold: it builds, it is tested against the real content contract, and it
reads articles offline. It is not a store-ready product.

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
content at all, and marks Today with a small "Preview · sample articles"
badge. Two sets, chosen with `EXPO_PUBLIC_FIXTURE_SET`:

- `showcase`, the default: nine hand-written sample articles in the journal's
  range — pigments, materials, conservation, technique — so a preview build
  and its screenshots look like the product
  ([`fixtures/showcase.ts`](../apps/companion/src/fixtures/showcase.ts)). None of
  it is production content and its claims stay general. The badge is on Today
  only, so an article opened from another tab has to read as a sample on its
  own: the byline is a stand-in, "Sample author", and nothing is signed or
  credited with the publication's name.
- `modules`: the test cases — every block, link kind, unknown node and seeded
  edge case the reader handles. The tests use this set.

```bash
EXPO_PUBLIC_FIXTURE_SET=modules pnpm start
```

Fixture images are on a `.invalid` host and never load: a lead or body image
shows the website's plate wash in its place, and a list thumbnail drops out.

**Against a website.** Set `EXPO_PUBLIC_API_BASE_URL` to a website serving the
content API — a local `pnpm dev` with the API switched on, never production
until the owner says so — and `EXPO_PUBLIC_SITE_URL` to the same origin, so
links to its articles open in the app:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000 \
EXPO_PUBLIC_SITE_URL=http://192.168.1.20:3000 \
pnpm start
```

The website's endpoint does not exist yet. Until it does, fixtures are the
only source.

## The API contract

The contract is zod schemas with inferred types, in
[`apps/companion/src/api/contract.ts`](../apps/companion/src/api/contract.ts).
It imports nothing but `zod/v4`, which both sides of the repository have —
the website's zod 3.25 ships zod 4 at that subpath — so it can move to the
website unchanged when the endpoint is built, and the app's copy can be
generated from it under the same drift test.

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

## The native renderer

The reader lives in `apps/companion/src/reader/`. It is not a web view: every
node and block is drawn with native views.

**Rich text** renders headings, paragraphs (every Lexical format), lists
(nested, numbered from any start, and checklists a screen reader announces),
quotations, horizontal rules, images and links. A quotation is set the way the
website's `.prose blockquote` sets one — centred serif italic between two
hairlines under a burgundy opening mark — in rich text and migrated HTML
alike. Each of the 15 blocks has an
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
article read yesterday usually opens on a train today. The cache pauses network
reads while the device is offline; the library's reads and writes are marked as
local so they never wait for a connection they do not use.

## Design

The target is the website's own: its tokens, its concept boards and the HTML
prototypes in [`WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md) and
[`WEBSITE_REDESIGN_PROTOTYPES.md`](WEBSITE_REDESIGN_PROTOTYPES.md), read through
iOS's and Android's own conventions. A review against those references on 17 Oct
2026 found the first scaffold "a well-built prototype of a reading app, not a
magazine": the website's colours and faces without its composition. Phase 1 of
the fixes is in; what remains is listed at the end of this section.

- **Brand.** Paper, ink and burgundy from the generated tokens; Playfair Display
  and Inter bundled from `@expo-google-fonts`, one weight per file. Every text
  pairing in every palette is held to WCAG AA by a test, including text, muted
  and links on the `code` tint behind inline code and highlights.
- **Type is a set of roles**, not sizes
  ([`theme/typography.ts`](../apps/companion/src/theme/typography.ts)). Three
  Playfair weights do the work: semibold for what leads a screen, medium for
  headlines in a list, regular for a standfirst and quotations. The editorial
  ladder steps by about a fifth (body 17, h3 20, h2 24, title 28, display 34),
  and a test holds each of those levels at least 15% above the next; h4 shares
  body's size and is told apart by face, and interface text (12 to 15pt) sits
  below the ladder. Headings are set slightly tight as on the website, and an
  article's title is never smaller than its own teaser. A small uppercase
  `section` label names list groups only — `PRODUCT.md` rules out an eyebrow
  over every title.
- **Space and rules group a screen.** Sections sit 48pt apart, each opened by
  its label standing on a 1pt rule; rows are divided from each other by
  hairlines. A list row leads with its headline and keeps its topic quiet in
  the footer beside the date; only the lead carries a burgundy kicker. Rich
  text inside a box, a quotation included, is spaced by the box rather than by
  trailing margins. The topic chips scroll under the screen's edge.
- **Controls are the platform's shape.** Buttons, chips and search fields are
  capsules; content surfaces keep the website's 2pt edge. A quiet action is a
  burgundy tint, never an outline in body ink. Text fields have a border at 3:1
  against the page (WCAG 1.4.11). A control ripples on Android or dims
  elsewhere, never both, and the ripple is clipped to the capsule by a parent
  view, since Android draws it to the pressable's own rectangle. A call to
  action inside an article sets its label as the website's `.button` does —
  small, uppercase, tracked — while interface buttons stay in sentence case.
- **Images have three states.** Loading sits on the quiet `line` colour. A
  failed lead or body image shows the website's plate wash, the same 148°
  gradient as `--plate-wash` (drawn with `expo-linear-gradient`); a failed list
  thumbnail leaves the row, and a credit leaves with its picture. Body images
  keep their own ratio, from the server or from the picture once loaded, rather
  than a crop. What a picture learned while loading belongs to that source: a
  row reused for another article starts again.
- **Honest, without the roadmap.** Empty states say what will appear and, where
  there is a next step, offer it — Library's leads to Read, Studio's starts a
  palette — and a failed read offers Try again. The interface does not describe
  the app's plans, with one exception that waits on the owner: a members-only
  article says memberships are not open yet (`MembershipNotice`), since the
  alternative is an article that stops without saying why. Colour of the day is
  the colour itself, named on it in ink or paper, from the mid-tone pigments.
- **Dark appearance — a PROPOSAL, corrected.** The website has no dark palette.
  The app's is derived rather than invented: brand tokens, mixes of two, and
  burgundy's own hue lifted for the accent (`#d18592`), because mixing burgundy
  toward paper drains it into mauve. The button is the website's on-dark one
  (paper fill, burgundy-deep label) and a dark callout stays dark (`#2d1217`).
  It waits on the owner (checklist below).
- **Liquid Glass**, only on navigation chrome: the native tab bar (drawn by iOS
  26 itself) and the reader's floating actions, which use `expo-glass-effect`
  only when the build and the device's API both support it and the reader has
  not turned on Reduce Transparency. Otherwise a solid surface with a hairline.
- **Android** gets its own treatment: a Material tab bar, an elevated tonal
  surface in the brand's colours, ripples on controls and 48dp targets, not an
  imitation of Apple's material.
- **Accessibility.** Dynamic Type everywhere, each role along its own iOS text
  style's curve (headlines grow like headlines, body like body; Android caps
  headline growth at 1.6×), 44pt touch targets on iOS and 48dp on Android,
  Reduce Motion (nothing animates), Reduce Transparency, and Increase Contrast or
  Android's high-contrast text, which switch to a stronger palette. Every control
  has a label and a role; nothing depends on hover or translucency alone.

**Not yet** — the rest of the review, in order:

1. **The article page.** The website's opening (drop cap, burgundy section
   headings, a split byline), its block treatments ported one for one in place of
   the remaining outlined boxes, an ending (author, topics, more in the same
   topic), a native toolbar for Save and Share in place of the floating action
   pill, and a full-screen image viewer.
2. **A front page and an identity.** A cover lead on Today with the wordmark,
   one dark or burgundy band per scroll, topic tiles in Explore, a single Saved
   list with swipe actions, a reading-settings sheet, and the app icon and splash
   (checklist below).

## CI

`.github/workflows/companion.yml` installs from the app's own lockfile, on the
app's own Node and pnpm, then typechecks, lints, checks formatting, tests,
exports the iOS and Android bundles and checks where their modules came from.
It is path-filtered to `apps/companion/**`, the sync script and the website
sources the sync reads. It is **not** in the website deploy job's `needs`, and
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
- [ ] **Enabling the content API** in production.
- [ ] **The dark palette** — adopt, change or drop the proposal, as corrected
      on 20 Oct 2026 (a rose accent, a light button, a dark callout); or ship
      light only for v1.
- [ ] **Showcase content** — preview builds carry hand-written sample
      articles. Bundling real published posts and their images instead is a
      choice about image rights (`STOCK_IMAGERY.md`) and production data.
- [ ] **Control shape** — capsules for controls, the platform convention, with
      the website's 2pt edge kept for content; or the 2pt edge everywhere.
- [ ] **The workspace migration** — when to move to the pnpm + Turborepo
      workspace with the website in `apps/web`.
