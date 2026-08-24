// The healthcheck's URL and the middleware's exemption for it, checked together.
//
// These two are one setting written in two files, and nothing connected them.
// `middleware.ts` lets `/health` past the staging Basic Auth gate because a
// container healthcheck cannot present credentials; `docker-compose.yml` names
// the URL that healthcheck fetches. When `trailingSlash: true` moved every
// caller to `/health/`, the exemption's exact-match comparison stopped covering
// the probe — so a staging deploy answered its own healthcheck with 401, marked
// the container unhealthy, and rolled the deploy back, with the app running
// perfectly well behind the gate.
//
// The failure is invisible on any deployment without STAGING_BASIC_AUTH set,
// which is every CI job and every developer machine — it appears for the first
// time on staging, during a deploy. Hence a test that reads both files.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizePath } from '@/lib/seo/redirects'

const root = resolve(import.meta.dirname, '../..')

/** The path the Compose healthcheck actually fetches. */
function composeHealthcheckPath(): string {
  const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
  const url = /fetch\(''(http:\/\/[^']+)''\)/.exec(compose)?.[1]

  expect(url, 'no healthcheck fetch found in docker-compose.yml').toBeTruthy()
  return new URL(url!).pathname
}

/** The literal the middleware compares a normalized request path against. */
function middlewareExemption(): string {
  const middleware = readFileSync(join(root, 'middleware.ts'), 'utf8')
  const literal =
    /normalizePath\(request\.nextUrl\.pathname\) !== '([^']+)'/.exec(
      middleware,
    )?.[1]

  expect(
    literal,
    'middleware.ts no longer compares a normalized path against the health probe',
  ).toBeTruthy()
  return literal!
}

describe('the health probe reaches the app on a gated staging deployment', () => {
  it('exempts the URL the container healthcheck actually fetches', () => {
    expect(normalizePath(composeHealthcheckPath())).toBe(middlewareExemption())
  })

  it('exempts the probe whichever slash shape it arrives in', () => {
    const exemption = middlewareExemption()

    for (const arrival of ['/health', '/health/', '//health//']) {
      expect(normalizePath(arrival)).toBe(exemption)
    }
  })

  it('does not exempt anything else', () => {
    for (const other of ['/', '/journal/', '/health-status/', '/healthz/']) {
      expect(normalizePath(other)).not.toBe(middlewareExemption())
    }
  })
})
