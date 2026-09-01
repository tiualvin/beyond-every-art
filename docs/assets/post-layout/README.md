# Post layout — before and after

Evidence for the three-track post template described in
[`../../POST_PAGE_LAYOUT.md`](../../POST_PAGE_LAYOUT.md).

Every shot is the `Article` component rendered to static markup with the real
`app/globals.css`, captured in Chromium at 1440×900 and 390×844. The copy is
sample content and the images are placeholder gradients — the media server is
not running in the harness, and the point of these is the geometry.

One difference from a real page: the component's entrance animations ship
`opacity: 0` in server markup and this page never hydrates, so the capture
neutralises that. Nothing else is overridden.

## 1440 — the first screen

| Before                                                                                                                                                                                                                       | After                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The post template at 1440 before the change: a 656px column centred in the page, holding eyebrow, title, dek, byline, share row and then the featured image, with 392px of empty paper either side.](post-before-1440.jpg) | ![The same post after: the title block on the left at 672px, the featured image beside it at 608px, and below them the body, a hanging caption in the notes margin, and the rail with a contents list and related pieces.](post-after-1440.jpg) |

The first paragraph starts 1009px down the page before and 569px after.

## 1440 — the body

| Before                                                                                                                   | After                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The body before: text, figure and caption all at 656px, with the rest of the screen empty.](post-before-1440-body.jpg) | ![The body after: the figure's caption hangs in the notes margin beside the text, a wide figure bleeds to 980px, and the rail carries related pieces and the sticky newsletter card.](post-after-1440-body.jpg) |

## 390

![The post at 390px: a single column, no rail, no notes margin — the same layout the template had.](post-after-390.jpg)

Unchanged. The rail is hidden below 1280 and nothing widens there, so a phone
gets the template it already had.
