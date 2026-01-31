/**
 * OpenAI Final-Only Transcription Provider
 *
 * Part of: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
 *
 * Records complete audio and transcribes at the end (NO real-time preview).
 *
 * Why no real-time chunking:
 * - OpenAI /audio/transcriptions expects complete valid audio files
 * - MediaRecorder timeslice chunks are WebM fragments (not standalone files)
 * - Uploading fragments causes "corrupted or unsupported" errors
 * - For real-time preview, use Web Speech API instead
 *
 * What this provides:
 * 1. Records complete audio with MediaRecorder
 * 2. On stop: uploads full recording to OpenAI via Next.js → Worker
 * 3. Returns final accurate transcription
 *
 * Architecture: Browser → Next.js (JWT) → Worker (HMAC) → OpenAI
 * Use case: Browsers without Web Speech (Safari/Firefox) - waveform during recording, text after
 */

'use client';

import { RealtimeTranscriptionProvider } from './types';
import { parseSSELine } from '@/lib/stream-controller';

export class ChunkedOpenAITranscriptionProvider implements RealtimeTranscriptionProvider {
  readonly name = 'openai-final-only';
  readonly isSupported = true; // Works on all browsers

  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private uploadInterval: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;

  private interimCallback: ((text: string) => void) | null = null;
  private finalCallback: ((text: string) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;

  private allChunks: Blob[] = []; // Collected for final complete recording
  private pendingChunks: Blob[] = []; // Chunks pending upload
  private finalText: string = ''; // Final transcription text (from complete recording)
  private finalEmitted: boolean = false;
  private accumulatedText: string = ''; // Accumulated text from interim results
  private uploadInFlight: Promise<void> | null = null; // Track in-flight upload
  // Track chunk duration for fair rate limiting (1.25s per chunk)
  private readonly CHUNK_DURATION_MS = 1250;
  private language: string = 'ar';
  private projectId?: string;

  async start(stream: MediaStream, language: string, projectId?: string) {
    console.log('[Provider] start() called', { language, projectId });

    this.stream = stream;
    this.language = language;
    this.projectId = projectId;
    this.accumulatedText = '';
    this.pendingChunks = [];
    this.allChunks = [];
    this.finalEmitted = false; // Reset for new recording
    this.abortController = new AbortController();

    try {
      // Get auth token (user must be authenticated)
      const token = await this.getAuthToken();

      // Create MediaRecorder for chunked recording
      const mimeType = this.getSupportedMimeType();
      console.log('[Provider] Creating MediaRecorder with mimeType:', mimeType);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 32000 // HINT: 32 kbps (browsers often ignore/adjust this)
      });

      // Collect chunks
      // ✅ P0 FIX #2: Push to both pending (for interval) and all (for final)
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('[Provider] Chunk received:', event.data.size, 'bytes');
          this.pendingChunks.push(event.data);
          this.allChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('[Provider] MediaRecorder error:', event);
        this.errorCallback?.('Recording failed');
      };

      // Start recording - collect all chunks for final complete file
      // Note: timeslice parameter doesn't matter since we're not uploading chunks
      // We only upload the complete recording on stop()
      this.mediaRecorder.start();
      console.log('[Provider] MediaRecorder started');

    } catch (error) {
      console.error('[Provider] Start failed', error);
      this.errorCallback?.('Failed to start transcription');
    }
  }

  /**
   * Get supported MIME type for MediaRecorder
   * Prioritizes webm/opus (best compression), falls back to other formats
   */
  private getSupportedMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/wav'
    ];

    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback (should never happen on modern browsers)
    return 'audio/webm';
  }

  /**
   * Get authentication token from current session
   * Assumes user is authenticated via Supabase
   */
  private async getAuthToken(): Promise<string> {
    // In a real implementation, you'd get the token from your auth system
    // For now, we'll fetch it from the session cookie which Supabase manages

    // The Next.js API route will handle JWT validation from the Authorization header
    // This is a placeholder - in production, you'd get the session token from Supabase client

    // For now, we'll just return empty string and rely on cookies being sent automatically
    // TODO: Get actual JWT token from Supabase session
    return '';
  }

  // OLD CHUNK UPLOAD METHODS REMOVED
  // No longer uploading during recording - only upload complete file on stop()

  /**
   * Stop recording and get final transcription
   * ✅ P0 FIX: Uploads full recording for final accuracy
   */
  async stop() {
    console.log('[Provider] stop() called', {
      hasMediaRecorder: !!this.mediaRecorder,
      mediaRecorderState: this.mediaRecorder?.state,
      chunksCollected: this.allChunks.length
    });

    // Stop recording first
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      console.log('[Provider] MediaRecorder stopped');
    }

    // Stop chunk upload interval
    if (this.uploadInterval) {
      clearInterval(this.uploadInterval);
      this.uploadInterval = null;
    }

    // Wait a moment for final dataavailable event
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('[Provider] After wait, chunks:', this.allChunks.length);

    // Upload full recording for final transcription
    await this.uploadFinalTranscription();

    // Cleanup
    this.cleanup();
  }

  /**
   * Upload full recording to storage, transcribe, and save to database
   * NEW ARCHITECTURE: No chunk uploads - single complete file only
   */
  private async uploadFinalTranscription() {
    if (this.allChunks.length === 0) {
      console.warn('No audio chunks collected');
      return;
    }

    try {
      const mimeType = this.getSupportedMimeType();
      const fullRecording = new Blob(this.allChunks, { type: mimeType });

      console.log('[Transcription] Processing complete recording:', {
        size: fullRecording.size,
        type: mimeType,
        chunks: this.allChunks.length
      });

      // 1. Upload to Supabase Storage
      const storagePath = await this.uploadToStorage(fullRecording, mimeType);

      // 2. Transcribe via API
      const transcription = await this.transcribeAudio(fullRecording, storagePath);

      // 3. Save to database
      await this.saveToDatabase(storagePath, fullRecording.size, transcription);

      // 4. Return result to UI
      if (this.finalCallback && !this.finalEmitted) {
        this.finalEmitted = true;
        this.finalCallback(transcription.text.trim());
      }

    } catch (error) {
      console.error('Final transcription error:', error);
      this.errorCallback?.('Transcription failed. Please try again.');
    }
  }

  /**
   * Upload audio blob to Supabase Storage
   * Path: {userId}/{year}/{month}/{uuid}.{ext}
   */
  private async uploadToStorage(blob: Blob, mimeType: string): Promise<string> {
    const { createClient } = await import('@/lib/supabase-client');
    const supabase = createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Generate path
    const recordingId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const ext = this.getFileExtension(mimeType);
    const path = `${user.id}/${year}/${month}/${recordingId}.${ext}`;

    console.log('[Storage] Uploading to:', path);

    // Upload
    const { data, error } = await supabase.storage
      .from('voice-recordings')
      .upload(path, blob, {
        contentType: mimeType,
        upsert: false
      });

    if (error) {
      console.error('[Storage] Upload failed:', error);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    console.log('[Storage] Upload successful:', data.path);
    return data.path;
  }

  /**
   * Transcribe audio via API endpoint
   */
  private async transcribeAudio(blob: Blob, storagePath: string): Promise<{
    text: string;
    language?: string;
    duration?: number;
    cost?: number;
  }> {
    const formData = new FormData();
    formData.append('audio', blob);
    formData.append('language', this.language);
    formData.append('storagePath', storagePath);
    if (this.projectId) formData.append('projectId', this.projectId);

    console.log('[Transcription] Calling API...');

    const response = await fetch('/api/v1/transcribe', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`Transcription API failed: ${error}`);
    }

    const result = await response.json();
    console.log('[Transcription] Success:', {
      textLength: result.text?.length,
      language: result.language,
      duration: result.duration
    });

    return result;
  }

  /**
   * Save transcription metadata to database
   */
  private async saveToDatabase(
    storagePath: string,
    fileSize: number,
    transcription: { text: string; language?: string; duration?: number; cost?: number }
  ): Promise<void> {
    const { createClient } = await import('@/lib/supabase-client');
    const supabase = createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Already logged, not critical

    // Generate audio URL (signed URL valid for 1 year)
    const { data: urlData } = await supabase.storage
      .from('voice-recordings')
      .createSignedUrl(storagePath, 31536000); // 1 year

    const insertData: any = {
      user_id: user.id,
      audio_url: urlData?.signedUrl || storagePath,
      audio_format: this.getFileExtension(this.getSupportedMimeType()),
      file_size_bytes: fileSize,
      transcription: transcription.text,
      detected_language: transcription.language || this.language,
      provider: 'openai',
      model_version: 'gpt-4o-mini-transcribe'
    };

    // Add optional fields
    if (this.projectId) insertData.project_id = this.projectId;
    if (transcription.duration) insertData.duration_seconds = Math.round(transcription.duration);
    if (transcription.cost) insertData.cost_usd = transcription.cost;

    console.log('[Database] Saving transcription record...');

    const { error } = await supabase
      .from('voice_recordings')
      .insert(insertData);

    if (error) {
      console.error('[Database] Save failed:', error);
      // Don't throw - transcription still worked
    } else {
      console.log('[Database] Saved successfully');
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('wav')) return 'wav';
    return 'webm'; // default
  }

  private cleanup() {
    // Abort any pending uploads
    this.abortController?.abort();
    this.abortController = null;

    if (this.uploadInterval) {
      clearInterval(this.uploadInterval);
      this.uploadInterval = null;
    }

    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }

    this.mediaRecorder = null;
    this.stream = null;

    this.pendingChunks = [];
    this.allChunks = [];
    this.uploadInFlight = null;
  }

  onInterimResult(callback: (text: string) => void) {
    this.interimCallback = callback;
  }

  onFinalResult(callback: (text: string) => void) {
    this.finalCallback = callback;
  }

  onError(callback: (error: string) => void) {
    this.errorCallback = callback;
  }
}
