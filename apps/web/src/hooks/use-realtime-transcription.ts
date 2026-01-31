/**
 * Realtime Transcription Hook - Web Speech API
 *
 * Provides real-time text preview using Web Speech API.
 * Part of VOICE_UX_ENHANCEMENTS_PLAN_V2.md - Tier 2 progressive enhancement.
 *
 * Browser Support (January 2026):
 * - ✅ Chrome Desktop/Android
 * - ✅ Edge Desktop
 * - ❌ Safari (all platforms)
 * - ⚠️ Firefox (experimental only)
 *
 * Features:
 * - Feature detection (isSupported flag)
 * - Interim + final results
 * - Language support
 * - Track if interim text is changing (for VAD integration)
 * - Graceful degradation (onNotSupported callback)
 *
 * Usage:
 * Always check `isSupported` before using. Treat as bonus feature,
 * not requirement. Falls back to Tier 1 (waveform) on unsupported browsers.
 */

'use client';

import { useState, useEffect, useRef } from 'react';

// Type declarations for Web Speech API (not in all TypeScript libs)
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// Use type assertion to access browser-specific APIs
type SpeechRecognitionConstructor = new () => SpeechRecognition;

// Helper to get the SpeechRecognition constructor (browser-specific)
function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

interface UseRealtimeTranscriptionOptions {
  enabled: boolean;
  language: string;
  onInterimResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (error: string) => void;
  onNotSupported?: () => void;
}

interface UseRealtimeTranscriptionReturn {
  interimText: string;
  finalText: string;
  isListening: boolean;
  isSupported: boolean; // CRITICAL: Modal can check this
  isInterimChanging: boolean; // For VAD logic (don't submit during lag)
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useRealtimeTranscription(
  options: UseRealtimeTranscriptionOptions
): UseRealtimeTranscriptionReturn {
  const { enabled, language, onInterimResult, onFinalResult, onError, onNotSupported } = options;

  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const interimChangedRef = useRef(false); // Track if interim text is changing
  const lastInterimTimeRef = useRef(0);

  useEffect(() => {
    // Feature detection
    const SpeechRecognitionCtor = getSpeechRecognition();

    if (!SpeechRecognitionCtor) {
      setIsSupported(false);
      onNotSupported?.();
      return;
    }

    setIsSupported(true);

    if (!enabled) return;

    // Initialize recognition
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        setInterimText(interimTranscript);
        onInterimResult?.(interimTranscript);

        // Track that interim text changed recently (for VAD)
        interimChangedRef.current = true;
        lastInterimTimeRef.current = Date.now();

        // Clear "changing" flag after 500ms of no updates
        setTimeout(() => {
          if (Date.now() - lastInterimTimeRef.current >= 500) {
            interimChangedRef.current = false;
          }
        }, 500);
      }

      if (finalTranscript) {
        setFinalText(prev => prev + finalTranscript);
        onFinalResult?.(finalTranscript);
        setInterimText(''); // Clear interim after finalizing
        interimChangedRef.current = false;
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);

      // Don't treat "no-speech" as error (user paused)
      if (event.error !== 'no-speech') {
        onError?.(event.error);
      }

      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [enabled, language, onInterimResult, onFinalResult, onError, onNotSupported]);

  const start = () => {
    if (isSupported && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started, ignore
        console.warn('SpeechRecognition already started');
      }
    }
  };

  const stop = () => {
    if (isSupported && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Already stopped, ignore
      }
    }
  };

  const reset = () => {
    setInterimText('');
    setFinalText('');
    interimChangedRef.current = false;
  };

  return {
    interimText,
    finalText,
    isListening,
    isSupported, // CRITICAL: Modal can check this
    isInterimChanging: interimChangedRef.current, // For VAD logic
    start,
    stop,
    reset
  };
}
