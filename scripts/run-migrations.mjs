#!/usr/bin/env node
// Runs `payload migrate` and refuses to report success unless it actually ran.
//
// The Payload CLI can exit 0 having done nothing at all: `bin.js` transpiles
// itself through tsx's ESM loader and then floats the resulting promise
// (`void start()`). When that loader stalls, nothing is left holding the event
// loop open, so Node drains it and exits 0 without an error, without a stack
// trace, and without ever opening a database connection. Seen in CI as a 1.7s
// `payload migrate` that printed nothing and left the schema empty, twice in a
// row, on a commit that touched no migrations.
//
// An exit code cannot distinguish that from a real run, but the log can: every
// genuine invocation announces the migrations directory and finishes with
// `Done.`, whether or not there was anything pending. Requiring both markers
// turns the silent no-op into a failure we can retry.
//
// This wraps the `migrate:db` script rather than living in the CI workflow so
// the deploy path is covered too — the release migrator container runs the same
// command, with no sentinel behind it, against the production database.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(ROOT, 'node_modules', '.bin', 'payload')
const BIN = path.join(ROOT, 'node_modules', 'payload', 'bin.js')

const ATTEMPTS = 3
const RETRY_DELAY_MS = 2000

/** Markers the Payload CLI prints on every real run, pending work or not. */
const STARTED = 'Reading migration files'
const FINISHED = 'Done.'

const args = process.argv.slice(2)

/**
 * Runs the CLI once, streaming its output so a normal run looks unchanged,
 * while keeping a copy to check for the markers afterwards.
 */
function runOnce(command, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    let log = ''
    child.stdout.on('data', (chunk) => {
      log += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      log += chunk
      process.stderr.write(chunk)
    })

    child.on('error', reject)
    child.on('close', (code) => resolve({ code, log }))
  })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!existsSync(CLI)) {
  console.error(`Payload CLI not found at ${CLI}. Are dependencies installed?`)
  process.exit(1)
}

/** Exits the process when this attempt settled the question either way. */
function judge({ code, log }) {
  // A non-zero exit is a real migration error: the SQL failed, the database is
  // unreachable, a migration is malformed. Retrying cannot help and would only
  // bury the message the CLI already printed.
  if (code !== 0) process.exit(code ?? 1)
  if (log.includes(STARTED) && log.includes(FINISHED)) process.exit(0)
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  judge(await runOnce(CLI, ['migrate', ...args]))

  console.error(
    `payload migrate exited 0 without running (attempt ${attempt}/${ATTEMPTS}).`,
  )
  if (attempt < ATTEMPTS) await wait(RETRY_DELAY_MS)
}

// Retrying the same entry point has been seen to fail three times running, so
// the last resort is a different one rather than a fourth go at the same one.
//
// `bin.js` normally transpiles itself by calling tsx's `tsImport()` from inside
// an async function whose promise it then floats — that is the stall. Asking
// Node to register the loader with `--import` instead means it is in place
// before any of that code runs, and `--disable-transpile` stops the CLI
// reaching for `tsImport` at all.
if (existsSync(BIN)) {
  console.error('Retrying with the loader registered by Node instead.')
  judge(
    await runOnce(process.execPath, [
      '--import',
      'tsx',
      BIN,
      'migrate',
      '--disable-transpile',
      ...args,
    ]),
  )
  console.error('The alternate entry point did not run either.')
}

console.error(
  `payload migrate exited 0 without running. The database has not been ` +
    `migrated; refusing to continue.`,
)
process.exit(1)
