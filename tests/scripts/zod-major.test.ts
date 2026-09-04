// Why zod is held on its 3.x line.
//
// Dependabot offers 4.5.4. On it, `pnpm typecheck` fails with 22 errors in
// `lib/mcp/tools.ts`, all the same shape:
//
//   Type 'ZodString' is missing the following properties from type
//   'ZodType<any, any, any>': _type, _parse, _getType, _getOrReturnCtx…
//
// None of them is our code being wrong. The schemas in that file are declared
// against `MCPPluginConfig`, whose `tools` field is typed in terms of zod's
// `ZodRawShape` — and `@payloadcms/plugin-mcp` brings its own `zod@^3.25.50`
// for that type. A zod 4 schema is not structurally a zod 3 `ZodType`, so
// every schema we hand the plugin stops satisfying the parameter it goes into.
//
// The upgrade is therefore upstream's, not ours: it unblocks when
// `@payloadcms/plugin-mcp` moves to zod 4. At the time of writing its `latest`
// on npm *is* 3.88.0, the version pinned here, and it still asks for zod 3 —
// so there is no release to move to, and no version of this project's own code
// that would compile against both.
//
// The bump also buys nothing that is not already here. zod 3.25 ships zod 4
// under the `zod/v4` subpath, which `assertShipsV4` below pins: anything in
// this project that wants zod 4's API can import it today, without moving the
// package major and breaking the one file that must speak zod 3.
//
// Retiring this: when `@payloadcms/plugin-mcp` depends on zod 4, drop the
// `zod` entry from `.github/dependabot.yml`'s ignore list, take the bump, and
// delete this file.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(root, file), 'utf8')) as T
}

const packageJson = readJson<{
  dependencies: Record<string, string>
}>('package.json')

describe('zod stays on the major its MCP plugin accepts', () => {
  it('pins zod to 3.x', () => {
    expect(packageJson.dependencies.zod).toMatch(/^\^?3\./)
  })

  // The reason for the pin, asserted rather than described. When this stops
  // being a 3.x range, the plugin accepts zod 4 and the pin above can go.
  it('still has an MCP plugin that asks for zod 3, or this pin is retirable', () => {
    const plugin = readJson<{ dependencies: Record<string, string> }>(
      'node_modules/@payloadcms/plugin-mcp/package.json',
    )

    expect(plugin.dependencies.zod).toMatch(/^\^?3\./)
  })

  // What makes the pin cheap: zod 4 is already installed, one subpath away.
  it('ships zod 4 under the v4 subpath, so the pin costs no API', () => {
    const zod = readJson<{ exports: Record<string, unknown> }>(
      'node_modules/zod/package.json',
    )

    expect(Object.keys(zod.exports)).toContain('./v4')
  })
})
