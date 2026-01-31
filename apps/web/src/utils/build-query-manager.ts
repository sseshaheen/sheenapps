/**
 * Global Build Query Manager
 * 
 * Manages React Query cleanup for build events to prevent stale buildId polling
 * in same-tab scenarios where buildId changes but old queries persist.
 */

import { QueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'

class BuildQueryManager {
  private activeBuildIds = new Set<string>()
  private queryClients = new Set<QueryClient>()
  
  // 🆕 CIRCUIT BREAKER: Track buildId start times to prevent infinite polling
  private buildIdStartTimes = new Map<string, number>()
  private readonly MAX_POLLING_DURATION = 20 * 60 * 1000 // 20 minutes max
  private readonly ZOMBIE_CHECK_INTERVAL = 60 * 1000 // Check every minute

  /**
   * Register a QueryClient for cleanup management
   */
  registerQueryClient(queryClient: QueryClient) {
    this.queryClients.add(queryClient)
    logger.debug('build-query-manager', 'QueryClient registered')
  }

  /**
   * Get registered query clients (for debug tools)
   */
  getQueryClients(): QueryClient[] {
    return Array.from(this.queryClients)
  }

  /**
   * Register a new buildId and cleanup old ones
   */
  activateBuildId(buildId: string | null, queryClient: QueryClient) {
    if (!buildId) {
      logger.warn('build-query-manager', 'Cannot activate null buildId')
      return
    }

    const previousBuildIds = Array.from(this.activeBuildIds)
    logger.info('build-query-manager', `🎯 Activating buildId: ${buildId.slice(0, 8)} (previous: [${previousBuildIds.map(id => id.slice(0, 8)).join(', ')}])`)
    
    // Only cleanup if we're changing to a different buildId
    const wasAlreadyActive = this.activeBuildIds.has(buildId)
    
    if (!wasAlreadyActive) {
      // Log what we're cleaning up
      if (previousBuildIds.length > 0) {
        logger.info('build-query-manager', `🧹 Deactivating old buildIds: [${previousBuildIds.map(id => id.slice(0, 8)).join(', ')}]`)
        
        // CRITICAL: Log buildId transition for debugging state synchronization issues
        if (previousBuildIds.length === 1) {
          logger.warn('build-query-manager', `🔄 BuildId transition detected: ${previousBuildIds[0].slice(0, 8)} → ${buildId.slice(0, 8)} (this should stop all polling of old buildId)`)
        }
        
        // 🆕 CIRCUIT BREAKER: Remove old buildIds from tracking
        previousBuildIds.forEach(oldBuildId => {
          this.buildIdStartTimes.delete(oldBuildId)
          logger.debug('build-query-manager', `⏰ Removed buildId ${oldBuildId.slice(0, 8)} from circuit breaker tracking`)
        })
      }
      
      // Clean up ALL previous buildIds
      this.cleanupAllStaleQueries(queryClient)
      
      // Clear the set and add only the current buildId
      this.activeBuildIds.clear()
      this.activeBuildIds.add(buildId)
      
      // 🆕 CIRCUIT BREAKER: Start tracking new buildId
      this.buildIdStartTimes.set(buildId, Date.now())
      logger.info('build-query-manager', `⏰ Circuit breaker: Started tracking buildId ${buildId.slice(0, 8)} (max polling duration: ${this.MAX_POLLING_DURATION / 60000} minutes)`)
      
      logger.info('build-query-manager', `✅ BuildId activation complete: ${buildId.slice(0, 8)} is now the ONLY active buildId`)
    } else {
      logger.info('build-query-manager', `✅ BuildId already active: ${buildId.slice(0, 8)} (no cleanup needed)`)
    }
    
    logger.debug('build-query-manager', `Active buildIds: [${Array.from(this.activeBuildIds).map(id => id.slice(0, 8)).join(', ')}]`)
  }

  /**
   * Aggressively cleanup all build event queries
   */
  private cleanupAllStaleQueries(queryClient: QueryClient) {
    logger.info('build-query-manager', '🧹 Performing aggressive cleanup of ALL build event queries')
    
    try {
      // Get list of queries before cleanup for logging
      const cache = queryClient.getQueryCache()
      const buildEventQueries = cache.findAll({ queryKey: ['clean-build-events'] })
      const queryBuildIds = buildEventQueries.map(q => {
        const buildId = q.queryKey[1] as string
        return buildId?.slice(0, 8) || 'unknown'
      })
      
      if (queryBuildIds.length > 0) {
        logger.info('build-query-manager', `🗑️ Found ${buildEventQueries.length} queries to cleanup: [${queryBuildIds.join(', ')}]`)
      }
      
      // Cancel all running queries
      const cancelResult = queryClient.cancelQueries({
        queryKey: ['clean-build-events'],
        exact: false
      })
      logger.debug('build-query-manager', `📞 Cancelled queries: ${cancelResult}`)
      
      // Remove all cached data
      queryClient.removeQueries({
        queryKey: ['clean-build-events'],
        exact: false
      })
      logger.debug('build-query-manager', '🗂️ Removed cached query data')
      
      // Clear query cache entirely for build events
      buildEventQueries.forEach((query, index) => {
        const buildId = query.queryKey[1] as string
        logger.debug('build-query-manager', `🔄 Resetting query ${index + 1}: ${buildId?.slice(0, 8) || 'unknown'}`)
        query.reset()
        cache.remove(query)
      })
      
      logger.info('build-query-manager', `✅ Cleanup complete: Removed ${buildEventQueries.length} stale build event queries`)
      
    } catch (error) {
      logger.error('build-query-manager', '❌ Error during cleanup:', error)
    }
  }

  /**
   * Check if a buildId is currently active
   */
  isActiveBuildId(buildId: string | null): boolean {
    if (!buildId) return false
    return this.activeBuildIds.has(buildId)
  }

  /**
   * Get all active buildIds (for debugging)
   */
  getActiveBuildIds(): string[] {
    return Array.from(this.activeBuildIds)
  }

  // 🆕 CIRCUIT BREAKER METHODS

  /**
   * Check for zombie polling - buildIds that have been active too long
   */
  checkForZombiePolling(): { zombieCount: number, zombieBuildIds: string[] } {
    const now = Date.now()
    const zombieBuildIds: string[] = []

    for (const [buildId, startTime] of this.buildIdStartTimes.entries()) {
      const duration = now - startTime
      if (duration > this.MAX_POLLING_DURATION) {
        logger.warn('build-query-manager', `🧟 ZOMBIE POLLING detected: buildId ${buildId.slice(0, 8)} has been polling for ${Math.round(duration / 60000)} minutes (max: ${this.MAX_POLLING_DURATION / 60000})`)
        zombieBuildIds.push(buildId)
      }
    }

    if (zombieBuildIds.length > 0) {
      logger.error('build-query-manager', `🚨 Found ${zombieBuildIds.length} zombie buildIds: [${zombieBuildIds.map(id => id.slice(0, 8)).join(', ')}]`)
    }

    return { zombieCount: zombieBuildIds.length, zombieBuildIds }
  }

  /**
   * Force stop zombie polling for buildIds that exceed max duration
   */
  killZombiePolling(): number {
    const { zombieCount, zombieBuildIds } = this.checkForZombiePolling()
    
    if (zombieBuildIds.length === 0) {
      logger.debug('build-query-manager', '✅ No zombie polling detected')
      return 0
    }

    logger.warn('build-query-manager', `🔪 FORCE KILLING ${zombieBuildIds.length} zombie polling instances`)

    // Force cleanup all zombie buildIds
    zombieBuildIds.forEach(buildId => {
      logger.error('build-query-manager', `⚰️ Force killing zombie buildId: ${buildId.slice(0, 8)}`)
      
      // Remove from active set
      this.activeBuildIds.delete(buildId)
      this.buildIdStartTimes.delete(buildId)
      
      // Cancel all queries for this buildId across all query clients
      const queryClients = this.getQueryClients()
      queryClients.forEach(queryClient => {
        try {
          queryClient.cancelQueries({ queryKey: ['clean-build-events', buildId] })
          queryClient.removeQueries({ queryKey: ['clean-build-events', buildId] })
          logger.debug('build-query-manager', `💀 Cancelled and removed queries for zombie buildId: ${buildId.slice(0, 8)}`)
        } catch (error) {
          logger.error('build-query-manager', `Error killing zombie queries for ${buildId.slice(0, 8)}:`, error)
        }
      })
    })

    logger.info('build-query-manager', `✅ Zombie cleanup complete: Killed ${zombieBuildIds.length} zombie instances`)
    return zombieBuildIds.length
  }

  /**
   * Manual emergency stop - kills ALL polling immediately
   */
  emergencyStop(): void {
    logger.error('build-query-manager', '🚨 EMERGENCY STOP: Killing ALL build polling immediately')
    
    const allBuildIds = Array.from(this.activeBuildIds)
    logger.warn('build-query-manager', `💀 Emergency stopping ${allBuildIds.length} active buildIds: [${allBuildIds.map(id => id.slice(0, 8)).join(', ')}]`)

    // Clear all tracking
    this.activeBuildIds.clear()
    this.buildIdStartTimes.clear()

    // Cancel ALL build event queries across ALL query clients
    const queryClients = this.getQueryClients()
    queryClients.forEach(queryClient => {
      try {
        queryClient.cancelQueries({ queryKey: ['clean-build-events'] })
        queryClient.removeQueries({ queryKey: ['clean-build-events'] })
        logger.debug('build-query-manager', '💀 Emergency cancelled ALL build event queries')
      } catch (error) {
        logger.error('build-query-manager', 'Error during emergency stop:', error)
      }
    })

    logger.error('build-query-manager', '🔥 EMERGENCY STOP COMPLETE - All build polling terminated')
  }

  /**
   * Get circuit breaker status for debugging
   */
  getCircuitBreakerStatus(): {
    activeBuildIds: { buildId: string, duration: number, isZombie: boolean }[]
    totalActive: number
    zombieCount: number
  } {
    const now = Date.now()
    const activeBuildIds = Array.from(this.activeBuildIds).map(buildId => {
      const startTime = this.buildIdStartTimes.get(buildId) || now
      const duration = now - startTime
      return {
        buildId: buildId.slice(0, 8),
        duration: Math.round(duration / 60000), // minutes
        isZombie: duration > this.MAX_POLLING_DURATION
      }
    })

    const zombieCount = activeBuildIds.filter(b => b.isZombie).length

    return {
      activeBuildIds,
      totalActive: this.activeBuildIds.size,
      zombieCount
    }
  }
}

// Global singleton instance
export const buildQueryManager = new BuildQueryManager()

// 🆕 DEVELOPMENT TOOLS: Expose circuit breaker controls on window in dev mode
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Add debug tools to global window object
  ;(window as any).buildDebugTools = {
    // Check circuit breaker status
    status: () => {
      const status = buildQueryManager.getCircuitBreakerStatus()
      console.group('🔧 Build Query Manager Status')
      console.log('📊 Active BuildIds:', status.activeBuildIds)
      console.log('🔢 Total Active:', status.totalActive)
      console.log('🧟 Zombie Count:', status.zombieCount)
      if (status.zombieCount > 0) {
        console.warn('⚠️ Zombie polling detected!')
      } else {
        console.log('✅ No zombie polling')
      }
      console.groupEnd()
      return status
    },

    // Manual zombie cleanup
    killZombies: () => {
      console.log('🔪 Manually killing zombie polling...')
      const killed = buildQueryManager.killZombiePolling()
      console.log(`💀 Killed ${killed} zombie instances`)
      return killed
    },

    // Emergency stop everything
    emergencyStop: () => {
      console.warn('🚨 EMERGENCY STOP: Killing ALL build polling')
      buildQueryManager.emergencyStop()
      console.log('🔥 Emergency stop complete')
    },

    // Check for specific buildId
    checkBuildId: (buildId: string) => {
      const isActive = buildQueryManager.isActiveBuildId(buildId)
      console.log(`BuildId ${buildId.slice(0, 8)} is ${isActive ? 'ACTIVE' : 'INACTIVE'}`)
      return isActive
    },

    // 🆕 EMERGENCY: Find all React Query instances related to build events
    auditAllQueries: () => {
      console.group('🔍 React Query Audit - All Build Event Queries')
      let totalQueries = 0
      
      const queryClients = buildQueryManager.getQueryClients()
      queryClients.forEach((queryClient, index) => {
        console.log(`\n📊 Query Client #${index + 1}:`)
        
        const cache = queryClient.getQueryCache()
        const allQueries = cache.findAll({ queryKey: ['clean-build-events'] })
        
        allQueries.forEach((query, queryIndex) => {
          totalQueries++
          const buildId = query.queryKey[1] as string
          const isStale = query.isStale()
          const lastFetch = query.state.dataUpdatedAt
          
          console.log(`  Query #${queryIndex + 1}:`, {
            buildId: buildId?.slice(0, 8) || 'unknown',
            isActive: buildQueryManager.isActiveBuildId(buildId),
            isStale,
            lastFetchTime: lastFetch ? new Date(lastFetch).toISOString() : 'never',
            state: query.state.status
          })
        })
      })
      
      console.log(`\n📈 Total build event queries found: ${totalQueries}`)
      console.log('🎯 Active buildIds:', buildQueryManager.getActiveBuildIds().map(id => id.slice(0, 8)))
      console.groupEnd()
      
      return { totalQueries, activeBuildIds: buildQueryManager.getActiveBuildIds() }
    },

    // 🆕 EMERGENCY: Force clear ALL queries and reset everything
    nuclearlReset: () => {
      console.error('🚨 NUCLEAR RESET: Destroying ALL build queries and state')
      
      const queryClients = buildQueryManager.getQueryClients()
      queryClients.forEach(queryClient => {
        queryClient.cancelQueries({ queryKey: ['clean-build-events'] })
        queryClient.removeQueries({ queryKey: ['clean-build-events'] })
        queryClient.clear()
      })
      
      buildQueryManager.emergencyStop()
      console.error('💥 Nuclear reset complete - all queries destroyed')
    }
  }

  console.log('🛠️ Build debug tools available at window.buildDebugTools')
  console.log('Commands: status(), killZombies(), emergencyStop(), checkBuildId(id)')
}