/**
 * Operation Recovery Utilities (Week 2.2 Implementation)
 * Expert-recommended auto-retry system with structured error handling
 */

import type { InsufficientFundsError } from '@/types/billing'
import { logger } from '@/utils/logger'

export interface OperationContext {
  type: string
  params: any
  userId: string
  estimatedSeconds?: number
}

export interface RecoveryResult {
  success: boolean
  resumeToken?: string
  error?: string
  suggestion?: InsufficientFundsError['suggestions'][0]
}

/**
 * Handle 402 Insufficient Funds Error with Recovery Options
 * Creates structured recovery flow with resume tokens
 */
export async function handleInsufficientFundsError(
  error: InsufficientFundsError,
  context: OperationContext
): Promise<RecoveryResult> {
  logger.info('💳 Handling insufficient funds error', {
    operation: context.type,
    balanceSeconds: error.balance_seconds,
    resumeToken: !!error.resume_token
  })

  // If no resume token provided, this is a basic insufficient funds error
  if (!error.resume_token) {
    logger.warn('No resume token provided for insufficient funds error')
    return {
      success: false,
      error: 'No resume token available for auto-retry',
      suggestion: error.suggestions[0] // Return first suggestion
    }
  }

  // Store the operation for later retry
  const resumeToken = error.resume_token
  
  try {
    // Store operation context in session storage for recovery
    const recoveryData = {
      context,
      error,
      timestamp: Date.now(),
      expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour TTL
    }

    sessionStorage.setItem(`recovery_${resumeToken}`, JSON.stringify(recoveryData))
    
    logger.info('✅ Operation recovery data stored', {
      resumeToken,
      operationType: context.type
    })

    return {
      success: true,
      resumeToken,
      suggestion: findBestSuggestion(error.suggestions, context.estimatedSeconds)
    }
  } catch (err) {
    logger.error('❌ Failed to store recovery data:', err)
    return {
      success: false,
      error: 'Failed to prepare operation recovery',
      suggestion: error.suggestions[0]
    }
  }
}

/**
 * Find the best purchase suggestion based on operation requirements
 * Expert algorithm for optimizing user experience
 */
function findBestSuggestion(
  suggestions: InsufficientFundsError['suggestions'], 
  estimatedSeconds?: number
): InsufficientFundsError['suggestions'][0] | undefined {
  if (!suggestions.length) return undefined

  // If we have estimated seconds, prefer packages that cover the need
  if (estimatedSeconds) {
    const requiredMinutes = Math.ceil(estimatedSeconds / 60)
    
    // Find packages that can cover the requirement
    const suitablePackages = suggestions
      .filter(s => s.type === 'package' && s.minutes && s.minutes >= requiredMinutes)
      .sort((a, b) => (a.minutes || 0) - (b.minutes || 0)) // Smallest suitable package first

    if (suitablePackages.length > 0) {
      return suitablePackages[0]
    }
  }

  // Fallback: prefer packages over upgrades, then by order
  const packages = suggestions.filter(s => s.type === 'package')
  if (packages.length > 0) {
    return packages[0]
  }

  return suggestions[0]
}

/**
 * Retry Operation with Resume Token
 * Called after successful purchase to continue blocked operations
 */
export async function retryOperationWithToken(resumeToken: string): Promise<RecoveryResult> {
  try {
    // Retrieve stored recovery data
    const storedData = sessionStorage.getItem(`recovery_${resumeToken}`)
    if (!storedData) {
      logger.error('❌ No recovery data found for resume token:', { resumeToken })
      return {
        success: false,
        error: 'Recovery data not found or expired'
      }
    }

    const recoveryData = JSON.parse(storedData)
    
    // Check if recovery data is still valid (1 hour TTL)
    if (Date.now() > recoveryData.expiresAt) {
      logger.warn('⏰ Recovery data expired:', { resumeToken })
      sessionStorage.removeItem(`recovery_${resumeToken}`)
      return {
        success: false,
        error: 'Recovery data expired'
      }
    }

    const { context } = recoveryData

    logger.info('🔄 Retrying operation with resume token', {
      resumeToken,
      operationType: context.type
    })

    // Call the appropriate retry API based on operation type
    const response = await fetch(`/api/v1/operations/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resumeToken,
        operationType: context.type,
        originalParams: context.params,
        userId: context.userId
      })
    })

    if (response.ok) {
      const result = await response.json()
      
      // Clean up recovery data on success
      sessionStorage.removeItem(`recovery_${resumeToken}`)
      
      logger.info('✅ Operation retry successful', {
        resumeToken,
        operationType: context.type
      })

      return {
        success: true,
        resumeToken
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      logger.error('❌ Operation retry failed:', {
        resumeToken,
        status: response.status,
        error: errorData
      })

      return {
        success: false,
        error: `Retry failed: ${response.status}`,
        resumeToken
      }
    }
  } catch (error) {
    logger.error('❌ Operation retry error:', { resumeToken, error })
    return {
      success: false,
      error: 'Failed to retry operation',
      resumeToken
    }
  }
}

/**
 * Check for Pending Recovery Operations
 * Called on page load to handle redirects from successful purchases
 */
export function checkPendingRecovery(): string[] {
  const pendingTokens: string[] = []
  
  // Check sessionStorage for recovery data
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key && key.startsWith('recovery_')) {
      const resumeToken = key.replace('recovery_', '')
      
      try {
        const data = JSON.parse(sessionStorage.getItem(key) || '{}')
        
        // Check if not expired
        if (Date.now() <= data.expiresAt) {
          pendingTokens.push(resumeToken)
        } else {
          // Clean up expired data
          sessionStorage.removeItem(key)
        }
      } catch {
        // Clean up invalid data
        sessionStorage.removeItem(key)
      }
    }
  }

  if (pendingTokens.length > 0) {
    logger.info('🔍 Found pending recovery operations:', { count: pendingTokens.length })
  }

  return pendingTokens
}

/**
 * Clear All Recovery Data
 * Useful for cleanup or testing
 */
export function clearRecoveryData(): void {
  const keysToRemove: string[] = []
  
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key && key.startsWith('recovery_')) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach(key => sessionStorage.removeItem(key))
  
  if (keysToRemove.length > 0) {
    logger.info('🗑️ Cleared recovery data:', { count: keysToRemove.length })
  }
}