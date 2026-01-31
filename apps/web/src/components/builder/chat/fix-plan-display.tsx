/**
 * Fix Plan Display Component
 * Renders bug fix planning responses with analysis, solutions, and testing notes
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { type FixPlanResponse } from '@/types/chat-plan'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit,
  Lightbulb,
  Play,
  Shield,
  Target,
  Wrench
} from 'lucide-react'
import { useState } from 'react'
import { UsageFooter } from './usage-footer'

interface FixPlanDisplayProps {
  plan: FixPlanResponse
  onConvertToBuild?: () => void
  onModifyPlan?: () => void
  isConverting?: boolean
  className?: string
  translations?: {
    title?: string
    issueAnalysis?: string
    rootCause?: string
    confidence?: string
    solutions?: string
    preventionTips?: string
    convertToBuild?: string
    modifyPlan?: string
    riskLevel?: string
    testingNotes?: string
    filesAffected?: string
    steps?: string
  }
}

const defaultTranslations = {
  title: 'Bug Fix Plan',
  issueAnalysis: 'Issue Analysis',
  rootCause: 'Root Cause',
  confidence: 'Confidence',
  solutions: 'Proposed Solutions',
  preventionTips: 'Prevention Tips',
  convertToBuild: 'Apply Fix',
  modifyPlan: 'Modify Plan',
  riskLevel: 'Risk Level',
  testingNotes: 'Testing Notes',
  filesAffected: 'Files Affected',
  steps: 'Steps'
}

const confidenceColors = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

const riskColors = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

const riskIcons = {
  low: CheckCircle2,
  medium: AlertTriangle,
  high: AlertTriangle
}

export function FixPlanDisplay({
  plan,
  onConvertToBuild,
  onModifyPlan,
  isConverting = false,
  className = '',
  translations = defaultTranslations
}: FixPlanDisplayProps) {
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set([plan.solutions[0]?.id]))
  const [showPrevention, setShowPrevention] = useState(false)
  const [selectedSolution, setSelectedSolution] = useState<string>(plan.solutions[0]?.id || '')

  const t = { ...defaultTranslations, ...translations }

  const toggleSolution = (solutionId: string) => {
    setExpandedSolutions(prev => {
      const next = new Set(prev)
      if (next.has(solutionId)) {
        next.delete(solutionId)
      } else {
        next.add(solutionId)
      }
      return next
    })
  }

  const selectSolution = (solutionId: string) => {
    setSelectedSolution(solutionId)
    setExpandedSolutions(new Set([solutionId]))
  }

  return (
    <Card className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-red-600" />
            {t.title}
          </h3>
          <Badge className={confidenceColors[plan.confidence]}>
            {plan.confidence} {t.confidence}
          </Badge>
        </div>

        {/* Issue Analysis */}
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 space-y-3">
          <h4 className="text-lg font-medium text-red-900 dark:text-red-100 flex items-center gap-2">
            <Target className="w-5 h-5" />
            {t.issueAnalysis}
          </h4>
          <p className="text-red-800 dark:text-red-300 leading-relaxed">
            {plan.issue_analysis}
          </p>
        </div>

        {/* Root Cause */}
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 space-y-3">
          <h4 className="text-lg font-medium text-orange-900 dark:text-orange-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t.rootCause}
          </h4>
          <p className="text-orange-800 dark:text-orange-300 leading-relaxed">
            {plan.root_cause}
          </p>
        </div>
      </div>

      {/* Proposed Solutions */}
      <div className="space-y-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          {t.solutions}
        </h4>

        <div className="space-y-3">
          {plan.solutions.map((solution, index) => {
            const RiskIcon = riskIcons[solution.risk_level]
            const isExpanded = expandedSolutions.has(solution.id)
            const isSelected = selectedSolution === solution.id

            return (
              <div
                key={solution.id}
                className={`border rounded-lg transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <button
                  onClick={() => toggleSolution(solution.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium">
                      {index + 1}
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {solution.title}
                    </span>
                    <Badge className={riskColors[solution.risk_level]}>
                      <RiskIcon className="w-3 h-3 mr-1" />
                      {solution.risk_level} risk
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isSelected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          selectSolution(solution.id)
                        }}
                      >
                        Select
                      </Button>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-gray-700 dark:text-gray-300 text-sm">
                      {solution.description}
                    </p>

                    {/* Implementation Steps */}
                    <div className="space-y-3">
                      <h5 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {t.steps}:
                      </h5>
                      <ol className="space-y-2">
                        {solution.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="flex items-start gap-3">
                            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium mt-0.5">
                              {stepIndex + 1}
                            </div>
                            <span className="text-gray-700 dark:text-gray-300 text-sm">
                              {typeof step === 'string' ? step : step.description}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Files Affected */}
                    {solution.files_affected.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          {t.filesAffected}:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {solution.files_affected.map(file => (
                            <Badge key={file} variant="outline" className="text-xs">
                              {file}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Testing Notes */}
                    {solution.testing_notes && solution.testing_notes.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          {t.testingNotes}:
                        </span>
                        <ul className="space-y-1">
                          {Array.isArray(solution.testing_notes)
                            ? solution.testing_notes.map((note, noteIndex) => (
                                <li key={noteIndex} className="flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-green-600 mt-1 flex-shrink-0" />
                                  <span className="text-gray-700 dark:text-gray-300 text-xs">
                                    {note}
                                  </span>
                                </li>
                              ))
                            : (
                                <li className="flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-green-600 mt-1 flex-shrink-0" />
                                  <span className="text-gray-700 dark:text-gray-300 text-xs">
                                    {solution.testing_notes}
                                  </span>
                                </li>
                              )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Prevention Tips */}
      {plan.prevention_tips && plan.prevention_tips.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPrevention(!showPrevention)}
            className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-gray-100 hover:text-green-600 transition-colors"
          >
            <Lightbulb className="w-5 h-5" />
            {t.preventionTips}
            {showPrevention ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {showPrevention && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-2">
              {plan.prevention_tips.map((tip, index) => (
                <p key={index} className="text-green-800 dark:text-green-300 text-sm flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {tip}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onConvertToBuild && selectedSolution && (
          <Button
            onClick={onConvertToBuild}
            disabled={isConverting}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isConverting ? 'Applying Fix...' : t.convertToBuild}
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
 * Compact fix plan display for timeline view
 */
export function CompactFixPlan({
  plan,
  onExpand
}: {
  plan: FixPlanResponse
  onExpand?: () => void
}) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-medium text-red-900 dark:text-red-100 flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          Bug Fix Plan
        </h4>
        <Badge className={confidenceColors[plan.confidence]}>
          {plan.confidence}
        </Badge>
      </div>

      <p className="text-red-800 dark:text-red-300 text-sm line-clamp-2">
        {plan.issue_analysis}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-red-700 dark:text-red-400">
          <span>{plan.solutions.length} solutions</span>
          <span>{plan.solutions[0]?.risk_level} risk</span>
        </div>

        {onExpand && (
          <Button variant="ghost" size="sm" onClick={onExpand}>
            View Fix
          </Button>
        )}
      </div>
    </div>
  )
}
