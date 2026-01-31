/**
 * Real-Time Transcription Provider Hook
 *
 * Part of: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
 *
 * Wraps the provider system (Web Speech + OpenAI fallback) in a React hook.
 * Replaces the old `use-realtime-transcription` hook which only supported Web Speech.
 *
 * Features:
 * - Auto-selects best provider (Web Speech fast path, OpenAI fallback)
 * - Universal browser support (works on Safari, Firefox, etc.)
 * - Streaming text updates (interim + final)
 * - Feature flag support
 * - Error handling and fallback
 *
 * Usage:
 * ```tsx
 * const {
 *   interimText,
 *   finalText,
 *   isSupported,
 *   providerName,
 *   start,
 *   stop,
 *   reset
 * } = useRealtimeTranscriptionProvider({
 *   enabled: true,
 *   language: 'ar',
 *   projectId: 'proj_123',
 *   onError: (err) => console.error(err)
 * });
 * ```
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createTranscriptionProvider,
  type RealtimeTranscriptionProvider,
  type ProviderType
} from '@/lib/transcription';

interface UseRealtimeTranscriptionProviderOptions {
  enabled: boolean;
  language: string;
  projectId?: string;
  preferredProvider?: ProviderType;
  onInterimResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseRealtimeTranscriptionProviderReturn {
  interimText: string;
  finalText: string;
  isSupported: boolean;
  providerName: string;
  start: (stream: MediaStream) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export function useRealtimeTranscriptionProvider(
  options: UseRealtimeTranscriptionProviderOptions
): UseRealtimeTranscriptionProviderReturn {
  const {
    enabled,
    language,
    projectId,
    preferredProvider = 'auto',
    onInterimResult,
    onFinalResult,
    onError
  } = options;

  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [providerName, setProviderName] = useState('');

  const providerRef = useRef<RealtimeTranscriptionProvider | null>(null);
  const isStartedRef = useRef(false);

  // Initialize provider
  useEffect(() => {
    if (!enabled) return;

    try {
      const provider = createTranscriptionProvider(preferredProvider);
      providerRef.current = provider;
      setProviderName(provider.name);

      // Register callbacks
      provider.onInterimResult((text) => {
        setInterimText(text);
        onInterimResult?.(text);
      });

      provider.onFinalResult((text) => {
        setFinalText(text);
        setInterimText(''); // Clear interim when final arrives
        onFinalResult?.(text);
      });

      provider.onError((error) => {
        console.error('Transcription provider error:', error);
        onError?.(error);
      });

    } catch (error) {
      console.error('Failed to initialize transcription provider:', error);
      onError?.('Failed to initialize transcription');
    }

    return () => {
      // Cleanup on unmount
      if (providerRef.current && isStartedRef.current) {
        providerRef.current.stop().catch(console.error);
        isStartedRef.current = false;
      }
    };
  }, [enabled, preferredProvider]); // Don't include callbacks in deps (they change on every render)

  const start = useCallback(async (stream: MediaStream) => {
    if (!providerRef.current) {
      throw new Error('Provider not initialized');
    }

    if (isStartedRef.current) {
      console.warn('Transcription already started');
      return;
    }

    try {
      await providerRef.current.start(stream, language, projectId);
      isStartedRef.current = true;
    } catch (error) {
      console.error('Failed to start transcription:', error);
      onError?.('Failed to start transcription');
      throw error;
    }
  }, [language, projectId, onError]);

  const stop = useCallback(async () => {
    if (!providerRef.current) return;
    if (!isStartedRef.current) return;

    try {
      await providerRef.current.stop();
      isStartedRef.current = false;
    } catch (error) {
      console.error('Failed to stop transcription:', error);
      onError?.('Failed to stop transcription');
    }
  }, [onError]);

  const reset = useCallback(() => {
    setInterimText('');
    setFinalText('');
  }, []);

  const isSupported = providerRef.current?.isSupported ?? false;

  return {
    interimText,
    finalText,
    isSupported,
    providerName,
    start,
    stop,
    reset
  };
}
