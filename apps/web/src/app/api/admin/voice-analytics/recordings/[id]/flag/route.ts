/**
 * Voice Recording Flag/Unflag API
 *
 * Allows admins to flag recordings for review or unflag them.
 * Includes audit logging for GDPR compliance.
 *
 * Phase 3 Enhancement: Moderation tools
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface FlagRequest {
  flagged: boolean
  reason?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Permission check: voice_analytics.moderate
  const { session, error } = await requireAdmin('voice_analytics.moderate')
  if (error) return error

  const { id } = await params

  try {
    const body: FlagRequest = await request.json()
    const { flagged, reason } = body

    if (typeof flagged !== 'boolean') {
      return noCacheErrorResponse(
        { error: 'Invalid request: flagged must be a boolean' },
        400
      )
    }

    // Sanitize reason: trim and clamp to prevent DB bloat
    const reasonClean =
      typeof reason === 'string' ? reason.trim().slice(0, 500) : undefined

    const supabase = await createServerSupabaseClientNew()

    // Check if recording exists
    const { data: existing, error: fetchError } = await supabase
      .from('voice_recordings')
      .select('id, user_id, flagged_at, deleted_at')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return noCacheErrorResponse({ error: 'Recording not found' }, 404)
    }

    if (existing.deleted_at) {
      return noCacheErrorResponse(
        { error: 'Cannot flag a deleted recording' },
        400
      )
    }

    // Use single timestamp for DB and response consistency
    const now = new Date().toISOString()

    // Update flag status
    const updateData = flagged
      ? {
          flagged_at: now,
          flagged_by: session.user.id,
          flag_reason: reasonClean || null,
        }
      : {
          flagged_at: null,
          flagged_by: null,
          flag_reason: null,
        }

    const { error: updateError } = await supabase
      .from('voice_recordings')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      logger.error('Failed to update voice recording flag status', {
        error: updateError,
        recordingId: id,
        adminId: session.user.id,
      })
      return noCacheErrorResponse({ error: 'Failed to update flag status' }, 500)
    }

    // Audit log
    const auditEvent = flagged
      ? 'admin.voice_recording.flagged'
      : 'admin.voice_recording.unflagged'

    try {
      await supabase.from('security_audit_log').insert({
        user_id: session.user.id,
        event_type: auditEvent,
        severity: 'medium',
        description: flagged ? 'Voice recording flagged for review' : 'Voice recording unflagged',
        metadata: {
          recording_id: id,
          recording_owner_id: existing.user_id,
          admin_email: session.user.email,
          reason: reasonClean || null,
          flagged,
        },
      })
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      logger.warn('Failed to write audit log for flag operation', {
        error: auditError,
        recordingId: id,
      })
    }

    logger.info('Voice recording flag status updated', {
      adminId: session.user.id,
      recordingId: id,
      flagged,
      reason: reasonClean || null,
    })

    return noCacheResponse({
      success: true,
      recording_id: id,
      flagged,
      flagged_at: flagged ? now : null,
      flagged_by: flagged ? session.user.id : null,
      flag_reason: flagged ? reasonClean || null : null,
    })
  } catch (err) {
    logger.error('Voice recording flag error', err)
    return noCacheErrorResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
}
