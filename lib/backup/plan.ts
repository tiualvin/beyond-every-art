// Pure planning helpers for the database backup pipeline: resolving the
// destination config from the environment, naming backup objects, and deciding
// which old backups a retention policy should prune. Kept free of I/O so the
// logic is unit-testable; scripts/backup-database.ts wires these to pg_dump and
// the S3 client.

import type { S3Config } from './s3'

/** Everything a backup or restore needs when no object store is involved. */
export interface LocalBackupConfig {
  /** Key prefix backups live under, e.g. `db-backups`. Never ends with `/`. */
  prefix: string
  /** Postgres connection string (pg_dump / psql `--dbname`). */
  databaseUri: string
  /** Logical database name, used in backup filenames. */
  databaseName: string
  /** Number of most-recent backups to retain; older ones are pruned. */
  retentionCount: number
}

export interface BackupConfig extends LocalBackupConfig {
  s3: S3Config
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
 * Resolve the part of the configuration that describes the database itself.
 *
 * This is all a local dump (`--skip-upload --output`) or a restore from a file
 * on disk (`--input-file`) needs. Those are the commands reached for during an
 * incident, often on a machine that has the database but not the storage
 * credentials — so demanding an endpoint and a key from them would be a
 * requirement that only ever bites at the worst moment.
 */
export function resolveLocalBackupConfig(env: Env): LocalBackupConfig {
  const databaseUri = requireEnv(env, 'DATABASE_URI')

  const retentionRaw = env.BACKUP_RETENTION_COUNT
  const retentionCount = retentionRaw ? Number(retentionRaw) : 14
  if (!Number.isInteger(retentionCount) || retentionCount < 1) {
    throw new Error(
      `BACKUP_RETENTION_COUNT must be a positive integer, got "${retentionRaw}"`,
    )
  }

  return {
    prefix: (env.BACKUP_PREFIX || 'db-backups').replace(/\/+$/, ''),
    databaseUri,
    databaseName: databaseNameFromUri(databaseUri),
    retentionCount,
  }
}

/**
 * Resolve backup configuration from the environment. Backups reuse the same R2
 * credentials as media storage (S3_*), with backup-specific settings under
 * BACKUP_*. A dedicated BACKUP_S3_BUCKET is honored when set, otherwise media's
 * S3_BUCKET is used. Throws a clear error naming the first missing variable.
 */
export function resolveBackupConfig(env: Env): BackupConfig {
  const local = resolveLocalBackupConfig(env)
  const endpoint = requireEnv(env, 'S3_ENDPOINT')
  const bucket = env.BACKUP_S3_BUCKET || requireEnv(env, 'S3_BUCKET')

  return {
    ...local,
    s3: {
      endpoint,
      region: env.S3_REGION || 'auto',
      bucket,
      accessKeyId: requireEnv(env, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv(env, 'S3_SECRET_ACCESS_KEY'),
    },
  }
}

/**
 * Object key for a backup taken at `date`, e.g.
 * `db-backups/beyond_every_art-20260724T030000Z.sql.gz`. The timestamp is
 * filename-safe (no colons) and sorts chronologically as a string.
 *
 * Encrypted backups take a `.enc` suffix. The envelope identifies itself by its
 * header, so nothing depends on the name — but a bucket listing is what an
 * operator looks at first, and one that does not say which objects need a
 * passphrase is a listing that will mislead somebody during a restore.
 */
export function backupKey(
  prefix: string,
  databaseName: string,
  date: Date,
  encrypted = false,
): string {
  const stamp = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return `${prefix}/${databaseName}-${stamp}.sql.gz${encrypted ? '.enc' : ''}`
}

/**
 * Extract the ISO-ish timestamp segment from a backup key, or null.
 *
 * Both suffixes match, so retention and `--latest` sort one series across the
 * point where encryption was switched on. Treating them as two would have
 * pruned the wrong objects: the count would apply to each half separately, and
 * `--latest` would have kept finding the newest *unencrypted* backup long after
 * newer encrypted ones existed.
 */
export function backupTimestamp(key: string): string | null {
  const match = key.match(/-(\d{8}T\d{6}Z)\.sql\.gz(?:\.enc)?$/)
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
