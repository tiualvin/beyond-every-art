// Writes the site's icons from the one drawing in `lib/design/logo.ts`.
//
//   app/icon.svg        the favicon proper — vector, so it is sharp at any tab
//                       size and at any display density
//   app/apple-icon.png  180×180, for an iOS home screen. Opaque, because iOS
//                       composites a transparent touch icon onto black
//   app/favicon.ico     16/32/48, for the clients that ask for `/favicon.ico`
//                       without reading the document first — which includes
//                       Google's indexer and every older browser
//
// They live in `app/` rather than `public/`: these are Next's metadata file
// conventions, so the framework emits the `<link>` tags and, unlike `public/`,
// they are inside the standalone bundle the Dockerfile copies. See the note at
// the top of `lib/design/logo.ts`.
//
// Run with `pnpm build:icons` after changing the mark. `tests/design/logo.test.ts`
// fails if `app/icon.svg` and the module have parted company, and checks that
// the two rasters are still the sizes described above.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import sharp from 'sharp'

import { logoIconSvg } from '../lib/design/logo'

const root = resolve(import.meta.dirname, '..')

/** The paper the site is printed on, behind the touch icon. */
const APPLE_ICON_BACKGROUND = '#fffdf9'

/** Sizes inside `favicon.ico`, largest last so the directory reads in order. */
const ICO_SIZES = [16, 32, 48]

/**
 * An ICO file wrapping PNGs rather than the format's own bitmaps. Every browser
 * that still asks for a `.ico` reads PNG-in-ICO, and it keeps the alpha channel
 * that a 24-bit DIB would have to fake with a mask.
 */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const HEADER = 6
  const ENTRY = 16

  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = HEADER + ENTRY * images.length
  const entries: Buffer[] = []

  for (const { size, png } of images) {
    const entry = Buffer.alloc(ENTRY)
    // 0 stands for 256 in a single byte; nothing here is that big, but the
    // encoding is the format's, not ours.
    entry.writeUInt8(size === 256 ? 0 : size, 0)
    entry.writeUInt8(size === 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette size — none, it is truecolour
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.byteLength, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.byteLength
  }

  return Buffer.concat([
    header,
    ...entries,
    ...images.map((image) => image.png),
  ])
}

/**
 * Rasterises the mark at one size. `background` flattens the alpha channel away
 * rather than painting behind it: iOS composites a transparent touch icon onto
 * black, so the paper has to be in the pixels.
 */
async function render(size: number, background?: string): Promise<Buffer> {
  const svg = sharp(Buffer.from(logoIconSvg({ size })))
  return (background ? svg.flatten({ background }) : svg)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main(): Promise<void> {
  const svg = logoIconSvg()
  writeFileSync(resolve(root, 'app/icon.svg'), svg)

  const apple = await render(180, APPLE_ICON_BACKGROUND)
  writeFileSync(resolve(root, 'app/apple-icon.png'), apple)

  const ico = buildIco(
    await Promise.all(
      ICO_SIZES.map(async (size) => ({ size, png: await render(size) })),
    ),
  )
  writeFileSync(resolve(root, 'app/favicon.ico'), ico)

  console.log(
    `Wrote app/icon.svg, app/apple-icon.png (180×180) and app/favicon.ico (${ICO_SIZES.join('/')}).`,
  )
}

await main()
