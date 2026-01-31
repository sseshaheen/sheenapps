/**
 * OpenAI Speech-to-Text Provider
 *
 * Uses OpenAI's Whisper API (gpt-4o-mini-transcribe model) for transcription
 * Cost: $0.003 per minute (50% cheaper than whisper-1)
 *
 * Model details: https://platform.openai.com/docs/models/gpt-4o-mini-transcribe
 * Pricing: https://platform.openai.com/docs/pricing
 */

import OpenAI, { toFile } from 'openai';
import { SpeechToTextProvider, TranscriptionOptions, TranscriptionResult } from './base';

export class OpenAISpeechProvider extends SpeechToTextProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(
    audioBuffer: Buffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      // CRITICAL: Use toFile helper instead of new File() constructor
      // The File API may not be available or behave differently in Node.js environments
      // toFile() from OpenAI SDK ensures compatibility across Node versions and runtimes
      // See: https://github.com/openai/openai-node/blob/master/examples/audio.ts
      //
      // P1 FIX: Use actual MIME type and filename from request (better format detection)
      // Falls back to webm if not provided
      const filename = options.filename || 'audio.webm';
      const mimeType = options.mimeType || 'audio/webm';

      const file = await toFile(audioBuffer, filename, {
        type: mimeType
      });

      // Call OpenAI Whisper API with gpt-4o-mini-transcribe model
      const transcription = await this.client.audio.transcriptions.create({
        file,
        model: 'gpt-4o-mini-transcribe',  // $0.003/min (50% cheaper than whisper-1)
        language: options.language,       // Optional: 'en', 'ar', 'fr', etc.
        prompt: options.prompt,           // Optional: context hint for better accuracy
        temperature: options.temperature ?? 0,  // 0 = deterministic, 1 = creative
        response_format: 'verbose_json'   // Get detailed response with segments
      });

      return {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
        segments: transcription.segments?.map(segment => ({
          text: segment.text,
          start: segment.start,
          end: segment.end
        }))
      };

    } catch (error) {
      // Re-throw with more context for debugging
      if (error instanceof Error) {
        throw new Error(`OpenAI transcription failed: ${error.message}`);
      }
      throw error;
    }
  }

  getSupportedFormats(): string[] {
    // OpenAI supports these formats
    // https://platform.openai.com/docs/guides/speech-to-text
    return ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];
  }

  getMaxFileSizeMB(): number {
    // OpenAI limit: 25MB
    // https://platform.openai.com/docs/guides/speech-to-text/limitations
    return 25;
  }

  getProviderName(): string {
    return 'openai';
  }
}
