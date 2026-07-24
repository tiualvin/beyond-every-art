// Media download + upload path for the Ghost migration.
//
// For every media URL discovered in the plan, this downloads the original file
// and uploads it into Payload's Media collection (which the S3 adapter routes
// to Cloudflare R2 when configured). Uploads are keyed on `ghostURL`, so a
// rerun reuses the already-migrated asset instead of downloading it again.
//
// Like the content write path, this talks to Payload and the network, so it is
// exercised end-to-end against a real instance rather than in CI. The URL
// rewriting it feeds into is covered by pure tests in ./media-rewrite.

import type { Payload } from 'payload'

import { deriveMediaFilename, type MediaRef } from './media-rewrite'

export interface MediaImportOptions {
  // Ghost exports use a __GHOST_URL__ placeholder for the site origin; supply
  // the real base URL (e.g. https://beyondeveryart.com) to resolve them.
  ghostBaseUrl?: string
  // Injectable fetch, primarily for testing.
  fetchImpl?: typeof fetch
}

export interface MediaImportResult {
  media: Map<string, MediaRef>
  imported: number
  reused: number
  failed: Array<{ url: string; reason: string }>
}

function resolveUrl(url: string, ghostBaseUrl?: string): string {
  if (url.startsWith('__GHOST_URL__')) {
    const base = (ghostBaseUrl ?? '').replace(/\/$/, '')
    return `${base}${url.slice('__GHOST_URL__'.length)}`
  }
  return url
}

/** Download and upload every media URL, returning a ghostURL -> MediaRef map. */
export async function importMedia(
  payload: Payload,
  urls: string[],
  options: MediaImportOptions = {},
): Promise<MediaImportResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const media = new Map<string, MediaRef>()
  const result: MediaImportResult = {
    media,
    imported: 0,
    reused: 0,
    failed: [],
  }

  for (const url of urls) {
    try {
      const existing = await payload.find({
        collection: 'media',
        where: { ghostURL: { equals: url } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const current = existing.docs[0] as
        { id: string | number; url?: string | null } | undefined
      if (current) {
        media.set(url, { id: String(current.id), url: current.url ?? url })
        result.reused++
        continue
      }

      const resolved = resolveUrl(url, options.ghostBaseUrl)
      const response = await fetchImpl(resolved)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${resolved}`)
      }
      const data = Buffer.from(await response.arrayBuffer())
      const name = deriveMediaFilename(url)
      const created = await payload.create({
        collection: 'media',
        data: {
          alt: name,
          ghostURL: url,
          migrationStatus: 'migrated',
        } as never,
        file: {
          data,
          name,
          mimetype:
            response.headers.get('content-type') ?? 'application/octet-stream',
          size: data.length,
        },
        overrideAccess: true,
      })
      const doc = created as { id: string | number; url?: string | null }
      media.set(url, { id: String(doc.id), url: doc.url ?? url })
      result.imported++
    } catch (error) {
      result.failed.push({
        url,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
