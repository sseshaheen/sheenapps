/**
 * Voice Activity Detection Hook - Auto-Submit Detection
 *
 * Detects when user stops speaking using volume analysis.
 * Part of VOICE_UX_ENHANCEMENTS_PLAN_V2.md - Smart auto-submit.
 *
 * Features:
 * - Works on ALL browsers (Web Audio API)
 * - Dynamic silence duration (context-aware timing)
 * - Smart detection (doesn't interrupt mid-sentence)
 * - Performance optimized (refs for hot loop, throttled UI)
 *
 * V2 Fixes Applied:
 * - Hot-loop values in refs (NOT state)
 * - UI updates throttled to 100ms (not every frame)
 * - hasMinSpeech moved to ref (removed from deps)
 * - Returns activeSilenceDuration for accurate countdown
 * - Dynamic silence: 1.5s after long speech, 2s normally
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface UseVoiceActivityDetectionOptions {
  stream: MediaStream | null; // MUST be actual stream
  enabled: boolean;
  silenceThreshold?: number;
  baseSilenceDuration?: number; // Default, will adapt dynamically
  minSpeechDuration?: number;
  onSilenceDetected?: () => void;
  onSpeechDetected?: () => void;
}

interface UseVoiceActivityDetectionReturn {
  isSpeaking: boolean;
  silenceTimer: number;
  hasMinSpeech: boolean;
  activeSilenceDuration: number; // V2 FIX: Return dynamic value for accurate countdown
  reset: () => void;
}

export function useVoiceActivityDetection(
  options: UseVoiceActivityDetectionOptions
): UseVoiceActivityDetectionReturn {
  const {
    stream,
    enabled,
    silenceThreshold = 10,
    baseSilenceDuration = 2000,
    minSpeechDuration = 3000,
    onSilenceDetected,
    onSpeechDetected
  } = options;

  // CRITICAL: Hot-loop values in refs (NOT state)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const silenceStartRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const lastSpeechEndRef = useRef<number | null>(null);
  const continuousSpeechDurationRef = useRef(0);
  const hasMinSpeechRef = useRef(false); // FIXED: Moved to ref (not state in deps)
  const activeSilenceDurationRef = useRef(baseSilenceDuration); // FIXED: Track dynamic value

  // State for UI only (throttled updates)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState(0);
  const [hasMinSpeech, setHasMinSpeech] = useState(false); // Only for UI display
  const [activeSilenceDuration, setActiveSilenceDuration] = useState(baseSilenceDuration);

  const lastUIUpdateRef = useRef(0);

  useEffect(() => {
    if (!enabled || !stream) {
      // Cleanup when disabled
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
      return;
    }

    // Initialize Web Audio API
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024; // Smaller FFT for better performance
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray: Uint8Array = new Uint8Array(bufferLength);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    // Analysis loop
    const analyzeVolume = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      // @ts-expect-error - Web Audio API types have ArrayBufferLike vs ArrayBuffer mismatch
      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const value = Math.abs(dataArrayRef.current[i] - 128);
        sum += value;
      }
      const average = sum / dataArrayRef.current.length;

      const now = Date.now();

      // Detect speech vs silence
      if (average > silenceThreshold) {
        // User is speaking
        const wasSilent =
          !speechStartRef.current ||
          (lastSpeechEndRef.current && now - lastSpeechEndRef.current > 1000);

        if (wasSilent) {
          // NEW speech started
          speechStartRef.current = now;
          continuousSpeechDurationRef.current = 0;

          // Throttled UI update
          if (now - lastUIUpdateRef.current > 100) {
            setIsSpeaking(true);
            lastUIUpdateRef.current = now;
          }

          onSpeechDetected?.();
        } else {
          // CONTINUING speech
          continuousSpeechDurationRef.current = now - speechStartRef.current!;
        }

        // Reset silence timer
        silenceStartRef.current = null;

        // Throttled UI update for silence timer
        if (now - lastUIUpdateRef.current > 100) {
          setSilenceTimer(0);
          lastUIUpdateRef.current = now;
        }

        // Check if minimum speech duration reached
        if (speechStartRef.current && now - speechStartRef.current >= minSpeechDuration) {
          if (!hasMinSpeechRef.current) {
            hasMinSpeechRef.current = true;
            setHasMinSpeech(true); // Update UI state
          }
        }
      } else {
        // User is silent
        if (speechStartRef.current && !lastSpeechEndRef.current) {
          // Speech just ended
          lastSpeechEndRef.current = now;

          // Throttled UI update
          if (now - lastUIUpdateRef.current > 100) {
            setIsSpeaking(false);
            lastUIUpdateRef.current = now;
          }
        }

        // Start/continue silence timer
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        }

        const silenceElapsed = now - silenceStartRef.current;

        // Throttled UI update for silence timer
        if (now - lastUIUpdateRef.current > 100) {
          setSilenceTimer(silenceElapsed);
          lastUIUpdateRef.current = now;
        }

        // DYNAMIC silence duration based on speech pattern
        const wasLongSpeech = continuousSpeechDurationRef.current > 10000; // 10+ seconds
        const dynamicSilenceDuration = wasLongSpeech
          ? baseSilenceDuration * 0.75 // Shorter wait after long speech (1.5s)
          : baseSilenceDuration; // Normal wait (2s)

        // FIXED: Update UI state when dynamic duration changes (for countdown accuracy)
        if (activeSilenceDurationRef.current !== dynamicSilenceDuration) {
          activeSilenceDurationRef.current = dynamicSilenceDuration;
          if (now - lastUIUpdateRef.current > 100) {
            setActiveSilenceDuration(dynamicSilenceDuration);
          }
        }

        // Trigger auto-submit if conditions met (check ref, not state)
        if (hasMinSpeechRef.current && silenceElapsed >= dynamicSilenceDuration) {
          onSilenceDetected?.();

          // Reset for next detection cycle
          hasMinSpeechRef.current = false;
          setHasMinSpeech(false);
          speechStartRef.current = null;
          lastSpeechEndRef.current = null;
          silenceStartRef.current = null;
          continuousSpeechDurationRef.current = 0;
        }
      }

      // Continue loop
      animationFrameRef.current = requestAnimationFrame(analyzeVolume);
    };

    analyzeVolume();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [enabled, stream, silenceThreshold, baseSilenceDuration, minSpeechDuration]);

  // FIXED: Removed hasMinSpeech from deps (now using ref)
  // hasMinSpeechRef is checked in the loop, setHasMinSpeech only for UI updates

  const reset = () => {
    setIsSpeaking(false);
    setSilenceTimer(0);
    setHasMinSpeech(false);
    hasMinSpeechRef.current = false; // FIXED: Also reset ref
    setActiveSilenceDuration(baseSilenceDuration);
    activeSilenceDurationRef.current = baseSilenceDuration;
    speechStartRef.current = null;
    lastSpeechEndRef.current = null;
    silenceStartRef.current = null;
    continuousSpeechDurationRef.current = 0;
  };

  return {
    isSpeaking,
    silenceTimer,
    hasMinSpeech,
    activeSilenceDuration, // FIXED: Return dynamic value for accurate countdown
    reset
  };
}
