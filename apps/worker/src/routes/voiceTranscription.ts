/**
 * DEPRECATED - Voice Transcription Routes
 *
 * This endpoint is no longer used. All voice transcription now goes through:
 * - Next.js: POST /api/v1/transcribe (handles auth + DB UPSERT)
 * - Worker: POST /v1/transcribe (handles transcription + storage only)
 *
 * Deprecated: Jan 2026
 * Reason: Unified to single endpoint for consistent DB writes and idempotency
 *
 * The old flow had the worker doing direct DB INSERT which created inconsistencies
 * between hero and workspace flows. Now Next.js is the single DB write owner.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export function registerVoiceTranscriptionRoutes(app: FastifyInstance) {
  /**
   * POST /v1/projects/:projectId/transcribe
   * DEPRECATED - Returns 410 Gone
   */
  app.post<{
    Params: { projectId: string };
  }>('/v1/projects/:projectId/transcribe', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    return reply.code(410).send({
      error: 'This endpoint is deprecated',
      message: 'Use POST /v1/transcribe instead (called from Next.js /api/v1/transcribe)',
      migration: {
        oldEndpoint: `/v1/projects/${projectId}/transcribe`,
        newEndpoint: '/v1/transcribe',
        changes: [
          'Worker no longer handles DB writes',
          'Next.js handles DB UPSERT for idempotency',
          'recordingId and projectId passed via form data'
        ]
      }
    });
  });
}
