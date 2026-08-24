// Deciding which stored images are missing a derivative, and where to read the
// original from.
//
// Payload generates the sizes in `collections/Media.ts` at upload time and only
// then. Add a size later — as the `og` share-card size was — and every image
// already in the library simply does not have it. Nothing breaks, because
// `lib/content/media.ts` falls back to the original, but the benefit only ever
// reaches images uploaded after the change.
//
// The fix is to hand the original bytes back to Payload, which regenerates
// every declared size from them. That is a write against real storage, so the
// decisions worth getting right — what is missing, and where the original
// lives — are separated out here where they can be tested without one.

/** One generated size as Payload stores it. */
type StoredSize = { filename?: unknown } | null | undefined

/** The shape of a media document this module needs. */
export interface MediaDoc {
  id: number | string
  filename?: unknown
  url?: unknown
  width?: unknown
  height?: unknown
  sizes?: Record<string, StoredSize> | null
}

/** The parts of an `imageSizes` entry that decide whether it gets produced. */
export interface DeclaredSize {
  name: string
  width?: number | null
  height?: number | null
  withoutEnlargement?: boolean
}

/**
 * Whether Payload would produce this size for an image of these dimensions.
 *
 * Not every declared size exists for every image, and that is by design rather
 * than a gap to fill. Payload omits a size when the source is too small for it,
 * on the rules in `getImageResizeAction`: with `withoutEnlargement` left unset,
 * a target with both a width and a height is skipped when the original is
 * smaller in both, and a target with only one of them is skipped when the
 * original is smaller in that one.
 *
 * The rule is repeated here rather than inferred from what happens, because a
 * backfill that cannot tell "missing" from "never going to exist" re-uploads
 * every small image on every run, forever, to produce the same nothing. That is
 * the difference between a script that is safe to rerun and one that merely
 * does no damage.
 */
export function expectsSize(doc: MediaDoc, size: DeclaredSize): boolean {
  const width = typeof doc.width === 'number' ? doc.width : null
  const height = typeof doc.height === 'number' ? doc.height : null
  // Dimensions unknown — a non-image, or a record written before they were
  // stored. Assume the size is wanted and let the regeneration decide.
  if (width === null || height === null) return true
  if (size.withoutEnlargement !== undefined) return true

  const targetWidth = size.width ?? null
  const targetHeight = size.height ?? null

  if (targetWidth && targetHeight) {
    return !(width < targetWidth && height < targetHeight)
  }
  if (targetWidth) return width >= targetWidth
  if (targetHeight) return height >= targetHeight
  return true
}

/**
 * The sizes a document is missing that it should have.
 *
 * Keyed on `filename` rather than on the size object existing: Payload writes a
 * `sizes.og` object either way, and leaves its columns null when the derivative
 * was never produced. An empty object is exactly what a backfill is looking
 * for, so treating it as present would find nothing.
 */
export function missingSizes(
  doc: MediaDoc,
  declared: DeclaredSize[],
): string[] {
  const sizes = doc.sizes ?? {}
  return declared
    .filter((size) => expectsSize(doc, size))
    .filter((size) => {
      const filename = sizes[size.name]?.filename
      return typeof filename !== 'string' || !filename
    })
    .map((size) => size.name)
}

/** Where the bytes of an original can be read from. */
export type MediaSource =
  { kind: 'file'; path: string } | { kind: 'url'; url: string }

export interface SourceOptions {
  /** Payload's resolved `upload.staticDir` for the collection. */
  staticDir?: string
  /** Origin to resolve a root-relative `url` against. */
  baseUrl?: string
}

/**
 * Where to read one document's original from.
 *
 * The two cases mirror what Payload itself does in `generateFileData` when it
 * re-uploads a file: a local deployment keeps originals under `staticDir`, and
 * one using R2 has a URL. Preferring the local path matters — it needs no
 * running web server and no round trip, so a backfill against a local database
 * is just disk reads.
 *
 * Returns a reason instead of a source when neither is available, because a
 * document whose file cannot be located is a real finding for the report rather
 * than a crash: it usually means storage and database have drifted apart.
 */
export function sourceFor(
  doc: MediaDoc,
  { staticDir, baseUrl }: SourceOptions = {},
): MediaSource | { kind: 'unavailable'; reason: string } {
  const filename = typeof doc.filename === 'string' ? doc.filename : ''
  if (!filename) {
    return { kind: 'unavailable', reason: 'document has no filename' }
  }
  // Payload refuses these on the way in; refusing them again on the way out
  // costs nothing and keeps a traversal out of a path this module builds.
  if (filename.includes('/') || filename.includes('..')) {
    return { kind: 'unavailable', reason: `unsafe filename: ${filename}` }
  }

  if (staticDir) return { kind: 'file', path: `${staticDir}/${filename}` }

  const url = typeof doc.url === 'string' ? doc.url.trim() : ''
  if (!url) {
    return { kind: 'unavailable', reason: 'no local directory and no URL' }
  }
  if (/^https?:\/\//i.test(url)) return { kind: 'url', url }

  if (!baseUrl) {
    return {
      kind: 'unavailable',
      reason: `url "${url}" is relative and no --base-url was given`,
    }
  }
  return { kind: 'url', url: new URL(url, baseUrl).toString() }
}

export interface BackfillCandidate {
  id: number | string
  filename: string
  missing: string[]
}

/** Everything that would be rewritten, and what each document is missing. */
export function planBackfill(
  docs: MediaDoc[],
  declared: DeclaredSize[],
): BackfillCandidate[] {
  return docs.flatMap((doc) => {
    const missing = missingSizes(doc, declared)
    if (missing.length === 0) return []
    return [
      {
        id: doc.id,
        filename: typeof doc.filename === 'string' ? doc.filename : '',
        missing,
      },
    ]
  })
}
