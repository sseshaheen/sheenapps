/**
 * 🔧 Admin Action Hook
 * Expert-validated hook for consistent admin action handling with reason collection
 * 
 * Key features:
 * - Expert's idempotency pattern (generates UUIDs per action)
 * - Automatic reason modal presentation
 * - Correlation ID tracking for debugging
 * - Error handling with correlation context
 * - Toast notifications with correlation IDs
 */

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { ReasonCategory } from '@/components/admin/AdminReasonModal'

export interface AdminActionConfig {
  title: string
  description: string
  category: ReasonCategory
  actionLabel?: string
  requiresConfirmation?: boolean
}

export interface AdminActionResult {
  success: boolean
  correlationId?: string
  data?: any
  error?: string
}

export function useAdminAction() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentAction, setCurrentAction] = useState<{
    config: AdminActionConfig
    execute: (reason: string) => Promise<AdminActionResult>
  } | null>(null)

  /**
   * Execute an admin action with reason collection
   */
  const executeAdminAction = async (
    config: AdminActionConfig,
    action: (reason: string, correlationId: string, idempotencyKey: string) => Promise<AdminActionResult>
  ) => {
    // Expert pattern: Generate correlation ID and idempotency key per user action
    const correlationId = crypto.randomUUID()
    const idempotencyKey = crypto.randomUUID()

    const executeWithReason = async (reason: string): Promise<AdminActionResult> => {
      setIsProcessing(true)
      try {
        // Expert pattern: Pass correlation ID and idempotency key to action
        const result = await action(reason, correlationId, idempotencyKey)
        
        if (result.success) {
          toast.success(`${config.title} completed successfully`, {
            description: `Reference: ${result.correlationId || correlationId}`,
            duration: 5000
          })
        } else {
          toast.error(`${config.title} failed`, {
            description: result.error ? `${result.error} (${result.correlationId || correlationId})` : `Reference: ${result.correlationId || correlationId}`,
            duration: 8000
          })
        }
        
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        
        toast.error(`${config.title} failed`, {
          description: `${errorMessage} (${correlationId})`,
          duration: 8000
        })
        
        return {
          success: false,
          error: errorMessage,
          correlationId
        }
      } finally {
        setIsProcessing(false)
        setIsModalOpen(false)
        setCurrentAction(null)
      }
    }

    // Show reason collection modal
    setCurrentAction({
      config,
      execute: executeWithReason
    })
    setIsModalOpen(true)
  }

  /**
   * Handle reason modal confirmation
   */
  const handleReasonConfirm = async (reason: string) => {
    if (!currentAction) return
    
    await currentAction.execute(reason)
  }

  /**
   * Handle reason modal cancellation
   */
  const handleReasonCancel = () => {
    setIsModalOpen(false)
    setCurrentAction(null)
    setIsProcessing(false)
  }

  /**
   * Quick action helpers for common admin operations
   */
  const suspendUser = (userId: string, onSuccess?: () => void) => {
    return executeAdminAction(
      {
        title: 'Suspend User',
        description: 'This will temporarily suspend the user account. The user will not be able to log in or access services until reactivated.',
        category: 'trust_safety',
        actionLabel: 'Suspend User'
      },
      async (reason, correlationId, idempotencyKey) => {
        const response = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Reason': reason,
            'X-Correlation-Id': correlationId,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify({ userId, action: 'suspend' })
        })

        const result = await response.json()

        if (response.ok) {
          onSuccess?.()
          return {
            success: true,
            correlationId: result.correlation_id,
            data: result
          }
        } else {
          return {
            success: false,
            error: result.error,
            correlationId: result.correlation_id
          }
        }
      }
    )
  }

  const banUser = (userId: string, onSuccess?: () => void) => {
    return executeAdminAction(
      {
        title: 'Ban User (Permanent)',
        description: 'This will permanently ban the user account. This action requires super admin privileges and cannot be easily reversed.',
        category: 'trust_safety',
        actionLabel: 'Ban User Permanently'
      },
      async (reason, correlationId, idempotencyKey) => {
        const response = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Reason': reason,
            'X-Correlation-Id': correlationId,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify({ userId, action: 'ban' })
        })

        const result = await response.json()

        if (response.ok) {
          onSuccess?.()
          return {
            success: true,
            correlationId: result.correlation_id,
            data: result
          }
        } else {
          return {
            success: false,
            error: result.error,
            correlationId: result.correlation_id
          }
        }
      }
    )
  }

  const processRefund = (invoiceId: string, amount: number, onSuccess?: () => void) => {
    return executeAdminAction(
      {
        title: 'Process Refund',
        description: `This will process a refund of $${amount.toFixed(2)} for invoice ${invoiceId}. This action requires super admin privileges and will be processed immediately.`,
        category: 'financial',
        actionLabel: 'Process Refund'
      },
      async (reason, correlationId, idempotencyKey) => {
        const response = await fetch('/api/admin/refunds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Reason': reason,
            'X-Correlation-Id': correlationId,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify({ invoiceId, amount })
        })

        const result = await response.json()

        if (response.ok) {
          onSuccess?.()
          return {
            success: true,
            correlationId: result.correlation_id,
            data: result
          }
        } else {
          return {
            success: false,
            error: result.error,
            correlationId: result.correlation_id
          }
        }
      }
    )
  }

  const approveAdvisor = (advisorId: string, onSuccess?: () => void) => {
    return executeAdminAction(
      {
        title: 'Approve Advisor',
        description: 'This will approve the advisor application and grant them access to provide services on the platform.',
        category: 'trust_safety',
        actionLabel: 'Approve Advisor'
      },
      async (reason, correlationId, idempotencyKey) => {
        // This would call the advisor approval endpoint when implemented
        const response = await fetch(`/api/admin/advisors/${advisorId}/approve`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Reason': reason,
            'X-Correlation-Id': correlationId,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify({ advisorId })
        })

        const result = await response.json()

        if (response.ok) {
          onSuccess?.()
          return {
            success: true,
            correlationId: result.correlation_id,
            data: result
          }
        } else {
          return {
            success: false,
            error: result.error,
            correlationId: result.correlation_id
          }
        }
      }
    )
  }

  return {
    // Core functionality
    executeAdminAction,
    
    // Modal state
    isModalOpen,
    isProcessing,
    currentAction: currentAction?.config || null,
    
    // Modal handlers  
    handleReasonConfirm,
    handleReasonCancel,
    
    // Quick action helpers
    suspendUser,
    banUser,
    processRefund,
    approveAdvisor
  }
}