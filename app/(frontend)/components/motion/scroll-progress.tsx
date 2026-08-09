'use client'

import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion'

export function ScrollProgress() {
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  if (reduced) return null

  return (
    <motion.div
      className="scroll-progress"
      style={{ scaleX, transformOrigin: '0%' }}
    />
  )
}
