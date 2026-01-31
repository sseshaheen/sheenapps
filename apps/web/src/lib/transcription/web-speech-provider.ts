/**
 * Web Speech API Provider
 *
 * Part of: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
 *
 * Wraps the Web Speech API (SpeechRecognition) as a RealtimeTranscriptionProvider.
 * This is the "fast path" when available - instant (<100ms) and free.
 *
 * Browser Support (Jan 2026):
 * - ✅ Chrome Desktop/Android
 * - ✅ Edge Desktop
 * - ❌ Safari (all platforms)
 * - ⚠️ Firefox (experimental only)
 *
 * Falls back to ChunkedOpenAITranscriptionProvider on unsupported browsers.
 */

'use client';

import { RealtimeTranscriptionProvider } from './types';

// Type declarations for Web Speech API
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
  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

declare const webkitSpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof webkitSpeechRecognition;
  }
}

export class WebSpeechProvider implements RealtimeTranscriptionProvider {
  readonly name = 'web-speech';

  private recognition: SpeechRecognition | null = null;
  private interimCallback: ((text: string) => void) | null = null;
  private finalCallback: ((text: string) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private accumulatedFinalText: string = '';

  get isSupported(): boolean {
    return !!(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));
  }

  async start(stream: MediaStream, language: string, projectId?: string): Promise<void> {
    if (!this.isSupported) {
      throw new Error('Web Speech API not supported in this browser');
    }

    // Get SpeechRecognition constructor (with webkit prefix fallback)
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      throw new Error('SpeechRecognition constructor not available');
    }

    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = language;
    this.recognition.maxAlternatives = 1;

    this.accumulatedFinalText = '';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      // Process results from the last result index
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Send interim result (real-time preview)
      if (interimTranscript && this.interimCallback) {
        // Combine accumulated final text with current interim
        const combined = this.accumulatedFinalText + interimTranscript;
        this.interimCallback(combined.trim());
      }

      // Accumulate final results
      if (finalTranscript) {
        this.accumulatedFinalText += finalTranscript;

        // Send updated accumulated text as interim
        if (this.interimCallback) {
          this.interimCallback(this.accumulatedFinalText.trim());
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);

      // Don't treat "no-speech" as error (user paused)
      if (event.error !== 'no-speech') {
        this.errorCallback?.(event.error);
      }
    };

    this.recognition.onend = () => {
      // Recognition stopped - might need to restart if still recording
      console.debug('Speech recognition ended');
    };

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Already stopped, ignore
      }

      // Send final accumulated text
      if (this.finalCallback && this.accumulatedFinalText) {
        this.finalCallback(this.accumulatedFinalText.trim());
      }

      this.recognition = null;
    }
  }

  onInterimResult(callback: (text: string) => void): void {
    this.interimCallback = callback;
  }

  onFinalResult(callback: (text: string) => void): void {
    this.finalCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }
}
