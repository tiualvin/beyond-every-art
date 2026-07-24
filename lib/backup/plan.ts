// Pure planning helpers for the database backup pipeline: resolving the
// destination config from the environment, naming backup objects, and deciding
// which old backups a retention policy should prune. Kept free of I/O so the
// logic is unit-testable; scripts/backup-database.ts wires these to pg_dump and
// the S3 client.

import type { S3Config } from './s3'

export interface BackupConfig {
  s3: S3Config
  /** Key prefix backups live under, e.g. `db-backups`. Never ends with `/`. */
  prefix: string
  /** Postgres connection string (pg_dump / psql `--dbname`). */
  databaseUri: string
  /** Logical database name, used in backup filenames. */
  databaseName: string
  /** Number of most-recent backups to retain; older ones are pruned. */
  retentionCount: number
}

/** Derive the logical database name from a Postgres connection string. */
export function databaseNameFromUri(uri: string): string {
  try {
    const name = new URL(uri).pathname.replace(/^\//, '').split('/')[0]
    return name || 'database'
  } catch {
    return 'database'
  }
}

type Env = Record<string, string | undefined>

function requireEnv(env: Env, name: string): string {
  const value = env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

/**
 * Resolve backup configuration from the environment. Backups reuse the same R2
 * credentials as media storage (S3_*), with backup-specific settings under
 * BACKUP_*. A dedicated BACKUP_S3_BUCKET is honored when set, otherwise media's
 * S3_BUCKET is used. Throws a clear error naming the first missing variable.
 */
export function resolveBackupConfig(env: Env): BackupConfig {
  const databaseUri = requireEnv(env, 'DATABASE_URI')
  const endpoint = requireEnv(env, 'S3_ENDPOINT')
  const bucket = env.BACKUP_S3_BUCKET || requireEnv(env, 'S3_BUCKET')

  const retentionRaw = env.BACKUP_RETENTION_COUNT
  const retentionCount = retentionRaw ? Number(retentionRaw) : 14
  if (!Number.isInteger(retentionCount) || retentionCount < 1) {
    throw new Error(
      `BACKUP_RETENTION_COUNT must be a positive integer, got "${retentionRaw}"`,
    )
  }

  return {
    s3: {
      endpoint,
      region: env.S3_REGION || 'auto',
      bucket,
      accessKeyId: requireEnv(env, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv(env, 'S3_SECRET_ACCESS_KEY'),
    },
    prefix: (env.BACKUP_PREFIX || 'db-backups').replace(/\/+$/, ''),
    databaseUri,
    databaseName: databaseNameFromUri(databaseUri),
    retentionCount,
  }
}

/**
 * Object key for a backup taken at `date`, e.g.
 * `db-backups/beyond_every_art-20260724T030000Z.sql.gz`. The timestamp is
 * filename-safe (no colons) and sorts chronologically as a string.
 */
export function backupKey(
  prefix: string,
  databaseName: string,
  date: Date,
): string {
  const stamp = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return `${prefix}/${databaseName}-${stamp}.sql.gz`
}

/** Extract the ISO-ish timestamp segment from a backup key, or null. */
export function backupTimestamp(key: string): string | null {
  const match = key.match(/-(\d{8}T\d{6}Z)\.sql\.gz$/)
  return match ? match[1] : null
}

/**
 * Given every backup key under the prefix and a retention count, return the
 * keys that should be deleted: everything except the `retentionCount` newest.
 * Keys without a recognizable timestamp are ignored (never pruned), so stray
 * objects in the prefix are left untouched.
 */
export function selectExpiredKeys(
  keys: string[],
  retentionCount: number,
): string[] {
  const dated = keys
    .map((key) => ({ key, stamp: backupTimestamp(key) }))
    .filter((entry): entry is { key: string; stamp: string } =>
      Boolean(entry.stamp),
    )
    .sort((a, b) => b.stamp.localeCompare(a.stamp))

  return dated.slice(retentionCount).map((entry) => entry.key)
}
