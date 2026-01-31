/**
 * Client Decision API Route
 *
 * Following CLAUDE.md patterns:
 * - Idempotency key support
 * - State machine validation
 * - RLS-based authentication
 * - Comprehensive error handling
 */

import { NextRequest } from 'next/server'
import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { isValidTransition } from '@/types/advisor-matching'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// ✅ CLAUDE.md: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * POST /api/advisor-matching/matches/[matchId]/client-decision
 * Submit client approval or decline decision
 */
export async function POST(request: NextRequest, props: { params: Promise<{ matchId: string }> }) {
  const params = await props.params;
  const correlationId = request.headers.get('X-Correlation-Id') || uuidv4()
  const idempotencyKey = request.headers.get('Idempotency-Key')
  const { matchId } = params

  try {
    // ✅ CLAUDE.md: RLS-based authentication
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401)
    }

    if (!matchId) {
      return noCacheErrorResponse('Match ID is required', 400)
    }

    // Parse request body
    const body = await request.json()
    const { decision, reason } = body as {
      decision: 'approved' | 'declined'
      reason?: string
    }

    if (!decision || !['approved', 'declined'].includes(decision)) {
      return noCacheErrorResponse('Valid decision (approved/declined) is required', 400)
    }

    // Get current match state
    // Note: DB uses matched_advisor_id and requested_by
    const { data: currentMatch, error: fetchError } = await supabase
      .from('advisor_match_requests')
      .select('id, status, matched_advisor_id, updated_at')
      .eq('id', matchId)
      .eq('requested_by', user.id)
      .single()

    if (fetchError || !currentMatch) {
      logger.warn('Client decision: Match not found or access denied', {
        correlationId,
        matchId,
        userId: user.id,
        error: fetchError?.message
      })
      return noCacheErrorResponse('Match not found', 404)
    }

    // Check if decision already made (idempotency) - status tracks decision
    const alreadyDecided = currentMatch.status === 'client_approved' || currentMatch.status === 'client_declined'
    if (alreadyDecided) {
      const existingDecision = currentMatch.status === 'client_approved' ? 'approved' : 'declined'

      if (existingDecision === decision) {
        logger.info('Client decision: Duplicate request (idempotent)', {
          correlationId,
          matchId,
          decision,
          idempotencyKey
        })

        return noCacheResponse({
          success: true,
          match_id: matchId,
          decision: existingDecision,
          duplicate: true
        })
      } else {
        logger.warn('Client decision: Conflicting decision', {
          correlationId,
          matchId,
          existingDecision,
          newDecision: decision,
          userId: user.id
        })

        return noCacheErrorResponse('Client decision already made', 409)
      }
    }

    // Validate state transition
    const newStatus = decision === 'approved' ? 'client_approved' : 'client_declined'

    if (!isValidTransition(currentMatch.status as any, newStatus as any)) {
      logger.warn('Client decision: Invalid state transition', {
        correlationId,
        matchId,
        currentStatus: currentMatch.status,
        newStatus,
        decision
      })

      return noCacheErrorResponse(
        `Cannot make decision in current state: ${currentMatch.status}`,
        412
      )
    }

    // Update match with client decision (status tracks the decision)
    const updateData = {
      status: newStatus,
      previous_status: currentMatch.status,
      updated_at: new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('advisor_match_requests')
      .update(updateData)
      .eq('id', matchId)
      .eq('requested_by', user.id)

    if (updateError) {
      logger.error('Client decision: Database update failed', {
        correlationId,
        matchId,
        error: updateError.message,
        decision
      })
      return noCacheErrorResponse('Failed to record decision', 500)
    }

    // Notify worker of decision
    try {
      const workerPayload = {
        match_id: matchId,
        client_decision: decision,
        reason,
        user_id: user.id,
        matched_advisor_id: currentMatch.matched_advisor_id
      }

      const workerBody = JSON.stringify(workerPayload)
      const workerPath = '/api/v1/advisor-matching/client-decision'

      const workerHeaders = createWorkerAuthHeaders('POST', workerPath, workerBody, {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId
      })

      const workerResponse = await fetch(
        `${process.env.WORKER_BASE_URL}${workerPath}`,
        {
          method: 'POST',
          headers: workerHeaders,
          body: workerBody
        }
      )

      if (!workerResponse.ok) {
        logger.warn('Client decision: Worker notification failed', {
          correlationId,
          matchId,
          status: workerResponse.status,
          decision
        })
      } else {
        logger.info('Client decision: Worker notified successfully', {
          correlationId,
          matchId,
          decision
        })
      }
    } catch (workerError) {
      logger.warn('Client decision: Worker notification error', {
        correlationId,
        matchId,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        decision
      })
    }

    logger.info('Client decision recorded successfully', {
      correlationId,
      matchId,
      decision,
      newStatus,
      userId: user.id,
      idempotencyKey
    })

    return noCacheResponse({
      success: true,
      match_id: matchId,
      decision,
      status: newStatus,
      correlation_id: correlationId
    })

  } catch (error) {
    logger.error('Client decision: Unexpected error', {
      correlationId,
      matchId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return noCacheErrorResponse('Internal server error', 500)
  }
}