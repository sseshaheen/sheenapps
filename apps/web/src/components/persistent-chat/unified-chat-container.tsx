/**
 * Unified Chat Container
 * Main container for persistent chat with unified timeline
 *
 * CRITICAL: Single timeline replaces existing chat - no sidebar, no dual interface
 *
 * Phase 0 Integration (UNIFIED_CHAT_BUILD_EVENTS_INTEGRATION_PLAN.md):
 * - Shows BuildProgressHeader during active builds
 * - Subscribes to build state (not prop-passing buildId per plan Section 7.9)
 * - Uses singleton useCleanBuildEvents hook
 *
 * Phase 1 Integration:
 * - Uses useBuildRun hook for derived build state
 * - Passes buildRun to UnifiedMessageList for virtual card injection
 */

'use client'

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { usePersistentChat } from '@/hooks/use-persistent-chat'
import { useBuildRun } from '@/hooks/use-build-run'
import { useDeploy } from '@/hooks/useDeploy'
import { useCurrentBuildId } from '@/store/build-state-store'
import { useAuthStore } from '@/store'
import { useResponsive } from '@/hooks/use-responsive'
import { useVisualViewportHeight } from '@/hooks/use-visual-viewport'
import { useRecommendationActionsProcessor } from '@/hooks/use-recommendation-actions-sse'
import { ChatToolbar } from './chat-toolbar'
import { UnifiedMessageList } from './unified-message-list'
import { SmartComposer } from './smart-composer'
import { PresenceIndicator } from './presence-indicator'
import { BuildProgressHeader } from './build-progress-header'
import { ChatErrorBoundary, TransportError } from './chat-error-boundary'
import { DeployDialog } from '@/components/builder/infrastructure/DeployDialog'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { ProjectRecommendation } from '@/types/project-recommendations'

type ProjectBuildStatus = 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null

interface UnifiedChatContainerProps {
  projectId: string
  className?: string
  enabled?: boolean
  /** Optional: Pass buildId directly. If not provided, subscribes to global build state */
  buildId?: string
  /** Optional: Project build status for stopping polling when deployed */
  projectBuildStatus?: ProjectBuildStatus
  /** Infrastructure mode - 'easy' enables deploy button in build cards */
  infraMode?: 'easy' | 'custom' | null
  /** Subdomain for Easy Mode deployment */
  subdomain?: string
}

/**
 * Main persistent chat container with unified timeline
 * Replaces existing chat interfaces when feature flag is enabled
 */
export function UnifiedChatContainer({
  projectId,
  className,
  enabled = true,
  buildId: propBuildId,
  projectBuildStatus,
  infraMode,
  subdomain
}: UnifiedChatContainerProps) {
  const { user, isAuthenticated, isLoading, isInitializing } = useAuthStore()
  const { showMobileUI } = useResponsive()
  const containerRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('builder.workspace.auth')
  const tConnection = useTranslations('builder.workspace.connection')
  const tInfra = useTranslations('builder.infrastructure')

  // Deploy dialog state
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)

  // Phase 0 & 1: Build state subscription (Section 7.9 - subscribe, don't prop-pass)
  // Use propBuildId if provided, otherwise subscribe to global build state
  const globalBuildId = useCurrentBuildId()
  const activeBuildId = propBuildId || globalBuildId

  // Phase 1: Use useBuildRun for derived build state (includes events + recommendations)
  // CRITICAL: Gate on auth to prevent requests with empty userId (expert review fix)
  const canUseBuildRun = enabled && !!user?.id && !!projectId && !!activeBuildId

  // Map project status to values useBuildRun accepts (rollingBack/rollbackFailed → building)
  const mappedBuildStatus = useMemo(() => {
    if (projectBuildStatus === 'rollingBack' || projectBuildStatus === 'rollbackFailed') {
      return 'building' as const
    }
    return projectBuildStatus || null
  }, [projectBuildStatus])

  const buildRunOptions = useMemo(() => ({
    enabled: canUseBuildRun,
    projectBuildStatus: mappedBuildStatus
  }), [canUseBuildRun, mappedBuildStatus])

  const { buildRun, isLoading: isBuildLoading } = useBuildRun(
    canUseBuildRun ? activeBuildId! : null,
    user?.id ?? '',
    projectId,
    buildRunOptions
  )

  // Derive build state for header from buildRun
  const isBuilding = buildRun?.status === 'running'
  const isBuildComplete = buildRun?.status === 'completed'
  const isBuildFailed = buildRun?.status === 'failed'
  const currentProgress = (buildRun?.overallProgress || 0) / 100 // Convert percentage to 0-1
  const currentPhase = buildRun?.currentPhase
  const latestEventTitle = buildRun?.latestEventTitle || ''
  const previewUrl = buildRun?.previewUrl

  // Show skeleton when we have a buildId but no build run data yet (Phase 0 acceptance criteria)
  const isLoadingBuildState = !!activeBuildId && !buildRun && isBuildLoading

  // Deploy hook for Easy Mode projects
  const {
    isFirstDeploy,
    deployPhase,
    deployError,
    deployedUrl,
    isDeploying,
    quickDeploy
  } = useDeploy({
    projectId,
    enabled: enabled && infraMode === 'easy' && !!user?.id
  })

  // Memoize deploy state to pass to BuildRunCard
  const deployState = useMemo(() => ({
    isFirstDeploy,
    isDeploying,
    deployPhase,
    deployError,
    deployedUrl
  }), [isFirstDeploy, isDeploying, deployPhase, deployError, deployedUrl])

  // Deploy callbacks
  const handleOpenDeployDialog = useCallback(() => {
    setDeployDialogOpen(true)
  }, [])

  const handleQuickDeploy = useCallback((buildId: string) => {
    quickDeploy(buildId)
  }, [quickDeploy])

  // Deploy translations for BuildRunCard
  const deployTranslations = useMemo(() => ({
    deploy: tInfra('hosting.deploy.button'),
    deploying: tInfra('hosting.deploy.deploying'),
    deployed: tInfra('hosting.deploy.deployed'),
    deployFailed: tInfra('hosting.deploy.error'),
    viewSite: tInfra('hosting.deploy.viewSite')
  }), [tInfra])

  // Enable mobile keyboard handling
  useVisualViewportHeight()

  // Persistent chat hook with fixed infinite render issue
  const {
    messages,
    liveMessages,  // EXPERT FIX ROUND 3: Extract liveMessages to pass to processor
    presenceInfo,
    connectionStatus,
    isConnected,
    isConnecting,
    isLoadingHistory,
    isFetchingHistory,
    isSendingMessage,
    hasConnectionError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    sendMessage,
    updatePresence,
    markAllAsRead,
    reconnect,
    latestSeq
  } = usePersistentChat({
    projectId,
    enabled: enabled && !!user,
    historyLimit: 50
  })

  // EXPERT FIX ROUND 3: Bridge SSE events → Zustand stores (pure processor, no duplicate SSE)
  // Receives liveMessages from usePersistentChat above (single SSE source per tab)
  // EXPERT FIX ROUND 5: Pass build status to enable build_tracking → done transition
  useRecommendationActionsProcessor({
    projectId,
    enabled: enabled && !!user?.id && !!projectId,
    liveMessages,  // Pass liveMessages instead of mounting usePersistentLive again
    activeBuildId: activeBuildId || undefined,
    activeBuildStatus: buildRun?.status
  })

  // Phase 2: Handle recommendation selection (Section 6.4)
  // Sends recommendation as user message targeting AI for processing
  const handleRecommendationSelect = useCallback((recommendation: ProjectRecommendation) => {
    const actionText = `Apply recommendation: ${recommendation.title}`

    logger.info('Recommendation selected', {
      recommendationId: recommendation.id,
      sourceBuildId: buildRun?.buildId,
      projectId
    })

    // EXPERT FIX ROUND 4: Send in build mode (not plan mode)
    // Pass buildImmediately=true as 4th parameter
    sendMessage(actionText, 'ai', 'user', true)
  }, [buildRun?.buildId, projectId, sendMessage])

  // TEMPORARY: Disable presence updates while fixing backend communication
  useEffect(() => {
    if (!enabled || !user) return

    logger.info('Persistent chat enabled for project:', projectId)
    // Presence updates disabled until backend API issues are resolved

    return () => {
      logger.info('Persistent chat cleanup for project:', projectId)
    }
  }, [enabled, user, projectId])

  // NOTE: Auto-scroll logic moved to UnifiedMessageList (where the scroll container lives)
  // per expert review - containerRef is the outer flex container, not the scroll element

  // Mark messages as read when they become visible
  // Using ref pattern to avoid stale function reference (expert review fix)
  const markAllAsReadRef = useRef(markAllAsRead)
  useEffect(() => { markAllAsReadRef.current = markAllAsRead }, [markAllAsRead])

  const [lastMarkedSeq, setLastMarkedSeq] = useState<number>(0)

  useEffect(() => {
    if (latestSeq > 0 && isConnected && latestSeq > lastMarkedSeq) {
      setLastMarkedSeq(latestSeq)
      markAllAsReadRef.current()
    }
  }, [latestSeq, isConnected, lastMarkedSeq])

  // Handle transport errors (connection issues should not crash UI)
  const handleTransportError = (error: TransportError) => {
    logger.debug('persistent-chat', 'Transport error in UnifiedChatContainer', {
      error: error.message,
      type: error.type,
      projectId
    })
    
    // Transport errors are already handled by the connection state management
    // in usePersistentLive, so we just log here
  }

  if (!enabled) {
    return null
  }

  // Show loading ONLY during actual initialization/loading
  // Don't include unauthenticated state here - that's a separate branch
  if (isInitializing || isLoading) {
    return (
      <div className={cn(
        'flex h-full items-center justify-center',
        'bg-background text-muted-foreground',
        className
      )}>
        <div className="text-center">
          <h3 className="mb-2 text-lg font-medium">{t('loadingChat')}</h3>
          <p className="text-sm">{t('initializingChat')}</p>
        </div>
      </div>
    )
  }

  // Show auth required when we've finished loading and user is not authenticated
  if (!user || !isAuthenticated) {
    return (
      <div className={cn(
        'flex h-full items-center justify-center',
        'bg-background text-muted-foreground',
        className
      )}>
        <div className="text-center">
          <h3 className="mb-2 text-lg font-medium">{t('authRequired')}</h3>
          <p className="text-sm">{t('signInToAccess')}</p>
        </div>
      </div>
    )
  }

  return (
    <ChatErrorBoundary onTransportError={handleTransportError}>
      <div
        ref={containerRef}
        data-testid="chat-interface"
        className={cn(
          'flex flex-col bg-card',
          // Use visual viewport height on mobile to handle keyboard properly
          showMobileUI ? 'h-[var(--vvh,100dvh)] min-h-0' : 'h-full',
          // Remove right border on mobile for full-width experience
          showMobileUI ? '' : 'border-r border-border',
          className
        )}
        style={showMobileUI ? {
          // Ensure proper height on mobile with keyboard handling
          height: 'var(--vvh, 100dvh)'
          // Note: safe-area-inset-bottom is handled by composer wrapper only (not here)
          // to avoid double padding - expert review fix
        } : undefined}
      >
      {/* Connection Status & Toolbar */}
      <div className={cn(
        'shrink-0 border-b border-border',
        // Mobile: compact padding and safe area for notched devices
        showMobileUI && 'pt-[max(env(safe-area-inset-top),0px)]'
      )}>
        <div className={cn(
          // Mobile: compact toolbar spacing
          showMobileUI ? 'px-2 py-1' : 'px-4 py-2'
        )}>
          <ChatToolbar
            projectId={projectId}
            connectionStatus={connectionStatus}
            onReconnect={reconnect}
            isReconnecting={connectionStatus.status === 'connecting'}
            className={cn(
              // Expert's touch target optimization: minimum 44px height
              showMobileUI && 'min-h-11'
            )}
          />
        </div>
        
        {/* Presence Indicator */}
        <PresenceIndicator
          presenceInfo={presenceInfo}
          connectionStatus={connectionStatus}
        />
      </div>

      {/* Phase 0: Build Progress Header - shows during active builds */}
      <BuildProgressHeader
        isBuilding={isBuilding}
        isComplete={isBuildComplete}
        isFailed={isBuildFailed}
        progress={currentProgress}
        currentPhase={currentPhase}
        latestTitle={latestEventTitle}
        previewUrl={previewUrl}
        isLoadingBuildState={isLoadingBuildState}
      />

      {/* Message List */}
      <div className={cn(
        'flex-1 overflow-hidden',
        // Expert recommendation: prevent pull-to-refresh conflicts on mobile
        showMobileUI && 'overscroll-contain'
      )}>
        <UnifiedMessageList
          projectId={projectId}
          messages={messages}
          isLoading={isLoadingHistory}
          isFetching={isFetchingHistory}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          currentUserId={user.id}
          buildRun={buildRun}
          onRecommendationSelect={handleRecommendationSelect}
          infraMode={infraMode}
          subdomain={subdomain}
          deployState={deployState}
          onOpenDeployDialog={handleOpenDeployDialog}
          onQuickDeploy={handleQuickDeploy}
          deployTranslations={deployTranslations}
        />
      </div>

      {/* Connection Error Banner */}
      {hasConnectionError && (
        <div className={cn(
          'shrink-0 border-t border-border bg-destructive/10',
          // Mobile: more compact padding
          showMobileUI ? 'px-2 py-1' : 'px-4 py-2'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-destructive">
                {showMobileUI
                  ? tConnection('connectionLostShort')
                  : tConnection('connectionLost')
                }
              </span>
            </div>
            <button
              onClick={reconnect}
              className={cn(
                'rounded text-sm font-medium text-destructive hover:bg-destructive/20',
                // Expert's touch target: ensure 44px minimum
                showMobileUI ? 'px-2 py-1 min-h-11 min-w-11' : 'px-2 py-1'
              )}
            >
              {tConnection('reconnect')}
            </button>
          </div>
        </div>
      )}

      {/* Message Composer */}
      <div className={cn(
        'shrink-0 border-t border-border',
        // Mobile: Enhanced safe area handling following BuilderChatInterface pattern
        showMobileUI
          ? 'px-2 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]'
          : 'px-4 py-3'
      )}>
        <SmartComposer
          projectId={projectId}
          onSendMessage={sendMessage}
          onTypingStart={() => updatePresence('typing')}
          onTypingStop={() => updatePresence('online')}
          disabled={isSendingMessage || !isConnected}
          isConnected={isConnected}
          isConnecting={isConnecting}
        />
      </div>

      {/* Deploy Dialog for first-time Easy Mode deployments */}
      {infraMode === 'easy' && subdomain && (
        <DeployDialog
          open={deployDialogOpen}
          onOpenChange={setDeployDialogOpen}
          projectId={projectId}
          buildId={buildRun?.buildId || null}
          subdomain={subdomain}
          translations={{
            dialogTitle: tInfra('hosting.deploy.dialogTitle'),
            buildLabel: tInfra('hosting.deploy.buildLabel'),
            createdLabel: tInfra('hosting.deploy.createdLabel'),
            deployTo: tInfra('hosting.deploy.deployTo'),
            includes: tInfra('hosting.deploy.includes'),
            staticFiles: tInfra('hosting.deploy.staticFiles'),
            ssrBundle: tInfra('hosting.deploy.ssrBundle'),
            envVars: tInfra('hosting.deploy.envVars'),
            warning: tInfra('hosting.deploy.warning'),
            previousBuild: tInfra('hosting.deploy.previousBuild'),
            actions: {
              cancel: tInfra('hosting.deploy.actions.cancel'),
              deployNow: tInfra('hosting.deploy.actions.deployNow')
            },
            progress: {
              uploadingAssets: tInfra('hosting.deploy.progress.uploadingAssets'),
              deployingBundle: tInfra('hosting.deploy.progress.deployingBundle'),
              updatingRouting: tInfra('hosting.deploy.progress.updatingRouting'),
              complete: tInfra('hosting.deploy.progress.complete')
            },
            success: tInfra('hosting.deploy.success'),
            error: tInfra('hosting.deploy.error')
          }}
        />
      )}
    </div>
    </ChatErrorBoundary>
  )
}