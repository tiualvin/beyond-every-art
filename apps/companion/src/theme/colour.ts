// Colour arithmetic for the palettes: mixing in sRGB the way CSS
// `color-mix(in srgb, …)` does, and WCAG 2 contrast.

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`)
  const digits = match[1]!
  return [0, 2, 4].map((at) =>
    Number.parseInt(digits.slice(at, at + 2), 16),
  ) as Rgb
}

const toHex = (rgb: Rgb) =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`

/** `weight` of `a`, the rest of `b`: `color-mix(in srgb, a weight%, b)`. */
export function mix(a: string, b: string, weight: number): string {
  const first = hexToRgb(a)
  const second = hexToRgb(b)
  return toHex(
    first.map(
      (channel, index) => channel * weight + second[index]! * (1 - weight),
    ) as Rgb,
  )
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) return [0, 0, lightness]
  const delta = max - min
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === red
      ? ((green - blue) / delta + 6) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4
  return [hue * 60, saturation, lightness]
}

function hslToRgb([hue, saturation, lightness]: [number, number, number]): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - chroma / 2
  const sector = Math.floor(hue / 60) % 6
  const [r, g, b] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector]!
  return [(r! + m) * 255, (g! + m) * 255, (b! + m) * 255]
}

/**
 * The same hue at another lightness and saturation. Mixing a dark colour
 * toward a light one lightens it by draining its hue — burgundy mixed into
 * paper comes out a dusty mauve — so a colour that has to read on a dark page
 * is lifted this way instead, and stays recognisably itself.
 */
export function tone(
  hex: string,
  lightness: number,
  saturation: number,
): string {
  const [hue] = rgbToHsl(hexToRgb(hex))
  return toHex(hslToRgb([hue, saturation, lightness]))
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Ink or paper, whichever reads better on `background`. */
export function readableOn(
  background: string,
  light: string,
  dark: string,
): string {
  return contrastRatio(light, background) >= contrastRatio(dark, background)
    ? light
    : dark
}
