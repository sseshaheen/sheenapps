'use client'

import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { useEffect, useState } from 'react'
import { logger } from '@/utils/logger';

interface PerChoiceAIOverlayProps {
  choiceId: string
  choiceName: string
  onComplete?: () => void
}

export function PerChoiceAIOverlay({
  choiceId,
  choiceName,
  onComplete
}: PerChoiceAIOverlayProps) {
  const [dots, setDots] = useState('')
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false)

  // Get state for this specific choice
  const isGenerating = usePreviewGenerationStore(state => state.isGenerating(choiceId))
  const progress = usePreviewGenerationStore(state => state.getGenerationProgress(choiceId))
  const stage = usePreviewGenerationStore(state => state.getGenerationStage(choiceId))

  // Animated dots for loading effect
  useEffect(() => {
    if (!isGenerating) return

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return ''
        return prev + '.'
      })
    }, 500)

    return () => clearInterval(interval)
  }, [isGenerating])

  // Handle completion animation timing
  useEffect(() => {
    if (progress >= 100 && !isGenerating) {
      logger.info('🎬 Starting completion animation for:', choiceName);
      // Show completion animation
      setShowCompletionAnimation(true)
      
      // Call onComplete after animation finishes
      const timer = setTimeout(() => {
        logger.info('✅ Completion animation finished for:', choiceName);
        onComplete?.()
        // Hide overlay and cleanup after additional delay
        setTimeout(() => {
          setShowCompletionAnimation(false)
          // Cleanup the store data
          usePreviewGenerationStore.getState().cleanupCompletedGeneration(choiceId)
        }, 1500) // Show completion for 1.5s
      }, 1000) // Wait 1s before calling onComplete
      
      return () => clearTimeout(timer)
    }
  }, [progress, isGenerating, onComplete, choiceId, choiceName])

  // Show overlay if generating OR showing completion animation
  if (!isGenerating && !showCompletionAnimation) {
    logger.info(`🚫 Overlay hidden for ${choiceName}: isGenerating=${isGenerating}, showCompletionAnimation=${showCompletionAnimation}, progress=${progress}`);
    return null
  }

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="absolute top-4 right-4 z-50 pointer-events-none"
      >
        {(progress >= 100 || showCompletionAnimation) ? (
          /* Completion State - Success Animation */
          <m.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-800/90 to-emerald-800/90 text-green-100 rounded-lg text-xs font-medium backdrop-blur-sm pointer-events-auto shadow-lg border border-green-600/30"
          >
            <m.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ 
                scale: [0, 1.3, 1],
                rotate: [180, 0, 0]
              }}
              transition={{ 
                duration: 0.6,
                ease: "easeOut",
                times: [0, 0.6, 1]
              }}
              className="text-sm"
            >
              ✅
            </m.div>
            <m.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              {choiceName} Complete!
            </m.span>
            <m.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="text-xs"
            >
              ✨
            </m.div>
          </m.div>
        ) : (
          /* Generating State - Informative Badge */
          <div className="px-3 py-2 bg-gray-900/90 text-gray-200 rounded-lg text-xs backdrop-blur-sm pointer-events-auto shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <m.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="text-sm"
              >
                🧠
              </m.div>
              <span className="font-medium">
                {choiceId.startsWith('section-edit-') ? `Editing ${choiceName}` : `Generating ${choiceName}`}
              </span>
            </div>
            
            {stage && (
              <div className="text-purple-300 text-xs mb-2 opacity-90">
                {stage.loadingMessage}{dots}
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <span className="text-gray-400 text-xs min-w-[30px]">{Math.round(progress)}%</span>
            </div>
          </div>
        )}
      </m.div>
    </AnimatePresence>
  )
}
