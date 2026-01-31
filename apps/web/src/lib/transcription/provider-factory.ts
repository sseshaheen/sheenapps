/**
 * Real-Time Transcription Provider Factory
 *
 * IMPORTANT: This factory is for LIVE PREVIEW only (during recording).
 * Final transcription ALWAYS uses OpenAI Whisper via /api/v1/transcribe.
 *
 * Live Preview Providers:
 * - Web Speech API: Chrome/Edge only, instant, no cost
 * - Chunked OpenAI: Fallback, but unreliable (WebM fragments aren't standalone files)
 *
 * Decision Logic:
 * 1. Chrome/Edge: Web Speech for live preview → OpenAI Whisper for final
 * 2. Safari/Firefox: No live preview (waveform only) → OpenAI Whisper for final
 *
 * The modal (voice-recording-modal.tsx) handles the full flow:
 * - Storage upload + API transcription happen regardless of preview provider
 * - Database save only when projectId is provided
 */

'use client';

import { RealtimeTranscriptionProvider } from './types';
import { WebSpeechProvider } from './web-speech-provider';
import { ChunkedOpenAITranscriptionProvider } from './chunked-openai-transcription-provider';

export type ProviderType = 'web-speech' | 'chunked-openai' | 'auto';

/**
 * Check if a feature flag is enabled
 * This is a placeholder - replace with your actual feature flag system
 */
function isFeatureEnabled(flag: string): boolean {
  if (typeof window === 'undefined') return false;

  // Check environment variable (set at build time)
  const envValue = process.env[`NEXT_PUBLIC_${flag}`];
  if (envValue !== undefined) {
    return envValue === 'true' || envValue === '1';
  }

  // Default based on flag name
  switch (flag) {
    case 'PREFER_WEB_SPEECH':
      return false; // Default to OpenAI for universal support (opt-in to Web Speech)
    default:
      return false;
  }
}

/**
 * Create a real-time transcription provider instance
 *
 * @param preferredProvider - Provider type or 'auto' for automatic selection
 * @returns Provider instance (Web Speech or Chunked OpenAI)
 */
export function createTranscriptionProvider(
  preferredProvider: ProviderType = 'auto'
): RealtimeTranscriptionProvider {
  // Check Web Speech availability
  const hasWebSpeech = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Explicit provider selection
  if (preferredProvider === 'web-speech') {
    if (!hasWebSpeech) {
      console.warn('Web Speech requested but not available, falling back to OpenAI');
      return new ChunkedOpenAITranscriptionProvider();
    }
    return new WebSpeechProvider();
  }

  if (preferredProvider === 'chunked-openai') {
    return new ChunkedOpenAITranscriptionProvider();
  }

  // Auto-select: prefer Web Speech for live preview
  if (preferredProvider === 'auto') {
    if (hasWebSpeech) {
      console.log('[Provider Factory] Using Web Speech for live preview (Chrome/Edge)');
      return new WebSpeechProvider();
    }

    // Fallback: No reliable live preview on Safari/Firefox
    // Final transcription still uses OpenAI Whisper via API
    console.log('[Provider Factory] Web Speech unavailable - no live preview (Safari/Firefox)');
    return new ChunkedOpenAITranscriptionProvider();
  }

  // Default fallback
  return new ChunkedOpenAITranscriptionProvider();
}

/**
 * Get provider type name for analytics/logging
 */
export function getProviderType(provider: RealtimeTranscriptionProvider): ProviderType {
  switch (provider.name) {
    case 'web-speech':
      return 'web-speech';
    case 'chunked-openai-transcription':
      return 'chunked-openai';
    default:
      return 'auto';
  }
}
