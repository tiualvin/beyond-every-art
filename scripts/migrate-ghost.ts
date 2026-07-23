import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  parseGhostExport,
  summarizeGhostExport,
} from '../lib/migration/ghost-export'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const inputFlag = args.indexOf('--input')
const input =
  inputFlag >= 0 ? args[inputFlag + 1] : process.env.GHOST_EXPORT_PATH
if (!input) throw new Error('Provide --input <path> or set GHOST_EXPORT_PATH')

const ghost = parseGhostExport(
  JSON.parse(await readFile(resolve(input), 'utf8')),
)
const report = {
  mode: dryRun ? 'dry-run' : 'import',
  ...summarizeGhostExport(ghost),
  warnings: dryRun
    ? ['No database or media writes were performed.']
    : ['Import adapters are not implemented yet.'],
  errors: [],
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!dryRun) process.exitCode = 2
