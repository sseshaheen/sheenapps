/**
 * Convert to Build Confirmation Dialog
 * Shows cost estimation and warnings before converting plans to builds
 * Implements user consent pattern for paid operations
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { type CostEstimate, type FeaturePlanResponse, type FixPlanResponse } from '@/types/chat-plan'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Coins,
  Play,
  X,
  Zap
} from 'lucide-react'
import { useState } from 'react'
import { PlanBuildHandshake } from './plan-build-handshake'

interface ConvertToBuildDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  onAddCredits?: () => void
  isConverting?: boolean
  plan: FeaturePlanResponse | FixPlanResponse
  costEstimate?: CostEstimate
  userBalance?: number
  className?: string
  translations?: {
    title?: string
    description?: string
    costEstimation?: string
    warning?: string
    cannotCancel?: string
    complexity?: string
    confirm?: string
    cancel?: string
    insufficientBalance?: string
    addCredits?: string
    estimatedTime?: string
    aiSeconds?: string
    currentBalance?: string
    afterCompletion?: string
    riskLevel?: string
    steps?: string
  }
}

const defaultTranslations = {
  title: 'Convert Plan to Build',
  description: 'Transform this plan into actual code changes',
  costEstimation: 'Cost Estimation',
  warning: 'Important Notice',
  cannotCancel: 'Once started, this operation cannot be cancelled',
  complexity: 'Complexity',
  confirm: 'Start Building',
  cancel: 'Cancel',
  insufficientBalance: 'Insufficient Balance',
  addCredits: 'Add Credits',
  estimatedTime: 'Estimated Time',
  aiSeconds: 'AI seconds',
  currentBalance: 'Current Balance',
  afterCompletion: 'After Completion',
  riskLevel: 'Risk Level',
  steps: 'steps'
}

function isFeaturePlan(plan: FeaturePlanResponse | FixPlanResponse): plan is FeaturePlanResponse {
  return plan.mode === 'feature'
}

export function ConvertToBuildDialog({
  open,
  onConfirm,
  onCancel,
  onAddCredits,
  isConverting = false,
  plan,
  costEstimate,
  userBalance = 0,
  className = '',
  translations = defaultTranslations
}: ConvertToBuildDialogProps) {
  const [showDetails, setShowDetails] = useState(false)

  const t = { ...defaultTranslations, ...translations }

  // Calculate cost estimates (proper minutes to seconds conversion)
  // Default multiplier of 1.2 accounts for AI processing overhead
  const DEFAULT_SECONDS_MULTIPLIER = 1.2
  const baseEstimatedSeconds = costEstimate?.estimatedSeconds ??
    (isFeaturePlan(plan) && plan.estimated_time_minutes
      ? Math.round(plan.estimated_time_minutes * 60) // minutes to seconds
      : 90) // fallback for fix plans

  const estimatedSeconds = Math.round(baseEstimatedSeconds * DEFAULT_SECONDS_MULTIPLIER)

  // Balance safety (avoid negative values)
  const safeBalance = Math.max(0, userBalance)
  const isBalanceSufficient = safeBalance >= estimatedSeconds
  const remainingBalance = Math.max(0, safeBalance - estimatedSeconds)

  // Progress bar value (avoid divide-by-zero / NaN)
  // EXPERT FIX ROUND 17: Invert to show "how much balance remains" (fuller = safer)
  // Previously showed "% consumed" which was counterintuitive (small bar = lots of headroom)
  const usagePct = safeBalance > 0
    ? Math.min(100, Math.round((estimatedSeconds / safeBalance) * 100))
    : 100
  const progressValue = Math.max(0, 100 - usagePct)

  // Get plan-specific info with robust access
  const planTitle = plan.mode === 'feature' ? plan.title : 'Bug Fix'
  const complexity = plan.mode === 'feature' ? plan.feasibility : plan.confidence

  // Robust stepCount access - handles both plan.steps and plan.plan.steps
  const featureSteps = plan.mode === 'feature'
    ? (plan.steps ?? (plan as FeaturePlanResponse).plan?.steps ?? [])
    : []
  const stepCount = plan.mode === 'feature'
    ? featureSteps.length
    : (plan.solutions?.[0]?.steps?.length ?? 0)

  const riskLevel = plan.mode === 'fix' ? plan.solutions?.[0]?.risk_level : undefined

  const complexityColors = {
    simple: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    complex: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    low: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }

  return (
    <Dialog open={open} onOpenChange={!isConverting ? (open) => !open && onCancel() : undefined}>
      <DialogContent className={`max-w-lg ${className}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Play className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            {t.title}
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            {t.description}: <span className="font-medium text-gray-800 dark:text-gray-200">{planTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Plan Overview */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t.complexity}:
              </span>
              <Badge className={complexityColors[complexity as keyof typeof complexityColors]}>
                {complexity}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Implementation steps:
              </span>
              <span className="text-sm text-gray-900 dark:text-gray-100">
                {stepCount} {t.steps}
              </span>
            </div>

            {riskLevel && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t.riskLevel}:
                </span>
                <Badge className={complexityColors[riskLevel as keyof typeof complexityColors]}>
                  {riskLevel}
                </Badge>
              </div>
            )}
          </div>

          {/* Plan→Build Handshake: Shows planned files during conversion */}
          {isConverting && (
            <PlanBuildHandshake
              plan={plan}
              state="generating"
              className="animate-in fade-in slide-in-from-top-2 duration-300"
            />
          )}

          {/* Cost Estimation - hide when converting to reduce visual noise */}
          {!isConverting && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Coins className="w-4 h-4" />
              {t.costEstimation}
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t.estimatedTime}:
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  ~{estimatedSeconds} {t.aiSeconds}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t.currentBalance}:
                </span>
                <span className={`text-sm font-medium ${
                  isBalanceSufficient ? 'text-green-600' : 'text-red-600'
                }`}>
                  {userBalance} {t.aiSeconds}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t.afterCompletion}:
                </span>
                <span className={`text-sm font-medium ${
                  remainingBalance > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600'
                }`}>
                  ~{remainingBalance} {t.aiSeconds}
                </span>
              </div>

              {/* Balance progress bar */}
              {/* EXPERT FIX ROUND 17: When insufficient, show 0 (not 100) since bar is now inverted */}
              <div className="space-y-2">
                <Progress
                  value={isBalanceSufficient ? progressValue : 0}
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0</span>
                  <span>{safeBalance} available</span>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Warning Section */}
          {/* <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  {t.warning}
                </h5>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {t.cannotCancel}. The AI will continue processing even if you close this page or navigate away.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This typically takes 3-5 minutes depending on project complexity.
                </p>
              </div>
            </div>
          </div> */}

          {/* Insufficient Balance Warning */}
          {!isBalanceSufficient && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-red-900 dark:text-red-100">
                    {t.insufficientBalance}
                  </h5>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    You need at least {estimatedSeconds} AI seconds to complete this build.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            {!isBalanceSufficient ? (
              <>
                <Button variant="outline" onClick={onCancel} className="flex-1">
                  {t.cancel}
                </Button>
                <Button
                  className="flex-1"
                  onClick={onAddCredits}
                  disabled={!onAddCredits}
                >
                  <Coins className="w-4 h-4 mr-2" />
                  {t.addCredits}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onCancel} disabled={isConverting} className="flex-1">
                  {t.cancel}
                </Button>
                <Button
                  onClick={onConfirm}
                  disabled={isConverting}
                  className="flex-1"
                >
                  {isConverting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Building...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      {t.confirm}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Additional Details Toggle */}
          {(plan.mode === 'feature' && plan.technical_notes) && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              {showDetails ? 'Hide' : 'Show'} technical details
              <ArrowRight className={`w-3 h-3 ml-1 inline transition-transform ${showDetails ? 'rotate-90' : ''}`} />
            </button>
          )}

          {/* Technical Details */}
          {showDetails && plan.mode === 'feature' && plan.technical_notes && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2">
              <h6 className="text-xs font-medium text-blue-900 dark:text-blue-100 uppercase tracking-wide">
                Technical Notes
              </h6>
              {Array.isArray(plan.technical_notes)
                ? plan.technical_notes.map((note, index) => (
                    <p key={index} className="text-xs text-blue-800 dark:text-blue-300">
                      • {note}
                    </p>
                  ))
                : (
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      {plan.technical_notes}
                    </p>
                  )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Quick build confirmation for simple operations
 */
interface QuickBuildConfirmProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  isConverting?: boolean
  estimatedSeconds?: number
  title?: string
}

export function QuickBuildConfirm({
  open,
  onConfirm,
  onCancel,
  isConverting = false,
  estimatedSeconds = 60,
  title = 'Quick Build'
}: QuickBuildConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={!isConverting ? (open) => !open && onCancel() : undefined}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            {title}
          </DialogTitle>
          <DialogDescription>
            This will consume approximately {estimatedSeconds} AI seconds
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 pt-4">
          <Button variant="outline" onClick={onCancel} disabled={isConverting} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isConverting}
            className="flex-1"
          >
            {isConverting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
