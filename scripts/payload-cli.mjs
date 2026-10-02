#!/usr/bin/env node
// Runs the Payload CLI with one module-resolution condition added, because on
// Node 20 it otherwise fails to start more often than it starts.
//
// Every Lexical package resolves, under Node's `node` export condition, to a
// `*.node.mjs` shim whose whole body is a top-level
// `await import(NODE_ENV !== 'production' ? './X.dev.mjs' : './X.prod.mjs')`.
// The CLI loads `payload.config.ts` — and through the rich-text editor, dozens
// of those shims — with tsx's `tsImport()`, whose hooks run on a loader thread.
// On Node 20 a graph that deep in top-level awaits intermittently never
// settles: the import promise is left pending, nothing else holds the event
// loop, and the CLI exits 0 having printed nothing and done nothing. That is
// the "silent no-op" `run-migrations.mjs` was written to catch.
//
// Measured on Node 20.20.2 against an empty database, `payload migrate` ran
// 7 times in 8 on Payload 3.89 (Lexical 0.41) and 3 in 8 on Payload 3.90.1
// (Lexical 0.50, and more of its packages). Holding the event loop open only
// turned the silent exit into a hang, so it is not a lifetime problem.
//
// Lexical's `exports` list `development` and `production` ahead of `node`, so
// naming either resolves every Lexical package straight to the build its shim
// would have picked, and no top-level await is left in the graph: 12 in 12.
// The condition follows NODE_ENV for exactly that reason — this changes how
// the modules load, never which ones. `tests/scripts/payload-cli.test.ts`
// fails if Lexical's export order stops making that true.
//
// Scripts run through `tsx` do not need this: its CLI registers the loader
// before anything is imported, and `migrate:ghost`, which loads the same
// config, ran 8 times in 8 under the same conditions. Node 22 does not need it
// either (the same CLI ran every time there), but every runtime here is Node 20.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The Payload CLI as pnpm installs it. */
export const PAYLOAD_CLI = path.join(ROOT, 'node_modules', '.bin', 'payload')

/**
 * The environment to run the Payload CLI in: this one, with the resolution
 * condition that matches NODE_ENV appended to NODE_OPTIONS. Through the
 * environment rather than a flag so that it reaches the loader thread and any
 * process the CLI starts, whichever way the CLI is launched.
 */
export function payloadCliEnv(env = process.env) {
  const condition = env.NODE_ENV === 'production' ? 'production' : 'development'
  const options = [env.NODE_OPTIONS, `--conditions=${condition}`]
    .filter(Boolean)
    .join(' ')
  return { ...env, NODE_OPTIONS: options }
}

// Run as a command: `node scripts/payload-cli.mjs <payload arguments>`, which
// is what the `migrate:db:*` scripts in package.json are.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!existsSync(PAYLOAD_CLI)) {
    console.error(
      `Payload CLI not found at ${PAYLOAD_CLI}. Are dependencies installed?`,
    )
    process.exit(1)
  }
  const child = spawn(PAYLOAD_CLI, process.argv.slice(2), {
    cwd: ROOT,
    env: payloadCliEnv(),
    stdio: 'inherit',
  })
  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })
  child.on('close', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0))
  })
}
