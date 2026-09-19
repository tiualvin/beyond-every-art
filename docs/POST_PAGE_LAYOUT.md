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

Before and after screenshots, at 1440x900, 1440x800 and 390, are in
[`assets/post-layout/`](assets/post-layout/README.md).

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

**The reading column is what the width is for, up to a point.** Measured in
Chromium at `1.1rem/1.75` Inter, against 876 characters of real body copy:

| Column     | 608 | 640 | 656 | 672 | 704 | 736 | 800 |
| ---------- | --- | --- | --- | --- | --- | --- | --- |
| Characters | 63  | 67  | 67  | 73  | 73  | 80  | 88  |

45–75 characters is the comfortable range. 704px sets about 73 and 736px sets
80, so **704px is the widest the column can be** and still be a column someone
wants to read. Everything beyond that has to go somewhere other than the text.

## The tracks

Two, from 1280 up: the reading column and a 300px rail. The block is exactly as
wide as those two and the gap between them, so no part of it is empty by
construction.

| Viewport | Block | Left gutter | Text | Rail | Featured image |
| -------- | ----- | ----------- | ---- | ---- | -------------- |
| ≤1279    | ≤1100 | centred     | 704  | —    | 704            |
| ≥1280    | 1100  | 90px+       | 704  | 300  | 456            |

One block width at every desktop size, and it is not written down anywhere: the
stylesheet declares it as `--text-w + --gap + --rail-w + --pad * 2`. Change the
measure or the rail and the block follows, which is the only way to keep four
numbers in agreement without remembering to.

The gutter grows past 1280 rather than the block: 90px at 1280, 170 at 1440,
410 at 1920. That is the honest cost of a fixed measure beside a fixed rail —
see "What the empty space is for" below.

## What goes in each track

**Text — 704px.** The article, and everything in it. Figures, galleries and
comparison tables fill the column and stop there, because the column is the
whole track.

Paragraphs are justified, with `hyphens: auto` doing the work that keeps
justification from rivering. `<html lang="en">` in the frontend layout is what
gives the browser a language to hyphenate against; without it the property is
inert, which is the one way this can silently stop working.

**Rail — 300px, from 1280.** A contents list in flow at the top, then a sticky
group of three: the square ad unit, the related pieces, and the newsletter
card. The group travels with the reader for the rest of the scroll; the
contents list does not, because a reader below the sections it names is done
with it.

The group is capped at the height of the space it pins into, which is what
keeps a sticky box from hanging its bottom off the screen where nothing can
reach it. Whole, the group is 712px and the cap is the viewport less 100px, so
it binds under 812px of viewport — which is most windows, a 1440×900 laptop
included, and means something in the group has to give.

**Which module gives is decided, not left to the scrollbar, and it is not the
related list first.** That was the previous answer and it was wrong for a
module built to hold three pieces: the list absorbed the whole shortfall, so
"More on this" showed one piece and part of a second, cut through the middle of
a word, on the most ordinary desktop window there is.

Two things fixed it. A rail title is now clamped to two lines, which is what
makes an item's height knowable at all — unclamped it was 60px or 80px
depending on what an editor wrote, so the list was 206px on one post and 246px
on the next and the group was budgeted for neither. And the group now sheds the
cheapest thing it has, in order, before the list gives anything:

| Viewport | Cap | Group | What the group has shed         | The reader sees    |
| -------- | --- | ----- | ------------------------------- | ------------------ |
| ≥820     | 720 | 712   | nothing                         | all three pieces   |
| 770–819  | 670 | 662   | the card's line of copy         | all three pieces   |
| 683–769  | 583 | 583   | the card's frame and label too  | all three pieces   |
| 610–682  | 510 | 510   | nothing left — the list scrolls | two pieces         |
| 538–609  | 438 | 438   | —                               | one piece          |
| ≤537     | 437 | 324   | the list entirely               | the unit, a button |

The cap and group columns are taken at the bottom of each band, which is where
the band binds; above it the cap is larger and the group unchanged.

**Three whole pieces down to 683px of viewport, where it used to take 826.**
That is the difference between a 1440×900 laptop showing the module it was
built for and showing half of it. Below 683 the list shrinks and scrolls as it
always did, because by then the rungs are spent and it is the only elastic
module left.

The rung boundaries are measured, not rounded, and the rounding is where the
defect hides. Rung 3 was written at 759 first: at a viewport of 760 the rung-2
group is 662px against a cap of 660, so the third piece fell off across a
two-pixel band that no round number would have found. `pnpm measure:rail`
prints the table above from the real component in Chromium, and
`tests/design/article-layout.test.ts` fails if a rung starts lower than its own
group fits.

**The drop threshold shipped wrong once, at 700px.** A laptop with a bookmarks
bar sits just under 700, so for a large share of real windows the module simply
vanished, which reads as a bug rather than a decision. It has only ever meant
one thing — the window that cannot hold one whole item — and it is recomputed
rather than nudged each time the geometry moves: 700, then 649, and now 537,
because the rungs above moved that window down by 112px.

Note it is a `max-height` guard, and not the `@media (min-height: 820px)` one it
replaced upstream: that turned the sticky group off entirely, on a group about
700px tall against a 1440×900 laptop's roughly 800px of viewport, so on most
screens there was no sticky at all and it looked like the feature had never been
built. This one drops one supplementary module on the windows that cannot hold
it, and the test asserts the threshold can only go down.

The space above "More on this" is the unit, its "Advertisement" cap and a gap —
265.7px and 0.85rem — not the unit and a second band. At the 2.5rem module
rhythm it read as 290px of nothing, and those pixels were also pixels the card
did not have. The unit is aligned to the top of its line box, too: Google's
snippet styles it `display: inline-block`, which parks it on a text baseline
and reserves 8px of descender space underneath that nothing ever fills.

## Decisions worth not relitigating

**There is no notes margin.** The first pass put one between the text and the
rail for captions and credits to hang in. It was removed because most articles
have no captions worth hanging, so on most pages it was a third of the block
doing nothing — and an empty column reads worse than white space, because white
space looks deliberate and an empty column looks broken.

What it cost is the wide figures. A gallery or a comparison table reached 828
to 1140px with the margin in place and now reaches 704. The comparison table is
the one that feels it: a five-column table scrolls sideways inside its own box
again at 704, which is the thing the margin fixed. If that becomes the
complaint, the answer is a per-block bleed — a table that escapes the column on
its own — not the return of a margin every article pays for.

**The measure went to 704, not to 980.** Removing the margin freed 276px and
the text took 32 of it. The rest went into the block getting narrower. A 980px
column is about 105 characters, which is not a reading column.

**The rail arrives at 1280.** Below that, 704 of text plus 300 of rail leaves
the text against the edge of the screen.

**The rail is hidden below 1280 rather than reflowed.** Everything in it
reaches a phone another way — the related posts through "Read next", the
newsletter through the band — and it carries no thumbnails, because a hidden
`<img>` is still a download on the device least able to afford one.

**The hero is top-aligned.** Centred, the featured image starts below the title
and its credit line finishes level with the rule above the byline — near enough
to read as a misalignment rather than a choice. Aligned to the top, the image
and its credit both sit clear above that rule and the two columns start
together.

**The hero's columns are a ratio, not the measure and the remainder.** With the
block only as wide as the text and the rail, "the remainder" would have left
the featured image exactly the width of the rail. At 1.2fr to 1fr the title
takes 548px and the image 456px, and because the block is one width everywhere,
so are they.

**`sizes` breakpoints sit a hundredth of a rem under the stylesheet's.** A
`sizes` clause is `max-width` and the layout's query is `min-width`, so written
as the same number both match at exactly 1280 — and the hint then describes the
layout the page has just stopped using. This is the failure mode with no
symptom: the layout stays right, the browser fetches a source too small for the
box, and the picture is quietly soft. The test evaluates the string against the
tracks rather than trusting it.

**Pages are untouched.** A Page still renders through `.article__inner` at
44rem. It has neither a rail's worth of related content nor, per §8's exclusion
list, any ad slot.

## What the empty space is for

At 1920 the gutters are 410px each. That is not the same defect the first pass
fixed — the block is 1100px against the 656px column it replaced — but it is
the same arithmetic, and it is worth being explicit that a third track is the
only thing that absorbs it. The options, if it ever matters:

- **Leave it.** Most desktop traffic is 1280–1600, where the gutters are 90 to
  250px. This is the current answer.
- **Widen the rail past 1600.** 336px is a standard unit width and would take
  36 of it. Small.
- **Bring back a bleed track, for media only.** Figures and tables would use
  it and the text would not, which is what the notes margin should have been.
  It reintroduces an empty column on articles with no media.

## The unit in the rail

`rail-1` from [`ADVERTISING.md`](ADVERTISING.md) §8 is built: a 300×250 unit
above "More on this", inside the sticky group, with an "Advertisement" cap
above it. `ArticleRail` renders it through `AdUnit`, and `lib/ads/eligibility.ts`
decides whether it renders at all — not on a non-indexable deployment, not with
`NEXT_PUBLIC_ADSENSE_CLIENT=off`, and not on a restricted teaser (§4: a
truncated article with ads on it is thin content, and it is the worst possible
moment to be asking someone to subscribe).

Two things about it that the rest of this document depends on:

**It is the whole reason the ladder exists.** 265.7px of a 712px group is the
unit and its cap, and it cannot shrink — a 300×250 is a 300×250. Everything the
group gives on a short window, it gives because of this.

**`min-height: 250px` is no longer a reservation for an empty box.** It is the
defence against a collapse under the reader: Google marks an unsold impression
`data-adsbygoogle-status="unfilled"` and hides the `<ins>`, which would drag the
group up by 266px mid-scroll. §8 allows an unfilled slot to collapse only on a
subsequent navigation, and this is what holds it to that.

The slot renders nothing where there is no publisher to render it for — staging,
a teaser, ads switched off — rather than reserving 266px of blank paper above
"More on this". Nothing shifts either way, because the reservation exists to
stop a unit collapsing mid-view rather than to stand in for one.

## Not built, deliberately

- **The other four placements.** [`ADVERTISING.md`](ADVERTISING.md) §8 has five
  and only `rail-1` is rendered. `article-inline-1` needs the server-side body
  split in §4 before it can exist on migrated Ghost posts at all, and
  `lib/ads/placements.ts` deliberately does not name a placement that nothing
  renders.
- **A contents list on every article.** `extractHeadings` stops at the first
  block node. Anchors come from a stateful allocator the renderer shares
  between the body's headings and any block that emits one, so past a block
  this list could hand back an anchor that is off by a suffix. What it returns
  before one is exact; an article with a block above its headings gets no list
  rather than a wrong one. Preserved Ghost markup is read for the ids it
  already carries, and a heading without one is skipped.

## Verifying a change to this

The unit test covers the arithmetic. What it cannot see is whether the page
looks right, and two things are worth checking in a browser against real
content before believing a change here:

1. A migrated Ghost post with figures, a wide card and a gallery, at 1280 and
   1440 — the archive is most of the site, and it is the content this grid has
   to hold rather than the seeded examples.
2. A short viewport. `pnpm measure:rail` sweeps them in Chromium against the
   real `ArticleRail` and prints the table above; run it before and after and
   compare, rather than eyeballing one window. The numbers it prints belong in
   three places, and a change that updates only some of them is the drift this
   document exists to prevent: the rung boundaries in `app/globals.css`, the
   `GROUP` constants in `tests/design/article-layout.test.ts`, and the table
   above.

   Then look at the two heights either side of each rung — 819/820, 769/770 —
   because a rung that starts too low costs the third piece across a band a few
   pixels wide, which is invisible unless you are looking at exactly it.

3. Check "More on this" is there at all, and holding three. It is the one
   module a change here can remove from the page entirely, and it does so
   silently.
