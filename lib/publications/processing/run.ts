// One processing run: a PDF in, an issue's pages out.
//
// The brief's twenty steps (`docs/PUBLICATION_SYSTEM.md`, "PDF processing")
// collapse to these, each recorded on the run as it starts so the admin can
// say where a run is or where it stopped:
//
//   downloading       the source, to a temporary directory on disk
//   validating        page count, sizes, encryption — refusals end the run here
//   extracting-links  every link annotation, classified and left unapproved
//   processing-pages  per page: draw, store the image, read the words, write
//                     the page record, report progress
//   cleaning-up       drop pages past the end of a shorter file, and images no
//                     page uses any more
//   ready | failed
//
// Pages are written as they are drawn, so a run that dies part way leaves the
// pages it finished, and running it again starts at the first one it did not
// (`pagesToProcess`). Nothing here clears the site's cache — this runs outside
// the Next server, where purging does nothing — which is harmless while no
// route reads pages, and is the reader's to solve (the brief says how).

import { createReadStream } from 'node:fs'
import { copyFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import sharp from 'sharp'

import { downloadObject, ObjectTooLarge, type S3Config } from '../../backup/s3'
import { buildSamplePdf, samplePages } from '../sample-pdf'

import type { ExtractedLink } from './inspect'
import {
  ACTIVE_STATUSES,
  isStale,
  LIMITS,
  pageImageFilename,
  pagesToProcess,
  progressPercent,
  RENDITION,
  type RunStatus,
  SOURCE_PREFIX,
} from './plan'
import {
  activeRuns,
  createRun,
  deletePagesAfter,
  deleteUnusedPageImages,
  existingPages,
  findOrCreatePageImage,
  type PublicationRef,
  updateRun,
  upsertPage,
} from './store'
import {
  inspectPdf,
  PdfRejected,
  readLinks,
  readPageText,
  renderPage,
} from './tools'

export type Source =
  /** A key under `publication-sources/` in the media bucket. */
  | { kind: 'r2'; key: string; s3: S3Config }
  /** A file on this machine — development, CI, or a copy made by hand. */
  | { kind: 'file'; path: string }
  /** The generated sample in `lib/publications/sample-pdf.ts`. */
  | { kind: 'sample'; pages: number }

export type RunOptions = {
  publication: PublicationRef
  source: Source
  /** Pages to redraw whatever their state, or every page. */
  force?: number[] | 'all'
  /** Read and validate the file, and report; write nothing. */
  dryRun?: boolean
  siteUrl?: string
  log?: (line: string) => void
  now?: () => Date
}

export type RunReport = {
  publication: { id: number | string; slug: string }
  run: number | string | null
  status: 'ready' | 'failed' | 'dry-run'
  pageCount: number
  drawn: number
  skipped: number
  failedPages: number[]
  links: Record<
    'external' | 'internal' | 'mailto' | 'page' | 'refused' | 'unsupported',
    number
  >
  imagesReused: number
  imagesDeleted: number
  pagesDeleted: number
  error?: string
  rejection?: string
}

export class RunInProgress extends Error {
  constructor(readonly runId: number | string) {
    super(
      `Run ${runId} is still processing this publication. Wait for it to finish, ` +
        `or for it to go ${LIMITS.staleAfterMs / 60_000} minutes without progress, when it is treated as stopped.`,
    )
    this.name = 'RunInProgress'
  }
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function countLinks(links: ExtractedLink[]): RunReport['links'] {
  const counts: RunReport['links'] = {
    external: 0,
    internal: 0,
    mailto: 0,
    page: 0,
    refused: 0,
    unsupported: 0,
  }
  for (const { target } of links) {
    if (target.kind === 'page') counts.page += 1
    else if (target.kind === 'unsupported') counts.unsupported += 1
    else if (target.link.kind === 'refused') counts.refused += 1
    else if (target.link.kind === 'external') counts.external += 1
    else if (target.link.kind === 'internal') counts.internal += 1
    else counts.mailto += 1
  }
  return counts
}

/** Puts the source PDF in `directory` and returns its path and size. */
async function fetchSource(
  source: Source,
  directory: string,
  title: string,
): Promise<{ path: string; bytes: number; name: string }> {
  const path = join(directory, 'source.pdf')
  switch (source.kind) {
    case 'r2': {
      if (!source.key.startsWith(SOURCE_PREFIX) || source.key.includes('..')) {
        throw new Error(
          `A source key starts with ${SOURCE_PREFIX}; got ${source.key}.`,
        )
      }
      try {
        const { bytes } = await downloadObject(source.s3, source.key, path, {
          maxBytes: LIMITS.maxSourceBytes,
        })
        return { path, bytes, name: source.key }
      } catch (error) {
        if (error instanceof ObjectTooLarge) {
          throw new PdfRejected(
            'too-large',
            `The PDF is larger than ${LIMITS.maxSourceBytes / 1024 / 1024} MB.`,
          )
        }
        throw error
      }
    }
    case 'file': {
      const { size } = await stat(source.path)
      if (size > LIMITS.maxSourceBytes) {
        throw new PdfRejected(
          'too-large',
          `The PDF is larger than ${LIMITS.maxSourceBytes / 1024 / 1024} MB.`,
        )
      }
      // A copy, so the run works on a file nothing else changes underneath it.
      await copyFile(source.path, path)
      return {
        path,
        bytes: size,
        name: source.path.split('/').pop() ?? 'source.pdf',
      }
    }
    case 'sample': {
      const pdf = buildSamplePdf(samplePages(source.pages, title))
      await writeFile(path, pdf, { mode: 0o600 })
      return {
        path,
        bytes: pdf.length,
        name: `sample-${source.pages}-pages.pdf`,
      }
    }
  }
}

/** One page, drawn and encoded: the bytes to store and their pixel size. */
async function drawPage(
  file: string,
  page: Parameters<typeof renderPage>[1],
  directory: string,
): Promise<Buffer> {
  const png = await renderPage(file, page, RENDITION.width, directory)
  try {
    return await sharp(png).webp({ quality: RENDITION.quality }).toBuffer()
  } finally {
    await rm(png, { force: true })
  }
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Processes one publication's source PDF. Returns a report, and records the
 * same outcome on the run, so the admin and the terminal cannot disagree.
 *
 * Throws only for a refusal to start: another run still going. Everything
 * after a run is recorded ends in that record, failed or ready, and in the
 * report — a rejected file included.
 */
export async function processPublication(
  payload: Payload,
  options: RunOptions,
): Promise<RunReport> {
  const { publication, source, force, dryRun = false, siteUrl } = options
  const log = options.log ?? (() => {})
  const now = options.now ?? (() => new Date())

  const report: RunReport = {
    publication: { id: publication.id, slug: publication.slug },
    run: null,
    status: dryRun ? 'dry-run' : 'failed',
    pageCount: 0,
    drawn: 0,
    skipped: 0,
    failedPages: [],
    links: countLinks([]),
    imagesReused: 0,
    imagesDeleted: 0,
    pagesDeleted: 0,
  }

  // A run killed at its memory limit, or recreated by a deploy, never marks
  // itself finished. Fail any that have stopped reporting, and refuse to start
  // beside one that has not.
  for (const run of await activeRuns(
    payload,
    publication.id,
    ACTIVE_STATUSES,
  )) {
    if (!isStale(run, now())) throw new RunInProgress(run.id)
    if (!dryRun) {
      await updateRun(payload, run.id, {
        status: 'failed',
        finishedAt: now().toISOString(),
        error: `Stopped reporting progress at ${run.updatedAt ?? 'an unknown time'}; treated as stopped.`,
      })
      log(`Marked run ${run.id} failed: it had stopped reporting progress.`)
    }
  }

  const directory = await mkdtemp(join(tmpdir(), 'publication-'))
  let runId: number | null = null
  const record = async (
    status: RunStatus,
    patch: Parameters<typeof updateRun>[2] = {},
  ) => {
    if (runId !== null) await updateRun(payload, runId, { status, ...patch })
  }

  try {
    if (!dryRun) {
      const run = await createRun(payload, Number(publication.id), {
        status: 'downloading',
        rendition: RENDITION.version,
        startedAt: now().toISOString(),
        source: { kind: source.kind },
      })
      runId = Number(run.id)
      report.run = runId
      log(`Run ${runId} started for ${publication.slug}.`)
    }

    const fetched = await fetchSource(source, directory, publication.title)
    const sha256 = await sha256OfFile(fetched.path)
    await record('validating', {
      source: {
        kind: source.kind,
        name: fetched.name,
        bytes: fetched.bytes,
        sha256,
      },
    })
    log(
      `Fetched ${fetched.name}: ${fetched.bytes} bytes, sha256 ${sha256.slice(0, 12)}…`,
    )

    const info = await inspectPdf(fetched.path)
    report.pageCount = info.pageCount
    if (info.pageCount > LIMITS.maxPages) {
      throw new PdfRejected(
        'too-many-pages',
        `The PDF has ${info.pageCount} pages; the limit is ${LIMITS.maxPages}.`,
      )
    }
    if (info.encrypted)
      log(
        'The PDF has an owner password; it opens without one, so it is processed.',
      )
    if (info.javascript)
      log('The PDF carries document JavaScript. Nothing here runs it.')

    await record('extracting-links', {
      pageCount: info.pageCount,
      pagesDone: 0,
      progress: 0,
    })
    const links = await readLinks(fetched.path, info.pages, siteUrl)
    report.links = countLinks(links)

    const existing = await existingPages(payload, publication.id)
    const todo = pagesToProcess({
      pageCount: info.pageCount,
      sourceSha256: sha256,
      existing,
      force,
    })
    report.skipped = info.pageCount - todo.length
    log(
      `${info.pageCount} pages; ${todo.length} to draw, ${report.skipped} already drawn from this file.`,
    )

    if (dryRun) {
      report.status = 'dry-run'
      return report
    }

    await record('processing-pages', {
      pagesDone: report.skipped,
      progress: progressPercent(report.skipped, info.pageCount),
    })
    let done = report.skipped
    for (const number of todo) {
      const page = info.pages[number - 1]!
      try {
        const bytes = await drawPage(fetched.path, page, directory)
        const filename = pageImageFilename(publication.id, bytes)
        const image = await findOrCreatePageImage(
          payload,
          Number(publication.id),
          filename,
          bytes,
        )
        if (!image.created) report.imagesReused += 1
        const text = await readPageText(fetched.path, page)
        await upsertPage(payload, Number(publication.id), number, {
          status: 'ready',
          error: null,
          width: page.width,
          height: page.height,
          image: Number(image.id),
          text: text.text,
          words: text.words,
          links: links
            .filter((link) => link.page === number)
            .map(({ bounds, target }) => ({ bounds, target, approved: false })),
          sourceSha256: sha256,
          rendition: RENDITION.version,
          run: runId!,
        })
        report.drawn += 1
      } catch (error) {
        // One bad page does not stop the issue. It is recorded on its own
        // record, keeps whatever it had before, and is drawn again next run.
        report.failedPages.push(number)
        await upsertPage(payload, Number(publication.id), number, {
          status: 'failed',
          error: message(error),
          sourceSha256: sha256,
          rendition: RENDITION.version,
          run: runId!,
        })
        log(`Page ${number} failed: ${message(error)}`)
      }
      done += 1
      await record('processing-pages', {
        pagesDone: done,
        currentPage: number,
        progress: progressPercent(done, info.pageCount),
      })
      log(`Page ${number} of ${info.pageCount}.`)
    }

    await record('cleaning-up', { currentPage: null })
    report.pagesDeleted = await deletePagesAfter(
      payload,
      publication.id,
      info.pageCount,
    )
    report.imagesDeleted = await deleteUnusedPageImages(payload, publication.id)

    const failed = report.failedPages.length
    report.status = failed ? 'failed' : 'ready'
    if (failed) {
      report.error = `${failed} of ${info.pageCount} pages failed (${report.failedPages.join(', ')}). Run again to retry them.`
    }
    await record(report.status, {
      finishedAt: now().toISOString(),
      progress: failed ? progressPercent(done - failed, info.pageCount) : 100,
      error: report.error ?? null,
      summary: {
        drawn: report.drawn,
        skipped: report.skipped,
        failedPages: report.failedPages,
        links: report.links,
        imagesReused: report.imagesReused,
        imagesDeleted: report.imagesDeleted,
        pagesDeleted: report.pagesDeleted,
      },
    })
    return report
  } catch (error) {
    report.status = dryRun ? 'dry-run' : 'failed'
    report.error = message(error)
    if (error instanceof PdfRejected) report.rejection = error.reason
    await record('failed', {
      finishedAt: now().toISOString(),
      currentPage: null,
      error: report.error,
      rejection: error instanceof PdfRejected ? error.reason : null,
    }).catch((recording: unknown) => {
      // The run's own record could not be written — the database went away,
      // say. Say both things rather than lose the first.
      report.error = `${report.error} (and recording the failure failed: ${message(recording)})`
    })
    return report
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
