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
  // The shape of a real Ghost site archive, including the derivative folders
  // that reuse the originals' file names — the reason a name alone is never
  // enough to identify a file here.
  const archive = buildLocalIndex([
    {
      relativePath: '/content/images/2026/02/corridor.jpg',
      absolutePath: '/a/content/images/2026/02/corridor.jpg',
    },
    {
      relativePath: '/content/images/size/w600/2026/02/corridor.jpg',
      absolutePath: '/a/content/images/size/w600/2026/02/corridor.jpg',
    },
    {
      relativePath: '/content/images/thumbnail/2026/02/corridor.jpg',
      absolutePath: '/a/content/images/thumbnail/2026/02/corridor.jpg',
    },
    {
      relativePath: '/content/images/2025/11/gallery.jpg',
      absolutePath: '/a/content/images/2025/11/gallery.jpg',
    },
  ])

  it("finds the original, not one of Ghost's own derivatives", () => {
    expect(
      findLocalFile(
        archive,
        'https://beyondeveryart.com/content/images/2026/02/corridor.jpg',
      ),
    ).toEqual({ path: '/a/content/images/2026/02/corridor.jpg' })
  })

  // Pointing at `content/images` rather than the archive root is a reasonable
  // thing to do, and full-path matching alone would find nothing.
  it('works when the directory is rooted deeper than the URL path', () => {
    const rootedAtImages = buildLocalIndex([
      {
        relativePath: '/2026/02/corridor.jpg',
        absolutePath: '/i/2026/02/corridor.jpg',
      },
      {
        relativePath: '/size/w600/2026/02/corridor.jpg',
        absolutePath: '/i/size/w600/2026/02/corridor.jpg',
      },
    ])

    expect(
      findLocalFile(
        rootedAtImages,
        'https://beyondeveryart.com/content/images/2026/02/corridor.jpg',
      ),
    ).toEqual({ path: '/i/2026/02/corridor.jpg' })
  })

  it('handles the placeholder URL form the export writes', () => {
    expect(
      findLocalFile(
        archive,
        '__GHOST_URL__/content/images/2025/11/gallery.jpg',
      ),
    ).toEqual({ path: '/a/content/images/2025/11/gallery.jpg' })
  })

  // Two uploads in different months can share a name. Guessing would put the
  // wrong photograph on a published page.
  it('refuses to guess when the path genuinely cannot distinguish them', () => {
    const ambiguous = buildLocalIndex([
      { relativePath: '/a/photo.jpg', absolutePath: '/x/a/photo.jpg' },
      { relativePath: '/b/photo.jpg', absolutePath: '/x/b/photo.jpg' },
    ])

    const result = findLocalFile(ambiguous, 'https://old.example/img/photo.jpg')

    expect(result).toMatchObject({
      reason: expect.stringContaining('matches 2 files'),
    })
  })

  it('says what it looked for when the archive does not have it', () => {
    const result = findLocalFile(
      archive,
      'https://beyondeveryart.com/content/images/2026/02/gone.jpg',
    )

    expect(result).toMatchObject({
      reason: expect.stringContaining('/content/images/2026/02/gone.jpg'),
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
