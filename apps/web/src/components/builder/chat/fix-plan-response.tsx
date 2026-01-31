/**
 * Fix Plan Response Component  
 * Renders fix plan responses with issue analysis, solution details, and convert-to-build action
 * Designed for the NEW fix plan structure from chat-plan API
 */

'use client'

import { useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileEdit,
  Lightbulb,
  Play,
  Target,
  Wrench
} from 'lucide-react'

interface FixPlanData {
  issue: {
    description: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    category: string
  }
  rootCause: string
  solution: {
    approach: string
    changes: Array<{
      file: string
      changeType: 'modify' | 'create' | 'delete'
      description: string
    }>
    testingStrategy: string
  }
  preventionTips?: string[]
  buildPrompt?: string
}

interface FixPlanResponseProps {
  plan: FixPlanData
  onConvertToBuild?: (planData: any) => void
  className?: string
}

const severityColors = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

const changeTypeColors = {
  modify: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

export function FixPlanResponse({ plan, onConvertToBuild, className = '' }: FixPlanResponseProps) {
  const [showChanges, setShowChanges] = useState(true)
  const [showPrevention, setShowPrevention] = useState(false)

  const handleStartBuilding = () => {
    if (onConvertToBuild) {
      // Convert the fix plan data to the format expected by the convert-to-build system
      const convertData = {
        mode: 'fix',
        issue: plan.issue,
        rootCause: plan.rootCause,
        solution: plan.solution,
        preventionTips: plan.preventionTips,
        buildPrompt: plan.buildPrompt
      }
      onConvertToBuild(convertData)
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className="p-6 space-y-6 bg-gray-800/50 border-gray-600">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Wrench className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">Fix Plan</h3>
              <p className="text-sm text-gray-400">{plan.issue.category}</p>
            </div>
          </div>
          <Badge className={severityColors[plan.issue.severity]}>
            {plan.issue.severity} severity
          </Badge>
        </div>

        {/* Issue Description */}
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-300">
            <Target className="w-4 h-4" />
            <span className="font-medium">Issue Analysis</span>
          </div>
          <p className="text-gray-300 leading-relaxed">{plan.issue.description}</p>
        </div>

        {/* Root Cause */}
        {plan.rootCause && (
          <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-orange-300">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Root Cause</span>
            </div>
            <p className="text-gray-300 leading-relaxed">{plan.rootCause}</p>
          </div>
        )}

        {/* Solution Approach */}
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-blue-300">
            <Target className="w-4 h-4" />
            <span className="font-medium">Solution Approach</span>
          </div>
          <p className="text-gray-300 leading-relaxed">{plan.solution.approach}</p>
        </div>

        {/* Changes Required */}
        {plan.solution.changes && plan.solution.changes.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowChanges(!showChanges)}
              className="flex items-center gap-2 text-gray-100 hover:text-blue-400 transition-colors"
            >
              <FileEdit className="w-4 h-4" />
              <span className="font-medium">Changes Required ({plan.solution.changes.length})</span>
              {showChanges ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {showChanges && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2"
              >
                {plan.solution.changes.map((change, index) => (
                  <div key={index} className="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-200">{change.file}</span>
                      <Badge className={changeTypeColors[change.changeType]} variant="outline">
                        {change.changeType}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-300">{change.description}</p>
                  </div>
                ))}
              </m.div>
            )}
          </div>
        )}

        {/* Testing Strategy */}
        {plan.solution.testingStrategy && (
          <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-300">
              <Target className="w-4 h-4" />
              <span className="font-medium">Testing Strategy</span>
            </div>
            <p className="text-gray-300 leading-relaxed">{plan.solution.testingStrategy}</p>
          </div>
        )}

        {/* Prevention Tips */}
        {plan.preventionTips && plan.preventionTips.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowPrevention(!showPrevention)}
              className="flex items-center gap-2 text-gray-100 hover:text-green-400 transition-colors"
            >
              <Lightbulb className="w-4 h-4" />
              <span className="font-medium">Prevention Tips</span>
              {showPrevention ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {showPrevention && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 space-y-2"
              >
                {plan.preventionTips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-300">{tip}</p>
                  </div>
                ))}
              </m.div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-600">
          <Button
            onClick={handleStartBuilding}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Building
          </Button>
          <p className="text-xs text-gray-400">
            This will apply the fix to your project
          </p>
        </div>
      </Card>
    </m.div>
  )
}