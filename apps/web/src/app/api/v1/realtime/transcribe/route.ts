/**
 * Real-Time Voice Transcription API Route (Streaming)
 *
 * POST /api/v1/realtime/transcribe
 *
 * Streams transcription results in real-time using Server-Sent Events (SSE).
 * This is the Browser → Next.js → Worker (HMAC) proxy layer for chunked audio transcription.
 *
 * Architecture:
 * 1. Browser uploads 1.25s audio chunks via FormData
 * 2. Next.js validates JWT + project ownership
 * 3. Next.js forwards to worker with HMAC auth
 * 4. Worker streams SSE events from OpenAI back to browser
 *
 * Security:
 * - User auth via Supabase session (JWT)
 * - Worker auth via HMAC signatures
 * - Rate limiting enforced by worker
 * - Backpressure handled with 202 status
 *
 * Part of: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
 * Expert Reviews: 3 rounds completed
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { noCacheErrorResponse } from '@/lib/api/response-helpers';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';

// ✅ P0 FIX: Set Node runtime for reliable FormData + streaming response bodies
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const MAX_CHUNK_SIZE_MB = 10;
const MAX_CHUNK_SIZE_BYTES = MAX_CHUNK_SIZE_MB * 1024 * 1024;

// Supported audio formats for streaming
const ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
];

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  try {
    // 1. Authenticate user via JWT or cookie session
    // ✅ P0 FIX: Accept both Authorization header AND cookie-based session
    // Provider uses credentials: 'include', so cookies are sent automatically
    const supabase = await createServerSupabaseClientNew();

    // Prefer Authorization if provided, otherwise fall back to cookie session
    const bearer = request.headers.get('authorization');
    const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined;

    const { data: { user }, error: authError } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return noCacheErrorResponse({ error: 'Unauthorized', requestId }, 401);
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const audioChunk = formData.get('audio') as File;
    const language = (formData.get('language') as string) || 'ar';
    const projectId = (formData.get('projectId') as string) || '';
    const isFinal = formData.get('final') === 'true';
    const chunkDurationMs = (formData.get('chunkDurationMs') as string) || '1250';

    if (!audioChunk) {
      return noCacheErrorResponse({ error: 'No audio data', requestId }, 400);
    }

    // 3. Validate chunk size
    if (audioChunk.size > MAX_CHUNK_SIZE_BYTES) {
      return noCacheErrorResponse({
        error: `Chunk size exceeds ${MAX_CHUNK_SIZE_MB}MB limit`,
        requestId
      }, 400);
    }

    // 4. Validate MIME type
    const rawType = audioChunk.type || '';
    const isKnownType = rawType ? ALLOWED_MIME_TYPES.includes(rawType) : false;
    const isAudioType = rawType ? rawType.startsWith('audio/') : true;

    if (!isKnownType && !isAudioType) {
      return noCacheErrorResponse({
        error: `Invalid file type: ${rawType || 'unknown'}. Must be an audio file.`,
        requestId
      }, 400);
    }

    // 5. Verify project ownership if projectId provided
    if (projectId) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, owner_id')
        .eq('id', projectId)
        .single();

      if (projectError || !project || project.owner_id !== user.id) {
        return noCacheErrorResponse({ error: 'Project not found or access denied', requestId }, 403);
      }
    }

    // 6. Proxy to worker with HMAC auth
    const workerUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081';
    const path = '/v1/realtime/transcribe';

    // Use native FormData (Node.js 18+ global, works with fetch)
    const workerFormData = new FormData();

    // Create Blob from audio chunk for native FormData
    const audioBuffer = Buffer.from(await audioChunk.arrayBuffer());
    const audioBlob = new Blob([audioBuffer], { type: audioChunk.type || 'audio/webm' });
    workerFormData.append('audio', audioBlob, audioChunk.name || `chunk.${audioChunk.type.split('/')[1] || 'webm'}`);

    workerFormData.append('userId', user.id);
    workerFormData.append('language', language);
    if (projectId) workerFormData.append('projectId', projectId);
    if (isFinal) workerFormData.append('final', 'true');
    workerFormData.append('chunkDurationMs', chunkDurationMs);

    // Remove Content-Type from auth headers (fetch will set it automatically for FormData)
    const authHeaders = createWorkerAuthHeaders('POST', path, '');
    const { 'Content-Type': _, ...authHeadersWithoutContentType } = authHeaders;

    const workerResponse = await fetch(`${workerUrl}${path}`, {
      method: 'POST',
      headers: {
        ...authHeadersWithoutContentType,
        // Don't manually set Content-Type - fetch sets it automatically with correct boundary
        'x-request-id': requestId,
        'x-sheen-locale': request.headers.get('accept-language') || 'en',
      },
      body: workerFormData,
    });

    // 7. ✅ P0 FIX: Handle different response types properly
    const contentType = workerResponse.headers.get('content-type') || '';

    // If 202 (backpressure), return JSON
    if (workerResponse.status === 202) {
      return NextResponse.json(
        await workerResponse.json(),
        { status: 202 }
      );
    }

    // If error (4xx/5xx) with JSON, return JSON
    if (!workerResponse.ok && contentType.includes('application/json')) {
      return NextResponse.json(
        await workerResponse.json(),
        { status: workerResponse.status }
      );
    }

    // If SSE stream, stream it back
    if (contentType.includes('text/event-stream')) {
      return new NextResponse(workerResponse.body, {
        status: workerResponse.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Request-Id': requestId,
        },
      });
    }

    // Fallback: proxy as-is
    return new NextResponse(workerResponse.body, {
      status: workerResponse.status,
      headers: Object.fromEntries(workerResponse.headers.entries()),
    });

  } catch (error) {
    console.error('Realtime transcription API error:', error);
    return noCacheErrorResponse({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    }, 500);
  }
}
