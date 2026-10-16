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
