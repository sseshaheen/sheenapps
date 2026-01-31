/**
 * Voice Recording Detail API
 *
 * GET: Proxies to worker service for signed URL generation (service role key isolation).
 * DELETE: Soft deletes recording (sets deleted_at, preserves data for audit).
 *
 * Worker handles:
 * - Recording fetch from database
 * - Signed URL generation (1-hour expiry)
 * - User email lookup
 * - Audit logging (GDPR compliance)
 *
 * Security:
 * - Next.js validates admin auth and permissions
 * - Worker has service role key (not Next.js)
 * - JWT-based authentication between Next.js and worker
 * - Correlation IDs for request tracing
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface RecordingDetail {
  id: string
  user_id: string
  user_email: string | null
  project_id: string
  audio_url: string
  audio_format: string
  duration_seconds: number | null
  file_size_bytes: number | null
  transcription: string
  detected_language: string | null
  confidence_score: number | null
  provider: string
  model_version: string | null
  processing_duration_ms: number | null
  cost_usd: number | null
  input_tokens: number | null  // Token count for cost transparency (Phase 2)
  message_id: string | null
  created_at: string
  // Audio playback
  signed_audio_url: string
  signed_url_expires_at: string
}

interface WorkerSignedUrlResponse {
  signed_audio_url: string
  signed_url_expires_at: string
  recording: RecordingDetail
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Permission check: voice_analytics.audio (stricter permission for audio access)
  const { session, error } = await requireAdmin('voice_analytics.audio')
  if (error) return error

  const { id } = await params

  try {
    // Proxy to worker for signed URL + recording data
    const correlationId = crypto.randomUUID()

    const workerResult = await workerFetch<WorkerSignedUrlResponse>(
      `/v1/admin/voice-recordings/${id}/signed-url`,
      {
        method: 'GET',
        adminReason: 'Voice analytics audio playback',
        headers: {
          'x-correlation-id': correlationId
        }
      }
    )

    if (!workerResult.ok) {
      logger.error('Failed to generate signed URL via worker', {
        recordingId: id,
        adminId: session.user.id,
        error: workerResult.error,
        status: workerResult.status,
        correlationId
      })

      return noCacheErrorResponse(
        { error: workerResult.error || 'Failed to generate audio playback URL' },
        workerResult.status
      )
    }

    const { signed_audio_url, signed_url_expires_at, recording } = workerResult.data!

    // Worker already includes user_email - no need to fetch here
    // Return full recording detail (same shape as before)
    const detail: RecordingDetail = {
      ...recording,
      signed_audio_url,
      signed_url_expires_at
    }

    logger.info('Voice recording detail accessed via worker', {
      adminId: session.user.id,
      recordingId: id,
      ownerId: recording.user_id,
      correlationId
    })

    return noCacheResponse(detail)

  } catch (err) {
    logger.error('Voice recording detail error', err)
    return noCacheErrorResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
}

/**
 * DELETE - Soft delete a voice recording
 *
 * Sets deleted_at and deleted_by columns (soft delete).
 * Does NOT delete the audio file from storage (allows recovery).
 * Storage cleanup should be handled by a separate background job.
 *
 * Permission: voice_analytics.moderate
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Permission check: voice_analytics.moderate
  const { session, error } = await requireAdmin('voice_analytics.moderate')
  if (error) return error

  const { id } = await params

  try {
    const supabase = await createServerSupabaseClientNew()

    // Check if recording exists and isn't already deleted
    const { data: existing, error: fetchError } = await supabase
      .from('voice_recordings')
      .select('id, user_id, deleted_at, audio_url')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return noCacheErrorResponse({ error: 'Recording not found' }, 404)
    }

    if (existing.deleted_at) {
      return noCacheErrorResponse(
        { error: 'Recording is already deleted' },
        400
      )
    }

    // Use single timestamp for DB and response consistency
    const now = new Date().toISOString()

    // Soft delete - set deleted_at and deleted_by
    const { error: updateError } = await supabase
      .from('voice_recordings')
      .update({
        deleted_at: now,
        deleted_by: session.user.id,
      })
      .eq('id', id)

    if (updateError) {
      logger.error('Failed to soft delete voice recording', {
        error: updateError,
        recordingId: id,
        adminId: session.user.id,
      })
      return noCacheErrorResponse({ error: 'Failed to delete recording' }, 500)
    }

    // Audit log
    try {
      await supabase.from('security_audit_log').insert({
        user_id: session.user.id,
        event_type: 'admin.voice_recording.deleted',
        severity: 'high',
        description: 'Voice recording soft deleted by admin',
        metadata: {
          recording_id: id,
          recording_owner_id: existing.user_id,
          admin_email: session.user.email,
          audio_url: existing.audio_url, // For potential recovery
        },
      })
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      logger.warn('Failed to write audit log for delete operation', {
        error: auditError,
        recordingId: id,
      })
    }

    logger.info('Voice recording soft deleted', {
      adminId: session.user.id,
      recordingId: id,
      ownerId: existing.user_id,
    })

    return noCacheResponse({
      success: true,
      recording_id: id,
      deleted_at: now,
      deleted_by: session.user.id,
    })
  } catch (err) {
    logger.error('Voice recording delete error', err)
    return noCacheErrorResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
}
