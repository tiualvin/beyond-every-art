// CLI entry point for post-import migration validation.
//
//   pnpm migrate:validate --input ghost-export/ghost-content.json
//   pnpm migrate:validate --input ... --report validation-report.json
//
// It builds the expected migration plan from a Ghost export, queries what
// actually landed in Payload, and reports any discrepancy: missing posts,
// pages, tags, or authors; drafts that became published (or vice versa); lost
// feature images; changed slugs; changed publication dates; or SEO metadata
// (meta title, meta description, canonical URL, excerpt) the export carried and
// the import did not preserve. Exits non-zero when any discrepancy is found, so
// it can gate a cutover.
//
// Unlike the importer, validation must read the database, so there is no
// --dry-run: it is already read-only.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseGhostExport } from '../lib/migration/ghost-export'
import { buildMigrationPlan, type ContentStatus } from '../lib/migration/plan'
import {
  isClean,
  validateContent,
  validateRefs,
  type ActualContent,
  type ActualRef,
} from '../lib/migration/validate'

interface Cli {
  input: string
  reportPath: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  const input = flagValue(argv, '--input') ?? process.env.GHOST_EXPORT_PATH
  if (!input) {
    throw new Error('Provide --input <path> or set GHOST_EXPORT_PATH')
  }
  return {
    input,
    reportPath: flagValue(argv, '--report') ?? 'validation-report.json',
  }
}

interface RawDoc {
  ghostID?: string | null
  slug?: string | null
  _status?: string | null
  publishedAt?: string | null
  featuredImage?: unknown
  metaTitle?: string | null
  metaDescription?: string | null
  canonicalURL?: string | null
  excerpt?: string | null
}

function statusOf(doc: RawDoc): ContentStatus {
  return doc._status === 'draft' ? 'draft' : 'published'
}

function toActualContent(docs: RawDoc[]): ActualContent[] {
  return docs
    .filter((doc): doc is RawDoc & { ghostID: string } => Boolean(doc.ghostID))
    .map((doc) => ({
      ghostID: doc.ghostID,
      slug: doc.slug ?? '',
      status: statusOf(doc),
      hasFeatureImage: Boolean(doc.featuredImage),
      publishedAt: doc.publishedAt ?? undefined,
      metaTitle: doc.metaTitle ?? undefined,
      metaDescription: doc.metaDescription ?? undefined,
      canonicalURL: doc.canonicalURL ?? undefined,
      excerpt: doc.excerpt ?? undefined,
    }))
}

function toActualRefs(docs: RawDoc[]): ActualRef[] {
  return docs
    .filter((doc): doc is RawDoc & { ghostID: string } => Boolean(doc.ghostID))
    .map((doc) => ({ ghostID: doc.ghostID, slug: doc.slug ?? '' }))
}

async function main() {
  const { input, reportPath } = parseArgs(process.argv.slice(2))

  const ghost = parseGhostExport(
    JSON.parse(await readFile(resolve(input), 'utf8')),
  )
  const plan = buildMigrationPlan(ghost)

  const expectedPosts = plan.posts.map((p) => ({
    ghostID: p.ghostID,
    slug: p.slug,
    status: p.status,
    hasFeatureImage: Boolean(p.featureImageURL),
    publishedAt: p.data.publishedAt,
    metaTitle: p.data.metaTitle,
    metaDescription: p.data.metaDescription,
    canonicalURL: p.data.canonicalURL,
    excerpt: p.data.excerpt,
  }))
  // Pages carry no excerpt in the Ghost export, so the plan has none to check.
  const expectedPages = plan.pages.map((p) => ({
    ghostID: p.ghostID,
    slug: p.slug,
    status: p.status,
    hasFeatureImage: Boolean(p.featureImageURL),
    publishedAt: p.data.publishedAt,
    metaTitle: p.data.metaTitle,
    metaDescription: p.data.metaDescription,
    canonicalURL: p.data.canonicalURL,
  }))
  const expectedTags = plan.tags.map((t) => ({
    ghostID: t.ghostID,
    slug: t.data.slug,
  }))
  const expectedAuthors = plan.authors.map((a) => ({
    ghostID: a.ghostID,
    slug: a.data.slug,
  }))

  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  async function findAll(collection: string): Promise<RawDoc[]> {
    const result = await payload.find({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      overrideAccess: true,
      depth: 0,
      draft: true,
      pagination: false,
    })
    return result.docs as RawDoc[]
  }

  const [posts, pages, tags, authors] = await Promise.all([
    findAll('posts'),
    findAll('pages'),
    findAll('tags'),
    findAll('authors'),
  ])

  const reports = {
    posts: validateContent(expectedPosts, toActualContent(posts)),
    pages: validateContent(expectedPages, toActualContent(pages)),
    tags: validateRefs(expectedTags, toActualRefs(tags)),
    authors: validateRefs(expectedAuthors, toActualRefs(authors)),
  }

  const clean = isClean(Object.values(reports))
  const report = { ok: clean, collections: reports }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (!clean) process.exitCode = 1
}

main()
  .then(() => {
    // On a real run Payload holds an open Postgres pool, so the event loop
    // never drains on its own. Exit explicitly with the code set above, or CI
    // (and any cutover runbook step) would hang after the report is written.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
