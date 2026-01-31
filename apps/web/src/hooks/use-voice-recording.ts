/**
 * Voice Recording Hook
 *
 * React hook for managing voice recordings using the MediaRecorder API.
 *
 * Features:
 * - Start/stop/pause/resume/cancel recording
 * - Duration tracking with pause/resume support
 * - Max duration enforcement
 * - Audio level metering (optional, for visual feedback)
 * - Proper cleanup on unmount (prevents memory leaks)
 * - Cross-browser compatibility (WebM or MP4)
 * - Error handling with user-friendly messages
 *
 * Expert fixes applied:
 * - Unmount cleanup prevents stream/timer leaks
 * - Single onstop handler prevents race conditions
 * - Cancel flag prevents stale blob creation
 * - Proper timer accumulation for pause/resume
 * - Max duration only signals, doesn't auto-stop (UI decides)
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceRecordingOptions {
  maxDurationSeconds?: number;
  onMaxDurationReached?: () => void;
  stream?: MediaStream; // ADDED V2: Optional external stream to prevent double getUserMedia
  enableLevelMeter?: boolean; // Enable audio level metering (for visual feedback)
}

interface StartRecordingOptions {
  stream?: MediaStream; // ADDED V2: Accept stream at call-time to prevent double getUserMedia
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number; // 0-100, for visual level meter
  audioBlob: Blob | null;
  error: string | null;
  startRecording: (opts?: StartRecordingOptions) => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;
  isSupported: boolean;
}

export function useVoiceRecording(
  options: UseVoiceRecordingOptions = {}
): UseVoiceRecordingReturn {
  const { maxDurationSeconds = 120, onMaxDurationReached, stream: externalStream, enableLevelMeter = false } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio level metering refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);

  // Track elapsed time with accumulator for pause/resume support
  const startTimeRef = useRef<number>(0);
  const pausedTotalRef = useRef<number>(0);

  // Use promise resolver for onstop event (prevents double assignment issues)
  // Round 6 Fix #2: Allow Blob | null to match timeout fallback behavior
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  // Track if recording was canceled to prevent blob creation
  const canceledRef = useRef<boolean>(false);

  const isSupported = typeof navigator !== 'undefined' &&
                      'mediaDevices' in navigator &&
                      'getUserMedia' in navigator.mediaDevices;

  // Start audio level metering
  const startLevelMeter = useCallback((stream: MediaStream) => {
    if (!enableLevelMeter) return;

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average amplitude (0-255) and normalize to 0-100
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        const level = Math.min(100, Math.round((avg / 255) * 150)); // Boost for visibility

        setAudioLevel(level);

        levelRafRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Failed to start audio level meter:', err);
    }
  }, [enableLevelMeter]);

  // Stop audio level metering
  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const totalElapsed = pausedTotalRef.current + currentElapsed;
      setDuration(totalElapsed);

      // EXPERT FIX: Don't call stopRecording here, only signal
      // Let UI decide what to do (prevents double-stop)
      if (totalElapsed >= maxDurationSeconds) {
        if (timerRef.current) clearInterval(timerRef.current);
        onMaxDurationReached?.();
        return;
      }
    }, 250); // Tick every 250ms (reasonable balance)
  }, [maxDurationSeconds, onMaxDurationReached]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      // Accumulate elapsed time before stopping timer
      const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      pausedTotalRef.current += currentElapsed;

      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (opts?: StartRecordingOptions) => {
    try {
      setError(null);
      audioChunksRef.current = [];
      setAudioBlob(null);
      pausedTotalRef.current = 0;
      canceledRef.current = false; // Reset canceled flag

      // V2 FIX: Use provided stream to prevent double getUserMedia()
      const streamToUse = opts?.stream || externalStream;

      let stream: MediaStream;
      if (streamToUse) {
        // CRITICAL: Use provided stream, do NOT call getUserMedia
        stream = streamToUse;
      } else {
        // Fallback: Request microphone access (backwards compatible)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      streamRef.current = stream;

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      // EXPERT FIX: Set event handlers once (no reassignment)
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // EXPERT FIX: Single onstop handler with cancel check
      mediaRecorder.onstop = () => {
        // If recording was canceled, don't create blob or resolve promise
        if (canceledRef.current) {
          // Clean up stream only
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Resolve promise if waiting
        if (stopResolverRef.current) {
          stopResolverRef.current(blob);
          stopResolverRef.current = null;
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('RECORDING_FAILED');
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      setIsRecording(true);
      setDuration(0);
      startTimer();

      // Start audio level metering (if enabled)
      startLevelMeter(stream);

    } catch (err) {
      console.error('Failed to start recording:', err);
      if (err instanceof Error) {
        // Return error codes instead of messages for i18n support
        if (err.name === 'NotAllowedError') {
          setError('MICROPHONE_ACCESS_DENIED');
        } else if (err.name === 'NotFoundError') {
          setError('NO_MICROPHONE_FOUND');
        } else {
          setError('MICROPHONE_ACCESS_FAILED');
        }
      }
      setIsRecording(false);
    }
  }, [startTimer, startLevelMeter, externalStream]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      // Store resolver to be called by onstop event
      stopResolverRef.current = resolve;

      // P1 FIX: Timeout fallback in case onstop never fires
      // Prevents promise hanging indefinitely (rare but possible on some browsers)
      // Round 6 Fix #2: Properly type blob as Blob | null for type safety
      const timeoutId = setTimeout(() => {
        if (!stopResolverRef.current) return;

        console.warn('MediaRecorder onstop timeout - forcing blob creation');

        // Create blob from current chunks if available
        const mt = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob: Blob | null = audioChunksRef.current.length > 0
          ? new Blob(audioChunksRef.current, { type: mt })
          : null;

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        stopResolverRef.current(blob);
        stopResolverRef.current = null;
      }, 5000); // 5 second timeout

      // Clear timeout when onstop fires normally
      const originalResolver = stopResolverRef.current;
      stopResolverRef.current = (blob) => {
        clearTimeout(timeoutId);
        originalResolver?.(blob);
      };

      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
      stopLevelMeter();

      mediaRecorderRef.current.stop();
    });
  }, [stopTimer, stopLevelMeter]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopTimer();
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer();
    }
  }, [startTimer]);

  // EXPERT FIX: Cancel with proper flag to prevent stale blob creation
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      // Set canceled flag BEFORE stopping recorder
      // This prevents onstop handler from creating a blob
      canceledRef.current = true;

      // Cancel any pending stop resolver
      stopResolverRef.current = null;

      // Clear chunks immediately
      audioChunksRef.current = [];

      // Stop recorder (will trigger onstop, but it checks canceledRef)
      mediaRecorderRef.current.stop();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      setIsRecording(false);
      setIsPaused(false);
      setDuration(0);
      setAudioBlob(null);
      pausedTotalRef.current = 0;
      stopTimer();
      stopLevelMeter();
    }
  }, [stopTimer, stopLevelMeter]);

  // EXPERT FIX: Unmount cleanup to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    duration,
    audioLevel,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isSupported
  };
}
