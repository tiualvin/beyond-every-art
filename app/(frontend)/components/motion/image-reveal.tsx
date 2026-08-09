'use client'

import { motion, useReducedMotion } from 'framer-motion'

import { editorial } from './variants'

export function ImageReveal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduced ? false : { clipPath: 'inset(8% 8% 8% 8%)', opacity: 0.6 }}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ ...editorial, duration: 0.7 }}
    >
      {children}
    </motion.div>
  )
}
