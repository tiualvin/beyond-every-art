# Frontend gap fixes — before and after

Visual evidence for the four frontend gaps fixed alongside these images. Every
shot is the seeded development site (`pnpm seed:dev`) captured in Chromium at
1280px and 390px, full page.

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
