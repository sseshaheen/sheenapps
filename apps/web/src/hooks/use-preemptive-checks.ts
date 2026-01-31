/**
 * Preemptive Balance Check Hooks (Week 2.3 Implementation)
 * Expert-recommended system for checking balance before expensive operations
 */

import { useCallback, useMemo } from 'react'
import { useEnhancedBalance } from './use-ai-time-balance'
import { useBatchOperationCheck } from './use-ai-time-balance'
import { logger } from '@/utils/logger'
import type { BatchOperationRequest, InsufficientFundsError } from '@/types/billing'

export interface OperationEstimate {
  operation: string
  estimatedSeconds: number
  confidence: 'high' | 'medium' | 'low'
  basedOnSamples?: number
}

export interface PreflightResult {
  allowed: boolean
  totalRequired: number
  currentBalance: number
  deficit?: number
  recommendations?: InsufficientFundsError['suggestions']
  blockedOperations?: string[]
}

/**
 * Enhanced Preemptive Balance Check Hook
 * Provides comprehensive operation validation before expensive AI operations
 */
export function usePreemptiveBalanceCheck(userId: string) {
  const { data: balance, isLoading } = useEnhancedBalance(userId)
  const { checkBatchOperations: checkBatchOps } = useBatchOperationCheck()

  // Operation cost estimates (based on historical data)
  const operationEstimates: Record<string, OperationEstimate> = useMemo(() => ({
    'build': {
      operation: 'build',
      estimatedSeconds: 120, // 2 minutes average
      confidence: 'high',
      basedOnSamples: 1000
    },
    'plan': {
      operation: 'plan', 
      estimatedSeconds: 30, // 30 seconds average
      confidence: 'high',
      basedOnSamples: 500
    },
    'export': {
      operation: 'export',
      estimatedSeconds: 15, // 15 seconds average
      confidence: 'medium',
      basedOnSamples: 200
    },
    'metadata_generation': {
      operation: 'metadata_generation',
      estimatedSeconds: 45, // 45 seconds average
      confidence: 'medium',
      basedOnSamples: 300
    }
  }), [])

  // Single operation check
  const checkOperation = useCallback((operationType: string, customEstimate?: number): PreflightResult => {
    if (!balance) {
      return { 
        allowed: false, 
        totalRequired: 0, 
        currentBalance: 0,
        blockedOperations: [operationType]
      }
    }

    const estimate = operationEstimates[operationType]
    const estimatedSeconds = customEstimate || estimate?.estimatedSeconds || 60 // Default 1 minute

    const currentBalance = balance.totals.total_seconds
    const sufficient = currentBalance >= estimatedSeconds

    logger.info(`🔍 Preemptive check for ${operationType}:`, {
      required: estimatedSeconds,
      available: currentBalance,
      sufficient,
      confidence: estimate?.confidence || 'low'
    })

    if (!sufficient) {
      const deficit = estimatedSeconds - currentBalance
      
      return {
        allowed: false,
        totalRequired: estimatedSeconds,
        currentBalance,
        deficit,
        blockedOperations: [operationType],
        recommendations: generateRecommendations(deficit)
      }
    }

    return {
      allowed: true,
      totalRequired: estimatedSeconds,
      currentBalance
    }
  }, [balance, operationEstimates])

  // Batch operation check using backend endpoint
  const checkBatchOperations = useCallback(async (operations: string[]): Promise<PreflightResult> => {
    if (!userId || operations.length === 0) {
      return { allowed: false, totalRequired: 0, currentBalance: 0 }
    }

    // Convert operation names to BatchOperationRequest format
    const batchRequests: BatchOperationRequest[] = operations.map(op => {
      const estimate = operationEstimates[op]
      return {
        operation: op as any,
        estimate_seconds: estimate?.estimatedSeconds || 60
      }
    })

    try {
      const result = await checkBatchOps(userId, batchRequests)

      logger.info(`🔍 Batch preemptive check for ${operations.length} operations:`, {
        sufficient: result.sufficient,
        totalRequired: result.total_required_seconds,
        currentBalance: result.balance_seconds
      })

      if (!result.sufficient) {
        const blockedOps = result.insufficient_operations?.map(op => op.operation) || []
        
        return {
          allowed: false,
          totalRequired: result.total_required_seconds,
          currentBalance: result.balance_seconds,
          deficit: result.total_required_seconds - result.balance_seconds,
          blockedOperations: blockedOps,
          recommendations: result.insufficient_operations?.[0]?.suggestions
        }
      }

      return {
        allowed: true,
        totalRequired: result.total_required_seconds,
        currentBalance: result.balance_seconds
      }
    } catch (error) {
      logger.error('❌ Batch preemptive check failed:', error)
      
      // Fallback to individual checks
      return checkIndividualOperations(operations)
    }
  }, [userId, operationEstimates, checkBatchOps])

  // Fallback individual operation checking
  const checkIndividualOperations = useCallback((operations: string[]): PreflightResult => {
    if (!balance) {
      return { 
        allowed: false, 
        totalRequired: 0, 
        currentBalance: 0,
        blockedOperations: operations
      }
    }

    let totalRequired = 0
    const blockedOperations: string[] = []

    // Calculate total requirement and identify blocked operations
    for (const op of operations) {
      const estimate = operationEstimates[op]
      const required = estimate?.estimatedSeconds || 60
      totalRequired += required

      if (balance.totals.total_seconds < totalRequired) {
        blockedOperations.push(op)
      }
    }

    const sufficient = balance.totals.total_seconds >= totalRequired

    if (!sufficient) {
      const deficit = totalRequired - balance.totals.total_seconds
      
      return {
        allowed: false,
        totalRequired,
        currentBalance: balance.totals.total_seconds,
        deficit,
        blockedOperations,
        recommendations: generateRecommendations(deficit)
      }
    }

    return {
      allowed: true,
      totalRequired,
      currentBalance: balance.totals.total_seconds
    }
  }, [balance, operationEstimates])

  // Get operation estimate
  const getOperationEstimate = useCallback((operationType: string): OperationEstimate | null => {
    return operationEstimates[operationType] || null
  }, [operationEstimates])

  // Check if user has sufficient balance for common operations
  const balanceStatus = useMemo(() => {
    if (!balance) return null

    const currentBalance = balance.totals.total_seconds
    
    return {
      canBuild: currentBalance >= (operationEstimates.build?.estimatedSeconds || 120),
      canPlan: currentBalance >= (operationEstimates.plan?.estimatedSeconds || 30),
      canExport: currentBalance >= (operationEstimates.export?.estimatedSeconds || 15),
      canGenerateMetadata: currentBalance >= (operationEstimates.metadata_generation?.estimatedSeconds || 45),
      totalMinutes: Math.floor(currentBalance / 60),
      warningThreshold: currentBalance < 300, // Less than 5 minutes
      criticalThreshold: currentBalance < 60   // Less than 1 minute
    }
  }, [balance, operationEstimates])

  return {
    balance,
    isLoading,
    checkOperation,
    checkBatchOperations, 
    getOperationEstimate,
    balanceStatus,
    isReady: !isLoading && !!balance
  }
}

/**
 * Generate purchase recommendations based on deficit
 */
function generateRecommendations(deficitSeconds: number): InsufficientFundsError['suggestions'] {
  const deficitMinutes = Math.ceil(deficitSeconds / 60)
  
  // Simple recommendation logic - in real implementation, this would come from pricing catalog
  if (deficitMinutes <= 30) {
    return [{
      type: 'package',
      key: 'mini',
      minutes: 30
    }]
  } else if (deficitMinutes <= 120) {
    return [{
      type: 'package', 
      key: 'basic',
      minutes: 120
    }]
  } else {
    return [{
      type: 'upgrade',
      plan: 'starter'
    }]
  }
}

/**
 * Builder-Specific Preemptive Check Hook
 * Specialized hook for builder operations with intelligent suggestions
 */
export function useBuilderPreemptiveCheck(userId: string) {
  const { checkBatchOperations, balanceStatus, getOperationEstimate } = usePreemptiveBalanceCheck(userId)

  // Check common builder workflows
  const checkBuilderWorkflow = useCallback(async (workflow: 'quick-build' | 'full-build' | 'plan-and-build') => {
    const workflows = {
      'quick-build': ['build'],
      'full-build': ['plan', 'build', 'export'],
      'plan-and-build': ['plan', 'build']
    }

    const operations = workflows[workflow] || ['build']
    return await checkBatchOperations(operations)
  }, [checkBatchOperations])

  // Get estimated time for workflow
  const getWorkflowEstimate = useCallback((workflow: 'quick-build' | 'full-build' | 'plan-and-build') => {
    const workflows = {
      'quick-build': ['build'],
      'full-build': ['plan', 'build', 'export'], 
      'plan-and-build': ['plan', 'build']
    }

    const operations = workflows[workflow] || ['build']
    let totalSeconds = 0

    for (const op of operations) {
      const estimate = getOperationEstimate(op)
      totalSeconds += estimate?.estimatedSeconds || 60
    }

    return {
      totalSeconds,
      totalMinutes: Math.ceil(totalSeconds / 60),
      operations: operations.map(op => ({
        name: op,
        estimate: getOperationEstimate(op)
      }))
    }
  }, [getOperationEstimate])

  return {
    balanceStatus,
    checkBuilderWorkflow,
    getWorkflowEstimate,
    canStartBuilding: balanceStatus?.canBuild || false
  }
}