'use client'

/**
 * LazyMotion Provider - Reduces Framer Motion bundle size
 * 
 * Only loads the domAnimation features needed for most use cases.
 * Saves ~15KB by avoiding the full Framer Motion core bundle.
 * 
 * Usage:
 * 1. Wrap your app/components with <MotionProvider>
 * 2. Use `m` instead of `motion` for DOM elements
 * 3. Import AnimatePresence separately (not part of LazyMotion)
 */

import { LazyMotion, domAnimation, AnimatePresence } from 'framer-motion'
import { ReactNode } from 'react'

interface MotionProviderProps {
  children: ReactNode
}

/**
 * LazyMotion provider that only loads domAnimation features
 * This includes: layout, whileHover, whileTap, whileFocus, whileDrag, whileInView, exit
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}

/**
 * Re-export the m component for use throughout the app
 * This is the LazyMotion equivalent of motion.*
 */
export { m } from 'framer-motion'

/**
 * Re-export AnimatePresence since it's not part of LazyMotion features
 * Must be imported separately
 */
export { AnimatePresence }

/**
 * Re-export commonly used hooks that are tree-shaken automatically
 * Only the hooks you actually use will be included in the bundle
 */
export { 
  useAnimation,
  useScroll, 
  useTransform,
  useSpring,
  useDragControls
} from 'framer-motion'

/**
 * Re-export commonly used types
 */
export type { PanInfo } from 'framer-motion'