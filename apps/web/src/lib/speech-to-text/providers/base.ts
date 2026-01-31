/**
 * Base interface for speech-to-text providers
 *
 * This abstraction allows us to support multiple STT providers (OpenAI, AssemblyAI, Google, etc.)
 * with a consistent interface, enabling easy A/B testing, fallbacks, and cost optimization.
 */

export interface TranscriptionOptions {
  language?: string;        // ISO 639-1 code (e.g., 'en', 'ar', 'fr')
  prompt?: string;          // Context hint for better accuracy
  temperature?: number;     // 0-1, sampling temperature (0 = deterministic)
  format?: 'json' | 'text' | 'srt' | 'vtt';
  // P1 FIX: Thread MIME type and filename for better format detection
  mimeType?: string;        // e.g., 'audio/webm', 'audio/mp4'
  filename?: string;        // e.g., 'audio.webm', 'audio.m4a'
}

export interface TranscriptionSegment {
  text: string;
  start: number;    // Start time in seconds
  end: number;      // End time in seconds
}

export interface TranscriptionResult {
  text: string;                       // Full transcribed text
  language?: string;                  // Detected or specified language
  duration?: number;                  // Audio duration in seconds
  confidence?: number;                // Confidence score (0-1) if provider returns it
  segments?: TranscriptionSegment[];  // Timestamped segments (for subtitles, etc.)
}

/**
 * Abstract base class for speech-to-text providers
 *
 * Each concrete provider (OpenAI, AssemblyAI, etc.) must implement this interface
 */
export abstract class SpeechToTextProvider {
  /**
   * Transcribe audio buffer to text
   *
   * @param audioBuffer - Audio data as Buffer
   * @param options - Transcription options (language, prompt, etc.)
   * @returns Transcription result with text, language, duration, etc.
   */
  abstract transcribe(
    audioBuffer: Buffer,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult>;

  /**
   * Get list of supported audio formats
   *
   * @returns Array of supported MIME types or file extensions
   */
  abstract getSupportedFormats(): string[];

  /**
   * Get maximum file size in MB
   *
   * @returns Maximum file size supported by this provider
   */
  abstract getMaxFileSizeMB(): number;

  /**
   * Get provider name for logging/analytics
   *
   * @returns Provider identifier (e.g., 'openai', 'assemblyai')
   */
  abstract getProviderName(): string;
}
