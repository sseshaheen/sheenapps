/**
 * Voice Recording Modal
 *
 * ARCHITECTURE (expert-validated 2026-01-19):
 * ============================================
 *
 * Recording Flow:
 * 1. Browser → MediaRecorder captures audio
 * 2. Browser → Supabase Storage (direct upload, RLS-protected)
 * 3. Browser → /api/v1/transcribe with:
 *    - audio blob (for worker transcription)
 *    - storagePath (for database linkage)
 *    - projectId (optional - determines if saved to DB)
 * 4. API → Worker → OpenAI Whisper transcription
 * 5. API → Database save (only if projectId provided)
 * 6. Response → Modal auto-closes with transcription text
 *
 * Storage Architecture:
 * - Audio stored at: {userId}/{year}/{month}/{uuid}.{ext}
 * - Database stores storagePath, NOT signed URLs (URLs expire)
 * - Signed URLs generated on-demand when reading recordings
 * - Hero page: Storage only (no projectId = skips DB)
 * - In-project: Storage + DB save
 *
 * Live Preview (during recording):
 * - Chrome/Edge: Web Speech API (native, instant, free)
 * - Safari/Firefox: No live preview (waveform only)
 * - ALL browsers: OpenAI Whisper for final accurate transcription
 *
 * Note: Current Phase 1 sends audio twice (storage + API body).
 * Phase 2 optimization: Worker downloads from signed URL instead.
 *
 * Features:
 * - "Tap to Start" pattern (iOS AudioContext requirement)
 * - Auto-submit with Voice Activity Detection (VAD)
 * - Animated transitions with framer-motion
 * - Mic pulse ring driven by volume
 * - Live transcript with typing cursor
 * - Platform-specific error messages
 * - Mobile bottom sheet styling
 * - Idempotent stop handler (prevents race conditions)
 * - Single getUserMedia() call (no mic contention)
 */

'use client';

import { useVoiceRecording } from '@/hooks/use-voice-recording';
import { useAudioWaveform } from '@/hooks/use-audio-waveform';
import { useVoiceActivityDetection } from '@/hooks/use-voice-activity-detection';
import { useRealtimeTranscription } from '@/hooks/use-realtime-transcription';
import { useRealtimeTranscriptionProvider } from '@/hooks/use-realtime-transcription-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Mic, Square, Loader2, X, CheckCircle } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useCallback, useRef, useEffect } from 'react';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { AnimatePresence, m as motion } from '@/components/ui/motion-provider';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VoiceRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscription: (text: string) => void;
  projectId?: string; // Optional: when provided, recording is saved to database
}

export function VoiceRecordingModal({
  isOpen,
  onClose,
  onTranscription,
  projectId
}: VoiceRecordingModalProps) {
  const t = useTranslations('hero.voiceModal');
  const locale = useLocale(); // Get current page locale (ar-eg, en, etc.)

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionComplete, setTranscriptionComplete] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userHasInteracted, setUserHasInteracted] = useState(false);

  // V2 FIX: Idempotent guard to prevent double-stopping (race condition)
  const stoppingRef = useRef(false);

  // Get MediaStream from modal (single source of truth)
  const streamRef = useRef<MediaStream | null>(null);

  // Recording ID for idempotency (generated at recording START, used in storage path + DB)
  // This prevents duplicates on double-tap stop or network retry
  const recordingIdRef = useRef<string | null>(null);

  // Ref for transcribeWithWhisper to avoid circular dependency
  const transcribeWithWhisperRef = useRef<((blob: Blob, recordingId: string) => Promise<void>) | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsTranscribing(false);
      setTranscriptionComplete(false);
      setPreviewText('');
      setError(null);
      setUserHasInteracted(false);
      stoppingRef.current = false;
      recordingIdRef.current = null; // Reset for new recording session
    }
  }, [isOpen]);

  const {
    isRecording,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
    isSupported
  } = useVoiceRecording({
    maxDurationSeconds: 120,
    onMaxDurationReached: () => handleAutoSubmit()
  });

  // TIER 1: Universal visual feedback (waveform - works everywhere)
  const { currentVolume } = useAudioWaveform({
    stream: streamRef.current,
    enabled: isRecording,
    fftSize: 1024 // Lower for mobile performance
  });

  // Feature flag: Use new provider system (Web Speech + OpenAI fallback)
  const useNewProviderSystem = isFeatureEnabled('VOICE_PROVIDER_SYSTEM');

  // TIER 2 (Legacy): Text preview with Web Speech only
  const legacyTranscription = useRealtimeTranscription({
    enabled: !useNewProviderSystem && isFeatureEnabled('VOICE_REALTIME_TRANSCRIPTION') && isOpen,
    language: typeof navigator !== 'undefined' ? navigator.language : 'en',
    onInterimResult: (text) => {
      setPreviewText(prev => {
        const base = prev.replace(/\.\.\.$/,''); // Remove interim suffix
        return base + ' ' + text + '...';
      });
    },
    onFinalResult: (text) => {
      setPreviewText(prev => prev + ' ' + text);
    },
    onNotSupported: () => {
      console.log('Web Speech API not supported - using waveform feedback only');
    },
    onError: (err) => {
      console.warn('Real-time transcription error:', err);
    }
  });

  // TIER 2 (New): Text preview with Web Speech + OpenAI fallback
  const newProviderTranscription = useRealtimeTranscriptionProvider({
    enabled: useNewProviderSystem && isFeatureEnabled('VOICE_REALTIME_TRANSCRIPTION') && isOpen,
    language: locale.split('-')[0], // Use page locale (ar-eg → ar, en → en, etc.)
    // Don't use callbacks - the hook updates interimText/finalText directly
    // and the UI displays those values
    onError: (err) => {
      console.warn('Real-time transcription provider error:', err);
    }
  });

  // Use new or legacy provider based on feature flag
  const {
    interimText,
    finalText,
    isSupported: webSpeechSupported,
    start: startRealtime,
    stop: stopRealtime,
    reset: resetRealtime
  } = useNewProviderSystem ? {
    interimText: newProviderTranscription.interimText,
    finalText: newProviderTranscription.finalText,
    isSupported: newProviderTranscription.isSupported,
    start: (stream?: MediaStream) => stream && newProviderTranscription.start(stream),
    stop: () => newProviderTranscription.stop(),
    reset: () => newProviderTranscription.reset()
  } : {
    interimText: legacyTranscription.interimText,
    finalText: legacyTranscription.finalText,
    isSupported: legacyTranscription.isSupported,
    start: (stream?: MediaStream) => legacyTranscription.start(),
    stop: () => legacyTranscription.stop(),
    reset: () => legacyTranscription.reset()
  };

  // For legacy hook compatibility (isInterimChanging not in new provider yet)
  const isInterimChanging = !useNewProviderSystem && legacyTranscription.isInterimChanging;

  // Voice Activity Detection (auto-submit)
  const {
    isSpeaking,
    silenceTimer,
    hasMinSpeech,
    activeSilenceDuration, // V2 FIX: Get dynamic value for accurate countdown
    reset: resetVAD
  } = useVoiceActivityDetection({
    stream: streamRef.current,
    enabled: isFeatureEnabled('VOICE_AUTO_SUBMIT') && isRecording,
    silenceThreshold: 10,
    baseSilenceDuration: 2000,
    minSpeechDuration: 3000,
    onSilenceDetected: () => {
      // DON'T auto-submit if interim text is still changing (recognition lag)
      if (!isInterimChanging) {
        void handleAutoSubmit();
      }
    },
    onSpeechDetected: () => {
      // User started speaking again - countdown will reset automatically
    }
  });

  // Auto-submit handler
  async function handleAutoSubmit() {
    await handleStopRecording();
  }

  // Note: Removed provider completion useEffect - we now always use transcribeWithWhisper
  // for final transcription and storage. The provider (Web Speech/OpenAI) is ONLY used
  // for live preview during recording.

  // Start recording (MUST be user gesture for iOS AudioContext)
  // V2 FIX: Single getUserMedia() call - stream stored in ref, passed to hooks
  const handleStartRecording = useCallback(async () => {
    setError(null);
    setPreviewText('');
    setTranscriptionComplete(false);
    resetRealtime();
    resetVAD();

    // Generate recording ID NOW (at start) for idempotency
    // Used in storage path + DB, prevents duplicates on double-tap/retry
    recordingIdRef.current = crypto.randomUUID();

    // V2 FIX: Create stream ONCE, pass to all hooks via streamRef
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; // CRITICAL: Store stream for hooks (waveform + VAD use this)

      // V2 FIX: Pass stream to startRecording to prevent double getUserMedia()
      await startRecording({ stream }); // Hook must NOT call getUserMedia if stream provided

      // Start real-time transcription if enabled (100ms delay to avoid mic contention)
      if (isFeatureEnabled('VOICE_REALTIME_TRANSCRIPTION')) {
        setTimeout(() => {
          // New provider needs stream, legacy doesn't
          if (useNewProviderSystem) {
            startRealtime(stream);
          } else {
            startRealtime();
          }
        }, 100);
      }
    } catch (err) {
      setError('MICROPHONE_ACCESS_DENIED');
    }
  }, [startRecording, startRealtime, resetRealtime, resetVAD, webSpeechSupported, useNewProviderSystem]);

  // Stop recording (V2 FIX: Idempotent guard prevents double-call race condition)
  const handleStopRecording = useCallback(async () => {
    if (stoppingRef.current) return; // Already stopping, prevent race condition
    stoppingRef.current = true;

    try {
      // CRITICAL FIX: Always stop the transcription provider (for live preview cleanup)
      console.log('[Voice Modal] Stopping realtime transcription provider');
      stopRealtime();

      // CRITICAL FIX: Always record and upload audio (regardless of provider)
      // Web Speech API doesn't record audio - only provides live transcription
      // OpenAI provider DOES record, but we need consistency across all browsers
      console.log('[Voice Modal] Getting audio recording');
      const blob = await stopRecording();

      if (blob && recordingIdRef.current) {
        console.log('[Voice Modal] Audio blob received, size:', blob.size, 'recordingId:', recordingIdRef.current);
        // Upload to storage and transcribe (using the recordingId generated at start)
        await transcribeWithWhisperRef.current?.(blob, recordingIdRef.current);
      } else {
        console.warn('[Voice Modal] No audio blob or recordingId');
      }

      // Cleanup stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    } finally {
      stoppingRef.current = false;
    }
  }, [stopRecording, stopRealtime]);

  /**
   * Final Transcription Pipeline (Server-Auth Mode)
   *
   * 1. Send blob + recordingId to /api/v1/transcribe
   * 2. API uploads to Supabase Storage (has server credentials)
   * 3. API forwards to worker → OpenAI Whisper
   * 4. API saves to database (always - hero and project recordings)
   * 5. Returns transcription text
   *
   * Note: In server-auth mode, browser doesn't have Supabase credentials.
   * API handles storage upload to keep credentials server-side only.
   */
  const transcribeWithWhisper = useCallback(async (blob: Blob, recordingId: string) => {
    try {
      setIsTranscribing(true);

      // Send to API - it will handle storage upload + transcription
      console.log('[Voice Modal] Calling transcription API, recordingId:', recordingId);
      const formData = new FormData();
      formData.append('audio', blob);
      formData.append('language', locale.split('-')[0]); // ar-eg → ar
      formData.append('recordingId', recordingId); // For DB idempotency
      if (projectId) formData.append('projectId', projectId); // Determines source: project vs hero

      const response = await fetch('/api/v1/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Transcription failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('[Voice Modal] Transcription complete:', {
        textLength: result.text?.length,
        duration: result.duration
      });

      // Show success briefly
      setTranscriptionComplete(true);

      // Auto-close and return text
      setTimeout(() => {
        onTranscription(result.text);
        onClose();
      }, 500);

    } catch (err) {
      console.error('[Voice Modal] Transcription error:', err);
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  }, [locale, projectId, onTranscription, onClose]);

  // Update ref when callback changes
  useEffect(() => {
    transcribeWithWhisperRef.current = transcribeWithWhisper;
  }, [transcribeWithWhisper]);

  // Cancel
  const handleCancel = () => {
    cancelRecording();
    stopRealtime();
    resetVAD();

    // Cleanup stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    onClose();
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Reduced motion preference
  const prefersReducedMotion = useReducedMotion();

  // Get platform-specific error messages
  const getErrorDetails = (errorCode: string): { title: string; message: string; instructions?: string } => {
    const platform = typeof navigator !== 'undefined'
      ? /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? 'mac'
      : /Android/.test(navigator.userAgent) ? 'android'
      : 'windows'
      : 'windows';

    switch (errorCode) {
      case 'MICROPHONE_ACCESS_DENIED':
        if (platform === 'mac') {
          return {
            title: t('microphoneAccessDenied'),
            message: t('allowMicrophoneAccess'),
            instructions: 'Open System Settings → Privacy & Security → Microphone → Enable for your browser'
          };
        } else if (platform === 'android') {
          return {
            title: t('microphoneAccessDenied'),
            message: t('allowMicrophoneAccess'),
            instructions: 'Open Settings → Apps → Browser → Permissions → Microphone → Allow'
          };
        } else {
          return {
            title: t('microphoneAccessDenied'),
            message: t('allowMicrophoneAccess'),
            instructions: 'Open Settings → Privacy → Microphone → Enable for your browser'
          };
        }

      case 'NO_MICROPHONE_FOUND':
        return {
          title: t('noMicrophoneFound'),
          message: 'Please connect a microphone and try again',
          instructions: 'Make sure your microphone is properly connected and not being used by another application'
        };

      case 'Internal server error':
        return {
          title: t('internalError'),
          message: 'Our transcription service is temporarily unavailable',
          instructions: 'Please try again in a few moments'
        };

      default:
        return {
          title: 'Something went wrong',
          message: errorCode || 'An unexpected error occurred',
          instructions: t('tryAgainOrType')
        };
    }
  };

  // Step wrapper component for smooth transitions
  function Step({ children, stepKey }: { children: React.ReactNode; stepKey: string }) {
    return (
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.99 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full"
      >
        {children}
      </motion.div>
    );
  }

  // Mic pulse component with smooth CSS animation (no volume flicker)
  function MicPulse({ active }: { active: boolean }) {
    return (
      <div className="relative grid place-items-center">
        {/* Outer glow ring - smooth CSS pulse */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full bg-primary transition-opacity duration-300",
            active ? "opacity-20 animate-pulse" : "opacity-0"
          )}
          style={{ filter: 'blur(10px)' }}
        />

        {/* Main button surface */}
        <div className="relative rounded-full bg-primary/10 p-8 shadow-sm">
          <Mic className={cn(
            "h-12 w-12 text-primary transition-transform duration-300",
            active && "scale-105"
          )} />
        </div>
      </div>
    );
  }

  // Live transcript with typing cursor
  function LiveTranscript({
    finalText,
    interimText,
    providerName
  }: {
    finalText: string;
    interimText: string;
    providerName?: string;
  }) {
    const interim = interimText?.trim() ? `${interimText.trim()} ▍` : '';
    const showBadge = providerName || 'Live';

    return (
      <div className="w-full bg-muted/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {showBadge}
          </span>
        </div>

        <p className="text-sm leading-relaxed">
          <span className="text-foreground">{finalText}</span>{' '}
          <span className="text-foreground/70 italic">{interim}</span>
        </p>
      </div>
    );
  }

  // Browser not supported
  if (!isSupported) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('voiceInput')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-center text-muted-foreground">
              {t('browserNotSupported')} {t('useModernBrowser')}
            </p>
            <Button onClick={onClose}>{t('close')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-safe">
        <DialogHeader>
          <DialogTitle>{t('voiceInput')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-6 sm:py-8 px-2 sm:px-4">
          <AnimatePresence mode="wait">
            {/* Initial State - User must tap to start (iOS requirement) */}
            {!isRecording && !isTranscribing && !transcriptionComplete && !error && (
              <Step stepKey="initial">
                <div className="flex flex-col items-center gap-6">
                  <div className="rounded-full bg-primary/10 p-8">
                    <Mic className="h-12 w-12 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{t('tapToStart')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('speakYourIdea')}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setUserHasInteracted(true);
                      void handleStartRecording();
                    }}
                    size="lg"
                    className="gap-2"
                  >
                    <Mic className="h-5 w-5" />
                    {t('startRecording')}
                  </Button>
                </div>
              </Step>
            )}

            {/* Recording State - NO animation wrapper to prevent flicker from frequent updates */}
            {isRecording && !isTranscribing && !transcriptionComplete && (
              <div className="flex flex-col items-center gap-6 w-full" key="recording">
                  {/* Mic Pulse - smooth CSS animation */}
                  <MicPulse active={isRecording} />

                  {/* Text Preview with typing cursor */}
                  {isFeatureEnabled('VOICE_REALTIME_TRANSCRIPTION') && (interimText || finalText) && (
                    <LiveTranscript
                      finalText={finalText}
                      interimText={interimText}
                      providerName={useNewProviderSystem ? (webSpeechSupported ? 'Live (Web Speech)' : 'Live (OpenAI)') : undefined}
                    />
                  )}

                  {/* Status Text */}
                  <div className="text-center">
                    <div className="text-2xl font-mono font-bold tabular-nums">
                      {formatDuration(duration)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isSpeaking ? t('listening') : t('speakOrWait')}
                    </p>
                    {/* Helpful message when no real-time preview available */}
                    {isFeatureEnabled('VOICE_REALTIME_TRANSCRIPTION') && !interimText && !finalText && duration > 2 && (
                      <p className="text-xs text-muted-foreground/70 mt-2">
                        {t('transcriptWillAppearWhenStopped')}
                      </p>
                    )}
                  </div>

                  {/* Auto-submit Countdown (V2 FIX: Use dynamic silence duration) */}
                  {isFeatureEnabled('VOICE_AUTO_SUBMIT') && hasMinSpeech && !isSpeaking && silenceTimer > 0 && (
                    <div className="w-full text-center">
                      <p className="text-sm font-medium mb-2">
                        {t('autoSubmitting')} {Math.ceil((activeSilenceDuration - silenceTimer) / 1000)}s
                      </p>
                      <Progress value={(silenceTimer / activeSilenceDuration) * 100} className="w-full" />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={handleCancel} className="gap-2">
                      <X className="h-4 w-4" />
                      {t('cancel')}
                    </Button>
                    <Button onClick={() => void handleStopRecording()} className="gap-2">
                      <Square className="h-4 w-4 fill-current" />
                      {t('stopAndTranscribe')}
                    </Button>
                  </div>
                </div>
            )}

            {/* Refining State - Processing transcription */}
            {!isRecording && isTranscribing && !transcriptionComplete && !error && (
              <Step stepKey="transcribing">
                <div className="flex flex-col items-center gap-6">
                  <div className="rounded-full bg-primary/10 p-8">
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-primary">{t('refining')}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t('analyzingYourRecording')}</p>
                  </div>
                </div>
              </Step>
            )}

            {/* Success State */}
            {transcriptionComplete && (
              <Step stepKey="success">
                <div className="flex flex-col items-center gap-6">
                  <div className="rounded-full bg-green-500/10 p-8">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                  </div>
                  <p className="font-medium text-green-600">{t('complete')}</p>
                </div>
              </Step>
            )}

            {/* Error State */}
            {error && (
              <Step stepKey="error">
                <div className="flex flex-col items-center gap-6">
                  <div className="rounded-full bg-destructive/10 p-8">
                    <X className="h-12 w-12 text-destructive" />
                  </div>
                  <div className="text-center max-w-md">
                    <p className="font-medium text-destructive mb-2">
                      {getErrorDetails(error).title}
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      {getErrorDetails(error).message}
                    </p>
                    {getErrorDetails(error).instructions && (
                      <div className="bg-muted/50 rounded-lg p-3 text-start">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {getErrorDetails(error).instructions}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={onClose}>
                      {t('cancel')}
                    </Button>
                    <Button onClick={() => {
                      setError(null);
                      setUserHasInteracted(true);
                      void handleStartRecording();
                    }}>
                      {t('tryAgain')}
                    </Button>
                  </div>
                </div>
              </Step>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
