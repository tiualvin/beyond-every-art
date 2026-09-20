# Post layout — before and after

Evidence for the post template described in
[`../../POST_PAGE_LAYOUT.md`](../../POST_PAGE_LAYOUT.md).

The sections are in the order the changes happened, and the earlier ones are a
record of a state the page has since left rather than a picture of it today.
The last section is the current rail.

Every shot in the first two sections is the `Article` component rendered to
static markup with the real `app/globals.css`, captured in Chromium at 1440×900
and 390×844. Both sides are
the same article — a real published piece, "Why Titanium White Behaves
Differently Than Lead White" — so the pair differs only in the template. The
images are placeholder gradients: the media server is not running in the
harness, and the point of these is the geometry.

One difference from a real page: the component's entrance animations ship
`opacity: 0` in server markup and this page never hydrates, so the capture
neutralises that. Nothing else is overridden.

## 1440 — the first screen

| Before                                                                                                                                                                                                                       | After                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The post template at 1440 before the change: a 656px column centred in the page, holding eyebrow, title, dek, byline, share row and then the featured image, with 392px of empty paper either side.](post-before-1440.jpg) | ![The same post after: the title block on the left at 704px, the featured image top-aligned beside it at 456px with its credit clear above the byline rule, and below them the justified body text with a contents list in the 300px rail.](post-after-1440.jpg) |

The first paragraph starts 1009px down the page before and 569px after.

The empty band in the rail under the contents list is the 250px square ad unit.
It was reserved and empty when these were taken and it is filled now — see the
last section — but it is the same 250px either way, which was the point of
reserving it.

## 1440 — the body

| Before                                                                                           | After                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The body before: text at 656px, with the rest of the screen empty.](post-before-1440-body.jpg) | ![The body after: justified paragraphs at 704px, and beside them the sticky rail group — space reserved for a square ad, the related pieces, and the newsletter card — pinned as the article scrolls past.](post-after-1440-body.jpg) |

## 1440x800 — the sticky group on a short window

A different harness from the shots above: the real `app/globals.css` and the
real markup of `ArticleRail`, at a viewport 800px tall, scrolled far enough for
the group to be pinned. Only the stylesheet differs between the pair. The crop
is the rail and a slice of the column beside it.

That harness is committed now, as `scripts/measure-rail-ladder.ts` — the pair in
the last section below was taken with it, and `pnpm measure:rail --shot <dir>`
will retake either.

| Before                                                                                                                                                                                                    | After                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ![The rail before: a 290px empty band, then all three related pieces, then the newsletter card cut through the middle of its Join the list button by the bottom of the screen.](rail-before-1440x800.jpg) | ![The rail after: a 250px band, two related pieces and part of a third in a list that scrolls, and the whole newsletter card — heading, line of copy and button — clear of the bottom of the screen.](rail-after-1440x800.jpg) |

800px of viewport is a 1440x900 laptop with the browser chrome taken off. The
group was 737px before and the cap 692px, so 45px of it had nowhere to go — and
the card, being last, is what went.

After, two things changed. The related list is the only module allowed to
shrink, so the card can no longer be the thing that gives; and the group's
spacing was tightened by 37px, which is why at this height nothing has to give
at all — the group is 686px against a 700px cap, so all three pieces and the
whole card fit with no scrolling. On a shorter window the list is what absorbs
the difference, down to 650px of viewport where it is dropped instead.

Read that last paragraph against the section below, which is what happened when
the unit those 250px were reserved for actually arrived.

## 390

![The post at 390px: a single column, no rail, no notes margin — the same layout the template had.](post-after-390.jpg)

The rail is hidden below 1280, so a phone gets the template it already had —
with the column at 704px rather than 656 where the screen allows, and the same
justified body text.

## 1440x800 — the rail once the ad unit was filled

Taken with `pnpm measure:rail --shot`, which renders the real `ArticleRail` —
not a copy of its markup — over the real `app/globals.css` at a viewport 800px
tall, scrolled until the group is pinned. The unit's box is empty in both: the
harness is a local file with no AdSense fill, and what is being compared is the
250px it occupies either way. Only the stylesheet and the component differ
between the pair.

| Before                                                                                                                                                                                                                                                   | After                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The rail before: the unit's 250px band unlabelled, then two whole related pieces and a third with its title showing and its tag and reading time cut off by the bottom of a list that scrolls, then the newsletter card.](rail-before-1440x800-ad.jpg) | ![The rail after: an "Advertisement" cap above the 250px band, three whole related pieces each with its tag and reading time, and the newsletter card reduced to its heading and button.](rail-after-1440x800-ad.jpg) |

800px of viewport is a 1440×900 laptop with the browser chrome taken off, and
it is the window most of this site's desktop readers have.

Before, the group is 700px against a 700px cap with 224px of list to fit in
198px, so the list scrolls and the third piece loses its meta line — a module
that `RAIL_COUNT` fills with three, showing two and a fragment.

After, the group is 662px against the same cap. Three things bought the 38px
and then some: the title is clamped to two lines, so an item is 60px whatever
an editor wrote rather than 60 or 80; the meta line runs at caption leading
instead of prose leading; and the newsletter card has shed its line of copy,
which is the first rung of the ladder in `../../POST_PAGE_LAYOUT.md` and the
cheapest thing in the group. The card's frame goes at the next rung down, which
is what carries three whole pieces to 683px of viewport.

## 1440x800 and 1440x700 — the rail without "More on this"

The end of the story the two sections above tell. The rail's related list had
been the module that absorbed every shortfall, and the fix for that had been a
ladder that made three pieces fit down to 683px of viewport. The module went
instead: every piece it listed already closes the article in "Read next", which
reaches every device where the rail reaches desktop only, so removing it costs
a reader nothing and returns 245px.

The card spends it. A picture an editor sets in Payload — `SiteSettings` →
Newsletter card image — then the eyebrow, a heading, a line and the control.

Taken with `pnpm measure:rail --shot`, which renders the real `ArticleRail`
over the real `app/globals.css`, scrolled until the pair is pinned. The unit's
box is empty because the harness is a local page with no AdSense fill; the
picture is a gradient standing in for a photograph, for the same reason the
shots at the top of this file use placeholder gradients.

| 1440x800 — the whole card                                                                                                                                                                                                                                                        | 1440x700 — the first rung                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The rail at 800px of viewport: an "Advertisement" cap over the 250px unit, then the newsletter card — a 3:2 picture across its full width, then THE NEWSLETTER, "Stay close to the work", a line of copy and a full-width Join the list button.](rail-newsletter-1440x800.jpg) | ![The same rail at 700px: identical except that the picture is now a shallow 3:1 band rather than a 3:2 frame, which is what keeps the button clear of the bottom of the screen.](rail-newsletter-1440x700.jpg) |

800px of viewport is a 1440x900 laptop with the browser chrome taken off, and
the pair is 658px against a 700px cap — everything fits with room to spare. At
700px the cap is 600 and the whole card would not, so the picture steps down to
a band and the pair becomes 559. It steps away entirely below 663, and the line
of copy goes below 564; the button never goes, which is the point of deciding
the order rather than letting the group's scrollbar decide it.

The picture costs a phone nothing despite the rail being `display: none` below 1280. `next/image` lazy-loads by default and an element with no box never
intersects the viewport, so the request is never made — measured in Chromium at
390px wide, where it is requested zero times, against 1440px scrolled into
view, where it is requested once.

## 300x250 — the ad box with no ad in it

The slot reserves 300x250 and holds it whether or not Google fills it, so an
unfilled unit is a labelled empty box unless something else goes in. What goes
in is chosen in Payload under Site Settings → "Article rail — when no ad is
shown".

Both shots are `pnpm measure:rail --unfilled --promo <n> --shot`, rendering the
real `ArticleRail` over the real `app/globals.css` with the fill state forced.
The gradients stand in for photographs, as everywhere else in this file.

| One article                                                                                                                                                                                       | Three articles                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The ad box holding one promoted article: a WORTH READING eyebrow, a 2:1 picture, a two-line serif headline and a tag and reading time, filling the box to its bottom edge.](rail-promo-one.jpg) | ![The same box holding three: a MORE FROM THE JOURNAL eyebrow, then three serif headlines each with a tag and reading time, separated by hairline rules.](rail-promo-three.jpg) |

The first version of this put one headline in the middle of the box and left
the rest as paper, which reads as a mistake rather than as a choice. A list
fills the height by growing into whatever the eyebrow leaves and giving each
item an even share of it, so it reaches the bottom at one item or three without
any height being written down. A single pick is the exception: it is
top-aligned under its eyebrow and takes the post's own picture, at 2:1 rather
than the newsletter card's 3:2 so two stacked frames do not read as a repeat.

The box is the same height in both fill states — the fallback is laid over the
empty unit rather than swapped into it — so nothing on the page moves whether
an ad arrives or not.
