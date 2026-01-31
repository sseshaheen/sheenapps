/**
 * Worker Endpoint: Real-Time Transcription
 *
 * Path: /v1/realtime/transcribe
 * Method: POST
 *
 * Part of: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
 *
 * This endpoint handles real-time audio transcription for browsers that don't support
 * Web Speech API (Safari, Firefox). It receives 1.25s audio chunks from the Next.js
 * proxy, forwards them to OpenAI's Whisper API with streaming enabled, and streams
 * SSE events back to the client.
 *
 * Architecture:
 * - Browser → Next.js (JWT auth) → Worker (HMAC auth) → OpenAI → Browser
 * - Authenticated via HMAC signature from Next.js
 * - Supports backpressure handling (202 status when overloaded)
 * - Rate limiting: 10 minutes/day per user (configurable)
 * - Usage tracking: In-memory with Redis upgrade path
 *
 * Dependencies:
 * - @fastify/multipart (already registered in server.ts)
 * - form-data (for proxying to OpenAI)
 *
 * Environment Variables:
 * - OPENAI_API_KEY: OpenAI API key
 * - SHARED_SECRET: HMAC shared secret (matches Next.js WORKER_SHARED_SECRET)
 * - REDIS_URL: Optional, for production rate limiting
 * - OPENAI_TRANSCRIBE_MODEL: Optional, defaults to gpt-4o-mini-transcribe
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import crypto from 'crypto';
import { requireHmacSignature } from '../middleware/hmacValidation';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET; // Uses worker's standard SHARED_SECRET

// Rate limits (per user)
const RATE_LIMIT_MINUTES_PER_DAY = 10; // 10 minutes of transcription per user per day
const MAX_CONCURRENT_TRANSCRIPTIONS = 2; // Max 2 concurrent transcriptions per user

// Model configuration
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

// ============================================================================
// SSE PARSING HELPERS
// ============================================================================

/**
 * Extract complete SSE events from buffer
 * Keeps incomplete tail for next iteration
 * Handles both \r\n\r\n (HTTP/Windows) and \n\n (Unix) separators
 */
function extractSSEEvents(buf: string): { events: string[]; rest: string } {
  // Normalize CRLF to LF for consistent parsing
  const normalized = buf.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  // All parts except the last are complete events; last part is the tail
  return {
    events: parts.slice(0, -1),
    rest: parts[parts.length - 1] ?? ''
  };
}

/**
 * Parse a single SSE event
 * Returns event type and data
 */
function parseSSEEvent(raw: string): { event?: string; data?: string } {
  const result: { event?: string; data?: string } = {};
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      result.event = line.slice(6).trim();
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  const joined = dataLines.join('\n');
  if (joined.length > 0) {
    result.data = joined;
  }

  return result;
}

// ============================================================================
// RATE LIMITING & USAGE TRACKING
// ============================================================================

/**
 * In-memory rate limiting (replace with Redis in production)
 *
 * TODO: Replace with Redis:
 * - Key: `transcription:usage:${userId}:${date}`
 * - Value: minutes used today
 * - TTL: 24 hours
 */
const usageStore = new Map<string, { minutes: number; date: string }>();
const activeTranscriptions = new Map<string, Set<string>>(); // userId -> Set<chunkId>

/**
 * Get today's usage for a user (in minutes)
 */
function getTodayUsage(userId: string): number {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const usage = usageStore.get(userId);

  if (!usage || usage.date !== today) {
    return 0;
  }

  return usage.minutes;
}

/**
 * Track transcription usage (called after transcription completes)
 */
function trackUsage(userId: string, durationSeconds: number): void {
  const today = new Date().toISOString().split('T')[0] as string;
  const minutes = durationSeconds / 60;

  const usage = usageStore.get(userId);
  if (!usage || usage.date !== today) {
    usageStore.set(userId, { minutes, date: today });
  } else {
    usage.minutes += minutes;
  }
}

/**
 * Get count of active transcriptions for a user
 */
function getActiveCount(userId: string): number {
  return activeTranscriptions.get(userId)?.size ?? 0;
}

/**
 * Mark transcription as active
 */
function markActive(userId: string, chunkId: string) {
  if (!activeTranscriptions.has(userId)) {
    activeTranscriptions.set(userId, new Set());
  }
  activeTranscriptions.get(userId)!.add(chunkId);
}

/**
 * Mark transcription as inactive
 */
function markInactive(userId: string, chunkId: string) {
  const userTranscriptions = activeTranscriptions.get(userId);
  if (userTranscriptions) {
    userTranscriptions.delete(chunkId);
    if (userTranscriptions.size === 0) {
      activeTranscriptions.delete(userId);
    }
  }
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

export function registerRealtimeTranscriptionRoutes(app: FastifyInstance) {
  /**
   * POST /v1/realtime/transcribe
   *
   * Real-time audio transcription with SSE streaming
   *
   * Headers:
   * - x-sheen-signature: HMAC signature (dual v1/v2 validated by middleware)
   * - x-sheen-timestamp: Unix timestamp
   * - x-request-id: Optional request ID
   *
   * Form fields:
   * - audio: Audio file (WebM, MP3, etc.)
   * - userId: User ID (from Next.js JWT)
   * - language: Language code (e.g., 'ar', 'en')
   * - projectId: Optional project ID
   * - final: Boolean indicating if this is the final chunk
   *
   * Response:
   * - 200: SSE stream with transcription events
   * - 202: Chunk dropped due to backpressure
   * - 403: Invalid HMAC signature
   * - 429: Rate limit exceeded
   * - 500: Internal error
   */
  app.post('/v1/realtime/transcribe', {
    preHandler: requireHmacSignature()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.headers['x-request-id'] as string || randomUUID();

    try {
      // =========================================================================
      // 1. PARSE FORM DATA (Extract forwarded claims from Next.js)
      // Note: HMAC validation is handled by preHandler middleware
      // =========================================================================

      // TypeScript doesn't know about @fastify/multipart, cast to any
      const data = await (request as any).file();
      if (!data) {
        return reply.code(400).send({
          error: 'No audio data provided',
          requestId
        });
      }

      // Extract forwarded claims from form fields
      const userId = data.fields.userId?.value;
      const language = data.fields.language?.value || 'ar';
      const projectId = data.fields.projectId?.value;
      const isFinal = data.fields.final?.value === 'true';
      const chunkDurationMsRaw = data.fields.chunkDurationMs?.value;
      const chunkDurationSec =
        typeof chunkDurationMsRaw === 'string' ? Number(chunkDurationMsRaw) / 1000 : 1.25;

      if (!userId || typeof userId !== 'string') {
        return reply.code(400).send({
          error: 'Missing userId in forwarded claims',
          requestId
        });
      }

      // =========================================================================
      // 2. CHECK RATE LIMITS
      // =========================================================================

      const usageMinutes = getTodayUsage(userId);
      if (usageMinutes >= RATE_LIMIT_MINUTES_PER_DAY) {
        return reply.code(429).send({
          error: 'Daily transcription limit exceeded',
          limit: RATE_LIMIT_MINUTES_PER_DAY,
          used: usageMinutes,
          requestId
        });
      }

      // =========================================================================
      // 3. CHECK BACKPRESSURE (Prevent queue buildup)
      // ✅ P0 FIX #3: Never drop final chunks (they contain canonical result)
      // =========================================================================

      const activeCount = getActiveCount(userId);
      if (!isFinal && activeCount >= MAX_CONCURRENT_TRANSCRIPTIONS) {
        // Return 202 (chunk dropped due to backpressure)
        // Final chunks are ALWAYS processed
        return reply.code(202).send({
          status: 'dropped',
          reason: 'backpressure',
          active: activeCount,
          requestId
        });
      }

      // =========================================================================
      // 4. PREPARE AUDIO FOR OPENAI
      // =========================================================================

      // Extract MIME type and determine file extension
      const mime = data.mimetype || 'application/octet-stream';
      const filename = data.filename || 'audio';
      const ext =
        mime.includes('webm') ? 'webm' :
        mime.includes('mp4')  ? 'mp4'  :
        mime.includes('mpeg') ? 'mp3'  :
        mime.includes('ogg')  ? 'ogg'  :
        mime.includes('wav')  ? 'wav'  : 'webm'; // Default to webm

      const chunkId = randomUUID();
      const buffer = await data.toBuffer();

      // Mark as active
      markActive(userId, chunkId);

      const startTime = Date.now();

      try {
        // =======================================================================
        // 5. CALL OPENAI API WITH STREAMING (Using OpenAI SDK)
        // =======================================================================

        if (!OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY not configured');
        }

        // Create native FormData with File object
        const file = new File([buffer], `${filename}.${ext}`, { type: mime });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', TRANSCRIPTION_MODEL);
        formData.append('language', language);
        formData.append('response_format', 'json');
        formData.append('stream', 'true');

        const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            // Don't set Content-Type - fetch sets it automatically with boundary
          },
          body: formData
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text().catch(() => 'Unknown error');
          throw new Error(`OpenAI API error: ${openaiResponse.status} ${errorText}`);
        }

        // =======================================================================
        // 6. STREAM SSE EVENTS BACK TO NEXT.JS
        // =======================================================================

        reply.type('text/event-stream');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Connection', 'keep-alive');
        reply.header('X-Request-Id', requestId);

        const reader = openaiResponse.body?.getReader();
        if (!reader) {
          throw new Error('No response body from OpenAI');
        }

        const decoder = new TextDecoder();
        let sseBuffer = '';
        let totalText = '';
        let chunkCount = 0;

        console.log('[Real-time Debug] Starting SSE stream processing');

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[Real-time Debug] Stream ended', { totalChunks: chunkCount, bufferRemaining: sseBuffer.length });
            break;
          }

          chunkCount++;
          const decoded = decoder.decode(value, { stream: true });
          console.log('[Real-time Debug] Received chunk', {
            chunkNumber: chunkCount,
            bytes: value.length,
            decodedLength: decoded.length,
            preview: decoded.substring(0, 100)
          });

          sseBuffer += decoded;

          // Parse SSE events incrementally
          const { events, rest } = extractSSEEvents(sseBuffer);
          sseBuffer = rest; // Keep incomplete tail

          console.log('[Real-time Debug] Parsed events', {
            eventCount: events.length,
            bufferRemaining: rest.length
          });

          for (const rawEvent of events) {
            const { event, data } = parseSSEEvent(rawEvent);
            if (!data) {
              console.log('[SSE Debug] Empty data in event');
              continue;
            }
            if (data === '[DONE]') {
              console.log('[SSE Debug] Received [DONE] marker');
              continue;
            }

            // Debug: Log what we're receiving from OpenAI
            console.log('[SSE Debug]', { event, dataPreview: data.substring(0, 200) });

            try {
              const payload = JSON.parse(data);

              // Forward OpenAI event types (type is in payload, not SSE event field)
              if (payload.type === 'transcript.text.delta' && payload.delta) {
                totalText += payload.delta;

                // Forward interim delta
                // ✅ P1 FIX #5: Send 'delta' field (not 'text') for partial results
                reply.raw.write(`data: ${JSON.stringify({
                  type: 'transcription',
                  delta: payload.delta, // Partial text fragment
                  isFinal: false,
                  requestId
                })}\n\n`);
              }

              if (payload.type === 'transcript.text.done' && payload.text) {
                totalText = payload.text; // Use final text from OpenAI

                // Forward final transcription
                reply.raw.write(`data: ${JSON.stringify({
                  type: 'transcription',
                  text: payload.text,
                  isFinal: true,
                  requestId
                })}\n\n`);
              }
            } catch (e) {
              // Ignore JSON parse errors
              console.debug('Failed to parse SSE data:', data);
            }
          }
        }

        reply.raw.end();

        // =======================================================================
        // 7. TRACK USAGE
        // =======================================================================

        // Track audio duration (not wall clock time) for fair billing
        trackUsage(userId, chunkDurationSec);

        // Log wall clock time for observability (separate from billing)
        const wallClockSeconds = (Date.now() - startTime) / 1000;
        console.info('Transcription completed', {
          userId,
          chunkId,
          audioDurationSec: chunkDurationSec,
          wallClockSec: wallClockSeconds,
          textLength: totalText.length,
          isFinal,
          requestId
        });

      } catch (error) {
        console.error('OpenAI transcription error:', error, { requestId });

        // Send error event to client
        reply.raw.write(`data: ${JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Transcription failed',
          requestId
        })}\n\n`);
        reply.raw.end();

      } finally {
        // =======================================================================
        // 8. CLEANUP
        // =======================================================================

        markInactive(userId, chunkId);
        // No temp file to cleanup - using in-memory buffer
      }

    } catch (error) {
      console.error('Realtime transcription error:', error, { requestId });

      return reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      });
    }
  });
}
