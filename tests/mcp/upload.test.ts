import { describe, expect, it } from 'vitest'

import {
  decodeImageUpload,
  MAX_UPLOAD_BYTES,
  safeUploadName,
} from '../../lib/mcp/upload'

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0]
const WEBP_HEADER = [
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]

/** A file of `size` bytes that starts with the given signature. */
function file(signature: number[], size = signature.length): string {
  const bytes = Buffer.alloc(size)
  Buffer.from(signature).copy(bytes)
  return bytes.toString('base64')
}

describe('safeUploadName', () => {
  it('keeps a reasonable name and forces the real extension', () => {
    expect(safeUploadName('Ultramarine Plate.jpeg', 'png')).toBe(
      'ultramarine-plate.png',
    )
  })

  it('cannot climb out of the media directory', () => {
    expect(safeUploadName('../../etc/passwd', 'png')).toBe('passwd.png')
    expect(safeUploadName('/absolute/path/x.png', 'png')).toBe('x.png')
    expect(safeUploadName('..\\..\\windows\\thing', 'png')).toBe('thing.png')
  })

  it('falls back rather than producing a nameless file', () => {
    expect(safeUploadName('', 'webp')).toBe('image.webp')
    expect(safeUploadName('!!!', 'webp')).toBe('image.webp')
    expect(safeUploadName(undefined, 'jpg')).toBe('image.jpg')
  })

  it('bounds the length', () => {
    const name = safeUploadName('a'.repeat(500), 'png')
    expect(name.length).toBeLessThanOrEqual(84)
  })
})

describe('decodeImageUpload', () => {
  it('accepts the formats a generator emits', () => {
    expect(decodeImageUpload({ base64: file(PNG_HEADER) }).mimetype).toBe(
      'image/png',
    )
    expect(decodeImageUpload({ base64: file(JPEG_HEADER) }).mimetype).toBe(
      'image/jpeg',
    )
    expect(decodeImageUpload({ base64: file(WEBP_HEADER) }).mimetype).toBe(
      'image/webp',
    )
  })

  it('unwraps a data: URL and ignores wrapped whitespace', () => {
    const raw = file(PNG_HEADER, 64)
    const wrapped = `data:image/png;base64,${raw.slice(0, 8)}\n${raw.slice(8)}`

    expect(decodeImageUpload({ base64: wrapped }).size).toBe(64)
  })

  it('reads the format from the bytes, not from what the caller claims', () => {
    // A JPEG announced as a PNG is still stored as a JPEG.
    const upload = decodeImageUpload({
      base64: `data:image/png;base64,${file(JPEG_HEADER)}`,
      filename: 'claimed.png',
    })

    expect(upload.mimetype).toBe('image/jpeg')
    expect(upload.name).toBe('claimed.jpg')
  })

  it('refuses SVG, which can carry script', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ).toString('base64')

    expect(() => decodeImageUpload({ base64: svg })).toThrow(/Unrecognised/)
  })

  it('refuses anything that is not an image at all', () => {
    const html = Buffer.from('<!doctype html><h1>hi</h1>').toString('base64')
    expect(() => decodeImageUpload({ base64: html })).toThrow(/Unrecognised/)
  })

  it('refuses data that is not base64', () => {
    expect(() => decodeImageUpload({ base64: 'not base64 at all!' })).toThrow(
      /valid base64/,
    )
  })

  it('refuses an empty payload', () => {
    expect(() => decodeImageUpload({ base64: '' })).toThrow(/No image data/)
    expect(() =>
      decodeImageUpload({ base64: 'data:image/png;base64,' }),
    ).toThrow(/No image data/)
  })

  it('refuses a file over the size limit', () => {
    const tooBig = file(PNG_HEADER, MAX_UPLOAD_BYTES + 1024)
    expect(() => decodeImageUpload({ base64: tooBig })).toThrow(/larger than/)
  })

  it('reports the decoded size, which is what gets stored', () => {
    expect(decodeImageUpload({ base64: file(PNG_HEADER, 2048) }).size).toBe(
      2048,
    )
  })

  it('names the file from the alt text when no filename is given', () => {
    const upload = decodeImageUpload({
      base64: file(PNG_HEADER),
      filename: 'A washed plate of lapis lazuli',
    })

    expect(upload.name).toBe('a-washed-plate-of-lapis-lazuli.png')
  })
})
