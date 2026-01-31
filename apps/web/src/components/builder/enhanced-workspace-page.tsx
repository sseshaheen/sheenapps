'use client'

import { useWorkspaceProject } from '@/hooks/use-workspace-project'
import { useProjectStatus } from '@/hooks/use-project-status'
import { useAuthStore } from '@/store'
import { useCurrentQuestion, useFlowProgress, useQuestionFlowStore } from '@/store/question-flow-store'
import { useRouter } from '@/i18n/routing'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@/types/auth'
import { useCelebration } from './engagement/celebration-effects'
import { useSmartHints } from './hints/smart-hint'
import { ExportModal } from '@/components/project/ExportModal'
// Lazy imports for code splitting
import { 
  LazyCelebrationEffects as CelebrationEffects,
  LazySmartHint as SmartHint
} from './lazy-components'
import { WorkspaceHeader } from './workspace/workspace-header'
import { MobileWorkspaceHeader } from './workspace/mobile-workspace-header'
import { MobileWorkspaceLayout } from './workspace/mobile-workspace-layout'
// WorkspaceSidebar is dead code - sidebar content is now passed directly via ChatArea
// import { WorkspaceSidebar } from './workspace/workspace-sidebar'
import { ContainerQueryWorkspace } from './workspace/container-query-workspace'
import { WorkspacePreview } from './workspace/workspace-preview'
import { WorkspaceCanvas } from './workspace/workspace-canvas'
import { WorkspaceCore } from './workspace/workspace-core'
import { ResponsiveWorkspaceContentSimple } from './responsive-workspace-content-simple'
import { GeneratedCodeViewer } from './code-viewer'
import { BuildProgressStrip } from './build-progress-strip'
import { useResponsive } from '@/hooks/use-responsive'
import { useWorkspaceMode, trackDevIntent } from '@/hooks/use-workspace-mode'
import { ClientOnly } from '@/components/ui/client-only'
import { logger } from '@/utils/logger'
import { trackTTFMUI } from '@/components/analytics/web-vitals'
import Icon from '@/components/ui/icon'
import { ChatArea } from '@/components/builder/chat-area-integration'
import { type BuildIdChangeEvent } from '@/components/builder/builder-chat-interface'
import { useSetCurrentBuildId, useCurrentBuildId, useIsBuildIdCurrent, useBuildStateStore } from '@/store/build-state-store'
import { AdvisorMatchingManager } from '@/components/advisor-matching/advisor-matching-manager'
import { InfrastructureDrawer } from '@/components/builder/workspace/infrastructure-drawer'
import { InfrastructureTrigger } from '@/components/builder/workspace/infrastructure-trigger'
import { EasyModeHelper } from '@/components/builder/infrastructure/EasyModeHelper'
import { FeatureSignalTracker, BuildFeedbackIntegration } from '@/components/feedback'

interface EnhancedWorkspacePageProps {
  translations: {
    workspace: {
      viewTabs: {
        preview: string
        code: string
      }
      header: {
        back: string
        share: string
        export: string
        settings: string
      }
      sidebar: {
        design: string
        preview: string
        export: string
        settings: string
        projects: string
      }
      aiChat: {
        title: string
        placeholder: string
        thinking: string
        examples: string[]
      }
      preview: {
        title: string
        desktop: string
        tablet: string
        mobile: string
        refresh: string
        fullscreen: string
      }
      buildLog: {
        title: string
        analyzing: string
        generating: string
        styling: string
        finalizing: string
      }
      firstBuild?: {
        title: string
        description: string
        continue: string
      }
      iterationStrip?: {
        nextStep: string
        guidance: string
      }
    }
    advisorMatching: {
      match: {
        matchedTitle: string
        matchedDescription: string
        advisorDetails: string
        matchScore: string
        yearsExperience: string
        rating: string
        reviews: string
        skills: string
        approve: string
        decline: string
        dismiss: string
      }
      decline: {
        title: string
        description: string
        retryLabel: string
        retryDescription: string
        browseLabel: string
        browseDescription: string
        laterLabel: string
        laterDescription: string
      }
      banner: {
        advisorJoined: string
        dismiss: string
      }
    }
    common: {
      loading: string
      error: string
      retry: string
      save: string
      cancel: string
    }
    infrastructure?: any // Infrastructure translations (optional, only for Easy Mode projects)
  }
  locale: string
  projectId: string
  initialIdea?: string
  templateId?: string
  initialAuthState?: {
    user: User | null
    isAuthenticated: boolean
    isGuest: boolean
  }
}

export function EnhancedWorkspacePage({
  translations,
  locale,
  projectId,
  initialAuthState
}: EnhancedWorkspacePageProps) {
  const router = useRouter()
  const { canPerformAction, requestUpgrade, user } = useAuthStore()
  const { showMobileUI, isHydrated, viewport, isPortrait } = useResponsive()
  

  // EXPERT FIX: Removed direct store seeding - let AuthProvider own initialization
  // This prevents stale auth state from bypassing proper verification
  // useEffect(() => {
  //   if (initialAuthState) {
  //     logger.debug('general', 'Initializing client auth store with server auth state', {
  //       isAuthenticated: initialAuthState.isAuthenticated,
  //       userId: initialAuthState.user?.id?.slice(0, 8),
  //       email: initialAuthState.user?.email
  //     })
  //
  //     // REMOVED: Direct store seeding bypasses AuthProvider verification
  //     useAuthStore.setState({
  //       user: initialAuthState.user,
  //       isAuthenticated: initialAuthState.isAuthenticated,
  //       isGuest: initialAuthState.isGuest,
  //       isInitializing: false,
  //       isLoading: false,
  //       isLoggingIn: false
  //     })
  //   }
  // }, [initialAuthState])

  // Question Flow State - using individual selectors to prevent infinite loops
  const currentQuestion = useCurrentQuestion()
  const { flowPhase } = useFlowProgress()
  
  // Get remaining state that doesn't have dedicated selectors
  const isQuestionLoading = useQuestionFlowStore(state => state.isLoading)
  const questionError = useQuestionFlowStore(state => state.error)

  // Celebration System
  const { currentCelebration, triggerCelebration, clearCelebration } = useCelebration()

  // Smart Hints
  const { currentHint, dismissCurrentHint } = useSmartHints()

  const [sessionStartTime] = useState(Date.now())
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // View mode for switching between Preview and Code views
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')

  // Track if we've already shown the code prompt for this build (prevent repeated prompts)
  const autoSwitchedBuildIdRef = useRef<string | null>(null)

  // ✅ E2E READINESS: Monotonic + error-aware data-ready state
  // Expert pattern from PLAYWRIGHT_TEST_ANALYSIS.md
  const [readyState, setReadyState] = useState<'loading' | 'ready' | 'error'>('loading')

  // Track if TTFMUI has been measured (only measure once per page load)
  const ttfmuiMeasuredRef = useRef(false)

  // 2025 UX PATTERN: Handle sidebar expand from collapsed chat
  const handleExpandSidebar = useCallback(() => {
    setIsSidebarCollapsed(false)
  }, [])

  // Handle sidebar collapse state changes from workspace
  const handleSidebarCollapseChange = useCallback((collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed)
  }, [])
  
  // Chat interface state and logic
  const currentBuildId = useCurrentBuildId()
  const setGlobalBuildId = useSetCurrentBuildId()
  const isBuildIdCurrent = useIsBuildIdCurrent()
  
  // First build overlay state - shows when user's first build starts
  const [showFirstBuildOverlay, setShowFirstBuildOverlay] = useState(false)
  const firstBuildOverlayShownRef = useRef(false)

  // Easy Mode helper open state - used to hide infra trigger to avoid overlap
  const [isHelperOpen, setIsHelperOpen] = useState(false)

  // Simple layout state management
  const [currentLayoutId, setCurrentLayoutId] = useState<string>('default')

  // Simple layout functions
  const switchToLayout = (layoutId: string) => {
    // Prevent unnecessary switches
    if (currentLayoutId === layoutId) {
      return // Already on this layout
    }
    
    logger.info(`🔄 Switching to layout: ${layoutId}`)
    setCurrentLayoutId(layoutId)
  }

  // Initialize with default layout on startup
  const handleLayoutChange = (layoutId: string) => {
    switchToLayout(layoutId)
  }

  // Removed preview engine handling - now uses simple iframe

  // Project state - now only fetches, no creation
  const {
    project,
    isLoading: isProjectLoading,
    error: projectError
  } = useWorkspaceProject(projectId)
  
  // Get real-time status updates including preview URL changes
  const { data: projectStatus } = useProjectStatus(projectId)

  // Workspace Mode - determines what UI elements to show
  // See: WORKSPACE_SIMPLIFICATION_PLAN.md
  const { isSimple: isSimpleMode, setMode } = useWorkspaceMode({
    project,
    userId: user?.id
  })

  // Compute project view data once (expert recommendation)
  const projectView = useMemo(() => ({
    ...project,
    previewUrl: projectStatus?.previewUrl ?? project?.previewUrl,
    buildStatus: projectStatus?.buildStatus ?? project?.buildStatus,
    currentVersionName: projectStatus?.currentVersionName ?? project?.currentVersionName,
    buildId: project?.currentBuildId ?? project?.buildId
  }), [project, projectStatus])

  // ✅ E2E READINESS: Update data-ready state (monotonic: never regress to loading)
  // Error can override ready (e.g., refetch fails), but nothing regresses to loading
  useEffect(() => {
    // Error takes priority - always update to error if there's an error
    if (projectError || questionError) {
      setReadyState(prev => prev === 'error' ? prev : 'error')
      return
    }

    // Ready when: not loading + has project data (only if not already error/ready)
    if (!isProjectLoading && project !== undefined) {
      setReadyState(prev => {
        if (prev === 'ready') return prev // Already ready

        // Track TTFMUI on first transition to ready
        // This measures Time to First Meaningful UI (workspace shell interactive)
        // See: docs/PERFORMANCE_ANALYSIS.md - Section 8
        if (!ttfmuiMeasuredRef.current) {
          ttfmuiMeasuredRef.current = true
          trackTTFMUI('workspace-shell')
        }

        return 'ready'
      })
    }
  }, [isProjectLoading, projectError, questionError, project])

  // Single preview JSX block (expert recommendation - eliminates duplication)
  const preview = useMemo(() => (
    <WorkspaceCanvas translations={translations}>
      <WorkspacePreview
        projectId={projectId}
        projectData={projectView}
        currentBuildId={project?.currentBuildId}
      />
    </WorkspaceCanvas>
  ), [translations, projectId, projectView, project?.currentBuildId])

  // Effective buildId for code viewer (with undefined check)
  const effectiveCodeBuildId = currentBuildId || project?.currentBuildId

  // Code viewer JSX block (with "no build yet" state)
  const codeViewer = useMemo(() => {
    if (!effectiveCodeBuildId) {
      return (
        <div className="h-full bg-background flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="code" className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No code yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Start a build to generate code. Your generated files will appear here.
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="h-full bg-background">
        <GeneratedCodeViewer
          projectId={projectId}
          buildId={effectiveCodeBuildId}
          className="h-full"
        />
      </div>
    )
  }, [projectId, effectiveCodeBuildId])

  // Handle code tab click - track dev intent signal
  const handleCodeTabClick = useCallback(() => {
    trackDevIntent('hasOpenedCodeTab')
    setViewMode('code')
  }, [])

  // View mode tabs component - Code tab hidden in Simple Mode
  const ViewModeTabs = useMemo(() => (
    <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-gray-900 rounded-lg">
      <button
        type="button"
        onClick={() => setViewMode('preview')}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          viewMode === 'preview'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-800/50'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Icon name="eye" className="w-4 h-4" />
          {translations.workspace.viewTabs.preview}
        </span>
      </button>
      {/* Code tab hidden in Simple Mode - reduces cognitive load for non-technical users */}
      {!isSimpleMode && (
        <button
          type="button"
          onClick={handleCodeTabClick}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'code'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-800/50'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Icon name="code" className="w-4 h-4" />
            {translations.workspace.viewTabs.code}
          </span>
        </button>
      )}
    </div>
  ), [viewMode, translations.workspace.viewTabs, isSimpleMode, handleCodeTabClick])
  
  // Invalidate workspace project cache when status preview URL changes
  const queryClient = useQueryClient()
  useEffect(() => {
    if (projectStatus?.previewUrl && projectStatus.previewUrl !== project?.previewUrl) {
      logger.info('📊 Preview URL changed in status, invalidating workspace project cache', {
        oldUrl: project?.previewUrl,
        newUrl: projectStatus.previewUrl
      })
      queryClient.invalidateQueries({ queryKey: ['workspace-project', projectId] })
    }
  }, [projectStatus?.previewUrl, project?.previewUrl, projectId, queryClient])

  // Initialize global build state with project's stored buildId for existing projects
  // This ensures historical builds can be fetched (useCleanBuildEvents requires buildId to be globally current)
  useEffect(() => {
    // Only initialize if: project loaded, has buildId, global state is empty
    if (project?.currentBuildId && !currentBuildId) {
      logger.info('workspace', `🔄 Initializing global build state from project: ${project.currentBuildId.slice(0, 8)}`)
      setGlobalBuildId(project.currentBuildId, projectId, 'workspace-project-init')
    }
  }, [project?.currentBuildId, currentBuildId, projectId, setGlobalBuildId])

  // Build status tracking
  const buildStatus = projectStatus?.buildStatus ?? project?.buildStatus
  const isBuilding = buildStatus === 'queued' || buildStatus === 'building'

  // UX: Show opt-in prompt for code view instead of auto-switching (non-tech friendly)
  // Track which builds we've shown the prompt for
  useEffect(() => {
    // Only trigger on build start (queued or building)
    if (!isBuilding) {
      return
    }

    // Get the current build ID to track
    const activeBuildId = currentBuildId || project?.currentBuildId
    if (!activeBuildId) {
      return
    }

    // Don't show prompt if we already did for this build
    if (autoSwitchedBuildIdRef.current === activeBuildId) {
      return
    }

    // Mark as processed
    autoSwitchedBuildIdRef.current = activeBuildId

    // Don't prompt if already viewing code
    if (viewMode === 'code') {
      return
    }

    logger.info('workspace', `📋 Build ${activeBuildId.slice(0, 8)} started - code view available via tabs`)

    // Show first build overlay for new projects (no previous version deployed)
    // Only show once per session
    if (!firstBuildOverlayShownRef.current && !project?.currentVersionName) {
      firstBuildOverlayShownRef.current = true
      setShowFirstBuildOverlay(true)
    }
  }, [isBuilding, currentBuildId, project?.currentBuildId, viewMode, project?.currentVersionName])

  // Auto-dismiss first build overlay when build reaches terminal status
  // Prevents overlay from lingering if build finishes quickly
  useEffect(() => {
    if (!showFirstBuildOverlay) return
    const statusNow = projectStatus?.buildStatus ?? project?.buildStatus
    if (statusNow === 'deployed' || statusNow === 'failed' || statusNow === 'rollbackFailed') {
      setShowFirstBuildOverlay(false)
    }
  }, [showFirstBuildOverlay, projectStatus?.buildStatus, project?.buildStatus])

  // Save status removed - not needed with version management

  // Handle sharing
  const handleShare = () => {
    if (!canPerformAction('share')) {
      requestUpgrade('share projects')
      return
    }
    logger.info('Share project:', projectId)
  }

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false)
  
  // Handle export - track dev intent signal
  const handleExport = () => {
    // Track that user has shown developer intent
    trackDevIntent('hasUsedExport')

    if (!canPerformAction('export')) {
      requestUpgrade('export code')
      return
    }

    // Show export modal
    setShowExportModal(true)
  }

  // Chat interface handlers
  const handlePromptSubmit = async (prompt: string, mode: 'build' | 'plan') => {
    logger.info('chat-prompt', 'User submitted prompt in workspace', `${prompt.slice(0, 50)}... (${mode} mode for ${projectId})`)
    
    if (mode === 'plan') {
      logger.info('Plan mode submission - chat interface will handle SSE streaming', {
        projectId: projectId.slice(0, 8),
        promptLength: prompt.length
      }, 'chat-plan')
      return
    }
    
    if (mode === 'build') {
      try {
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
          logger.info('workspace', `🔄 API Response: New buildId received: ${newBuildId.slice(0, 8)}`)
          
          const markNewBuildStarted = useBuildStateStore.getState().markNewBuildStarted
          markNewBuildStarted(newBuildId, projectId)
          
          logger.info('workspace', `✅ BuildId updated: ${newBuildId.slice(0, 8)}`)
        } else {
          if (updateResult.balanceCheck && !updateResult.balanceCheck.sufficient) {
            const { InsufficientBalanceError } = await import('@/types/worker-api')
            throw new InsufficientBalanceError({
              sufficient: false,
              estimate: null,
              balance: { total_seconds: 0, paid_seconds: 0, bonus_seconds: 0 },
              recommendation: updateResult.balanceCheck.recommendation
            })
          }
          throw new Error(updateResult.error || 'Project update failed')
        }
      } catch (error) {
        const errorMessage = String(error)
        if (!errorMessage.includes('InsufficientBalanceError') && !errorMessage.includes('insufficient')) {
          logger.error('chat-build', 'Project update failed from workspace', errorMessage)
        }
        throw error
      }
    }
  }

  const handleBuildIdChange = React.useCallback(async (event: BuildIdChangeEvent) => {
    const { buildId, source, previousBuildId } = event
    
    if (previousBuildId && !isBuildIdCurrent(previousBuildId)) {
      logger.warn('workspace', `⚠️ Stale buildId transition from ${source}: ${previousBuildId?.slice(0, 8)} (current is ${currentBuildId?.slice(0, 8)})`)
    }
    
    logger.info('workspace', `🔄 BuildId change from ${source}: ${previousBuildId?.slice(0, 8) || 'null'} → ${buildId.slice(0, 8)}`)
    setGlobalBuildId(buildId, projectId, `chat-${source}`)
    logger.info('workspace', `✅ BuildId updated via ${source}: ${buildId.slice(0, 8)}`)
  }, [currentBuildId, projectId, setGlobalBuildId, isBuildIdCurrent])

  // Create chat interface for desktop sidebar with 2025 UX patterns
  // Use project.currentBuildId as fallback for existing projects (global store starts null)
  const effectiveBuildId = currentBuildId || project?.currentBuildId
  const chatInterface = React.useMemo(() => (
    <ChatArea
      buildId={effectiveBuildId}
      projectId={projectId}
      businessIdea={project?.businessIdea || 'Improve your business app'}
      projectBuildStatus={project?.buildStatus as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed'}
      onPromptSubmit={handlePromptSubmit}
      onBuildIdChange={handleBuildIdChange}
      isCollapsed={isSidebarCollapsed}
      onExpand={handleExpandSidebar}
      translations={{
        chat: {
          placeholder: translations.workspace.aiChat.placeholder,
          buildMode: 'Build',
          planMode: 'Plan',
          thinking: translations.workspace.aiChat.thinking
        },
        pricingModal: {
          title: 'Upgrade Your Plan',
          description: 'Get more AI time to continue building',
          currentPlan: 'Current Plan',
          getCredits: 'Get Credits',
          mostPopular: 'Most Popular',
          maybeLater: 'Maybe Later',
          securePayment: 'Secure Payment'
        }
      }}
      infraMode={project?.infraMode}
    />
  ), [effectiveBuildId, projectId, project?.businessIdea, project?.buildStatus, project?.infraMode, handlePromptSubmit, handleBuildIdChange, isSidebarCollapsed, handleExpandSidebar, translations])

  // Only show full loading for project loading, not for question loading
  if (isProjectLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">{translations.common.loading}</p>
        </div>
      </div>
    )
  }

  if (projectError || questionError) {
    // Handle auth errors with redirect to login
    if (projectError?.code === 'AUTH_REQUIRED') {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="lock" className="w-10 h-10 text-gray-500" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">
              Session Expired
            </h2>
            <p className="text-gray-400 mb-8">
              Your session has expired. Please sign in again to continue.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full px-6 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }
    
    // Handle specific error types with better UX
    if (projectError?.code === 'PROJECT_NOT_FOUND') {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="alert-circle" className="w-10 h-10 text-gray-500" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">
              Project Not Found
            </h2>
            <p className="text-gray-400 mb-8">
              The project you're looking for doesn't exist or has been removed.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/builder/new')}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors"
              >
                Create New Project
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full px-6 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }
    
    if (projectError?.code === 'ACCESS_DENIED') {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="lock" className="w-10 h-10 text-gray-500" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">
              Access Denied
            </h2>
            <p className="text-gray-400 mb-8">
              You don't have permission to access this project.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }
    
    // Generic error fallback
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{projectError?.message || questionError}</p>
          <button
            onClick={() => router.refresh()}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            {translations.common.retry}
          </button>
        </div>
      </div>
    )
  }

  // Render enhanced workspace interface

  return (
    <div
      data-testid="builder-root"
      data-ready={readyState === 'loading' ? undefined : readyState}
      className="contents"
    >
    {/* Implicit Signal Tracker - detects frustration (rage clicks, dead clicks) in workspace */}
    <FeatureSignalTracker>
    <WorkspaceCore
      projectId={projectId}
      initialIdea={undefined}
      projectData={project}
    >
      <ContainerQueryWorkspace 
        isFullscreen={false}
        sidebarCollapsed={isSidebarCollapsed}
        onSidebarCollapseChange={handleSidebarCollapseChange}
        sidebar={
          <div className="h-full min-h-0 flex flex-col">
            {chatInterface}
          </div>
        }
        header={
          <>
            
            {/* Desktop header - visible on medium+ screens with responsive behavior */}
            <div className="hidden md:block w-full min-w-0 flex-shrink-0">
              <WorkspaceHeader
                projectId={projectId}
                projectName={project?.name || 'Untitled Project'}
                onShare={handleShare}
                onExport={handleExport}
                translations={{
                  header: translations.workspace.header
                }}
                canShare={canPerformAction('share')}
                canExport={canPerformAction('export')}
                isSimpleMode={isSimpleMode}
              />
            </div>
          </>
        }
      >

        <ClientOnly fallback={
          /* Desktop: Default fallback during SSR */
          <ResponsiveWorkspaceContentSimple
            projectId={projectId}
            initialIdea={project?.businessIdea}
            sessionStartTime={sessionStartTime}
            project={project}
            questionStartTrigger={null}
            currentLayoutId={currentLayoutId}
            onLayoutChange={handleLayoutChange}
            isLayoutReady={true}
            externalChatInterface={true}
          >
            {preview}
          </ResponsiveWorkspaceContentSimple>
        }>
          {/* Only switch to mobile UI after hydration is complete and we're sure about viewport */}
          {isHydrated && showMobileUI ? (
            /* Mobile: Use MobileWorkspaceLayout - it handles panel switching internally */
            <MobileWorkspaceLayout
              viewport={viewport}
              isPortrait={isPortrait}
              isLoading={false}
              header={
                <MobileWorkspaceHeader
                  projectId={projectId}
                  projectName={project?.name || 'Untitled Project'}
                  onShare={handleShare}
                  onExport={handleExport}
                  translations={translations.workspace.header}
                  canShare={canPerformAction('share')}
                  canExport={canPerformAction('export')}
                  isSimpleMode={isSimpleMode}
                />
              }
            >
              {{
                chat: chatInterface,
                preview: preview,
                code: codeViewer
              }}
            </MobileWorkspaceLayout>
          ) : (
          /* Desktop: Original layout - default until hydration confirms mobile */
          <ResponsiveWorkspaceContentSimple
            projectId={projectId}
            initialIdea={project?.businessIdea}
            sessionStartTime={sessionStartTime}
            project={project}
            questionStartTrigger={null}
            currentLayoutId={currentLayoutId}
            onLayoutChange={handleLayoutChange}
            isLayoutReady={true}
            externalChatInterface={true}
          >
            {/* Content area with tabs for Preview/Code switching */}
            <div className="flex flex-col h-full">
              {/* Build Progress Strip - shows during active builds */}
              {isBuilding && (
                <BuildProgressStrip
                  isCodeViewerExpanded={viewMode === 'code'}
                  onToggleCodeViewer={() => setViewMode(viewMode === 'code' ? 'preview' : 'code')}
                />
              )}

              {/* Iteration Strip - simple guidance for non-tech users */}
              {!isBuilding && project?.buildStatus === 'deployed' && (
                <div className="flex-shrink-0 mb-0 mx-2 mt-2 rounded-lg bg-muted/50 p-3 text-sm text-center">
                  <strong className="text-muted-foreground">{translations.workspace.iterationStrip?.nextStep ?? 'Next step:'}</strong>{' '}
                  <span className="text-foreground">{translations.workspace.iterationStrip?.guidance ?? 'Edit the description → Try the preview → Publish the app'}</span>
                </div>
              )}

              {/* View Mode Tabs */}
              <div className="flex-shrink-0 flex items-center justify-center p-2 bg-background border-b border-border">
                {ViewModeTabs}
              </div>

              {/* Content based on view mode */}
              <div className="flex-1 min-h-0">
                {viewMode === 'preview' ? preview : codeViewer}
              </div>
            </div>
          </ResponsiveWorkspaceContentSimple>
          )}
        </ClientOnly>

        {/* Celebration Effects */}
        <CelebrationEffects
          celebration={currentCelebration}
          onComplete={clearCelebration}
        />

        {/* Smart Hints */}
        {currentHint && (
          <SmartHint
            hint={currentHint}
            onDismiss={dismissCurrentHint}
            position="top-right"
          />
        )}

        {/* Export Modal */}
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          projectId={projectId}
          projectName={project?.name || 'Untitled Project'}
          userId={user?.id}
          versionId={project?.currentVersionName}
        />

        {/* Advisor Matching Manager - handles all advisor matching UI/UX */}
        <AdvisorMatchingManager
          projectId={projectId}
          translations={translations.advisorMatching}
        />

        {/* Build Feedback Integration - triggers feedback at build milestones */}
        <BuildFeedbackIntegration
          buildId={effectiveBuildId ?? null}
          projectId={projectId}
          buildStatus={projectView.buildStatus as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null}
          onShowLogs={() => setViewMode('code')}
        />

        {/* First Build Overlay - friendly hand-off for new users */}
        {showFirstBuildOverlay && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-background rounded-xl p-6 max-w-sm text-center mx-4 shadow-xl">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                <Icon name="sparkles" className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {translations.workspace.firstBuild?.title ?? 'Building your app now'}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {translations.workspace.firstBuild?.description ?? 'Stay with us... we\'ll have your preview ready soon.'}
              </p>
              <button
                className="mt-4 px-6 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 transition-colors"
                onClick={() => setShowFirstBuildOverlay(false)}
              >
                {translations.workspace.firstBuild?.continue ?? 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Infrastructure Drawer - Easy Mode only */}
        {project?.infraMode === 'easy' && translations.infrastructure && (
          <InfrastructureDrawer
            projectId={projectId}
            buildId={project.currentBuildId}
            isSimpleMode={isSimpleMode}
            onModeToggle={() => setMode(isSimpleMode ? 'advanced' : 'simple')}
            translations={translations.infrastructure}
          />
        )}
      </ContainerQueryWorkspace>

      {/* Infrastructure Trigger Button - Fixed position button */}
      {/* Hidden when EasyModeHelper is open to avoid overlap on mobile */}
      {/* On mobile: positioned above tab bar (bottom-24 = 96px accounts for ~80px tab bar + safe area) */}
      {/* On desktop (md+): positioned at bottom-6 since there's no tab bar */}
      {project?.infraMode === 'easy' && !isHelperOpen && (
        <div className="fixed bottom-24 md:bottom-6 end-4 md:end-6 z-50">
          <InfrastructureTrigger
            variant="default"
            size="default"
            showBadge={true}
            className="shadow-lg"
          />
        </div>
      )}

      {/* Easy Mode AI Chat Helper */}
      {project?.infraMode === 'easy' && translations.infrastructure?.easyModeHelper && (
        <EasyModeHelper
          projectId={projectId}
          translations={translations.infrastructure.easyModeHelper}
          onOpenChange={setIsHelperOpen}
        />
      )}
    </WorkspaceCore>
    </FeatureSignalTracker>
    </div>
  )
}
