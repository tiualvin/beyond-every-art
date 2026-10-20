import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  downloadObject,
  ObjectTooLarge,
  type S3Config,
} from '../../lib/backup/s3'

const CONFIG: S3Config = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'bucket',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
}

/** A body that arrives in chunks, with or without a declared length. */
function respond(chunks: string[], { declare = true, status = 200 } = {}) {
  const bytes = chunks.join('')
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })
  const headers = declare
    ? { 'content-length': String(bytes.length) }
    : undefined
  return new Response(body, { status, headers })
}

describe('downloadObject', () => {
  let directory: string
  let target: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 's3-download-'))
    target = join(directory, 'source.pdf')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(directory, { recursive: true, force: true })
  })

  it('streams the object to the file and counts it', async () => {
    const fetch = vi.fn().mockResolvedValue(respond(['%PDF-', '1.7\n', 'rest']))
    vi.stubGlobal('fetch', fetch)
    await expect(
      downloadObject(CONFIG, 'publication-sources/a.pdf', target, {
        maxBytes: 1000,
      }),
    ).resolves.toEqual({ bytes: 13 })
    expect(readFileSync(target, 'utf8')).toBe('%PDF-1.7\nrest')
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://account.r2.cloudflarestorage.com/bucket/publication-sources/a.pdf',
    )
  })

  it('refuses a declared length over the limit before writing anything', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(['x'.repeat(50)])))
    await expect(
      downloadObject(CONFIG, 'k.pdf', target, { maxBytes: 10 }),
    ).rejects.toBeInstanceOf(ObjectTooLarge)
    expect(existsSync(target)).toBe(false)
  })

  it('refuses a body that grows past the limit with no declared length', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respond(['x'.repeat(8), 'x'.repeat(8)], { declare: false }),
        ),
    )
    await expect(
      downloadObject(CONFIG, 'k.pdf', target, { maxBytes: 10 }),
    ).rejects.toBeInstanceOf(ObjectTooLarge)
    // No partial file is left for a later step to mistake for the source.
    expect(existsSync(target)).toBe(false)
  })

  it('reports a missing object as the request that failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond(['NoSuchKey'], { status: 404 })),
    )
    await expect(
      downloadObject(CONFIG, 'missing.pdf', target, { maxBytes: 10 }),
    ).rejects.toThrow(/GET missing.pdf failed: 404/)
    expect(existsSync(target)).toBe(false)
  })
})
