import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { parseGhostExport } from '../../lib/migration/ghost-export'
import { runImport } from '../../lib/migration/import'
import { buildMigrationPlan } from '../../lib/migration/plan'

const plan = buildMigrationPlan(
  parseGhostExport(
    JSON.parse(
      readFileSync(resolve('tests/fixtures/ghost-export-clean.json'), 'utf8'),
    ),
  ),
)

interface Row {
  id: number
  [key: string]: unknown
}

/**
 * Minimal stand-in for Payload's Local API: numeric auto-increment ids, like
 * the Postgres adapter the project actually runs on.
 */
function fakePayload() {
  const collections = new Map<string, Row[]>()
  let nextId = 1

  const docs = (collection: string): Row[] => {
    const existing = collections.get(collection)
    if (existing) return existing
    const created: Row[] = []
    collections.set(collection, created)
    return created
  }

  const payload = {
    find: async ({
      collection,
      where,
    }: {
      collection: string
      where?: { ghostID?: { equals?: string } }
    }) => {
      const ghostID = where?.ghostID?.equals
      return {
        docs: docs(collection).filter((doc) => doc.ghostID === ghostID),
      }
    },
    create: async ({
      collection,
      data,
    }: {
      collection: string
      data: Record<string, unknown>
    }) => {
      const doc: Row = { ...data, id: nextId++ }
      docs(collection).push(doc)
      return doc
    },
    update: async ({
      collection,
      id,
      data,
    }: {
      collection: string
      id: number | string
      data: Record<string, unknown>
    }) => {
      const doc = docs(collection).find((row) => row.id === id)
      if (!doc) throw new Error(`no ${collection} document ${id}`)
      Object.assign(doc, data)
      return doc
    },
  }

  return { payload: payload as unknown as Payload, collections }
}

describe('runImport', () => {
  it('creates every planned record and reports no errors', async () => {
    const { payload, collections } = fakePayload()

    const result = await runImport(payload, plan)

    expect(result.errors).toEqual([])
    expect(result).toMatchObject({
      authorsCreated: 2,
      tagsCreated: 2,
      postsCreated: 3,
      pagesCreated: 2,
    })
    expect(collections.get('posts')!.map((post) => post.ghostID)).toEqual([
      'clean-post-1',
      'clean-post-2',
      'clean-post-3',
    ])
  })

  it('writes relationships using the database id type, not stringified ids', async () => {
    const { payload, collections } = fakePayload()

    await runImport(payload, plan)

    const post = collections
      .get('posts')!
      .find((row) => row.ghostID === 'clean-post-1')!
    const authorIds = collections.get('authors')!.map((row) => row.id)
    const tagIds = collections.get('tags')!.map((row) => row.id)

    // Payload validates relationship values against the collection's id type,
    // so a numeric id coerced to a string is rejected on Postgres.
    expect(post.authors).toEqual([authorIds[0]])
    expect(post.tags).toEqual(tagIds)
    for (const id of [
      ...(post.authors as unknown[]),
      ...(post.tags as unknown[]),
    ]) {
      expect(typeof id).toBe('number')
    }
  })

  it('links featured images to the migrated media id', async () => {
    const { payload, collections } = fakePayload()
    const media = new Map([
      [
        'https://old.ghost.example/content/images/2024/02/corridor.jpg',
        { id: 42, url: '/media/corridor.jpg' },
      ],
    ])

    await runImport(
      payload,
      { ...plan, posts: withFeatureImage(plan) },
      {
        media,
      },
    )

    const post = collections
      .get('posts')!
      .find((row) => row.ghostID === 'clean-post-1')!
    expect(post.featuredImage).toBe(42)
    expect(post.legacyHTML).toContain('/media/corridor.jpg')
  })

  it('is idempotent: a rerun updates in place instead of duplicating', async () => {
    const { payload, collections } = fakePayload()

    await runImport(payload, plan)
    const second = await runImport(payload, plan)

    expect(second).toMatchObject({
      authorsCreated: 0,
      authorsUpdated: 2,
      tagsCreated: 0,
      tagsUpdated: 2,
      postsCreated: 0,
      postsUpdated: 3,
      pagesCreated: 0,
      pagesUpdated: 2,
    })
    expect(second.errors).toEqual([])
    expect(collections.get('posts')).toHaveLength(3)
  })

  it('records a per-record error without abandoning the rest of the import', async () => {
    const { payload, collections } = fakePayload()
    const failing = {
      ...payload,
      create: async (args: { collection: string; data: { slug?: string } }) => {
        if (args.data.slug === 'an-archive-of-blue') {
          throw new Error('duplicate slug')
        }
        return (
          payload as unknown as { create: (a: unknown) => Promise<Row> }
        ).create(args)
      },
    } as unknown as Payload

    const result = await runImport(failing, plan)

    expect(result.errors).toEqual(['post clean-post-3: duplicate slug'])
    expect(result.postsCreated).toBe(2)
    expect(collections.get('pages')).toHaveLength(2)
  })
})

/** The clean fixture carries no feature images; add one for the media test. */
function withFeatureImage(source: typeof plan) {
  return source.posts.map((post) =>
    post.ghostID === 'clean-post-1'
      ? {
          ...post,
          featureImageURL:
            'https://old.ghost.example/content/images/2024/02/corridor.jpg',
        }
      : post,
  )
}
