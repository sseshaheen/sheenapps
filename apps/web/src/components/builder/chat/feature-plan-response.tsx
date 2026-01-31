'use client'

import Icon from '@/components/ui/icon'
import { m } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface FeaturePlan {
  summary: string
  feasibility: 'simple' | 'moderate' | 'complex'
  plan: {
    overview: string
    steps: Array<{
      order: number
      title: string
      description: string
      files: string[]
      estimatedEffort: 'low' | 'medium' | 'high'
    }>
    risks: string[]
    alternatives?: string[]
  }
  buildPrompt?: string
}

interface FeaturePlanResponseProps {
  plan: FeaturePlan
  onConvertToBuild?: (plan: FeaturePlan) => void
  className?: string
}

export function FeaturePlanResponse({ plan, onConvertToBuild, className }: FeaturePlanResponseProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [showRisks, setShowRisks] = useState(false)
  const [showAlternatives, setShowAlternatives] = useState(false)

  // Removed effort and feasibility helper functions to simplify UX

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary Hero Card - Dark Theme */}
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm"
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            💡 Enhancement Plan
          </h3>
          {/* Feasibility badge commented out per UX feedback */}
          {/* <div className={cn(
            "px-3 py-1 rounded-full text-sm font-medium border",
            plan.feasibility === 'simple'
              ? 'text-emerald-300 bg-emerald-900/30 border-emerald-500/40'
              : plan.feasibility === 'moderate'
              ? 'text-amber-300 bg-amber-900/30 border-amber-500/40'
              : 'text-red-300 bg-red-900/30 border-red-500/40'
          )}>
            {plan.feasibility} project
          </div> */}
        </div>

        <p className="text-gray-300 mb-4">{plan.summary}</p>

        {/* Steps count removed from prominent display per UX feedback */}

        <p className="text-gray-400 text-sm">{plan.plan.overview}</p>
      </m.div>

      {/* Implementation Steps */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-100 flex items-center gap-2">
          <Icon name="list" className="w-4 h-4" />
          Implementation Steps
        </h4>

        {plan.plan.steps.map((step, index) => (
          <m.div
            key={step.order}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="border border-gray-600/30 bg-gray-800/20 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => setExpandedStep(expandedStep === step.order ? null : step.order)}
              className="w-full p-4 text-left hover:bg-gray-700/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-full flex items-center justify-center text-sm font-medium">
                    {step.order}
                  </div>
                  <span className="font-medium text-gray-200">{step.title}</span>
                  {/* Effort level badge removed per UX feedback */}
                </div>
                <Icon
                  name="chevron-down"
                  className={cn(
                    "w-4 h-4 text-gray-400 transition-transform",
                    expandedStep === step.order && "rotate-180"
                  )}
                />
              </div>
            </button>

            {expandedStep === step.order && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-4 border-t border-gray-600/30"
              >
                <p className="text-gray-300 mb-3">{step.description}</p>

                {step.files.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-gray-400 mb-2">Files to modify:</div>
                    <div className="flex flex-wrap gap-2">
                      {step.files.map((file, fileIndex) => (
                        <span
                          key={fileIndex}
                          className="bg-gray-700/50 text-gray-300 border border-gray-600/30 px-2 py-1 rounded text-sm font-mono"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </m.div>
            )}
          </m.div>
        ))}
      </div>

      {/* Risks and Alternatives */}
      <div className="space-y-4">
        {/* Risks */}
        <div className="border border-amber-500/30 bg-amber-900/20 rounded-lg p-4">
          <button
            onClick={() => setShowRisks(!showRisks)}
            className="w-full flex items-center justify-between text-left mb-2"
          >
            <h4 className="font-medium text-amber-300 flex items-center gap-2">
              <Icon name="info" className="w-4 h-4" />
              Considerations ({plan.plan.risks.length})
            </h4>
            <Icon
              name="chevron-down"
              className={cn(
                "w-4 h-4 text-amber-400 transition-transform",
                showRisks && "rotate-180"
              )}
            />
          </button>

          {showRisks && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              {plan.plan.risks.map((risk, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Icon name="minus" className="w-3 h-3 text-amber-400 mt-1 flex-shrink-0" />
                  <span className="text-sm text-amber-200">{risk}</span>
                </div>
              ))}
            </m.div>
          )}
        </div>

        {/* Alternatives */}
        {plan.plan.alternatives && plan.plan.alternatives.length > 0 && (
          <div className="border border-blue-500/30 bg-blue-900/20 rounded-lg p-4">
            <button
              onClick={() => setShowAlternatives(!showAlternatives)}
              className="w-full flex items-center justify-between text-left mb-2"
            >
              <h4 className="font-medium text-blue-300 flex items-center gap-2">
                <Icon name="lightbulb" className="w-4 h-4" />
                Alternatives ({plan.plan.alternatives.length})
              </h4>
              <Icon
                name="chevron-down"
                className={cn(
                  "w-4 h-4 text-blue-400 transition-transform",
                  showAlternatives && "rotate-180"
                )}
              />
            </button>

            {showAlternatives && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2"
              >
                {plan.plan.alternatives.map((alternative, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Icon name="arrow-right" className="w-3 h-3 text-blue-400 mt-1 flex-shrink-0" />
                    <span className="text-sm text-blue-200">{alternative}</span>
                  </div>
                ))}
              </m.div>
            )}
          </div>
        )}
      </div>

      {/* Action Zone */}
      {plan.buildPrompt && onConvertToBuild && (
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gradient-to-r from-emerald-600 to-blue-600 rounded-xl p-6 text-white border border-emerald-500/20"
        >
          <div className="text-center">
            <h4 className="text-lg font-semibold mb-2">Ready to build this?</h4>
            <p className="text-emerald-100 text-sm mb-4">
              I can start implementing these enhancements right away
            </p>
            <button
              onClick={() => onConvertToBuild?.(plan)}
              className="bg-white/20 hover:bg-white/30 transition-colors px-6 py-3 rounded-lg font-medium flex items-center gap-2 border border-white/10 mx-auto"
            >
              <Icon name="rocket" className="w-4 h-4" />
              Start Building
            </button>
          </div>
        </m.div>
      )}
    </div>
  )
}
