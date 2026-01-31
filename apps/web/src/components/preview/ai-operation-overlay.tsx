'use client'

import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { useEffect, useState } from 'react'

interface AIOperationOverlayProps {
  isVisible: boolean
  currentStage?: {
    stage: string
    component: string
    loadingMessage: string
  }
  progress: number // 0-100
  onComplete?: () => void
}

export function AIOperationOverlay({
  isVisible,
  currentStage,
  progress,
  onComplete
}: AIOperationOverlayProps) {
  const [dots, setDots] = useState('')

  // Animated dots for loading effect
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return ''
        return prev + '.'
      })
    }, 500)

    return () => clearInterval(interval)
  }, [isVisible])

  // Auto-hide after completion
  useEffect(() => {
    if (progress >= 100 && isVisible) {
      const timer = setTimeout(() => {
        onComplete?.()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [progress, isVisible, onComplete])

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-gray-900/60 backdrop-blur-[2px] flex items-center justify-center"
      >
        <div className="text-center max-w-md mx-auto p-8 bg-gray-900/50 backdrop-blur-md rounded-2xl border border-gray-700/50 shadow-2xl">
          {/* AI Brain Animation */}
          <m.div
            animate={{
              rotate: [0, 360],
              scale: [1, 1.1, 1]
            }}
            transition={{
              rotate: { duration: 3, repeat: Infinity, ease: "linear" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
            }}
            className="text-6xl mb-6"
          >
            🧠
          </m.div>

          {/* Status Message */}
          <m.div
            key={currentStage?.loadingMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h3 className="text-xl font-semibold text-white">
              AI Generator Active
            </h3>

            <p className="text-purple-300 text-lg">
              {currentStage?.loadingMessage || 'Initializing AI operation...'}{dots}
            </p>

            {/* Stage Indicator */}
            {currentStage && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                <span>Stage: {currentStage.stage}</span>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-200" />
                <span>Component: {currentStage.component}</span>
              </div>
            )}
          </m.div>

          {/* Progress Bar */}
          <div className="mt-8 space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>

            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <m.div
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Animated particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <m.div
                key={i}
                className="absolute w-1 h-1 bg-purple-400 rounded-full"
                animate={{
                  x: [0, Math.random() * 400 - 200],
                  y: [0, Math.random() * 400 - 200],
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0]
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2
                }}
                style={{
                  left: '50%',
                  top: '50%'
                }}
              />
            ))}
          </div>

          {/* Completion State */}
          {progress >= 100 && (
            <m.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="text-center">
                <m.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6 }}
                  className="text-6xl mb-4"
                >
                  ✨
                </m.div>
                <p className="text-xl font-semibold text-green-400">
                  Generation Complete!
                </p>
              </div>
            </m.div>
          )}
        </div>
      </m.div>
    </AnimatePresence>
  )
}

// Component skeleton placeholders that appear during generation
export function ComponentSkeleton({ type }: { type: 'header' | 'hero' | 'features' }) {
  const skeletonClasses = "bg-gray-700/50 animate-pulse rounded"

  switch (type) {
    case 'header':
      return (
        <div className="w-full h-16 p-4 border-b border-gray-600">
          <div className="flex justify-between items-center h-full">
            <div className={`${skeletonClasses} w-32 h-6`} />
            <div className="flex gap-4">
              <div className={`${skeletonClasses} w-20 h-4`} />
              <div className={`${skeletonClasses} w-20 h-4`} />
              <div className={`${skeletonClasses} w-24 h-8`} />
            </div>
          </div>
        </div>
      )

    case 'hero':
      return (
        <div className="w-full h-96 p-8 flex flex-col justify-center items-center text-center">
          <div className={`${skeletonClasses} w-24 h-6 mb-4`} />
          <div className={`${skeletonClasses} w-80 h-12 mb-4`} />
          <div className={`${skeletonClasses} w-96 h-6 mb-8`} />
          <div className={`${skeletonClasses} w-40 h-12`} />
        </div>
      )

    case 'features':
      return (
        <div className="w-full p-8">
          <div className="grid grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="text-center">
                <div className={`${skeletonClasses} w-16 h-16 mx-auto mb-4 rounded-full`} />
                <div className={`${skeletonClasses} w-24 h-4 mx-auto mb-2`} />
                <div className={`${skeletonClasses} w-32 h-3 mx-auto`} />
              </div>
            ))}
          </div>
        </div>
      )

    default:
      return <div className={`${skeletonClasses} w-full h-32`} />
  }
}
