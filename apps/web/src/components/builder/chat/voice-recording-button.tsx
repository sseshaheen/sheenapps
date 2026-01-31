/**
 * Voice Recording Button Component
 *
 * UI component for voice recording in the chat input.
 * Integrates with useVoiceRecording hook for recording functionality.
 *
 * Features:
 * - Microphone button to start recording
 * - Recording state shows duration timer + stop button
 * - Transcribing state shows loading spinner
 * - Auto-transcribes audio when recording stops
 * - Handles max duration auto-stop
 * - Displays errors to user via toast/alert
 *
 * Architecture (Jan 2026 - unified flow):
 * - Uses same /api/v1/transcribe endpoint as hero flow
 * - Passes projectId to differentiate source ('project' vs 'hero')
 * - Generates recordingId at recording START for idempotency
 * - Next.js handles auth + DB save, worker handles transcription + storage
 *
 * Expert fixes applied:
 * - Proper error display (not just logging)
 * - Button disabled while transcribing
 * - Calls handleStopRecording on max duration (UI decides what to do)
 */

'use client';

import { useVoiceRecording } from '@/hooks/use-voice-recording';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { FEATURES } from '@/config/features';
import { Mic, Square, Loader2, X, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface VoiceRecordingButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  projectId: string;
}

export function VoiceRecordingButton({
  onTranscription,
  disabled,
  projectId
}: VoiceRecordingButtonProps) {
  const t = useTranslations('builder.chat');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Generate recordingId at recording START for idempotency
  // Same recordingId on retry = update instead of duplicate
  const recordingIdRef = useRef<string | null>(null);

  // P0 FIX: Use ref to avoid TDZ (Temporal Dead Zone) bug
  // handleStopRecording is defined later, so we can't reference it directly in hook options
  const stopAndTranscribeRef = useRef<() => void>(() => {});

  const {
    isRecording,
    duration,
    audioLevel,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    isSupported
  } = useVoiceRecording({
    maxDurationSeconds: 120,
    enableLevelMeter: FEATURES.VOICE_LEVEL_METER,
    onMaxDurationReached: () => {
      // P0 FIX: Call via ref to avoid referencing const before initialization
      stopAndTranscribeRef.current();
    }
  });

  // P0 FIX: Use useCallback for transcribeAudio (stable reference)
  // Uses unified /api/v1/transcribe endpoint (same as hero flow)
  const transcribeAudio = useCallback(async (blob: Blob) => {
    try {
      setIsTranscribing(true);

      // Use recordingId generated at recording start for idempotency
      const recordingId = recordingIdRef.current;
      if (!recordingId) {
        throw new Error('Recording ID not set');
      }

      const formData = new FormData();
      formData.append('language', navigator.language.split('-')[0]); // e.g., 'en' from 'en-US'
      formData.append('recordingId', recordingId);
      formData.append('projectId', projectId); // source='project' when projectId present
      formData.append('audio', blob); // File LAST for multipart parsers

      // Unified endpoint - same as hero flow
      // Next.js handles auth + DB save, worker handles transcription + storage
      const response = await fetch('/api/v1/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Transcription failed');
      }

      const result = await response.json();
      onTranscription(result.text); // Unified endpoint returns 'text', not 'transcription'

      // Success feedback - calm, non-intrusive
      toast.success(t('voiceAddedToMessage'));

    } catch (err) {
      console.error('Transcription error:', err);

      // Display error via toast (not alert) - calm, non-intrusive
      const errorMessage = err instanceof Error ? err.message : t('transcriptionError');
      toast.error(errorMessage);
    } finally {
      setIsTranscribing(false);
      // Clear recordingId after transcription completes (success or failure)
      recordingIdRef.current = null;
    }
  }, [projectId, onTranscription, t]);

  // P0 FIX: Define stopAndTranscribe with useCallback (stable reference)
  const stopAndTranscribe = useCallback(async () => {
    const blob = await stopRecording();
    if (blob) {
      await transcribeAudio(blob);
    }
  }, [stopRecording, transcribeAudio]);

  // P0 FIX: Update ref when function changes
  useEffect(() => {
    stopAndTranscribeRef.current = () => { void stopAndTranscribe(); };
  }, [stopAndTranscribe]);

  // Display recording errors from the hook via toast
  // i18n: Error codes mapped to translation keys for Arabic users
  useEffect(() => {
    if (error) {
      // Map error codes to translation keys
      const errorKeyMap: Record<string, string> = {
        'MICROPHONE_ACCESS_DENIED': 'microphoneAccessDenied',
        'NO_MICROPHONE_FOUND': 'noMicrophoneFound',
        'MICROPHONE_ACCESS_FAILED': 'voiceRecordingError',
        'RECORDING_FAILED': 'voiceRecordingError'
      };

      const translationKey = errorKeyMap[error] || 'voiceRecordingError';
      const errorMessage = t(translationKey);

      // Display via toast - calm, non-intrusive
      toast.error(errorMessage);
    }
  }, [error, t]);

  const handleStartRecording = useCallback(async () => {
    // Generate recordingId at recording START (before any API call)
    // This enables idempotency: same recordingId on retry = update, not duplicate
    recordingIdRef.current = crypto.randomUUID();
    await startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(async () => {
    await stopAndTranscribe();
  }, [stopAndTranscribe]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isSupported) {
    return null; // Hide button if not supported
  }

  // Show loading state while processing (upload + transcribe)
  if (isTranscribing) {
    return (
      <div
        className="flex items-center gap-2"
        role="status"
        aria-live="polite"
      >
        <span className="text-xs text-gray-400">{t('processingAudio')}</span>
        <Button
          variant="ghost"
          size="icon"
          disabled
          aria-label={t('processingAudio')}
          className="min-h-[44px] min-w-[44px]"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </Button>
      </div>
    );
  }

  // Recording state: show timer + stop + cancel buttons
  if (isRecording) {
    // Inline discard confirmation: "Discard? ✓ ✗"
    if (showDiscardConfirm) {
      return (
        <div
          className="flex items-center gap-1.5"
          role="alertdialog"
          aria-label={t('confirmDiscard')}
        >
          <span className="text-xs text-gray-400">{t('confirmDiscard')}</span>

          {/* Confirm discard */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowDiscardConfirm(false);
              cancelRecording();
            }}
            aria-label={t('confirmYes')}
            className="min-h-[44px] min-w-[44px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <Check className="h-4 w-4" />
          </Button>

          {/* Cancel (go back to recording) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDiscardConfirm(false)}
            aria-label={t('confirmNo')}
            className="min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div
        className="flex items-center gap-1.5"
        role="status"
        aria-live="polite"
        aria-label={t('recording')}
      >
        {/* Pulsing indicator + timer */}
        <span className="relative flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-sm text-red-500 font-mono tabular-nums">
            {formatDuration(duration)}
          </span>
        </span>

        {/* Audio level meter (feature-flagged) */}
        {FEATURES.VOICE_LEVEL_METER && (
          <span className="flex items-end gap-0.5 h-4" aria-hidden="true">
            {[20, 40, 60, 80, 100].map((threshold, i) => (
              <span
                key={i}
                className={cn(
                  'w-1 rounded-sm transition-all duration-75',
                  audioLevel >= threshold ? 'bg-red-500' : 'bg-gray-600'
                )}
                style={{ height: `${40 + i * 15}%` }}
              />
            ))}
          </span>
        )}

        {/* Cancel/Discard button - shows confirmation first */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDiscardConfirm(true)}
          aria-label={t('discardRecording')}
          className="min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Stop/Submit button */}
        <Button
          variant="destructive"
          size="icon"
          onClick={handleStopRecording}
          aria-label={t('stopRecording')}
          className="min-h-[44px] min-w-[44px]"
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      </div>
    );
  }

  // Default state: show mic button
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleStartRecording}
      disabled={disabled}
      aria-label={t('startRecording')}
      className="min-h-[44px] min-w-[44px]"
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
