'use client'

/**
 * Easy Mode Voice Button Component
 *
 * A mic button for voice input in the EasyModeHelper.
 * Uses existing voice recording and VAD hooks.
 * Handles transcription → command matching → execution or chat fallback.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useVoiceRecording } from '@/hooks/use-voice-recording'
import { useVoiceActivityDetection } from '@/hooks/use-voice-activity-detection'

interface VoiceTranslations {
  start: string
  stop: string
  listening: string
  processing: string
  commandExecuted: string
  noMatch: string
}

interface EasyModeVoiceButtonProps {
  projectId: string
  translations: VoiceTranslations
  disabled?: boolean
  /**
   * Called when transcription completes.
   * @param text - The transcribed text
   * @returns true if a command was executed, false to send to chat
   */
  onTranscription: (text: string) => boolean
  /**
   * Called when transcription should go to chat input
   */
  onSendToChat: (text: string) => void
  /**
   * Status callback for parent component
   */
  onStatusChange?: (status: 'idle' | 'recording' | 'processing' | 'error') => void
}

export function EasyModeVoiceButton({
  projectId,
  translations,
  disabled,
  onTranscription,
  onSendToChat,
  onStatusChange
}: EasyModeVoiceButtonProps) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Voice recording hook with level meter for visual feedback
  const {
    isRecording,
    audioLevel,
    audioBlob,
    error: recordingError,
    startRecording,
    stopRecording,
    cancelRecording,
    isSupported
  } = useVoiceRecording({
    maxDurationSeconds: 60,
    enableLevelMeter: true,
    onMaxDurationReached: () => {
      // Auto-stop when max duration reached
      handleStopRecording()
    }
  })

  // Voice activity detection for auto-stop
  const { isSpeaking, silenceTimer, hasMinSpeech, activeSilenceDuration, reset: resetVAD } = useVoiceActivityDetection({
    stream: streamRef.current,
    enabled: isRecording,
    minSpeechDuration: 1000, // 1 second min speech for commands
    baseSilenceDuration: 1500, // 1.5 second silence to auto-stop
    onSilenceDetected: () => {
      // Auto-stop when user stops speaking
      if (isRecording && hasMinSpeech) {
        handleStopRecording()
      }
    }
  })

  // Update parent about status changes
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // Handle recording errors
  useEffect(() => {
    if (recordingError) {
      setStatus('error')
      setError(recordingError)
    }
  }, [recordingError])

  const handleStartRecording = useCallback(async () => {
    setError(null)
    setStatus('recording')

    try {
      // Get microphone access first to pass stream to both hooks
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream

      // Start recording with the stream
      await startRecording({ stream })
    } catch (err) {
      console.error('[VoiceButton] Failed to start recording:', err)
      // Clean up stream to avoid leaving mic "hot" on failure
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setStatus('error')
      setError('MICROPHONE_ACCESS_FAILED')
    }
  }, [startRecording])

  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return

    setStatus('processing')

    try {
      const blob = await stopRecording()
      resetVAD()

      if (!blob || blob.size === 0) {
        setStatus('idle')
        return
      }

      // Transcribe the audio
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('language', 'ar') // Arabic by default for commands
      formData.append('recordingId', crypto.randomUUID())
      formData.append('projectId', projectId)

      const response = await fetch('/api/v1/transcribe', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`)
      }

      const result = await response.json()
      const text = result.text?.trim()

      if (!text) {
        setStatus('idle')
        return
      }

      // Try to match as command
      const wasCommand = onTranscription(text)

      if (!wasCommand) {
        // Send to chat if not a command
        onSendToChat(text)
      }

      setStatus('idle')
    } catch (err) {
      console.error('[VoiceButton] Transcription error:', err)
      setStatus('error')
      setError('TRANSCRIPTION_FAILED')
      setTimeout(() => setStatus('idle'), 2000)
    } finally {
      // Clean up stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [isRecording, stopRecording, resetVAD, projectId, onTranscription, onSendToChat])

  const handleCancel = useCallback(() => {
    cancelRecording()
    resetVAD()
    setStatus('idle')
    setError(null)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [cancelRecording, resetVAD])

  // Toggle recording on click
  const handleClick = useCallback(() => {
    if (status === 'recording') {
      handleStopRecording()
    } else if (status === 'idle') {
      handleStartRecording()
    }
    // Ignore clicks during processing
  }, [status, handleStartRecording, handleStopRecording])

  // Not supported
  if (!isSupported) {
    return null
  }

  const isDisabled = disabled || status === 'processing'
  const showRecording = status === 'recording'
  const showProcessing = status === 'processing'

  // Calculate audio level bar height (0-100 -> 0-24px)
  const levelHeight = Math.max(4, Math.round((audioLevel / 100) * 24))

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant={showRecording ? 'destructive' : 'outline'}
        className={cn(
          'h-9 w-9 p-0 flex-shrink-0 relative overflow-hidden transition-all',
          showRecording && 'animate-pulse'
        )}
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={showRecording ? translations.stop : translations.start}
      >
        {showProcessing ? (
          <LoadingSpinner size="sm" />
        ) : showRecording ? (
          <>
            {/* Audio level indicator */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-white/30 transition-all duration-100"
              style={{ height: `${levelHeight}px` }}
            />
            <Icon name="mic-off" className="w-4 h-4 relative z-10" />
          </>
        ) : (
          <Icon name="mic" className="w-4 h-4" />
        )}
      </Button>

      {/* Recording status tooltip */}
      {showRecording && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] px-2 py-0.5 rounded bg-destructive text-destructive-foreground">
            {isSpeaking ? translations.listening : `${Math.ceil((activeSilenceDuration - silenceTimer) / 1000)}s`}
          </span>
        </div>
      )}

      {/* Processing status */}
      {showProcessing && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {translations.processing}
          </span>
        </div>
      )}
    </div>
  )
}
