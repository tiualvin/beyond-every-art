// The two decisions a media backfill has to get right: which derivatives are
// actually missing, and where to read the original from.
//
// Both are worth pinning because getting either wrong is expensive in a way
// that does not announce itself. Over-report, and every rerun re-uploads images
// to produce a derivative Payload was never going to make. Mis-locate the
// original, and the run either fails or — worse, before
// `overwriteExistingFiles` — stores a renamed copy and changes a live URL.

import { describe, expect, it } from 'vitest'

import { Media } from '../../collections/Media'
import {
  expectsSize,
  missingSizes,
  planBackfill,
  sourceFor,
  type DeclaredSize,
  type MediaDoc,
} from '../../lib/media/backfill'

const CARD: DeclaredSize = {
  name: 'card',
  width: 768,
  withoutEnlargement: true,
}
const OG: DeclaredSize = { name: 'og', width: 1200, height: 630 }

const doc = (over: Partial<MediaDoc> = {}): MediaDoc => ({
  id: 1,
  filename: 'studio-corridor.jpg',
  url: '/api/media/file/studio-corridor.jpg',
  width: 2000,
  height: 1400,
  sizes: {},
  ...over,
})

describe('expectsSize', () => {
  // Payload's rule, from `getImageResizeAction`: with `withoutEnlargement`
  // unset, a target carrying both a width and a height is skipped when the
  // source is smaller than both.
  it('does not expect a two-dimension size the source is smaller than', () => {
    expect(expectsSize(doc({ width: 400, height: 300 }), OG)).toBe(false)
  })

  it('expects it when the source exceeds either dimension', () => {
    expect(expectsSize(doc({ width: 1400, height: 400 }), OG)).toBe(true)
    expect(expectsSize(doc({ width: 800, height: 900 }), OG)).toBe(true)
  })

  // `card` sets `withoutEnlargement: true`, which means "give me the original
  // back rather than nothing" — so a small image still gets a derivative.
  it('always expects a size that sets withoutEnlargement', () => {
    expect(expectsSize(doc({ width: 100, height: 100 }), CARD)).toBe(true)
  })

  it('applies the single-dimension rule when only one is declared', () => {
    const widthOnly: DeclaredSize = { name: 'wide', width: 1000 }

    expect(expectsSize(doc({ width: 500, height: 5000 }), widthOnly)).toBe(
      false,
    )
    expect(expectsSize(doc({ width: 1200, height: 100 }), widthOnly)).toBe(true)
  })

  // A non-image, or a record written before dimensions were stored. Guessing
  // "not wanted" would silently skip it forever; let the regeneration decide.
  it('expects the size when the dimensions are unknown', () => {
    expect(expectsSize(doc({ width: null, height: undefined }), OG)).toBe(true)
  })
})

describe('missingSizes', () => {
  // Payload writes the `sizes.og` object either way and leaves its columns
  // null, so "the key exists" proves nothing — this is the case that made a
  // naive check find no work to do at all.
  it('treats a size object with no filename as missing', () => {
    expect(
      missingSizes(doc({ sizes: { og: { filename: null } } }), [OG]),
    ).toEqual(['og'])
    expect(missingSizes(doc({ sizes: {} }), [OG])).toEqual(['og'])
  })

  it('treats a generated size as present', () => {
    const generated = { sizes: { og: { filename: 'corridor-1200x630.jpg' } } }

    expect(missingSizes(doc(generated), [OG])).toEqual([])
  })

  // The whole point of `expectsSize`: without this the same small image is
  // re-uploaded on every run, forever, producing the same nothing.
  it('never reports a size the source is too small for', () => {
    const small = doc({ width: 400, height: 300, sizes: {} })

    expect(missingSizes(small, [CARD, OG])).toEqual(['card'])
  })
})

describe('sourceFor', () => {
  it('prefers the local original, which needs no server', () => {
    expect(sourceFor(doc(), { staticDir: '/srv/media' })).toEqual({
      kind: 'file',
      path: '/srv/media/studio-corridor.jpg',
    })
  })

  it('uses an absolute URL when storage is remote', () => {
    const remote = doc({ url: 'https://cdn.example/corridor.jpg' })

    expect(sourceFor(remote)).toEqual({
      kind: 'url',
      url: 'https://cdn.example/corridor.jpg',
    })
  })

  it('resolves a root-relative URL against the given origin', () => {
    expect(sourceFor(doc(), { baseUrl: 'https://beyondeveryart.com' })).toEqual(
      {
        kind: 'url',
        url: 'https://beyondeveryart.com/api/media/file/studio-corridor.jpg',
      },
    )
  })

  // Reported rather than thrown: a document whose file cannot be located is a
  // finding for the report — usually storage and database having drifted —
  // and one of them must not abandon the rest of the run.
  it('reports why it cannot locate an original instead of throwing', () => {
    expect(sourceFor(doc())).toMatchObject({ kind: 'unavailable' })
    expect(sourceFor(doc({ filename: '' }))).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('no filename'),
    })
  })

  it('refuses a filename that would climb out of the media directory', () => {
    const escaping = doc({ filename: '../../etc/passwd' })

    expect(sourceFor(escaping, { staticDir: '/srv/media' })).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('unsafe filename'),
    })
  })
})

describe('planBackfill', () => {
  it('returns only the documents with work to do', () => {
    const docs = [
      doc({ id: 1, sizes: {} }),
      doc({ id: 2, sizes: { og: { filename: 'a-1200x630.jpg' } } }),
      doc({ id: 3, width: 400, height: 300, sizes: {} }),
    ]

    expect(planBackfill(docs, [OG])).toEqual([
      { id: 1, filename: 'studio-corridor.jpg', missing: ['og'] },
    ])
  })
})

// The rules above are only correct while the collection keeps declaring sizes
// the way it does. `og` in particular relies on `withoutEnlargement` being
// unset — set it, and small images start getting an upscaled derivative and
// this module's idea of "not expected" goes stale without failing anywhere.
describe('the sizes Media actually declares', () => {
  it('still matches what the backfill rules assume', () => {
    const upload = Media.upload
    const sizes = typeof upload === 'object' ? upload.imageSizes : undefined

    expect(sizes).toEqual([
      { name: 'card', width: 768, withoutEnlargement: true },
      { name: 'og', width: 1200, height: 630 },
    ])
  })
})
