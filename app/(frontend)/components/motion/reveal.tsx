'use client'

import { motion, useReducedMotion } from 'framer-motion'

import { editorial, fadeUp } from './variants'

export function Reveal({
  children,
  className,
  width = '100%',
}: {
  children: React.ReactNode
  className?: string
  width?: string
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      variants={fadeUp}
      initial={reduced ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={editorial}
      className={className}
      style={{ width }}
    >
      {children}
    </motion.div>
  )
}
