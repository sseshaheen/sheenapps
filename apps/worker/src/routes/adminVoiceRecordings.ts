/**
 * Admin Voice Recording Routes
 *
 * Provides secure access to voice recording audio files for admin panel:
 * - Generates signed URLs for private storage buckets
 * - Validates storage paths (prevent path traversal)
 * - Fetches user email for recording owner
 * - Comprehensive audit logging for GDPR compliance
 *
 * Security:
 * - JWT-based authentication with permission checking
 * - Service role key isolation (only worker has access)
 * - Path validation with regex allowlist
 * - Correlation IDs for request tracing
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

interface RecordingParams {
  id: string;
}

interface SignedUrlResponse {
  signed_audio_url: string;
  signed_url_expires_at: string;
  recording: {
    id: string;
    user_id: string;
    user_email: string | null;
    project_id: string;
    audio_url: string;
    audio_format: string;
    duration_seconds: number | null;
    file_size_bytes: number | null;
    transcription: string;
    detected_language: string | null;
    confidence_score: number | null;
    provider: string;
    model_version: string | null;
    processing_duration_ms: number | null;
    cost_usd: number | null;
    message_id: string | null;
    created_at: string;
  };
}

/**
 * Audit log helper - writes to security_audit_log table
 */
async function auditVoiceRecordingAccess(logData: {
  event_type: string;
  details: any;
  severity: 'low' | 'medium' | 'high';
  user_id?: string;
}): Promise<void> {
  try {
    await pool!.query(
      `INSERT INTO security_audit_log (
        user_id, event_type, severity, description, metadata
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        logData.user_id || null,
        logData.event_type,
        logData.severity,
        logData.event_type.replace(/_/g, ' '),
        JSON.stringify(logData.details)
      ]
    );
  } catch (error) {
    // Don't block request on audit log failures
    loggingService.logServerEvent(
      'error',
      'warn',
      'Failed to write audit log for voice recording access',
      { error: (error as Error).message, logData }
    );
  }
}

export default async function adminVoiceRecordingRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/admin/voice-recordings/:id/signed-url
   * Generate signed URL for voice recording audio playback
   */
  fastify.get<{ Params: RecordingParams }>(
    '/v1/admin/voice-recordings/:id/signed-url',
    {
      preHandler: requireAdminAuth({
        permissions: ['voice_analytics.audio'],
        logActions: true
      })
    },
    async (
      request: FastifyRequest<{ Params: RecordingParams }>,
      reply: FastifyReply
    ) => {
      const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();
      const adminClaims = (request as AdminRequest).adminClaims;
      const { id } = request.params;

      // Log access request (before any operations)
      await auditVoiceRecordingAccess({
        event_type: 'admin.voice_recording.access_requested',
        details: {
          admin_user_id: adminClaims.userId || adminClaims.sub,
          admin_email: adminClaims.email,
          recording_id: id,
          correlation_id: correlationId
        },
        severity: 'low',
        user_id: adminClaims.userId || adminClaims.sub
      });

      try {
        // Initialize Supabase service role client
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Fetch recording from database
        const { data: recording, error: dbError } = await supabase
          .from('voice_recordings')
          .select('*')
          .eq('id', id)
          .single();

        if (dbError || !recording) {
          await auditVoiceRecordingAccess({
            event_type: 'admin.voice_recording.access_failed',
            details: {
              admin_user_id: adminClaims.userId || adminClaims.sub,
              recording_id: id,
              reason: 'not_found',
              correlation_id: correlationId
            },
            severity: 'low'
          });

          return reply.status(404).send({
            error: 'Recording not found',
            correlation_id: correlationId
          });
        }

        // Normalize and validate storage path
        const raw = String(recording.audio_url || '');
        let storagePath = raw.replace(/^\//, '');

        // Handle full URLs accidentally stored
        const marker = '/voice-recordings/';
        if (storagePath.includes(marker)) {
          const parts = storagePath.split(marker);
          storagePath = parts[1] || storagePath; // Fallback to original if split fails
        }

        // Security: validate storage path format
        // Expected pattern: {userId}/{recordingId}.(webm|mp3|m4a|wav|ogg|aac|flac)
        const validPathPattern = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webm|mp3|m4a|wav|ogg|aac|flac)$/i;

        if (!storagePath || storagePath.includes('..') || !validPathPattern.test(storagePath)) {
          await auditVoiceRecordingAccess({
            event_type: 'admin.voice_recording.access_failed',
            details: {
              admin_user_id: adminClaims.userId || adminClaims.sub,
              recording_id: id,
              reason: 'invalid_path',
              audio_url: raw,
              storage_path: storagePath,
              correlation_id: correlationId
            },
            severity: 'medium' // Potential attack
          });

          return reply.status(400).send({
            error: 'Invalid audio path',
            correlation_id: correlationId
          });
        }

        // Generate signed URL (service role)
        const expiresIn = 3600; // 1 hour
        const { data: signedData, error: signedError } = await supabase.storage
          .from('voice-recordings')
          .createSignedUrl(storagePath, expiresIn);

        if (signedError || !signedData) {
          await auditVoiceRecordingAccess({
            event_type: 'admin.voice_recording.access_failed',
            details: {
              admin_user_id: adminClaims.userId || adminClaims.sub,
              recording_id: id,
              reason: 'signed_url_generation_failed',
              error: signedError?.message,
              correlation_id: correlationId
            },
            severity: 'high' // Service issue
          });

          return reply.status(500).send({
            error: 'Failed to generate audio playback URL',
            correlation_id: correlationId
          });
        }

        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Fetch user email using service role (worker can safely use auth.admin APIs)
        let userEmail: string | null = null;
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(recording.user_id);
          userEmail = userData?.user?.email || null;
        } catch (emailError) {
          // Don't fail the request if email fetch fails - just log it
          loggingService.logServerEvent(
            'error',
            'warn',
            'Failed to fetch user email for voice recording',
            {
              recording_id: id,
              user_id: recording.user_id,
              error: (emailError as Error).message
            }
          );
        }

        // Log successful access
        await auditVoiceRecordingAccess({
          event_type: 'admin.voice_recording.access',
          details: {
            admin_user_id: adminClaims.userId || adminClaims.sub,
            admin_email: adminClaims.email,
            recording_id: id,
            recording_owner_id: recording.user_id,
            project_id: recording.project_id,
            action: 'signed_url_generated',
            signed_url_expires_at: expiresAt,
            correlation_id: correlationId
          },
          severity: 'low',
          user_id: adminClaims.userId || adminClaims.sub
        });

        // Return signed URL + full recording data (including user_email)
        const response: SignedUrlResponse = {
          signed_audio_url: signedData.signedUrl,
          signed_url_expires_at: expiresAt,
          recording: {
            id: recording.id,
            user_id: recording.user_id,
            user_email: userEmail, // ✅ Worker provides user email
            project_id: recording.project_id,
            audio_url: recording.audio_url,
            audio_format: recording.audio_format,
            duration_seconds: recording.duration_seconds,
            file_size_bytes: recording.file_size_bytes,
            transcription: recording.transcription,
            detected_language: recording.detected_language,
            confidence_score: recording.confidence_score,
            provider: recording.provider,
            model_version: recording.model_version,
            processing_duration_ms: recording.processing_duration_ms,
            cost_usd: recording.cost_usd,
            message_id: recording.message_id,
            created_at: recording.created_at
          }
        };

        return reply.send(response);
      } catch (error) {
        // Log critical error
        await auditVoiceRecordingAccess({
          event_type: 'admin.voice_recording.access_failed',
          details: {
            admin_user_id: adminClaims.userId || adminClaims.sub,
            recording_id: id,
            reason: 'internal_error',
            error: (error as Error).message,
            correlation_id: correlationId
          },
          severity: 'high'
        });

        loggingService.logCriticalError(
          'admin_voice_recording_signed_url_error',
          error as Error,
          {
            recording_id: id,
            admin_id: adminClaims.userId || adminClaims.sub,
            correlation_id: correlationId
          }
        );

        return reply.status(500).send({
          error: 'Internal server error',
          correlation_id: correlationId
        });
      }
    }
  );
}
