'use client'

import { useEffect, useRef } from 'react'

import type { AppPlate as PlateKind } from '@/lib/content/queries'

// Stand-in artwork for an app that has no hero image yet.
//
// Not a screenshot and not a device frame: none of these apps has been
// designed, and a mocked interface would claim otherwise. Each plate is a
// drawing of what its app does, in the same pigments the rest of the site
// paints with — a claim the page can actually support.
//
// A shared wash would have been cheaper, but a colouring app, a journal and a
// game are not the same picture, and four identical rectangles say nothing.

const PIGMENTS = {
  ultramarine: { hex: '#1f3a93', deep: '#0f1f57' },
  sienna: { hex: '#8a3a1e', deep: '#4a1c0c' },
  viridian: { hex: '#2e6b52', deep: '#123227' },
  cadmium: { hex: '#c9820a', deep: '#6b4103' },
  bone: { hex: '#20211f', deep: '#000000' },
} as const

const PAPER = '#f6f2eb'
const SURFACE = '#fffdf9'
const INK = '#1b1714'
const BURGUNDY = '#6d1f2c'

type Random = () => number

/** Deterministic, so a plate looks the same on every render and machine. */
function rng(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Laid paper, so the drawings sit on a surface rather than on a colour. */
function paper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Random,
): void {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h)
  g.addColorStop(0, SURFACE)
  g.addColorStop(1, PAPER)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = r() > 0.5 ? rgba(INK, 0.05) : rgba('#ffffff', 0.5)
    ctx.fillRect(r() * w, r() * h, 1.4, 1.4)
  }
  ctx.restore()
}

/**
 * A wet-edged stroke: the pigment pools at the rim the way it does on damp
 * paper. The angle is passed in rather than random — a wash that ignores the
 * shape it is filling reads as a blob dropped onto a drawing.
 */
function wash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  angle: number,
  hex: string,
  alpha: number,
  r: Random,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (let i = 0; i < 4; i++) {
    const g = ctx.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      Math.max(rx, ry) * (1 + i * 0.06),
    )
    g.addColorStop(0, rgba(hex, alpha * 0.42))
    g.addColorStop(0.7, rgba(hex, alpha * 0.7))
    g.addColorStop(1, rgba(hex, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(
      x + (r() - 0.5) * rx * 0.14,
      y + (r() - 0.5) * ry * 0.14,
      rx * (0.92 + r() * 0.16),
      ry * (0.92 + r() * 0.16),
      angle + (r() - 0.5) * 0.16,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.restore()
}

/**
 * A page of the publication: drop cap, a measure of text, a specimen hanging
 * in the margin.
 *
 * Lines are broken into word-length runs rather than drawn as solid bars. A
 * bar per line is wireframe grammar and reads as an interface nobody has
 * built; runs with spaces between them read as set type.
 */
function plateReader(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Random,
): void {
  paper(ctx, w, h, r)

  const setLine = (
    x: number,
    y: number,
    len: number,
    size: number,
    alpha: number,
  ): void => {
    let at = x
    const right = x + len
    while (at < right) {
      let word = size * (1.4 + r() * 3.6)
      if (at + word > right) word = right - at
      if (word < size * 0.5) break
      ctx.fillStyle = rgba(INK, alpha * (0.85 + r() * 0.3))
      ctx.fillRect(at, y, word, size)
      at += word + size * (0.7 + r() * 0.35)
    }
  }

  const m = w * 0.13
  const col = w - m * 2
  let y = h * 0.115

  ctx.fillStyle = rgba(BURGUNDY, 0.8)
  ctx.fillRect(m, y, col * 0.3, Math.max(1, h * 0.004))
  y += h * 0.05

  const head = Math.max(2, h * 0.016)
  setLine(m, y, col * 0.9, head, 0.82)
  setLine(m, y + h * 0.032, col * 0.55, head, 0.82)
  y += h * 0.075

  setLine(m, y, col * 0.3, Math.max(1, h * 0.006), 0.34)
  y += h * 0.042

  const fw = w * 0.3
  const fx = m + col - fw
  const fy = h * 0.55
  const figure = {
    x: fx - fw * 0.07,
    y: fy - fw * 0.07,
    w: fw * 1.14,
    h: fw * 1.36,
  }

  const size = Math.max(1, h * 0.0072)
  const gap = h * 0.0178
  const capH = h * 0.058

  ctx.fillStyle = BURGUNDY
  ctx.fillRect(m, y, capH * 0.7, capH)

  for (let i = 0; i < 44; i++) {
    const ty = y + i * gap
    if (ty > h * 0.9) break

    const indent = ty < y + capH - size ? capH * 0.86 : 0
    const start = m + indent
    let end = m + col

    // Flow around the figure rather than running under it.
    if (ty + size > figure.y && ty < figure.y + figure.h) {
      end = figure.x - w * 0.028
    }

    let len = end - start - r() * col * 0.04
    if (i > 6 && r() > 0.93) len *= 0.55
    if (len < col * 0.1) continue

    setLine(start, ty, len, size, 0.34)
  }

  ctx.fillStyle = SURFACE
  ctx.fillRect(figure.x, figure.y, figure.w, figure.h)
  wash(
    ctx,
    fx + fw / 2,
    fy + fw / 2,
    fw * 0.46,
    fw * 0.46,
    0,
    PIGMENTS.ultramarine.hex,
    0.95,
    r,
  )
  ctx.strokeStyle = rgba(INK, 0.16)
  ctx.lineWidth = 1
  ctx.strokeRect(figure.x, figure.y, figure.w, figure.h)

  setLine(fx, fy + fw * 1.08, fw * 0.86, Math.max(1, h * 0.0055), 0.34)
  setLine(
    fx,
    fy + fw * 1.08 + h * 0.014,
    fw * 0.55,
    Math.max(1, h * 0.0055),
    0.34,
  )
}

/**
 * An ink outline with the colour going in — and one petal coloured past its
 * line, because staying inside them is optional in that app.
 */
function plateColouring(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Random,
): void {
  paper(ctx, w, h, r)

  const cx = w * 0.5
  const cy = h * 0.47
  const s = Math.min(w, h)
  const petals = 6
  const a0 = -Math.PI / 2 + 0.18
  const inner = s * 0.075
  const outer = s * 0.33
  const mid = (inner + outer) / 2
  const halfLen = (outer - inner) / 2
  const halfWide = s * 0.075

  // Two of six carry the deep tone; the rest stay warm, or the middle turns to
  // mud where the petals meet.
  const hues = [
    PIGMENTS.cadmium.hex,
    PIGMENTS.sienna.hex,
    PIGMENTS.cadmium.hex,
    BURGUNDY,
    PIGMENTS.cadmium.hex,
    PIGMENTS.sienna.hex,
  ]

  for (let i = 0; i < petals; i++) {
    const a = a0 + (i / petals) * Math.PI * 2
    const slip = i === 4 ? s * 0.055 : 0
    wash(
      ctx,
      cx + Math.cos(a) * (mid + slip),
      cy + Math.sin(a) * (mid + slip),
      halfLen * 0.94,
      halfWide * 0.88,
      a,
      hues[i],
      0.62 + r() * 0.16,
      r,
    )
  }

  wash(ctx, cx, cy, inner * 0.95, inner * 0.95, 0, PIGMENTS.cadmium.hex, 0.9, r)
  wash(
    ctx,
    cx - s * 0.012,
    cy + s * 0.3,
    s * 0.016,
    s * 0.15,
    0.05,
    PIGMENTS.viridian.hex,
    0.55,
    r,
  )
  wash(
    ctx,
    cx - s * 0.14,
    cy + s * 0.3,
    s * 0.085,
    s * 0.032,
    -0.45,
    PIGMENTS.viridian.hex,
    0.6,
    r,
  )

  ctx.save()
  ctx.strokeStyle = rgba(INK, 0.72)
  ctx.lineWidth = Math.max(1.2, s * 0.0045)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  for (let p = 0; p < petals; p++) {
    const pa = a0 + (p / petals) * Math.PI * 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(pa)
    ctx.beginPath()
    ctx.moveTo(inner, 0)
    ctx.bezierCurveTo(
      mid * 0.9,
      -halfWide,
      outer * 0.94,
      -halfWide * 0.55,
      outer,
      0,
    )
    ctx.bezierCurveTo(
      outer * 0.94,
      halfWide * 0.55,
      mid * 0.9,
      halfWide,
      inner,
      0,
    )
    ctx.stroke()
    ctx.restore()
  }

  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy + inner)
  ctx.quadraticCurveTo(
    cx - s * 0.03,
    cy + s * 0.28,
    cx - s * 0.012,
    cy + s * 0.46,
  )
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - s * 0.02, cy + s * 0.3)
  ctx.quadraticCurveTo(
    cx - s * 0.13,
    cy + s * 0.24,
    cx - s * 0.23,
    cy + s * 0.32,
  )
  ctx.quadraticCurveTo(
    cx - s * 0.13,
    cy + s * 0.36,
    cx - s * 0.02,
    cy + s * 0.3,
  )
  ctx.stroke()
  ctx.restore()
}

/** Six weeks of days, each recorded as a mark rather than a rating. */
function plateYear(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Random,
): void {
  paper(ctx, w, h, r)

  const cols = 7
  const rows = 6
  const padX = w * 0.09
  const padY = h * 0.075
  const cw = (w - padX * 2) / cols
  const ch = (h - padY * 2) / rows
  const cell = Math.min(cw, ch)
  const hues = [
    PIGMENTS.ultramarine.hex,
    PIGMENTS.sienna.hex,
    PIGMENTS.viridian.hex,
    PIGMENTS.cadmium.hex,
    BURGUNDY,
    PIGMENTS.bone.hex,
  ]

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cxp = padX + cw * x + cw / 2
      const cyp = padY + ch * y + ch / 2
      const k = r()
      const hue = hues[Math.floor(r() * hues.length)]
      const rad = cell * (0.3 + r() * 0.14)

      // A handful of days are left blank. Not every day gets a mark.
      if (r() > 0.93) continue

      if (k < 0.26) {
        wash(ctx, cxp, cyp, rad * 1.15, rad * 1.15, r() * Math.PI, hue, 0.7, r)
      } else if (k < 0.46) {
        ctx.save()
        ctx.translate(cxp, cyp)
        ctx.rotate((r() - 0.5) * 1.6)
        ctx.globalAlpha = 0.6 + r() * 0.3
        ctx.fillStyle = hue
        ctx.beginPath()
        ctx.ellipse(0, 0, rad * 1.5, rad * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } else if (k < 0.62) {
        ctx.save()
        ctx.strokeStyle = rgba(hue, 0.75)
        ctx.lineWidth = Math.max(1.2, cell * 0.06)
        ctx.beginPath()
        ctx.arc(cxp, cyp, rad * 0.92, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      } else if (k < 0.78) {
        ctx.save()
        ctx.translate(cxp, cyp)
        ctx.rotate((r() - 0.5) * 0.3)
        ctx.globalAlpha = 0.6 + r() * 0.25
        ctx.fillStyle = hue
        ctx.fillRect(-rad * 0.85, -rad * 0.85, rad * 1.7, rad * 1.7)
        ctx.restore()
      } else if (k < 0.91) {
        ctx.save()
        ctx.strokeStyle = rgba(hue, 0.7)
        ctx.lineWidth = Math.max(1, cell * 0.045)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(cxp - rad, cyp + rad * 0.5)
        for (let t = 1; t <= 5; t++) {
          ctx.lineTo(
            cxp - rad + (rad * 2 * t) / 5,
            cyp + (r() - 0.5) * rad * 1.9,
          )
        }
        ctx.stroke()
        ctx.restore()
      } else {
        ctx.save()
        ctx.translate(cxp, cyp)
        ctx.rotate((r() - 0.5) * 0.24)
        ctx.fillStyle = SURFACE
        ctx.fillRect(-rad, -rad * 1.05, rad * 2, rad * 2.4)
        ctx.globalAlpha = 0.75
        ctx.fillStyle = hue
        ctx.fillRect(-rad * 0.84, -rad * 0.88, rad * 1.68, rad * 1.6)
        ctx.globalAlpha = 1
        ctx.strokeStyle = rgba(INK, 0.16)
        ctx.lineWidth = 1
        ctx.strokeRect(-rad, -rad * 1.05, rad * 2, rad * 2.4)
        ctx.restore()
      }
    }
  }
}

/** Marks that answer in sound: dots ring, strokes pull strings, spirals sing. */
function plateEcho(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Random,
): void {
  const s = Math.min(w, h)

  const g = ctx.createRadialGradient(
    w * 0.5,
    h * 0.42,
    0,
    w * 0.5,
    h * 0.42,
    Math.max(w, h) * 0.8,
  )
  g.addColorStop(0, '#16255c')
  g.addColorStop(0.6, '#0d1636')
  g.addColorStop(1, '#080d20')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalAlpha = 0.7
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rgba('#ffffff', 0.1 + r() * 0.35)
    const sr = r() * 1.3
    ctx.fillRect(r() * w, r() * h * 0.75, sr, sr)
  }
  ctx.restore()

  ctx.lineCap = 'round'

  for (const b of [
    { x: w * 0.28, y: h * 0.3, hue: '#c9820a' },
    { x: w * 0.7, y: h * 0.22, hue: '#efe9dd' },
    { x: w * 0.76, y: h * 0.6, hue: '#c9820a' },
  ]) {
    for (let k = 1; k <= 4; k++) {
      ctx.strokeStyle = rgba(b.hue, 0.36 / k)
      ctx.lineWidth = Math.max(0.8, (s * 0.005) / k)
      ctx.beginPath()
      ctx.arc(b.x, b.y, s * 0.035 * k * (1 + r() * 0.15), 0, Math.PI * 2)
      ctx.stroke()
    }
    const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, s * 0.05)
    bg.addColorStop(0, rgba(b.hue, 0.95))
    bg.addColorStop(1, rgba(b.hue, 0))
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.arc(b.x, b.y, s * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.save()
  ctx.strokeStyle = rgba('#efe9dd', 0.9)
  ctx.lineWidth = Math.max(1.6, s * 0.011)
  ctx.beginPath()
  ctx.moveTo(w * 0.14, h * 0.62)
  ctx.bezierCurveTo(w * 0.3, h * 0.5, w * 0.44, h * 0.72, w * 0.6, h * 0.58)
  ctx.stroke()

  for (let v = 1; v <= 3; v++) {
    ctx.strokeStyle = rgba('#8fb4ff', 0.3 / v)
    ctx.lineWidth = Math.max(0.7, s * 0.004)
    ctx.beginPath()
    for (let px = 0; px <= 60; px++) {
      const tx = w * 0.14 + (w * 0.46 * px) / 60
      const base = h * 0.62 - Math.sin((px / 60) * Math.PI) * h * 0.08
      const ty = base + Math.sin((px / 60) * Math.PI * 6) * s * 0.018 * v
      if (px === 0) ctx.moveTo(tx, ty)
      else ctx.lineTo(tx, ty)
    }
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = rgba('#e8c8a0', 0.75)
  ctx.lineWidth = Math.max(1.2, s * 0.008)
  ctx.beginPath()
  const sx = w * 0.36
  const sy = h * 0.82
  for (let a = 0; a < Math.PI * 6; a += 0.12) {
    const rad = s * 0.006 * a
    const qx = sx + Math.cos(a) * rad
    const qy = sy + Math.sin(a) * rad * 0.8
    if (a === 0) ctx.moveTo(qx, qy)
    else ctx.lineTo(qx, qy)
  }
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const wg = ctx.createRadialGradient(
    w * 0.66,
    h * 0.84,
    0,
    w * 0.66,
    h * 0.84,
    s * 0.3,
  )
  wg.addColorStop(0, rgba('#2e6b52', 0.55))
  wg.addColorStop(0.6, rgba('#1f3a93', 0.3))
  wg.addColorStop(1, rgba('#1f3a93', 0))
  ctx.fillStyle = wg
  ctx.beginPath()
  ctx.ellipse(w * 0.66, h * 0.84, s * 0.3, s * 0.19, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = rgba('#050810', 0.55)
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, h * 0.9)
  ctx.quadraticCurveTo(w * 0.5, h * 0.83, w, h * 0.92)
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
}

const PLATES: Record<
  PlateKind,
  (ctx: CanvasRenderingContext2D, w: number, h: number, r: Random) => void
> = {
  reader: plateReader,
  colouring: plateColouring,
  year: plateYear,
  echo: plateEcho,
}

/**
 * `seed` keeps a plate stable across renders. It is derived from the app's
 * slug by the caller, so an app's drawing does not change when an editor
 * reorders the list.
 */
export function AppPlate({ plate, seed }: { plate: PlateKind; seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function paint(): void {
      const target = canvasRef.current
      if (!target) return
      const rect = target.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return

      const ctx = target.getContext('2d')
      if (!ctx) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      target.width = w * dpr
      target.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      PLATES[plate](ctx, w, h, rng(seed))
    }

    paint()

    let timer: ReturnType<typeof setTimeout>
    function onResize(): void {
      clearTimeout(timer)
      timer = setTimeout(paint, 180)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [plate, seed])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
