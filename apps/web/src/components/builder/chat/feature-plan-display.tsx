/**
 * Feature Plan Display Component
 * Renders feature planning responses with steps, acceptance criteria, and conversion options
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { type FeaturePlanResponse } from '@/types/chat-plan'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit,
  FileText,
  Play
} from 'lucide-react'
import { useState } from 'react'
import { UsageFooter } from './usage-footer'

interface FeaturePlanDisplayProps {
  plan: FeaturePlanResponse
  onConvertToBuild?: () => void
  onModifyPlan?: () => void
  isConverting?: boolean
  className?: string
  translations?: {
    title?: string
    description?: string
    feasibility?: string
    estimatedTime?: string
    steps?: string
    acceptanceCriteria?: string
    technicalNotes?: string
    convertToBuild?: string
    modifyPlan?: string
    minutes?: string
    files?: string
    dependencies?: string
  }
}

const defaultTranslations = {
  title: 'Feature Plan',
  description: 'Description',
  feasibility: 'Feasibility',
  estimatedTime: 'Estimated Time',
  steps: 'Implementation Steps',
  acceptanceCriteria: 'Acceptance Criteria',
  technicalNotes: 'Technical Notes',
  convertToBuild: 'Convert to Build',
  modifyPlan: 'Modify Plan',
  minutes: 'minutes',
  files: 'files',
  dependencies: 'dependencies'
}

const feasibilityColors = {
  simple: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  complex: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

export function FeaturePlanDisplay({
  plan,
  onConvertToBuild,
  onModifyPlan,
  isConverting = false,
  className = '',
  translations = defaultTranslations
}: FeaturePlanDisplayProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [showTechnicalNotes, setShowTechnicalNotes] = useState(false)

  const t = { ...defaultTranslations, ...translations }

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  const completionProgress = 0 // This would come from actual build progress

  return (
    <Card className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {plan.title}
          </h3>
          <Badge className={feasibilityColors[plan.feasibility]}>
            {plan.feasibility}
          </Badge>
        </div>

        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {plan.description}
        </p>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{plan.estimated_time_minutes} {t.minutes}</span>
          </div>
          <div className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            <span>{plan.steps.reduce((sum, step) => sum + step.files_affected.length, 0)} {t.files}</span>
          </div>
        </div>
      </div>

      {/* Progress (if build is active) */}
      {completionProgress > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Build Progress</span>
            <span className="font-medium">{completionProgress}%</span>
          </div>
          <Progress value={completionProgress} className="h-2" />
        </div>
      )}

      {/* Implementation Steps */}
      <div className="space-y-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          {t.steps}
        </h4>

        <div className="space-y-3">
          {plan.steps.map((step, index) => (
            <div key={step.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleStep(step.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium">
                    {index + 1}
                  </div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {step.title}
                  </span>
                </div>
                {expandedSteps.has(step.id) ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {expandedSteps.has(step.id) && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    {step.description}
                  </p>

                  {/* Files affected */}
                  {step.files_affected.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Files to modify:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {step.files_affected.map(file => (
                          <Badge key={file} variant="outline" className="text-xs">
                            {file}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependencies */}
                  {step.dependencies && step.dependencies.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Dependencies:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {step.dependencies.map((dep, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-900/20">
                            {typeof dep === 'string' ? dep : dep.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Acceptance Criteria */}
      <div className="space-y-3">
        <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          {t.acceptanceCriteria}
        </h4>

        <ul className="space-y-2">
          {plan.acceptance_criteria.map((criteria, index) => (
            <li key={index} className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-gray-700 dark:text-gray-300 text-sm">
                {criteria}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Technical Notes */}
      {plan.technical_notes && plan.technical_notes.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowTechnicalNotes(!showTechnicalNotes)}
            className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors"
          >
            <AlertCircle className="w-5 h-5" />
            {t.technicalNotes}
            {showTechnicalNotes ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {showTechnicalNotes && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-2">
              {Array.isArray(plan.technical_notes)
                ? plan.technical_notes.map((note, index) => (
                    <p key={index} className="text-blue-800 dark:text-blue-300 text-sm">
                      • {note}
                    </p>
                  ))
                : (
                    <p className="text-blue-800 dark:text-blue-300 text-sm">
                      {plan.technical_notes}
                    </p>
                  )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onConvertToBuild && (
          <Button
            onClick={onConvertToBuild}
            disabled={isConverting}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isConverting ? 'Converting...' : t.convertToBuild}
          </Button>
        )}

        {onModifyPlan && (
          <Button
            variant="outline"
            onClick={onModifyPlan}
            className="flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            {t.modifyPlan}
          </Button>
        )}
      </div>

      {/* Usage Footer */}
      <UsageFooter metadata={plan.metadata} />
    </Card>
  )
}

/**
 * Compact feature plan display for timeline view
 */
export function CompactFeaturePlan({
  plan,
  onExpand
}: {
  plan: FeaturePlanResponse
  onExpand?: () => void
}) {
  return (
    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-medium text-purple-900 dark:text-purple-100">
          {plan.title}
        </h4>
        <Badge className={feasibilityColors[plan.feasibility]}>
          {plan.feasibility}
        </Badge>
      </div>

      <p className="text-purple-800 dark:text-purple-300 text-sm line-clamp-2">
        {plan.description}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-purple-700 dark:text-purple-400">
          <span>{plan.steps.length} steps</span>
          <span>{plan.estimated_time_minutes} min</span>
        </div>

        {onExpand && (
          <Button variant="ghost" size="sm" onClick={onExpand}>
            View Plan
          </Button>
        )}
      </div>
    </div>
  )
}
