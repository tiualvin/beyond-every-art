import { describe, expect, it } from 'vitest'

import {
  displayedSize,
  normalizeDisplayRect,
  normalizeRect,
  toRotation,
  type PdfRect,
} from '../../../lib/publications/processing/geometry'

const A4: PdfRect = [0, 0, 595, 842]
// A link around the top-left corner region: 10% in, 10% down, a fifth wide.
const NEAR_TOP_LEFT: PdfRect = [59.5, 673.6, 178.5, 757.8]

describe('toRotation', () => {
  it('normalises any multiple of 90 to a quarter turn', () => {
    expect(toRotation(0)).toBe(0)
    expect(toRotation(450)).toBe(90)
    expect(toRotation(-90)).toBe(270)
    expect(toRotation(-180)).toBe(180)
  })

  it('refuses a rotation a PDF cannot have', () => {
    expect(() => toRotation(45)).toThrow(/multiple of 90/)
    expect(() => toRotation(Number.NaN)).toThrow(/multiple of 90/)
  })
})

describe('displayedSize', () => {
  it('swaps width and height for a quarter turn', () => {
    expect(displayedSize(A4, 0)).toEqual({ width: 595, height: 842 })
    expect(displayedSize(A4, 90)).toEqual({ width: 842, height: 595 })
    expect(displayedSize(A4, 180)).toEqual({ width: 595, height: 842 })
    expect(displayedSize(A4, 270)).toEqual({ width: 842, height: 595 })
  })
})

describe('normalizeRect', () => {
  it('measures from the top-left of the page, as the reader draws it', () => {
    expect(normalizeRect(NEAR_TOP_LEFT, A4, 0)).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.1,
    })
  })

  it('follows the page when a viewer turns it', () => {
    // Turned clockwise, the top-left of the page ends up at the top-right.
    expect(normalizeRect(NEAR_TOP_LEFT, A4, 90)).toEqual({
      x: 0.8,
      y: 0.1,
      width: 0.1,
      height: 0.2,
    })
    expect(normalizeRect(NEAR_TOP_LEFT, A4, 180)).toEqual({
      x: 0.7,
      y: 0.8,
      width: 0.2,
      height: 0.1,
    })
    expect(normalizeRect(NEAR_TOP_LEFT, A4, 270)).toEqual({
      x: 0.1,
      y: 0.7,
      width: 0.1,
      height: 0.2,
    })
  })

  it('measures within the crop box, not the media box', () => {
    // The same link on a page with 20 points of bleed on every side.
    const cropped: PdfRect = [20, 20, 575, 822]
    const bounds = normalizeRect(NEAR_TOP_LEFT, cropped, 0)!
    expect(bounds.x).toBeCloseTo((59.5 - 20) / 555, 4)
    expect(bounds.y).toBeCloseTo((822 - 757.8) / 802, 4)
  })

  it('accepts a rectangle given corner-first in either order', () => {
    const flipped: PdfRect = [178.5, 757.8, 59.5, 673.6]
    expect(normalizeRect(flipped, A4, 0)).toEqual(
      normalizeRect(NEAR_TOP_LEFT, A4, 0),
    )
  })

  it('clips to the page, and drops what lies wholly outside it', () => {
    expect(normalizeRect([-100, 800, 100, 900], A4, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0.1681,
      height: 0.0499,
    })
    // A link drawn in the bleed: nothing a reader sees could carry it.
    expect(normalizeRect([-50, 0, -10, 40], A4, 0)).toBeNull()
  })

  it('refuses a page with no area', () => {
    expect(normalizeRect(NEAR_TOP_LEFT, [0, 0, 0, 842], 0)).toBeNull()
  })
})

describe('normalizeDisplayRect', () => {
  it('divides by the displayed size and rounds to four places', () => {
    expect(
      normalizeDisplayRect(
        { xMin: 72, yMin: 54.768, xMax: 153.36, yMax: 76.968 },
        { width: 595, height: 842 },
      ),
    ).toEqual({ x: 0.121, y: 0.065, width: 0.1367, height: 0.0264 })
  })

  it('drops a rectangle with no area', () => {
    expect(
      normalizeDisplayRect(
        { xMin: 10, yMin: 10, xMax: 10, yMax: 20 },
        { width: 595, height: 842 },
      ),
    ).toBeNull()
  })
})
