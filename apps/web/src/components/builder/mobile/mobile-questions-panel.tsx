/**
 * @deprecated DEAD CODE - This component is not imported anywhere.
 * Mobile questions panel was replaced by direct ChatArea integration in MobileWorkspaceLayout.
 * Kept for reference.
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md
 */
'use client'

import React, { useRef } from 'react'
import { MobilePanel } from '../workspace/mobile-workspace-layout'
import { 
  LazyMobileQuestionInterface as MobileQuestionInterface,
} from '../lazy-components'
import { ProgressTracker } from '../engagement/progress-tracker'
import { useCurrentQuestion, useFlowProgress, useQuestionHistory } from '@/store/question-flow-store'

interface MobileQuestionsPanelProps {
  projectId: string
  previewEngine: any
  sessionStartTime: number
  questionStartTrigger: React.ReactNode
}

export function MobileQuestionsPanel({
  projectId,
  previewEngine,
  sessionStartTime,
  questionStartTrigger
}: MobileQuestionsPanelProps) {
  const currentQuestion = useCurrentQuestion()
  const { engagementScore } = useFlowProgress()
  const questionHistory = useQuestionHistory()
  
  // Create a ref to track the container element for the monitor component
  const containerElementRef = useRef<HTMLDivElement | null>(null)

  return (
    <MobilePanel id="build" className="bg-gray-900">
      <div className="h-full flex flex-col">
        {!currentQuestion ? questionStartTrigger : (
          <MobileQuestionInterface
            projectId={projectId}
            previewEngine={previewEngine}
            previewContainerRef={containerElementRef}
          />
        )}

        {/* Progress Tracker for mobile - Fixed z-index to prevent overlap */}
        {currentQuestion && (
          <div className="relative z-20 p-4 border-t border-gray-700 bg-gray-900">
            <ProgressTracker
              metrics={{
                totalScore: engagementScore,
                level: Math.floor(engagementScore / 100) + 1,
                currentLevelProgress: (engagementScore % 100),
                nextLevelThreshold: Math.floor(engagementScore / 100 + 1) * 100,
                streak: 0,
                totalTime: Date.now() - sessionStartTime,
                questionsAnswered: questionHistory.length,
                featuresDiscovered: 0,
                milestonesCompleted: 0,
                achievements: []
              }}
              compact={true}
            />
          </div>
        )}
      </div>
    </MobilePanel>
  )
}