/**
 * Audio Waveform Hook - Universal Visual Feedback
 *
 * Provides real-time audio visualization using Web Audio API (works on ALL browsers).
 * Part of VOICE_UX_ENHANCEMENTS_PLAN_V2.md - Tier 1 universal feedback.
 *
 * Features:
 * - Works on Chrome, Safari, Firefox, Edge (mobile + desktop)
 * - Real-time volume calculation from audio stream
 * - Waveform data for canvas visualizations
 * - Performance optimized (throttled UI updates, refs for hot loop)
 * - No re-render storms (100ms throttle, not every frame)
 *
 * V2 Fixes Applied:
 * - Returns getWaveformData() function (not direct ref - reactive-safe)
 * - Throttled state updates (100ms intervals)
 * - Smaller FFT for mobile performance (1024 default)
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface UseAudioWaveformOptions {
  stream: MediaStream | null;
  enabled: boolean;
  fftSize?: number; // 256, 512, 1024, 2048 (higher = more detail, more CPU)
}

interface UseAudioWaveformReturn {
  currentVolume: number; // 0-255 (for volume bar height)
  getWaveformData: () => Uint8Array | null; // Function to get raw data (reactive-safe)
  analyser: AnalyserNode | null; // For advanced visualizations
}

export function useAudioWaveform(
  options: UseAudioWaveformOptions
): UseAudioWaveformReturn {
  const { stream, enabled, fftSize = 1024 } = options;

  // CRITICAL: Use refs for hot-loop values (avoid re-renders)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ONLY update state for UI every 100ms (throttled)
  const [currentVolume, setCurrentVolume] = useState(0);
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

    // Initialize AudioContext (MUST be triggered by user gesture on iOS)
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray: Uint8Array = new Uint8Array(bufferLength);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    // Animation loop
    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      // @ts-expect-error - Web Audio API types have ArrayBufferLike vs ArrayBuffer mismatch
      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

      // Calculate average volume (0-255)
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const value = Math.abs(dataArrayRef.current[i] - 128);
        sum += value;
      }
      const average = sum / dataArrayRef.current.length;

      // Throttle UI updates to every 100ms (prevent re-render storm)
      const now = Date.now();
      if (now - lastUIUpdateRef.current > 100) {
        setCurrentVolume(average);
        lastUIUpdateRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [enabled, stream, fftSize]);

  return {
    currentVolume, // 0-255 (for volume bar height)
    getWaveformData: () => dataArrayRef.current, // V2 FIX: Function (not direct ref)
    analyser: analyserRef.current // For advanced visualizations
  };
}
