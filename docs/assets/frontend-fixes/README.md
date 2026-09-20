# Frontend gap fixes — before and after

Visual evidence for the frontend gaps fixed alongside these images. Every shot
is the seeded development site (`pnpm seed:dev`) captured in Chromium at 1280px
and 390px. Full page, except where a section says otherwise and why — section 6
is viewport-height, because its subject is 280px of a 27,000px article.

---

## 1. Featured images were never displayed

`article.tsx` and `post-list.tsx` contained no `<img>` at all, so post pages and
every list and grid rendered text-only even though the migration preserves
featured images and alt text.

### Home page — desktop

| Before                                                                                                                                                                                         | After                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Home page at 1280px before the fix: the featured-stories grid shows only eyebrow, title, excerpt and date, with no thumbnails and no space reserved for them.](gap1-home-desktop-before.jpg) | ![Home page at 1280px after the fix: each card in the featured-stories grid leads with a 3:2 thumbnail; the story with no featured image shows the burgundy gradient placeholder.](gap1-home-desktop-after.jpg) |

### Post page — desktop

| Before                                                                                                                                                      | After                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Post page at 1280px before the fix: eyebrow, title, dek and byline run straight into the body text with no featured image.](gap1-post-desktop-before.jpg) | ![Post page at 1280px after the fix: the featured image sits between the byline and the body at its own aspect ratio, with its caption and credit below it.](gap1-post-desktop-after.jpg) |

### Post page — mobile

| Before                                                                                     | After                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Post page at 390px before the fix, with no featured image.](gap1-post-mobile-before.jpg) | ![Post page at 390px after the fix: the featured image follows the byline, full width, with caption and credit beneath.](gap1-post-mobile-after.jpg) |

### Tag archive — desktop

| Before                                                                                       | After                                                                                                                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ![Tag archive at 1280px before the fix: a text-only card grid.](gap1-tag-desktop-before.jpg) | ![Tag archive at 1280px after the fix: the same grid with thumbnails cropped to a uniform 3:2 frame.](gap1-tag-desktop-after.jpg) |

## 2. The card thumbnail placeholder silently collapsed

`.story-card__thumb` was a `<span>`. An inline box ignores `aspect-ratio`, so its
gradient painted nothing at any size. It is now the block-level frame that holds
the image, and the same gradient is the placeholder for a story with no featured
image — visible as the "Building Texture" card in the "after" shots above, which
is seeded without an image on purpose.

## 3. Mobile had no navigation

Below 800px `.site-nav` is hidden with no alternative, so only the wordmark and
one button remained and every nav destination was unreachable.

| Before                                                                                                                                                                                            | After — closed                                                                                                                                 | After — open                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Home page masthead at 390px before the fix: only the wordmark, wrapped over two lines, and the call-to-action button. No way to reach any navigation destination.](gap3-home-mobile-before.jpg) | ![Home page masthead at 390px after the fix: the wordmark on one line beside a Menu button with a hamburger icon.](gap3-home-mobile-after.jpg) | ![The mobile menu open at 390px, listing About, Materials, Journal and Search as full-width rows, with the Newsletter call to action below them.](gap3-menu-open-mobile-after.jpg) |

Keyboard behaviour verified end to end: Tab reaches the toggle, Enter opens it
and flips `aria-expanded` to `true`, Tab moves into the panel, Escape closes it
and returns focus to the button, following a link navigates and leaves it
closed, and above the breakpoint both the button and the panel leave the
accessibility tree entirely.

## 4. Nav links pointed at pages that do not exist

`/journal`, `/collections` and `/contact` all 404'd, and the hero call to action
hardcoded `/journal`. `/journal` is now a real paginated archive.

### `/journal` — desktop

| Before                                                                                    | After                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![/journal at 1280px before the fix: the site 404 page.](gap4-journal-desktop-before.jpg) | ![/journal at 1280px after the fix: a Journal archive headed "Every story, newest first", listing every published post as a card with a thumbnail.](gap4-journal-desktop-after.jpg) |

### `/journal` — mobile

| Before                                                                                  | After                                                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ![/journal at 390px before the fix: the site 404 page.](gap4-journal-mobile-before.jpg) | ![/journal at 390px after the fix: the same archive as a single column of cards.](gap4-journal-mobile-after.jpg) |

### Pagination

Exercised by temporarily seeding 14 posts, since the default seed produces four.
Those extra posts were removed again afterwards.

![Journal page two at 1280px: two cards, and a footer row with a "Newer stories" link on the left and "Page 2 of 2" beside it.](gap4-journal-page2-desktop-after.jpg)

---

## 5. Homepage modules: imageless plates, curated picks, and the topics chart

Four changes to `app/(frontend)/page.tsx` and what feeds it. Same capture
conditions as above — seeded development site, Chromium, 1280px and 390px, full
page — with `prefers-reduced-motion` forced so the cover's canvas is a still
frame and the reveal modules have settled.

### Home page — desktop

| Before                                                                                                                                                                                                                                                                                                          | After                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Home page at 1280px before: the third entry, "Building Texture", has no plate beside its title, only empty paper. The Latest band's metadata reads "May 20, 2025 · 1 min". The topics note claims fill height shows how much of the archive each subject accounts for.](home-modules-home-desktop-before.jpg) | ![Home page at 1280px after: "Building Texture" carries a deep blue plate matching its Creative Practice swatch. The Latest band's metadata reads "Members · May 20, 2025 · 1 min". The topics note reads "Fill height is each subject's size against the largest one."](home-modules-home-desktop-after.jpg) |

### Home page — mobile

| Before                                                                                                                                                               | After                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Home page at 390px before: the same empty plate on "Building Texture" and the same unbadged Latest band, in a single column.](home-modules-home-mobile-before.jpg) | ![Home page at 390px after: the blue plate and the "Members" badge, with the topic swatches reflowed to two columns.](home-modules-home-mobile-after.jpg) |

### What these shots do and do not show

**The plate wash** is the clearest difference: "Building Texture" is seeded
without a featured image on purpose, and the pigment it takes is its subject's —
the same blue as the Creative Practice swatch further down the page. The first
pass of this change rendered nothing at all here, because `.entry__thumb` used
the `background` shorthand and reset the `background-image` the wash sets. Only
the screenshot caught it; `tests/design/plate-wash.test.ts` now catches it.

**The membership badge** on the Latest band appears because the seeded newest
post was set to `members` for the capture. It is public in the seed as shipped.

**The topics note** changes wording because the old claim was not true: the fill
has a 30% floor and a fifth of published posts carry no tag.

**The curation order is not visible here, and cannot be from this seed.** The
development seed has four posts, three of them flagged `featured`, and they are
also the three newest — so the tier chain and reverse-chronological order
produce the same list. What the shots do show is that the Latest band's piece
no longer repeats below it. The tiers themselves are covered by
`tests/content/homepage-picks.test.ts`, which is where the behaviour is pinned;
against the production archive the section becomes three flagged pieces followed
by three recent ones.

**The topics chart shows three swatches because the seed has three tags.** The
change that lifts the limit is only observable against a library with more
subjects than the old cap of six — production has eight after the workflow tag
is dropped.

**The footer carries links here because the seed populates the `footer` global.**
It is empty in production, where the footer renders as the wordmark and the
copyright line alone.

---

## 6. In-article ad slots showed a labelled empty box

`body.tsx` rendered `<AdUnit placement="article-inline" />` with no children in
both body branches, so every in-body slot an ad did not fill was an
"Advertisement" cap over ~280px of paper. The rail's box has held house content
since the slot layer shipped; these six did not. Each now carries one related
article — the tail of the pool "Read next" takes its three from, so no two
slots show the same piece and none repeats what closes the article.

Capture conditions differ from the sections above in two ways, both forced by
what is being photographed:

- **Not full page.** The article seeded for these is 5,958 words and roughly
  27,000px tall, in which a 280px box is invisible. These are viewport shots at
  1280×900 and 390×844, scrolled to centre a slot, so the band is seen with the
  body copy either side of it.
- **A temporarily seeded long article.** `pnpm seed:dev` writes ~130-word
  bodies and the first in-body unit lands at 400 words, so the seeded site
  renders no in-article slot at all and there is nothing to photograph. One
  article at the production mean plus nine short companions — enough for the
  pool to supply nine distinct pieces — were seeded for the capture and removed
  again, the same way section 4's pagination shots were taken.

The ad client is the committed default and no ad is served, which is the
ordinary local state: the loader never resolves, `data-ad-status` never
arrives, and the three-second guess settles the slot as unfilled. That is the
same path a reader running a blocker takes, and it is the commonest reason a
box is empty.

### First slot — desktop

| Before                                                                                                                                                                       | After                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The first in-article slot at 1280px before the fix: an "Advertisement" cap above roughly 280px of empty paper between two paragraphs.](inline-fallback-desktop-before.jpg) | ![The same slot at 1280px after the fix: a band ruled top and bottom, headed "Also from Beyond Every Art", with the headline "Cobalt, Two Centuries Late", its standfirst, and "Creative Practice · 1 min".](inline-fallback-desktop-after.jpg) |

### First slot — mobile

| Before                                                                                                                                           | After                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The first in-article slot at 390px before the fix: the same labelled empty box, full width of the measure.](inline-fallback-mobile-before.jpg) | ![The same slot at 390px after the fix: the band at the narrower measure, headline on two lines and the standfirst clamped to two with an ellipsis.](inline-fallback-mobile-after.jpg) |

### Second slot — desktop

The point of this pair: the next slot down the same article carries a
different piece, and its meta line shows the membership marker where the piece
is gated.

| Before                                                                                                                                                 | After                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The second in-article slot at 1280px before the fix: another labelled empty box, identical to the first.](inline-fallback-desktop-second-before.jpg) | ![The second slot at 1280px after the fix: the same band carrying a different article, "A Short History of the Northern Window", whose meta line reads "Creative Practice · Members · 1 min".](inline-fallback-desktop-second-after.jpg) |

### What these shots do and do not show

**The rail's box is empty in every frame, before and after, and that is not
this change.** The seeded Site Settings leave "Article rail — when no ad is
shown" set to nothing, which is a real operator choice and renders exactly what
it says. Set it to an article or an app and the rail's box fills the way
`pnpm measure:rail --unfilled` shows.

**Six slots is the cap, not the count.** This article draws all six because it
is 5,958 words. The archive's mean does the same; a short piece takes three.

**The air inside the band is the box, not the design.** The type comes to about
165px in a box that is 296, because the reservation belongs to the ad rather
than to the promo. An earlier build pinned the meta line to the bottom rule and
left the whole difference as one hole under the standfirst; centring it is what
these shots show.
