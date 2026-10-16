// The website's tooling stays out of the companion app, and out of nothing else.
//
// `apps/companion` is a standalone Expo project with its own lockfile, its own
// React Native types and its own lint and test runners (docs/COMPANION_APP.md).
// Every root tool walks the whole checkout by default — `tsconfig.json`
// includes `**/*.ts`, `pnpm lint` and `format:check` run on `.`, Vitest globs
// for tests, and the Docker build is `COPY . .` — so each one needs telling to
// leave `apps/` alone, and each telling is a pattern that can be written too
// broadly.
//
// That is not hypothetical. `.prettierignore` has gitignore semantics, where an
// unanchored `apps/` matches a directory of that name at any depth — including
// the live route `app/(frontend)/apps/`, which would then drop out of
// `format:check` with nothing anywhere saying so. So every exclusion is checked
// from both sides: the app is excluded, and the route that shares its name is
// not.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

import { ESLint } from 'eslint'
import * as prettier from 'prettier'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import vitestConfig from '../../vitest.config'

const root = resolve(import.meta.dirname, '../..')

/** A file in the app, whether or not it exists yet. */
const APP_FILE = 'apps/companion/src/reader/render.tsx'

/** The live route that shares the app's directory name: the positive control. */
const ROUTE_FILE = 'app/(frontend)/apps/page.tsx'

describe('ESLint', () => {
  const eslint = new ESLint({ cwd: root })

  it('ignores the companion app', async () => {
    expect(await eslint.isPathIgnored(join(root, APP_FILE))).toBe(true)
  })

  it('still lints the /apps/ route', async () => {
    expect(await eslint.isPathIgnored(join(root, ROUTE_FILE))).toBe(false)
  })
})

describe('Prettier', () => {
  const info = (file: string) =>
    prettier.getFileInfo(join(root, file), {
      ignorePath: [join(root, '.gitignore'), join(root, '.prettierignore')],
    })

  it('ignores the companion app', async () => {
    expect((await info(APP_FILE)).ignored).toBe(true)
  })

  it('still formats the /apps/ route', async () => {
    const result = await info(ROUTE_FILE)
    expect(result.ignored).toBe(false)
    expect(result.inferredParser).toBe('typescript')
  })

  it('anchors the pattern, so it cannot match a nested apps directory', () => {
    const lines = readFileSync(join(root, '.prettierignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
    expect(lines).toContain('/apps/')
    expect(lines).not.toContain('apps/')
    expect(lines).not.toContain('apps')
  })
})

describe('TypeScript', () => {
  // `parseJsonConfigFileContent` walks the disk, so the patterns are tried in
  // a scratch copy holding one file on each side of the line. Testing against
  // the real checkout would prove nothing until the app had files in it, and
  // nothing at all about a route that happened to be renamed.
  const sandbox = mkdtempSync(join(tmpdir(), 'tsconfig-isolation-'))
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

  const place = (file: string) => {
    const path = join(sandbox, file)
    mkdirSync(resolve(path, '..'), { recursive: true })
    writeFileSync(path, 'export {}\n')
  }

  const appProbe = 'apps/companion/src/probe.ts'
  const routeProbe = 'app/(frontend)/apps/probe.tsx'
  for (const file of [appProbe, routeProbe, 'lib/probe.ts']) place(file)

  const raw = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, sandbox)
  const included = parsed.fileNames.map((file) => relative(sandbox, file))

  it('reads the real tsconfig', () => {
    expect(raw.error).toBeUndefined()
    expect(included).toContain('lib/probe.ts')
  })

  it('leaves the companion app out of the website typecheck', () => {
    expect(included).not.toContain(appProbe)
  })

  it('still typechecks the /apps/ route', () => {
    expect(included).toContain(routeProbe)
  })
})

describe('Vitest', () => {
  const exclude = (vitestConfig as { test?: { exclude?: string[] } }).test
    ?.exclude

  it('does not collect the companion app’s Jest tests', () => {
    expect(exclude).toContain('apps/**')
  })

  it('excludes nothing under app/', () => {
    expect(exclude?.filter((pattern) => /(^|\/)app\//.test(pattern))).toEqual(
      [],
    )
  })
})

describe('the Docker build context', () => {
  // `.dockerignore` patterns are anchored to the context root (Go's
  // `filepath.Match`, not gitignore), so the bare name is the whole app and
  // only the app.
  const lines = readFileSync(join(root, '.dockerignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())

  it('keeps the companion app out of every image', () => {
    expect(lines).toContain('apps')
  })

  // A literal path excludes itself and everything below it. Wildcards are
  // refused outright rather than interpreted: none is needed today, and one
  // that matched `apps` at depth is exactly the mistake this file exists for.
  it('keeps the /apps/ route in it', () => {
    const covers = (pattern: string) => {
      const path = pattern.replace(/^\//, '').replace(/\/$/, '')
      return ROUTE_FILE === path || ROUTE_FILE.startsWith(`${path}/`)
    }
    const patterns = lines.filter((line) => line && !line.startsWith('#'))

    expect(patterns.filter(covers)).toEqual([])
    expect(patterns.filter((line) => line.includes('**'))).toEqual([])
  })
})
