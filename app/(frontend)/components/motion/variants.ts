import type { Transition, Variants } from 'framer-motion'

const ease = [0.25, 0.1, 0.25, 1.0] as const

export const editorial: Transition = {
  duration: 0.5,
  ease,
}

export const quick: Transition = {
  duration: 0.3,
  ease,
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0 },
}

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
}

export const slideDown: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
}
