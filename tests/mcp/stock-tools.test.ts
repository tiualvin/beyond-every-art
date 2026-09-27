// The two stock-photo tools, driven through their handlers.
//
// `tests/stock/unsplash.test.ts` covers what the client does with Unsplash.
// This covers what the tools do with the client: that a photograph lands in
// Media attributed from Unsplash's record rather than from anything the agent
// said, marked as a photograph, and reported as a download only once it is
// stored — and that a repeat import, a refusal, or a missing key costs nothing
// at Unsplash.

import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/security/outbound-fetch', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/security/outbound-fetch')>()
  return { ...actual, fetchPublicBytes: vi.fn() }
})

import { mcpTools } from '../../lib/mcp/tools'
import { fetchPublicBytes } from '../../lib/security/outbound-fetch'

const tool = (name: string) => {
  const found = mcpTools.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`no tool ${name}`)
  return found
}

/** Calls a handler the way the plugin does; the third argument is unused. */
const run = (
  subject: ReturnType<typeof tool>,
  args: Record<string, unknown>,
  req: PayloadRequest,
) => subject.handler(args, req, {})

const findStockPhoto = tool('findStockPhoto')
const importStockPhoto = tool('importStockPhoto')

/** The smallest buffer `vetImageBytes` reads as a JPEG. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

function apiPhoto(overrides: Record<string, unknown> = {}) {
  return {
    alt_description: 'cracked ochre plaster',
    id: 'Abc123',
    links: {
      download_location: 'https://api.unsplash.com/photos/Abc123/download',
    },
    urls: {
      raw: 'https://images.unsplash.com/photo-1?ixid=M3w1',
      small: 'https://images.unsplash.com/photo-1?w=400',
    },
    user: {
      links: { html: 'https://unsplash.com/@carolina' },
      name: 'Carolina Lopez',
    },
    ...overrides,
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })

let userId = 0

/** A request whose Payload records what was asked of it. */
function fakeRequest(existing?: Record<string, unknown>) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: 99,
    url: '/api/media/file/unsplash-carolina-lopez-abc123.jpg',
  }))
  const find = vi.fn(async () => ({ docs: existing ? [existing] : [] }))
  userId += 1
  const req = {
    payload: { create, find },
    user: { id: userId, role: 'editor' },
  } as unknown as PayloadRequest
  return { create, find, req }
}

const text = (result: unknown) =>
  JSON.parse(
    (result as { content: Array<{ text: string }> }).content[0].text,
  ) as Record<string, unknown>

let api: ReturnType<typeof vi.fn>
let logged: string[]

beforeEach(() => {
  vi.stubEnv('UNSPLASH_ACCESS_KEY', 'test-key')
  api = vi.fn()
  vi.stubGlobal('fetch', api)
  vi.mocked(fetchPublicBytes).mockReset()
  vi.mocked(fetchPublicBytes).mockResolvedValue({
    bytes: JPEG,
    contentType: 'image/jpeg',
    resolvedAddress: '151.101.2.208',
    url: 'https://images.unsplash.com/photo-1',
  })
  logged = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    logged.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the tool surface', () => {
  // The whole point of a separate import is that attribution cannot come from
  // the agent. A parameter for any of these would put it back.
  it('lets the agent say nothing about credit, link, or whether it is generated', () => {
    expect(Object.keys(importStockPhoto.parameters ?? {}).sort()).toEqual([
      'alt',
      'caption',
      'photoId',
    ])
  })

  // The description is the only thing an agent reads before it chooses.
  it.each([findStockPhoto, importStockPhoto])(
    '$name carries the house rule on stock',
    ({ description }) => {
      expect(description).toMatch(/mood only/)
      expect(description).toMatch(/work, place or person/)
    },
  )

  it('tells the agent to let the person choose', () => {
    expect(findStockPhoto.description).toMatch(/let them choose/)
  })
})

describe('without a key', () => {
  it.each([
    [findStockPhoto, { query: 'plaster' }],
    [importStockPhoto, { alt: 'Plaster.', photoId: 'Abc123' }],
  ])('$name refuses and asks nobody', async (subject, args) => {
    vi.stubEnv('UNSPLASH_ACCESS_KEY', '')
    const { find, req } = fakeRequest()

    await expect(run(subject, args, req)).rejects.toThrow(/not configured/)
    expect(api).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('findStockPhoto', () => {
  it('returns candidates and says what to do with them', async () => {
    api.mockResolvedValue(json({ results: [apiPhoto()], total: 1 }))
    const { req } = fakeRequest()

    const result = text(await run(findStockPhoto, { query: 'plaster' }, req))

    expect(result.candidates).toHaveLength(1)
    expect(result.next).toMatch(/importStockPhoto/)
  })

  it('holds one user to a share of the hourly quota', async () => {
    api.mockImplementation(async () => json({ results: [], total: 0 }))
    const { req } = fakeRequest()

    for (let call = 0; call < 20; call += 1) {
      await run(findStockPhoto, { query: 'plaster' }, req)
    }

    await expect(
      run(findStockPhoto, { query: 'plaster' }, req),
    ).rejects.toThrow(/budget/)
    expect(api).toHaveBeenCalledTimes(20)
  })
})

describe('importStockPhoto', () => {
  it('stores the photograph, attributed from Unsplash’s record', async () => {
    api
      .mockResolvedValueOnce(json(apiPhoto()))
      .mockResolvedValueOnce(json({ url: 'https://...' }))
    const { create, req } = fakeRequest()

    const result = text(
      await run(
        importStockPhoto,
        { alt: 'Cracked ochre plaster on an old wall.', photoId: 'Abc123' },
        req,
      ),
    )

    const [{ data }] = create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ]
    expect(data).toMatchObject({
      aiGenerated: false,
      alt: 'Cracked ochre plaster on an old wall.',
      credit: 'Photo by Carolina Lopez / Unsplash',
      creditURL: 'https://unsplash.com/@carolina',
      sourceURL: 'https://unsplash.com/photos/Abc123',
    })

    // Fetched from the licensed host, at the stored size.
    const [address] = vi.mocked(fetchPublicBytes).mock.calls[0]
    expect(new URL(address).hostname).toBe('images.unsplash.com')
    expect(new URL(address).searchParams.get('w')).toBe('2400')

    expect(result).toMatchObject({ downloadTracked: true, id: 99 })
    expect(logged.join('')).toContain('"event":"mcp_stock"')
  })

  // A failed upload must not count as a download, so the report comes last.
  it('reports the download only after the photograph is stored', async () => {
    const order: string[] = []
    api.mockImplementation(async (address: URL) => {
      order.push(String(address).includes('/download') ? 'report' : 'record')
      return String(address).includes('/download')
        ? json({ url: 'https://...' })
        : json(apiPhoto())
    })
    const { create, req } = fakeRequest()
    create.mockImplementationOnce(async ({ data }) => {
      order.push('store')
      return { ...data, id: 99, url: '/x.jpg' }
    })

    await run(importStockPhoto, { alt: 'Plaster.', photoId: 'Abc123' }, req)

    expect(order).toEqual(['record', 'store', 'report'])
  })

  it('reports nothing when storing fails', async () => {
    api.mockResolvedValue(json(apiPhoto()))
    const { create, req } = fakeRequest()
    create.mockRejectedValueOnce(new Error('You are not allowed.'))

    await expect(
      run(importStockPhoto, { alt: 'Plaster.', photoId: 'Abc123' }, req),
    ).rejects.toThrow()
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('returns an earlier import rather than storing it twice', async () => {
    const { create, find, req } = fakeRequest({
      alt: 'Plaster.',
      credit: 'Photo by Carolina Lopez / Unsplash',
      id: 12,
      url: '/api/media/file/earlier.jpg',
    })

    const result = text(
      await run(importStockPhoto, { alt: 'Plaster.', photoId: 'Abc123' }, req),
    )

    expect(result).toMatchObject({ id: 12, reused: true })
    expect(find.mock.calls[0]).toEqual([
      expect.objectContaining({
        where: {
          sourceURL: { equals: 'https://unsplash.com/photos/Abc123' },
        },
      }),
    ])
    // Nothing downloaded, so nothing reported and nothing stored.
    expect(api).not.toHaveBeenCalled()
    expect(fetchPublicBytes).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses Unsplash+ without downloading it', async () => {
    api.mockResolvedValue(
      json(
        apiPhoto({
          urls: {
            raw: 'https://plus.unsplash.com/premium_photo-1',
            small: 'https://plus.unsplash.com/premium_photo-1?w=400',
          },
        }),
      ),
    )
    const { create, req } = fakeRequest()

    await expect(
      run(importStockPhoto, { alt: 'Plaster.', photoId: 'Abc123' }, req),
    ).rejects.toThrow(/Unsplash License/)
    expect(fetchPublicBytes).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses something that is not a photo id before looking anything up', async () => {
    const { find, req } = fakeRequest()

    await expect(
      run(
        importStockPhoto,
        { alt: 'Plaster.', photoId: 'https://evil.example/x' },
        req,
      ),
    ).rejects.toThrow(/not an Unsplash photo id/)
    expect(find).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()
  })

  it('logs a download it could not report, at warn', async () => {
    api
      .mockResolvedValueOnce(json(apiPhoto()))
      .mockResolvedValueOnce(json({}, 500))
    const { req } = fakeRequest()

    const result = text(
      await run(importStockPhoto, { alt: 'Plaster.', photoId: 'Abc123' }, req),
    )

    expect(result.downloadTracked).toBe(false)
    const line = JSON.parse(
      logged.find((entry) => entry.includes('mcp_stock'))!,
    ) as Record<string, unknown>
    expect(line).toMatchObject({ downloadTracked: false, level: 'warn' })
  })
})
