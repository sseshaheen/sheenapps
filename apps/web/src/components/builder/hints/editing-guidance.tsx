'use client'

import { Button } from '@/components/ui/button'
import { useResponsive } from '@/hooks/use-responsive'
import { cn } from '@/lib/utils'
import { useEditingGuidanceStore } from '@/store/compat/editing-guidance-store-compat'
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'
import { useCallback, useEffect, useState, useMemo } from 'react'

interface EditingGuidanceProps {
  isLayoutReady: boolean
  onDismiss?: () => void
  className?: string
}

/**
 * Progressive editing guidance that appears after layout selection
 * Provides contextual hints on how to start editing sections
 */
export function EditingGuidance({
  isLayoutReady,
  onDismiss,
  className
}: EditingGuidanceProps) {
  const { showMobileUI } = useResponsive()
  const currentlyGenerating = usePreviewGenerationStore(state => state.currentlyGenerating)

  // Use guidance store to coordinate with edit buttons
  const {
    currentStep,
    isVisible,
    hasBeenDismissed,
    setCurrentStep,
    setVisible,
    setDismissed,
    reset
  } = useEditingGuidanceStore()

  // Show guidance after layout loads with slight delay - but NOT while generating or if permanently dismissed
  useEffect(() => {
    if (isLayoutReady && !hasBeenDismissed && !currentlyGenerating) {
      const timer = setTimeout(() => {
        setVisible(true)
      }, 1500) // Wait for layout to settle

      return () => clearTimeout(timer)
    } else if (currentlyGenerating && isVisible) {
      // Hide guidance if generation starts while it's visible
      setVisible(false)
    }
  }, [isLayoutReady, hasBeenDismissed, currentlyGenerating, isVisible, setVisible])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setDismissed(true) // Persistently track dismissal
    reset() // Clean up guidance store state (but preserve dismissed status)
    onDismiss?.()
  }, [onDismiss, setVisible, setDismissed, reset])

  const guidanceSteps = useMemo(() => [
    {
      id: 'welcome',
      title: '🎉 Your Layout is Ready!',
      description: showMobileUI
        ? 'Tap any section to start customizing'
        : 'Click any section to start editing',
      icon: 'sparkles' as IconName,
      position: 'center',
      highlight: false
    },
    {
      id: 'first-edit',
      title: 'Start with the Hero Section',
      description: showMobileUI
        ? 'Tap the edit button or triple-tap anywhere in the section to customize'
        : 'Click the edit button or triple-click anywhere in the section to customize',
      icon: (showMobileUI ? 'hand' : 'mouse-pointer') as IconName,
      position: 'top',
      highlight: true,
      targetSelector: '[data-section-type="hero"]'
    },
    {
      id: 'more-sections',
      title: 'Explore All Sections',
      description: showMobileUI
        ? 'Scroll down and triple-tap any section to edit quickly'
        : 'Scroll down and triple-click any section to edit quickly',
      icon: 'arrow-down' as IconName,
      position: 'center',
      highlight: false
    }
  ], [showMobileUI])

  // Auto-progress through steps
  useEffect(() => {
    if (!isVisible) return

    const timer = setTimeout(() => {
      if (currentStep < guidanceSteps.length - 1) {
        setCurrentStep(currentStep + 1)
      } else {
        // Auto-dismiss after showing all steps
        setTimeout(() => {
          handleDismiss()
        }, 3000)
      }
    }, 4000) // Show each step for 4 seconds

    return () => clearTimeout(timer)
  }, [currentStep, isVisible, setCurrentStep, guidanceSteps.length, handleDismiss])

  const currentGuidance = guidanceSteps[currentStep]

  if (!isVisible || hasBeenDismissed) {
    return null
  }

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          "fixed inset-0 z-50 pointer-events-none",
          className
        )}
      >
        {/* Backdrop with gradient overlay for spotlight effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/40" />

        {/* Guidance Bubble */}
        <m.div
          key={currentGuidance.id}
          initial={{
            scale: 0.8,
            opacity: 0,
            y: currentGuidance.position === 'top' ? -20 : 20
          }}
          animate={{
            scale: 1,
            opacity: 1,
            y: 0
          }}
          exit={{
            scale: 0.8,
            opacity: 0,
            y: currentGuidance.position === 'top' ? -20 : 20
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 25
          }}
          className={cn(
            "absolute pointer-events-auto",
            currentGuidance.position === 'center' && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            currentGuidance.position === 'top' && showMobileUI && "top-24 left-1/2 -translate-x-1/2",
            currentGuidance.position === 'top' && !showMobileUI && "top-32 left-1/2 -translate-x-1/2"
          )}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm mx-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
                  <Icon name={currentGuidance.icon} className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {currentGuidance.title}
                </h3>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Icon name="x" className="w-4 h-4"  />
              </Button>
            </div>

            {/* Content */}
            <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              {currentGuidance.description}
            </p>

            {/* Progress Indicators */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {guidanceSteps.map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors duration-200",
                      index === currentStep
                        ? "bg-purple-500"
                        : index < currentStep
                          ? "bg-purple-300"
                          : "bg-gray-300 dark:bg-gray-600"
                    )}
                  />
                ))}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                {currentStep + 1} / {guidanceSteps.length}
              </div>
            </div>

            {/* Action */}
            {currentStep === guidanceSteps.length - 1 && (
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
              >
                <Button
                  onClick={handleDismiss}
                  size="sm"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Got it, let's start editing!
                </Button>
              </m.div>
            )}
          </div>

          {/* Pointer for targeted guidance */}
          {currentGuidance.position === 'top' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white dark:border-t-gray-800" />
          )}
        </m.div>

        {/* Section Highlight with Cutout Effect */}
        {currentGuidance.highlight && currentGuidance.targetSelector && (
          <SectionHighlight
            targetSelector={currentGuidance.targetSelector}
            createCutout={true}
          />
        )}
      </m.div>
    </AnimatePresence>
  )
}

/**
 * Highlights a specific section with animated border and optional cutout effect
 */
function SectionHighlight({
  targetSelector,
  createCutout = false
}: {
  targetSelector: string
  createCutout?: boolean
}) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const findTarget = () => {
      const element = document.querySelector(targetSelector)
      if (element) {
        const rect = element.getBoundingClientRect()
        setTargetRect(rect)
      }
    }

    // Find target immediately
    findTarget()

    // Also check after a delay in case the element isn't ready yet
    const timer = setTimeout(findTarget, 500)

    // Update on scroll/resize
    const handleUpdate = () => findTarget()
    window.addEventListener('scroll', handleUpdate)
    window.addEventListener('resize', handleUpdate)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [targetSelector])

  if (!targetRect) return null

  return (
    <>
      {/* Cutout Effect - Clear area around target */}
      {createCutout && (
        <div
          style={{
            position: 'fixed',
            left: targetRect.left - 12,
            top: targetRect.top - 12,
            width: targetRect.width + 24,
            height: targetRect.height + 24,
            background: 'transparent',
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.3)`,
            pointerEvents: 'none',
            zIndex: 39,
            borderRadius: '12px'
          }}
        />
      )}

      {/* Highlight Border */}
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          position: 'fixed',
          left: targetRect.left - 8,
          top: targetRect.top - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
          pointerEvents: 'none',
          zIndex: 40
        }}
        className="border-3 border-purple-500 rounded-lg"
      >
        {/* Animated Border */}
        <div className="absolute inset-0 border-3 border-purple-500 rounded-lg animate-pulse" />

        {/* Glowing Effect */}
        <div className="absolute inset-0 border-3 border-purple-400/50 rounded-lg blur-sm" />

        {/* Corner Indicators */}
        {[
          { position: 'top-0 left-0', rotation: '0deg' },
          { position: 'top-0 right-0', rotation: '90deg' },
          { position: 'bottom-0 right-0', rotation: '180deg' },
          { position: 'bottom-0 left-0', rotation: '270deg' }
        ].map((corner, index) => (
          <m.div
            key={index}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className={`absolute ${corner.position} w-6 h-6 -translate-x-1/2 -translate-y-1/2`}
            style={{ transform: `rotate(${corner.rotation})` }}
          >
            <div className="w-full h-full bg-purple-500 rounded-full flex items-center justify-center">
              <Icon name="edit" className="w-3 h-3 text-white"  />
            </div>
          </m.div>
        ))}
      </m.div>
    </>
  )
}
