# Live Preview — visual evidence

Captured against the seeded development site (`pnpm seed:dev`) in Chromium at
1680px, with a real Payload and PostgreSQL instance behind it. See
[`../../LIVE_PREVIEW.md`](../../LIVE_PREVIEW.md) for how the feature is wired.

![Payload Admin editing a post, with the fields on the left and the live site rendering the same post in an iframe on the right. The preview toolbar above the iframe shows the responsive breakpoint selector, the current 843×959 device size, and a zoom control. The previewed page shows the site header, the Materials eyebrow, the headline, the dek, the byline, and the featured image.](live-preview-desktop.png)

The updating loop is not visible in a still. It was verified in the same browser
session: typing a new title into the editor, with no save button pressed,
changed the headline inside the iframe, and rewriting the excerpt changed the
dek.
