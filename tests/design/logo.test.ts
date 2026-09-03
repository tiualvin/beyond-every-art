// The committed icons, checked against the drawing they were rendered from.
//
// The mark exists twice by necessity: inline in the masthead, where it is a
// React component, and as the files in `app/` that Next turns into the
// document's icon links. Only the first of those is imported from
// `lib/design/logo.ts` at runtime — the others are build artefacts of
// `pnpm build:icons`, so nothing stops the module changing and the tab icon
// staying as it was. That is the drift this file exists to catch: `icon.svg` is
// text, so it is compared outright, and the two rasters are checked for the
// shape a client expects to find rather than for their pixels.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { logoIconSvg } from '@/lib/design/logo'

const app = resolve(import.meta.dirname, '../../app')

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

describe('app/icon.svg', () => {
  it('is what lib/design/logo.ts renders', () => {
    const committed = readFileSync(resolve(app, 'icon.svg'), 'utf8')
    expect(committed, 'app/icon.svg is stale — run `pnpm build:icons`').toBe(
      logoIconSvg(),
    )
  })
})

describe('app/apple-icon.png', () => {
  const png = readFileSync(resolve(app, 'apple-icon.png'))

  it('is a PNG', () => {
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
  })

  it('is 180×180, the size iOS asks for', () => {
    // IHDR is always the first chunk: 8 bytes of signature, then length and
    // type, then the dimensions.
    expect(png.readUInt32BE(16)).toBe(180)
    expect(png.readUInt32BE(20)).toBe(180)
  })

  it('is opaque, because iOS composites a transparent touch icon onto black', () => {
    // Colour type 2 is RGB and 6 is RGBA — there is no alpha channel to be
    // transparent in, which is what flattening the render onto the paper
    // colour is for. Dropping that step leaves a type 6 file whose corners are
    // empty, and the icon turns up on a home screen as a mark floating on
    // black.
    expect(png.readUInt8(25)).toBe(2)
  })
})

describe('app/favicon.ico', () => {
  const ico = readFileSync(resolve(app, 'favicon.ico'))

  it('is an icon directory of PNGs at 16, 32 and 48', () => {
    expect(ico.readUInt16LE(0)).toBe(0) // reserved
    expect(ico.readUInt16LE(2)).toBe(1) // 1 = icon, 2 = cursor

    const count = ico.readUInt16LE(4)
    const sizes: number[] = []

    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16
      const width = ico.readUInt8(entry)
      const height = ico.readUInt8(entry + 1)
      expect(width).toBe(height)
      sizes.push(width)

      // Every entry has to point at real image data inside the file, or the
      // icon is one a browser silently drops.
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)
      expect(offset + length).toBeLessThanOrEqual(ico.byteLength)
      expect(ico.subarray(offset, offset + 8).equals(PNG_SIGNATURE)).toBe(true)
    }

    expect(sizes).toEqual([16, 32, 48])
  })
})
