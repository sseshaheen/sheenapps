'use client'

/**
 * Unified Idea Capture Input (CVA-based, aligned with codebase patterns)
 *
 * Single source of truth for idea input UI across hero and builder pages.
 * Uses class-variance-authority pattern matching Button/Card components.
 */

import { useState, useCallback, forwardRef } from 'react'
import { useLocale } from 'next-intl'
import { cva, type VariantProps } from 'class-variance-authority'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { VoiceRecordingModal } from '@/components/sections/voice-recording-modal'
import { getDirection } from '@/utils/rtl'
import { FEATURES } from '@/config/features'
import { cn } from '@/lib/utils'

// CVA variants for container styling (matches your Button pattern)
const containerVariants = cva(
  'relative', // base
  {
    variants: {
      variant: {
        hero: 'bg-black/50 rounded-lg p-3 sm:p-4 border border-white/10 min-h-[80px] sm:min-h-[100px] md:min-h-[120px]',
        page: 'bg-gray-900/50 border border-gray-700 rounded-lg p-4'
      }
    },
    defaultVariants: {
      variant: 'page'
    }
  }
)

// CVA variants for textarea styling
const textareaVariants = cva(
  'w-full bg-transparent leading-relaxed resize-none outline-none', // base
  {
    variants: {
      variant: {
        hero: 'min-h-[80px] sm:min-h-[100px] md:min-h-[120px] text-sm sm:text-base md:text-lg text-white font-mono placeholder:text-gray-500',
        page: 'min-h-[120px] text-base text-white placeholder:text-gray-400'
      }
    },
    defaultVariants: {
      variant: 'page'
    }
  }
)

export interface IdeaCaptureInputProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'>,
    VariantProps<typeof containerVariants> {
  /** Current value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Submit handler */
  onSubmit: () => void
  /** Loading state */
  isSubmitting?: boolean
  /** Submit button text */
  submitText: string
  /** Voice button text (undefined = hide button) */
  voiceText?: string
  /** Optional: Custom content below textarea (typing animation, helper text, etc.) */
  children?: React.ReactNode
  /** Optional: Voice transcription handler (if you need custom logic) */
  onVoiceTranscription?: (text: string) => void
}

export const IdeaCaptureInput = forwardRef<HTMLTextAreaElement, IdeaCaptureInputProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      isSubmitting = false,
      submitText,
      voiceText,
      variant,
      children,
      onVoiceTranscription,
      className,
      disabled,
      ...textareaProps
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false)
    const locale = useLocale()
    const direction = getDirection(locale)
    const isRTL = direction === 'rtl'

    // Voice feature flag
    const voiceEnabled = FEATURES.VOICE_INPUT && !!voiceText

    const handleVoiceClick = useCallback(() => {
      setIsVoiceModalOpen(true)
    }, [])

    const handleVoiceTranscription = useCallback(
      (transcribedText: string) => {
        if (onVoiceTranscription) {
          onVoiceTranscription(transcribedText)
        } else {
          // Default: replace value
          onChange(transcribedText)
        }
        setIsFocused(true)
      },
      [onChange, onVoiceTranscription]
    )

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // IME composition check (prevents submit during Arabic/Chinese input)
        if (e.nativeEvent.isComposing) return

        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !disabled && !isSubmitting) {
          e.preventDefault()
          onSubmit()
        }

        // Call parent handler if provided
        textareaProps.onKeyDown?.(e)
      },
      [onSubmit, disabled, isSubmitting, textareaProps]
    )

    return (
      <div className={cn('space-y-4', className)}>
        {/* Textarea Container */}
        <div dir={direction} className={containerVariants({ variant })}>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            dir={direction}
            disabled={disabled || isSubmitting}
            className={cn(
              textareaVariants({ variant }),
              isRTL && 'text-right',
              (disabled || isSubmitting) && 'opacity-50 cursor-not-allowed'
            )}
            {...textareaProps}
          />

          {/* Custom content slot (typing animation, helper text, etc.) */}
          {!value && !isFocused && children}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Submit Button */}
          <Button
            onClick={onSubmit}
            disabled={!value.trim() || disabled || isSubmitting}
            className="flex-1 h-12 text-sm sm:text-base font-medium bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {isSubmitting ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 animate-spin me-2" />
                {variant === 'hero' ? 'Building...' : 'Creating...'}
              </>
            ) : (
              <>
                {submitText}
                <Icon name="arrow-right" className="ms-2 w-4 h-4 rtl:rotate-180" />
              </>
            )}
          </Button>

          {/* Voice Button (only if enabled AND text provided) */}
          {voiceEnabled && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleVoiceClick}
              disabled={disabled || isSubmitting}
              className="h-12"
            >
              <Icon name="mic" className="w-5 h-5 me-2" />
              {voiceText}
            </Button>
          )}
        </div>

        {/* Voice Recording Modal */}
        {voiceEnabled && (
          <VoiceRecordingModal
            isOpen={isVoiceModalOpen}
            onClose={() => setIsVoiceModalOpen(false)}
            onTranscription={handleVoiceTranscription}
          />
        )}
      </div>
    )
  }
)

IdeaCaptureInput.displayName = 'IdeaCaptureInput'
