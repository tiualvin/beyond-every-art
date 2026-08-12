'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import type { TopicCard } from '@/lib/content/queries'
import { pigmentFor, textOn } from '@/lib/design/pigments'
import { tagPath } from '@/lib/seo/site'

/** Floor, so the smallest subject still reads as a field of paint. */
const MIN_FILL = 30
const FILL_RANGE = 54

/** Between one swatch starting to fill and the next. */
const STAGGER_MS = 70

/**
 * Keeps each swatch's `--swatch-floor` equal to the height of its own label.
 *
 * The fill has to clear its own label, or the name ends up on the near-black
 * card while its colour was chosen for the pigment — which is how a pale
 * pigment's label turns into dark ink on a dark ground. A percentage floor
 * cannot promise that: the swatch goes landscape on phones, so 30% of a short
 * box is less than the label needs, and a name that wraps to two lines needs
 * more again. Measuring the label is the only version of this that holds at
 * every width and for every name.
 */
function useLabelFloor(ref: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const grid = ref.current
    if (!grid) return

    // Per swatch, not per row: one long name that wraps would otherwise raise
    // the floor under every subject and flatten the chart into a solid band.
    const measure = () => {
      for (const swatch of grid.querySelectorAll<HTMLElement>('.swatch')) {
        const body = swatch.querySelector('.swatch__body')
        if (!body) continue
        const padding = Number.parseFloat(
          getComputedStyle(swatch).paddingBottom,
        )
        const floor = body.getBoundingClientRect().height + padding * 2
        swatch.style.setProperty('--swatch-floor', `${Math.ceil(floor)}px`)
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [ref])
}

/**
 * Whether the fills should be at their full height yet.
 *
 * Starts drawn, so a reader without JavaScript — and the server-rendered
 * markup — gets the real chart rather than a row of empty boxes. It only
 * collapses to animate when the row is still below the fold, where the
 * collapse cannot be seen; a row already on screen is left alone rather than
 * flashing.
 */
function useDrawnOnScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  count: number,
): { drawn: boolean; staggering: boolean } {
  const [drawn, setDrawn] = useState(true)
  const [staggering, setStaggering] = useState(false)

  useEffect(() => {
    const grid = ref.current
    if (!grid) return

    const box = grid.getBoundingClientRect()
    if (box.top < window.innerHeight && box.bottom > 0) return

    setDrawn(false)
    let done: ReturnType<typeof setTimeout>
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setDrawn(true)
        setStaggering(true)
        // The stagger is only for the entrance. Left in place it would also
        // delay the hover fill, by up to the width of the whole row.
        done = setTimeout(() => setStaggering(false), count * STAGGER_MS + 900)
        observer.disconnect()
      },
      { threshold: 0.15 },
    )
    observer.observe(grid)
    return () => {
      observer.disconnect()
      clearTimeout(done)
    }
  }, [ref, count])

  return { drawn, staggering }
}

/**
 * Subjects as pigment swatches, filled in proportion to how much of the archive
 * each one covers — a paint box you can also read as a bar chart.
 *
 * The fills rise to their level as the row comes into view, one after another,
 * which is the section's own claim — that fill height is a quantity — stated
 * as motion. `prefers-reduced-motion` drops the transition and they are simply
 * there.
 */
export function TopicSwatches({ topics }: { topics: TopicCard[] }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const max = Math.max(...topics.map((topic) => topic.postCount), 1)

  useLabelFloor(gridRef)
  const { drawn, staggering } = useDrawnOnScroll(gridRef, topics.length)

  return (
    <div
      className="swatches"
      ref={gridRef}
      data-drawing={staggering || undefined}
    >
      {topics.map((topic, index) => {
        const pigment = pigmentFor(topic.slug)
        const fill = MIN_FILL + (topic.postCount / max) * FILL_RANGE

        return (
          <Link
            key={topic.slug}
            href={tagPath(topic.slug)}
            className="swatch"
            style={
              {
                '--pigment': pigment.hex,
                '--pigment-ink': textOn(pigment.hex),
              } as React.CSSProperties
            }
          >
            <span
              className="swatch__fill"
              style={
                {
                  '--fill': drawn ? `${fill}%` : '0%',
                  '--stagger': `${index * STAGGER_MS}ms`,
                } as React.CSSProperties
              }
            />
            <span className="swatch__body">
              <span className="swatch__name">{topic.name}</span>
              <span className="swatch__count">
                {topic.postCount} {topic.postCount === 1 ? 'piece' : 'pieces'}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
