'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import type { TopicCard as TopicCardData } from '@/lib/content/queries'
import { TopicCard } from './topic-card'
import { editorial, fadeUp, stagger } from './motion/variants'

const ARROW_LEFT = 'M15 18l-6-6 6-6'
const ARROW_RIGHT = 'M9 18l6-6-6-6'

export function TopicsCarousel({ topics }: { topics: TopicCardData[] }) {
  const reduced = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = () => {
    const el = trackRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4)
  }

  useEffect(() => {
    updateEdges()
    const el = trackRef.current
    if (!el) return
    const onResize = () => updateEdges()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [topics.length])

  const scrollByCard = (direction: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('.topic-card')
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.8
    el.scrollBy({
      left: step * direction,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  return (
    <div className="topics-carousel">
      <div
        className="topics-carousel__viewport"
        data-at-start={atStart}
        data-at-end={atEnd}
      >
        <motion.div
          ref={trackRef}
          className="topics-carousel__track"
          variants={stagger}
          initial={reduced ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          onScroll={updateEdges}
        >
          {topics.map((topic) => (
            <motion.div
              key={topic.slug}
              className="topics-carousel__item"
              variants={fadeUp}
              transition={editorial}
            >
              <TopicCard topic={topic} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <button
        type="button"
        className="topics-carousel__button topics-carousel__button--prev"
        onClick={() => scrollByCard(-1)}
        disabled={atStart}
        aria-label="Scroll topics left"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={ARROW_LEFT} />
        </svg>
      </button>
      <button
        type="button"
        className="topics-carousel__button topics-carousel__button--next"
        onClick={() => scrollByCard(1)}
        disabled={atEnd}
        aria-label="Scroll topics right"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={ARROW_RIGHT} />
        </svg>
      </button>
    </div>
  )
}
