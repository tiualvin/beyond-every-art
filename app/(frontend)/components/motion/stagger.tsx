'use client'

import { motion, useReducedMotion } from 'framer-motion'

import { editorial, fadeUp, stagger } from './variants'

export function StaggerChildren({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      variants={stagger}
      initial={reduced ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div variants={fadeUp} transition={editorial} className={className}>
      {children}
    </motion.div>
  )
}
