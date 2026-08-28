// `NEXT_PUBLIC_NOINDEX` has to be readable at *runtime*, and the way it stays
// that way is easy to refactor away by accident.
//
// Next.js replaces literal `process.env` reads of a `NEXT_PUBLIC_` variable
// with their build-time values during compilation — in the server bundle as
// well as the client one. (Written that way round on purpose: spelling the
// pattern out here would trip the environment-variable scanner in
// `tests/docs/drift.test.ts`, which reads prose and code alike.) `lib/seo/indexing.ts` escapes that only because it reads through
// an `env` parameter that defaults to `process.env`: a dynamic property access
// on a variable is not something the compiler can fold.
//
// Rewriting `env.NEXT_PUBLIC_NOINDEX` as `process.env.NEXT_PUBLIC_NOINDEX`
// looks equivalent, is shorter, and would be inlined as whatever the value was
// when the image was built — which for this project's Dockerfile is nothing,
// because `NEXT_PUBLIC_NOINDEX` is deliberately not a build argument. The
// deployment would then serve `Allow: /` and no `noindex` meta tag no matter
// what the environment file said, and every unit test here would still pass,
// because they all call `isNoindex` with an explicit env object.
//
// What that costs is specific: since 28 Aug the staging site has no Basic Auth,
// so this switch is the only thing keeping a complete copy of the site out of
// search results (`docs/DEPLOYMENT_STATUS.md`). The same switch is what the
// cutover flip turns off deliberately.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isNoindex, robotsDirective } from '@/lib/seo/indexing'

const source = readFileSync(
  join(resolve(import.meta.dirname, '../..'), 'lib/seo/indexing.ts'),
  'utf8',
)

describe('the noindex switch is evaluated at runtime, not baked into the build', () => {
  it('never reads a NEXT_PUBLIC_ variable off process.env directly', () => {
    // The one pattern Next inlines. `process.env` as a *default argument* is
    // fine and is how the runtime value arrives; what must not appear is a
    // member access on it naming a NEXT_PUBLIC_ variable.
    const inlinable = source.match(/process\.env\.NEXT_PUBLIC_[A-Z0-9_]*/g)

    expect(
      inlinable,
      `lib/seo/indexing.ts reads ${inlinable?.join(', ')} directly off ` +
        'process.env. Next inlines that at build time, and NEXT_PUBLIC_NOINDEX ' +
        'is not a build argument — so the deployment would ignore the ' +
        'environment file and serve an indexable site. Read it through the ' +
        '`env` parameter instead.',
    ).toBeNull()
  })

  it('takes its environment as a parameter defaulting to process.env', () => {
    // Both halves matter: the parameter is what makes the read dynamic, and the
    // default is what makes callers that pass nothing still see the real
    // environment.
    expect(source).toMatch(/env: Env = process\.env/)
  })

  it('still answers from whatever environment it is handed', () => {
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: '1' })).toBe(true)
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: 'true' })).toBe(true)
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: '' })).toBe(false)
    expect(isNoindex({})).toBe(false)

    // The deployment-wide switch outranks a per-document flag, and refuses to
    // follow links as well — a staging copy should not pass ranking signal on.
    expect(robotsDirective(false, { NEXT_PUBLIC_NOINDEX: '1' })).toEqual({
      index: false,
      follow: false,
    })
    expect(robotsDirective(false, {})).toBeUndefined()
  })
})
