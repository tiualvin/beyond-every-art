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

/** A file in the index, with how deep it sits under the archive root. */
interface IndexedFile {
  absolutePath: string
  depth: number
}

export interface LocalIndex {
  /** Every path suffix of every file, to the files carrying it. */
  bySuffix: Map<string, IndexedFile[]>
}

/** `/content/images/2026/02/a.jpg` -> that, `/images/2026/02/a.jpg`, ... `/a.jpg` */
function suffixes(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  return segments.map((_, i) => `/${segments.slice(i).join('/')}`)
}

/**
 * Index an extracted archive for lookup by URL.
 *
 * Indexed by every path suffix rather than by full path alone, because the
 * directory an operator points at is not fixed. A Ghost archive root gives
 * `/content/images/2026/02/a.jpg`, but pointing at `content/images` — an
 * entirely reasonable thing to do — gives `/2026/02/a.jpg` for the same file,
 * and a full-path match would find nothing.
 *
 * Matching on the file name alone would find it, and would also find the wrong
 * one. Ghost keeps its own derivatives under `images/size/w600/...` and
 * `images/thumbnail/...` using the *same* file names as the originals, so a
 * name is ambiguous in every real archive. A suffix keeps enough of the path to
 * tell those apart while tolerating where the root sits.
 */
export function buildLocalIndex(files: LocalFile[]): LocalIndex {
  const bySuffix = new Map<string, IndexedFile[]>()

  for (const file of files) {
    const depth = file.relativePath.split('/').filter(Boolean).length
    const entry: IndexedFile = { absolutePath: file.absolutePath, depth }
    for (const suffix of suffixes(file.relativePath)) {
      const existing = bySuffix.get(suffix)
      if (existing) existing.push(entry)
      else bySuffix.set(suffix, [entry])
    }
  }

  return { bySuffix }
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
 * Tries the longest path suffix first and works down, taking the first that
 * matches exactly one file. Longest-first is what makes this safe: a match on
 * `/2026/02/a.jpg` cannot be Ghost's own `/size/w600/2026/02/a.jpg`, so the
 * original wins over its derivatives without either being special-cased.
 *
 * Ambiguity is reported, never resolved. Two files can legitimately share a
 * name — Ghost namespaces uploads by year and month — and picking one would put
 * the wrong photograph on a published page, which is a worse outcome than the
 * missing image it was meant to fix.
 */
export function findLocalFile(
  index: LocalIndex,
  ghostURL: string,
): { path: string } | { reason: string } {
  const path = urlPath(ghostURL)
  let ambiguousAt: { suffix: string; count: number } | undefined

  for (const suffix of suffixes(path)) {
    const matches = index.bySuffix.get(suffix)
    if (!matches) continue
    if (matches.length === 1) return { path: matches[0]!.absolutePath }

    // Several files end with this suffix, and one shape of that is expected
    // rather than ambiguous: Ghost's own derivatives sit under an *extra*
    // prefix (`size/w600/…`, `thumbnail/…`) and therefore always end with the
    // original's path too. The original is the shallowest of them, so when
    // exactly one match is closest to the root, it is the file being asked
    // for and the rest are its thumbnails.
    const shallowest = Math.min(...matches.map((m) => m.depth))
    const closest = matches.filter((m) => m.depth === shallowest)
    if (closest.length === 1) return { path: closest[0]!.absolutePath }

    // Equal depth is a real collision — two uploads in different months with
    // the same name. Remember it for the message and keep going; a shorter
    // suffix can only match more files, never fewer.
    ambiguousAt ??= { suffix, count: matches.length }
  }

  if (ambiguousAt) {
    return {
      reason: `${ambiguousAt.suffix} matches ${ambiguousAt.count} files in the archive; cannot tell which one this is`,
    }
  }
  return { reason: `not found in the archive: ${path}` }
}
