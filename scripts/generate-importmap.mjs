// `payload generate:importmap`, with the output put where Next will read it.
//
// The generator writes `app/(payload)/admin/importMap.js`. This project tracks
// `importMap.ts`, and Next resolves `.ts` ahead of `.js` — so running the
// generator bare produces a file that looks like the answer, is not loaded, and
// leaves the tracked map stale. Every symptom of that is at runtime and none of
// it is loud: a custom component silently fails to resolve, and the admin
// renders blank.
//
// That is not hypothetical here. `docs/DEPLOYMENT_STATUS.md` records nine days
// of a blank admin from an import map that was complete on the machine that
// generated it and missing an entry on the server.
//
// The two files are byte-identical in shape — the same imports, the same
// `/** @type import('payload').ImportMap */` annotation, the same export — so
// this is a rename, not a conversion.
//
// `tests/collections/import-map.test.ts` fails if the `.js` is ever left
// behind, which is the check this script exists to keep satisfiable.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.cwd(), 'app/(payload)/admin')
const generated = path.join(dir, 'importMap.js')
const tracked = path.join(dir, 'importMap.ts')

const result = spawnSync('payload', ['generate:importmap'], {
  stdio: 'inherit',
  shell: true,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (!existsSync(generated)) {
  // A future Payload may write the `.ts` directly, which is the outcome this
  // wants anyway. Nothing to do, and nothing to warn about.
  if (existsSync(tracked)) process.exit(0)
  console.error(
    'generate:importmap produced neither importMap.js nor importMap.ts.',
  )
  process.exit(1)
}

const next = readFileSync(generated, 'utf8')
const previous = existsSync(tracked) ? readFileSync(tracked, 'utf8') : ''

if (existsSync(tracked)) unlinkSync(tracked)
renameSync(generated, tracked)

console.log(
  previous === next
    ? 'Import map unchanged (app/(payload)/admin/importMap.ts).'
    : 'Import map written to app/(payload)/admin/importMap.ts.',
)
