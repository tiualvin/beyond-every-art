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
