import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/indexnow.txt/route'
import {
  buildSubmission,
  indexNowConfig,
  indexNowKey,
  indexNowOnChange,
  IndexNowQueue,
  isValidKey,
  urlsOnChange,
  urlsOnDelete,
  type IndexNowConfig,
} from '@/lib/seo/indexnow'
import { postPath } from '@/lib/seo/site'

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const SITE = 'https://www.beyondeveryart.com'
const NOW = new Date('2026-09-27T12:00:00.000Z')

const published = (slug: string, publishedAt = '2026-09-01T00:00:00.000Z') => ({
  slug,
  _status: 'published',
  publishedAt,
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the key', () => {
  it('follows the protocol: 8–128 letters, digits and dashes', () => {
    expect(isValidKey(KEY)).toBe(true)
    expect(isValidKey('abc-1234')).toBe(true)
    expect(isValidKey('short')).toBe(false)
    expect(isValidKey('has space in it')).toBe(false)
    expect(isValidKey('under_score_1')).toBe(false)
    expect(isValidKey('x'.repeat(129))).toBe(false)
  })

  it('is served only when set, well formed, and not on staging', () => {
    expect(indexNowKey({})).toBeNull()
    expect(indexNowKey({ INDEXNOW_KEY: 'bad key!' })).toBeNull()
    expect(indexNowKey({ INDEXNOW_KEY: ` ${KEY} ` })).toBe(KEY)
    expect(
      indexNowKey({ INDEXNOW_KEY: KEY, NEXT_PUBLIC_NOINDEX: '1' }),
    ).toBeNull()
  })
})

describe('indexNowConfig', () => {
  const env = { INDEXNOW_KEY: KEY }

  it('names the host and the key file on the public site', () => {
    expect(indexNowConfig(env, SITE)).toEqual({
      key: KEY,
      host: 'www.beyondeveryart.com',
      keyLocation: 'https://www.beyondeveryart.com/indexnow.txt',
    })
  })

  it('refuses anything that is not a public https origin', () => {
    // Development, the test suite, and a copied .env on a laptop.
    expect(indexNowConfig(env, 'http://localhost:3000')).toBeNull()
    expect(indexNowConfig(env, 'http://127.0.0.1:3000')).toBeNull()
    expect(indexNowConfig(env, 'https://localhost')).toBeNull()
    expect(indexNowConfig(env, 'https://127.0.0.1')).toBeNull()
    expect(indexNowConfig(env, 'http://www.beyondeveryart.com')).toBeNull()
    expect(indexNowConfig(env, 'not a url')).toBeNull()
  })

  it('is off without a key or on staging', () => {
    expect(indexNowConfig({}, SITE)).toBeNull()
    expect(
      indexNowConfig({ ...env, NEXT_PUBLIC_NOINDEX: '1' }, SITE),
    ).toBeNull()
  })
})

describe('what a save announces', () => {
  const change = (
    doc: Record<string, unknown>,
    previousDoc?: Record<string, unknown>,
  ) =>
    urlsOnChange({
      doc,
      previousDoc,
      pathFor: postPath,
      siteUrl: SITE,
      now: NOW,
    })

  it('a publish announces the URL the post is served at', () => {
    expect(change(published('ultramarine-science'))).toEqual([
      'https://www.beyondeveryart.com/ultramarine-science/',
    ])
  })

  it('a draft or an autosave announces nothing', () => {
    expect(change({ slug: 'a', _status: 'draft' })).toEqual([])
    // An autosave of a published post: the published version is untouched.
    expect(change({ slug: 'a', _status: 'draft' }, published('a'))).toEqual([])
  })

  it('a scheduled post announces nothing until it is on the site', () => {
    expect(change(published('later', '2026-10-01T00:00:00.000Z'))).toEqual([])
  })

  it('a live post that moved announces both addresses', () => {
    expect(change(published('new-slug'), published('old-slug'))).toEqual([
      'https://www.beyondeveryart.com/new-slug/',
      'https://www.beyondeveryart.com/old-slug/',
    ])
  })

  it('a slug that was never live is not announced', () => {
    expect(
      change(published('new-slug'), { slug: 'draft-slug', _status: 'draft' }),
    ).toEqual(['https://www.beyondeveryart.com/new-slug/'])
  })

  it('a delete announces the URL only if it was on the site', () => {
    const remove = (doc: Record<string, unknown>) =>
      urlsOnDelete({ doc, pathFor: postPath, siteUrl: SITE, now: NOW })
    expect(remove(published('gone'))).toEqual([
      'https://www.beyondeveryart.com/gone/',
    ])
    expect(remove({ slug: 'never-published', _status: 'draft' })).toEqual([])
  })
})

describe('IndexNowQueue', () => {
  const config: IndexNowConfig = {
    key: KEY,
    host: 'www.beyondeveryart.com',
    keyLocation: `${SITE}/indexnow.txt`,
  }

  function setup(status = 200) {
    let clock = NOW.getTime()
    const send =
      vi.fn<
        (
          body: ReturnType<typeof buildSubmission>,
        ) => Promise<{ status: number }>
      >()
    send.mockResolvedValue({ status })
    const queue = new IndexNowQueue(config, send, () => clock)
    return {
      queue,
      send,
      advance: (ms: number) => {
        clock += ms
      },
    }
  }

  it('sends a burst of saves as one request in the protocol’s shape', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { queue, send } = setup()
    queue.enqueue([`${SITE}/a/`])
    queue.enqueue([`${SITE}/b/`, `${SITE}/a/`])
    await queue.flush()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      buildSubmission(config, [`${SITE}/a/`, `${SITE}/b/`]),
    )
    expect(send.mock.calls[0]![0]).toEqual({
      host: 'www.beyondeveryart.com',
      key: KEY,
      keyLocation: `${SITE}/indexnow.txt`,
      urlList: [`${SITE}/a/`, `${SITE}/b/`],
    })
  })

  it('waits before sending, so saves close together travel together', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { queue, send } = setup()
    queue.enqueue([`${SITE}/a/`])
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not resend a URL within ten minutes, and does after', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { queue, send, advance } = setup()
    queue.enqueue([`${SITE}/a/`])
    await queue.flush()

    advance(9 * 60_000)
    queue.enqueue([`${SITE}/a/`])
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(1)

    advance(60_000)
    queue.enqueue([`${SITE}/a/`])
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('logs a refusal and a network failure without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { queue } = setup(403)
    queue.enqueue([`${SITE}/a/`])
    await expect(queue.flush()).resolves.toBeUndefined()
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({
      event: 'indexnow_failed',
      status: 403,
      urls: 1,
    })

    const failing = new IndexNowQueue(config, async () => {
      throw new Error('network down')
    })
    failing.enqueue([`${SITE}/b/`])
    await expect(failing.flush()).resolves.toBeUndefined()
    expect(JSON.parse(warn.mock.calls[1]![0] as string)).toMatchObject({
      event: 'indexnow_failed',
      reason: 'network down',
    })
  })

  it('never logs the key', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { queue } = setup(202)
    queue.enqueue([`${SITE}/a/`])
    await queue.flush()
    expect(info.mock.calls[0]![0]).not.toContain(KEY)
  })
})

describe('the afterChange hook', () => {
  const hook = indexNowOnChange(postPath)
  const call = (doc: Record<string, unknown>) =>
    hook({ doc, previousDoc: {}, req: {} } as unknown as Parameters<
      typeof hook
    >[0])

  it('does nothing, and returns the document, when IndexNow is off', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const doc = published('a')
    expect(call(doc)).toBe(doc)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('submits a publish on the live site', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubEnv('INDEXNOW_KEY', KEY)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE)
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    call(published('hook-published-post'))
    await vi.advanceTimersByTimeAsync(5_000)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(endpoint).toBe('https://api.indexnow.org/indexnow')
    expect(JSON.parse(init.body as string)).toMatchObject({
      host: 'www.beyondeveryart.com',
      urlList: ['https://www.beyondeveryart.com/hook-published-post/'],
    })
  })
})

describe('/indexnow.txt', () => {
  it('is not found without a key', async () => {
    vi.stubEnv('INDEXNOW_KEY', '')
    expect(GET().status).toBe(404)
  })

  it('serves exactly the key, as plain text, kept out of search', async () => {
    vi.stubEnv('INDEXNOW_KEY', KEY)
    const response = GET()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(KEY)
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('is not found on staging', () => {
    vi.stubEnv('INDEXNOW_KEY', KEY)
    vi.stubEnv('NEXT_PUBLIC_NOINDEX', '1')
    expect(GET().status).toBe(404)
  })
})
