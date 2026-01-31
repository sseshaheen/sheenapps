'use client'

/**
 * Lazy-loaded Framer Motion components
 * Reduces initial bundle by splitting motion library (~46KB)
 * Only loads when animations are actually needed
 */

import dynamic from 'next/dynamic'
import { ComponentType } from 'react'

// Core motion components
export const LazyMotion = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.LazyMotion })),
  { ssr: false }
)

export const LazyMotionDiv = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.motion.div })),
  { ssr: false }
)

export const LazyMotionButton = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.motion.button })),
  { ssr: false }
)

export const LazyMotionSpan = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.motion.span })),
  { ssr: false }
)

export const LazyAnimatePresence = dynamic(
  () => import('framer-motion').then(mod => ({ default: mod.AnimatePresence })),
  { ssr: false }
)

// Motion utilities (hooks cannot be lazy-loaded, import directly from framer-motion)
// TODO: Remove if not used, or import directly: import { useSpring, useAnimation } from 'framer-motion'

// Feature-specific bundles for targeted loading
// TODO: LazyGestureMotion removed - import directly from framer-motion when needed
// import { motion, useDragControls, PanInfo } from 'framer-motion'

// HOC for easy migration
export function withLazyMotion<T extends object>(
  Component: ComponentType<T>
): ComponentType<T> {
  return dynamic(
    () => Promise.resolve({ default: Component }),
    {
      loading: () => <div className="animate-pulse bg-gray-100 rounded h-8" />,
      ssr: false
    }
  )
}

// Lightweight loading states for motion components
export const MotionFallback = {
  div: ({ className = '', children }: { className?: string; children?: React.ReactNode }) => (
    <div className={`${className} transition-all duration-200`}>{children}</div>
  ),
  button: ({ className = '', children, onClick }: { 
    className?: string; 
    children?: React.ReactNode; 
    onClick?: () => void 
  }) => (
    <button className={`${className} transition-all duration-200`} onClick={onClick}>
      {children}
    </button>
  ),
  span: ({ className = '', children }: { className?: string; children?: React.ReactNode }) => (
    <span className={`${className} transition-all duration-200`}>{children}</span>
  )
}

// Conditional motion loader based on user preferences
export const useConditionalMotion = () => {
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false
  
  return {
    Motion: prefersReducedMotion ? MotionFallback : {
      div: LazyMotionDiv,
      button: LazyMotionButton,
      span: LazyMotionSpan
    },
    AnimatePresence: prefersReducedMotion ? 
      ({ children }: { children: React.ReactNode }) => <>{children}</> : 
      LazyAnimatePresence
  }
}