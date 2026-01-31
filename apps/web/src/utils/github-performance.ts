/**
 * GitHub Performance Utilities
 * Provides performance monitoring and optimization utilities for GitHub sync operations
 */

import React from 'react'
import { logger } from '@/utils/logger'

export interface PerformanceMetrics {
  operation: string
  startTime: number
  endTime?: number
  duration?: number
  success?: boolean
  error?: string
  metadata?: Record<string, any>
}

class GitHubPerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map()
  private readonly PERFORMANCE_THRESHOLD = 1000 // 1 second

  /**
   * Start monitoring a GitHub operation
   */
  startOperation(operationId: string, operation: string, metadata?: Record<string, any>): void {
    const metric: PerformanceMetrics = {
      operation,
      startTime: Date.now(),
      metadata
    }
    
    this.metrics.set(operationId, metric)
    
    logger.debug('performance', 'GitHub operation started', { operationId, operation, metadata })
  }

  /**
   * Complete monitoring a GitHub operation
   */
  endOperation(operationId: string, success: boolean = true, error?: string): void {
    const metric = this.metrics.get(operationId)
    if (!metric) return

    metric.endTime = Date.now()
    metric.duration = metric.endTime - metric.startTime
    metric.success = success
    metric.error = error

    // Log performance metrics
    const logLevel = metric.duration > this.PERFORMANCE_THRESHOLD ? 'warn' : 'debug'
    logger[logLevel]('GitHub operation completed', {
      operationId,
      operation: metric.operation,
      duration: metric.duration,
      success,
      error,
      slow: metric.duration > this.PERFORMANCE_THRESHOLD
    })

    // Keep metrics for analysis
    if (process.env.NODE_ENV === 'development') {
      console.log(`GitHub ${metric.operation}: ${metric.duration}ms`, {
        operationId,
        success,
        error
      })
    }

    this.metrics.delete(operationId)
  }

  /**
   * Get current active operations
   */
  getActiveOperations(): PerformanceMetrics[] {
    return Array.from(this.metrics.values())
  }

  /**
   * Check if operation is taking too long
   */
  isOperationSlow(operationId: string): boolean {
    const metric = this.metrics.get(operationId)
    if (!metric) return false
    
    const duration = Date.now() - metric.startTime
    return duration > this.PERFORMANCE_THRESHOLD
  }
}

// Global performance monitor instance
export const githubPerformanceMonitor = new GitHubPerformanceMonitor()

/**
 * Performance monitoring decorator for async functions
 */
export function withGitHubPerformanceMonitoring<T extends any[], R>(
  operation: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const operationId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    try {
      githubPerformanceMonitor.startOperation(operationId, operation, {
        args: args.length
      })
      
      const result = await fn(...args)
      githubPerformanceMonitor.endOperation(operationId, true)
      
      return result
    } catch (error) {
      githubPerformanceMonitor.endOperation(
        operationId, 
        false, 
        error instanceof Error ? error.message : String(error)
      )
      throw error
    }
  }
}

/**
 * Hook for monitoring React component performance
 */
export function useGitHubPerformanceMonitoring(componentName: string) {
  const [renderCount, setRenderCount] = React.useState(0)
  const renderStartTime = React.useRef<number>(Date.now())

  React.useEffect(() => {
    setRenderCount(prev => prev + 1)
    const renderTime = Date.now() - renderStartTime.current
    
    if (renderTime > 100) { // Log slow renders
      logger.warn('Slow GitHub component render', {
        component: componentName,
        renderTime,
        renderCount
      })
    }
    
    renderStartTime.current = Date.now()
  })

  return { renderCount }
}

/**
 * Debounce utility for search and user input
 */
export function debounce<T extends any[]>(
  func: (...args: T) => void,
  wait: number
): (...args: T) => void {
  let timeout: NodeJS.Timeout
  
  return (...args: T) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttle utility for API calls
 */
export function throttle<T extends any[]>(
  func: (...args: T) => void,
  limit: number
): (...args: T) => void {
  let inThrottle: boolean
  
  return (...args: T) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

/**
 * Cache utility for API responses
 */
class GitHubResponseCache {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map()

  set(key: string, data: any, ttlMs: number = 30000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    })
  }

  get(key: string): any | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const now = Date.now()
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

export const githubResponseCache = new GitHubResponseCache()

/**
 * Batch multiple similar operations
 */
export class GitHubOperationBatcher<T, R> {
  private pending: Map<string, {
    resolve: (value: R) => void
    reject: (error: any) => void
    timestamp: number
  }> = new Map()
  
  private batchTimeout: NodeJS.Timeout | null = null
  private readonly batchDelay: number = 100 // ms

  constructor(
    private batchProcessor: (items: T[]) => Promise<R[]>,
    private keyExtractor: (item: T) => string
  ) {}

  async add(item: T): Promise<R> {
    const key = this.keyExtractor(item)
    
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
    }

    return new Promise<R>((resolve, reject) => {
      this.pending.set(key, { resolve, reject, timestamp: Date.now() })
      
      // Schedule batch processing
      this.batchTimeout = setTimeout(() => {
        this.processBatch()
      }, this.batchDelay)
    })
  }

  private async processBatch(): Promise<void> {
    if (this.pending.size === 0) return

    const batch = Array.from(this.pending.entries())
    this.pending.clear()
    this.batchTimeout = null

    try {
      const items = batch.map(([key]) => key as any) // Simplified for demo
      const results = await this.batchProcessor(items)
      
      batch.forEach(([key, { resolve }], index) => {
        resolve(results[index])
      })
    } catch (error) {
      batch.forEach(([, { reject }]) => {
        reject(error)
      })
    }
  }
}

/**
 * Memory usage tracking for development
 */
export function trackGitHubMemoryUsage(operation: string): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') {
    return
  }

  // performance.memory is Chrome-specific API
  const memory = (window.performance as any)?.memory
  if (memory) {
    logger.debug('GitHub operation memory usage', operation, {
      used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
    })
  }
}