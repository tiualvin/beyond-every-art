# Website Redesign Prototypes

## Status and intent

This document records a set of **interactive frontend prototypes** for the
post-migration website. They extend
[`WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md) from static concept
boards into working pages: real layout, real breakpoints, real interaction
states, and real keyboard behaviour.

They are a design reference, not production code and not an approved scope
change. Nothing here overrides the migration requirements in
[`GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md).
Content, URLs, metadata, media, and SEO parity come first.

## The files

Self-contained HTML — no build step, no network access. Open directly in a
browser, or serve the folder.

| File                                                                                   | Route it stands in for               |
| -------------------------------------------------------------------------------------- | ------------------------------------ |
| [`assets/redesign-prototypes/homepage.html`](assets/redesign-prototypes/homepage.html) | `app/(frontend)/page.tsx`            |
| [`assets/redesign-prototypes/article.html`](assets/redesign-prototypes/article.html)   | `app/(frontend)/[slug]/page.tsx`     |
| [`assets/redesign-prototypes/journal.html`](assets/redesign-prototypes/journal.html)   | `app/(frontend)/journal/page.tsx`    |
| [`assets/redesign-prototypes/topic.html`](assets/redesign-prototypes/topic.html)       | `app/(frontend)/tag/[slug]/page.tsx` |
| [`assets/redesign-prototypes/apps.html`](assets/redesign-prototypes/apps.html)         | `app/(frontend)/apps/page.tsx`       |

## What they establish

### Shared chrome

- **Masthead** — opaque paper bar: wordmark, section nav, search, sign in,
  subscribe. Below 980px the nav collapses to a hamburger; below 620px sign in
  drops (it also lives in the footer) and subscribe moves into the menu.
- **Mobile menu** — full-height paper panel below the bar, so the hamburger
  itself morphs to a close control rather than needing a second button.
  Staggered entrance, scroll lock, Escape, focus return.
- **Search** — a drawer that drops from under the bar with live filtering,
  matched-substring highlighting, result counts, an empty state, and arrow-key
  navigation through results.
- **Membership modal** — replaces the plain newsletter capture. Two plans
  mapping onto the states the product already models: `Members.status` of
  `free` or `paid`, against `Posts.visibility` of `public`, `members`, `paid`.
  Selecting a plan changes the call to action, the small print, and whether the
  monthly/annual toggle is shown.

### Homepage

- The cover is brand-level rather than an article, over an animated oxblood
  field rendered on canvas. Tones are drawn only from the burgundy family, so
  the field moves tonally rather than through colour.
- A **Latest** band carries the newest piece, since the cover no longer does.
- **Featured articles** is a list with a persistent cover thumbnail in place of
  ordinals, not a card grid.
- **Read together** pairs two pieces with the editor's reason for the pairing;
  CSS subgrid keeps both columns aligned row by row.
- **Topics** are swatches whose fill height encodes each subject's share of the
  archive.

### Article

- Three tracks: a rail, a body column held near a 65-character measure, and a
  reserved outer margin that notes hang into.
- A **specimen card** in the rail holds the pigment's mineral, formula,
  chromophore, locality, and hex. It is the one element that stays with the
  reader; the byline scrolls away.
- Existing prose conventions from `app/globals.css` are preserved deliberately:
  burgundy drop cap, burgundy `h2`, rule-bounded pull quote.
- Below the piece: tag chips, an author card, and a three-up "Read next".

### Journal and topic

- Entries are grouped by month against a sticky date rail — an archive's one
  true organising fact is when things were published.
- The journal's filter is a toggled pane rather than a permanent row of pills,
  and filters the list live with a count and an empty state.
- The topic page reuses the same list under a masthead stained with that
  topic's pigment, and closes with sibling topics so it is not a dead end.

### Apps

Stands in for the overview route in
[`superpowers/specs/2026-07-26-apps-page-design.md`](superpowers/specs/2026-07-26-apps-page-design.md),
and follows that spec's data model rather than inventing a second one.

- **It reads as a roadmap, not a store.** The intro says outright that nothing
  has shipped, and the four `Apps.status` values are declared as a key at the
  top instead of leaving unexplained badges scattered down the page. Every
  entry sits at `concept`, because that is where all four actually are.
- **Entries are editorial spreads, not a card grid** — `PRODUCT.md` lists the
  identical icon+heading+text grid as an anti-reference. Each app gets a plate,
  a serif name, a tagline, prose, and a two-column feature list, with the plate
  side alternating down the page.
- **The plates are pigment washes**, one family per app, standing in for
  `Apps.heroImage`. No device frames and no invented screenshots: nothing has
  been designed yet, and a mocked screenshot would imply otherwise.
- **Status badges take their colour from the deep end of each pigment family**
  so small uppercase text clears 4.5:1 on paper.
- **One waitlist form covers every app.** Ticking several boxes matches the
  `AppWaitlist` shape exactly — a row per `(email, app)` pair, one signup per
  person per app — so the form maps onto the collection without a second
  concept. Per-app CTAs stay on the detail route, as the spec has them.
- **How they connect** is the handoff's cross-linking table rendered as a list:
  the publication moment on the left, the app it hands off to on the right.

## Design tokens

The prototypes use the palette and type pairing already in `app/globals.css`
unchanged. One token is added:

```css
--color-rule: color-mix(in srgb, var(--color-ink) 26%, var(--color-paper));
```

A hairline with more presence than `--color-line`, used for section openers so
they outrank row separators without a heavy black bar.

The apps page adds two more, local to that file:

```css
--pig-cadmium-deep: #6b4103;
--pig-viridian-deep: #123227;
```

The shared block carries each pigment's surface tone, which is too light for
small uppercase text on paper. The status badges need the darker pair.

## What is placeholder

Read this before treating anything here as a specification.

- **Pricing is invented.** £6/month and £60/year appear nowhere in the
  repository. `lib/billing/stripe-events.ts` already reasons about annual
  plans, which is why both cycles are shown, but the figures are illustrative.
- **All imagery is generated**, painted procedurally on canvas from the pigment
  palette. Production uses the migrated `Media` collection; the generated
  plates only stand in for aspect ratio, placement, and tone.
- **Search and filtering run on arrays embedded in each file**, not on the
  `search` route or a Payload query. The interaction and its states are the
  reviewable part; the data path is not.
- **Article and listing copy is sample content.** The ultramarine article body
  is factually accurate, but production content must come from the migrated
  Ghost inventory or approved Payload entries.
- **Fonts fall back** to Georgia and `system-ui`. The prototypes load no
  webfont; production self-hosts Playfair Display and Inter through
  `next/font`.
- **No app has shipped, and the apps page says so.** Positioning, taglines,
  and feature lists are lifted from the app strategy in the handoff; the
  sequencing lines under each entry paraphrase its phase order. There are no
  dates, no store links, and no download counts, because none exist. The
  waitlist form writes nothing — it validates, then renders its own success
  state.
- **Motion is CSS transitions.** `framer-motion` is already a dependency and
  the repo has `app/(frontend)/components/motion/`; the prototypes' variants,
  stagger, and easing (`cubic-bezier(0.22, 1, 0.36, 1)`) are written to port
  onto it.

## Accessibility notes carried through

- Contrast was measured against composited pixels rather than declared colours,
  because the animated field and the stained topic masthead sit behind text.
  Cover type measures ~16.8:1; swatch labels compute their colour per pigment
  against both brand text colours rather than assuming one works.
- On the apps page the same method was applied to the plate marks, sampling
  every composited pixel behind the type with the mark itself hidden. The worst
  pixel across the four plates is 12.2:1, on cadmium. A flat scrim cleared AA
  too, at 5.6:1, but the pool is centred on the type instead: it holds a wider
  margin against artwork nobody has drawn yet, and leaves the plate edges at
  full strength. Status badges run 5.5:1 to 11.9:1; the lowest contrast
  anywhere on the page is 5.0:1, the shared muted token the rest of the site
  already uses for secondary text.
- Every overlay closes by Escape, backdrop, and its own control; scroll lock is
  always released; focus returns to whatever opened it.
- `prefers-reduced-motion` is honoured throughout. The animated cover paints a
  single frame and never starts its loop.
- Hover-only affordances are hidden on coarse pointers rather than left as dead
  instructions.
- Checked from 360px to 1440px: no horizontal overflow, no overlapping content.

## Guardrails

- These prototypes are **not** approval to alter routes, remove migrated
  modules, replace live content, or weaken SEO parity.
- Names, titles, dates, counts, and prices shown are illustrative.
- Implementing any of this remains a separately scoped enhancement, after
  migration parity and production stability.
