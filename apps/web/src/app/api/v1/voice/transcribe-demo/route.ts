/**
 * Demo Voice Transcription API Route (Unauthenticated)
 *
 * POST /api/v1/voice/transcribe-demo
 *
 * Public endpoint for homepage voice input demo.
 * Transcribes audio files WITHOUT requiring authentication.
 * Does NOT save recordings to database (demo only).
 *
 * Security considerations:
 * - Rate limiting should be applied (TODO: implement rate limiting)
 * - File size limits enforced (25MB max)
 * - Validates audio format
 * - No database writes (stateless demo)
 *
 * Note: This endpoint is for homepage demos only.
 * Authenticated users should use /api/v1/projects/[projectId]/transcribe
 */

import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { noCacheErrorResponse, noCacheResponse } from '@/lib/api/response-helpers';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/aac',
  'audio/flac'
];

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  try {
    // Parse FormData
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const language = formData.get('language') as string | null;
    const provider = 'openai' as const;

    if (!audioFile) {
      return noCacheErrorResponse({ error: 'Audio file is required', requestId }, 400);
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE_BYTES) {
      return noCacheErrorResponse({
        error: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`,
        requestId
      }, 400);
    }

    // Validate MIME type
    const rawType = audioFile.type || '';
    const isKnownType = rawType ? ALLOWED_MIME_TYPES.includes(rawType) : false;
    const isAudioType = rawType ? rawType.startsWith('audio/') : true;

    if (!isKnownType && !isAudioType) {
      return noCacheErrorResponse({
        error: `Invalid file type: ${rawType || 'unknown'}. Must be an audio file.`,
        requestId
      }, 400);
    }

    // Convert to buffer and compute hash
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const audioHash = sha256(audioBuffer);

    // Create canonical metadata (demo mode: use placeholder IDs)
    const demoUserId = 'demo';
    const demoProjectId = 'demo';

    const canonicalMeta =
      `audioHash=${enc(audioHash)}\n` +
      `size=${audioFile.size}\n` +
      `mime=${enc(audioFile.type || 'application/octet-stream')}\n` +
      `userId=${enc(demoUserId)}\n` +
      `projectId=${enc(demoProjectId)}\n` +
      `provider=${enc(provider)}`;

    // Sign with empty string (multipart endpoints don't sign the body)
    // canonicalMeta is sent in header for worker to validate after HMAC passes
    const authHeaders = createWorkerAuthHeaders(
      'POST',
      `/v1/demo/transcribe`,
      '' // Empty string for multipart FormData uploads
    );

    // Forward to worker demo endpoint
    const workerUrl = `${process.env.WORKER_BASE_URL}/v1/demo/transcribe`;

    // Use native FormData (Node.js 18+ global, works with fetch)
    const workerFormData = new FormData();

    // Create a new Blob from the buffer with proper type
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type || 'audio/webm' });
    workerFormData.append('audio', audioBlob, `audio.${audioFile.type.split('/')[1] || 'webm'}`);

    if (language) {
      workerFormData.append('language', language);
    }

    // Remove Content-Type from auth headers (fetch will set it automatically for FormData)
    const { 'Content-Type': _, ...authHeadersWithoutContentType } = authHeaders;

    // Base64 encode canonicalMeta (contains newlines, which are invalid in HTTP headers)
    const encodedMeta = Buffer.from(canonicalMeta, 'utf-8').toString('base64');

    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        ...authHeadersWithoutContentType,
        // Don't manually set Content-Type - fetch sets it automatically with correct boundary
        'x-request-id': requestId,
        'x-audio-sha256': audioHash,
        'x-audio-mime': rawType || 'application/octet-stream',
        'x-audio-size': String(audioFile.size),
        'x-sheen-signed-meta': encodedMeta, // Base64 encoded to allow newlines in header
        'x-sheen-user-id': demoUserId,
        'x-sheen-project-id': demoProjectId,
        'x-sheen-provider': provider,
        'x-sheen-locale': request.headers.get('x-sheen-locale') || 'en'
      },
      body: workerFormData
    });

    if (!workerResponse.ok) {
      const errorData = await workerResponse.json().catch(() => ({}));
      return noCacheErrorResponse({
        error: 'Transcription failed',
        details: errorData,
        requestId
      }, workerResponse.status);
    }

    const result = await workerResponse.json();

    return noCacheResponse({
      transcription: result.transcription,
      language: result.language,
      duration: result.duration,
      requestId
    });

  } catch (error) {
    console.error('Demo transcription API error:', error);
    return noCacheErrorResponse({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    }, 500);
  }
}
