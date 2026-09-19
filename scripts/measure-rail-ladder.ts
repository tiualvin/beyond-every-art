/**
 * Measure the post rail's sticky group, in a browser, at a range of window
 * heights.
 *
 * The numbers this prints are the ones `docs/POST_PAGE_LAYOUT.md` records, the
 * ones the rung boundaries in `app/globals.css` are chosen from, and the
 * `GROUP` constants in `tests/design/article-layout.test.ts`. Run it after
 * touching anything in the group and carry the output into all three.
 *
 * Why a browser rather than arithmetic. Most of the group is computable — the
 * design test recomputes the related list from the stylesheet and agrees with
 * Chromium to a tenth of a pixel — but the newsletter card is not: its button
 * is an inline-block sitting on a text baseline, which adds descender space
 * that arithmetic silently omits and a layout engine does not. Three pixels,
 * which is the whole margin one of the rung boundaries has.
 *
 * It renders the real `ArticleRail` rather than a copy of its markup, so the
 * harness cannot drift from the component the way a hand-written replica
 * would. Fonts come from Google Fonts, the same faces `next/font` serves, so
 * this needs network access; the line boxes depend on the real metrics and a
 * fallback face would quietly change every number below.
 *
 *   pnpm measure:rail                        # the default sweep
 *   pnpm measure:rail 900 800                # specific viewport heights
 *   pnpm measure:rail --shot docs/... 800    # and write a PNG per height
 *
 * It renders whatever `lib/ads/eligibility.ts` says this environment would, so
 * `NEXT_PUBLIC_ADSENSE_CLIENT=off pnpm measure:rail` measures the rail as a
 * members-only teaser and a staging deployment get it: no unit, a 433px group,
 * and none of the rungs applying.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { chromium } from '@playwright/test'
import { renderToStaticMarkup } from 'react-dom/server'

import { ArticleRail } from '@/app/(frontend)/components/article-rail'
import type { PostCard } from '@/lib/content/queries'

/** Titles long enough to reach the two-line clamp, which is the budgeted case. */
const RELATED: PostCard[] = [
  'Why Burnt Sienna Behaves Differently in Oil Than in Watercolour',
  'Why Titanium White Behaves Differently Than Lead White',
  'The Quiet Argument for Leaving a Great Deal of Space Empty in a Composition',
].map((title, index) => ({
  id: String(index + 1),
  slug: `measured-post-${index + 1}`,
  title,
  excerpt: '',
  readingTime: 14 - index,
  tags: [{ name: 'materials-science', slug: 'materials-science' }],
})) as unknown as PostCard[]

const HEIGHTS = [
  1080, 937, 900, 860, 820, 819, 800, 770, 769, 740, 700, 683, 682, 640, 600,
  560, 538, 537,
]

function page(): string {
  const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
  const rail = renderToStaticMarkup(
    ArticleRail({ headings: [], related: RELATED, restricted: false }),
  )

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=block" rel="stylesheet">
<style>${css}</style>
<style>
  /* next/font exposes these on <html>; the harness supplies the same names so
     the stylesheet resolves to the real faces. */
  :root { --font-inter: 'Inter'; --font-playfair: 'Playfair Display'; }
  body { margin: 0; }
  /* The two tracks of .article__shell at a width that carries the rail. */
  .harness { display: grid; grid-template-columns: minmax(0, 1fr) 300px; column-gap: 3rem; padding: 0 1.5rem; }
  .harness__column { height: 6000px; }
  /* The rail is display:none until 80rem, which this harness is wider than —
     but the width is set by the viewport, so say it rather than rely on it. */
  .article__rail { display: block; }
</style>
</head>
<body><div class="harness"><div class="harness__column"></div>${rail}</div></body>
</html>`
}

async function main() {
  const argv = process.argv.slice(2)
  const shotAt = argv.indexOf('--shot')
  const shotDir = shotAt === -1 ? null : argv[shotAt + 1]
  const heights = argv
    .filter(
      (_, index) => shotAt === -1 || (index !== shotAt && index !== shotAt + 1),
    )
    .map(Number)
    .filter(Boolean)
  const browser = await chromium.launch()
  const html = page()

  console.log(
    ['viewport', 'cap', 'group', 'list', 'whole', 'card', 'listed'].join('\t'),
  )

  for (const height of heights.length ? heights : HEIGHTS) {
    const context = await browser.newPage({ viewport: { width: 1440, height } })
    await context.setContent(html, { waitUntil: 'load' })
    await context.evaluate(() => document.fonts.ready)
    await context.evaluate(() => window.scrollTo(0, 2000))
    await context.waitForTimeout(80)

    // No named inner functions in here: esbuild's `keepNames` rewrites them to
    // call a `__name` helper that exists in this module and not in the page,
    // and the evaluate then fails with a ReferenceError inside the browser.
    const measured = await context.evaluate(() => {
      const sticky = document.querySelector('.rail__sticky')!
      const related = document.querySelector('.rail__related')
      const list = document.querySelector('.rail__related .rail__list')
      const port = list?.getBoundingClientRect()
      const whole = port
        ? [...document.querySelectorAll('.rail__list > li')].filter(
            (item) =>
              item.getBoundingClientRect().top >= port.top - 0.5 &&
              item.getBoundingClientRect().bottom <= port.bottom + 0.5,
          ).length
        : 0

      return {
        cap: parseFloat(getComputedStyle(sticky).maxHeight),
        group: sticky.scrollHeight,
        list: list ? Math.round(list.scrollHeight * 10) / 10 : 0,
        whole,
        card:
          Math.round(
            (document.querySelector('.rail__signup')?.getBoundingClientRect()
              .height ?? 0) * 10,
          ) / 10,
        listed: related ? getComputedStyle(related).display !== 'none' : false,
      }
    })

    console.log(
      [
        height,
        measured.cap,
        measured.group,
        measured.list,
        measured.listed ? measured.whole : '—',
        measured.card,
        measured.listed,
      ].join('\t'),
    )

    if (shotDir) {
      const file = resolve(process.cwd(), shotDir, `rail-${height}.png`)
      // The rail and a slice of the column beside it, which is the crop the
      // shots in docs/assets/post-layout are cropped to.
      await context.screenshot({
        path: file,
        clip: { x: 1000, y: 0, width: 440, height },
      })
      console.error(`wrote ${file}`)
    }

    await context.close()
  }

  await browser.close()
}

await main()
