# The editorial admin — visual evidence

Captured against the seeded development site (`pnpm seed:dev` + `pnpm seed:e2e`)
in Chromium, with a real Payload and PostgreSQL instance behind it. See
[`../../EDITORIAL_ADMIN.md`](../../EDITORIAL_ADMIN.md) for how each piece is
wired and why it is shaped the way it is.

Every number in these shots is a real query against the seeded database, not a
mock. The counts are small because the seed is small.

## The post edit screen

![Payload Admin editing a post. Three tabs across the top — Content, Search and sharing, Migration — with Content selected. The main column holds Title, Excerpt, Featured Image and the rich-text Content editor, with Legacy HTML below it. The right sidebar holds Slug, Publish date, Visibility, Featured, Authors, Tags, Hide from search engines and Owners, each with a sentence of explanation underneath. The Visibility select reads "Public — anyone can read it".](post-edit-screen.png)

Twenty fields used to stand in one flat column in the order they were invented,
with the rich-text editor tenth. The tabs are **unnamed**, which is what makes
this a rearrangement and not a migration — see the layout rule in
`EDITORIAL_ADMIN.md`.

## The dashboard

![The Payload dashboard with a panel above the usual collection grid. The panel is headed "Beyond Every Art" in burgundy serif, subtitled "What is waiting on somebody", and holds three figures: 1 in draft, 3 live with no cover, 2 live with no tags. Each figure is a link, and each carries a line of explanation — "Their cards render without an image in every listing", "These reach no tag archive and no read next list".](dashboard.png)

Rows with a count of zero are not drawn, so a clean publication gets a sentence
rather than a wall of zeroes. Each figure links into the list view already
filtered to exactly those documents; every link was checked to return the number
of rows its count claims, compound filters included.

## Search and sharing

![The Search and sharing tab of a post. A bordered card shows how the document is likely to appear in a search result — the URL beyondeveryart.com/e2e-unpublished-studio-notes/, the title, and the description — followed by two meters reading "Title 28 / 60" and "Description 56 / 155". Below the card sit the Meta Title, Meta Description and Canonical URL fields, all empty. The right sidebar shows a "Before publishing" list: no cover, no tags, no byline.](search-and-sharing.png)

Both metadata fields are empty here, and the preview is drawn from the article's
own title and excerpt — which is what a crawler would use, so it is what the
preview shows. The meters warn and never block: search engines measure pixels,
not characters, and rewrite both fields at will.

The sidebar list in the same shot is `PublishReadiness`, which states what is
missing and does not refuse the save or the publish.

## The block picker

![The rich-text editor with the slash-command menu open, headed "Blocks". Nine entries are visible — Key takeaways, FAQ, Feature list, Image and text, Comparison table, Dropdown, Pull quote, Newsletter signup, Callout — each with a small line drawing to its left.](block-picker.png)

Fourteen modules, each with a 20×20 line drawing. The icons are inline `data:`
URIs rather than files, so there is no asset directory to survive the
Dockerfile's copy steps; `img-src` already permits `data:` for exactly this.

Icons appear in the slash menu shown here and in the toolbar. The groups — Text,
Media, Lists & tables, Audience — organise the block drawer rather than this
menu, which is flat.

## What breaks if an image goes

![The Media edit view for seed-raking-light-study.jpg. Below the thumbnail and its Preview Sizes and Edit Image buttons, a bordered panel reads "Cover image on 1 document." and links to "Light and Shadow in Renaissance Masterpieces", followed by a note: "Covers only. An image placed inside an article body is stored in the body itself, so it is not counted here — deleting this may still blank a picture inside a piece."](media-usage.png)

`Media.ts` already warned that deleting an upload removes the file every post
referencing it renders, "and unlike a post, nothing about the admin list makes
that visible before the click". This is that half. It is deliberately honest
about its own limit rather than implying it found everything.

The **Edit Image** button beside the thumbnail is the focal point and crop UI,
which needed no migration — `focal_x` and `focal_y` already exist on every
Payload upload collection, so the columns were there and only the means to fill
them was missing.

## Not visible in a still

- The globals preview. `Header`, `Footer` and `SiteSettings` each show the Live
  Preview toggle, and clicking it loads the homepage in the frame. Verified in
  the same browser session by reading the iframe's `src`.
- That the dashboard obeys access control. The counts run with
  `overrideAccess: false` and the signed-in user, so an author sees their own
  drafts and not the publication's.
