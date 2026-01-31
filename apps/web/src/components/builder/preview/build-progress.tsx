'use client'

import React from 'react'
import { m } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'
// import { TypewriterText } from '@/components/ui/typing-animation'
import { cn } from '@/lib/utils'

interface BuildStep {
  id: string
  label: string
  icon: IconName
  duration: number
  message?: string
}

interface BuildProgressProps {
  currentBuildStep: string | null
  buildMessages: Record<string, string>
  completionPercentage: number
  isBuilding: boolean
  currentBuildStepIndex: number
}

export const BUILD_STEPS: BuildStep[] = [
  {
    id: 'analyzing',
    label: 'Understanding Your Business',
    icon: 'brain',
    duration: 2000
  },
  {
    id: 'structuring',
    label: 'Creating Site Structure',
    icon: 'layout-grid',
    duration: 1500
  },
  {
    id: 'designing',
    label: 'Applying Visual Design',
    icon: 'sparkles',
    duration: 2500
  },
  {
    id: 'integrating',
    label: 'Adding Features',
    icon: 'zap',
    duration: 2000
  },
  {
    id: 'optimizing',
    label: 'Optimizing Performance',
    icon: 'trending-up',
    duration: 1000
  }
]

interface BuildStepComponentProps {
  step: BuildStep
  active: boolean
  completed: boolean
  message?: string
}

function BuildStepComponent({ step, active, completed, message }: BuildStepComponentProps) {
  
  return (
    <m.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
        active && "bg-purple-500/10 border border-purple-500/20",
        completed && "bg-green-500/10 border border-green-500/20"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
        completed && "bg-green-500 text-white",
        active && "bg-purple-500 text-white",
        !active && !completed && "bg-gray-700 text-gray-400"
      )}>
        {completed ? (
          <Icon name="check-circle" className="w-4 h-4"  />
        ) : active ? (
          <Icon name="loader-2" className="w-4 h-4 animate-spin"  />
        ) : (
          <Icon name={step.icon} className="w-4 h-4" />
        )}
      </div>
      
      <div className="flex-1">
        <div className={cn(
          "font-medium transition-colors duration-300",
          active && "text-purple-300",
          completed && "text-green-300",
          !active && !completed && "text-gray-400"
        )}>
          {step.label}
        </div>
        
        {message && active && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-sm text-purple-200 mt-1"
          >
            {message}
          </m.div>
        )}
      </div>
    </m.div>
  )
}

export function BuildProgress({ 
  currentBuildStep, 
  buildMessages, 
  completionPercentage,
  isBuilding,
  currentBuildStepIndex 
}: BuildProgressProps) {
  // Always show if building is happening or has happened
  if (!isBuilding && completionPercentage === 0) {
    return (
      <m.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 border border-gray-700 rounded-lg p-6"
      >
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Icon name="circle" className="w-5 h-5 text-gray-400"  />
            Ready to Build
          </h4>
          <span className="text-sm text-gray-400">
            Waiting for build to start...
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Your app build will begin shortly
        </p>
      </m.div>
    )
  }

  return (
    <m.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-white flex items-center gap-2">
          {isBuilding ? (
            <>
              <Icon name="loader-2" className="w-5 h-5 text-purple-400 animate-spin"  />
              Building Your Business
            </>
          ) : (
            <>
              <Icon name="check-circle" className="w-5 h-5 text-green-400"  />
              Build Complete
            </>
          )}
        </h4>
        <span className="text-sm text-purple-400 font-medium">
          {Math.round(completionPercentage)}%
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <m.div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        
        {/* Progress Steps Indicators */}
        <div className="flex justify-between">
          {BUILD_STEPS.map((_, index) => (
            <m.div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-colors duration-300",
                index < currentBuildStepIndex ? "bg-green-500" : 
                index === currentBuildStepIndex ? "bg-purple-500" : "bg-gray-600"
              )}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
            />
          ))}
        </div>
      </div>
      
      {/* Build Steps */}
      <div className="space-y-2">
        {BUILD_STEPS.map((step, index) => (
          <BuildStepComponent
            key={step.id}
            step={step}
            active={currentBuildStep === step.id}
            completed={index < currentBuildStepIndex}
            message={buildMessages[step.id]}
          />
        ))}
      </div>
      
      {/* Current Message */}
      {isBuilding && currentBuildStep && buildMessages[currentBuildStep] && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg"
        >
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon name="circle" className="w-3 h-3 text-white fill-current"  />
            </div>
            <div>
              <div className="text-sm font-medium text-purple-200 mb-1">
                In Progress
              </div>
              <div className="text-sm text-purple-300">
                {buildMessages[currentBuildStep]}
              </div>
            </div>
          </div>
        </m.div>
      )}
      
      {/* Completion Message */}
      {!isBuilding && completionPercentage >= 100 && (
        <m.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center"
        >
          <Icon name="check-circle" className="w-8 h-8 text-green-400 mx-auto mb-2"  />
          <div className="text-green-300 font-medium mb-1">
            Your Business Site is Ready!
          </div>
          <div className="text-sm text-green-400">
            All features have been implemented based on your preferences
          </div>
        </m.div>
      )}
    </m.div>
  )
}

// Hook for managing build progress state
export function useBuildProgress() {
  const [buildState, setBuildState] = React.useState({
    currentBuildStep: null as string | null,
    buildMessages: {} as Record<string, string>,
    completionPercentage: 0,
    isBuilding: false,
    currentBuildStepIndex: 0
  })

  const startBuild = React.useCallback(() => {
    setBuildState(prev => ({
      ...prev,
      isBuilding: true,
      currentBuildStep: BUILD_STEPS[0].id,
      currentBuildStepIndex: 0,
      completionPercentage: 0
    }))
  }, [])

  const updateBuildStep = React.useCallback((stepId: string, message: string) => {
    const stepIndex = BUILD_STEPS.findIndex(step => step.id === stepId)
    
    setBuildState(prev => ({
      ...prev,
      currentBuildStep: stepId,
      currentBuildStepIndex: stepIndex,
      buildMessages: {
        ...prev.buildMessages,
        [stepId]: message
      },
      completionPercentage: ((stepIndex + 1) / BUILD_STEPS.length) * 100
    }))
  }, [])

  const completeBuild = React.useCallback(() => {
    setBuildState(prev => ({
      ...prev,
      isBuilding: false,
      currentBuildStep: null,
      completionPercentage: 100,
      currentBuildStepIndex: BUILD_STEPS.length
    }))
  }, [])

  const resetBuild = React.useCallback(() => {
    setBuildState({
      currentBuildStep: null,
      buildMessages: {},
      completionPercentage: 0,
      isBuilding: false,
      currentBuildStepIndex: 0
    })
  }, [])

  return {
    ...buildState,
    startBuild,
    updateBuildStep,
    completeBuild,
    resetBuild
  }
}