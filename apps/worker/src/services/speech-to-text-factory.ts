/**
 * Speech-to-Text Provider Factory
 *
 * Creates speech-to-text provider instances with proper configuration.
 * Supports multiple providers (OpenAI Whisper by default).
 */

import { OpenAISpeechProvider } from './openai-speech-provider';

export type SpeechProviderType = 'openai';

/**
 * Create a speech-to-text provider instance
 *
 * @param providerType - Provider type (default: 'openai')
 * @returns Configured speech provider instance
 * @throws Error if API key not configured
 */
export function createSpeechProvider(providerType: SpeechProviderType = 'openai') {
  switch (providerType) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable not configured');
      }
      return new OpenAISpeechProvider(apiKey);
    }
    default:
      throw new Error(`Unsupported speech provider: ${providerType}`);
  }
}
