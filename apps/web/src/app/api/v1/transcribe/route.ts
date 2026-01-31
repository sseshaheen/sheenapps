/**
 * Voice Transcription API Route (Server-Auth Mode)
 *
 * Handles complete audio file transcription (not streaming chunks)
 * Flow: Browser → This route → Worker (storage + transcribe) → Response → Save to DB
 *
 * Architecture (server-auth mode, updated 2026-01-19):
 * ============================================
 *
 * Request payload:
 * - audio: File blob
 * - language: ISO language code (ar, en, etc.)
 * - recordingId: Client-generated UUID for idempotency (from recording start)
 * - projectId: Optional - determines source (hero vs project)
 *
 * Server-Auth Mode:
 * - Browser sends audio blob to Next.js API (no client-side Supabase credentials)
 * - Next.js API validates auth and forwards to worker
 * - Worker uploads to Supabase Storage and transcribes with OpenAI Whisper
 * - Next.js API saves result to database
 * - Keeps all credentials server-side only for security
 *
 * Idempotency:
 * - UPSERT on (user_id, client_recording_id)
 * - Same recordingId = same record (update on retry/double-tap)
 * - recordingId is generated at recording START in the modal
 *
 * Database:
 * - Stores storagePath, NOT signed URLs (URLs expire)
 * - Generates signed URLs on-demand when reading recordings
 * - source column: 'hero' | 'project' (for analytics)
 * - project_id is nullable (hero recordings have no project)
 *
 * All recordings are saved to DB (hero and project).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Transcription can take 30-60s for longer recordings
  // Don't timeout - let the worker handle it
  try {
    // 1. Validate authentication
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Parse multipart form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const language = formData.get('language') as string || 'en';
    const recordingId = formData.get('recordingId') as string;
    const projectId = formData.get('projectId') as string | null;

    if (!audioFile) {
      return new NextResponse('No audio file provided', { status: 400 });
    }

    if (!recordingId) {
      return new NextResponse('Missing recordingId', { status: 400 });
    }

    // Validate recordingId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(recordingId)) {
      return new NextResponse('Invalid recordingId format', { status: 400 });
    }

    // 3. Validate file size (10MB max)
    if (audioFile.size > 10 * 1024 * 1024) {
      return new NextResponse('File too large (max 10MB)', { status: 413 });
    }

    // 4. Validate file type
    const allowedTypes = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg'
    ];

    if (!allowedTypes.some(type => audioFile.type.includes(type))) {
      return new NextResponse('Unsupported audio format', { status: 415 });
    }

    // Determine source based on projectId
    const source = projectId ? 'project' : 'hero';

    console.log('[Transcribe API] Forwarding to worker:', {
      userId: user.id,
      size: audioFile.size,
      type: audioFile.type,
      language,
      recordingId,
      projectId,
      source
    });

    // 5. Forward to worker for transcription + storage upload
    // Convert to Blob for native FormData (works with Node.js 18+ fetch)
    const arrayBuffer = await audioFile.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: audioFile.type });

    // IMPORTANT: Text fields MUST come BEFORE the file for some multipart parsers
    const workerFormData = new FormData();
    workerFormData.append('language', language);
    workerFormData.append('userId', user.id);
    workerFormData.append('recordingId', recordingId); // ✅ For idempotency + storage path
    if (projectId) workerFormData.append('projectId', projectId);
    workerFormData.append('audio', blob, audioFile.name || 'recording.webm'); // File LAST

    const workerUrl = `${process.env.WORKER_BASE_URL || 'http://localhost:8081'}/v1/transcribe`;

    // Get auth headers without Content-Type (FormData will set it automatically)
    const authHeaders = createWorkerAuthHeaders('POST', '/v1/transcribe', '');
    delete authHeaders['Content-Type']; // Remove JSON content-type, FormData sets multipart

    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: authHeaders,
      body: workerFormData,
      cache: 'no-store',
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text().catch(() => workerResponse.statusText);
      console.error('[Transcribe API] Worker error:', errorText);
      return new NextResponse(errorText, { status: workerResponse.status });
    }

    const result = await workerResponse.json();

    console.log('[Transcribe API] Transcription success:', {
      textLength: result.text?.length,
      duration: result.duration,
      cost: result.cost,
      inputTokens: result.inputTokens,
      storagePath: result.storagePath
    });

    // 7. Save to database (ALWAYS - both hero and project recordings)
    // Worker returns storagePath after uploading to Supabase Storage
    try {
      const audioFormat = getAudioFormat(audioFile.type);

      // Build insert data with new columns
      const insertData = {
        client_recording_id: recordingId,  // Idempotency key
        user_id: user.id,
        project_id: projectId || null,     // Nullable for hero recordings
        source: source,                     // 'hero' or 'project'
        audio_url: result.storagePath,     // Store path from worker (after upload)
        audio_format: audioFormat,
        duration_seconds: result.duration ? Math.round(result.duration) : null,
        file_size_bytes: audioFile.size,
        transcription: result.text || '',
        detected_language: result.language || language,
        provider: 'openai',
        model_version: 'gpt-4o-mini-transcribe',
        cost_usd: result.cost || null,
        input_tokens: result.inputTokens || null  // Token count for cost transparency
      };

      console.log('[Transcribe API] Saving to database:', {
        recordingId,
        source,
        projectId: projectId || '(none)',
        storagePath: result.storagePath,
        textLength: result.text?.length
      });

      // UPSERT on (user_id, client_recording_id) for idempotency
      // Same recordingId = update instead of duplicate
      const { error: dbError } = await supabase
        .from('voice_recordings')
        .upsert(insertData, {
          onConflict: 'user_id,client_recording_id',
          ignoreDuplicates: false
        });

      if (dbError) {
        // Log but don't fail the request - transcription already succeeded
        console.error('[Transcribe API] Database save failed:', dbError);

        // If upsert fails due to missing constraint (pre-migration), try insert
        if (dbError.code === '42P10' || dbError.message?.includes('constraint')) {
          console.log('[Transcribe API] Attempting fallback insert...');
          const { error: insertError } = await supabase
            .from('voice_recordings')
            .insert(insertData);

          if (insertError) {
            console.error('[Transcribe API] Fallback insert failed:', insertError);
          } else {
            console.log('[Transcribe API] Database save successful (insert fallback)');
          }
        }
      } else {
        console.log('[Transcribe API] Database save successful (upsert)');
      }
    } catch (dbErr) {
      // Don't fail the request if DB save fails
      console.error('[Transcribe API] Database save exception:', dbErr);
    }

    // 8. Return transcription result
    return NextResponse.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      cost: result.cost,
      storagePath: result.storagePath,
      recordingId
    });

  } catch (error) {
    console.error('[Transcribe API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return new NextResponse(msg, { status: 500 });
  }
}

/**
 * Extract audio format from MIME type
 */
function getAudioFormat(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm'; // default
}
