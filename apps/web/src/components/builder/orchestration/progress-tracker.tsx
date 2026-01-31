'use client'

import React, { useState, useEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'




import { cn } from '@/lib/utils'
import { CacheStatus } from '../cache-status'

interface BuildStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'complete'
  detail?: string
  progress?: number
}

interface ProgressTrackerProps {
  buildProgress: number
  onProgressUpdate?: (progress: number) => void
  translations: {
    buildLog: {
      title: string
      steps: {
        analyzing: string
        scaffolding: string
        generating: string
        styling: string
        deploying: string
      }
    }
  }
}

export function ProgressTracker({
  buildProgress,
  onProgressUpdate,
  translations
}: ProgressTrackerProps) {
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])

  // Initialize build steps
  useEffect(() => {
    const steps: BuildStep[] = [
      { 
        id: '1', 
        label: translations.buildLog.steps.analyzing, 
        status: buildProgress > 0 ? 'complete' : 'pending', 
        progress: buildProgress > 0 ? 100 : 0,
        detail: 'AI-powered business intelligence analysis'
      },
      { 
        id: '2', 
        label: translations.buildLog.steps.generating, 
        status: buildProgress > 40 ? 'active' : 'pending', 
        progress: buildProgress > 40 ? Math.min((buildProgress - 40) * 2.5, 100) : 0,
        detail: 'Names, taglines, and feature generation'
      },
      { 
        id: '3', 
        label: translations.buildLog.steps.styling, 
        status: buildProgress > 70 ? 'active' : 'pending', 
        progress: buildProgress > 70 ? Math.min((buildProgress - 70) * 3.33, 100) : 0,
        detail: 'UI design and branding creation'
      },
      { 
        id: '4', 
        label: translations.buildLog.steps.scaffolding, 
        status: buildProgress > 85 ? 'active' : 'pending', 
        progress: buildProgress > 85 ? Math.min((buildProgress - 85) * 6.67, 100) : 0,
        detail: 'Code structure and components'
      },
      { 
        id: '5', 
        label: translations.buildLog.steps.deploying, 
        status: buildProgress >= 100 ? 'complete' : 'pending', 
        progress: buildProgress >= 100 ? 100 : 0,
        detail: 'Final optimization and deployment'
      },
    ]
    setBuildSteps(steps)
  }, [buildProgress, translations])

  // Simulate orchestration step progression
  const simulateOrchestrationStep = async (stepIndex: number, delay = 2000) => {
    await new Promise(resolve => setTimeout(resolve, delay))
    
    setBuildSteps(prev => {
      const newSteps = [...prev]
      if (newSteps[stepIndex]) {
        newSteps[stepIndex].status = 'active'
        
        // Simulate progress within the step
        let progress = 0
        const progressInterval = setInterval(() => {
          progress += Math.random() * 15 + 5
          if (progress >= 100) {
            progress = 100
            clearInterval(progressInterval)
            
            // Mark step as complete and move to next
            setTimeout(() => {
              setBuildSteps(current => {
                const updated = [...current]
                if (updated[stepIndex]) {
                  updated[stepIndex].status = 'complete'
                  updated[stepIndex].progress = 100
                }
                return updated
              })
              
              // Update overall progress
              const newOverallProgress = Math.min((stepIndex + 1) * 20 + 20, 100)
              onProgressUpdate?.(newOverallProgress)
              
              // Continue to next step
              if (stepIndex < buildSteps.length - 1) {
                simulateOrchestrationStep(stepIndex + 1)
              }
            }, 500)
          }
          
          setBuildSteps(current => {
            const updated = [...current]
            if (updated[stepIndex]) {
              updated[stepIndex].progress = progress
            }
            return updated
          })
        }, 200)
      }
      return newSteps
    })
  }

  // Start orchestration when component mounts
  useEffect(() => {
    if (buildProgress > 0 && buildSteps.length > 0) {
      const activeStepIndex = buildSteps.findIndex(step => step.status === 'active')
      if (activeStepIndex === -1) {
        // No active step, start the first pending step
        const nextStepIndex = buildSteps.findIndex(step => step.status === 'pending')
        if (nextStepIndex > 0) {
          simulateOrchestrationStep(nextStepIndex, 1000)
        }
      }
    }
  }, [buildProgress, buildSteps, simulateOrchestrationStep])

  return (
    <m.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-72 border-l border-gray-800 flex flex-col bg-gray-900/50"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="code" className="w-5 h-5 text-green-400"  />
            {translations.buildLog.title}
          </h2>
          
          {/* Status Indicators */}
          <div className="flex items-center gap-2">
            {/* AI Service Status */}
            <div className="flex items-center gap-2 px-2 py-1 bg-green-900/50 rounded-full text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-300">Real AI</span>
            </div>
            
            {/* Cache Status */}
            <CacheStatus />
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Overall Progress */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-purple-400">{Math.round(buildProgress)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <m.div
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                initial={{ width: 0 }}
                animate={{ width: `${buildProgress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            
            {/* Status */}
            <div className="flex items-center gap-2 mt-3">
              <Icon name="rocket" className="w-4 h-4 text-green-400"  />
              <span className="text-xs text-gray-400">
                {buildProgress >= 100 ? 'Build Complete' : 'Building...'}
              </span>
            </div>
          </div>

          {/* Build Steps */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Build Steps</h3>
            <AnimatePresence>
              {buildSteps.map((step, index) => (
                <m.div
                  key={step.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-all duration-300",
                    step.status === 'complete' && "bg-green-500/10 border-green-500/30",
                    step.status === 'active' && "bg-purple-500/10 border-purple-500/30",
                    step.status === 'pending' && "bg-gray-800/50 border-gray-700"
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {step.status === 'complete' ? (
                      <Icon name="check-circle" className="w-5 h-5 text-green-400"  />
                    ) : step.status === 'active' ? (
                      <m.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Icon name="zap" className="w-5 h-5 text-purple-400"  />
                      </m.div>
                    ) : (
                      <Icon name="circle" className="w-5 h-5 text-gray-500"  />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className={cn(
                        "text-sm font-medium",
                        step.status === 'complete' && "text-green-300",
                        step.status === 'active' && "text-purple-300",
                        step.status === 'pending' && "text-gray-400"
                      )}>
                        {step.label}
                      </h4>
                      
                      {step.status === 'active' && step.progress !== undefined && (
                        <span className="text-xs text-purple-400">
                          {Math.round(step.progress)}%
                        </span>
                      )}
                    </div>
                    
                    {step.detail && (
                      <p className="text-xs text-gray-500 mt-1">{step.detail}</p>
                    )}
                    
                    {step.status === 'active' && step.progress !== undefined && (
                      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden mt-2">
                        <m.div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${step.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </div>
                </m.div>
              ))}
            </AnimatePresence>
          </div>

          {/* System Stats */}
          {buildProgress > 50 && (
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 rounded-lg p-4 space-y-3"
            >
              <h3 className="text-sm font-medium text-gray-300">Build Stats</h3>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Components Generated</span>
                  <span className="text-green-400">{Math.min(Math.floor(buildProgress / 10), 12)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">AI Tokens Used</span>
                  <span className="text-blue-400">{Math.floor(buildProgress * 25 + 1200)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Build Time</span>
                  <span className="text-purple-400">{Math.floor(buildProgress * 0.3 + 15)}s</span>
                </div>
              </div>
            </m.div>
          )}
        </div>
      </div>
    </m.div>
  )
}