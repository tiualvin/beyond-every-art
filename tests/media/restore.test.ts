// Recovering media whose records outlived their files.
//
// The two decisions here both protect something that is hard to notice going
// wrong: which rows can actually be refetched, and whether what came back is an
// image at all. Getting the second one wrong replaces a missing file with a
// corrupt one, which looks healthy in every listing and every count.

import { describe, expect, it } from 'vitest'

import { isUsableDownload, planRestore } from '../../lib/media/restore'

const migrated = {
  id: 7,
  filename: 'corridor.jpg',
  mimeType: 'image/jpeg',
  ghostURL: 'https://old.example/content/images/2024/02/corridor.jpg',
}

describe('planRestore', () => {
  it('plans a refetch for a migrated file', () => {
    const { plans, skipped } = planRestore([migrated])

    expect(skipped).toEqual([])
    expect(plans).toEqual([
      {
        id: 7,
        filename: 'corridor.jpg',
        ghostURL: 'https://old.example/content/images/2024/02/corridor.jpg',
        mimeType: 'image/jpeg',
      },
    ])
  })

  // A file uploaded through the admin panel has no Ghost URL, so the old site
  // has nothing to give back. Reporting it is the point: the operator needs to
  // know those are the ones only a backup can recover.
  it('reports a file that never came from Ghost instead of dropping it', () => {
    const { plans, skipped } = planRestore([
      { id: 8, filename: 'studio.jpg', mimeType: 'image/jpeg' },
    ])

    expect(plans).toEqual([])
    expect(skipped).toEqual([
      { id: 8, reason: expect.stringContaining('no ghostURL') },
    ])
  })

  it('refuses a filename that would write outside the media directory', () => {
    const { plans, skipped } = planRestore([
      { ...migrated, id: 9, filename: '../../etc/passwd' },
    ])

    expect(plans).toEqual([])
    expect(skipped[0]?.reason).toContain('unsafe filename')
  })

  it('falls back to a generic type when the row does not record one', () => {
    const { plans } = planRestore([{ ...migrated, mimeType: undefined }])

    expect(plans[0]?.mimeType).toBe('application/octet-stream')
  })

  it('keeps the restorable ones when some rows cannot be restored', () => {
    const { plans, skipped } = planRestore([
      migrated,
      { id: 8, filename: 'studio.jpg' },
      { ...migrated, id: 10, filename: 'gallery.jpg' },
    ])

    expect(plans.map((p) => p.id)).toEqual([7, 10])
    expect(skipped.map((s) => s.id)).toEqual([8])
  })
})

describe('isUsableDownload', () => {
  it('accepts an image', () => {
    expect(isUsableDownload('image/jpeg', 40_000)).toBe(true)
    expect(isUsableDownload('image/webp; charset=binary', 40_000)).toBe(true)
  })

  // The failure this exists for: a reconfigured source answering a missing
  // image with 200 and an HTML error page. Storing that is worse than storing
  // nothing, because the record then looks fine.
  it('refuses an error page served with a 200', () => {
    const verdict = isUsableDownload('text/html; charset=utf-8', 4_000)

    expect(verdict).not.toBe(true)
    expect(verdict).toContain('not an image')
  })

  it('refuses a response too small to be a picture', () => {
    expect(isUsableDownload('image/jpeg', 12)).not.toBe(true)
  })

  // Some origins send images with no content type at all. Size is the only
  // signal left, and refusing on the missing header would fail real files.
  it('allows a missing content type through on size alone', () => {
    expect(isUsableDownload(null, 40_000)).toBe(true)
    expect(isUsableDownload(undefined, 40_000)).toBe(true)
  })
})
