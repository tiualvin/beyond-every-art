import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import {
  decryptArchive,
  encryptArchive,
  ENCRYPTED_MAGIC,
  isEncryptedArchive,
  MIN_PASSPHRASE_LENGTH,
  resolveBackupPassphrase,
} from '../../lib/backup/encrypt'

const PASSPHRASE = 'correct horse battery staple'
const dump = gzipSync(Buffer.from('CREATE TABLE members (id serial);\n'))

describe('encryptArchive / decryptArchive', () => {
  // The whole point: what goes in comes back, byte for byte. A backup that
  // restores to something subtly different is worse than no backup, because it
  // is only discovered once it has been restored over a live database.
  it('round-trips a dump exactly', () => {
    const restored = decryptArchive(
      encryptArchive(dump, PASSPHRASE),
      PASSPHRASE,
    )

    expect(restored.equals(dump)).toBe(true)
    expect(gunzipSync(restored).toString()).toContain('CREATE TABLE members')
  })

  it('round-trips an empty archive', () => {
    const empty = Buffer.alloc(0)

    expect(
      decryptArchive(encryptArchive(empty, PASSPHRASE), PASSPHRASE).equals(
        empty,
      ),
    ).toBe(true)
  })

  it('round-trips an archive larger than one cipher block', () => {
    const large = gzipSync(Buffer.from('x'.repeat(500_000)))

    expect(
      decryptArchive(encryptArchive(large, PASSPHRASE), PASSPHRASE).equals(
        large,
      ),
    ).toBe(true)
  })

  it('does not leave the plaintext in the envelope', () => {
    const envelope = encryptArchive(
      gzipSync(Buffer.from('stripe_customer_id')),
      PASSPHRASE,
    )

    expect(envelope.includes(Buffer.from('stripe_customer_id'))).toBe(false)
  })

  // A fresh salt and IV per run, so two nights of the same database do not
  // produce comparable ciphertext.
  it('produces a different envelope every time', () => {
    const first = encryptArchive(dump, PASSPHRASE)
    const second = encryptArchive(dump, PASSPHRASE)

    expect(first.equals(second)).toBe(false)
    expect(decryptArchive(second, PASSPHRASE).equals(dump)).toBe(true)
  })

  it('refuses the wrong passphrase', () => {
    expect(() =>
      decryptArchive(encryptArchive(dump, PASSPHRASE), 'a different one'),
    ).toThrow(/Could not decrypt/)
  })

  // Anyone who can write to the bucket can replace an object. Without the
  // authentication tag a restore would feed whatever they left behind straight
  // into psql, which is a far worse outcome than a failed restore.
  it('refuses an archive that was altered in the bucket', () => {
    const envelope = encryptArchive(dump, PASSPHRASE)
    envelope[envelope.length - 1] ^= 0xff

    expect(() => decryptArchive(envelope, PASSPHRASE)).toThrow(
      /Could not decrypt/,
    )
  })

  it('refuses an envelope whose header was tampered with', () => {
    const envelope = encryptArchive(dump, PASSPHRASE)
    // Flip a bit in the salt, which changes the derived key.
    envelope[ENCRYPTED_MAGIC.length] ^= 0x01

    expect(() => decryptArchive(envelope, PASSPHRASE)).toThrow(
      /Could not decrypt/,
    )
  })

  it('says so plainly when asked to decrypt a plain gzip dump', () => {
    expect(() => decryptArchive(dump, PASSPHRASE)).toThrow(/not encrypted/)
  })
})

describe('isEncryptedArchive', () => {
  it('recognises an envelope', () => {
    expect(isEncryptedArchive(encryptArchive(dump, PASSPHRASE))).toBe(true)
  })

  // The transition case: backups taken before this existed must still restore.
  it('does not mistake a legacy gzip dump for one', () => {
    expect(isEncryptedArchive(dump)).toBe(false)
  })

  it('handles a buffer shorter than the header without throwing', () => {
    expect(isEncryptedArchive(Buffer.from('BEA'))).toBe(false)
    expect(isEncryptedArchive(Buffer.alloc(0))).toBe(false)
  })
})

describe('resolveBackupPassphrase', () => {
  // Unset means unencrypted rather than a hard failure: the nightly job runs
  // unattended, and turning "readable by whoever holds the storage credential"
  // into "no backups at all" would be a straight downgrade.
  it('returns null when no key is configured', () => {
    expect(resolveBackupPassphrase({})).toBeNull()
    expect(resolveBackupPassphrase({ BACKUP_ENCRYPTION_KEY: '   ' })).toBeNull()
  })

  it('returns a configured key', () => {
    expect(
      resolveBackupPassphrase({ BACKUP_ENCRYPTION_KEY: ` ${PASSPHRASE} ` }),
    ).toBe(PASSPHRASE)
  })

  it('refuses a passphrase short enough to guess', () => {
    expect(() =>
      resolveBackupPassphrase({
        BACKUP_ENCRYPTION_KEY: 'x'.repeat(MIN_PASSPHRASE_LENGTH - 1),
      }),
    ).toThrow(/at least/)
  })
})
