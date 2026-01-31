/**
 * Worker Endpoint: Simple Transcription
 *
 * Path: /v1/transcribe
 * Method: POST
 *
 * Handles complete audio file transcription (not streaming/chunking)
 * Returns simple JSON response with transcription text
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';

// Model configuration
// gpt-4o-mini-transcribe is faster/cheaper but only supports 'json' or 'text' response_format
// whisper-1 is the fallback if you need verbose_json
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'; //or 'whisper-1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Supabase configuration for storage upload
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = 'voice-recordings';

// Debug logging - set DEBUG_TRANSCRIBE=true for verbose logs
const DEBUG = process.env.DEBUG_TRANSCRIBE === 'true';

export function registerTranscribeRoutes(app: FastifyInstance) {
  /**
   * POST /v1/transcribe
   *
   * Simple audio transcription endpoint
   *
   * Form fields:
   * - audio: Audio file (WebM, MP3, WAV, etc.)
   * - userId: User ID (from Next.js JWT)
   * - language: Language code (e.g., 'ar', 'en')
   * - storagePath: Optional Supabase storage path
   * - projectId: Optional project ID
   *
   * Response:
   * - 200: JSON with transcription text
   * - 400: Bad request
   * - 403: Invalid HMAC signature
   * - 500: Internal error
   */
  app.post('/v1/transcribe', {
    preHandler: requireHmacSignature()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.headers['x-request-id'] as string || randomUUID();

    try {
      // Parse form data
      const data = await (request as any).file();
      if (!data) {
        return reply.code(400).send({
          error: 'No audio data provided',
          requestId
        });
      }

      const userId = data.fields.userId?.value;
      const language = data.fields.language?.value || 'en';
      const recordingId = data.fields.recordingId?.value || randomUUID();
      const projectId = data.fields.projectId?.value;

      if (!userId || typeof userId !== 'string') {
        return reply.code(400).send({
          error: 'Missing userId',
          requestId
        });
      }

      // Get audio file details
      const mime = data.mimetype || 'application/octet-stream';
      const filename = data.filename || 'audio';
      const ext =
        mime.includes('webm') ? 'webm' :
        mime.includes('mp4')  ? 'mp4'  :
        mime.includes('mpeg') ? 'mp3'  :
        mime.includes('ogg')  ? 'ogg'  :
        mime.includes('wav')  ? 'wav'  : 'webm';

      const buffer = await data.toBuffer();

      if (DEBUG) {
        console.log('[Transcribe] Processing:', {
          requestId,
          userId,
          language,
          recordingId,
          size: buffer.length,
          mime
        });
      }

      const startTime = Date.now();

      // Call OpenAI Transcription API
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const file = new File([buffer], `${filename}.${ext}`, { type: mime });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', TRANSCRIPTION_MODEL);
      formData.append('language', language);
      formData.append('response_format', 'json'); // gpt-4o-mini-transcribe only supports 'json' or 'text'

      const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: formData
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text().catch(() => 'Unknown error');
        console.error('[Transcribe] OpenAI error:', errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.status} ${errorText}`);
      }

      const result = await openaiResponse.json();

      // Calculate cost based on tokens (gpt-4o-mini-transcribe pricing)
      // gpt-4o-mini-transcribe: $0.01 per 1K input tokens, no output charge for transcription
      const inputTokens = result.usage?.input_tokens || 0;
      const cost = (inputTokens / 1000) * 0.01;

      const transcriptionMs = Date.now() - startTime;

      // Upload audio to Supabase Storage
      let storagePath: string | undefined;

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
          });

          // Storage path: userId/recordingId.ext
          storagePath = `${userId}/${recordingId}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, buffer, {
              contentType: mime,
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('[Transcribe] Storage upload failed:', uploadError);
            // Don't fail the request - transcription succeeded, storage is optional
            storagePath = undefined;
          } else if (DEBUG) {
            console.log('[Transcribe] Audio uploaded to storage:', { storagePath });
          }
        } catch (storageError) {
          console.error('[Transcribe] Storage error:', storageError);
          storagePath = undefined;
        }
      } else if (DEBUG) {
        console.warn('[Transcribe] Supabase not configured, skipping storage upload');
      }

      const wallClockMs = Date.now() - startTime;

      // Minimal production log - just key metrics
      console.log('[Transcribe] OK', {
        requestId,
        textLength: result.text?.length,
        wallClockMs
      });

      if (DEBUG) {
        console.log('[Transcribe] Details:', {
          userId,
          recordingId,
          inputTokens,
          cost,
          storagePath,
          transcriptionMs
        });
      }

      // Return result
      return reply.send({
        text: result.text,
        language: language, // Echo back the requested language (model doesn't return it)
        inputTokens,
        cost,
        storagePath,
        requestId
      });

    } catch (error) {
      console.error('[Transcribe] Error:', error, { requestId });

      return reply.code(500).send({
        error: 'Transcription failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      });
    }
  });
}
