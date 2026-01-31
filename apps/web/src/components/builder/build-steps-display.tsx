'use client'

import { Card } from '@/components/ui/card'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// Step IDs that match the translation keys
const STEP_IDS = ['analyzing', 'researching', 'planning', 'designing', 'optimizing', 'finalizing'] as const
type StepId = (typeof STEP_IDS)[number]

// Step icons (non-translatable)
const STEP_ICONS: Record<StepId, IconName> = {
  analyzing: 'brain',
  researching: 'search',
  planning: 'layout-grid',
  designing: 'sparkles',
  optimizing: 'zap',
  finalizing: 'check-circle'
}

// Step durations in milliseconds
const STEP_DURATION = 800

interface BuildStepsDisplayProps {
  onComplete?: () => void
  businessIdea: string
}

export function BuildStepsDisplay({ onComplete, businessIdea }: BuildStepsDisplayProps) {
  const t = useTranslations('builder')
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)

  // Total duration based on step count
  const totalDuration = STEP_IDS.length * STEP_DURATION

  useEffect(() => {
    let elapsed = 0
    let stepIndex = 0
    let stepElapsed = 0

    const interval = setInterval(() => {
      elapsed += 50
      stepElapsed += 50

      // Update overall progress
      setProgress((elapsed / totalDuration) * 100)

      // Check if we need to move to next step
      if (stepElapsed >= STEP_DURATION && stepIndex < STEP_IDS.length - 1) {
        stepIndex++
        stepElapsed = 0
        setCurrentStep(stepIndex)
      }

      // Complete when we reach the end
      if (elapsed >= totalDuration) {
        clearInterval(interval)
        if (onComplete) {
          setTimeout(onComplete, 500) // Small delay for visual effect
        }
      }
    }, 50)

    return () => clearInterval(interval)
  }, [onComplete, totalDuration])

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-6 z-50">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-purple-900/30 border border-purple-700 rounded-full mb-6">
            <Icon name="sparkles" className="w-5 h-5 text-purple-400 animate-pulse" />
            <span className="text-purple-200 font-medium">{t('humanProgress.header.badge')}</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t('humanProgress.header.title')}
          </h1>

          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            {businessIdea ? `"${businessIdea.slice(0, 80)}${businessIdea.length > 80 ? '...' : ''}"` : t('ideaCapture.description')}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-gray-400 text-center">
            {Math.round(progress)}%
          </div>
        </div>

        {/* Build Steps */}
        <div className="grid gap-4">
          {STEP_IDS.map((stepId, index) => {
            const isActive = index === currentStep
            const isComplete = index < currentStep
            const isPending = index > currentStep

            return (
              <Card
                key={stepId}
                className={`
                  p-6 border transition-all duration-500
                  ${isActive ? 'bg-purple-900/20 border-purple-600 scale-105 shadow-lg shadow-purple-500/20' : ''}
                  ${isComplete ? 'bg-gray-800/50 border-gray-700' : ''}
                  ${isPending ? 'bg-gray-900/50 border-gray-800 opacity-50' : ''}
                `}
              >
                <div className="flex items-center gap-4">
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500
                    ${isActive ? 'bg-purple-600 animate-pulse' : ''}
                    ${isComplete ? 'bg-green-600' : ''}
                    ${isPending ? 'bg-gray-700' : ''}
                  `}>
                    <Icon
                      name={isComplete ? 'check' : STEP_ICONS[stepId]}
                      className={`w-6 h-6 ${isActive || isComplete ? 'text-white' : 'text-gray-400'}`}
                    />
                  </div>

                  <div className="flex-1">
                    <h3 className={`
                      text-lg font-semibold transition-colors duration-500
                      ${isActive ? 'text-white' : ''}
                      ${isComplete ? 'text-gray-300' : ''}
                      ${isPending ? 'text-gray-500' : ''}
                    `}>
                      {t(`humanProgress.steps.${stepId}.title`)}
                    </h3>
                    <p className={`
                      text-sm transition-colors duration-500
                      ${isActive ? 'text-gray-300' : ''}
                      ${isComplete ? 'text-gray-400' : ''}
                      ${isPending ? 'text-gray-600' : ''}
                    `}>
                      {t(`humanProgress.steps.${stepId}.description`)}
                    </p>
                  </div>

                  {isActive && (
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        {/* Tips */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            {t(`humanProgress.tips.${STEP_IDS[currentStep]}`)}
          </p>
        </div>
      </div>
    </div>
  )
}
