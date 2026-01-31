/**
 * Speech Provider Factory
 *
 * Creates and caches speech-to-text provider instances.
 * Supports multiple providers for flexibility, cost optimization, and fallbacks.
 */

import { SpeechToTextProvider } from './providers/base';
import { OpenAISpeechProvider } from './providers/openai';

export type ProviderType = 'openai' | 'assemblyai' | 'google';

export class SpeechProviderFactory {
  private static providers: Map<ProviderType, SpeechToTextProvider> = new Map();

  /**
   * Get or create a speech-to-text provider instance
   *
   * @param type - Provider type ('openai', 'assemblyai', 'google')
   * @returns SpeechToTextProvider instance
   * @throws Error if provider type is unknown or API key is missing
   */
  static getProvider(type: ProviderType = 'openai'): SpeechToTextProvider {
    // Return cached instance if available
    if (this.providers.has(type)) {
      return this.providers.get(type)!;
    }

    let provider: SpeechToTextProvider;

    switch (type) {
      case 'openai':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY environment variable is not configured');
        }
        provider = new OpenAISpeechProvider(process.env.OPENAI_API_KEY);
        break;

      case 'assemblyai':
        // Future implementation
        throw new Error('AssemblyAI provider not yet implemented. Use "openai" for now.');

      case 'google':
        // Future implementation
        throw new Error('Google Speech provider not yet implemented. Use "openai" for now.');

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }

    // Cache provider instance for reuse
    this.providers.set(type, provider);
    return provider;
  }

  /**
   * Clear cached provider instances (useful for testing)
   */
  static clearCache(): void {
    this.providers.clear();
  }
}
