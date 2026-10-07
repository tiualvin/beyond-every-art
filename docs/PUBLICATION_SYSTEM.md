# Beyond Every Art Publication System

## Status and intent

This document records the requirements for a **fully owned, self-hosted digital
publication system** — the Beyond Every Art magazine, journal issue, and
exhibition-guide reader — so that the work can be planned and built later
without re-deriving it.

This is a durable brief, not a runbook. It was written before the cutover, and
the gate it originally set — start only after cutover, backups, SEO parity and
production monitoring are settled — was **lifted by the owner on 3 Oct 2026**,
two weeks after the 19 Sep cutover. The work still must not displace the
post-cutover items open in [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md), and
nothing under `/publication/` is shown to readers until the owner signs off its
launch ([open decisions](#open-decisions), item 8).

What is built is groundwork that needs no publication to exist:

- the reserved root slug and the path helpers (`lib/seo/reserved-slugs.ts`,
  `lib/seo/site.ts`);
- the reader's page logic in `lib/publications/`: how pages pair into spreads
  (`lib/publications/spreads.ts`), what `?page=` means and how a position is
  shown and announced (`lib/publications/navigation.ts`), and which links
  pulled from a PDF may be rendered (`lib/publications/links.ts`).

**No source PDF exists yet.** Development can use a generated sample issue, but
the first real issue — its page count, file size and image rights — is a
precondition for launch, and several of the decisions below are sized against
it.

Where this brief and the code disagreed, the sections below have been corrected
to the code (3 Oct 2026). The original intent is unchanged; the mechanics it
assumed had moved on.

The visual language comes from
[`WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md); this document
describes an additional surface that must inherit those tokens rather than
introduce a second design system.

## Why we build this ourselves

The publication system must be completely owned and self-hosted. Do not
introduce:

- Publitas
- Issuu
- Flipsnack
- Third-party publication embeds
- Iframes
- Paid digital-publication platforms
- Third-party-branded readers

The goal is to reproduce the useful functionality of platforms such as Publitas
through our own code, on our own infrastructure, with no recurring
publication-platform fees and no third-party branding inside the reading
experience:

- PDF upload and processing
- Page image generation
- Full-screen publication reader
- Two-page desktop spreads
- Single-page mobile reading
- Page thumbnails
- Table of contents
- Publication search
- Zoom
- Fullscreen mode
- Page navigation
- Share and save controls
- Interactive hotspots
- Internal links to Beyond Every Art content
- Publication analytics
- Draft publishing
- Scheduled publishing
- Publication archives
- Accessible transcripts

The reader should feel like a native part of Beyond Every Art rather than a
separate tool that happens to be hosted on our domain.

## Naming and vocabulary

Use **publication** — not "catalog" and not "magazine" — in public URLs, route
names, labels, API names, Payload collection slugs, and internal naming where
appropriate. This keeps editorial issues, exhibition guides, annual reports, and
material almanacs under one consistent noun.

## Routes

| Route                             | Purpose                        | Indexed |
| --------------------------------- | ------------------------------ | ------- |
| `/publication/`                   | Publication archive            | Yes     |
| `/publication/[slug]/`            | SEO landing page for one issue | Yes     |
| `/publication/[slug]/read/`       | Immersive full-screen reader   | No      |
| `/publication/[slug]/transcript/` | Accessible text transcript     | Yes     |

Examples:

```
/publication/spring-2025/
/publication/spring-2025/read/
/publication/spring-2025/transcript/
```

Do not use `/catalog`, `/catalog/[slug]`, or `/magazine/[slug]`.

`/publication/[slug]/` stays a normal server-rendered landing page.
`/publication/[slug]/read/` is the immersive experience and is the only route
allowed to break out of the standard site layout.

### How the routes fit this repository

Five repository-specific constraints apply, each one already visible in how the
existing routes are wired:

1. **The root `[slug]` catch-all — done.** `app/(frontend)/[slug]/page.tsx`
   serves migrated Ghost permalinks directly off the root, and a post or page
   whose slug is literally `publication` would be shadowed by the archive.
   `publication` is in `RESERVED_ROOT_SLUGS` (`lib/seo/reserved-slugs.ts`),
   which Posts and Pages enforce on save and migration planning reports as a
   collision. On 3 Oct 2026 no post, draft or published, used it. Before
   launch, also check Pages and the Redirects table: middleware applies a
   redirect row before any route renders, so a row whose source is under
   `/publication/` would shadow the archive just as surely.

2. **Trailing slashes — done.** `next.config.ts` sets `trailingSlash: true` for
   every route, new or migrated, because an advertised URL that redirects is
   exactly what that setting exists to stop. The helpers in `lib/seo/site.ts`
   therefore end in a slash, like `JOURNAL_PATH` (`/journal/`) and `APPS_PATH`:
   `PUBLICATION_PATH`, `publicationPath(slug)`, `publicationReadPath(slug)` and
   `publicationTranscriptPath(slug)`. Navigation, canonical tags, sitemap
   entries and share links all build from them. (This brief originally said new
   routes take no slash; the code and `tests/seo/site.test.ts` say otherwise,
   and they are right.)

3. **Middleware.** The matcher in `middleware.ts` (mirrored in
   `lib/seo/middleware-coverage.ts`) skips any path containing a dot, plus
   `admin`, `api`, `oauth`, `webhooks` and a handful of generated files. A path
   it skips gets neither the redirect lookup nor the `STAGING_BASIC_AUTH` gate.
   So: no `.json` URL for the manifest (serve data from a dotless route, or
   embed it in the page), and no dot in an issue slug, which would take that
   issue's reader and transcript out of middleware altogether.

4. **Draft preview.** `PREVIEW_COLLECTIONS` in `lib/preview/live-preview.ts` is
   `posts`, `pages` and `apps`, and `app/(payload)/api/preview/route.ts`
   accepts whatever that list names. Adding `publications` needs an explicit
   branch in `previewTargetPath` mapping it to `publicationPath(slug)`: the
   function falls through to `postPath` for any collection it does not name, so
   without the branch preview compiles and opens `/<slug>/`. The landing query
   must also read drafts when preview mode is on, as `apps/[slug]` does.

5. **The reader's own layout.** There is no `app/layout.tsx`; `(frontend)` and
   `(payload)` are separate root layouts, and the frontend one renders the
   masthead, footer, newsletter band and AdSense on every page. The reader
   breaks out of that by living in a third route group with its own root
   layout. That works, with costs to plan for: moving between the landing page
   and the reader is a full page load; both groups must name the parameter
   `[slug]`; the reader needs its own `not-found.tsx`; and its layout must set
   `metadataBase`, `robots` (`robotsDirective(true)` from
   `lib/seo/indexing.ts`), the consent bootstrap, the analytics tag and the
   live-preview listener itself, because it inherits none of them. The tests
   that enforce a robots directive on every page and a reserved slug for every
   segment walk only `app/(frontend)` and `app/(payload)`, so they must be
   extended to the new group in the same change. Keep ad units out of the
   reader: [`ADVERTISING.md`](ADVERTISING.md) argues for few, deliberately
   placed units and against anything that lands in the middle of the reading
   experience, and a full-screen page reader has no other place to put one.

## Design direction

The reader is a separate immersive view. It should not look like a normal
article page, a publication embedded in the standard site layout, a generic
flipbook, a SaaS dashboard, an ecommerce product page, or an iframe reader.

Use the desktop interaction pattern of the Balsam Hill online publication as a
UX reference for interaction, hierarchy, and layout only:

<https://www.balsamhill.com/online-catalog/spring-2>

Do not copy its branding, source code, publication assets, product photography,
text, exact styling, or exact component designs. The finished reader must be
unmistakably Beyond Every Art.

The visual direction is editorial, museum-like, refined, art-focused, quiet, and
immersive — premium without being luxurious for its own sake, minimal without
feeling empty.

Use:

- Refined serif typography for editorial titles
- Clean sans-serif typography for interface controls
- White, warm cream, black, charcoal, and deep burgundy
- Art-focused imagery
- Generous whitespace
- Subtle shadows
- Restrained transitions
- Clear hierarchy

Avoid:

- Excessive icon usage
- Large amounts of boxed UI
- Bright accent colors
- Generic gradients
- Heavy glassmorphism
- Oversized rounded cards
- Decorative controls that distract from the publication
- UI that competes visually with the publication pages

The publication pages and the artwork on them stay the visual focus. Reader
chrome recedes.

## Desktop reader

A full-viewport experience at `/publication/[slug]/read/`, following the general
structure of the reference while wearing Beyond Every Art's identity.

### Layout

1. A full-viewport reader shell
2. A dark charcoal, black, or neutral background surrounding the publication
3. A slim top toolbar
4. A large, centered publication spread
5. A collapsible contents panel
6. A horizontal page-thumbnail strip
7. Bottom reader controls
8. Previous and next page controls beside the publication

### Top toolbar

- Beyond Every Art logo
- Publication title
- Issue title or issue selector
- Cover action
- Contents action
- View settings
- Search
- Share
- Save
- Fullscreen
- Close / return to publication

The close action returns to `/publication/[slug]/`.

### The spread

- Occupies most of the available viewport
- Centered horizontally and vertically
- Two pages on sufficiently large screens
- Preserves the original page aspect ratio
- Realistic but restrained page shadows
- Scales to fit inside the reader shell
- Leaves room for navigation controls
- No unnecessary decorative framing

### Capabilities

Two-page spread view, single-page view, thumbnail grid view, fullscreen, zoom,
pan while zoomed, search, page-number input, keyboard navigation, direct page
links, table-of-contents navigation, saved reading progress, sharing, copying a
direct link to a page, optional PDF download, optional printing, and a
reduced-motion mode.

### Keyboard

- Left and right arrows: page navigation
- Escape: close drawers, exit fullscreen, or return to the default reader state
- Plus and minus: zoom, where appropriate

Transitions may be smooth, but animation must never be required for navigation.

## Page display and spreads

The default desktop view is a two-page spread. The first page may stand alone as
a cover:

- Page 1 — cover, alone
- Pages 2–3 — first spread
- Pages 4–5 — second spread

Publications whose first page is not a cover must also work. Store the choice on
the publication:

```ts
firstPageIsCover: boolean
readingDirection: 'ltr' | 'rtl'
```

Page-turn animation is optional progressive enhancement. The reader must remain
fully functional with no page-curl effect at all; a simple fade, slide, or
immediate transition is the dependable default.

Spread pairing is pure logic (page count, `firstPageIsCover`,
`readingDirection`, single vs. spread mode), and it is built:
`lib/publications/spreads.ts`, with `tests/publications/spreads.test.ts`. The
route supplies data; the function decides the pairing. A page with no partner
keeps its side of the spine rather than being centred — the cover on the right,
a lone back cover on the left, mirrored for right-to-left — so every spread is
drawn as the same two columns and nothing jumps between them. Switching between
single and spread view keeps the reader on the same page.

## Contents panel

A collapsible panel on the left of the desktop reader. Opening it must not
permanently shrink the publication to a small size; it may overlay the reader or
temporarily shift the page area.

It contains the publication title, issue information, a close control, editorial
sections, article or feature names, page numbers, optional thumbnails, active
page indication, and expandable section groups.

```
CONTENTS

INTRODUCTION
Editor's Note — 2
About This Issue — 4

MATERIALS
The Alchemy of Color — 8
Why Titanium White Behaves Differently — 18
The History of Ultramarine — 28

PRACTICE
Inside the Conservator's Studio — 42
Tools of the Trade — 54

CONVERSATIONS
Artist Interview — 68
Closing Notes — 82
```

Selecting an entry navigates directly to the relevant page or spread.

## Thumbnail filmstrip

A horizontal strip below the publication on desktop, with a cover thumbnail,
page or spread thumbnails, page labels, an active-page highlight, previous and
next controls, horizontal scrolling, and lazy-loaded images. The active page
stays visible as the reader navigates. A control expands the strip into a larger
thumbnail grid.

## Bottom controls

A restrained bottom bar. Candidates: thumbnail-grid toggle, single/spread
toggle, previous page, current page, total pages, next page, zoom out, zoom
slider, zoom in, fit page, fit width, fullscreen, and a "More" menu.

Example page indicator:

```
12–13 / 96
```

Not every feature belongs in the bottom bar. Less frequent controls live under
"More".

## Search

Publication-level search over text extracted from the source PDF, presented as a
drawer, overlay, or lower panel: search input, clear control, result count, page
number per result, a short excerpt, an optional thumbnail, and the matched
phrase highlighted.

Selecting a result navigates to the page, closes or minimizes the results, and
highlights the matching text region when text coordinates are available. Search
covers only the current publication by default.

## Mobile reader

Design the mobile reader independently instead of shrinking the desktop layout.
Never show a desktop-style two-page spread on a small screen.

- One page at a time, full width
- Horizontal swiping or vertical scrolling
- Pinch zoom and double-tap zoom
- Compact header
- Page progress indicator
- Bottom navigation
- Contents drawer, thumbnail drawer, search, share, save
- Previous and next controls
- Resume-reading position

```ts
mobileMode: 'verticalScroll' | 'horizontalSwipe' // default: 'verticalScroll'
```

The mobile header carries a back action, a compact Beyond Every Art logo,
search, and a menu. The bottom toolbar may carry contents, thumbnails, search,
save, share, previous, next, and more.

Controls hide while the reader is actively reading and return on tap. Touch
targets are at least 44 × 44 CSS pixels. Reading progress survives leaving and
returning.

## Publication archive — `/publication/`

A normal server-rendered page containing a title, an introductory description, a
featured publication, the latest issue, publication series, previous issues,
search, and filtering by publication year and topic. Each entry shows its cover
image, title, issue number, publication date, a short description, and an
open-publication action.

Possible filters: all publications, art materials, art history, conservation,
studio practice, artist conversations, exhibition guides, annual reports,
special editions.

Do not make the archive look like an ecommerce product grid. Use editorial
cards, cover images, typography, and generous spacing — the same treatment the
journal archive gets.

## Publication landing page — `/publication/[slug]/`

SEO-friendly and server rendered. It carries the cover, title, subtitle, issue
number, series, publication date, description, an Open Publication button, the
table of contents, featured articles, contributors, related artists, artworks,
materials and exhibitions, previous and next issues, an optional PDF download,
a transcript link, sharing metadata, and structured data.

The primary button links to `/publication/[slug]/read/`; the accessible
transcript link points to `/publication/[slug]/transcript/`.

## Transcript — `/publication/[slug]/transcript/`

A readable text rendering of the publication: title, table of contents, page
headings, page numbers, extracted text, links back into the visual reader, and
accessible navigation.

Transcript pages link into the reader by page:

```
/publication/spring-2025/read/?page=18
```

The transcript improves accessibility, search indexing, copying, quoting,
low-bandwidth reading, and publication search. It does not replace properly
authored landing-page content.

## Payload data model

Four native Payload collections, no "catalog" anywhere in the slugs:

```
publications
publication-series
publication-pages
publication-assets
```

Access control reuses `access/roles.ts` rather than inventing a parallel
scheme: `editorsAndAdmins` for authoring, `publishedOrEditors` for public read
of a versioned collection, `adminOnly` for analytics. Keep the existing admin /
editor / author roles. Two cautions from the code: `publishedOrEditors` filters
on `_status`, which only a versioned collection has, so it cannot guard an
upload or page collection; and every versioned collection also needs
`readVersions: versionsOf(...)`, which `tests/access/roles.test.ts` checks
against a hand-kept list.

**Corrected 3 Oct 2026.** The four collections above were the first sketch.
Three things in the code change their shape, and the subsections below follow
the corrected version:

- **Processing state does not live on `publications`.** That document has
  drafts and autosave, and Payload bases every update on the latest version —
  which may be an editor's unsaved draft. A worker writing progress there can
  publish a half-finished edit or unpublish a live issue, and a hundred progress
  ticks would push the issue's whole edit history out of its 50-version window.
  Everything the worker writes goes to collections without versions:
  `publication-pages`, and a processing record per run (below).
- **The cover is a `media` upload.** That collection is already public, already
  served on the site's hostname, already allowed through the image optimizer,
  and already carries alt text, credit and the `og` share size. A cover in a new
  collection would need all of that rebuilt before the landing page could show
  it.
- **Series is a field until there is a second series.** A collection, archive
  filters, contributors and related content all wait until there are enough
  issues to need them; with none published they are speculative build, which
  [`../AGENTS.md`](../AGENTS.md) rules out.

### `publications`

```ts
{
  title: string
  slug: string
  subtitle?: string
  description?: string
  issueNumber?: string

  series?: string // a relationship once a second series exists

  sourcePDF: Relationship<'publication-assets'>
  cover?: Relationship<'media'>

  // Page count and processing status come from the ready processing record,
  // never from fields here. See "Processing state" below.

  desktopMode: 'spread' | 'single' | 'scroll'
  mobileMode: 'verticalScroll' | 'horizontalSwipe'
  readingDirection: 'ltr' | 'rtl'
  firstPageIsCover: boolean

  searchEnabled: boolean
  downloadEnabled: boolean
  printEnabled: boolean
  sharingEnabled: boolean
  savingEnabled: boolean
  transcriptEnabled: boolean

  controlTheme: 'light' | 'dark' | 'automatic'
  readerBackground?: string

  publishedAt?: Date
  unpublishAt?: Date
}
```

Plus SEO title, SEO description, social image, table of contents, contributors,
and related content.

Enable drafts and versions with the same settings as Posts, Pages and Apps —
`versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 }` — so
editors can preview an unpublished issue before it goes public. Autosave writes
a version every 800 ms while someone types, so nothing may hang processing off
an `afterChange` hook on this collection; processing starts from an explicit
action.

`publishedAt` is scheduled the way posts and pages already are: add
`publications` to `SCHEDULABLE_COLLECTIONS` and filter every public read with
`live()` from `lib/content/schedule.ts`. That needs no job runner and keeps
editors with one scheduling behaviour across the admin. `unpublishAt`, if it is
kept, is the symmetric query-time condition.

`controlTheme` and `readerBackground` choose between design tokens, never a
free colour: theme controls that bypass the token system are a non-goal in
[`INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md), and
[`WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md) puts tokens ahead of
page-specific styling.

### `publication-series`

Title, slug, description, cover, publication relationships, sort order, and SEO
settings. Example series: Beyond Every Art Journal, Materials Almanac, Studio
Visits, Exhibition Guides, Conservation Reports, Special Editions.

### `publication-pages`

One Payload document per page. Do **not** store hundreds of pages in a single
array field on the publication document.

```ts
{
  publication: Relationship<'publications'>
  pageNumber: number
  spreadNumber?: number

  width: number
  height: number
  aspectRatio: number

  thumbnail: Relationship<'publication-assets'>
  mediumImage: Relationship<'publication-assets'>
  largeImage: Relationship<'publication-assets'>
  zoomImage?: Relationship<'publication-assets'>

  extractedText?: string
  textPositions?: JSON
  detectedLinks?: JSON

  accessibleLabel?: string

  hotspots: Hotspot[]
}
```

Each page also carries its own processing status so a single failed page can be
regenerated without reprocessing the issue.

No versions on this collection: the worker writes it, and a page's text
positions run to megabytes that versioning would copy up to fifty times. Read
`textPositions` with `select` and never through `cachedRead`, whose data cache
refuses entries over 2 MB. Keep the fields the worker owns (images, dimensions,
text, detected links, status) apart from the ones an editor owns (hotspots,
accessible label), and let the worker update only its own — otherwise
reprocessing erases an editor's hotspots. A unique index on
`(publication, pageNumber)` belongs in the migration. When a replacement PDF
changes the page count, existing hotspots are flagged for review, not carried
over to whatever page now has their number.

The image fields depend on [open decision](#open-decisions) 3. If page images
stay Payload uploads they are relationships, as above; if they are written
straight to a public bucket they become stored keys and dimensions. Either way,
one upload document per image size per page (about 400 per 100-page issue) is
more bookkeeping than the reader needs.

### Processing state

A record per processing run, in a collection without versions: the
publication, the source asset it processed, status, progress, current page,
error, start and finish times, page count, and the rendition version the
reader should use. The publication points at its ready run, or the reader asks
for the latest ready run — either keeps worker writes off the versioned
document.

### `publication-assets`

An upload-enabled collection for source PDFs, and for supplemental images,
videos and downloadable files once there are any. Covers go in `media` (above);
page images per decision 3.

Assets live in Cloudflare R2, never on the VPS filesystem. Six facts about how
uploads work here, each of which the first sketch of this section got wrong or
did not know:

- **The collection must be listed in `s3Storage`.** The plugin call in
  `payload.config.ts` names `collections: { media: true }`. An upload
  collection it does not name writes to the app container's local disk, where
  nothing is mounted for it, and every deploy deletes the files. The call is
  always registered with `enabled: useR2` rather than added conditionally — a
  conditional plugin once left the admin blank for nine days through the import
  map — and a second instance must follow the same rule.
- **`_objectKey` is declared by hand**, as `collections/Media.ts` does, or
  `tests/collections/storage-shape.test.ts` fails because the schema differs
  with R2 on and off. A per-document storage `prefix` adds a column the same
  way, and also appends `?prefix=` to every file URL.
- **Admin uploads stop at 20 MB.** The installed Payload parses multipart
  uploads with defaults of 20 MB per file and 50 MB per request, refusing
  anything larger with a 413 before any collection hook runs. Raising it is the
  root `upload` setting, which is global — it raises the ceiling for `media`
  too, and multipart uploads are buffered in the app container's memory. A
  print-resolution PDF is usually larger than either limit. Cloudflare's own
  body limit (100 MB on the Free and Pro plans) sits in front of that.
- **Direct-to-bucket uploads are per plugin instance.** `clientUploads` sends
  the file from the browser straight to R2 and skips both limits above, but it
  is one switch on the whole `s3Storage()` call, so it needs a second instance
  for this collection alone. Its only size cap is that same global setting, it
  needs CORS on the bucket for the admin origin (owner-held configuration), the
  browser's upload target must be in the CSP's `connect-src`, and with a
  `mimeTypes` list Payload fetches the whole object back from the bucket when
  the document is created, to check it.
- **Readers cannot fetch it.** Payload serves the collection at
  `/api/publication-assets/file/<name>`, and on the public hostname the
  Caddyfile answers 404 for everything under `/api` except `/api/media/file/`
  and `/api/preview`. `app/robots.ts` and the image optimizer's allowlist in
  `lib/security/images.ts` name only the media path too, and
  `tests/seo/robots.test.ts` keeps the three in step. A downloadable PDF or a
  page image served from here needs all three changed deliberately.
- **`images.remotePatterns` and the CSP are built at image-build time** in
  `lib/security/images.ts` and `lib/security/csp.ts`, from variables that are
  not Docker build arguments. A new public origin set only in the production
  `.env` does nothing until it is plumbed through as a build argument or
  committed as a constant.

Storage paths:

```
publications/
  spring-2025/
    source/
      spring-2025.pdf
    cover/
      cover.webp
    pages/
      001/
        thumbnail.webp
        medium.webp
        large.webp
        zoom.webp
      002/
        thumbnail.webp
        medium.webp
        large.webp
        zoom.webp
    manifest/
      publication.json
```

Treat that as the grouping, not as the served filenames. Cloudflare caches image
files on these paths at the edge by extension (about two hours by default, which
was checked against the live site), and the repository has no way to purge that
cache: `lib/cache/purge.ts` only revalidates Next's own tags, and a purge needs
a Cloudflare API token, which is a secret. A page re-rendered under the same
name would therefore keep serving the old image, and an edge hit never reaches
Payload's access check, so a draft image fetched once by an editor is served to
anyone holding its URL until it expires. Name each derived file after a hash of
its content and send `Cache-Control: public, max-age=31536000, immutable` with
it: a reprocessed page gets a new URL, the old object can be deleted, and the
cache never needs purging. There is no manifest file — see
[Reader manifest](#reader-manifest).

**Nothing backs up R2.** The nightly backup is `pg_dump` alone
([`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)), and R2 has no versioning
here, so a deleted or overwritten object is gone. Page images can be rebuilt
from the source PDF; the source PDF cannot be rebuilt from anything. Decide how
source PDFs are protected before the first real one is stored
([open decision](#open-decisions) 6), and add the new tables to the restore
drill's table list in `.github/workflows/ci.yml`.

## Hotspot editor — "Pages & Interactivity"

A custom Payload document view inside the publication editor, laid out with the
same unnamed tabs as the Post and Page edit views
([`EDITORIAL_ADMIN.md`](EDITORIAL_ADMIN.md) says why the tabs carry no names).
The groups the brief suggested, in order:

```
Details
Pages & Interactivity
Reader Settings
SEO
Analytics
```

Any admin component it adds must obey the three constraints in that document —
access control, never throwing, stating rather than refusing — and must be added
to the import map with `pnpm generate:importmap`. The import-map test does not
cover field-level components, so nothing in CI catches a forgotten one.

The Pages & Interactivity view provides page-thumbnail navigation, a large page
preview, an SVG or HTML overlay, and the ability to draw, move, resize,
duplicate, delete, lock, and hide hotspots. It also previews hotspot behavior on
desktop and mobile, copies hotspots between pages, replaces and reorders pages,
and reviews automatically detected links.

The first version does not need a Canva-style page composer. The editor enhances
professionally designed PDF pages; it does not redesign them.

### Coordinates

Store hotspot bounds as normalized values between 0 and 1 so a hotspot stays
correctly positioned at every display size:

```ts
{ x: 0.12, y: 0.34, width: 0.28, height: 0.16 }
```

### Hotspot types

```ts
type HotspotType =
  | 'externalLink'
  | 'internalPage'
  | 'article'
  | 'artist'
  | 'artwork'
  | 'pigment'
  | 'material'
  | 'exhibition'
  | 'product'
  | 'video'
  | 'image'
  | 'gallery'
  | 'text'
  | 'download'
  | 'email'
```

A hotspot may carry an ID, type, bounds, accessible label, display label,
description, external URL, target page, Payload relationship, display style,
mobile and desktop visibility, analytics name, and open behavior.

Display styles: invisible, subtle outline, underline, pulse, label, image
marker. Avoid excessive indicators — the page stays visually dominant.

### Behavior

Hotspots may open an internal page, a compact information card, a side drawer, a
modal, a gallery, a video overlay, a normal internal route, or a new external
tab. Prefer compact cards and drawers for contextual content; do not cover most
of the publication unless the content genuinely needs the room. Every hotspot
has an accessible label.

### Internal content relationships

Use Payload relationships for internal Beyond Every Art content — posts,
artists, artworks, pigments, materials, exhibitions, products, videos,
galleries:

```ts
{
  type: 'article',
  target: { relationTo: 'posts', value: 'payload-document-id' },
}
```

When a relationship target changes, the publication shows the current title,
image, excerpt, price, availability, link, and metadata. Do not duplicate
relationship content inside hotspot records.

Of the content a hotspot would point at, only `posts` exists today (and `pages`,
for a hotspot that opens an ordinary route); artists, artworks, pigments,
materials, exhibitions, products, videos and galleries arrive with their own
features. Model the hotspot target as a polymorphic relationship that can grow
rather than inventing speculative collections now — consistent with
`AGENTS.md`'s rule against building app collections before their features are
scheduled.

### Links, extracted or typed

Every URL a hotspot renders goes through `classifyPublicationLink` in
`lib/publications/links.ts`, both when it is stored and when it is drawn. It
keeps https addresses, turns links to this site (either hostname, either scheme)
into relative paths with the trailing slash the site serves, keeps `mailto:` for
one address, and refuses everything else — `http:` included, which matches how
the site already treats credit links. External links then take their `rel`
from `linkRel` in `lib/content/link-rel.ts`, so they open with
`noopener noreferrer`.

Links extracted from a PDF are stored as unapproved and rendered only once an
editor approves them. A print layout's links can be years old, can point at
affiliate pages, and were never chosen for this site.

## PDF processing

When a PDF is uploaded:

1. Store the original PDF in Cloudflare R2
2. Create a background processing job
3. Validate the PDF
4. Detect encrypted or unsupported files
5. Determine page count
6. Determine page dimensions
7. Render each page into web-optimized images
8. Generate thumbnails
9. Generate medium-resolution images
10. Generate large-resolution images
11. Generate optional zoom-resolution images
12. Extract text
13. Extract text coordinates
14. Extract existing PDF links
15. Extract annotations where possible
16. Generate the cover
17. Create publication-page records
18. Generate or update the table of contents
19. Build the reader manifest
20. Mark the publication ready for editorial review

Run this in a **separate worker process** so a large PDF never blocks the
Next.js application.

Processing starts from an explicit action — a button, a status change, or a
command — never from a save hook, because autosave writes a version every
800 ms. If the source is replaced, the run is deduplicated on the publication
and the source asset.

**Tooling: Poppler, qpdf and Sharp, no PDF.js.** Poppler's command-line tools
cover what the list above needs — `pdfinfo` for page count, sizes and
encryption, `pdftoppm` for rendering, `pdftotext -bbox-layout` for text with
word positions — and qpdf's JSON output gives link annotations with their
rectangles and targets. Sharp, already a dependency, resizes to WebP. PDF.js was
the first suggestion, but its current releases require Node 22.13 or later and
every image here runs Node 20, which reached end of life on 30 Apr 2026; the
Node upgrade deserves its own change rather than arriving as a side effect of
this one. Both packages install on the Alpine base with `apk add`. If renderer
tests run against the real binaries, the CI `checks` job needs them installed
too, or those tests silently exercise only mocks.

Every extracted link goes through `lib/publications/links.ts` before it is
stored, and is stored unapproved ([Links, extracted or typed](#links-extracted-or-typed)).

**Where it runs, first version.** An on-demand command in the existing
`migrator` image — the one the `reconcile` service already uses to boot Payload
outside the web container — with `poppler-utils` and `qpdf` added to that stage
and a memory limit of its own. No new image, no always-on service, and no job
queue to secure. An always-on worker comes later, if publishing cadence
justifies it; [Deployment](#deployment) has what that costs here.

**If Payload's jobs queue is used**, four things are not optional:

- `jobs.access.run` denies everyone. By default any signed-in user — authors
  included — can call `GET /api/payload-jobs/run`, which runs queued tasks
  **inside the web container**, the opposite of the point above. The worker
  runs jobs from the command line instead, and the task handler refuses to run
  unless an environment flag marks the process as the worker.
- `autoRun` is never set in the app's config, for the same reason.
- The queue adds a `payload-jobs` collection, which is a schema change with its
  own committed migration.
- A job left marked as processing — the worker killed at its memory limit, or
  recreated by a deploy — is never picked up again. The worker reclaims stale
  jobs before it starts, and work is checkpointed per page so a retry resumes
  rather than restarts.

**The worker cannot clear the site's cache.** Collection hooks call
`revalidateContent` (`lib/cache/content.ts`), which does nothing outside a
Next.js server, so a run that finishes in another process leaves the archive,
the landing page and the reader on their cached reads for up to
`CONTENT_TTL_SECONDS` (ten minutes). Either accept that and say so in the
admin's status ("live within ten minutes"), or give the app an internal
revalidation route reachable only on the Compose network, with a shared secret
the owner sets. The worker also queries Payload directly, never through
`lib/content/queries.ts`, whose cached readers throw outside a request.

The worker supports retries, failure reporting, processing progress, page-level
status, idempotent reprocessing, regenerating selected pages, replacing the
source PDF, and canceling a queued job.

### Processing status

Surface status inside Payload. States: not started, queued, downloading,
validating, rendering pages, generating images, extracting text, extracting
links, creating records, building manifest, ready, failed.

Show percentage complete, the current page being processed, total pages, start
time, completion time, error details, and a retry action.

## Reader manifest

The frontend loads a cached JSON manifest instead of requesting every page from
Payload. The manifest carries its version, publication ID, slug, title, issue
number, page count, reading direction, desktop and mobile modes,
`firstPageIsCover`, page dimensions, responsive image URLs, page numbers, spread
information, hotspot data, searchable text, text-coordinate references, the
table of contents, reader configuration, and feature permissions.

```json
{
  "version": 1,
  "publication": {
    "id": "spring-2025",
    "slug": "spring-2025",
    "title": "Spring 2025",
    "pageCount": 96,
    "desktopMode": "spread",
    "mobileMode": "verticalScroll",
    "readingDirection": "ltr",
    "firstPageIsCover": true
  },
  "pages": [
    {
      "number": 1,
      "width": 1600,
      "height": 2400,
      "images": {
        "thumbnail": "/page-001-thumbnail.webp",
        "medium": "/page-001-medium.webp",
        "large": "/page-001-large.webp",
        "zoom": "/page-001-zoom.webp"
      },
      "hotspots": []
    }
  ]
}
```

Regenerate the manifest whenever pages, reader settings, or hotspots change, and
cache it through Cloudflare where appropriate.

**Corrected 3 Oct 2026: embed it, do not serve it as a file.** The reader route
is server-rendered, so the core manifest — pages, dimensions, image URLs,
spreads, approved hotspots, contents, settings — goes into the page it renders,
and nothing has to be fetched or kept in step. A `.json` URL would skip
middleware entirely (see [Routes](#how-the-routes-fit-this-repository), item 3).
The heavy part, searchable text and word positions, is loaded only when search
opens, from a dotless route such as `/publication/[slug]/search-index/`, and
never passes through `cachedRead` (its data cache refuses entries over 2 MB).
Spread information is not stored at all; `lib/publications/spreads.ts` derives
it from the page count and the publication's settings.

## Performance

The reader must stay fast on large publications:

- Lazy-loaded page images
- Preloading for nearby pages
- Thumbnail-first loading
- Responsive image sizes
- Image decoding off the main interaction path
- Cached manifests and cached page assets
- Virtualized thumbnail lists
- Virtualized vertical mobile pages
- Abortable image requests
- Minimal initial JavaScript
- Route-level code splitting

Never load every full-resolution page when the reader opens. Load the current
page or spread immediately, preload the previous spread and the next two, load
thumbnails independently, and fetch zoom images only when needed.

**Page images do not go through `next/image`.** They are already rendered at
every size the reader needs, and the image optimizer is rate limited to 240
requests a minute per visitor (`middleware.ts`) with no edge caching in front of
it — a thumbnail grid for a hundred-page issue, revisited, gets close to that
on its own, and a tripped limit shows the reader broken images. Use a plain
`<img>` with `srcset` over the pre-generated sizes.

## Extracted text and search data

Store per page: plain page text, individual text items, text coordinates, font
size where available, and reading order where available. Search results carry
the page number, matching phrase, context excerpt, and an optional thumbnail.

## Saved progress

Readers can save a publication, the current page, reading progress, and
bookmarked pages. Store the publication ID, last page, completion percentage,
saved pages, and last opened time.

Anonymous visitors use local storage; authenticated users sync to their account.
**An account is never required to read a publication.**

Until reader accounts exist, local storage is the only store. The `accounts`
collection is the Phase 2 design in [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md) and
is not built; `members` is a frozen archive of the Ghost export and must never
become a login. Sync arrives with accounts, not before. Every read and write of
local storage is wrapped, because private windows and blocked site data make it
throw.

## Sharing

Support sharing the whole publication, the current page, a selected article or
hotspot, and a direct reader URL:

```
/publication/spring-2025/read/?page=18
```

Use publication-specific Open Graph metadata on the landing page, and generate
per-page or per-spread share images where practical.

## Analytics

Track first-party events: `publication_open`, `publication_close`,
`publication_resume`, `page_view`, `page_duration`, `spread_view`,
`publication_complete`, `hotspot_open`, `search`, `search_result_open`, `zoom`,
`share`, `save`, `bookmark_page`, `pdf_download`, `transcript_open`,
`video_play`, `contents_open`, `thumbnail_open`, `fullscreen_enter`,
`fullscreen_exit`.

Store raw events separately from editorial documents, in a dedicated analytics
table or service layer. **Do not create a Payload document per reader event** —
`BillingEvents` is a reasonable precedent for a low-volume, idempotency-focused
event log, but reader telemetry is orders of magnitude noisier and would bloat
the editorial database. Payload shows aggregated summaries through a custom
admin view.

Useful reports: total opens, unique readers, average pages viewed, average
reading time, completion rate, most viewed pages and spreads, most opened
hotspots, search terms, search-result click rate, mobile versus desktop, PDF
downloads, transcript views, returning readers, and exit pages.

**What the site's analytics actually are (3 Oct 2026).** Production loads a
Google Tag Manager container (`NEXT_PUBLIC_GTM_ID`), with Google's consent
defaults declared in `lib/analytics/consent.ts`; see
[`ANALYTICS.md`](ANALYTICS.md). Four consequences:

- **Opens need no new code.** The existing tag already records a page view for
  the landing page, the reader and the transcript, which answers "how many
  opened it" on launch day.
- **Every custom event is container work.** `lib/analytics/events.ts` sends one
  event, `ad_slot`; a reader event needs a generalised sender there plus a
  trigger, variables and a GA4 tag in the container, which lives in the
  owner's Google account.
- **Prefix every event name.** `page_view`, `search` and `share` are names GA4
  already uses for its own events, so reader events are `publication_page_view`
  and so on. Moving between pages updates the URL with `history.replaceState`,
  and GA4's enhanced measurement can count each change as a site page view
  unless that setting is turned off for the stream.
- **A first-party store needs consent of its own.** Consent Mode governs
  Google's tags, not this site's code, and nothing here can read the consent
  banner's answer yet. A persistent anonymous reader id in local storage is
  subject to the same consent as a cookie in the EEA, the UK and Switzerland.
  Either build a consent reader first and mint the id only when analytics
  storage is granted, or store no persistent id and give up "unique" and
  "returning" readers. An ingest route goes under a dotless root path with a
  middleware rate limit — not under `/api`, which Caddy closes on the public
  hostname and middleware does not rate limit — and its table is created by a
  committed migration and added to the restore drill.

## Accessibility

- Keyboard navigation and visible focus states
- Screen-reader labels and logical focus order
- Reduced-motion support
- Accessible hotspot labels
- Page transcripts and searchable extracted text
- Sufficient contrast
- Touch-friendly controls
- Skip links
- Announced page changes
- Accessible drawer and modal behavior
- Alternative text for important page imagery where editorially supplied

Announce the new page or spread number to assistive technology on every change,
and never rely on color alone to indicate the active page or a selected control.
The WCAG 2.2 AA expectations in `WEBSITE_VISUAL_DIRECTION.md` apply here too.
The announcement and the visible indicator are both built from the same spread
by `pageAnnouncement` and `pageIndicator` in `lib/publications/navigation.ts`,
so the sentence a screen reader hears ("Pages 12 and 13 of 96") and the label a
sighted reader sees ("12–13 / 96") cannot disagree.

Page images are text baked into pictures, which that document rules out unless
the text is available another way. The transcript is that other way, so it
ships with the reader rather than after it: no issue goes public with a reader
and no transcript.

## SEO

Server render the archive and landing pages. Index `/publication/`,
`/publication/[slug]/`, and `/publication/[slug]/transcript/`; consider keeping
the immersive reader `/publication/[slug]/read/` out of the index to avoid
duplicate content. Use canonical URLs throughout.

Add structured metadata for publication title, publication date, author or
organization, issue number, description, cover image, article sections, and
breadcrumbs, extending `lib/seo/jsonld.ts`. Extend `buildSitemapEntries` in
`lib/seo/sitemap.ts` with publications and transcripts, and leave the reader
route out of the sitemap. Staging behavior (`NEXT_PUBLIC_NOINDEX`) continues to
apply site-wide through `app/robots.ts`.

The extracted transcript does not replace properly authored landing-page
content.

Four refinements from the code:

- **Nothing is advertised before launch.** The archive and landing routes answer
  404 to readers until the owner signs off the launch, and `PUBLICATION_PATH`
  joins the sitemap only once at least one issue is live — the pattern the apps
  page follows in `lib/seo/sitemap.ts`. A transcript URL is listed only once the
  route exists and that issue has extracted text. Publishing an issue does not
  submit it to IndexNow without the owner's say-so.
- **Structured data is built per route, not by the sitemap.** Each page calls a
  builder from `lib/seo/jsonld.ts` and inlines the result. There is no
  `PublicationIssue` builder or breadcrumb builder yet; the archive can reuse
  the collection-page and item-list builders.
- **The reader is `robotsDirective(true)`**: not indexed, links followed, and
  fully noindexed on staging like everything else.
- **A transcript of a reprinted article is duplicate text.** If an issue
  reprints a journal article that already ranks at its migrated URL, its
  transcript publishes the same words at a new one. Whether such a transcript
  is indexed, canonicalised to the post, or both is an owner decision
  ([open decisions](#open-decisions), item 7).

## Embeddable reader

The first release does not need a third-party iframe embed system, but structure
the reader so an embed mode can be added later at, for example,
`/publication/[slug]/embed/`. Embed mode would remove main site navigation,
nonessential publication details, and account-specific controls. Do not
prioritize it over the native reader.

## Security

Validate every uploaded PDF and reject unsupported file types, oversized files
beyond the configured limit, malformed PDFs, encrypted PDFs that cannot be
processed, and suspicious filenames.

Sanitize extracted URLs, external hotspot URLs, embedded metadata, and
editor-entered HTML. External links use `rel="noopener noreferrer"`, appropriate
target behavior, and URL validation. The URL half is built:
`lib/publications/links.ts`, described under
[Links, extracted or typed](#links-extracted-or-typed). Keep an explicit
`mimeTypes` list on any upload collection here, as `media` does; files served
from `/api/<collection>/file/` come from the site's own origin, which is why
`media` refuses SVG.

Permissions must ensure only authorized Payload users can upload PDFs, edit
publication pages, add hotspots, publish issues, and view publication analytics.

## Deployment

Docker Compose, extending the existing `docker-compose.yml`. The always-on
services are `postgres`, `app` (Next.js and Payload — the brief's `web`),
`caddy` and `backup`; `migrate` and `reconcile` sit behind profiles and boot
Payload from the Dockerfile's `migrator` stage.

**Corrected 3 Oct 2026.** The first version of this section said to model the
worker on `docker/backup/Dockerfile` and that the deploy runs
`docker compose up -d --build`. Neither holds, and the server is smaller than
that plan assumed:

- **The machine.** An arm64 Hetzner CAX with 3.7 GB of RAM and 4 GB of swap.
  The memory limits of the four always-on services already add up to about
  3.77 GB, and about 2 GB is free with the stack running. Rendering a page at
  zoom resolution is the most memory-hungry thing this site would do.
- **The image.** The backup image copies only `lib/` and `scripts/` and cannot
  boot Payload. A worker belongs on the `migrator` stage, as `reconcile`
  already does, with `apk add --no-cache poppler-utils qpdf` added there. That
  adds no new image to build.
- **The deploy builds named services only.** It builds `migrate`, pulls
  `caddy`, builds `app` and `backup` one at a time — two builds at once were
  killed for memory on 27 Aug — and then runs `up -d --wait` without `--build`.
  A service with its own `build:` that is not on that list is built once and
  then runs its first image forever; `reconcile` is in that state today. Give
  `migrate` an explicit image tag and have any worker reuse it, so the existing
  `docker compose build migrate` refreshes both.
- **Building it in CI does not transfer from Caddy.** Caddy's image is built on
  GitHub's amd64 runners only because Go cross-compiles; a Node, Poppler and
  Sharp image installs packages for the target platform, which needs emulation
  or an arm64 runner. The first amd64 Caddy image exec-failed on this box and
  restarted forever while the deploy reported success.
- **A service without a healthcheck passes `--wait` while crash-looping.** Any
  long-running worker needs one (a heartbeat file is enough), a memory limit of
  its own (`PUBLICATION_WORKER_MEMORY_LIMIT` or similar, documented in
  `.env.example`), and a temporary directory on disk rather than tmpfs, which
  counts against memory. Keep its runs clear of the 03:00 backup and, once its
  profile is on, the 02:30 billing reconcile.
- **Payload's CLI runs through `scripts/payload-cli.mjs`** (or the script runs
  under `tsx`). On Node 20 the bare CLI often exits 0 having done nothing; the
  wrapper's header explains why, and a worker running `jobs:run` needs it as
  much as `migrate:db` does.

Assets go to Cloudflare R2. The worker runs separately from the web server, one
publication or one page-rendering task at a time. Redis is not needed; nor, for
the first version, is a job queue — see [PDF processing](#pdf-processing).

## Build order

**Revised 3 Oct 2026.** The original order put the collections first and the
transcript twenty-first. It now runs in phases, each one pull request with one
commit per change, and because every merge to `main` deploys, anything a reader
could reach stays behind the launch gate until the owner signs it off.

0. **Groundwork — done.** Path helpers, the reserved slug, the reader's page
   logic and link policy in `lib/publications/`, and this document corrected.
1. **Content model and hidden pages.** The `publications` collection (versions
   as above, scheduling through `live()`, the cover in `media`), archive and
   landing routes that answer 404 to readers and preview for editors, the
   migration, and the tests that list collections by hand — the purge wiring in
   `tests/cache/purge.test.ts`, the versioned list in
   `tests/access/roles.test.ts`, the slugged list in
   `tests/collections/shared-fields.test.ts`. Before it merges: check Pages and
   Redirects for `/publication`, and run the production crawl comparison, so new
   URLs cannot hide a migration regression.
2. **Processing.** `publication-pages`, the processing record, the processing
   command on the `migrator` image, page images served per decision 3, and a
   read-only status panel in the admin. Before it runs on the server: the
   pending reboot, the build-cache cleanup, a measured free-memory baseline, and
   decision 6 in place. A generated sample PDF stands in until a real issue
   exists.
3. **Reader and transcript, together.** Desktop spreads and mobile single
   pages, contents, filmstrip, keyboard, `?page=` links, fullscreen, reduced
   motion, announcements, local progress, and the transcript route. Search can
   follow.
4. **Launch, on the owner's sign-off.** Lift the 404, add the sitemap entries
   and structured data, and add the navigation entry in code
   (`lib/content/fallback-nav.ts`). The masthead uses the Header global's links
   only when there are any, and the global is empty in production — so one link
   added there in the admin would replace the whole menu.
5. **Later, each its own decision.** Approving extracted links, then the drawing
   editor; internal relationships; series and archive filters; admin uploads
   straight to R2; an always-on worker; reader events; first-party analytics.

## First release scope

PDF-based publications, the archive, SEO-friendly landing pages, the full-screen
desktop reader with two-page spreads, the single-page mobile reader, the
contents panel, thumbnail navigation, search, zoom, fullscreen, page links,
external links, internal Beyond Every Art relationships, the hotspot editor, the
text transcript, R2 storage, background processing, drafts, scheduled
publishing, and basic first-party analytics.

**Proposed changes, 3 Oct 2026 — not yet decided.** To get one real issue
readable on desktop and phone, with a transcript, without the riskiest pieces:
move the hotspot editor, internal relationships, first-party analytics, series
and archive filters, and admin PDF upload to after launch; schedule with the
existing query-time `live()` rather than a job queue; offer the PDF download
only if decision 5 allows it.

## Not in the first release

- A full Canva-style publication designer
- Real-time collaborative editing
- Complex ecommerce synchronization
- AI-generated publication layouts
- AI hotspot generation
- Multi-tenant customer accounts
- Complex personalization
- A complete marketing analytics platform
- Dynamically rendering every PDF page for every visitor
- Any dependency on a paid publication provider

## Later possibilities

Responsive HTML-composed publications, a drag-and-drop page composer, PDF export
from composed publications, product feeds, live pricing, cart integration,
favorites, personalized publication variants, password-protected and private
member publications, offline reading, native app publication manifests, audio
narration, editorial annotations, collaboration workflows, A/B testing, advanced
engagement dashboards, the embeddable reader, automatic link-detection review,
AI-assisted text descriptions, and AI-assisted table-of-contents generation.

## Open decisions

Revised 3 Oct 2026. Each is the owner's call; the recommendation is the
default if nobody objects.

0. **Start before migration sign-off — decided 3 Oct 2026: yes.** Recorded in
   [`AUTONOMOUS_WORKSTREAMS.md`](AUTONOMOUS_WORKSTREAMS.md).
1. **The first issue — open.** No source PDF exists. Its page count, file size,
   image rights and date size decisions 2 to 5. Development uses a generated
   sample; a real issue is a precondition for launch.
2. **How the source PDF gets in.** Recommended: the owner copies it into R2
   (dashboard or rclone) and the processing command reads it by key — no change
   to upload limits, no bucket CORS. Later: uploads from the admin straight to
   R2 through a second `s3Storage` instance, as described under
   [`publication-assets`](#publication-assets).
3. **Where page images are served from.** (A) Through Payload like other media:
   a Caddy exception for the new path, the robots and allowlist changes that
   travel with it, year-long immutable caching and content-hashed names. No new
   bucket, domain or credential. (B) A separate public R2 bucket on its own
   domain: no load on the server at all, but a new bucket, DNS record and
   scoped token (owner actions), a CSP origin plumbed in at build time, and
   derived images written with the S3 client rather than as Payload uploads. It
   must not be the media bucket: R2 public access is all or nothing per bucket.
   Recommended: A for the first version, B if the server shows the load. Either
   way, an unpublished issue's page images can be fetched by anyone holding the
   exact URL.
4. **Where processing runs.** Recommended: an on-demand command in the
   `migrator` image with a memory limit, as above. Alternatives: an always-on
   worker on the job queue, with the costs listed under
   [Deployment](#deployment); or processing off the server — the owner's
   machine, or a manually triggered GitHub Actions run — writing to R2 and the
   CMS, which needs credentials only the owner holds.
5. **Image rights and resolution.** Zoom images and a downloadable PDF publish
   print-resolution reproductions of artwork photography, which may be licensed
   for print only. Recommended default: no PDF download and a capped zoom size
   until the rights for an issue are confirmed.
6. **Protecting source PDFs.** R2 replication, a copy in a second bucket, or the
   owner keeps the originals off the server, written into
   [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md). Required before the first
   real PDF is stored.
7. **Transcripts of reprinted articles.** Index the transcript with a link to
   the original, canonicalise it to the post, or keep it out of the index. A
   ranking decision on migrated URLs, so the owner's.
8. **Launching `/publication/`.** A new public URL, sitemap entries, possibly
   IndexNow submissions, and a navigation entry. Until it is signed off the
   routes answer 404 to readers and work in preview for editors.

What became of the earlier list: reserved slugs are done (see
[Routes](#how-the-routes-fit-this-repository)); bucket layout is now decisions
3 and 6; the job queue is not needed for the first version, and the constraints
on using it are under [PDF processing](#pdf-processing); scheduled publishing
uses the existing query-time scheduling; the analytics store waits until after
launch, with the facts that bear on it under [Analytics](#analytics); and the
worker's image is the `migrator` stage, since building it in CI needs an arm64
build.
