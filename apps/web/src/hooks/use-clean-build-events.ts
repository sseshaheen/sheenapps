/**
 * Clean Build Events Hook
 * Uses the new clean events API for accurate progress tracking and reliable completion detection
 * Eliminates complex string parsing and provides structured data
 * 
 * 🆕 SINGLETON PATTERN: Ensures only ONE polling instance per buildId+userId combination
 * Multiple components can use the same hook but share data to prevent resource waste
 */

'use client'

/* eslint-disable no-restricted-globals */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CleanBuildEvent, CleanBuildApiResponse, CleanBuildEventsReturn } from '@/types/build-events'
import { logger } from '@/utils/logger'
import { buildQueryManager } from '@/utils/build-query-manager'
import { useCurrentBuildId, useSetCurrentBuildId, useIsBuildIdCurrent } from '@/store/build-state-store'

// 🆕 SINGLETON PATTERN: Hook Registry and Shared State Management
type HookInstanceId = string
type BuildEventsKey = `${string}-${string}` // buildId-userId

interface HookInstance {
  id: HookInstanceId
  isPrimary: boolean
  updateCallback: (data: CleanBuildEventsReturn) => void
  unmounted: boolean
}

/**
 * Shared store for build events data - broadcasts from primary to secondary instances
 */
class SharedBuildEventsStore {
  private data = new Map<BuildEventsKey, CleanBuildEventsReturn>()
  private subscribers = new Map<BuildEventsKey, Set<(data: CleanBuildEventsReturn) => void>>()
  private completionStatus = new Map<BuildEventsKey, boolean>() // Track completion status
  
  subscribe(key: BuildEventsKey, callback: (data: CleanBuildEventsReturn) => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(callback)

    // Immediately call with existing data if available
    const existingData = this.data.get(key)
    if (existingData) {
      callback(existingData)
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(key)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          this.subscribers.delete(key)
        }
      }
    }
  }

  publish(key: BuildEventsKey, data: CleanBuildEventsReturn) {
    this.data.set(key, data)
    
    // 🆕 COORDINATION: Track completion status
    if (data.isComplete) {
      this.completionStatus.set(key, true)
      logger.debug('shared-store', `✅ Marked ${key} as completed in shared store`)
    }
    
    const subscribers = this.subscribers.get(key)
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          logger.error('shared-store', 'Error in subscriber callback:', error)
        }
      })
    }
  }

  getData(key: BuildEventsKey): CleanBuildEventsReturn | undefined {
    return this.data.get(key)
  }

  // 🆕 COORDINATION: Check if build is marked as completed
  isCompleted(key: BuildEventsKey): boolean {
    return this.completionStatus.get(key) || false
  }

  clear(key: BuildEventsKey) {
    this.data.delete(key)
    this.subscribers.delete(key)
    this.completionStatus.delete(key) // 🆕 Clear completion status
  }
}

/**
 * Global registry to manage hook instances and ensure singleton polling
 */
class HookInstanceRegistry {
  private instances = new Map<BuildEventsKey, HookInstance[]>()
  private instanceCounter = 0

  register(buildId: string, userId: string, updateCallback: (data: CleanBuildEventsReturn) => void): {
    instanceId: HookInstanceId
    isPrimary: boolean
    key: BuildEventsKey
  } {
    const key: BuildEventsKey = `${buildId}-${userId}`
    const instanceId = `hook-${++this.instanceCounter}`

    if (!this.instances.has(key)) {
      this.instances.set(key, [])
    }

    const instances = this.instances.get(key)!
    const isPrimary = instances.length === 0 // First instance becomes primary

    const hookInstance: HookInstance = {
      id: instanceId,
      isPrimary,
      updateCallback,
      unmounted: false
    }

    instances.push(hookInstance)

    logger.info('hook-registry', `🎯 Hook registered: ${instanceId} for ${key} (${isPrimary ? 'PRIMARY' : 'SECONDARY'}) - Total instances: ${instances.length}`)

    return { instanceId, isPrimary, key }
  }

  unregister(instanceId: HookInstanceId, key: BuildEventsKey): { needsOwnershipTransfer: boolean } {
    const instances = this.instances.get(key)
    if (!instances) return { needsOwnershipTransfer: false }

    const instanceIndex = instances.findIndex(inst => inst.id === instanceId)
    if (instanceIndex === -1) return { needsOwnershipTransfer: false }

    const wasInstance = instances[instanceIndex]
    const wasPrimary = wasInstance.isPrimary

    // Remove the instance
    instances.splice(instanceIndex, 1)

    logger.info('hook-registry', `🗑️ Hook unregistered: ${instanceId} for ${key} (was ${wasPrimary ? 'PRIMARY' : 'SECONDARY'}) - Remaining instances: ${instances.length}`)

    // Clean up if no instances left
    if (instances.length === 0) {
      this.instances.delete(key)
      sharedStore.clear(key)
      logger.info('hook-registry', `🧹 All instances removed for ${key} - cleaned up shared data`)
      return { needsOwnershipTransfer: false }
    }

    // Transfer primary ownership if the primary instance was removed
    if (wasPrimary && instances.length > 0) {
      const nextPrimary = instances[0]
      nextPrimary.isPrimary = true
      logger.warn('hook-registry', `👑 PRIMARY OWNERSHIP TRANSFERRED: ${nextPrimary.id} is now primary for ${key}`)
      return { needsOwnershipTransfer: true }
    }

    return { needsOwnershipTransfer: false }
  }

  getInstanceCount(buildId: string, userId: string): number {
    const key: BuildEventsKey = `${buildId}-${userId}`
    return this.instances.get(key)?.length || 0
  }

  getAllInstances(): Array<{ key: BuildEventsKey, instances: HookInstance[] }> {
    return Array.from(this.instances.entries()).map(([key, instances]) => ({
      key,
      instances: instances.filter(inst => !inst.unmounted)
    }))
  }
}

// Global singleton instances
const hookRegistry = new HookInstanceRegistry()
const sharedStore = new SharedBuildEventsStore()

interface UseCleanBuildEventsOptions {
  /** Enable automatic polling when build is active */
  autoPolling?: boolean
  /** Initial polling interval in milliseconds */
  initialInterval?: number
  /** Project build status - stops polling if 'deployed' */
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed'
}

/**
 * Hook for consuming clean build events with intelligent polling
 * Provides accurate progress, reliable completion detection, and clean error handling
 */
export function useCleanBuildEvents(
  buildId: string | null,
  userId: string,
  options: UseCleanBuildEventsOptions = {}
): CleanBuildEventsReturn {
  // 🚀 ULTIMATE FIX: Normalize all parameters to prevent Hook dependency array size changes
  // CRITICAL: Always provide consistent parameter structure to prevent React Hook violations
  const normalizedBuildId = buildId || null
  const normalizedUserId = userId || ''
  const normalizedOptions = {
    autoPolling: Boolean(options?.autoPolling ?? true),
    initialInterval: Number(options?.initialInterval ?? 2000),
    projectBuildStatus: options?.projectBuildStatus || null
  }
  
  const {
    autoPolling,
    initialInterval,
    projectBuildStatus
  } = normalizedOptions

  const queryClient = useQueryClient()
  const wasCompleteRef = useRef(false)
  const currentBuildIdRef = useRef<string | null>(buildId)

  // 🆕 SINGLETON PATTERN: Hook instance management
  const [hookInstance, setHookInstance] = useState<{
    instanceId: HookInstanceId
    isPrimary: boolean
    key: BuildEventsKey
  } | null>(null)

  // State for secondary instances (subscribers)
  const [sharedData, setSharedData] = useState<CleanBuildEventsReturn | null>(null)

  // 🆕 GLOBAL STATE INTEGRATION - CONSUME ONLY (no competitive updates)
  const globalCurrentBuildId = useCurrentBuildId()
  const isBuildIdCurrent = useIsBuildIdCurrent()

  // 🚀 STABILITY FIX: Create stable reference for isBuildIdCurrent to prevent Hook violations
  const stableIsBuildIdCurrent = useCallback((id: string | null) => {
    return isBuildIdCurrent(id)
  }, [isBuildIdCurrent])

  // 🆕 CRITICAL FIX: Use global buildId as source of truth, with prop fallback for initial state
  // DO NOT try to update global state from hooks - this causes race conditions
  const effectiveBuildId = globalCurrentBuildId || normalizedBuildId

  // 🆕 DEBUG: Log when there's a mismatch between prop and global state
  React.useEffect(() => {
    if (normalizedBuildId && globalCurrentBuildId && normalizedBuildId !== globalCurrentBuildId) {
      logger.warn('clean-events', `📋 BuildId mismatch - prop: ${normalizedBuildId.slice(0, 8)}, global: ${globalCurrentBuildId.slice(0, 8)}, using global as source of truth`)
    }
  }, [normalizedBuildId, globalCurrentBuildId])

  // 🆕 SINGLETON PATTERN: Register hook instance and determine primary/secondary role
  useEffect(() => {
    if (!effectiveBuildId || !normalizedUserId) {
      return
    }

    // 🆕 INITIALIZATION PATIENCE: Wait a bit to ensure global state is initialized
    const isGloballyCurrent = stableIsBuildIdCurrent(effectiveBuildId)
    if (!isGloballyCurrent) {
      logger.debug('clean-events', `⏳ Hook registration delayed: BuildId ${effectiveBuildId.slice(0, 8)} not yet globally current - waiting for initialization...`)
      
      // Use a small delay to allow synchronous initialization to complete
      const timeoutId = setTimeout(() => {
        if (!stableIsBuildIdCurrent(effectiveBuildId)) {
          logger.warn('clean-events', `⚠️ BuildId ${effectiveBuildId.slice(0, 8)} still not globally current after delay - proceeding anyway`)
        }
      }, 100) // Small delay to allow sync initialization
      
      return () => clearTimeout(timeoutId)
    }

    const updateCallback = (data: CleanBuildEventsReturn) => {
      setSharedData(data)
    }

    const registration = hookRegistry.register(effectiveBuildId, normalizedUserId, updateCallback)
    setHookInstance(registration)

    const instanceCount = hookRegistry.getInstanceCount(effectiveBuildId, normalizedUserId)
    logger.info('clean-events', `🎭 Hook instance initialized: ${registration.instanceId} (${registration.isPrimary ? 'PRIMARY' : 'SECONDARY'}) - Total: ${instanceCount}`)

    // If this is a secondary instance, subscribe to shared data
    let unsubscribe: (() => void) | null = null
    if (!registration.isPrimary) {
      unsubscribe = sharedStore.subscribe(registration.key, updateCallback)
      logger.info('clean-events', `📡 Secondary instance ${registration.instanceId} subscribed to shared data`)
    }

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
      
      const { needsOwnershipTransfer } = hookRegistry.unregister(registration.instanceId, registration.key)
      
      if (needsOwnershipTransfer) {
        logger.warn('clean-events', `👑 Primary instance ${registration.instanceId} unmounted - ownership transferred`)
      }
    }
  }, [effectiveBuildId, normalizedUserId, stableIsBuildIdCurrent])

  // Register this QueryClient with the global manager and activate current buildId
  useEffect(() => {
    buildQueryManager.registerQueryClient(queryClient)
    
    // Initialize buildId as active on first mount
    if (effectiveBuildId) {
      buildQueryManager.activateBuildId(effectiveBuildId, queryClient)
      currentBuildIdRef.current = effectiveBuildId
    }
  }, [queryClient])

  // 🆕 CRITICAL: Global buildId transition with defensive cleanup
  useEffect(() => {
    if (effectiveBuildId && effectiveBuildId !== currentBuildIdRef.current) {
      const oldBuildId = currentBuildIdRef.current
      
      logger.info('clean-events', `🔄 Global buildId transition detected: ${oldBuildId?.slice(0, 8) || 'null'} → ${effectiveBuildId.slice(0, 8)}`)
      
      // STEP 1: SURGICAL CLEANUP - Cancel polling for old buildId but preserve final data
      if (oldBuildId && !isBuildIdCurrent(oldBuildId)) {
        logger.info('clean-events', `🔄 Stopping polling for old buildId (not globally current): ${oldBuildId.slice(0, 8)}`)
        queryClient.cancelQueries({ queryKey: ['clean-build-events', oldBuildId] })
        // Note: We keep the data intact so completed builds can still display their final state
      }
      
      // STEP 2: Activate new buildId and cleanup stale queries (only if globally current)
      if (stableIsBuildIdCurrent(effectiveBuildId)) {
        buildQueryManager.activateBuildId(effectiveBuildId, queryClient)
        currentBuildIdRef.current = effectiveBuildId
        
        // STEP 3: Force immediate invalidation to start fresh polling
        logger.info('clean-events', `🚀 Starting fresh queries for globally current buildId: ${effectiveBuildId.slice(0, 8)}`)
        queryClient.invalidateQueries({ queryKey: ['clean-build-events', effectiveBuildId] })
      } else {
        logger.warn('clean-events', `❌ BuildId ${effectiveBuildId.slice(0, 8)} is not globally current, skipping activation`)
      }
    }
  }, [effectiveBuildId, queryClient, stableIsBuildIdCurrent])

  // Component unmount cleanup - stop polling but preserve data
  useEffect(() => {
    return () => {
      if (effectiveBuildId) {
        logger.debug('clean-events', `🧹 Component unmounting, stopping polling for buildId: ${effectiveBuildId.slice(0, 8)}`)
        queryClient.cancelQueries({ queryKey: ['clean-build-events', effectiveBuildId], exact: true })
        // Note: We keep the data intact for other components that might still need it
      }
    }
  }, [effectiveBuildId, queryClient])

  // 🆕 SINGLETON PATTERN: Only primary instances run React Query
  const shouldRunQuery = hookInstance?.isPrimary || false
  
  const { data, isSuccess, isLoading, error } = useQuery({
    queryKey: ['clean-build-events', effectiveBuildId], // Use effective buildId as key
    queryFn: async (): Promise<CleanBuildApiResponse | null> => {
      if (!effectiveBuildId) return null

      // 🆕 GLOBAL STATE: Quadruple-check we're fetching the globally current buildId
      if (!stableIsBuildIdCurrent(effectiveBuildId)) {
        logger.warn('clean-events', `❌ Query cancelled - buildId ${effectiveBuildId.slice(0, 8)} not globally current`)
        throw new Error(`Non-current buildId query cancelled: ${effectiveBuildId.slice(0, 8)}`)
      }

      // DEFENSIVE: Triple-check we're fetching the current buildId
      if (effectiveBuildId !== currentBuildIdRef.current || !buildQueryManager.isActiveBuildId(effectiveBuildId)) {
        const debugInfo = {
          queryBuildId: effectiveBuildId.slice(0, 8),
          currentBuildId: currentBuildIdRef.current?.slice(0, 8) || 'null',
          globalCurrentBuildId: globalCurrentBuildId?.slice(0, 8) || 'null',
          isActive: buildQueryManager.isActiveBuildId(effectiveBuildId),
          isGloballyCurrent: stableIsBuildIdCurrent(effectiveBuildId),
          reason: effectiveBuildId !== currentBuildIdRef.current ? 'buildId_mismatch' : 'not_active'
        }
        logger.warn('clean-events', `❌ Query function cancelled - stale buildId detected: ${JSON.stringify(debugInfo)}`)
        throw new Error(`Stale buildId query cancelled: ${effectiveBuildId.slice(0, 8)}`)
      }
      
      // ADDITIONAL: Final validation before making HTTP request
      const activeBuildIds = buildQueryManager.getActiveBuildIds()
      if (activeBuildIds.length > 0 && !activeBuildIds.includes(effectiveBuildId)) {
        logger.error('clean-events', `🚨 Critical: BuildId ${effectiveBuildId.slice(0, 8)} not in active list: [${activeBuildIds.map(id => id.slice(0, 8)).join(', ')}]`)
        throw new Error(`BuildId not in active list: ${effectiveBuildId.slice(0, 8)}`)
      }

      // Always fetch all events (lastEventId=0) to ensure consistency across components
      // SECURITY: No longer pass userId - API gets it from session
      const url = `/api/builds/${effectiveBuildId}/events?lastEventId=0`

      logger.debug('clean-events', `Fetching events for globally current buildId: ${effectiveBuildId.slice(0, 8)}`)

      const response = await fetch(url, {
        credentials: 'include' // Include authentication cookies
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch build events: ${response.status}`)
      }

      const data = await response.json() as CleanBuildApiResponse
      logger.info('clean-events', `🚨 CLEAN BUILD EVENTS: Data updated - buildId: ${effectiveBuildId.slice(0, 8)}, events: ${data.events?.length || 0}`)
      
      return data
    },
    enabled: Boolean(
      shouldRunQuery && // 🆕 SINGLETON PATTERN: Only primary instances poll
      effectiveBuildId && 
      normalizedUserId && 
      autoPolling && 
      effectiveBuildId === currentBuildIdRef.current && 
      buildQueryManager.isActiveBuildId(effectiveBuildId) &&
      stableIsBuildIdCurrent(effectiveBuildId) // 🆕 GLOBAL STATE: Only poll if globally current
    ),
    refetchInterval: (query) => {
      if (!autoPolling || !effectiveBuildId || !shouldRunQuery) {
        logger.debug('clean-events', `⏹️ Polling disabled: autoPolling=${autoPolling}, buildId=${effectiveBuildId?.slice(0, 8) || 'null'}, shouldRunQuery=${shouldRunQuery}`)
        return false
      }

      // 🆕 COORDINATION: Check if build is already completed in shared store
      if (hookInstance) {
        const isSharedCompleted = sharedStore.isCompleted(hookInstance.key)
        if (isSharedCompleted) {
          logger.info('clean-events', `⏹️ PRIMARY ${hookInstance.instanceId}: Polling stopped - Build marked completed in shared store`)
          return false
        }
      }

      // 🆕 GLOBAL STATE: Stop polling if buildId is not globally current
      if (!stableIsBuildIdCurrent(effectiveBuildId)) {
        logger.warn('clean-events', `⏹️ Polling stopped: BuildId ${effectiveBuildId.slice(0, 8)} not globally current`)
        return false
      }

      // SURGICAL OPTION 1: Stop polling if this is not the current/active buildId
      if (effectiveBuildId !== currentBuildIdRef.current || !buildQueryManager.isActiveBuildId(effectiveBuildId)) {
        const debugInfo = {
          queryBuildId: effectiveBuildId.slice(0, 8),
          currentBuildId: currentBuildIdRef.current?.slice(0, 8) || 'null',
          globalCurrentBuildId: globalCurrentBuildId?.slice(0, 8) || 'null',
          isActive: buildQueryManager.isActiveBuildId(effectiveBuildId),
          isGloballyCurrent: stableIsBuildIdCurrent(effectiveBuildId),
          activeBuildIds: buildQueryManager.getActiveBuildIds().map(id => id.slice(0, 8)),
          reason: effectiveBuildId !== currentBuildIdRef.current ? 'buildId_mismatch' : 'not_active'
        }
        logger.warn('clean-events', `⏹️ Polling stopped: Stale buildId detected: ${JSON.stringify(debugInfo)}`)
        return false
      }

      // Get query data once for all checks
      const queryData = query.state.data as CleanBuildApiResponse | null
      const currentEvents = queryData?.events || []

      // SURGICAL OPTION 2: Stop polling if project build status is deployed (but preserve data)
      // If the project status is deployed, we can safely stop polling
      if (projectBuildStatus === 'deployed') {
        // Check if we have deploy completed event before stopping
        const hasDeployCompleteEvent = currentEvents.some(e => 
          e.phase === 'deploy' && (e.event_type === 'completed' || e.event_type === 'deploy_completed')
        )
        
        if (shouldRunQuery) {
          logger.info('clean-events', `⏹️ PRIMARY ${hookInstance?.instanceId}: Project status is 'deployed' - hasDeployCompleteEvent: ${hasDeployCompleteEvent}, buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        
        // Stop polling when status is deployed, even without explicit deploy_completed event
        // The project status is the source of truth
        if (shouldRunQuery) {
          logger.info('clean-events', `⏹️ Polling stopped: Project status is 'deployed' for buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        return false
      }

      // SURGICAL OPTION 3: Stop polling on failed status (but preserve data)  
      if (projectBuildStatus === 'failed') {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam
        if (shouldRunQuery) {
          logger.info('clean-events', `⏹️ PRIMARY ${hookInstance?.instanceId}: Build polling stopped - Project status: failed for buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        return false
      }

      // SURGICAL OPTION 4: Check individual events for completion (fallback)
      
      // Build is complete ONLY when deploy phase completes OR any phase fails
      const completionEvent = currentEvents.find(e => {
        const deployComplete = e.phase === 'deploy' && (e.event_type === 'completed' || e.event_type === 'deploy_completed')
        const failed = e.event_type === 'failed'
        const finishedDeploy = e.finished === true && e.phase === 'deploy'
        
        return deployComplete || failed || finishedDeploy
      })
      const isFinished = !!completionEvent
      
      // Log what triggered completion for debugging
      if (isFinished && shouldRunQuery) {
        logger.info('clean-events', `🏁 Completion event detected - Phase: ${completionEvent.phase}, Type: ${completionEvent.event_type}, Finished: ${completionEvent.finished}`)
      }
      
      // Hard max runtime ceiling (15 minutes) - use query creation time
      const queryCreatedAt = query.state.dataUpdatedAt || Date.now()
      if (Date.now() - queryCreatedAt > 15 * 60 * 1000) {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam
        if (shouldRunQuery) {
          logger.warn('clean-events', `⏰ PRIMARY ${hookInstance?.instanceId}: Build polling stopped - 15-minute ceiling reached for buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        return false
      }

      // SURGICAL OPTION 5: Stop polling when build is finished via events (but preserve final data)
      if (isFinished) {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam  
        if (shouldRunQuery) {
          logger.info('clean-events', `🎉 PRIMARY ${hookInstance?.instanceId}: Build polling stopped - Build completed for buildId: ${effectiveBuildId.slice(0, 8)}`)
          
          // 🆕 COORDINATION: Update shared store with completion status
          if (hookInstance) {
            const completedData: CleanBuildEventsReturn = {
              events: currentEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
              isComplete: true,
              currentProgress: currentEvents[currentEvents.length - 1]?.overall_progress || 1,
              previewUrl: currentEvents.slice().reverse().find(e => e.preview_url)?.preview_url || null,
              stepIndex: currentEvents[currentEvents.length - 1]?.step_index,
              totalSteps: currentEvents[currentEvents.length - 1]?.total_steps,
              currentPhase: currentEvents[currentEvents.length - 1]?.phase,
              error: null,
              isLoading: false
            }
            sharedStore.publish(hookInstance.key, completedData)
            logger.info('clean-events', `📡 PRIMARY ${hookInstance.instanceId}: Published completion status to secondary instances`)
          }
        }
        return false
      }

      // 🆕 CIRCUIT BREAKER: Check for zombie polling before continuing
      const { zombieCount } = buildQueryManager.checkForZombiePolling()
      if (zombieCount > 0) {
        logger.error('clean-events', `🧟 Zombie polling detected for ${effectiveBuildId.slice(0, 8)} - killing zombie instances`)
        buildQueryManager.killZombiePolling()
        // Continue polling if current buildId is still valid after cleanup
        if (!buildQueryManager.isActiveBuildId(effectiveBuildId)) {
          logger.warn('clean-events', `⏹️ Current buildId ${effectiveBuildId.slice(0, 8)} was killed by zombie cleanup`)
          return false
        }
      }

      // Adaptive polling intervals based on latest event phase from React Query data
      const latestEvent = currentEvents[currentEvents.length - 1]
      const interval = getAdaptiveInterval(latestEvent?.phase)
      
      logger.debug('clean-events', `🔄 Polling continues for ${effectiveBuildId.slice(0, 8)}: interval=${interval}ms, phase=${latestEvent?.phase || 'unknown'}`)
      return interval
    },
    staleTime: 500, // Keep data fresh for progress updates
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnMount: true, // Refetch on mount to get latest data
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent duplicate requests
  })

  // Derive all values directly from React Query data - no component state
  const events = data?.events || []
  const sortedEvents = events.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  
  const latestEvent = sortedEvents[sortedEvents.length - 1]
  
  // Check if deploy has completed (for preview URL update)
  const hasDeployCompleted = sortedEvents.some(e => {
    const deployComplete = e.phase === 'deploy' && (e.event_type === 'completed' || e.event_type === 'deploy_completed')
    const finishedDeploy = e.finished === true && e.phase === 'deploy'
    
    if (deployComplete || finishedDeploy) {
      logger.info('clean-events', `📦 Deploy completed - Event ID: ${e.id}, Type: ${e.event_type}, Phase: ${e.phase}, Preview URL: ${e.preview_url || 'none'}`)
    }
    
    return deployComplete || finishedDeploy
  })
  
  // Build is complete when: deploy finished, recommendations generated, or failed
  const isComplete = sortedEvents.some(e => {
    // Failed at any point
    if (e.event_type === 'failed') {
      logger.info('clean-events', `❌ Build failed - Event ID: ${e.id}, Phase: ${e.phase}`)
      return true
    }
    
    // Deploy completed (build is successful even without recommendations)
    if (e.phase === 'deploy' && (e.event_type === 'completed' || e.event_type === 'deploy_completed')) {
      logger.info('clean-events', `✅ Build complete - Deploy finished - Event ID: ${e.id}`)
      return true
    }
    
    // Recommendations generated (bonus completion signal)
    if (e.phase === 'metadata' && e.event_type === 'progress' && e.event_code === 'BUILD_RECOMMENDATIONS_GENERATED') {
      logger.info('clean-events', `✅ Build fully complete with recommendations - Event ID: ${e.id}`)
      return true
    }
    
    return false
  })
  
  // Log current build status for debugging
  if (!isComplete && latestEvent) {
    logger.debug('clean-events', `⏳ Build in progress - Latest: ${latestEvent.event_type} in ${latestEvent.phase} phase, Progress: ${(latestEvent.overall_progress * 100).toFixed(0)}%`)
  }
  
  // Detect if recommendations have been generated
  const hasRecommendationsGenerated = sortedEvents.some(e => 
    e.phase === 'metadata' && 
    e.event_type === 'progress' && 
    e.event_code === 'BUILD_RECOMMENDATIONS_GENERATED'
  )
  
  if (hasRecommendationsGenerated) {
    logger.debug('clean-events', '📋 Recommendations generated event detected')
  }
  
  // Get the LATEST preview URL, preferably from deploy completion
  const deployCompleteEvent = sortedEvents.find(e => 
    e.phase === 'deploy' && (e.event_type === 'completed' || e.event_type === 'deploy_completed')
  )
  const previewUrl = deployCompleteEvent?.preview_url || 
                     sortedEvents.slice().reverse().find(e => e.preview_url)?.preview_url || 
                     null
  
  // Log preview URL extraction
  if (previewUrl) {
    logger.info(`🌐 Preview URL extracted:`, {
      url: previewUrl,
      source: deployCompleteEvent ? 'deploy-complete-event' : 'any-event-with-url',
      buildId: effectiveBuildId?.slice(0, 8)
    }, 'clean-events')
  }
  const currentProgress = latestEvent?.overall_progress || 0
  const currentPhase = latestEvent?.phase
  const stepIndex = latestEvent?.step_index
  const totalSteps = latestEvent?.total_steps
  
  // Track buildId changes to detect new builds
  const previousBuildIdRef = useRef<string | null>(null)
  const isNewBuildRef = useRef(false)
  
  // Detect new builds by buildId changes
  useEffect(() => {
    if (effectiveBuildId && effectiveBuildId !== previousBuildIdRef.current) {
      logger.info('clean-events', `🆕 New build detected: ${effectiveBuildId.slice(0, 8)} (previous: ${previousBuildIdRef.current?.slice(0, 8) || 'none'})`)
      isNewBuildRef.current = true
      previousBuildIdRef.current = effectiveBuildId
    }
  }, [effectiveBuildId])
  
  // Reset new build flag when build completes
  useEffect(() => {
    if (isComplete && isNewBuildRef.current) {
      logger.info('clean-events', `✅ Build completed, resetting new build flag`)
      isNewBuildRef.current = false
    }
  }, [isComplete])

  // 🆕 SINGLETON PATTERN: Prepare return data
  // FIX: Show loading for active builds, considering both events and enabled state
  // Loading should be shown when:
  // 1. Query is actively loading data
  // 2. Build is in progress based on events (!isComplete)
  // 3. We have a buildId with autoPolling but no events yet (new build starting)
  const hasEvents = sortedEvents.length > 0
  const isBuildInProgress = hasEvents && !isComplete
  
  // Check if the query is enabled (all conditions met for polling)
  const isQueryEnabled = Boolean(
    shouldRunQuery && 
    effectiveBuildId && 
    normalizedUserId && 
    autoPolling && 
    effectiveBuildId === currentBuildIdRef.current && 
    buildQueryManager.isActiveBuildId(effectiveBuildId) &&
    stableIsBuildIdCurrent(effectiveBuildId)
  )
  
  const shouldShowLoading = Boolean(
    effectiveBuildId && autoPolling && (
      isLoading || // Query is actively loading
      isBuildInProgress || // Build is in progress based on events  
      (isNewBuildRef.current && !isComplete) // New build detected, not complete yet
    )
  )
  
  const returnData: CleanBuildEventsReturn = {
    events: sortedEvents,
    isComplete,
    currentProgress,
    previewUrl,
    stepIndex,
    totalSteps,
    currentPhase,
    hasRecommendationsGenerated,
    hasDeployCompleted, // Add this for components to know when preview is ready
    error: error as Error | null,
    isLoading: shouldShowLoading
  }

  // 🚀 STABILITY FIX: Create stable refs for dependency array
  const hookInstanceIdRef = useRef<string | null>(null)
  const hookInstanceKeyRef = useRef<string | null>(null)
  
  if (hookInstance) {
    hookInstanceIdRef.current = hookInstance.instanceId
    hookInstanceKeyRef.current = hookInstance.key
  }

  // 🆕 SINGLETON PATTERN: Primary instances publish data to secondary instances
  useEffect(() => {
    if (shouldRunQuery && isSuccess && data && hookInstance) {
      const eventsWithPreviewUrls = events.filter(e => e.preview_url)
      
      // Only log for primary instances to reduce console spam
      console.log('🚨 CLEAN BUILD EVENTS: Data updated (PRIMARY)', {
        instanceId: hookInstance.instanceId,
        buildId: normalizedBuildId?.slice(0, 8),
        newEventCount: events.length,
        lastEventId: data.lastEventId,
        previewUrlsFound: eventsWithPreviewUrls.length,
        extractedPreviewUrl: previewUrl
      })
      
      // Publish to secondary instances
      sharedStore.publish(hookInstance.key, returnData)
      
      logger.info('clean-events', `📡 PRIMARY ${hookInstance.instanceId}: Published data to secondary instances - ${events.length} events`)
    }
  }, [shouldRunQuery, isSuccess, data, hookInstance?.instanceId, events.length, previewUrl, normalizedBuildId, isComplete])

  // Decide output data but don't return early to maintain hook call invariants
  const outputData = (!shouldRunQuery && sharedData) ? sharedData : returnData
  
  if (!shouldRunQuery && sharedData) {
    logger.debug('clean-events', `📡 SECONDARY ${hookInstance?.instanceId}: Using shared data - ${sharedData.events.length} events`)
  }

  // Handle build completion and invalidate related caches - ONLY FOR PRIMARY INSTANCES
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current && effectiveBuildId && shouldRunQuery) {
      wasCompleteRef.current = true
      
      logger.info(`🎉 Build ${effectiveBuildId.slice(0, 8)} completed! Invalidating version caches... (PRIMARY ${hookInstance?.instanceId})`)
      
      // Invalidate all version-related queries to refresh version displays
      queryClient.invalidateQueries({ queryKey: ['project-status'] })
      queryClient.invalidateQueries({ queryKey: ['version-history'] })
      queryClient.invalidateQueries({ queryKey: ['current-version'] })
      
      // Also invalidate any workspace project queries
      queryClient.invalidateQueries({ queryKey: ['workspace-project'] })
      
      console.log('🔄 Version caches invalidated after build completion (PRIMARY ONLY)')
    }
  }, [isComplete, effectiveBuildId, queryClient, shouldRunQuery, hookInstance?.instanceId])

  // Reset completion tracking when buildId changes
  useEffect(() => {
    wasCompleteRef.current = false
  }, [effectiveBuildId])

  // Cleanup: Cancel query when component unmounts
  useEffect(() => {
    return () => {
      if (effectiveBuildId) {
        logger.info('clean-events', `Component unmounting - cancelling query for buildId: ${effectiveBuildId.slice(0, 8)}`)
        queryClient.cancelQueries({ queryKey: ['clean-build-events', effectiveBuildId] })
      }
    }
  }, [effectiveBuildId, queryClient])

  // 🆕 SINGLETON PATTERN: Return decided output data (primary data or shared data for secondary)
  return outputData
}

/**
 * Get adaptive polling interval based on build phase
 * Faster polling during active phases, slower during longer operations
 */
function getAdaptiveInterval(phase?: string): number {
  // Fast polling during active phases
  if (phase === 'build' || phase === 'deploy') return 1000
  
  // Slower polling during longer steps
  if (phase === 'dependencies') return 3000
  
  // Default polling interval
  return 2000
}

/**
 * Simplified build events hook for components that only need basic status
 */
export function useCleanBuildStatus(buildId: string | null, userId: string) {
  // 🚀 ULTIMATE FIX: Use consistent parameter normalization - no conditional objects
  const normalizedOptions = useMemo(() => ({
    autoPolling: true,
    initialInterval: 3000,
    projectBuildStatus: null as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null
  }), [])
  
  const { isComplete, currentProgress, previewUrl, error, isLoading } = useCleanBuildEvents(
    buildId || null,
    userId || '',
    normalizedOptions
  )

  return {
    isComplete,
    currentProgress,
    previewUrl,
    error,
    isLoading,
    progressPercentage: Math.round(currentProgress * 100)
  }
}

// 🆕 DEVELOPMENT TOOLS: Expose singleton pattern monitoring in dev mode
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Extend existing debug tools with singleton monitoring
  const existingTools = (window as any).buildDebugTools || {}
  
  ;(window as any).buildDebugTools = {
    ...existingTools,
    
    // Monitor hook instances
    hookInstances: () => {
      const allInstances = hookRegistry.getAllInstances()
      console.group('🎭 Hook Instance Registry')
      console.log(`📊 Total buildId-userId combinations: ${allInstances.length}`)
      
      allInstances.forEach(({ key, instances }) => {
        const [buildId, userId] = key.split('-')
        console.log(`\n🔑 ${buildId.slice(0, 8)}-${userId.slice(0, 8)}:`)
        instances.forEach(instance => {
          console.log(`  ${instance.isPrimary ? '👑 PRIMARY' : '📡 SECONDARY'}: ${instance.id}`)
        })
      })
      
      if (allInstances.length === 0) {
        console.log('✅ No active hook instances')
      }
      
      console.groupEnd()
      return allInstances
    },

    // Check for multiple instances of same buildId
    findDuplicates: () => {
      const allInstances = hookRegistry.getAllInstances()
      const duplicates = allInstances.filter(({ instances }) => instances.length > 1)
      
      if (duplicates.length > 0) {
        console.group('⚠️  Multiple Hook Instances Detected')
        duplicates.forEach(({ key, instances }) => {
          const [buildId, userId] = key.split('-')
          console.warn(`🚨 ${instances.length} instances for ${buildId.slice(0, 8)}-${userId.slice(0, 8)}:`)
          instances.forEach(instance => {
            console.log(`  ${instance.isPrimary ? '👑 PRIMARY' : '📡 SECONDARY'}: ${instance.id}`)
          })
        })
        console.groupEnd()
      } else {
        console.log('✅ No duplicate instances found')
      }
      
      return duplicates
    },

    // Get shared store data
    sharedData: () => {
      console.group('📦 Shared Store Data')
      const allInstances = hookRegistry.getAllInstances()
      
      allInstances.forEach(({ key }) => {
        const data = sharedStore.getData(key)
        const isSharedCompleted = sharedStore.isCompleted(key)
        const [buildId, userId] = key.split('-')
        console.log(`${buildId.slice(0, 8)}-${userId.slice(0, 8)}:`, {
          hasData: !!data,
          eventCount: data?.events.length || 0,
          isComplete: data?.isComplete || false,
          isSharedCompleted, // 🆕 Show shared completion status
          previewUrl: data?.previewUrl || 'none'
        })
      })
      
      console.groupEnd()
    },

    // Force cleanup all hook instances (emergency reset)
    clearAllHooks: () => {
      console.warn('🧹 EMERGENCY: Clearing all hook instances')
      const allInstances = hookRegistry.getAllInstances()
      let clearedCount = 0
      
      allInstances.forEach(({ key, instances }) => {
        instances.forEach(instance => {
          hookRegistry.unregister(instance.id, key)
          clearedCount++
        })
        sharedStore.clear(key)
      })
      
      console.log(`💀 Cleared ${clearedCount} hook instances`)
      return clearedCount
    }
  }

  console.log('🎭 Hook registry debug tools available at window.buildDebugTools')
  console.log('Commands: hookInstances(), findDuplicates(), sharedData(), clearAllHooks()')
}
