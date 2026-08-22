// Recovering media whose records outlived their files.
//
// The two decisions here both protect something that is hard to notice going
// wrong: which rows can actually be refetched, and whether what came back is an
// image at all. Getting the second one wrong replaces a missing file with a
// corrupt one, which looks healthy in every listing and every count.

import { describe, expect, it } from 'vitest'

import {
  buildLocalIndex,
  findLocalFile,
  isUsableDownload,
  planRestore,
  urlPath,
} from '../../lib/media/restore'

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

describe('restoring from an extracted Ghost archive', () => {
  const index = buildLocalIndex([
    {
      relativePath: '/content/images/2024/02/corridor.jpg',
      absolutePath: '/archive/content/images/2024/02/corridor.jpg',
    },
    {
      relativePath: '/content/images/2023/05/corridor.jpg',
      absolutePath: '/archive/content/images/2023/05/corridor.jpg',
    },
    {
      relativePath: '/content/images/2024/02/gallery.jpg',
      absolutePath: '/archive/content/images/2024/02/gallery.jpg',
    },
  ])

  it('matches on the full path, which is unambiguous', () => {
    expect(
      findLocalFile(
        index,
        'https://old.example/content/images/2024/02/corridor.jpg',
      ),
    ).toEqual({ path: '/archive/content/images/2024/02/corridor.jpg' })
  })

  // Ghost namespaces uploads by year and month, so the same name legitimately
  // appears twice. Guessing would put the wrong photograph on a published page.
  it('refuses to guess when a name appears more than once', () => {
    const flat = buildLocalIndex([
      { relativePath: '/a/corridor.jpg', absolutePath: '/x/a/corridor.jpg' },
      { relativePath: '/b/corridor.jpg', absolutePath: '/x/b/corridor.jpg' },
    ])

    const result = findLocalFile(
      flat,
      'https://old.example/images/corridor.jpg',
    )

    expect(result).toMatchObject({ reason: expect.stringContaining('2 times') })
  })

  // The forgiving case: an operator points at `content/images` instead of the
  // archive root, so the stored path cannot match but the name still can.
  it('falls back to a unique file name when the path does not line up', () => {
    const nested = buildLocalIndex([
      {
        relativePath: '/2024/02/gallery.jpg',
        absolutePath: '/x/2024/02/gallery.jpg',
      },
    ])

    expect(
      findLocalFile(
        nested,
        'https://old.example/content/images/2024/02/gallery.jpg',
      ),
    ).toEqual({ path: '/x/2024/02/gallery.jpg' })
  })

  it('says what it looked for when the archive does not have it', () => {
    const result = findLocalFile(
      index,
      'https://old.example/content/images/gone.jpg',
    )

    expect(result).toMatchObject({
      reason: expect.stringContaining('/content/images/gone.jpg'),
    })
  })
})

describe('urlPath', () => {
  it('reads the path out of an absolute URL', () => {
    expect(urlPath('https://old.example/content/images/a/b.jpg')).toBe(
      '/content/images/a/b.jpg',
    )
  })

  it('handles the placeholder form the export uses', () => {
    expect(urlPath('__GHOST_URL__/content/images/a/b.jpg')).toBe(
      '/content/images/a/b.jpg',
    )
  })

  it('drops a query string, which is not part of the stored file', () => {
    expect(urlPath('https://old.example/img/a.jpg?w=600')).toBe('/img/a.jpg')
  })
})
