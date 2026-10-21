// What a processing run reads and writes in Payload.
//
// The decisions are in `./plan.ts` and the PDF work in `./tools.ts`; this is
// the thin layer between them and the Local API, in the shape of
// `lib/billing/store.ts`. Everything here runs with `overrideAccess`, because
// its callers are the processing command and a delete hook, never a request
// on behalf of a reader — and because the three collections it writes refuse
// every write that does not.

import type {
  CollectionBeforeDeleteHook,
  Payload,
  PayloadRequest,
  Where,
} from 'payload'

import { PUBLICATION_PAGE_IMAGES } from '../../../collections/PublicationPageImages'
import { PUBLICATION_PAGES } from '../../../collections/PublicationPages'
import { PUBLICATION_RUNS } from '../../../collections/PublicationRuns'

import type { ExistingPage, RunStatus } from './plan'
import type { RejectionReason } from './tools'

// Postgres serial IDs; the collections here use no custom ID.
type ID = number

/**
 * A bulk delete reports the documents it could not delete instead of
 * throwing. A cleanup that silently leaves rows behind is worse than one that
 * stops, so this turns the report into an error.
 */
function deleted(
  result: { docs: unknown[]; errors?: Array<{ message?: string }> },
  what: string,
) {
  if (result.errors?.length) {
    throw new Error(
      `Could not delete ${what}: ${result.errors.map((e) => e.message).join('; ')}`,
    )
  }
  return result.docs.length
}

export type PublicationRef = {
  id: ID
  slug: string
  title: string
}

/** A publication by slug, or by ID when given digits. Trashed ones are not found. */
export async function findPublication(
  payload: Payload,
  ref: string,
): Promise<PublicationRef | null> {
  const where: Where = /^\d+$/.test(ref)
    ? { id: { equals: Number(ref) } }
    : { slug: { equals: ref } }
  const result = await payload.find({
    collection: 'publications',
    where,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    // The newest version, so a draft that has never been published is found.
    draft: true,
  })
  const doc = result.docs[0] as
    { id: ID; slug?: string; title?: string } | undefined
  if (!doc) return null
  return { id: doc.id, slug: doc.slug ?? ref, title: doc.title ?? ref }
}

/**
 * A draft publication to hold a generated sample — for CI and for trying the
 * pipeline on a server before a real issue exists. Never published here; the
 * routes stay closed whatever its status (`lib/publications/launch.ts`).
 */
export async function createSampleDraft(
  payload: Payload,
  slug: string,
): Promise<PublicationRef> {
  const title = 'Sample issue (generated, not for publication)'
  const doc = (await payload.create({
    collection: 'publications',
    data: { title, slug },
    draft: true,
    overrideAccess: true,
  })) as { id: ID }
  return { id: doc.id, slug, title }
}

export type RunRecord = {
  id: ID
  status?: RunStatus | null
  updatedAt?: string | null
  createdAt?: string | null
}

export async function activeRuns(
  payload: Payload,
  publication: ID,
  statuses: readonly RunStatus[],
): Promise<RunRecord[]> {
  const result = await payload.find({
    collection: PUBLICATION_RUNS,
    where: {
      and: [
        { publication: { equals: publication } },
        { status: { in: [...statuses] } },
      ],
    },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return result.docs as RunRecord[]
}

export type RunPatch = Partial<{
  status: RunStatus
  source: {
    kind?: 'r2' | 'file' | 'sample'
    name?: string
    bytes?: number
    sha256?: string
  }
  pageCount: number
  pagesDone: number
  currentPage: number | null
  progress: number
  rendition: number
  startedAt: string
  finishedAt: string
  rejection: RejectionReason | null
  error: string | null
  summary: Record<string, unknown>
}>

export async function createRun(
  payload: Payload,
  publication: ID,
  data: RunPatch & { status: RunStatus },
): Promise<RunRecord> {
  return (await payload.create({
    collection: PUBLICATION_RUNS,
    data: { publication, ...data },
    overrideAccess: true,
  })) as RunRecord
}

/** Writes progress. Each write also moves `updatedAt`, which is the heartbeat. */
export async function updateRun(
  payload: Payload,
  id: ID,
  data: RunPatch,
): Promise<void> {
  await payload.update({
    collection: PUBLICATION_RUNS,
    id,
    data,
    depth: 0,
    overrideAccess: true,
  })
}

export async function existingPages(
  payload: Payload,
  publication: ID,
): Promise<Array<ExistingPage & { id: ID }>> {
  const result = await payload.find({
    collection: PUBLICATION_PAGES,
    where: { publication: { equals: publication } },
    // Never `words`: a page's word positions run to hundreds of kilobytes.
    select: {
      pageNumber: true,
      sourceSha256: true,
      rendition: true,
      status: true,
      image: true,
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return result.docs as Array<ExistingPage & { id: ID }>
}

export type PageData = {
  status: 'ready' | 'failed'
  error?: string | null
  width?: number
  height?: number
  image?: ID | null
  text?: string
  words?: unknown[]
  links?: unknown[]
  sourceSha256: string
  rendition: number
  run: ID
}

/**
 * Writes a page by its issue and number — the unique index in
 * `collections/PublicationPages.ts` — touching only the fields the command
 * owns. A failed page keeps the image and text it had, so one bad redraw does
 * not blank a page that was fine before.
 */
export async function upsertPage(
  payload: Payload,
  publication: ID,
  pageNumber: number,
  data: PageData,
): Promise<void> {
  const found = await payload.find({
    collection: PUBLICATION_PAGES,
    where: {
      and: [
        { publication: { equals: publication } },
        { pageNumber: { equals: pageNumber } },
      ],
    },
    select: { pageNumber: true },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const existing = found.docs[0] as { id: ID } | undefined
  if (existing) {
    await payload.update({
      collection: PUBLICATION_PAGES,
      id: existing.id,
      data,
      depth: 0,
      overrideAccess: true,
    })
    return
  }
  await payload.create({
    collection: PUBLICATION_PAGES,
    data: { publication, pageNumber, ...data },
    depth: 0,
    overrideAccess: true,
  })
}

/**
 * The page image with this name, or a new one from these bytes.
 *
 * Names are hashes of the bytes and the issue (`pageImageFilename`), so an
 * existing image is the same picture and is reused — which is also what keeps
 * Payload from quietly storing a second copy as `<name>-1.webp`, a different
 * URL for the same page.
 *
 * `refresh` writes the bytes again over an image that is already recorded:
 * the way back when the files are gone but the records are not — R2 objects
 * deleted, or a database restored onto storage that lost them. The name is
 * the content's hash, so writing it again can only restore what it was.
 */
export async function findOrCreatePageImage(
  payload: Payload,
  publication: ID,
  filename: string,
  bytes: Buffer,
  options: { refresh?: boolean } = {},
): Promise<{ id: ID; created: boolean }> {
  const found = await payload.find({
    collection: PUBLICATION_PAGE_IMAGES,
    where: { filename: { equals: filename } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const file = {
    data: bytes,
    mimetype: 'image/webp',
    name: filename,
    size: bytes.length,
  }
  const existing = found.docs[0] as { id: ID } | undefined
  if (existing) {
    if (options.refresh) {
      await payload.update({
        collection: PUBLICATION_PAGE_IMAGES,
        id: existing.id,
        data: {},
        file,
        overwriteExistingFiles: true,
        depth: 0,
        overrideAccess: true,
      })
    }
    return { id: existing.id, created: false }
  }
  const doc = (await payload.create({
    collection: PUBLICATION_PAGE_IMAGES,
    data: { publication },
    file,
    // A file with this name and no record — left on local disk by a database
    // that was reset or restored — holds these same bytes, so writing over it
    // is right. Without this Payload renamed the upload to `<name>-1.webp`
    // and every page of the issue failed, on every run.
    overwriteExistingFiles: true,
    depth: 0,
    overrideAccess: true,
  })) as { id: ID; filename?: string }
  if (doc.filename && doc.filename !== filename) {
    // Payload renamed it, so the name no longer says what is inside. Nothing
    // should get here — the lookup above runs first, and one run writes an
    // issue at a time — so stop rather than store a misleading URL.
    throw new Error(`Payload stored page image ${filename} as ${doc.filename}.`)
  }
  return { id: doc.id, created: true }
}

/** Pages numbered past the end of the file, left from a longer earlier PDF. */
export async function deletePagesAfter(
  payload: Payload,
  publication: ID,
  pageCount: number,
): Promise<number> {
  const result = await payload.delete({
    collection: PUBLICATION_PAGES,
    where: {
      and: [
        { publication: { equals: publication } },
        { pageNumber: { greater_than: pageCount } },
      ],
    },
    depth: 0,
    overrideAccess: true,
  })
  return deleted(result, 'pages past the end of the file')
}

/**
 * Deletes the issue's page images that no page points at any more — earlier
 * renditions of redrawn pages. Deleting the document deletes its file and
 * every size from storage. Run only after every page has been written, so no
 * page is ever left pointing at a deleted image.
 */
export async function deleteUnusedPageImages(
  payload: Payload,
  publication: ID,
): Promise<number> {
  const pages = await payload.find({
    collection: PUBLICATION_PAGES,
    where: { publication: { equals: publication } },
    select: { image: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const used = (pages.docs as Array<{ image?: ID | { id: ID } | null }>)
    .map((page) =>
      typeof page.image === 'object' && page.image ? page.image.id : page.image,
    )
    .filter((id): id is ID => id !== null && id !== undefined)
  const result = await payload.delete({
    collection: PUBLICATION_PAGE_IMAGES,
    where: {
      and: [
        { publication: { equals: publication } },
        ...(used.length ? [{ id: { not_in: used } }] : []),
      ],
    },
    depth: 0,
    overrideAccess: true,
  })
  return deleted(result, 'unused page images')
}

/**
 * Removes everything processing made for an issue: its pages, its runs and
 * its page images, with their files.
 *
 * For a publication deleted for good. Each of the three points at the
 * publication through a required column, so the delete would otherwise fail
 * on a constraint an administrator emptying the trash could do nothing about.
 * The source PDF in R2 is not touched: it is the owner's copy, not the issue's
 * (`docs/BACKUP_AND_RESTORE.md`).
 */
export async function removeProcessedRecords(
  payload: Payload,
  publication: number | string,
  req?: PayloadRequest,
): Promise<void> {
  const where: Where = { publication: { equals: publication } }
  // Pages first: they point at the images and the runs.
  for (const collection of [
    PUBLICATION_PAGES,
    PUBLICATION_RUNS,
    PUBLICATION_PAGE_IMAGES,
  ] as const) {
    deleted(
      await payload.delete({
        collection,
        where,
        depth: 0,
        overrideAccess: true,
        req,
      }),
      collection,
    )
  }
}

/**
 * `removeProcessedRecords` as a hook on `collections/Publications.ts`, so a
 * permanent delete takes the issue's processed records in the same
 * transaction. Moving an issue to the trash is an update and runs no delete
 * hook, so a trashed issue keeps them.
 */
export const removeProcessingOnDelete: CollectionBeforeDeleteHook = ({
  id,
  req,
}) => removeProcessedRecords(req.payload, id, req)
