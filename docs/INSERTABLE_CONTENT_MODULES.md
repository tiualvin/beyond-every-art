# Insertable content modules and reusable snippets

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

This follows the handoff's existing modular-block direction while avoiding a
generic page builder or a second content model.

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

Search, RSS, and metadata must not consume presentation HTML blindly. Add a
plain-text serializer: include useful accordion/callout copy, omit form chrome,
and use product title/editorial context without inserting raw tracking URLs.
RSS should emit a deliberate static representation (for example all accordion
panels expanded, carousel figures stacked, signup/product module reduced to a
link) because feed readers will not run the interactive React UI.

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
the template for future authoring. Limit who can edit it and define a separate
sanitization/content-security-policy review before allowing newly pasted HTML.

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

**Gate:** final import, crawl comparison, redirects, media verification, backup
restore, and production monitoring meet the handoff acceptance criteria.

### Phase 1 — renderer foundation

- Configure Lexical per content collection with a shared feature set and the
  initial registered blocks.
- Replace HTML-only conversion for new Lexical content with a typed React node
  renderer; retain the current isolated `legacyHTML` branch.
- Implement text/RSS serializers, unknown-block diagnostics, preview fixtures,
  responsive styling, and tests.
- Generate and commit Payload types and the required database migration.

**Gate:** old migrated fixtures are byte/semantics equivalent where required;
new rich text and every block render in published and draft preview; unknown and
incomplete blocks do not crash a route.

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
- access tests for anonymous, author, editor, and admin roles;
- text extraction, RSS fallback, search, and sitemap/SEO non-regression tests;
- keyboard, focus, screen-reader name, reduced-motion, and touch-target checks;
- mobile, tablet, desktop, long-content, and no-JavaScript cases;
- a bounded query count and page-weight/performance budget;
- CSP and third-party request review;
- backup/restore coverage for new collections and media; and
- structured monitoring for unknown block slugs and missing references.

Before deployment, database schema changes need a committed Payload migration,
a staging restore rehearsal, and a rollback plan that does not delete serialized
block data. Removing or renaming a block slug is a data migration, not a visual
refactor.

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
