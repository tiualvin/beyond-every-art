// The content API switched off, for every method, before a handler is asked.
//
// Each handler checks the switch itself, but the routes export only GET, and
// Next answers the rest without them: OPTIONS with a 204 and an Allow header,
// every other method with a 405. Off, those would say an endpoint is deployed
// here; middleware answers them all 404 instead. Checked against a running
// standalone build by e2e/app-api.spec.ts; pinned here so a reorder of the
// middleware cannot quietly drop it.

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAppApiPath } from '../../lib/app-api/switch'

async function loadMiddleware() {
  vi.resetModules()
  return (await import('../../middleware')).middleware
}

const request = (
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
) =>
  new NextRequest(`https://www.beyondeveryart.com${path}`, {
    method,
    headers: { 'x-forwarded-for': '198.51.100.9', ...headers },
  })

beforeEach(() => {
  // A fall-through reaches the redirect map, which is fetched from the app
  // itself; an empty one makes "passed through" a plain 200.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ redirects: [] })),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the content API in middleware', () => {
  it('answers every method 404 while switched off, uncached and unindexed', async () => {
    vi.stubEnv('APP_API_ENABLED', '')
    const middleware = await loadMiddleware()

    for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE']) {
      for (const path of ['/app-api/v1/posts/', '/app-api/', '/app-api']) {
        const response = await middleware(request(path, method))
        expect(response.status, `${method} ${path}`).toBe(404)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('x-robots-tag')).toBe('noindex')
        if (method !== 'HEAD') {
          expect(await response.json()).toEqual({ error: 'Not found' })
        }
      }
    }
  })

  it('lets the API through when it is on, for the handlers to answer', async () => {
    vi.stubEnv('APP_API_ENABLED', '1')
    const middleware = await loadMiddleware()
    const response = await middleware(request('/app-api/v1/posts/'))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('asks for staging credentials before saying anything about the API', async () => {
    vi.stubEnv('APP_API_ENABLED', '')
    vi.stubEnv('STAGING_BASIC_AUTH', 'staff:secret')
    const middleware = await loadMiddleware()
    expect((await middleware(request('/app-api/v1/posts/'))).status).toBe(401)
  })

  it('claims only its own prefix', () => {
    expect(isAppApiPath('/app-api')).toBe(true)
    expect(isAppApiPath('/app-api/v1/posts/')).toBe(true)
    for (const other of ['/app-apis/', '/app-api-notes/', '/apps/', '/api/']) {
      expect(isAppApiPath(other), other).toBe(false)
    }
  })
})
