/**
 * Workspace Performance Optimization Hook
 *
 * Monitors and optimizes workspace performance
 * Part of Phase 3 bundle optimization
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { preloadWorkspaceComponents, workspaceComponentMetrics } from '@/components/workspace/lazy/workspace-components'

interface PerformanceMetrics {
  bundleLoadTime: number
  renderTime: number
  memoryUsage: number
  componentCount: number
  reRenderCount: number
  lastOptimized: Date
  recommendations: string[]
}

interface UseWorkspacePerformanceProps {
  projectId: string
  userId: string
  role: 'advisor' | 'client' | 'project_owner'
  enableOptimizations?: boolean
  enablePreloading?: boolean
  logMetrics?: boolean
}

interface UseWorkspacePerformanceResult {
  metrics: PerformanceMetrics
  isOptimized: boolean
  isPreloading: boolean
  preloadComponents: (components: string[]) => void
  optimizePerformance: () => void
  clearMetrics: () => void
  recommendations: string[]
}

export function useWorkspacePerformance({
  projectId,
  userId,
  role,
  enableOptimizations = true,
  enablePreloading = true,
  logMetrics = true
}: UseWorkspacePerformanceProps): UseWorkspacePerformanceResult {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    bundleLoadTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    componentCount: 0,
    reRenderCount: 0,
    lastOptimized: new Date(),
    recommendations: []
  })

  const [isOptimized, setIsOptimized] = useState(false)
  const [isPreloading, setIsPreloading] = useState(false)

  const renderStartTime = useRef<number | undefined>(undefined)
  const componentMountTimes = useRef<Map<string, number>>(new Map())
  const reRenderCount = useRef(0)
  const memoryCheckInterval = useRef<NodeJS.Timeout | null>(null)

  // Performance observer for bundle loading
  const bundleLoadObserver = useRef<PerformanceObserver | null>(null)

  // Initialize performance monitoring
  useEffect(() => {
    if (!enableOptimizations) return

    // Start render time tracking
    renderStartTime.current = performance.now()

    // Monitor bundle loading
    if ('PerformanceObserver' in window) {
      bundleLoadObserver.current = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name.includes('workspace') || entry.name.includes('advisor')) {
            const loadTime = entry.duration
            setMetrics(prev => ({
              ...prev,
              bundleLoadTime: Math.max(prev.bundleLoadTime, loadTime)
            }))

            if (logMetrics) {
              logger.info('Bundle loaded', {
                name: entry.name,
                duration: loadTime,
                projectId,
                userId
              }, 'workspace-perf')
            }
          }
        }
      })

      bundleLoadObserver.current.observe({ entryTypes: ['navigation', 'resource'] })
    }

    // Memory usage monitoring
    memoryCheckInterval.current = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory
        const memoryUsage = memory.usedJSHeapSize / 1024 / 1024 // MB

        setMetrics(prev => ({
          ...prev,
          memoryUsage
        }))
      }
    }, 5000) // Check every 5 seconds

    return () => {
      if (bundleLoadObserver.current) {
        bundleLoadObserver.current.disconnect()
      }
      if (memoryCheckInterval.current) {
        clearInterval(memoryCheckInterval.current)
      }
    }
  }, [enableOptimizations, logMetrics, projectId, userId])

  // Track render completion
  useEffect(() => {
    if (renderStartTime.current) {
      const renderTime = performance.now() - renderStartTime.current
      reRenderCount.current++

      setMetrics(prev => ({
        ...prev,
        renderTime,
        reRenderCount: reRenderCount.current
      }))

      if (logMetrics && renderTime > workspaceComponentMetrics.thresholds.maxRenderTime) {
        logger.warn('Slow render detected', {
          renderTime,
          threshold: workspaceComponentMetrics.thresholds.maxRenderTime,
          projectId,
          userId
        }, 'workspace-perf')
      }
    }
  })

  // Generate performance recommendations
  const generateRecommendations = useCallback(() => {
    const recommendations: string[] = []

    // Bundle size recommendations
    if (metrics.bundleLoadTime > workspaceComponentMetrics.thresholds.maxLoadTime) {
      recommendations.push('Consider preloading workspace components for faster loading')
      recommendations.push('Enable code splitting for role-specific features')
    }

    // Render performance recommendations
    if (metrics.renderTime > workspaceComponentMetrics.thresholds.maxRenderTime) {
      recommendations.push('Optimize component re-renders with React.memo')
      recommendations.push('Consider virtualizing large lists (logs, file trees)')
    }

    // Memory usage recommendations
    if (metrics.memoryUsage > 100) { // 100MB threshold
      recommendations.push('Monitor memory usage - consider component cleanup')
      recommendations.push('Limit log buffer size to prevent memory leaks')
    }

    // Re-render recommendations
    if (metrics.reRenderCount > 50) {
      recommendations.push('High re-render count detected - check useCallback/useMemo usage')
      recommendations.push('Consider splitting components to reduce re-render scope')
    }

    return recommendations
  }, [metrics])

  // Preload components based on role
  const preloadComponents = useCallback(async (components: string[] = []) => {
    if (!enablePreloading) return

    setIsPreloading(true)

    try {
      logger.info('Starting component preloading', {
        components,
        role,
        projectId,
        userId
      }, 'workspace-perf')

      // Preload based on role if no specific components requested
      if (components.length === 0) {
        switch (role) {
          case 'advisor':
            preloadWorkspaceComponents.advisor()
            preloadWorkspaceComponents.logs()
            break
          case 'client':
            preloadWorkspaceComponents.client()
            preloadWorkspaceComponents.files()
            preloadWorkspaceComponents.collaboration()
            break
          case 'project_owner':
            preloadWorkspaceComponents.all()
            break
        }
      } else {
        // Preload specific components
        for (const component of components) {
          if (component in preloadWorkspaceComponents) {
            (preloadWorkspaceComponents as any)[component]()
          }
        }
      }

      // Artificial delay to show preloading state
      await new Promise(resolve => setTimeout(resolve, 500))

      logger.info('Component preloading completed', {
        components,
        role,
        projectId,
        userId
      }, 'workspace-perf')

    } catch (error) {
      logger.error('Component preloading failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        components,
        role,
        projectId,
        userId
      }, 'workspace-perf')
    } finally {
      setIsPreloading(false)
    }
  }, [enablePreloading, role, projectId, userId])

  // Performance optimization actions
  const optimizePerformance = useCallback(() => {
    if (!enableOptimizations) return

    logger.info('Starting performance optimization', {
      currentMetrics: metrics,
      role,
      projectId,
      userId
    }, 'workspace-perf')

    // Force garbage collection if available
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc()
    }

    // Clear component mount times
    componentMountTimes.current.clear()

    // Reset re-render count
    reRenderCount.current = 0

    // Update optimization status
    setIsOptimized(true)
    setMetrics(prev => ({
      ...prev,
      lastOptimized: new Date(),
      recommendations: generateRecommendations()
    }))

    // Preload components for better UX
    preloadComponents()

    logger.info('Performance optimization completed', {
      projectId,
      userId,
      role
    }, 'workspace-perf')
  }, [enableOptimizations, metrics, role, projectId, userId, generateRecommendations, preloadComponents])

  // Clear metrics
  const clearMetrics = useCallback(() => {
    setMetrics({
      bundleLoadTime: 0,
      renderTime: 0,
      memoryUsage: 0,
      componentCount: 0,
      reRenderCount: 0,
      lastOptimized: new Date(),
      recommendations: []
    })
    reRenderCount.current = 0
    componentMountTimes.current.clear()
    setIsOptimized(false)

    logger.info('Performance metrics cleared', {
      projectId,
      userId
    }, 'workspace-perf')
  }, [projectId, userId])

  // Auto-optimize on mount for project owners and clients
  useEffect(() => {
    if (enableOptimizations && (role === 'project_owner' || role === 'client')) {
      // Delay auto-optimization to allow initial render
      setTimeout(() => {
        optimizePerformance()
      }, 1000)
    }
  }, [enableOptimizations, role, optimizePerformance])

  // Update recommendations when metrics change
  useEffect(() => {
    const recommendations = generateRecommendations()
    setMetrics(prev => ({
      ...prev,
      recommendations
    }))
  }, [generateRecommendations])

  return {
    metrics,
    isOptimized,
    isPreloading,
    preloadComponents,
    optimizePerformance,
    clearMetrics,
    recommendations: metrics.recommendations
  }
}