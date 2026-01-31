'use client'

/**
 * Chat Input Component
 * Handles user input, mode switching, and message submission
 * Phase 2.3: Extracted from BuilderChatInterface
 * Phase Voice: Added voice input support
 */

import React, { useRef } from 'react'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useTranslations, useLocale } from 'next-intl'
import { VoiceRecordingButton } from './voice-recording-button'
import { FEATURES } from '@/config/features'
import { getDirection } from '@/utils/rtl'

interface ChatInputProps {
  /** Current input value */
  value: string
  /** Input change handler */
  onChange: (value: string) => void
  /** Submit handler */
  onSubmit: () => void
  /** Current chat mode */
  mode: 'build' | 'plan'
  /** Mode change handler */
  onModeChange: (mode: 'build' | 'plan') => void
  /** Whether input is disabled (e.g., during build) */
  disabled?: boolean
  /** Optional className override for mobile layout */
  className?: string
  /** Project ID for voice transcription */
  projectId: string
  /** Translations for UI text */
  translations: {
    chat: {
      placeholder: string
      buildMode: string
      planMode: string
    }
  }
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  mode,
  onModeChange,
  disabled = false,
  className,
  projectId,
  translations
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const t = useTranslations('builder.workspace.chatInput')
  const locale = useLocale()
  const direction = getDirection(locale)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className={cn(
      "px-2 py-1 md:p-4 lg:p-5 border-t border-gray-800 relative",
      className
    )}>
      {/* Disabled overlay with spinner */}
      {disabled && (
        <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <Icon name="loader-2" className="w-5 h-5 text-purple-500 animate-spin" />
            <span className="text-xs text-gray-400">{t('buildInProgress')}</span>
          </div>
        </div>
      )}
      {/* Mode Toggle */}
      <div className="flex items-center gap-1 p-1 bg-gray-800 rounded-lg mb-3">
        <button
          onClick={() => onModeChange('build')}
          disabled={disabled}
          className={cn(
            "flex-1 px-3 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-md transition-colors min-h-[44px] flex items-center justify-center gap-1",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
            mode === 'build'
              ? "bg-purple-600 text-white focus:ring-purple-500"
              : "text-gray-400 hover:text-gray-300 focus:ring-purple-500"
          )}
        >
          <Icon name="zap" className="w-3 h-3 md:w-3.5 md:h-3.5" />
          <span className="hidden sm:inline">{translations.chat.buildMode}</span>
          <span className="sm:hidden">{t('build')}</span>
        </button>
        <button
          onClick={() => onModeChange('plan')}
          disabled={disabled}
          className={cn(
            "flex-1 px-3 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-md transition-colors min-h-[44px] flex items-center justify-center gap-1",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
            mode === 'plan'
              ? "bg-purple-600 text-white focus:ring-purple-500"
              : "text-gray-400 hover:text-gray-300 focus:ring-purple-500"
          )}
        >
          <Icon name="message-circle" className="w-3 h-3 md:w-3.5 md:h-3.5" />
          <span className="hidden sm:inline">{translations.chat.planMode}</span>
          <span className="sm:hidden">{t('plan')}</span>
        </button>
      </div>

      {/* Input Area */}
      <div className="flex gap-2 md:gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            dir={direction}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={mode === 'plan' ? "Let's discuss your ideas..." : translations.chat.placeholder}
            rows={2}
            inputMode="text"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck="true"
            data-testid="chat-input"
            className={cn(
              "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 md:px-4 py-2 md:py-3",
              "text-sm md:text-base text-white placeholder-gray-400",
              "focus:outline-none focus:border-purple-500 resize-none leading-relaxed",
              "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              direction === 'rtl' && "text-right"
            )}
            style={{
              minHeight: '44px',
              maxHeight: '8rem',
              WebkitAppearance: 'none',
              fontSize: '16px' // Prevents zoom on iOS
            }}
          />
        </div>

        {/* Voice Input Button (feature-flagged) */}
        {FEATURES.VOICE_INPUT && (
          <VoiceRecordingButton
            projectId={projectId}
            onTranscription={(text) => {
              // Insert at cursor position if textarea has focus/selection
              // Otherwise append to end (feels more intuitive)
              const textarea = inputRef.current;
              if (textarea && document.activeElement === textarea) {
                const start = textarea.selectionStart ?? value.length;
                const end = textarea.selectionEnd ?? value.length;
                const before = value.slice(0, start);
                const after = value.slice(end);
                const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
                const newValue = before + (needsSpace ? ' ' : '') + text + after;
                onChange(newValue);
                // Restore cursor to end of inserted text
                requestAnimationFrame(() => {
                  const newPos = start + (needsSpace ? 1 : 0) + text.length;
                  textarea.setSelectionRange(newPos, newPos);
                });
              } else {
                // Append with newline if there's existing content
                onChange(value ? `${value}\n${text}` : text);
              }
            }}
            disabled={disabled}
          />
        )}

        <button
          onClick={onSubmit}
          disabled={!value.trim() || disabled}
          data-testid="send-button"
          className={cn(
            "min-h-[44px] min-w-[44px] px-3 py-2 md:px-4 md:py-3 rounded-lg transition-all flex items-center justify-center",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
            mode === 'plan'
              ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500"
              : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 focus:ring-purple-500",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          aria-label={mode === 'plan' ? 'Send message for discussion' : 'Send message to build'}
        >
          <Icon name={mode === 'plan' ? 'message-circle' : 'send'} className="w-4 h-4 md:w-5 md:h-5 text-white" />
        </button>
      </div>
      
      <div className="mt-0 sm:mt-2 text-[11px] leading-tight text-gray-500 text-center">
        <span className="hidden sm:inline">
          {mode === 'plan' ? t('discussionMode') : t('buildMode')}
        </span>
        <span className="sm:hidden">
          {mode === 'plan' ? t('discussionModeShort') : t('buildModeShort')}
        </span>
      </div>
    </div>
  )
}