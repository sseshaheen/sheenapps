import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'
import type { BatchOperationRequest, BatchOperationResponse } from '@/types/billing'

// Prevent caching of batch check data
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

/**
 * POST /api/v1/billing/check-sufficient-batch
 * Check sufficient balance for multiple operations (Expert recommendation)
 * Auth: session user must match user_id in body, or caller must be admin with billing.read.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const { user_id: userId, operations }: { user_id: string; operations: BatchOperationRequest[] } = JSON.parse(body)

    // Validate request
    if (!userId) {
      return noCacheErrorResponse('User ID is required', 400)
    }

    // Verify session: caller must be the same user or an admin
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return noCacheErrorResponse('Authentication required', 401)
    }

    if (user.id !== userId) {
      const { error } = await requireAdmin('billing.read')
      if (error) return error
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return noCacheErrorResponse('Operations array is required', 400)
    }

    if (operations.length > 10) {
      return noCacheErrorResponse('Maximum 10 operations per request', 400)
    }

    logger.info(`📊 Batch Check API: Checking ${operations.length} operations for user: ${userId}`)

    // Call worker API for batch check
    const path = `/v1/billing/check-sufficient-batch`
    
    // Generate authentication headers
    const authHeaders = createWorkerAuthHeaders('POST', path, body)

    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...authHeaders,
        'x-user-id': userId
      },
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Worker API batch check error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        userId,
        operationsCount: operations.length
      })
      
      return noCacheErrorResponse(
        `Worker API error: ${response.status}`,
        response.status
      )
    }

    const batchResponse: BatchOperationResponse = await response.json()
    
    logger.info(`✅ Batch Check API: Check completed for user ${userId}`, {
      sufficient: batchResponse.sufficient,
      totalRequiredSeconds: batchResponse.total_required_seconds,
      balanceSeconds: batchResponse.balance_seconds,
      insufficientCount: batchResponse.insufficient_operations?.length || 0
    })

    return noCacheResponse(batchResponse)
    
  } catch (error) {
    logger.error('❌ Batch Check API: Failed to check operations:', error)
    
    return noCacheErrorResponse('Failed to check batch operations', 500)
  }
}