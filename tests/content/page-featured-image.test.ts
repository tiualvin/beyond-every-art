// A page's featured image has to survive three separate places, and it did not.
//
// `collections/Pages.ts` has carried a `featuredImage` upload field all along,
// the Ghost importer filled it, and `migrate:validate` checks it for pages as
// well as posts — `hasFeatureImage` is part of the cutover gate, and it passed.
// The field was in the database the whole time.
//
// What was missing was every route out of it. `PageDetail` had no `image`, so
// `readPageBySlug` had nothing to map `featuredImage` onto, so the page
// template had nothing to render. Three small absences that each look like
// nothing on their own, and together meant `/about/` served from migration
// until 19 Sep without the image Ghost had.
//
// It stayed invisible because the check that should have caught it could not.
// `images_lost` in the crawl comparator fires only when a target page has
// *zero* images, and #159 put a masthead wordmark on every page — so from that
// deploy the count was never zero and the warning could never fire again, on
// this page or any other (`docs/MIGRATION_REHEARSAL.md` §6). The comparator now
// subtracts sitewide chrome before counting, but a page rendering a field it
// already holds should not depend on a crawl to notice.
//
// So this guards the shape rather than the pixels: the type carries it, the
// query maps it, and the template renders it. Any one of the three going away
// restores the original bug, and none of them would fail a type check.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const queries = read('lib/content/queries.ts')
const template = read('app/(frontend)/[slug]/page.tsx')
const article = read('app/(frontend)/components/article.tsx')
const pages = read('collections/Pages.ts')

describe('a page renders its featured image', () => {
  it('is a field pages actually have', () => {
    expect(pages).toMatch(/name: 'featuredImage'/)
  })

  it('is declared on PageDetail', () => {
    const detail = queries.slice(queries.indexOf('export type PageDetail = {'))
    const body = detail.slice(0, detail.indexOf('}'))

    expect(body).toMatch(/\bimage: MediaImage \| null/)
  })

  it('is mapped by the page query, not just typed', () => {
    // A type alone compiles and returns undefined at runtime, which is the
    // failure this whole file exists for.
    const reader = queries.slice(
      queries.indexOf('async function readPageBySlug'),
    )
    const body = reader.slice(0, reader.indexOf('\n}'))

    expect(body).toMatch(/image: toMediaImage\(doc\.featuredImage\)/)
  })

  it('is rendered by the page template', () => {
    const branch = template.slice(
      template.lastIndexOf("resolved.kind === 'page'"),
    )
    const body = branch.slice(0, branch.indexOf('const { post } = resolved'))

    expect(body).toMatch(/page\.image/)
    expect(body).toMatch(/<FeaturedFigure/)
  })

  it('renders the same component the post template uses', () => {
    // Two implementations would be free to drift on the `sizes` hint, which is
    // the part of a featured image a reader actually pays for.
    expect(article).toMatch(/export function FeaturedFigure/)
    expect(template).toMatch(
      /import \{[^}]*\bFeaturedFigure\b[^}]*\} from '\.\.\/components\/article'/,
    )
  })
})
