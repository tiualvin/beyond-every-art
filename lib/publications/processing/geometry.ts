// Where something sits on a page, in the terms the reader draws in.
//
// A PDF places things in points from the bottom-left corner of the page's
// boxes, before the page's own rotation is applied. The reader draws a page as
// an image of its crop box, rotated as a viewer would show it, at whatever size
// the screen allows. So every position processing stores — a word, a link, and
// later a hotspot — is converted once, here, to fractions of the displayed page
// measured from its top-left corner (`docs/PUBLICATION_SYSTEM.md`,
// "Coordinates"), and stays correct at every display size.

/** `[x1, y1, x2, y2]` in PDF user space: points, origin bottom-left. */
export type PdfRect = [number, number, number, number]

/** Fractions of the displayed page, origin top-left, each between 0 and 1. */
export type Bounds = { x: number; y: number; width: number; height: number }

/** A page's clockwise rotation as displayed: `/Rotate`, normalised. */
export type Rotation = 0 | 90 | 180 | 270

export function toRotation(value: number): Rotation {
  const turned = ((value % 360) + 360) % 360
  if (!Number.isInteger(turned) || turned % 90 !== 0) {
    throw new Error(`A page rotation is a multiple of 90; got ${value}.`)
  }
  return turned as Rotation
}

/** The page as displayed: the crop box's size, turned by its rotation. */
export function displayedSize(
  box: PdfRect,
  rotation: Rotation,
): { width: number; height: number } {
  const width = Math.abs(box[2] - box[0])
  const height = Math.abs(box[3] - box[1])
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

// Four decimal places is a tenth of a pixel on a 1,000-pixel page, and keeps a
// page of word positions from carrying sixteen digits per number.
const round = (value: number) => Math.round(value * 10_000) / 10_000

/**
 * Converts a rectangle in PDF user space to bounds on the displayed page.
 *
 * Returns null for a rectangle with no area once clipped to the crop box — a
 * link drawn in the bleed, say — because nothing a reader sees could carry it.
 */
export function normalizeRect(
  rect: PdfRect,
  box: PdfRect,
  rotation: Rotation,
): Bounds | null {
  const left = Math.min(box[0], box[2])
  const bottom = Math.min(box[1], box[3])
  const width = Math.abs(box[2] - box[0])
  const height = Math.abs(box[3] - box[1])
  if (width === 0 || height === 0) return null

  // Unrotated, from the top-left: u across, v down.
  const corners = [
    [rect[0], rect[1]],
    [rect[2], rect[3]],
  ].map(([x, y]) => {
    const u = clamp((x! - left) / width)
    const v = clamp((bottom + height - y!) / height)
    switch (rotation) {
      case 0:
        return [u, v]
      case 90:
        return [1 - v, u]
      case 180:
        return [1 - u, 1 - v]
      case 270:
        return [v, 1 - u]
    }
  })
  const xs = corners.map((point) => point[0]!)
  const ys = corners.map((point) => point[1]!)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(...xs) - x
  const h = Math.max(...ys) - y
  if (w <= 0 || h <= 0) return null
  return { x: round(x), y: round(y), width: round(w), height: round(h) }
}

/**
 * Bounds from a rectangle already in display space — what `pdftotext
 * -bbox-layout` reports — given the displayed page's size in the same units.
 */
export function normalizeDisplayRect(
  rect: { xMin: number; yMin: number; xMax: number; yMax: number },
  page: { width: number; height: number },
): Bounds | null {
  if (page.width <= 0 || page.height <= 0) return null
  const x = clamp(rect.xMin / page.width)
  const y = clamp(rect.yMin / page.height)
  const w = clamp(rect.xMax / page.width) - x
  const h = clamp(rect.yMax / page.height) - y
  if (w <= 0 || h <= 0) return null
  return { x: round(x), y: round(y), width: round(w), height: round(h) }
}
