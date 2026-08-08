'use client'

import { motion, useReducedMotion } from 'framer-motion'

import { editorial } from './variants'

export function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  className,
}: {
  children: React.ReactNode
  delay?: number
  direction?: 'up' | 'down' | 'none'
  className?: string
}) {
  const reduced = useReducedMotion()
  const y = direction === 'up' ? 16 : direction === 'down' ? -16 : 0

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...editorial, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
