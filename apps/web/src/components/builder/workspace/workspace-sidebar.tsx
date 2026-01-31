/**
 * @deprecated DEAD CODE - This component is not rendered anywhere.
 *
 * The sidebar content is now passed directly via ChatArea to ContainerQueryWorkspace.
 * This file is kept for reference in case we want to revive the sidebar structure.
 *
 * See: WORKSPACE_SIMPLIFICATION_PLAN.md Section 10 - "Discoveries during implementation"
 *
 * Components in this file that are also effectively dead:
 * - GitHubSyncPanel (only used here)
 * - ProgressTracker from engagement/ (also used in mobile-questions-panel which is also dead)
 */
'use client'

import React from 'react'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { useCurrentQuestion, useFlowProgress, useQuestionHistory } from '@/store/question-flow-store'
import { ProgressTracker } from '../engagement/progress-tracker'
import { LazyQuestionInterface as QuestionInterface } from '../lazy-components'
import { GitHubSyncPanel } from '../github/github-sync-panel'

interface WorkspaceSidebarProps {
  projectId: string
  previewEngine: any
  sessionStartTime: number
  questionStartTrigger: React.ReactNode
  /** Whether to use Simple Mode (hides GitHub panel and Progress Tracker) */
  isSimpleMode?: boolean
  /** Whether GitHub is connected (show panel even in Simple Mode if connected) */
  hasGitHubConnected?: boolean
  translations?: {
    sidebar: {
      design: string
      preview: string
      export: string
      settings: string
      projects: string
    }
  }
}

export function WorkspaceSidebar({
  projectId,
  previewEngine,
  sessionStartTime,
  questionStartTrigger,
  isSimpleMode = false,
  hasGitHubConnected = false,
  translations
}: WorkspaceSidebarProps) {
  const currentQuestion = useCurrentQuestion()
  const { engagementScore } = useFlowProgress()
  const questionHistory = useQuestionHistory()

  // Workspace Simplification: Conditionally show components based on mode
  // See: WORKSPACE_SIMPLIFICATION_PLAN.md Section 5.6
  const showProgressTracker = !isSimpleMode && questionHistory.length > 0
  const showGitHubPanel = !isSimpleMode || hasGitHubConnected

  return (
    <div className="w-full md:w-80 lg:w-96 xl:w-[400px] bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-300">
      {/* Header */}
      <div className="p-3 md:p-4 lg:p-5 border-b border-gray-700">
        <h2 className="text-base md:text-lg lg:text-xl font-semibold text-white">
          Business Builder
        </h2>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          {currentQuestion
            ? 'Answer questions to refine your app'
            : 'Preparing your personalized questions'
          }
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 lg:p-5 space-y-3 md:space-y-4">
        {/* Main Question Flow */}
        <AnimatePresence mode="wait">
          {!currentQuestion ? questionStartTrigger : (
            <m.div
              key="questions-ready"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                  delay: 0.3
                }
              }}
              exit={{
                opacity: 0,
                y: -20,
                scale: 0.95,
                transition: {
                  duration: 0.5,
                  ease: [0.4, 0, 0.2, 1]
                }
              }}
            >
              <m.div
                className="mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.6 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  🎯
                  <h3 className="text-sm md:text-base lg:text-lg font-semibold text-white">Refine Your App</h3>
                </div>
                <p className="text-xs md:text-sm text-gray-400 mb-3 md:mb-4">Answer questions to customize your app and see live preview</p>

                {/* Success indicator */}
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                  className="flex items-center gap-2 p-2 md:p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-3 md:mb-4"
                >
                  <span className="text-green-400 text-sm md:text-base">✅</span>
                  <span className="text-green-300 text-xs md:text-sm">Questions ready! Let&apos;s build your tailored app.</span>
                </m.div>
              </m.div>

              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.6 }}
              >
                <QuestionInterface
                  previewEngine={previewEngine}
                  projectId={projectId}
                />
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Engagement Progress - hidden in Simple Mode (gamification noise) */}
        {showProgressTracker && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.6 }}
          >
            <ProgressTracker
              metrics={{
                totalScore: engagementScore || 0,
                level: Math.floor((engagementScore || 0) / 100) + 1,
                currentLevelProgress: (engagementScore || 0) % 100,
                nextLevelThreshold: Math.floor((engagementScore || 0) / 100 + 1) * 100,
                streak: 0,
                totalTime: Date.now() - sessionStartTime,
                questionsAnswered: 0,
                featuresDiscovered: 0,
                milestonesCompleted: 0,
                achievements: []
              }}
              compact={true}
            />
          </m.div>
        )}

        {/* GitHub Sync Panel - hidden in Simple Mode unless already connected */}
        {showGitHubPanel && <GitHubSyncPanel projectId={projectId} />}

        {/* Optional sidebar navigation items */}
        {translations?.sidebar && (
          <div className="mt-6 md:mt-8 pt-3 md:pt-4 border-t border-gray-700">
            <h4 className="text-xs md:text-sm font-medium text-gray-400 mb-2 md:mb-3">Quick Actions</h4>
            <div className="space-y-1 md:space-y-2">
              <button className="w-full text-left px-3 py-2 md:py-3 text-xs md:text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900">
                {translations.sidebar.design}
              </button>
              <button className="w-full text-left px-3 py-2 md:py-3 text-xs md:text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900">
                {translations.sidebar.preview}
              </button>
              <button className="w-full text-left px-3 py-2 md:py-3 text-xs md:text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900">
                {translations.sidebar.export}
              </button>
              <button className="w-full text-left px-3 py-2 md:py-3 text-xs md:text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900">
                {translations.sidebar.settings}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}