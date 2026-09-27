import { describe, expect, it, vi } from 'vitest'

import {
  attributionFor,
  imageAddress,
  isFreeLicence,
  MAX_CANDIDATES,
  StockPhotoError,
  toPhoto,
  unsplashAccessKey,
  unsplashClient,
  type UnsplashPhoto,
} from '../../lib/stock/unsplash'

const KEY = 'test-access-key-do-not-leak'
const env = { UNSPLASH_ACCESS_KEY: KEY }

/** An API photo record, trimmed to the fields that matter here. */
function apiPhoto(overrides: Record<string, unknown> = {}) {
  return {
    alt_description: 'cracked ochre plaster on an old wall',
    description: null,
    height: 3000,
    id: 'Abc123_-xyz',
    links: {
      download_location:
        'https://api.unsplash.com/photos/Abc123_-xyz/download?ixid=M3w1',
      html: 'https://unsplash.com/photos/cracked-ochre-plaster-Abc123_-xyz',
    },
    urls: {
      raw: 'https://images.unsplash.com/photo-1?ixid=M3w1&ixlib=rb-4.0.3',
      small: 'https://images.unsplash.com/photo-1?w=400',
    },
    user: {
      links: { html: 'https://unsplash.com/@carolina' },
      name: '  Carolina   Lopez ',
      username: 'carolina',
    },
    width: 4500,
    ...overrides,
  }
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...init.headers },
    status: init.status ?? 200,
  })
}

function client(fetchImpl: typeof fetch) {
  const made = unsplashClient(env, fetchImpl)
  if (!made) throw new Error('expected a client')
  return made
}

/** Every address a stubbed fetch was called with, and the headers it sent. */
function calls(stub: ReturnType<typeof vi.fn>) {
  return stub.mock.calls.map(([address, init]) => ({
    address: new URL(String(address)),
    authorization: new Headers((init as RequestInit)?.headers).get(
      'authorization',
    ),
  }))
}

function photo(overrides: Record<string, unknown> = {}): UnsplashPhoto {
  const parsed = toPhoto(apiPhoto(overrides))
  if (!parsed) throw new Error('fixture did not parse')
  return parsed
}

describe('configuration', () => {
  // Off by default, so no deployment makes a request to a third party it did
  // not ask for — and the tools say so rather than failing obscurely.
  it.each([{}, { UNSPLASH_ACCESS_KEY: '' }, { UNSPLASH_ACCESS_KEY: '  ' }])(
    'is off for %j',
    (config) => {
      expect(unsplashAccessKey(config)).toBeNull()
      expect(unsplashClient(config, vi.fn())).toBeNull()
    },
  )
})

describe('search', () => {
  it('sends the key as a header, to the API, and asks for safe results', async () => {
    const stub = vi.fn(async () => json({ results: [apiPhoto()], total: 1 }))

    await client(stub).search({ orientation: 'landscape', query: ' plaster ' })

    const [call] = calls(stub)
    expect(call.address.origin).toBe('https://api.unsplash.com')
    expect(call.address.pathname).toBe('/search/photos')
    expect(call.authorization).toBe(`Client-ID ${KEY}`)
    // Never the query parameter, which would put the key into every log line
    // that records an address.
    expect(call.address.searchParams.has('client_id')).toBe(false)
    expect(call.address.searchParams.get('query')).toBe('plaster')
    expect(call.address.searchParams.get('content_filter')).toBe('high')
    expect(call.address.searchParams.get('orientation')).toBe('landscape')
    expect(call.address.searchParams.get('per_page')).toBe(
      String(MAX_CANDIDATES),
    )
  })

  it('offers nothing the agent could send back but an id', async () => {
    const stub = vi.fn(async () => json({ results: [apiPhoto()], total: 1 }))

    const { candidates } = await client(stub).search({ query: 'plaster' })

    expect(candidates).toHaveLength(1)
    const [candidate] = candidates
    expect(candidate.id).toBe('Abc123_-xyz')
    expect(candidate.photographer).toBe('Carolina Lopez')
    expect(candidate.preview).toBe('https://images.unsplash.com/photo-1?w=400')
    expect(candidate.photographerProfile).toContain('utm_medium=referral')
    expect(candidate.photoPage).toContain('utm_medium=referral')

    const serialised = JSON.stringify(candidates)
    expect(serialised).not.toContain('download_location')
    expect(serialised).not.toContain('api.unsplash.com')
    expect(serialised).not.toContain('ixlib')
  })

  it('drops Unsplash+ photographs, by flag and by host', async () => {
    const stub = vi.fn(async () =>
      json({
        results: [
          apiPhoto({ id: 'free1' }),
          apiPhoto({ id: 'flagged', plus: true }),
          apiPhoto({ id: 'premium', premium: true }),
          // Unflagged, but served from Unsplash+'s host: the host decides.
          apiPhoto({
            id: 'unflagged',
            urls: {
              raw: 'https://plus.unsplash.com/premium_photo-1',
              small: 'https://plus.unsplash.com/premium_photo-1?w=400',
            },
          }),
        ],
        total: 4,
      }),
    )

    const result = await client(stub).search({ query: 'plaster' })

    expect(result.candidates.map((c) => c.id)).toEqual(['free1'])
    expect(result.omitted).toBe(3)
  })

  it('reports the quota Unsplash says is left', async () => {
    const stub = vi.fn(async () =>
      json(
        { results: [], total: 0 },
        { headers: { 'X-Ratelimit-Remaining': '37' } },
      ),
    )

    expect((await client(stub).search({ query: 'x' })).quotaRemaining).toBe(37)
  })
})

describe('photo', () => {
  it('refuses an id that is not an Unsplash id, without asking Unsplash', async () => {
    const stub = vi.fn()

    await expect(client(stub).photo('../../users/me')).rejects.toThrow(
      StockPhotoError,
    )
    expect(stub).not.toHaveBeenCalled()
  })

  it('reads the canonical record by id', async () => {
    const stub = vi.fn(async () => json(apiPhoto()))

    const result = await client(stub).photo('Abc123_-xyz')

    expect(result.id).toBe('Abc123_-xyz')
    expect(calls(stub)[0].address.href).toBe(
      'https://api.unsplash.com/photos/Abc123_-xyz',
    )
  })

  it('refuses a record it cannot attribute', async () => {
    const stub = vi.fn(async () => json(apiPhoto({ user: { name: 'x' } })))

    await expect(client(stub).photo('Abc123_-xyz')).rejects.toThrow(
      /cannot be attributed/,
    )
  })
})

describe('refusals', () => {
  const cases: Array<[string, () => Response, RegExp]> = [
    ['a rejected key', () => json({}, { status: 401 }), /UNSPLASH_ACCESS_KEY/],
    [
      'a spent quota',
      () =>
        new Response('Rate Limit Exceeded', {
          headers: { 'X-Ratelimit-Remaining': '0' },
          status: 403,
        }),
      /quota for the hour/,
    ],
    ['a missing photo', () => json({}, { status: 404 }), /no Unsplash photo/],
    ['anything else', () => json({}, { status: 500 }), /answered 500/],
  ]

  it.each(cases)('explains %s, without the key', async (_, answer, message) => {
    const stub = vi.fn(async () => answer())

    const error = await client(stub)
      .photo('Abc123_-xyz')
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StockPhotoError)
    expect((error as Error).message).toMatch(message)
    expect((error as Error).message).not.toContain(KEY)
  })

  it('does not relay a network error', async () => {
    const stub = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED 10.0.0.5:443 using ${KEY}`)
    })

    const error = await client(stub)
      .search({ query: 'x' })
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toBe(
      'Unsplash could not be reached. Try again.',
    )
  })
})

describe('trackDownload', () => {
  it('reports the download to the address Unsplash gave', async () => {
    const stub = vi.fn(async () => json({ url: 'https://...' }))

    expect(await client(stub).trackDownload(photo())).toBe(true)

    const [call] = calls(stub)
    expect(call.address.href).toBe(
      'https://api.unsplash.com/photos/Abc123_-xyz/download?ixid=M3w1',
    )
    expect(call.authorization).toBe(`Client-ID ${KEY}`)
  })

  // The address comes out of a response body. If it ever pointed anywhere but
  // the API, following it would hand the key to whoever wrote it.
  it.each([
    'https://evil.example/photos/x/download',
    'http://api.unsplash.com/photos/x/download',
    'https://api.unsplash.com.evil.example/photos/x/download',
    'not a url',
  ])('never sends the key to %s', async (downloadLocation) => {
    const stub = vi.fn()

    const tracked = await client(stub).trackDownload(
      photo({ links: { download_location: downloadLocation } }),
    )

    expect(tracked).toBe(false)
    expect(stub).not.toHaveBeenCalled()
  })

  it('reports failure rather than throwing', async () => {
    const stub = vi.fn(async () => json({}, { status: 500 }))

    expect(await client(stub).trackDownload(photo())).toBe(false)
  })
})

describe('isFreeLicence and imageAddress', () => {
  it('sizes the stored file and keeps the parameters Unsplash sent', () => {
    const address = new URL(imageAddress(photo()))

    expect(address.hostname).toBe('images.unsplash.com')
    expect(address.searchParams.get('ixid')).toBe('M3w1')
    expect(address.searchParams.get('w')).toBe('2400')
    expect(address.searchParams.get('fit')).toBe('max')
    expect(address.searchParams.get('fm')).toBe('jpg')
  })

  it('refuses Unsplash+', () => {
    const plus = photo({
      urls: {
        raw: 'https://plus.unsplash.com/premium_photo-1',
        small: 'https://plus.unsplash.com/premium_photo-1?w=400',
      },
    })

    expect(isFreeLicence(plus)).toBe(false)
    expect(() => imageAddress(plus)).toThrow(/Unsplash License/)
  })
})

describe('attributionFor', () => {
  it('writes the credit every migrated photograph already carries', () => {
    expect(attributionFor(photo())).toEqual({
      credit: 'Photo by Carolina Lopez / Unsplash',
      // Bare: the referral parameters are added when the credit renders.
      creditURL: 'https://unsplash.com/@carolina',
      // Built from the id, not the slugged page, which moves when a
      // description changes.
      sourceURL: 'https://unsplash.com/photos/Abc123_-xyz',
    })
  })
})
