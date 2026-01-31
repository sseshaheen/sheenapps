/**
 * Resume Token Management Hook (Week 2.2 Implementation)
 * Expert-recommended auto-retry system for blocked operations
 */

import { useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'

interface BlockedOperation {
  id: string
  type: string
  resumeToken: string
  originalParams: any
  timestamp: Date
  expiresAt: Date // Resume tokens have 1-hour TTL per expert recommendation
}

interface UseResumeTokenReturn {
  blockedOperations: BlockedOperation[]
  storeBlockedOperation: (operation: Omit<BlockedOperation, 'id' | 'timestamp' | 'expiresAt'>) => string
  removeBlockedOperation: (id: string) => void
  retryOperation: (id: string) => Promise<boolean>
  clearExpiredOperations: () => void
  hasBlockedOperations: boolean
}

/**
 * Resume Token Hook - Manages operations blocked by insufficient funds
 * Provides auto-retry capability after successful purchases
 */
export function useResumeToken(): UseResumeTokenReturn {
  const [blockedOperations, setBlockedOperations] = useState<BlockedOperation[]>([])
  const queryClient = useQueryClient()

  // Load blocked operations from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('blocked-operations')
    if (stored) {
      try {
        const operations = JSON.parse(stored).map((op: any) => ({
          ...op,
          timestamp: new Date(op.timestamp),
          expiresAt: new Date(op.expiresAt)
        }))
        setBlockedOperations(operations)
      } catch (error) {
        logger.error('Failed to parse stored blocked operations:', error)
        localStorage.removeItem('blocked-operations')
      }
    }
  }, [])

  // Persist blocked operations to localStorage
  useEffect(() => {
    if (blockedOperations.length > 0) {
      localStorage.setItem('blocked-operations', JSON.stringify(blockedOperations))
    } else {
      localStorage.removeItem('blocked-operations')
    }
  }, [blockedOperations])

  // Clear expired operations (resume tokens have 1-hour TTL)
  const clearExpiredOperations = useCallback(() => {
    const now = new Date()
    setBlockedOperations(prev => {
      const active = prev.filter(op => op.expiresAt > now)
      if (active.length !== prev.length) {
        logger.info(`🗑️ Cleared ${prev.length - active.length} expired blocked operations`)
      }
      return active
    })
  }, [])

  // Store a new blocked operation
  const storeBlockedOperation = useCallback((operation: Omit<BlockedOperation, 'id' | 'timestamp' | 'expiresAt'>) => {
    const id = `blocked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const timestamp = new Date()
    const expiresAt = new Date(timestamp.getTime() + 60 * 60 * 1000) // 1 hour TTL

    const blockedOp: BlockedOperation = {
      id,
      timestamp,
      expiresAt,
      ...operation
    }

    setBlockedOperations(prev => [...prev, blockedOp])
    
    logger.info('🔒 Stored blocked operation for retry:', {
      id,
      type: operation.type,
      expiresAt
    })

    return id
  }, [])

  // Remove a blocked operation
  const removeBlockedOperation = useCallback((id: string) => {
    setBlockedOperations(prev => {
      const filtered = prev.filter(op => op.id !== id)
      logger.info('✅ Removed blocked operation:', { id })
      return filtered
    })
  }, [])

  // Retry a blocked operation using its resume token
  const retryOperation = useCallback(async (id: string): Promise<boolean> => {
    const operation = blockedOperations.find(op => op.id === id)
    if (!operation) {
      logger.error('❌ Blocked operation not found:', { id })
      return false
    }

    // Check if token is still valid
    if (operation.expiresAt <= new Date()) {
      logger.warn('⏰ Resume token expired, removing operation:', { id })
      removeBlockedOperation(id)
      return false
    }

    try {
      logger.info('🔄 Retrying blocked operation:', {
        id,
        type: operation.type,
        resumeToken: operation.resumeToken
      })

      // Call the appropriate retry endpoint based on operation type
      const response = await fetch(`/api/v1/operations/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeToken: operation.resumeToken,
          operationType: operation.type,
          originalParams: operation.originalParams
        })
      })

      if (response.ok) {
        logger.info('✅ Operation retry successful:', { id })
        removeBlockedOperation(id)
        
        // Invalidate balance cache to reflect usage
        queryClient.invalidateQueries({ queryKey: ['enhanced-balance'] })
        
        return true
      } else {
        const errorData = await response.json().catch(() => ({}))
        logger.error('❌ Operation retry failed:', {
          id,
          status: response.status,
          error: errorData
        })
        
        // If token is invalid, remove the operation
        if (response.status === 400 || response.status === 404) {
          removeBlockedOperation(id)
        }
        
        return false
      }
    } catch (error) {
      logger.error('❌ Operation retry error:', { id, error })
      return false
    }
  }, [blockedOperations, removeBlockedOperation, queryClient])

  // Auto-clear expired operations every 5 minutes
  useEffect(() => {
    const interval = setInterval(clearExpiredOperations, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [clearExpiredOperations])

  return {
    blockedOperations,
    storeBlockedOperation,
    removeBlockedOperation,
    retryOperation,
    clearExpiredOperations,
    hasBlockedOperations: blockedOperations.length > 0
  }
}

/**
 * Purchase Success Handler Hook
 * Automatically retries blocked operations after successful purchases
 */
export function usePurchaseSuccessHandler() {
  const { blockedOperations, retryOperation } = useResumeToken()

  const handlePurchaseSuccess = useCallback(async (resumeToken?: string) => {
    if (!resumeToken) {
      logger.info('💳 Purchase successful but no resume token provided')
      return
    }

    // Find operations that match this resume token
    const matchingOperations = blockedOperations.filter(op => op.resumeToken === resumeToken)
    
    if (matchingOperations.length === 0) {
      logger.info('💳 Purchase successful but no matching blocked operations found', { resumeToken })
      return
    }

    logger.info(`💳 Purchase successful, retrying ${matchingOperations.length} blocked operations`, { resumeToken })

    // Retry all matching operations
    const retryPromises = matchingOperations.map(op => retryOperation(op.id))
    const results = await Promise.all(retryPromises)

    const successCount = results.filter(Boolean).length
    logger.info(`✅ Completed auto-retry: ${successCount}/${results.length} operations successful`)

    return {
      total: results.length,
      successful: successCount,
      failed: results.length - successCount
    }
  }, [blockedOperations, retryOperation])

  return {
    handlePurchaseSuccess,
    pendingRetries: blockedOperations.length
  }
}