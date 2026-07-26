# Insertable content modules and reusable snippets

## Summary

- **Status:** architecture recommendation. Not approval to add schema during
  migration or cutover.
- **Authoring surface:** Lexical `BlocksFeature` inside the existing single
  `content` field. No second body field, no page builder.
- **Blocking prerequisite:** the frontend renders the body as an HTML string
  (`richTextToHtml` → `dangerouslySetInnerHTML`). Interactive modules need a
  typed React node renderer first. That, not block schema, is the real work.
- **Second prerequisite:** the repository has no Payload migration workflow at
  all — see [Schema change workflow](#schema-change-workflow-prerequisite).
- **First blocks:** accordion, signup, carousel, product recommendation.
- **Revisit when:** the cutover gates in
  [`docs/CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) have passed and an editor has
  produced a concrete list of modules they cannot author today. Until both are
  true this document stays a plan.

Two findings in here are about the repository as it stands today and do **not**
depend on any block work: see
[Current-state security findings](#current-state-security-findings).

## Decision status

This document evaluates how Beyond Every Art can gain Ghost-style insertable
cards and reusable modules in Payload. It is an architecture recommendation,
not approval to add schema during migration or cutover.

The recommended direction is:

1. preserve migrated Ghost bodies in `legacyHTML` without conversion;
2. add a deliberately small set of typed Lexical blocks for newly authored
   posts and pages after migration parity is stable;
3. use relationships to dedicated collections for shared, independently
   maintained data such as products and signup campaigns; and
4. add a `Snippets` collection only when editors have a demonstrated need for
   centrally updated, reusable compositions.

This refines the handoff's modular-block direction rather than replacing it;
[Mapping to the handoff catalogue](#mapping-to-the-handoff-catalogue) reconciles
the two lists block by block. It avoids a generic page builder or a second
content model.

## What Payload can provide

The repository currently uses Payload 3.86 and
`@payloadcms/richtext-lexical`. Payload's relevant primitives are:

- **Block fields** store an ordered, typed list of block rows. They are a good
  fit for top-level page-builder layouts, but this project does not need a
  second top-level body field.
- **Lexical BlocksFeature** makes configured Payload blocks insertable within a
  rich-text field. This is the closest match to inserting a Ghost card between
  paragraphs and is the recommended authoring surface here.
- **Inline blocks** are available where a compact structured value belongs
  inside a text run. They should not be used for large visual modules.
- **Relationships and uploads** let a block select canonical Payload documents
  instead of copying product, campaign, post, or media data.
- **Conditional fields, tabs, row fields, validation, and admin descriptions**
  can keep each block form understandable without building a custom editor.
- **Custom Admin components** can improve selection and preview UI when the
  built-in controls are no longer adequate. They are an enhancement, not a
  prerequisite for typed blocks.
- **Drafts, versions, autosave, and Live Preview** already used by Posts and
  Pages apply to embedded block data in those documents.
- **Hooks and access control** can validate or normalize module data and limit
  who can manage shared commercial or signup records.
- **REST, GraphQL, and the Local API** expose the structured block value for a
  future first-party client. A mobile renderer still has to implement each
  supported block type explicitly.

Official references for the implementation phase:

- [Payload block fields](https://payloadcms.com/docs/fields/blocks)
- [Payload rich-text overview](https://payloadcms.com/docs/rich-text/overview)
- [Payload custom components](https://payloadcms.com/docs/custom-components/overview)
- [Payload drafts](https://payloadcms.com/docs/versions/drafts)
- [Payload access control](https://payloadcms.com/docs/access-control/overview)
- [Payload hooks](https://payloadcms.com/docs/hooks/overview)

Payload supplies the schema, editor controls, persistence, APIs, and preview
plumbing. It does **not** supply Beyond Every Art's public React components,
responsive styling, accessibility behavior, analytics taxonomy, affiliate
compliance, form abuse protection, or a universal safe custom-code sandbox.
Those remain application responsibilities.

## Repository fit and current gaps

The foundation is compatible but does not render structured blocks yet:

- Posts and Pages each have one `content` rich-text field plus the lossless
  `legacyHTML` fallback. Keeping that single authoring field is desirable.
- The global Payload editor is currently plain `lexicalEditor()` with no
  project block feature configuration.
- `richTextToHtml` converts Lexical to an HTML string, and post/page templates
  inject that string. Interactive React modules cannot be reliably implemented
  through that pipeline.
- Live Preview, drafts, versions, role checks, Media/R2, and the Local API are
  already useful building blocks.
- Newsletter signup storage and a protected server action exist, but there is
  no concept of a reusable campaign or placement and no newsletter sending
  platform.
- There are no product, merchant, snippet, impression, or module-event models.
- The RSS feed (`app/rss/route.ts`) carries `excerpt`/`metaDescription` only. It
  never emits body HTML, so no block serialization reaches subscribers today.
- Search (`searchPosts` in `lib/content/queries.ts`) matches `title` and
  `excerpt` with `contains`. Bodies are not indexed, so block text is invisible
  to search today.
- There is no `migrations/` directory and no `payload migrate` script. Schema
  currently reaches the database by push, not by a reviewed migration.
- There is no Content-Security-Policy header anywhere — not in `next.config.ts`,
  `middleware.ts`, or the `Caddyfile`.

The last four are stated because later phases in this document assume the
opposite. Each is a precondition to schedule, not a detail to discover during
implementation.

The principal evolution is therefore **not merely adding block schemas**. The
frontend body must move from “Lexical to HTML” to a recursive, typed React
renderer while retaining `legacyHTML` as an isolated fallback for migrated
documents.

## Recommended content model

### One body, two safe rendering paths

Keep the existing fields and precedence:

```text
if content has meaningful Lexical nodes:
  render Lexical nodes and registered blocks as React
else:
  render preserved legacyHTML
```

Do not put a separate `layout` block field beside `content`. Two competing body
fields create ordering ambiguity and make preview, migration, feeds, search,
and future clients harder to reason about.

Create a central registry (for example `blocks/registry.ts`) that owns:

- each Payload `Block` config;
- its stable `slug` and schema version;
- the server/client React renderer;
- plain-text extraction for search and feeds;
- whether it is permitted in Posts, Pages, or Snippets; and
- optional mobile support/fallback metadata.

Avoid a switch statement copied into multiple routes. Unknown block slugs must
fail visibly in preview and log structured diagnostics in production, while
public rendering uses a harmless fallback rather than crashing the article.

### Three kinds of reuse

Use the least powerful model that meets the editorial need:

1. **Local block** — configuration belongs only to this post/page and is copied
   with it. Examples: dropdown, pull quote, hand-curated carousel.
2. **Reference block** — the placement is local but points to a canonical
   collection document. Examples: affiliate product, signup campaign, related
   post. Shared facts update everywhere while placement-specific fields such as
   heading or tracking slot stay local.
3. **Shared snippet** — the whole module/composition is centrally maintained
   and referenced from many bodies. Add this only after reference blocks prove
   insufficient. Editors must understand that editing it changes every live
   placement.

For shared snippets, use a `snippets` collection with `name`, `slug`,
`description`, `status`, `allowedPlacements`, `module` (a Blocks field limited
to one supported block), and timestamps. Insert a small `sharedSnippet` Lexical
block containing a relationship to it. Do not allow `sharedSnippet` inside a
snippet, which prevents cycles. Require a published snippet for a published
placement, and show usage/back-reference information before deletion.

### Initial block catalogue

| Editor label                      | Payload shape                                                                    | Data ownership                        | Rendering requirements                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dropdown / accordion              | Local Lexical block with heading and repeatable items (`title`, rich text)       | Post/Page                             | Native button semantics or `<details>`, keyboard operation, visible focus, unique IDs, reduced-motion support                  |
| Signup module                     | Reference block selecting a `signup-campaign`, plus placement/variant            | Campaign collection + local placement | Server action, consent copy, privacy link, honeypot/rate limit, generic success response, source attribution                   |
| Carousel / gallery                | Local block with Media relationships, captions, optional links, and display mode | Media + Post/Page                     | Usable without JavaScript, previous/next controls, keyboard support, announced position, responsive images; no forced autoplay |
| Product recommendation            | Reference block selecting a `product`, plus optional editorial note              | Product collection + local placement  | Affiliate disclosure beside the module, sponsored-link attributes where applicable, price freshness treatment, click events    |
| Callout / custom editorial module | Local typed block with constrained style variants                                | Post/Page                             | Design-token variants only; no arbitrary CSS/JS                                                                                |
| Shared snippet                    | Relationship-only Lexical block                                                  | Snippets                              | Resolve published record, guard missing/unpublished references, prevent recursive snippets                                     |

Start with dropdown, signup, carousel, and product recommendation. Add a new
type only when it has an owner, real content examples, accessibility behavior,
an analytics contract, and a degradation strategy.

### Mapping to the handoff catalogue

[`AGENTS.md`](../AGENTS.md) makes
[`docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md)
the source of truth, and its "Reusable Content Blocks" section already names a
catalogue. That list and the one above are the same programme at different
stages, not competing plans. This table is the reconciliation — no handoff block
is dropped, and nothing above is invented without a place here.

| Handoff block          | Disposition in this plan                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rich Text              | Already shipped — it is the `content` field itself. Never a block.                                                                          |
| Pull Quote             | Already shipped — Lexical's `quote` node. Promote to a block only if it needs style variants.                                               |
| Artwork Gallery        | Renamed **Carousel / gallery** (`mediaCarousel`) above. Same block, Phase 2.                                                                |
| Product Recommendation | Kept as specified above, Phase 3, behind the `products` collection and legal approval.                                                      |
| Recommended Reading    | Reference block over `posts`. Cheapest remaining item; candidate to join Phase 2.                                                           |
| Color Palette          | Deferred. Local typed block, no new collection. Needs a design-token decision first.                                                        |
| Material Comparison    | Deferred. Table-shaped; needs a data owner before schema.                                                                                   |
| Pigment Card           | Deferred. Reference block over a future `pigments` collection, same shape as `products`.                                                    |
| Audio Player           | Deferred. Needs a hosting/streaming and transcript decision that overlaps [`docs/PUBLICATION_SYSTEM.md`](PUBLICATION_SYSTEM.md).            |
| Hero                   | Out of scope here. Page-level layout, not an inserted card; belongs with [`docs/WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md). |
| Interactive Exercise   | App-shared. Blocked by the `AGENTS.md` rule against mobile scope before a client is scheduled.                                              |
| Related App Activity   | App-shared. Same block.                                                                                                                     |

Four blocks above are **not** in the handoff catalogue — dropdown/accordion,
signup module, callout, and shared snippet. They exist for Ghost card parity
rather than editorial ambition: the first three are the cards a migrated body
can already contain, and the fourth is infrastructure for reuse. If the Phase 0
inventory finds no Ghost usage of a given one, drop it rather than build it.

### Supporting collections

#### `signup-campaigns`

Suggested fields:

```text
internalName, heading, body, submitLabel, successMessage,
consentText, privacyLink, providerListID, active, startsAt, endsAt
```

Keep provider identifiers private in API responses where appropriate. A public
form submits a server-controlled campaign ID; the server derives the provider
list and tracking source rather than trusting hidden client values. Continue to
write idempotently to the existing signup collection and integrate Listmonk or
another provider only in its scheduled phase.

#### `products`

Suggested fields:

```text
internalName, title, brand, description, images, merchant,
destinationURL, affiliateNetwork, affiliateDisclosure,
priceDisplay, currency, priceCheckedAt, availability, active
```

Editors should not paste executable affiliate scripts. Store a destination URL
and first-party presentation data, validate `https:` URLs against an optional
merchant allowlist, and render links in the application. Prices go stale: omit
them initially or label and timestamp them unless a compliant update source is
implemented. Restrict commercial fields to editors/admins and retain versions
for auditability. Legal review must determine the exact disclosure wording and
link attributes for each program and jurisdiction.

#### `module-events` (later, optional)

Do not create a row for every impression in the primary CMS database by
default. Extend the existing first-party analytics direction with a small event
endpoint/batched store, using stable non-personal identifiers such as
`blockType`, `documentID`, `placementID`, `campaignID` or `productID`, and
`event` (`view`, `expand`, `submit`, `click`). Never put email addresses or
affiliate secrets in analytics payloads.

## Rendering and API contract

Treat each block slug and payload as a public contract even while only the web
client consumes it. Use stable slugs such as `accordion`, `signup`,
`mediaCarousel`, `productRecommendation`, and `sharedSnippet`; do not encode
visual names such as `burgundyBoxV2`.

Each renderer should:

- validate/narrow its data rather than assume every relationship is populated;
- work in draft and Live Preview, including incomplete data;
- survive Live Preview's refresh cycle: Posts and Pages autosave every 800ms and
  the preview listener refreshes the route on each save, so any module holding
  local state — an open accordion panel, a carousel index — resets under the
  editor's hands while they type. Key interactive state to stable block IDs and
  give each module a preview-mode default (panels open, carousel on the first
  slide) so an editor can still see what they are editing;
- use Payload Media data and responsive `next/image`, never a Ghost hotlink;
- preserve semantic heading order chosen from surrounding context;
- include a no-JavaScript or static fallback for interactive modules;
- keep client components at the interactive leaf instead of making the entire
  article a client component; and
- emit a stable placement ID stored in content, not derived from array order.

Use Payload's Local API for server rendering. Choose query depth deliberately:
either populate the relationships needed by each block with a bounded depth or
batch unresolved IDs to avoid per-block database queries. Public network APIs
must apply collection access rules; never ship unrestricted Payload credentials
to a browser or mobile app.

### Feeds, search, and gated bodies

Search, RSS, and metadata must not consume presentation HTML blindly. Add a
plain-text serializer per block: include useful accordion/callout copy, omit
form chrome, and use product title/editorial context without inserting raw
tracking URLs.

Neither consumer needs that serializer yet, and the difference matters for
sequencing:

- **RSS** emits `excerpt`/`metaDescription` only. Block serialization is a no-op
  for the feed until someone decides to publish full-content items. If that
  decision is ever made, the feed needs a deliberate static representation — all
  accordion panels expanded, carousel figures stacked, signup and product
  modules reduced to a link — because feed readers will not run the interactive
  React UI. Treat that as its own scoped change, not a side effect of shipping
  blocks.
- **Search** matches `title` and `excerpt`. Indexing block text means changing
  what `searchPosts` queries, which is a search change with its own relevance
  and performance questions. Do not smuggle it into a block phase.

Until either changes, the Phase 1 obligation is only that the serializer exists
and is unit tested, not that any consumer is rewired.

Gated bodies are the third consumer. Posts carry
`visibility: public | members | paid` alongside the Members and Stripe billing
model, so a module is not automatically publishable just because its document
renders:

- a teaser or paywall must truncate the block array **server-side**, never by
  hiding rendered modules with CSS — a client-hidden block still ships its
  content, and for a `paid` post that is the leak;
- decide explicitly whether affiliate and signup modules render for members who
  already pay, since the commercial case for showing them differs; and
- `signup-campaigns` covers newsletter capture only. Membership and subscription
  remain owned by Members/Stripe. A block must not become a second, unaudited
  path into the account model.

## Custom modules and code safety

“Custom module” should mean a registered, typed module implemented and reviewed
in this repository. It should not mean arbitrary React, JavaScript, iframes, or
CSS entered in Payload.

If editorial embeds are required later, create a narrowly scoped `embed` block:

- accept a URL, not pasted provider HTML;
- allowlist providers and `https:` origins;
- build the iframe/server embed internally with a restrictive `sandbox` and
  explicit permissions;
- require a title and a fallback link; and
- load third-party content only after the applicable consent decision.

Preserved `legacyHTML` is a migration exception for trusted Ghost exports, not
the template for future authoring.

### Current-state security findings

Both of these exist in `main` today. Neither waits on block work, and neither
should be scheduled behind it.

**1. `legacyHTML` was writable by any author (fixed alongside this document).**
`Posts.access.create` is `authenticated` and `update` is `ownedPosts`, so an
`author`-role user could set `legacyHTML` on their own post, and `toBodyHtml`
passes it to `dangerouslySetInnerHTML` in `app/(frontend)/components/article.tsx`
and `app/(frontend)/[slug]/page.tsx`. That is stored XSS reachable by the lowest
privileged CMS role. The field now carries `create`/`update` field access
restricted to editors and admins, matching the trust level its rendering
assumes. Field `read` is deliberately untouched: every frontend query, the Ghost
importer, and both seed scripts use `overrideAccess: true`, so restricting reads
would have gained nothing and risked blanking migrated bodies.

**2. There is no Content-Security-Policy header.** `dangerouslySetInnerHTML` on
trusted-but-unsanitized migrated markup has no second line of defence. A
baseline CSP is worth its own change, not a line in a block checklist, because
it has to be validated against surfaces that will otherwise break silently:
the Payload admin bundle, the Live Preview iframe (`frame-ancestors`), R2 media
origins, and the analytics script. Ship it in report-only mode first and read
the reports before enforcing.

Treat sanitization of _newly pasted_ HTML as a third, separate question. It only
arises if editors are ever allowed to author raw HTML after cutover, which this
document recommends against.

## Editorial experience

The first implementation should be usable with Payload's built-in block picker,
field descriptions, validation, and Live Preview. Add custom Admin UI only in
response to observed friction. Valuable later enhancements include block icons
and thumbnails, product/campaign status in relationship choices, a snippet
“used by” view, and a block preview card.

Document these editor rules:

- local blocks can be changed without affecting other documents;
- referenced products/campaigns and shared snippets update every placement;
- duplicate a snippet when the intended meaning diverges;
- never use a carousel to hide essential sequential instructions;
- disclosure and consent copy cannot be removed when required; and
- unpublishing a referenced record may replace the live module with its safe
  fallback, so usage must be reviewed first.

## Delivery sequence and gates

### Phase 0 — migration and inventory (now)

- Keep `legacyHTML` authoritative for migrated documents.
- Inventory Ghost cards/custom HTML and count actual module patterns.
- Record representative desktop/mobile fixtures and external dependencies.
- Do not change migration mappings or canonical URLs.
- Adopt a schema-change workflow before any phase that adds a collection — see
  below. This is independent of blocks and can be done at any time.

**Gate:** final import, crawl comparison, redirects, media verification, backup
restore, and production monitoring meet the handoff acceptance criteria.

#### Schema change workflow (prerequisite)

Later phases in this document call for "a committed Payload migration". No such
workflow exists yet: there is no `migrations/` directory and no `payload
migrate` script, so `@payloadcms/db-postgres` is reaching the database by push.
Before Phase 3 adds `products` — the first genuinely new table — the repository
needs `migrate:create`/`migrate` scripts, a decision on push versus migrations
in production, and a deploy step that runs migrations before the new image
serves traffic.

The two kinds of change are not equally expensive, and conflating them
over-taxes the cheap one:

- **Adding Lexical blocks to `content` changes no Postgres schema.** Block
  values serialize into the existing rich-text JSON column. This needs generated
  types and renderer tests, not a database migration.
- **Adding `signup-campaigns`, `products`, `snippets`, or `module-events` does**
  change schema, and each needs a migration, a staging restore rehearsal, and a
  rollback plan.

### Phase 1 — renderer foundation

- Configure Lexical per content collection with a shared feature set and the
  initial registered blocks.
- Replace HTML-only conversion for new Lexical content with a typed React node
  renderer; retain the current isolated `legacyHTML` branch.
- Implement the plain-text serializer, unknown-block diagnostics, preview
  fixtures, responsive styling, and tests. Do not rewire the RSS feed or search
  in this phase; both are separate decisions.
- Generate and commit Payload types. No database migration is required for this
  phase — blocks live in the existing rich-text column.

**Gate:** old migrated fixtures are byte/semantics equivalent where required;
new rich text and every block render in published and draft preview; unknown and
incomplete blocks do not crash a route; the migration comparator
(`pnpm migration:compare`) shows no diff on bodies that are still `legacyHTML`.

### Phase 2 — local modules

- Ship accordion and carousel first.
- Test keyboard-only use, screen readers, no JavaScript, reduced motion, narrow
  screens, long copy, missing optional data, and varied image ratios.
- Add signup placement only by reusing the protected server-side submission
  path and privacy behavior.

**Gate:** unit, integration, Playwright, accessibility, visual regression, and
performance-budget checks pass with multiple modules in a long article.

### Phase 3 — commercial references

- Add `products` and the product recommendation reference block.
- Obtain affiliate-program/legal approval, define link/disclosure rules, and
  decide how price/availability are maintained.
- Add privacy-preserving click analytics and broken-destination monitoring.

**Gate:** disclosure is inseparable from the rendered recommendation; inactive
or missing products degrade safely; secrets and raw affiliate scripts never
reach CMS content.

### Phase 4 — shared snippets and custom Admin UX

- Introduce Snippets only if repeated composition is causing measurable work.
- Add published-reference validation, cycle prevention, usage reporting, and a
  deletion/unpublish workflow.
- Improve Admin components only where editorial testing shows a need.

**Gate:** editors can distinguish local content from globally shared content and
can identify affected pages before a shared edit or removal.

## Test and operational checklist

For every block type, require:

- schema validation and generated-type coverage;
- renderer tests for complete, partial, missing, and stale relationships;
- draft/Live Preview and published-page tests;
- access tests for anonymous, author, editor, and admin roles, including a
  `members`/`paid` post proving the block array is truncated server-side;
- plain-text extraction tests, plus sitemap/SEO non-regression tests. RSS and
  search assertions only once those consumers actually read block text;
- keyboard, focus, screen-reader name, reduced-motion, and touch-target checks;
- mobile, tablet, desktop, long-content, and no-JavaScript cases;
- a bounded query count and page-weight/performance budget;
- third-party request review, and a CSP review once a policy exists;
- backup/restore coverage for new collections and media; and
- structured monitoring for unknown block slugs and missing references.

Before deployment, changes that add or alter tables need a committed Payload
migration, a staging restore rehearsal, and a rollback plan that does not delete
serialized block data — which first requires the workflow described in
[Schema change workflow](#schema-change-workflow-prerequisite). Removing or
renaming a block slug is a data migration, not a visual refactor, even though it
touches no table.

## Explicit non-goals

- Converting all Ghost HTML to blocks during cutover.
- A free-form page builder or arbitrary editor-authored code.
- Rebuilding newsletter delivery as part of insertable signup UI.
- Live retailer feeds, checkout, carts, or payments for affiliate links.
- Speculative mobile-only modules before a client is scheduled.
- Allowing theme controls per block that bypass the future design-token system.

This approach gives editors Ghost-like insertion where it is useful, while
keeping content portable, shared data controlled, the public renderer safe, and
the current migration sequence intact.
