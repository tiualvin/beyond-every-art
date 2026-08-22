// Bringing back media files whose records survived but whose bytes did not.
//
// This is a different failure from a missing derivative (see `backfill.ts`).
// There, Payload holds the original and is only short a size. Here the original
// itself is gone: the `media` rows are intact, every post still points at them,
// and the storage behind them is empty.
//
// It is a real incident, not a hypothetical. Before the `media_data` volume
// existed, `docker compose up -d --build` recreated the app container and threw
// its writable layer away with it, taking `/app/media` along. The volume stops
// it recurring but cannot undo it, and `DEPLOYMENT_STATUS.md` recorded the
// recovery as "re-run the Ghost media import" — which does not work, because
// `importMedia` matches on `ghostURL` and skips every row that already exists.
// It would report 110 reused, upload nothing, and leave the site exactly as
// broken as it found it.
//
// What does work is the URL each row already carries. `ghostURL` records where
// the file came from, the source site is still serving it, so the bytes can be
// fetched back and handed to Payload — which regenerates every derivative and,
// crucially, keeps the document id and the filename. Nothing else in the
// database moves: no post loses its featured image, and no `<img src>` in a
// migrated body stops resolving.

/** The fields of a media document this module needs. */
export interface RestorableDoc {
  id: number | string
  filename?: unknown
  mimeType?: unknown
  ghostURL?: unknown
}

/** A document that can be restored, with the values needed to do it. */
export interface RestorePlan {
  id: number | string
  filename: string
  ghostURL: string
  mimeType: string
}

/** Why a document cannot be restored. */
export interface RestoreSkip {
  id: number | string
  reason: string
}

export interface RestoreSelection {
  plans: RestorePlan[]
  skipped: RestoreSkip[]
}

/**
 * Split media documents into those that can be restored and those that cannot.
 *
 * A document is restorable when it remembers both where it came from and what
 * it is called. Anything else is reported rather than skipped silently: a row
 * with no `ghostURL` was authored here rather than migrated, and its bytes are
 * not recoverable from the old site — that is a fact the operator needs, and
 * the difference between "110 restored" and "108 restored, 2 you must handle"
 * is the whole value of the report.
 */
export function planRestore(docs: RestorableDoc[]): RestoreSelection {
  const plans: RestorePlan[] = []
  const skipped: RestoreSkip[] = []

  for (const doc of docs) {
    const filename = typeof doc.filename === 'string' ? doc.filename.trim() : ''
    const ghostURL = typeof doc.ghostURL === 'string' ? doc.ghostURL.trim() : ''

    if (!ghostURL) {
      skipped.push({
        id: doc.id,
        reason:
          'no ghostURL — not a migrated file, so there is nothing to refetch',
      })
      continue
    }
    if (!filename) {
      skipped.push({ id: doc.id, reason: 'no filename to restore it under' })
      continue
    }
    // The re-upload must land on the existing key, so the filename is used
    // verbatim. Refusing a traversal here costs nothing and keeps that
    // guarantee true even if a row was written by something other than the
    // importer.
    if (filename.includes('/') || filename.includes('..')) {
      skipped.push({ id: doc.id, reason: `unsafe filename: ${filename}` })
      continue
    }

    plans.push({
      id: doc.id,
      filename,
      ghostURL,
      mimeType:
        typeof doc.mimeType === 'string' && doc.mimeType
          ? doc.mimeType
          : 'application/octet-stream',
    })
  }

  return { plans, skipped }
}

/**
 * Whether a downloaded response is worth handing to Payload.
 *
 * A Ghost site that has been reconfigured can answer a missing image with a
 * 200 and an HTML error page. Uploading that would replace a missing file with
 * a corrupt one, which is strictly worse: the record would then look healthy.
 * So the content type has to actually be an image, and there has to be a
 * meaningful number of bytes behind it.
 */
export function isUsableDownload(
  contentType: string | null | undefined,
  byteLength: number,
): true | string {
  if (byteLength < 100) {
    return `response was ${byteLength} bytes, which is not an image`
  }
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (type && !type.startsWith('image/')) {
    return `response was ${type}, not an image — the source may be serving an error page`
  }
  return true
}

// --- restoring from an extracted Ghost archive, rather than over the network ---
//
// A Ghost site archive holds every media file under `content/images/...`, laid
// out exactly as the URLs address them. That makes it a complete and offline
// source for this recovery — better than the live site in every way, since it
// cannot 404, cannot rate-limit, and does not depend on the old site staying up.

/** One file found under the archive directory. */
export interface LocalFile {
  /** Path relative to the directory given, with a leading slash. */
  relativePath: string
  absolutePath: string
}

export interface LocalIndex {
  byPath: Map<string, string>
  byName: Map<string, string[]>
}

/**
 * Index an extracted archive for lookup by URL.
 *
 * Two indexes because two things can be true: usually the archive mirrors the
 * URL path exactly and the match is unambiguous, but an operator may point this
 * at `content/images` rather than the archive root, in which case only the file
 * name survives. Ghost namespaces uploads by year and month, so a bare name can
 * legitimately appear twice — hence a list, and a refusal to guess below.
 */
export function buildLocalIndex(files: LocalFile[]): LocalIndex {
  const byPath = new Map<string, string>()
  const byName = new Map<string, string[]>()

  for (const file of files) {
    byPath.set(file.relativePath, file.absolutePath)
    const name = file.relativePath.split('/').pop() ?? ''
    if (!name) continue
    const existing = byName.get(name)
    if (existing) existing.push(file.absolutePath)
    else byName.set(name, [file.absolutePath])
  }

  return { byPath, byName }
}

/** The path portion of a stored media URL, however it was written. */
export function urlPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    const withoutQuery = url.split(/[?#]/)[0] ?? url
    const stripped = withoutQuery.replace(/^__GHOST_URL__/, '')
    return stripped.startsWith('/') ? stripped : `/${stripped}`
  }
}

/**
 * Locate one media file inside an indexed archive.
 *
 * The full path wins when it is there, because it is unambiguous. The file name
 * is a fallback for an archive rooted somewhere else, and it is only trusted
 * when exactly one file carries that name — two candidates means the archive
 * cannot say which article's image this is, and silently picking one would put
 * the wrong photograph on a published page.
 */
export function findLocalFile(
  index: LocalIndex,
  ghostURL: string,
): { path: string } | { reason: string } {
  const path = urlPath(ghostURL)

  const exact = index.byPath.get(path)
  if (exact) return { path: exact }

  const name = path.split('/').pop() ?? ''
  const candidates = name ? (index.byName.get(name) ?? []) : []
  if (candidates.length === 1) return { path: candidates[0]! }
  if (candidates.length > 1) {
    return {
      reason: `${name} appears ${candidates.length} times in the archive and the path ${path} matched none of them`,
    }
  }
  return { reason: `not found in the archive: ${path}` }
}
