// Encryption for database backups.
//
// A dump contains the whole `members` archive — addresses, Stripe customer and
// subscription identifiers, internal notes, engagement statistics — and it was
// uploaded to object storage as plain `pg_dump | gzip`. Retention is bounded
// and the bucket is credentialed, but the same `S3_*` credentials serve media
// and backups, so one leaked key exposed both, and anything that could read the
// bucket could read every member the publication has.
//
// AES-256-GCM, with the key derived from a passphrase by scrypt. No new
// dependency and no binary in the backup image: `node:crypto` is already there,
// and a backup tool that needs software the recovery machine might not have is
// a backup tool that fails on the day it matters.
//
// GCM rather than CBC because a backup has to be *authenticated*, not merely
// unreadable. Anyone who can write to the bucket can replace an object;
// without the tag, a restore would happily feed whatever they left behind into
// `psql`. A modified archive fails to decrypt instead.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Envelope header, versioned so a future format change is detectable rather
 * than a decryption failure nobody can explain.
 *
 * It is also what makes a bucket self-describing: `head -c 8` on any object
 * says whether it is encrypted, which is the question somebody will be asking
 * under pressure with the site down.
 */
export const ENCRYPTED_MAGIC = Buffer.from('BEAENC01', 'ascii')

const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const HEADER_BYTES = ENCRYPTED_MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES

/**
 * Shortest passphrase accepted.
 *
 * scrypt makes a weak passphrase expensive to attack rather than impossible,
 * and an operator under time pressure will otherwise reach for something
 * memorable. The intended value is `openssl rand -base64 32`, which is 44
 * characters; this only rules out the answers nobody should be typing.
 */
export const MIN_PASSPHRASE_LENGTH = 16

/** scrypt cost. The default N=16384 is ~50ms once per backup, which is free. */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_BYTES)
}

/** Whether a buffer is one of our envelopes, by its header alone. */
export function isEncryptedArchive(archive: Buffer): boolean {
  return (
    archive.length >= HEADER_BYTES &&
    timingSafeEqual(
      archive.subarray(0, ENCRYPTED_MAGIC.length),
      ENCRYPTED_MAGIC,
    )
  )
}

/**
 * The passphrase to encrypt with, or null when backups are not encrypted.
 *
 * Unset means unencrypted, deliberately. Refusing to back up without a key
 * would turn "backups are readable by whoever holds the storage credential"
 * into "there are no backups", which is a straight downgrade — the nightly job
 * runs unattended and nobody would notice until a restore. The scripts say so
 * in their report on every run instead, so it stays visible rather than
 * becoming the new normal quietly.
 */
export function resolveBackupPassphrase(
  env: Record<string, string | undefined>,
): string | null {
  const passphrase = env.BACKUP_ENCRYPTION_KEY?.trim()
  if (!passphrase) return null

  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must be at least ${MIN_PASSPHRASE_LENGTH} ` +
        'characters. Generate one with `openssl rand -base64 32`.',
    )
  }

  return passphrase
}

/**
 * Wrap a gzipped dump in an authenticated envelope.
 *
 * A fresh salt per backup, so the same passphrase never derives the same key
 * twice and two nights' backups reveal nothing by comparison.
 */
export function encryptArchive(archive: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)

  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()])

  return Buffer.concat([
    ENCRYPTED_MAGIC,
    salt,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ])
}

/**
 * Unwrap an envelope, or throw with something an operator can act on.
 *
 * Every failure here happens during a restore, which is the worst moment to
 * receive a message like `Unsupported state or unable to authenticate data`.
 * The two cases that actually occur — wrong passphrase, and an archive that was
 * altered in the bucket — are indistinguishable to GCM, so the message names
 * both rather than guessing.
 */
export function decryptArchive(envelope: Buffer, passphrase: string): Buffer {
  if (!isEncryptedArchive(envelope)) {
    throw new Error(
      'That archive is not encrypted, so it cannot be decrypted. Restore it ' +
        'without a passphrase.',
    )
  }

  let offset = ENCRYPTED_MAGIC.length
  const take = (bytes: number) => {
    const slice = envelope.subarray(offset, offset + bytes)
    offset += bytes
    return slice
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(passphrase, take(SALT_BYTES)),
    take(IV_BYTES),
  )
  decipher.setAuthTag(take(TAG_BYTES))

  try {
    return Buffer.concat([
      decipher.update(envelope.subarray(offset)),
      decipher.final(),
    ])
  } catch {
    throw new Error(
      'Could not decrypt this backup. Either BACKUP_ENCRYPTION_KEY is not the ' +
        'passphrase it was written with, or the archive has been altered since ' +
        'it was uploaded. Both fail the same way, so check the passphrase ' +
        'first — including whether it was rotated after this backup was taken.',
    )
  }
}
