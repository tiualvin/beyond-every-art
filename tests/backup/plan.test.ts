import { describe, expect, it } from 'vitest'

import {
  backupKey,
  backupTimestamp,
  databaseNameFromUri,
  resolveBackupConfig,
  selectExpiredKeys,
} from '../../lib/backup/plan'

const baseEnv = {
  DATABASE_URI: 'postgresql://payload:secret@postgres:5432/beyond_every_art',
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_BUCKET: 'media',
  S3_ACCESS_KEY_ID: 'AKIA',
  S3_SECRET_ACCESS_KEY: 'shhh',
}

describe('databaseNameFromUri', () => {
  it('extracts the database name from a connection string', () => {
    expect(databaseNameFromUri(baseEnv.DATABASE_URI)).toBe('beyond_every_art')
  })

  it('falls back to a default for an unparseable uri', () => {
    expect(databaseNameFromUri('not a uri')).toBe('database')
  })
})

describe('resolveBackupConfig', () => {
  it('resolves defaults and reuses media S3 credentials', () => {
    const config = resolveBackupConfig(baseEnv)
    expect(config.s3.bucket).toBe('media')
    expect(config.s3.region).toBe('auto')
    expect(config.prefix).toBe('db-backups')
    expect(config.retentionCount).toBe(14)
    expect(config.databaseName).toBe('beyond_every_art')
  })

  it('prefers a dedicated backup bucket and trims the prefix', () => {
    const config = resolveBackupConfig({
      ...baseEnv,
      BACKUP_S3_BUCKET: 'backups',
      BACKUP_PREFIX: 'nightly/',
    })
    expect(config.s3.bucket).toBe('backups')
    expect(config.prefix).toBe('nightly')
  })

  it('throws naming the first missing required variable', () => {
    const { S3_ENDPOINT: _omit, ...withoutEndpoint } = baseEnv
    void _omit
    expect(() => resolveBackupConfig(withoutEndpoint)).toThrow(
      'Missing required environment variable S3_ENDPOINT',
    )
  })

  it('rejects a non-positive retention count', () => {
    expect(() =>
      resolveBackupConfig({ ...baseEnv, BACKUP_RETENTION_COUNT: '0' }),
    ).toThrow('BACKUP_RETENTION_COUNT must be a positive integer')
  })
})

describe('backupKey', () => {
  it('builds a sortable, filename-safe key', () => {
    const key = backupKey(
      'db-backups',
      'beyond_every_art',
      new Date('2026-07-24T03:00:00.000Z'),
    )
    expect(key).toBe('db-backups/beyond_every_art-20260724T030000Z.sql.gz')
  })

  it('marks an encrypted backup in its name', () => {
    const key = backupKey(
      'db-backups',
      'beyond_every_art',
      new Date('2026-07-24T03:00:00.000Z'),
      true,
    )
    expect(key).toBe('db-backups/beyond_every_art-20260724T030000Z.sql.gz.enc')
  })
})

describe('backupTimestamp', () => {
  it('parses the timestamp back out of a key', () => {
    expect(
      backupTimestamp('db-backups/beyond_every_art-20260724T030000Z.sql.gz'),
    ).toBe('20260724T030000Z')
  })

  it('parses an encrypted key the same way', () => {
    expect(
      backupTimestamp(
        'db-backups/beyond_every_art-20260724T030000Z.sql.gz.enc',
      ),
    ).toBe('20260724T030000Z')
  })

  it('returns null for unrelated keys', () => {
    expect(backupTimestamp('db-backups/readme.txt')).toBeNull()
  })
})

describe('selectExpiredKeys', () => {
  const keys = [
    'db-backups/db-20260101T030000Z.sql.gz',
    'db-backups/db-20260103T030000Z.sql.gz',
    'db-backups/db-20260102T030000Z.sql.gz',
    'db-backups/db-20260104T030000Z.sql.gz',
  ]

  it('keeps the newest N and returns the rest', () => {
    expect(selectExpiredKeys(keys, 2)).toEqual([
      'db-backups/db-20260102T030000Z.sql.gz',
      'db-backups/db-20260101T030000Z.sql.gz',
    ])
  })

  it('returns nothing when under the retention count', () => {
    expect(selectExpiredKeys(keys, 10)).toEqual([])
  })

  it('ignores keys without a recognizable timestamp', () => {
    expect(selectExpiredKeys([...keys, 'db-backups/stray.txt'], 4)).toEqual([])
  })

  // The week encryption is switched on, the bucket holds both kinds. They are
  // one series: counting them separately would keep N of each, and would prune
  // a still-needed encrypted backup while holding an older plaintext one.
  it('retains one series across the switch to encryption', () => {
    const mixed = [
      'db-backups/db-20260101T030000Z.sql.gz',
      'db-backups/db-20260102T030000Z.sql.gz',
      'db-backups/db-20260103T030000Z.sql.gz.enc',
      'db-backups/db-20260104T030000Z.sql.gz.enc',
    ]

    expect(selectExpiredKeys(mixed, 2)).toEqual([
      'db-backups/db-20260102T030000Z.sql.gz',
      'db-backups/db-20260101T030000Z.sql.gz',
    ])
  })
})
