# Post Page Layout

What the `/[slug]` post template does with the width of a desktop screen, why
each track is the size it is, and which of the numbers other files depend on.

Related: [`ADVERTISING.md`](ADVERTISING.md) (§8 places ad slots against these
tracks), [`WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md) (the
split hero and the right rail are its article composition),
[`../PRODUCT.md`](../PRODUCT.md).

Enforced by [`../tests/design/article-layout.test.ts`](../tests/design/article-layout.test.ts),
which recomputes every width below from the stylesheet. If a number here and a
number there disagree, that test is the one to believe.

## What it was

Every element rendered into `.container.article__inner`: `max-width: 44rem`,
with `.container`'s `1.5rem` padding coming out of it under `border-box`. That
is **656px of content at every desktop width**, which is worth stating plainly
because the figure that had been written down was 704px — a `max-width` read as
though the padding sat outside it.

| Viewport | Article content | Unused each side | Listing pages get |
| -------- | --------------- | ---------------- | ----------------- |
| 1280     | 656px           | 312px            | 1104px            |
| 1440     | 656px           | 392px            | 1104px            |
| 1920     | 656px           | 632px            | 1104px            |

The last column is the sharp one: the journal, tag and author archives already
used 1104px of the same screen. The article — the page the site exists to serve
— used 59% of what a list of links used.

## What the measure is for

**The reading column was never the problem.** Measured in Chromium at
`1.1rem/1.75` Inter, against 876 characters of real body copy:

| Column     | 608 | 640 | 656 | 672 | 704 | 736 | 800 |
| ---------- | --- | --- | --- | --- | --- | --- | --- |
| Characters | 63  | 67  | 67  | 73  | 73  | 80  | 88  |

656px sets about 67 characters and 672px about 73. Both sit inside the
comfortable 45–75; 736px does not. So the recovered width could not go into the
text, and the layout below spends it on tracks beside the text instead. The
column moved from 656 to 672 and stops there.

## The tracks

Text pinned to the left of the block from 1280 up, everything gained
accumulating to its right. The block itself still centres — anchoring it to the
left edge of the viewport leaves a dead margin to the right of the rail at 1920
that reads as a broken page rather than a composed one.

| Viewport  | Block | Left gutter | Text | Notes margin | Figure bleeds to | Rail |
| --------- | ----- | ----------- | ---- | ------------ | ---------------- | ---- |
| ≤1279     | 72rem | centred     | 672  | —            | 672              | —    |
| 1280–1439 | 76rem | 56px        | 672  | 124          | 828              | 300  |
| 1440–1599 | 86rem | 56px        | 672  | 276          | 980              | 300  |
| ≥1600     | 96rem | 56px+       | 672  | 436          | 1140             | 300  |

Two properties hold the arithmetic together, and the test asserts both:

- **The block is capped below its own breakpoint at every step.** 76rem is
  1216px and the band starts at 1280; 86rem is 1376 and starts at 1440; 96rem
  is 1536 and starts at 1600. So every track is a fixed number in its band, and
  the text never starts less than 56px from the edge of the screen. A block as
  wide as its own breakpoint would put the first word 24px from the glass.
- **`--bleed` is derived, not written out.** It is
  `--shell - 3rem - --rail-w - --gap - --text-w`: what is left of the block
  once the padding, the rail and the gap in front of the notes margin are paid
  for. Widening the block therefore cannot leave the figures reaching the wrong
  distance.

## What goes in each track

**Text — 672px.** Unchanged content at an unchanged measure. What it gains is
starting 56px from the edge of the block instead of 392px from the edge of the
screen.

**Notes margin — 124 / 276 / 436px.** Captions and credits hang here, beside
the image rather than under it, which is the move that makes the column read as
a page rather than a post. A figure becomes a two-track grid to do it, so the
row is as tall as the taller of image and caption and a long caption cannot
overlap the paragraph below. Ghost's own `kg-width-wide` and `kg-width-full`
finally mean something too: they bleed across text and notes, where before both
resolved to the same width as body text.

**Rail — 300px, from 1280.** A contents list, three related pieces, and the
newsletter card, which is last and sticks. It is editorial on purpose:
[`ADVERTISING.md`](ADVERTISING.md) puts an ad slot in here eventually, and that
slot is absent for members, for anyone running a blocker, and on every staging
deployment. A rail built around one is a hole on those visits; built around
reading aids, the slot is one module among them.

## Decisions worth not relitigating

**The rail arrives at 1280, not 1200.** At 1200 a 672px column plus a 300px
rail leaves the text 24px from the edge of the screen. That is cramped, and the
band below 1280 keeps the centred column instead.

**Nothing widens below 1280.** An earlier pass let media widen symmetrically
there too. It was wrong twice: an over-constrained block with
`margin-inline: auto` is not centred — CSS 2.1 §10.3.3 makes both margins zero,
so it hangs off one side — and `100vw`, the only way to read the viewport from
inside the column, counts a scrollbar Chromium then takes away. Both showed up
as a horizontally scrolling page at 800px. Above 1280 the block is capped, so
every width is exact and none of this arises.

**The rail is hidden below 1280 rather than reflowed.** Everything in it
reaches a phone another way — the related posts through "Read next", the
newsletter through the band — and it carries no thumbnails, because a hidden
`<img>` is still a download on the device least able to afford one.

**The hero spans both tracks.** Title on the measure, featured image in what is
left of the block: 456px at 1280, 608px at 1440, 768px from 1600. It brings the
first paragraph about 440px further up the page and, at 1280 and 1440, makes
the LCP element _smaller_ than the 672px column that used to hold it. The rail
starts below it, level with the body, which is also where §8 wants the first
rail slot.

**`sizes` breakpoints sit a hundredth of a rem under the stylesheet's.** A
`sizes` clause is `max-width` and the layout's query is `min-width`, so written
as the same number both match at exactly 1280 — and the hint then describes the
layout the page has just stopped using. This is the failure mode with no
symptom: the layout stays right, the browser fetches a source too small for the
box, and the picture is quietly soft. The test evaluates both strings against
the tracks rather than trusting them.

**Pages are untouched.** A Page still renders through `.article__inner` at
44rem. It has neither a rail's worth of related content nor, per §8's exclusion
list, any ad slot.

## Not built, deliberately

- **A margin pull quote.** The notes margin can hold one, but the variant is a
  field on the `pull-quote` block, and a new option there is a schema change
  with a migration — see [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md).
  Worth doing on its own, not as a rider on a layout change.
- **A contents list on every article.** `extractHeadings` stops at the first
  block node. Anchors come from a stateful allocator the renderer shares
  between the body's headings and any block that emits one, so past a block
  this list could hand back an anchor that is off by a suffix. What it returns
  before one is exact; an article with a block above its headings gets no list
  rather than a wrong one. Preserved Ghost markup is read for the ids it
  already carries, and a heading without one is skipped.
- **Anything to do with ads.** No slot renders. §7 of
  [`ADVERTISING.md`](ADVERTISING.md) still puts consent and the cutover ahead
  of any ad code; what this layout does is reserve the shapes so that work is a
  fill rather than a re-layout.

## Verifying a change to this

The unit test covers the arithmetic. What it cannot see is whether the page
looks right, and two things are worth checking in a browser against real
content before believing a change here:

1. A migrated Ghost post with figures, a wide card and a gallery, at 1280,
   1440 and 1600 — the archive is most of the site, and it is the content this
   grid has to hold rather than the seeded examples.
2. The shortest post on the site. The notes margin is the risk: an article with
   no figures, no captions and no pull quote leaves it empty, and 436px of
   blank paper beside the text at 1600 is worse than symmetric white space
   because it is lopsided.
