/**
 * Real-Time Transcription Provider Interface
 *
 * Part of: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
 *
 * Defines the contract for real-time transcription providers that stream
 * text results as audio is being recorded. Supports multiple providers
 * (Web Speech API, OpenAI chunked streaming, etc.) with unified interface.
 */

/**
 * Real-time transcription provider interface
 *
 * Providers must support:
 * - Start/stop recording
 * - Stream interim results (preview text)
 * - Provide final results (canonical text)
 * - Error handling
 * - Feature detection
 */
export interface RealtimeTranscriptionProvider {
  /** Provider identifier (e.g., 'web-speech', 'chunked-openai-transcription') */
  readonly name: string;

  /** Whether this provider is supported in current environment */
  readonly isSupported: boolean;

  /**
   * Start transcribing from media stream
   * @param stream - MediaStream from getUserMedia()
   * @param language - ISO 639-1 language code (e.g., 'en', 'ar', 'fr')
   * @param projectId - Optional project ID for context/billing
   */
  start(stream: MediaStream, language: string, projectId?: string): Promise<void>;

  /**
   * Stop transcribing and finalize
   * Should trigger final transcription if applicable
   */
  stop(): Promise<void>;

  /**
   * Register callback for interim results (real-time preview)
   * Called as transcription chunks arrive
   * @param callback - Function to receive interim text
   */
  onInterimResult(callback: (text: string) => void): void;

  /**
   * Register callback for final result (canonical transcription)
   * Called when recording stops and final transcription is complete
   * @param callback - Function to receive final text
   */
  onFinalResult(callback: (text: string) => void): void;

  /**
   * Register callback for errors
   * @param callback - Function to receive error messages
   */
  onError(callback: (error: string) => void): void;
}
