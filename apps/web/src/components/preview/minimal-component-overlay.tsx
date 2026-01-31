'use client'

import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { useEffect, useState } from 'react'
import type { ComponentName, GenerationProgress } from '@/services/preview/component-generation-orchestrator'
import { logger } from '@/utils/logger';

interface MinimalComponentOverlayProps {
  isVisible: boolean
  progress: GenerationProgress
  choiceName: string
  onComplete?: () => void
}

const COMPONENT_ICONS: Record<ComponentName, string> = {
  header: '🔝',
  hero: '✨', 
  features: '🎯'
}

// Dynamic generation messages based on progress
const getGenerationMessage = (choiceName: string, progress: number) => {
  const normalizedChoice = choiceName.toLowerCase()
  
  if (progress < 20) {
    return `🎨 Designing your ${normalizedChoice}...`
  } else if (progress < 50) {
    return `🧠 Adding AI magic to ${normalizedChoice}...`
  } else if (progress < 80) {
    return `✨ Polishing your ${normalizedChoice}...`
  } else {
    // Even at 100%, keep showing "finalizing" to avoid duplicate "ready" messages
    return `🎯 Finalizing ${normalizedChoice}...`
  }
}

// Fun completion messages
const getCompletionMessage = (choiceName: string) => {
  const messages = [
    `🎉 ${choiceName} is live!`,
    `✨ ${choiceName} looks amazing!`,
    `🚀 ${choiceName} is ready to shine!`,
    `🎯 Nailed it! ${choiceName} complete!`,
    `🔥 ${choiceName} is looking hot!`
  ]
  return messages[Math.floor(Math.random() * messages.length)]
}

export function MinimalComponentOverlay({ 
  isVisible, 
  progress, 
  choiceName,
  onComplete 
}: MinimalComponentOverlayProps) {
  const [showCompletion, setShowCompletion] = useState(false)

  // Handle completion - DISABLED to prevent duplicate completion overlays
  useEffect(() => {
    if (progress.completedComponents + progress.failedComponents === progress.totalComponents && progress.totalComponents > 0) {
      // Skip showing completion overlay - this is handled by the main completion system now
      logger.info('🔇 MinimalComponentOverlay: Skipping completion display to prevent duplicates');
      onComplete?.()
    }
  }, [progress.completedComponents, progress.failedComponents, progress.totalComponents, onComplete])

  if (!isVisible) return null

  return (
    <AnimatePresence mode="wait">
      <m.div
        key={showCompletion ? 'completion' : 'generating'}
        initial={{ opacity: 0, scale: 0.8, x: 20, y: -20 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, x: 20, y: -20 }}
        transition={{ 
          duration: 0.4, 
          ease: [0.4, 0.0, 0.2, 1],
          scale: { type: "spring", stiffness: 300, damping: 25 }
        }}
        className="absolute top-4 right-4 z-50"
      >
        {showCompletion ? (
          // Completion state - minimal with smooth entrance
          <m.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: [0.8, 1.1, 1], 
              opacity: 1 
            }}
            transition={{ 
              duration: 0.6,
              ease: [0.4, 0.0, 0.2, 1],
              times: [0, 0.7, 1]
            }}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-green-400/30"
          >
            <m.span 
              className="text-sm"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              ✅
            </m.span>
            <span className="text-sm font-medium">{getCompletionMessage(choiceName)}</span>
          </m.div>
        ) : (
          // Generation progress - minimal with smooth animations
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="bg-gray-900/95 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-xl border border-gray-700/50"
          >
            <div className="flex items-center gap-2 mb-3">
              <m.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full"
              />
              <span className="text-xs font-medium">{getGenerationMessage(choiceName, progress.overallProgress)}</span>
            </div>

            {/* Minimal progress bar with smooth animation */}
            <div className="w-36 bg-gray-700/60 rounded-full h-1.5 mb-3 overflow-hidden">
              <m.div
                className="bg-gradient-to-r from-blue-400 to-blue-500 h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress.overallProgress}%` }}
                transition={{ 
                  duration: 0.5, 
                  ease: [0.4, 0.0, 0.2, 1] 
                }}
              />
            </div>

            {/* Current components - horizontal icons with smooth animations */}
            <div className="flex items-center gap-1.5">
              {Array.from(progress.results.entries()).map(([component, result]) => (
                <m.span
                  key={component}
                  initial={{ opacity: 0.3, scale: 0.8 }}
                  animate={{ 
                    opacity: result.status === 'completed' ? 1 : 
                             result.status === 'generating' ? 0.9 : 0.4,
                    scale: result.status === 'generating' ? [1, 1.2, 1] : 1
                  }}
                  transition={{ 
                    opacity: { duration: 0.3, ease: "easeOut" },
                    scale: { 
                      duration: 1.2, 
                      repeat: result.status === 'generating' ? Infinity : 0,
                      ease: "easeInOut"
                    }
                  }}
                  className={`text-sm transition-colors duration-300 ${
                    result.status === 'completed' ? 'text-green-400 drop-shadow-sm' :
                    result.status === 'generating' ? 'text-blue-400 drop-shadow-sm' :
                    result.status === 'failed' ? 'text-red-400' : 'text-gray-500'
                  }`}
                >
                  {COMPONENT_ICONS[component]}
                </m.span>
              ))}
              <m.span 
                className="text-xs text-gray-400 ml-2 font-mono"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {progress.totalComponents === 1 
                  ? `${Math.round(progress.overallProgress)}%`
                  : `${progress.completedComponents}/${progress.totalComponents}`
                }
              </m.span>
            </div>
          </m.div>
        )}
      </m.div>
    </AnimatePresence>
  )
}