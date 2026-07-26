# Beyond Every Art Publication System

## Status and intent

This document records the requirements for a **fully owned, self-hosted digital
publication system** — the Beyond Every Art magazine, journal issue, and
exhibition-guide reader — so that the work can be planned and built later
without re-deriving it.

Nothing here is built yet. This is a durable brief, not a runbook and not a
Phase 1 commitment. The current priority remains the safe Ghost migration and
production stability described in [`../AGENTS.md`](../AGENTS.md) and
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md). Start this work only after
cutover, backups, SEO parity, and production monitoring are settled.

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

| Route                            | Purpose                        | Indexed |
| -------------------------------- | ------------------------------ | ------- |
| `/publication`                   | Publication archive            | Yes     |
| `/publication/[slug]`            | SEO landing page for one issue | Yes     |
| `/publication/[slug]/read`       | Immersive full-screen reader   | No      |
| `/publication/[slug]/transcript` | Accessible text transcript     | Yes     |

Examples:

```
/publication/spring-2025
/publication/spring-2025/read
/publication/spring-2025/transcript
```

Do not use `/catalog`, `/catalog/[slug]`, or `/magazine/[slug]`.

`/publication/[slug]` stays a normal server-rendered landing page.
`/publication/[slug]/read` is the immersive experience and is the only route
allowed to break out of the standard site layout.

### How the routes fit this repository

Four repository-specific constraints apply, each one already visible in how the
existing routes are wired:

1. **The root `[slug]` catch-all.** `app/(frontend)/[slug]/page.tsx` serves
   migrated Ghost permalinks directly off the root. A static
   `app/(frontend)/publication/` segment takes precedence over the dynamic
   segment in Next.js, so the archive resolves correctly — but a migrated post
   or page whose slug is literally `publication` would become unreachable.
   Check the validated content inventory before claiming the segment, and add
   `publication` to a reserved-slug guard in the Pages and Posts collections.

2. **Trailing slashes.** Migrated content paths keep Ghost's trailing slash
   (`postPath`, `pagePath` in `lib/seo/site.ts`); genuinely new routes do not,
   which is why `JOURNAL_PATH` is `/journal`. Publication routes are new, so
   they take the no-trailing-slash form. Add the path helpers next to the
   existing ones — `PUBLICATION_PATH`, `publicationPath(slug)`,
   `publicationReadPath(slug)`, `publicationTranscriptPath(slug)` — so
   navigation, canonical tags, sitemap entries, and share links cannot drift
   apart.

3. **Middleware.** `middleware.ts` skips any path containing a dot, plus
   `admin`, `api`, and `webhooks`. A manifest served as
   `/publication/[slug]/manifest.json` would therefore bypass both the redirect
   lookup (fine) and the `STAGING_BASIC_AUTH` gate (not fine on a pre-launch
   deployment). Either serve the manifest from a dotless path or extend the
   matcher deliberately.

4. **Draft preview.** `app/(payload)/api/preview/route.ts` only accepts
   `collection=posts` and `collection=pages`. Add `publications` to its
   `COLLECTIONS` set and map it to `publicationPath(slug)` so editors can
   preview an unpublished issue with the existing `PAYLOAD_PREVIEW_SECRET`
   flow.

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

A full-viewport experience at `/publication/[slug]/read`, following the general
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

The close action returns to `/publication/[slug]`.

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
`readingDirection`, single vs. spread mode) and belongs in `lib/` with unit
tests, in the same spirit as `lib/seo/sitemap.ts` — the route supplies data, the
pure function decides the pairing.

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

## Publication archive — `/publication`

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

## Publication landing page — `/publication/[slug]`

SEO-friendly and server rendered. It carries the cover, title, subtitle, issue
number, series, publication date, description, an Open Publication button, the
table of contents, featured articles, contributors, related artists, artworks,
materials and exhibitions, previous and next issues, an optional PDF download,
a transcript link, sharing metadata, and structured data.

The primary button links to `/publication/[slug]/read`; the accessible
transcript link points to `/publication/[slug]/transcript`.

## Transcript — `/publication/[slug]/transcript`

A readable text rendering of the publication: title, table of contents, page
headings, page numbers, extracted text, links back into the visual reader, and
accessible navigation.

Transcript pages link into the reader by page:

```
/publication/spring-2025/read?page=18
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
scheme: `editorsAndAdmins` for authoring, `publishedOrEditors` for public read,
`adminOnly` for analytics. Keep the existing admin / editor / author roles.

### `publications`

```ts
{
  title: string
  slug: string
  subtitle?: string
  description?: string
  issueNumber?: string

  series?: Relationship<'publication-series'>

  sourcePDF: Relationship<'publication-assets'>
  cover?: Relationship<'publication-assets'>

  pageCount?: number

  processingStatus:
    | 'notStarted'
    | 'queued'
    | 'processing'
    | 'ready'
    | 'failed'

  processingProgress?: number
  processingError?: string

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

Enable drafts and versions (`versions: { drafts: true }`, as on Posts) so
editors can preview an unpublished issue before it goes public.

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

### `publication-assets`

An upload-enabled collection for source PDFs, cover images, page images,
thumbnails, zoom images, supplemental images, videos, and downloadable files.

Assets live in Cloudflare R2, never on the VPS filesystem. `payload.config.ts`
already wires `s3Storage` for `collections: { media: true }` behind the
`S3_BUCKET` / `S3_ENDPOINT` check — extend that same plugin call with
`'publication-assets': true`, and remember `next.config.ts` derives
`images.remotePatterns` from `S3_PUBLIC_URL`.

Use predictable storage paths:

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

## Hotspot editor — "Pages & Interactivity"

A custom Payload document view inside the publication editor. Suggested tabs:

```
Details
Pages & Interactivity
Reader Settings
SEO
Analytics
```

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

Only `posts` exists today; the other collections arrive with their own features.
Model the hotspot target as a polymorphic relationship that can grow rather than
inventing speculative collections now — consistent with `AGENTS.md`'s rule
against building app collections before their features are scheduled.

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

Suggested tooling: Poppler for server-side page rendering, PDF.js for text and
annotation extraction, Sharp (already a dependency) for resizing, and WebP or
AVIF for the output images.

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

## Sharing

Support sharing the whole publication, the current page, a selected article or
hotspot, and a direct reader URL:

```
/publication/spring-2025/read?page=18
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

## SEO

Server render the archive and landing pages. Index `/publication`,
`/publication/[slug]`, and `/publication/[slug]/transcript`; consider keeping
the immersive reader `/publication/[slug]/read` out of the index to avoid
duplicate content. Use canonical URLs throughout.

Add structured metadata for publication title, publication date, author or
organization, issue number, description, cover image, article sections, and
breadcrumbs, extending `lib/seo/jsonld.ts`. Extend `buildSitemapEntries` in
`lib/seo/sitemap.ts` with publications and transcripts, and leave the reader
route out of the sitemap. Staging behavior (`NEXT_PUBLIC_NOINDEX`) continues to
apply site-wide through `app/robots.ts`.

The extracted transcript does not replace properly authored landing-page
content.

## Embeddable reader

The first release does not need a third-party iframe embed system, but structure
the reader so an embed mode can be added later at, for example,
`/publication/[slug]/embed`. Embed mode would remove main site navigation,
nonessential publication details, and account-specific controls. Do not
prioritize it over the native reader.

## Security

Validate every uploaded PDF and reject unsupported file types, oversized files
beyond the configured limit, malformed PDFs, encrypted PDFs that cannot be
processed, and suspicious filenames.

Sanitize extracted URLs, external hotspot URLs, embedded metadata, and
editor-entered HTML. External links use `rel="noopener noreferrer"`, appropriate
target behavior, and URL validation.

Permissions must ensure only authorized Payload users can upload PDFs, edit
publication pages, add hotspots, publish issues, and view publication analytics.

## Deployment

Docker Compose with separate services, extending the existing
`docker-compose.yml` (`postgres`, `app`, `caddy`, `backup`):

```
web:                  Next.js and Payload
publication-worker:   Node.js, Payload job runner, Poppler, Sharp, PDF.js
postgres:             PostgreSQL
caddy:                HTTPS and reverse proxy
```

The worker needs its own image — follow `docker/backup/Dockerfile`, which builds
from the repository root and copies only `lib/` and `scripts/`, except that this
one additionally needs `poppler-utils` and a working Sharp binary.

Assets go to Cloudflare R2. The worker runs separately from the web server. On a
small VPS, default processing concurrency is one publication (or one
page-rendering task) at a time. Redis is not required for the first version if
Payload's database-backed jobs queue is sufficient.

Note for whoever wires this up: the `deploy` job in `.github/workflows/ci.yml`
runs `docker compose up -d --build` **on the production VPS**, so adding a
worker image means adding build time and CPU contention on the live host. That
is already flagged in [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) as the
trigger for moving image builds into CI.

## Build order

1. Payload publication collections
2. Publication archive route
3. Publication landing-page route
4. PDF upload
5. Cloudflare R2 storage
6. Background processing worker
7. Page image generation
8. Text and link extraction
9. Publication-page records
10. Reader manifest
11. Full-screen desktop reader
12. Mobile single-page reader
13. Contents navigation
14. Thumbnail filmstrip
15. Search
16. Zoom
17. Fullscreen mode
18. Reading progress
19. Payload hotspot editor
20. Internal Payload relationships
21. Transcript route
22. Scheduled publishing
23. First-party analytics
24. Performance and accessibility review

## First release scope

PDF-based publications, the archive, SEO-friendly landing pages, the full-screen
desktop reader with two-page spreads, the single-page mobile reader, the
contents panel, thumbnail navigation, search, zoom, fullscreen, page links,
external links, internal Beyond Every Art relationships, the hotspot editor, the
text transcript, R2 storage, background processing, drafts, scheduled
publishing, and basic first-party analytics.

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

## Open questions to settle before building

1. **Reserved slugs — framework resolved.** `lib/seo/reserved-slugs.ts` owns the
   shared root-route policy; Posts and Pages enforce it, and migration planning
   reports collisions without silently renaming content. The real migration
   report must still confirm that no source document uses `publication` before
   the route is launched.
2. **Bucket layout.** One R2 bucket with a `publications/` prefix, or a separate
   bucket from editorial media and database backups? Backups already reuse the
   `S3_*` credentials with an optional `BACKUP_S3_BUCKET` override; publication
   assets can follow the same pattern.
3. **Jobs queue.** Confirm Payload's database-backed jobs queue is adequate for
   page-level tasks on the VPS's hardware before ruling out Redis.
4. **Scheduled publishing.** Decide whether `publishedAt` / `unpublishAt` are
   enforced by the queue, by a cron-driven task, or by query-time filtering, and
   make the frontend, REST/GraphQL access rules, sitemap, and feed agree — the
   way `postsRead` in `access/roles.ts` keeps gated posts consistent across all
   four surfaces today.
5. **Analytics store.** Choose between a plain Postgres table managed with
   migrations and an external analytics service, given that GA4 is already
   wired through `NEXT_PUBLIC_GA_ID` but first-party page-level data is the
   goal here.
6. **Worker deployment.** Build the worker image in CI and pull it on the VPS,
   or keep building on the host as the current deploy job does.
