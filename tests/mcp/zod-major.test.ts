// Why `zod` is held on its 3.x line.
//
// Dependabot offers 4.x, and it cannot be taken yet. `lib/mcp/tools.ts` builds
// its tool schemas with the root `zod` and hands them to
// `@payloadcms/plugin-mcp`, whose `mcp.tools` config types them as zod 3's
// `ZodType<any, any, any>`. Zod 4 rewrote that internal shape, so every schema
// in that file stops being assignable — sixteen errors from `pnpm typecheck`,
// all of them "missing the following properties: _type, _parse, _getType".
//
// The types are the cheap half of the problem. Underneath the plugin,
// `@modelcontextprotocol/sdk` and `zod-to-json-schema` both take `zod@3` as a
// peer and parse tool input through zod 3 internals. Casting past the compiler
// would leave the MCP server advertising tools whose arguments it cannot
// validate — on the one path in this project that lets an agent write to
// Payload. A red typecheck is the better failure.
//
// Retiring this: when `@payloadcms/plugin-mcp` ships a release that takes zod 4,
// the second test here fails. That is the signal to bump `zod`, re-run
// `pnpm typecheck`, and delete this file.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as { dependencies: Record<string, string> }

/**
 * The `zod` range a package declares, wherever it declares one.
 *
 * Read off disk rather than through `require`: both manifests below put
 * `exports` in the way of `<name>/package.json`.
 */
function declaredZod(name: string): string | undefined {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  return manifest.dependencies?.zod ?? manifest.peerDependencies?.zod
}

describe('zod stays on the major the MCP plugin can consume', () => {
  it('pins the root dependency to 3.x', () => {
    expect(packageJson.dependencies.zod).toMatch(/^\^?3\./)
  })

  it('still has a plugin that asks for zod 3, or this pin is retirable', () => {
    // The plugin is the boundary our code actually touches, and the only one
    // of the three that is a direct dependency — the MCP SDK sits underneath
    // it, unhoisted, and is the plugin's problem to carry forward. When this
    // range moves to 4, the tool schemas can move with it, and this assertion
    // is what says so out loud rather than leaving the pin to look like
    // caution nobody dares undo.
    expect(declaredZod('@payloadcms/plugin-mcp')).toMatch(/3\./)
  })
})
