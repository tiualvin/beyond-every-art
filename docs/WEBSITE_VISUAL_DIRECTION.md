# Next.js + Payload Website Visual Direction

## Status and intent

This document records the **post-migration visual direction** for the Beyond
Every Art website. It describes the supplied desktop and mobile concept boards
in durable, implementation-oriented language so that future design and frontend
work has a shared reference.

The concepts are directional rather than pixel-perfect specifications. They do
not replace the migration requirements in
[`GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md),
and they must not turn Phase 1 into a redesign. First preserve the Ghost site's
content, URLs, metadata, media, behavior, and SEO; use this direction for a
separately scoped enhancement after migration parity and production stability
are established.

## Concept boards

The direction below is derived from two supplied concept boards, each showing a
desktop and a mobile composition side by side. They are reference material, not
licensed production assets (see [Guardrails](#guardrails)).

![Homepage concept — desktop and mobile, showing the cinematic hero, "Our
perspective", "Featured stories", dark "Explore by topic", and featured-artwork
sections.](assets/visual-direction-homepage.png)

_Homepage concept (desktop + mobile)._

![Article concept — desktop and mobile, showing the split hero, drop-cap
introduction, material comparison panel, related-stories rail, and in-context
newsletter card.](assets/visual-direction-article.png)

_Article concept (desktop + mobile)._

## Overall character

The site should feel like a refined editorial art journal: authoritative,
warm, tactile, and spacious rather than like a generic SaaS marketing site.

- Use an off-white paper-like base with deep black and oxblood/burgundy as the
  dominant neutral and accent colors.
- Pair expressive, high-contrast serif display typography with a restrained
  sans serif for navigation, labels, metadata, buttons, and utility text.
- Adopt a consistent eyebrow/kicker label system as a recurring motif: small,
  uppercase, letter-spaced sans labels that sit above section and article
  titles (for example a section eyebrow or an article category). Render them in
  burgundy on light surfaces and in a light tint on dark surfaces, always as
  real text rather than baked into imagery.
- Favor generous whitespace, fine rules, strong editorial hierarchy, and
  art-led photography or close material studies.
- Use subtle texture and dramatic dark imagery where it supports the content,
  but keep article reading surfaces quiet and highly legible.
- Keep motion restrained and purposeful. The visual identity should come from
  type, composition, imagery, and material detail—not decorative effects.

## Shared site chrome

- A compact editorial masthead carries the Beyond Every Art mark on the left,
  primary navigation across the desktop header, and a high-emphasis burgundy
  consultation call to action on the right.
- The concept navigation includes About, Art & Stories, Services, Collections,
  Journal, and Contact, with Art & Stories and Services shown as expandable
  (dropdown) items. Final labels, destinations, and which items expand must
  follow the validated content inventory and preserved URLs rather than
  inventing routes; any dropdown must be keyboard operable.
- Mobile reduces the header to the brand, search, and menu controls with clear
  touch targets.
- The desktop footer is a dark, structured multi-column area preceded by a
  burgundy newsletter band. Mobile may collapse this information, but must keep
  newsletter consent, contact information, and essential navigation usable.

## Homepage composition

The homepage concept is an editorial discovery experience with this approximate
rhythm:

1. A cinematic, full-width hero using dark, art-material imagery, an editorial
   headline, a short positioning statement, and one clear journal call to
   action.
2. A light "Our perspective" section that combines a large serif statement
   with concise explanatory copy and an About/Story action.
3. A "Featured stories" section introduced by a centered eyebrow and a centered
   serif subhead, with image-led article cards that each carry a visible
   taxonomy label.
4. A dark "Explore by topic" section using richly photographed topic cards,
   balanced by a larger contextual art/interior image on desktop.
5. A featured artwork or collection callout whose metadata reads as a compact,
   separator-delimited row (for example medium, dimensions, and year) alongside
   a direct details action.
6. Newsletter and footer areas that close the page with a strong burgundy-to-
   black transition.

Desktop layouts may use asymmetric grids and horizontal groupings. Mobile
should intentionally recompose them into a clear single-column narrative; it
should not simply shrink the desktop canvas. Carousels are optional, not
required, and must remain keyboard accessible, swipe usable, and understandable
without autoplay.

## Article composition

The article concept prioritizes long-form reading and art scholarship:

- Desktop opens with a split hero: a category eyebrow above the title, then the
  title, dek, and a byline row (author, reading time, and date) on one side,
  with a large featured image on the other.
- The byline may pair the author with an avatar and role; treat these as
  optional metadata that degrades gracefully when absent.
- Mobile presents the category label, title, and metadata first, followed by the
  featured image and article introduction.
- The reading column uses an editorial serif for headings and comfortable body
  measure, with strong hierarchy for sections, captions, quotations, and
  comparison graphics.
- Desktop can add a right rail for related stories and an in-context newsletter
  card. Mobile moves supporting modules into the article flow after the primary
  content they relate to.
- Rich content may include drop caps, material comparison panels, pull quotes,
  inset images with captions, and related-story cards. These are progressive
  presentation options; imported Ghost HTML must remain safely renderable even
  when it does not map to a bespoke component.

## Responsive and accessibility expectations

- Treat the supplied desktop and phone concepts as two deliberate compositions
  connected by shared tokens and content hierarchy, with sensible intermediate
  tablet layouts.
- Meet WCAG 2.2 AA contrast, focus visibility, semantics, keyboard operation,
  zoom/reflow, target sizing, reduced-motion, and alternative-text needs.
- Do not bake text into editorial imagery. All headings, labels, metadata, and
  calls to action remain real text managed in content or code as appropriate.
- Preserve image aspect ratios, focal points, captions, credits, and alt text.
  Use responsive sources and reserve image space to avoid layout shift.
- Burgundy is not the sole indicator of state or meaning, and fine typographic
  styling must never compromise readable sizes or contrast.

## CMS and implementation implications

- Keep global navigation, footer, newsletter copy, and site-wide calls to action
  editable through the appropriate Payload globals without making every visual
  detail configurable.
- Model homepage curation and featured/related relationships explicitly; do not
  infer all editorial placement from publication date.
- Reuse the canonical Post, Page, Author, Tag, Media, and Redirect records. New
  presentation fields must not duplicate migrated content or change canonical
  URLs.
- Establish tokens for color, typography, spacing, borders, breakpoints, image
  ratios, and motion before implementing page-specific styling.
- Continue to support `legacyHTML` as the lossless fallback while richer blocks
  are introduced incrementally for new content.
- Performance is part of the design: optimize and self-host permitted fonts,
  serve responsive media from the new media origin, and avoid dependencies that
  make the reading experience fragile.

## Guardrails

- This direction is **not** approval to alter routes, remove migrated modules,
  replace live content, or weaken SEO parity during migration.
- The mock content visible in a concept (article titles, author names, dates,
  topic names, consultation language, and artwork details) is illustrative, not
  source data. Production content must come from the migrated Ghost inventory or
  approved Payload entries.
- The concept imagery is visual reference material, not automatically licensed
  production media. Confirm ownership and usage rights before adding any asset.
- Validate the final design with representative short and long titles, missing
  optional metadata, varied image orientations, legacy HTML, keyboard-only use,
  and common mobile through wide-desktop viewports.
