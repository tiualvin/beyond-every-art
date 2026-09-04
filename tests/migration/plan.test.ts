import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseGhostExport } from '../../lib/migration/ghost-export'
import { buildMigrationPlan, summarizePlan } from '../../lib/migration/plan'

const ghost = parseGhostExport(
  JSON.parse(readFileSync(resolve('tests/fixtures/ghost-export.json'), 'utf8')),
)
const plan = buildMigrationPlan(ghost)

describe('buildMigrationPlan', () => {
  it('splits posts from pages using the Ghost type field', () => {
    expect(plan.posts.map((post) => post.ghostID)).toEqual([
      'post-1',
      'post-2',
      'post-3',
      'post-4',
    ])
    expect(plan.pages.map((page) => page.ghostID)).toEqual(['page-1'])
  })

  it('maps authors and tags with their Ghost IDs preserved', () => {
    expect(plan.authors.map((a) => a.data.ghostID)).toEqual([
      'user-1',
      'user-2',
    ])
    expect(plan.tags.map((t) => t.data.ghostID)).toEqual([
      'tag-1',
      'tag-2',
      'tag-3',
    ])
  })

  it('preserves slugs, dates, excerpts, featured flag, and legacy HTML', () => {
    const post = plan.posts.find((p) => p.ghostID === 'post-1')!
    expect(post.data.slug).toBe('understanding-ultramarine')
    expect(post.data.publishedAt).toBe('2023-01-02T09:00:00.000Z')
    expect(post.data.ghostUpdatedAt).toBe('2023-01-05T09:00:00.000Z')
    expect(post.data.excerpt).toBe('A short history of the bluest blue.')
    expect(post.data.featured).toBe(true)
    expect(post.data.legacyHTML).toContain('Ultramarine is a storied pigment')
    expect(post.data.ghostURL).toBe(
      'https://old.ghost.example/understanding-ultramarine/',
    )
  })

  it('maps SEO metadata from posts_meta', () => {
    const post = plan.posts.find((p) => p.ghostID === 'post-1')!
    expect(post.data.metaTitle).toBe(
      'Understanding Ultramarine | Beyond Every Art',
    )
    expect(post.data.metaDescription).toBe(
      'The history and chemistry of ultramarine blue.',
    )
  })

  it('resolves author and tag relationships in sort order', () => {
    const post = plan.posts.find((p) => p.ghostID === 'post-1')!
    expect(post.authorGhostIDs).toEqual(['user-1'])
    // tag-99 is dropped because it is missing from the export.
    expect(post.tagGhostIDs).toEqual(['tag-1', 'tag-3'])
  })

  it('imports scheduled/draft posts as drafts and keeps published as published', () => {
    expect(plan.posts.find((p) => p.ghostID === 'post-2')!.status).toBe('draft')
    expect(plan.posts.find((p) => p.ghostID === 'post-1')!.status).toBe(
      'published',
    )
  })

  it('normalizes visibility to the allowed set', () => {
    expect(
      plan.posts.find((p) => p.ghostID === 'post-2')!.data.visibility,
    ).toBe('members')
    expect(
      plan.posts.find((p) => p.ghostID === 'post-1')!.data.visibility,
    ).toBe('public')
  })

  it('collects unique media URLs from HTML and image fields', () => {
    const post = plan.posts.find((p) => p.ghostID === 'post-1')!
    expect(post.mediaURLs).toEqual(
      expect.arrayContaining([
        'https://old.ghost.example/content/images/2023/01/ultramarine.jpg',
        'https://old.ghost.example/content/images/2023/01/feature.jpg',
        'https://old.ghost.example/content/images/2023/01/og.jpg',
      ]),
    )
    // Deduplicated across the whole export.
    expect(new Set(plan.media).size).toBe(plan.media.length)
  })

  it('reports duplicate slugs, missing authors, and missing tags', () => {
    expect(plan.conflicts.duplicateSlugs).toEqual(['understanding-ultramarine'])
    expect(plan.conflicts.reservedSlugs).toEqual([])
    expect(plan.conflicts.missingAuthors).toEqual(['user-99'])
    expect(plan.conflicts.missingTags).toEqual(['tag-99'])
  })

  it('reports content that would be shadowed by an application route', () => {
    const raw = JSON.parse(
      readFileSync(resolve('tests/fixtures/ghost-export.json'), 'utf8'),
    )
    raw.db[0].data.posts[0].slug = 'publication'

    const reservedPlan = buildMigrationPlan(parseGhostExport(raw))

    expect(reservedPlan.conflicts.reservedSlugs).toEqual([
      {
        collection: 'posts',
        ghostID: 'post-1',
        slug: 'publication',
      },
    ])
  })

  // Payload's slug field now refuses anything outside `SLUG_PATTERN`, so an
  // export carrying one would fail partway through an import against a live
  // database. This is the dry run that says so first, and names the document.
  it('reports slugs the collections would refuse', () => {
    const raw = JSON.parse(
      readFileSync(resolve('tests/fixtures/ghost-export.json'), 'utf8'),
    )
    raw.db[0].data.posts[0].slug = 'Notes From The Studio!'

    const malformedPlan = buildMigrationPlan(parseGhostExport(raw))

    expect(malformedPlan.conflicts.malformedSlugs).toEqual([
      {
        collection: 'posts',
        ghostID: 'post-1',
        slug: 'Notes From The Studio!',
      },
    ])
  })

  // Ghost produced the shape the rule describes, which is why the rule is that
  // shape. If this ever fails, the validator has become stricter than the URLs
  // already published under it.
  it('finds nothing to refuse in an export Ghost actually produced', () => {
    expect(plan.conflicts.malformedSlugs).toEqual([])
  })
})

describe('summarizePlan', () => {
  it('produces serializable counts', () => {
    expect(summarizePlan(plan)).toMatchObject({
      version: '5.0',
      authors: 2,
      tags: 3,
      posts: 4,
      pages: 1,
      drafts: 1,
      duplicateSlugs: ['understanding-ultramarine'],
      reservedSlugs: [],
      malformedSlugs: [],
      missingAuthors: ['user-99'],
      missingTags: ['tag-99'],
    })
  })
})

// Ghost stores an internal canonical as `__GHOST_URL__/some-post/` and expands
// the placeholder at render time. Passing it through gave `fine-art-home-guide`
// a live canonical of `https://<host>/__GHOST_URL__/fine-art-home-guide/`,
// found on 4 Sep by comparing all 113 posts' rendered metadata against Ghost's.
// It was the only difference in 113 canonicals — and invisible to
// `migrate:validate`, which compares the stored value against the export's own,
// where the placeholder is exactly what the export says.
describe('canonical URLs carry no Ghost placeholder', () => {
  const withCanonical = (canonical: string | null) =>
    buildMigrationPlan(
      parseGhostExport({
        db: [
          {
            data: {
              posts: [
                {
                  id: 'post-c',
                  title: 'Canonical',
                  slug: 'canonical',
                  status: 'published',
                  canonical_url: canonical,
                },
              ],
            },
          },
        ],
      }),
    ).posts[0]!.data.canonicalURL

  it('strips the placeholder, leaving a root-relative path', () => {
    // Root-relative rather than absolute on purpose: Next resolves it against
    // `metadataBase`, so it follows the origin across the cutover flip instead
    // of pinning the staging host into the database.
    expect(withCanonical('__GHOST_URL__/fine-art-home-guide/')).toBe(
      '/fine-art-home-guide/',
    )
  })

  it('leaves an external canonical alone', () => {
    expect(withCanonical('https://elsewhere.example/hello/')).toBe(
      'https://elsewhere.example/hello/',
    )
  })

  it('maps absent and empty values to undefined, not an empty string', () => {
    // An empty string would be written to the field and would then override
    // the canonical the route computes, which is the opposite of harmless.
    expect(withCanonical(null)).toBeUndefined()
    expect(withCanonical('__GHOST_URL__')).toBeUndefined()
  })
})
