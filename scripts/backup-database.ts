// CLI entry point for nightly PostgreSQL backups to Cloudflare R2.
//
//   pnpm backup:db                      dump, gzip, upload, prune old backups
//   pnpm backup:db --dry-run            read-only: show the plan, write nothing
//   pnpm backup:db --output backup.sql.gz   also write the dump locally
//   pnpm backup:db --skip-upload --output backup.sql.gz   dump locally only
//   pnpm backup:db --keep 30            override BACKUP_RETENTION_COUNT
//
// A run performs `pg_dump` (plain SQL), gzips the result, uploads it to R2
// under BACKUP_PREFIX, then deletes backups beyond the retention count. It is
// safe to rerun: every run produces a new timestamped object. Destination
// config comes from resolveBackupConfig (DATABASE_URI + S3_* + BACKUP_*).

import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createGzip } from 'node:zlib'

import {
  backupKey,
  resolveBackupConfig,
  selectExpiredKeys,
} from '../lib/backup/plan'
import { deleteObject, listObjects, putObject } from '../lib/backup/s3'

interface Cli {
  dryRun: boolean
  skipUpload: boolean
  outputPath?: string
  keep?: number
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  const keepRaw = flagValue(argv, '--keep')
  const keep = keepRaw === undefined ? undefined : Number(keepRaw)
  if (keep !== undefined && (!Number.isInteger(keep) || keep < 1)) {
    throw new Error(`--keep must be a positive integer, got "${keepRaw}"`)
  }
  return {
    dryRun: argv.includes('--dry-run'),
    skipUpload: argv.includes('--skip-upload'),
    outputPath: flagValue(argv, '--output'),
    keep,
  }
}

/** Run pg_dump (plain SQL) and return the gzip-compressed dump as a Buffer. */
function dumpAndGzip(databaseUri: string): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const dump = spawn('pg_dump', [
      '--dbname',
      databaseUri,
      '--format=plain',
      '--no-owner',
      '--no-privileges',
    ])
    const gzip = createGzip()
    const chunks: Buffer[] = []
    let stderr = ''

    dump.on('error', (error) =>
      reject(new Error(`Failed to start pg_dump: ${error.message}`)),
    )
    dump.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    dump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}\n${stderr.trim()}`))
      }
    })

    gzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gzip.on('error', reject)
    gzip.on('end', () => resolvePromise(Buffer.concat(chunks)))

    dump.stdout.pipe(gzip)
  })
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const config = resolveBackupConfig(process.env)
  const retentionCount = cli.keep ?? config.retentionCount
  const key = backupKey(config.prefix, config.databaseName, new Date())

  const report: Record<string, unknown> = {
    mode: cli.dryRun ? 'dry-run' : 'backup',
    database: config.databaseName,
    bucket: config.s3.bucket,
    key,
    retentionCount,
    uploaded: false,
    pruned: [] as string[],
    errors: [] as string[],
  }

  if (cli.dryRun) {
    // Read-only: list what exists and show what a real run would prune.
    const existing = await listObjects(config.s3, `${config.prefix}/`)
    report.existingBackups = existing.length
    report.wouldPrune = selectExpiredKeys([...existing, key], retentionCount)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  const archive = await dumpAndGzip(config.databaseUri)
  report.sizeBytes = archive.byteLength

  if (cli.outputPath) {
    await writeFile(resolve(cli.outputPath), archive)
    report.outputPath = resolve(cli.outputPath)
  }

  if (cli.skipUpload) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  await putObject(config.s3, key, archive)
  report.uploaded = true

  // Prune older backups beyond the retention count.
  const existing = await listObjects(config.s3, `${config.prefix}/`)
  const expired = selectExpiredKeys(existing, retentionCount)
  const pruned: string[] = []
  const errors: string[] = []
  for (const expiredKey of expired) {
    try {
      await deleteObject(config.s3, expiredKey)
      pruned.push(expiredKey)
    } catch (error) {
      errors.push(
        `Failed to prune ${expiredKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  report.pruned = pruned
  report.errors = errors

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (errors.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
