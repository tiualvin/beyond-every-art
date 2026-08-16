// CLI entry point for restoring a PostgreSQL backup produced by
// scripts/backup-database.ts. Restoring is destructive, so a real run requires
// an explicit --yes.
//
//   pnpm restore:db --latest --dry-run          verify the newest backup only
//   pnpm restore:db --latest --yes              restore the newest backup
//   pnpm restore:db --input db-backups/x.sql.gz --yes
//   pnpm restore:db --input-file ./local.sql.gz --yes
//   pnpm restore:db --latest --target postgresql://... --yes   restore elsewhere
//
// By default the target database is DATABASE_URI; pass --target to restore into
// a different database (e.g. a staging instance) without touching production.

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

import {
  decryptArchive,
  isEncryptedArchive,
  resolveBackupPassphrase,
} from '../lib/backup/encrypt'
import { backupTimestamp, resolveBackupConfig } from '../lib/backup/plan'
import { getObject, listObjects } from '../lib/backup/s3'

interface Cli {
  latest: boolean
  input?: string
  inputFile?: string
  target?: string
  dryRun: boolean
  yes: boolean
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    latest: argv.includes('--latest'),
    input: flagValue(argv, '--input'),
    inputFile: flagValue(argv, '--input-file'),
    target: flagValue(argv, '--target'),
    dryRun: argv.includes('--dry-run'),
    yes: argv.includes('--yes'),
  }
  const sources = [cli.latest, cli.input, cli.inputFile].filter(Boolean).length
  if (sources !== 1) {
    throw new Error(
      'Provide exactly one source: --latest, --input <key>, or --input-file <path>',
    )
  }
  return cli
}

/** Restore decompressed SQL into the target database via psql. */
function restoreWithPsql(databaseUri: string, sql: Buffer): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const psql = spawn('psql', [
      '--dbname',
      databaseUri,
      '--set',
      'ON_ERROR_STOP=1',
      '--quiet',
    ])
    let stderr = ''
    psql.on('error', (error) =>
      reject(new Error(`Failed to start psql: ${error.message}`)),
    )
    psql.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    psql.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`psql exited with code ${code}\n${stderr.trim()}`))
    })
    psql.stdin.write(sql)
    psql.stdin.end()
  })
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const config = resolveBackupConfig(process.env)
  const target = cli.target ?? config.databaseUri

  // Resolve the compressed backup bytes from the chosen source.
  let source: string
  let archive: Buffer
  if (cli.inputFile) {
    source = resolve(cli.inputFile)
    archive = await readFile(source)
  } else {
    let key = cli.input
    if (cli.latest) {
      const keys = await listObjects(config.s3, `${config.prefix}/`)
      const newest = keys
        .filter((k) => backupTimestamp(k))
        .sort((a, b) =>
          backupTimestamp(b)!.localeCompare(backupTimestamp(a)!),
        )[0]
      if (!newest) throw new Error('No backups found to restore')
      key = newest
    }
    source = `s3://${config.s3.bucket}/${key}`
    archive = await getObject(config.s3, key!)
  }

  // Decrypt and decompress up front, so a wrong passphrase or a corrupt archive
  // fails before we touch the database. Whether an archive is encrypted is read
  // from its own header rather than from its name: a file renamed on the way to
  // the recovery machine still restores, and an object that was encrypted after
  // this ran for the first time is handled without a flag.
  const encrypted = isEncryptedArchive(archive)
  let compressed = archive

  if (encrypted) {
    const passphrase = resolveBackupPassphrase(process.env)
    if (!passphrase) {
      throw new Error(
        `${source} is encrypted, but BACKUP_ENCRYPTION_KEY is not set. ` +
          'Set it to the passphrase this backup was written with.',
      )
    }
    compressed = decryptArchive(archive, passphrase)
  }

  const sql = gunzipSync(compressed)

  const report: Record<string, unknown> = {
    mode: cli.dryRun ? 'dry-run' : 'restore',
    source,
    target: target.replace(/:\/\/[^@]*@/, '://***@'),
    encrypted,
    compressedBytes: archive.byteLength,
    sqlBytes: sql.byteLength,
    restored: false,
  }

  if (cli.dryRun) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  if (!cli.yes) {
    throw new Error(
      'Refusing to restore without --yes. Restoring overwrites the target ' +
        'database. Re-run with --yes once you are certain of the target.',
    )
  }

  await restoreWithPsql(target, sql)
  report.restored = true
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
