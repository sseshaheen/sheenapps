'use client'

import { useResponsive } from '@/hooks/use-responsive'
import { useAuthStore } from '@/store'
import { useSetCurrentBuildId, useCurrentBuildId, useIsBuildIdCurrent, useBuildStateStore } from '@/store/build-state-store'
import React from 'react'
import { BuilderChatInterface, type BuildIdChangeEvent } from '@/components/builder/builder-chat-interface'
import { ResizableSplitter } from '@/components/ui/resizable-splitter'
import { logger } from '@/utils/logger'
import type { Project } from '@/hooks/use-workspace-project'
import Icon from '@/components/ui/icon'

interface ResponsiveWorkspaceContentProps {
  projectId: string
  initialIdea?: string
  sessionStartTime: number
  children: React.ReactNode // Preview content and overlays
  questionStartTrigger: React.ReactNode // AI crafting UI (now unused)
  currentLayoutId?: string
  onLayoutChange?: (layoutId: string) => void
  isLayoutReady?: boolean
  project?: Project | null // Project data including buildId
  externalChatInterface?: boolean // Whether chat interface is handled externally
}

/**
 * Simplified responsive workspace content for iframe preview approach
 */
export function ResponsiveWorkspaceContentSimple({
  projectId,
  initialIdea,
  children,
  project,
  externalChatInterface = false
}: ResponsiveWorkspaceContentProps) {
  const { showMobileUI, isHydrated } = useResponsive()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = React.useState<'chat' | 'preview'>('chat')
  const [chatPanelWidth, setChatPanelWidth] = React.useState(480) // Default 30rem
  
  // PHASE 2 OPTIMIZATION: Single source of truth - use ONLY global state
  const currentBuildId = useCurrentBuildId()
  const setGlobalBuildId = useSetCurrentBuildId()
  const isBuildIdCurrent = useIsBuildIdCurrent()
  
  // PHASE 2: Simplified - Only update global state when project first loads with an ACTIVE buildId
  React.useEffect(() => {
    // Only set buildId if project is actively building (not deployed/failed)
    const isActivelyBuilding = project?.status === 'building' || project?.status === 'queued'
    
    if (project?.buildId && !currentBuildId && isActivelyBuilding) {
      logger.info('workspace', `Initializing active buildId from project data: ${project.buildId.slice(0, 8)} (status: ${project.status})`)
      setGlobalBuildId(project.buildId, projectId, 'project-initial-load')
    } else if (project?.buildId && !currentBuildId && !isActivelyBuilding) {
      logger.info('workspace', `Project has completed buildId ${project.buildId.slice(0, 8)} (status: ${project.status}) - not setting as current`)
    }
  }, [project?.buildId, currentBuildId, project?.status, projectId, setGlobalBuildId])

  // Debug logging for buildId state
  React.useEffect(() => {
    if (currentBuildId) {
      logger.debug('workspace', 'BuildId state', {
        currentBuildId: currentBuildId.slice(0, 8),
        projectBuildId: project?.buildId?.slice(0, 8) || 'null',
        projectStatus: project?.status
      })
    }
  }, [currentBuildId, project?.buildId, project?.status])

  // Debug logging for project data (only when project changes)
  React.useEffect(() => {
    if (project) {
      logger.debug('workspace', `Project loaded: ${project.id.slice(0, 8)}, buildId: ${project.buildId?.slice(0, 8) || 'null'}, status: ${project.status}`)
    }
  }, [
    // 🆕 STABLE DEPENDENCIES: Convert undefined to null for consistent array size
    project?.id || null,
    project?.buildId || null,
    project?.status || null
  ])

  const handlePromptSubmit = async (prompt: string, mode: 'build' | 'plan') => {
    logger.info('chat-prompt', 'User submitted prompt in workspace', `${prompt.slice(0, 50)}... (${mode} mode for ${projectId})`)
    
    if (mode === 'plan') {
      // Plan mode - just log and return, let the chat interface handle SSE streaming
      logger.info('Plan mode submission - chat interface will handle SSE streaming', {
        projectId: projectId.slice(0, 8),
        promptLength: prompt.length
      }, 'chat-plan')
      return // Allow chat interface to proceed with its streaming
    }
    
    if (mode === 'build') {
      // Update the CURRENT project, don't create a new one
      try {
        // Use API route instead of direct service call
        const { apiPost } = await import('@/lib/client/api-fetch')
        
        logger.info('chat-build', `Updating current project ${projectId} with prompt: ${prompt.slice(0, 50)}...`)
        const uid = user?.id
        if (!uid) {
          throw new Error('AUTH_REQUIRED')
        }
        
        const updateResult = await apiPost(
          `/api/worker/update-project`,
          {
            userId: uid,
            projectId,
            prompt
          }
        )
        
        if (updateResult.success && updateResult.buildId) {
          const newBuildId = updateResult.buildId
          const oldBuildId = currentBuildId
          
          logger.info('workspace', `🔄 API Response: New buildId received: ${newBuildId.slice(0, 8)} (previous: ${oldBuildId?.slice(0, 8) || 'null'})`)
          
          // PHASE 2: Mark this as a new build and update global state
          const markNewBuildStarted = useBuildStateStore.getState().markNewBuildStarted
          markNewBuildStarted(newBuildId, projectId)
          
          logger.info('workspace', `✅ BuildId updated: ${newBuildId.slice(0, 8)}`)
          logger.info('chat-build', 'Project update started from workspace', `buildId: ${newBuildId} for project ${projectId}`)
        } else {
          // Check if this is a balance error (from updateResult.balanceCheck)
          if (updateResult.balanceCheck && !updateResult.balanceCheck.sufficient) {
            // Import the error class
            const { InsufficientBalanceError } = await import('@/types/worker-api')
            throw new InsufficientBalanceError({
              sufficient: false,
              estimate: null,
              balance: { total_seconds: 0, paid_seconds: 0, bonus_seconds: 0 },
              recommendation: updateResult.balanceCheck.recommendation
            })
          }
          // For other errors, throw a generic error
          throw new Error(updateResult.error || 'Project update failed')
        }
      } catch (error) {
        // Check if this is a balance error (expected case)
        const errorMessage = String(error)
        if (errorMessage.includes('InsufficientBalanceError') || errorMessage.includes('insufficient')) {
          logger.debug('chat-build', 'Insufficient balance for update - handled gracefully')
        } else {
          logger.error('chat-build', 'Project update failed from workspace', errorMessage)
        }
        // Re-throw the error so chat interface can handle it
        throw error
      }
    }
  }

  // PHASE 2 OPTIMIZED: Handle buildId changes from child components
  const handleBuildIdChange = React.useCallback(async (event: BuildIdChangeEvent) => {
    const { buildId, source, previousBuildId } = event
    
    // Use store's validation
    if (previousBuildId && !isBuildIdCurrent(previousBuildId)) {
      logger.warn('workspace', `⚠️ Stale buildId transition from ${source}: ${previousBuildId?.slice(0, 8)} (current is ${currentBuildId?.slice(0, 8)})`)
    }
    
    logger.info('workspace', `🔄 BuildId change from ${source}: ${previousBuildId?.slice(0, 8) || 'null'} → ${buildId.slice(0, 8)}`)
    
    // Single atomic update - store handles everything
    setGlobalBuildId(buildId, projectId, `chat-${source}`)
    
    logger.info('workspace', `✅ BuildId updated via ${source}: ${buildId.slice(0, 8)}`)
  }, [currentBuildId, projectId, setGlobalBuildId, isBuildIdCurrent])

  // Waiting state when buildId is null and project is queued
  const isWaitingForBuild = !currentBuildId && project?.status === 'queued'
  
  // Expert's suggestion: Single mount with variant props instead of multiple instances
  const variant = (isHydrated && showMobileUI) ? 'mobile' : 'desktop'
  
  if (isWaitingForBuild) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-col h-full items-center justify-center bg-gray-50 p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="clock" className="w-8 h-8 text-blue-600 animate-pulse" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Getting Your Project Ready
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              We're setting up your project: "{project?.name}". This usually takes a few moments.
            </p>
            <div className="text-xs text-gray-500">
              <p>Business idea: {project?.businessIdea}</p>
              <p className="mt-2">Status: {project?.status}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Expert's approach: Single BuilderChatInterface with layout handled internally
  const chatInterface = (
    <BuilderChatInterface
      buildId={currentBuildId}
      projectId={projectId}
      businessIdea={initialIdea || project?.businessIdea || 'Improve your business app'}
      projectBuildStatus={project?.status as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed'}
      onPromptSubmit={handlePromptSubmit}
      onBuildIdChange={handleBuildIdChange}
      translations={{
        chat: {
          placeholder: 'Ask for features, changes, or improvements...',
          buildMode: 'Build',
          planMode: 'Plan',
          thinking: 'Sheena is thinking...'
        },
        pricingModal: {
          title: 'Choose Your Plan',
          description: 'Select a plan to continue building',
          currentPlan: 'Current Plan',
          getCredits: 'Get Credits',
          mostPopular: 'Most Popular',
          maybeLater: 'Maybe Later',
          securePayment: 'Secure payment via Stripe • Cancel anytime'
        }
      }}
    />
  )
  
  // Expert's pattern: Layout shell handles responsive behavior, not multiple mounts
  const previewArea = (
    <div className="h-full relative bg-gray-100 min-h-0">
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { currentBuildId } as any)
        }
        return child
      })}
    </div>
  )
  
  // Mobile Layout - Expert's grid scaffold pattern (no CSS custom properties)
  // Only show mobile layout after hydration confirms we're on mobile
  if (isHydrated && showMobileUI) {
    // If external chat, just render children (mobile panel system will handle chat separately)
    if (externalChatInterface) {
      return (
        <div className="h-full">
          {children}
        </div>
      )
    }
    
    // Legacy: render chat interface for mobile (when chat is not external)
    return (
      <div className="h-full">
        {chatInterface}
      </div>
    )
  }

  // Desktop layout - check if chat interface is handled externally
  if (!isHydrated) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <div className="text-gray-400">Loading workspace...</div>
      </div>
    )
  }
  
  // If chat interface is handled externally (e.g., in sidebar), render children in flex container
  // 2025 FIX: Proper flex wrapper for height cascade
  if (externalChatInterface) {
    return (
      <div className="flex-1 flex flex-col h-full">
        {children}
      </div>
    )
  }
  
  // Legacy: Standalone mode with integrated chat + preview (fallback for backward compatibility)
  return (
    <div className="flex flex-1 min-h-0">
      <ResizableSplitter
        defaultLeftWidth={480}
        minLeftWidth={400}
        maxLeftWidth={800}
        onResize={setChatPanelWidth}
        className="flex flex-1 min-h-0 items-stretch"
      >
        <div className="h-full border-r border-gray-200 overflow-hidden min-h-0">
          {chatInterface}
        </div>
        {previewArea}
      </ResizableSplitter>
    </div>
  )
}
