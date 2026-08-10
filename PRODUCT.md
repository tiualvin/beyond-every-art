# Product

## Register

brand

## Users

Readers who follow art, color, materials, and creative-practice writing — people
who care about the science and history behind pigments, techniques, and
exhibitions, not just gallery gossip. They arrive from search, social shares,
or direct return visits to read long-form articles (e.g. "The Chemical
Symphony of Ultramarine," "Why Burnt Sienna Behaves Differently in Oil Than in
Watercolor"). The homepage's job is to convert a first-time visitor into a
reader of one article, and a returning visitor into a newsletter subscriber.

## Product Purpose

Beyond Every Art is an editorial publication about art, color, materials,
exhibitions, and creative practice, migrating from Ghost to a self-hosted
Next.js + Payload platform. The homepage is the front door: it should read as
a premium art publication, not a generic blog or SaaS marketing page, and
should surface the depth of the writing (pigment chemistry, technique,
materials science) rather than hide it behind generic "latest posts" framing.
Success looks like a homepage that feels worth lingering on — closer to a
print magazine cover and table of contents than an infinite content feed.

## Brand Personality

Rich, immersive, sensory. The site should feel tactile and materials-driven —
texture, pigment, surface — echoing the subject matter itself (paint,
canvas, chemistry). Not minimal-tech-editorial restraint; more visual density
and imagery-forward than a typical SaaS or Substack-style blog homepage, while
staying legible and uncluttered. Confident, warm, a little indulgent —
like stepping into a well-lit studio, not a sterile gallery white cube.

## Anti-references

- Generic SaaS/startup landing page grammar: hero-metric blocks, tiny
  uppercase tracked eyebrows on every section, identical icon+heading+text
  card grids, gradient text, side-stripe accent borders.
- Generic "blog homepage" grammar: a flat reverse-chronological list of
  identical post cards with no visual hierarchy or curation.
- Sterile minimal-gallery white-cube aesthetic — the brief explicitly wants
  richer and more sensory than that.
- Anything that abandons the existing paper/ink/burgundy identity in favor of
  a fresh palette; the existing brand tokens are to be preserved, not
  reinvented.

## Design Principles

1. Materials over metrics — let imagery, texture, and typography carry the
   "premium art" feeling; avoid stat blocks or SaaS proof-point patterns.
2. Curate, don't just list — the homepage should feel edited (a lead story,
   a featured selection) rather than a mechanical reverse-chron feed.
3. Depth is the differentiator — the writing is technical and rich (pigment
   chemistry, material science); the design should signal that substance,
   not undercut it with generic blog styling.
4. Preserve brand identity — reuse the paper/ink/burgundy palette and
   Playfair/Inter type pairing already established; this is a homepage
   redesign, not a rebrand.
5. Editorial restraint in copy, richness in visual texture — no marketing
   buzzwords, no aphoristic copy cadence; let the visual density carry the
   "rich, immersive, sensory" feeling instead.

## Accessibility & Inclusion

WCAG AA as the baseline: body text ≥4.5:1 contrast, large/display text ≥3:1.
Respect `prefers-reduced-motion` for all reveal/hover motion, consistent with
the existing `@media (prefers-reduced-motion: no-preference)` pattern already
used in `app/globals.css`. No content or navigation may depend on hover alone.
