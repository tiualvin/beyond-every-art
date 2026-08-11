'use client'

import { useEffect, useRef } from 'react'

// The cover's animated ground: blooms drifting over a deep oxblood field.
//
// Every tone is drawn from the burgundy family, so the wash moves tonally
// rather than through colour — that is what keeps it reading as pigment in
// motion rather than as an animated gradient.

const BASE = '#26080f'
const TONES = ['#6d1f2c', '#4c1420', '#8f3340']

/**
 * The field is soft, so it renders at half resolution and is stretched by CSS.
 * Invisible at this blur radius, and roughly four times cheaper to paint.
 */
const SCALE = 0.5

type Bloom = {
  x: number
  y: number
  radius: number
  tone: string
  alpha: number
  ax: number
  ay: number
  sx: number
  sy: number
  px: number
  py: number
}

/** Deterministic, so the composition is the same on every render and machine. */
function rng(seed: number) {
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

export function CoverField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    let width = 0
    let height = 0
    let blooms: Bloom[] = []
    let texture: HTMLCanvasElement | null = null
    let frame: number | null = null

    function build(): boolean {
      const host = canvas!.parentElement
      if (!host) return false
      const rect = host.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return false

      width = Math.max(1, Math.round(rect.width * SCALE))
      height = Math.max(1, Math.round(rect.height * SCALE))
      canvas!.width = width
      canvas!.height = height

      const random = rng(11)
      blooms = Array.from({ length: 7 }, (_, i) => ({
        // Held to the right of centre: the headline occupies the left column.
        x: (0.42 + random() * 0.62) * width,
        y: (0.08 + random() * 0.86) * height,
        radius: (0.26 + random() * 0.44) * Math.max(width, height),
        tone: TONES[i % TONES.length],
        alpha: 0.26 + random() * 0.3,
        ax: (0.04 + random() * 0.1) * width,
        ay: (0.03 + random() * 0.08) * height,
        sx: 0.000055 + random() * 0.00009,
        sy: 0.00005 + random() * 0.00008,
        px: random() * Math.PI * 2,
        py: random() * Math.PI * 2,
      }))

      // Brush marks never move, so they are painted once and stamped each
      // frame; the per-frame cost stays at gradients plus one drawImage.
      texture = document.createElement('canvas')
      texture.width = width
      texture.height = height
      const tx = texture.getContext('2d')
      if (tx) {
        const mark = rng(29)
        const angle = -0.5
        for (let i = 0; i < 30; i++) {
          tx.save()
          tx.translate(
            width * 0.62 + (mark() - 0.5) * width * 1.15,
            height * 0.5 + (mark() - 0.5) * height * 1.15,
          )
          tx.rotate(angle + (mark() - 0.5) * 0.5)
          tx.globalAlpha = 0.24 * (0.3 + mark() * 0.7)
          tx.fillStyle = mark() > 0.62 ? '#3a0f18' : '#8f3340'
          tx.beginPath()
          tx.ellipse(
            0,
            0,
            (0.03 + mark() * mark() * 0.16) * width,
            2 + mark() * mark() * 14,
            0,
            0,
            Math.PI * 2,
          )
          tx.fill()
          tx.restore()
        }
      }
      return true
    }

    function draw(time: number) {
      if (!ctx) return
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = BASE
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'screen'
      for (const b of blooms) {
        const cx = b.x + Math.sin(time * b.sx + b.px) * b.ax
        const cy = b.y + Math.cos(time * b.sy + b.py) * b.ay
        const radius =
          b.radius * (1 + Math.sin(time * b.sx * 0.7 + b.py) * 0.09)
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
        gradient.addColorStop(0, rgba(b.tone, b.alpha))
        gradient.addColorStop(0.55, rgba(b.tone, b.alpha * 0.3))
        gradient.addColorStop(1, rgba(b.tone, 0))
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      if (texture) {
        ctx.globalCompositeOperation = 'overlay'
        ctx.globalAlpha = 0.55
        ctx.drawImage(texture, 0, 0)
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    function loop(time: number) {
      draw(time)
      frame = requestAnimationFrame(loop)
    }

    function start() {
      if (frame === null && !reduced) frame = requestAnimationFrame(loop)
    }

    function stop() {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
    }

    if (!build()) return
    draw(0)
    start()

    // Nothing to animate once the cover has scrolled out of view.
    const host = canvas.parentElement
    const observer =
      host && 'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([entry]) => (entry.isIntersecting ? start() : stop()),
            { threshold: 0 },
          )
        : null
    if (host && observer) observer.observe(host)

    let resizeTimer: ReturnType<typeof setTimeout>
    function onResize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (build()) draw(performance.now())
      }, 200)
    }
    window.addEventListener('resize', onResize)

    return () => {
      stop()
      observer?.disconnect()
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="cover__wash" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
