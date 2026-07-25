import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { importMedia } from '../../lib/migration/media-import'

const URL_A = 'https://old.ghost.example/content/images/2024/02/corridor.jpg'

/** Payload stub that records media documents with numeric ids. */
function fakePayload(existing: Array<{ ghostURL: string; url: string }> = []) {
  const docs = existing.map((doc, index) => ({ id: index + 1, ...doc }))
  let nextId = docs.length + 1
  const created: Array<Record<string, unknown>> = []

  const payload = {
    find: async ({
      where,
    }: {
      where?: { ghostURL?: { equals?: string } }
    }) => ({
      docs: docs.filter((doc) => doc.ghostURL === where?.ghostURL?.equals),
    }),
    create: async ({
      data,
      file,
    }: {
      data: Record<string, unknown>
      file?: { name: string }
    }) => {
      const doc = { id: nextId++, ...data, url: `/media/${file?.name}` }
      created.push(doc)
      return doc
    },
  }

  return { payload: payload as unknown as Payload, created }
}

function okResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  })
}

describe('importMedia', () => {
  it('reuses an asset already migrated under the same Ghost URL', async () => {
    const { payload } = fakePayload([
      { ghostURL: URL_A, url: '/media/corridor.jpg' },
    ])
    let calls = 0

    const result = await importMedia(payload, [URL_A], {
      fetchImpl: async () => {
        calls++
        return okResponse()
      },
    })

    expect(calls).toBe(0)
    expect(result.reused).toBe(1)
    expect(result.media.get(URL_A)).toEqual({
      id: 1,
      url: '/media/corridor.jpg',
    })
  })

  it('keeps the media id as the database returned it', async () => {
    const { payload } = fakePayload()

    const result = await importMedia(payload, [URL_A], {
      fetchImpl: async () => okResponse(),
    })

    expect(result.imported).toBe(1)
    expect(typeof result.media.get(URL_A)!.id).toBe('number')
  })

  it('retries a server error and succeeds on a later attempt', async () => {
    const { payload } = fakePayload()
    let calls = 0

    const result = await importMedia(payload, [URL_A], {
      retries: 1,
      fetchImpl: async () => {
        calls++
        return calls === 1
          ? new Response('busy', { status: 503 })
          : okResponse()
      },
    })

    expect(calls).toBe(2)
    expect(result.imported).toBe(1)
    expect(result.failed).toEqual([])
  })

  it('gives up immediately on a missing asset instead of retrying', async () => {
    const { payload } = fakePayload()
    let calls = 0

    const result = await importMedia(payload, [URL_A], {
      retries: 2,
      fetchImpl: async () => {
        calls++
        return new Response('gone', { status: 404 })
      },
    })

    expect(calls).toBe(1)
    expect(result.imported).toBe(0)
    expect(result.failed).toEqual([
      { url: URL_A, reason: `HTTP 404 for ${URL_A}` },
    ])
  })

  it('reports a stalled download as failed rather than hanging the import', async () => {
    const { payload } = fakePayload()
    let calls = 0

    const result = await importMedia(payload, [URL_A], {
      retries: 1,
      timeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          calls++
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('The operation was aborted due to timeout')),
          )
        }),
    })

    expect(calls).toBe(2)
    expect(result.imported).toBe(0)
    expect(result.failed[0].url).toBe(URL_A)
    expect(result.failed[0].reason).toContain('abort')
  })
})
