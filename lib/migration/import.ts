// Database write path for the Ghost migration.
//
// This is the only module that talks to Payload. It consumes a pure
// MigrationPlan and upserts records through Payload's Local API, keyed on
// `ghostID` so the import is idempotent and safe to rerun. Authors and tags are
// written first so their new Payload IDs can be substituted into post and page
// relationships.
//
// Media (featured images, inline images) is intentionally NOT uploaded here —
// that is a separate step. Relationships to uploads are left unset for now; the
// plan already records every media URL that will need migrating.

import type { CollectionSlug, Payload } from 'payload'

import type { MigrationPlan, PostPlan } from './plan'

export interface ImportResult {
  authorsCreated: number
  authorsUpdated: number
  tagsCreated: number
  tagsUpdated: number
  postsCreated: number
  postsUpdated: number
  pagesCreated: number
  pagesUpdated: number
  errors: string[]
}

type UpsertData = Record<string, unknown>

interface UpsertOutcome {
  id: string
  created: boolean
}

/**
 * Create or update a single record, matching on `ghostID`. Returns the Payload
 * document id so callers can wire up relationships.
 */
async function upsertByGhostID(
  payload: Payload,
  collection: CollectionSlug,
  ghostID: string,
  data: UpsertData,
): Promise<UpsertOutcome> {
  const existing = await payload.find({
    collection,
    where: { ghostID: { equals: ghostID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const current = existing.docs[0] as { id: string | number } | undefined
  if (current) {
    await payload.update({
      collection,
      id: current.id,
      data: data as never,
      overrideAccess: true,
    })
    return { id: String(current.id), created: false }
  }

  const created = await payload.create({
    collection,
    data: data as never,
    overrideAccess: true,
  })
  return { id: String((created as { id: string | number }).id), created: true }
}

function resolveRelationships(
  item: PostPlan,
  authorIdByGhostID: Map<string, string>,
  tagIdByGhostID: Map<string, string>,
): { authors: string[]; tags: string[] } {
  return {
    authors: item.authorGhostIDs
      .map((ghostID) => authorIdByGhostID.get(ghostID))
      .filter((id): id is string => Boolean(id)),
    tags: item.tagGhostIDs
      .map((ghostID) => tagIdByGhostID.get(ghostID))
      .filter((id): id is string => Boolean(id)),
  }
}

/** Run the full content import for a plan. Assumes a live Payload instance. */
export async function runImport(
  payload: Payload,
  plan: MigrationPlan,
): Promise<ImportResult> {
  const result: ImportResult = {
    authorsCreated: 0,
    authorsUpdated: 0,
    tagsCreated: 0,
    tagsUpdated: 0,
    postsCreated: 0,
    postsUpdated: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    errors: [],
  }

  const authorIdByGhostID = new Map<string, string>()
  const tagIdByGhostID = new Map<string, string>()

  for (const author of plan.authors) {
    try {
      const outcome = await upsertByGhostID(
        payload,
        'authors',
        author.ghostID,
        author.data,
      )
      authorIdByGhostID.set(author.ghostID, outcome.id)
      if (outcome.created) result.authorsCreated++
      else result.authorsUpdated++
    } catch (error) {
      result.errors.push(`author ${author.ghostID}: ${errorMessage(error)}`)
    }
  }

  for (const tag of plan.tags) {
    try {
      const outcome = await upsertByGhostID(
        payload,
        'tags',
        tag.ghostID,
        tag.data,
      )
      tagIdByGhostID.set(tag.ghostID, outcome.id)
      if (outcome.created) result.tagsCreated++
      else result.tagsUpdated++
    } catch (error) {
      result.errors.push(`tag ${tag.ghostID}: ${errorMessage(error)}`)
    }
  }

  for (const post of plan.posts) {
    try {
      const { authors, tags } = resolveRelationships(
        post,
        authorIdByGhostID,
        tagIdByGhostID,
      )
      const outcome = await upsertByGhostID(payload, 'posts', post.ghostID, {
        ...post.data,
        authors,
        tags,
        migrationStatus: 'migrated',
        _status: post.status,
      })
      if (outcome.created) result.postsCreated++
      else result.postsUpdated++
    } catch (error) {
      result.errors.push(`post ${post.ghostID}: ${errorMessage(error)}`)
    }
  }

  for (const page of plan.pages) {
    try {
      const outcome = await upsertByGhostID(payload, 'pages', page.ghostID, {
        ...page.data,
        _status: page.status,
      })
      if (outcome.created) result.pagesCreated++
      else result.pagesUpdated++
    } catch (error) {
      result.errors.push(`page ${page.ghostID}: ${errorMessage(error)}`)
    }
  }

  return result
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
