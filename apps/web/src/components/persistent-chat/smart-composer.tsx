/**
 * Smart Composer Component
 * Message input with target switching (Team/AI) and typing indicators
 */

'use client'

import { useResponsive } from '@/hooks/use-responsive'
import { cn } from '@/lib/utils'
import { MessageTarget, persistentChatClient } from '@/services/persistent-chat-client'
import { logger } from '@/utils/logger'
import { useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useRef, useState } from 'react'

interface SmartComposerProps {
  projectId: string
  onSendMessage: (text: string, target: MessageTarget, messageType: 'user' | 'assistant', buildImmediately?: boolean) => Promise<any>
  onTypingStart?: () => void
  onTypingStop?: () => void
  disabled?: boolean
  isConnected?: boolean
  isConnecting?: boolean
  className?: string
}

/**
 * Smart message composer with target switching and typing indicators
 */
export function SmartComposer({
  projectId,
  onSendMessage,
  onTypingStart,
  onTypingStop,
  disabled = false,
  isConnected = false,
  isConnecting = false,
  className
}: SmartComposerProps) {
  const { showMobileUI } = useResponsive()
  const t = useTranslations('builder.workspace.composer')
  const tConnection = useTranslations('builder.workspace.connection')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<MessageTarget>('team')
  const [isSending, setIsSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  // NEW: Build mode state (DEFAULT: true - build immediately)
  const [buildImmediately, setBuildImmediately] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const preferences = await persistentChatClient.getPreferences(projectId)
        setBuildImmediately(preferences.buildImmediately)
      } catch (error) {
        logger.warn('Failed to load chat preferences:', error)
        // Keep default true
      }
    }

    loadPreferences()
  }, [projectId])

  // Handle build mode toggle with preference saving
  const handleBuildModeToggle = useCallback(async (newValue: boolean) => {
    setBuildImmediately(newValue)

    try {
      await persistentChatClient.savePreferences(projectId, { buildImmediately: newValue })
      logger.debug('components', 'Saved build mode preference', { projectId, buildImmediately: newValue })
    } catch (error) {
      logger.error('Failed to save build mode preference:', error)
      // Still update UI optimistically - localStorage should work
    }
  }, [projectId])

  // Handle typing indicators
  const handleTypingStart = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true)
      onTypingStart?.()
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false)
      onTypingStop?.()
    }, 3000) // Stop typing indicator after 3 seconds of inactivity
  }, [isTyping, onTypingStart, onTypingStop])

  const handleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    setIsTyping(false)
    onTypingStop?.()
  }, [onTypingStop])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }
  }, [])

  // Handle message input
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setMessage(value)

    if (value.trim()) {
      handleTypingStart()
    } else {
      handleTypingStop()
    }

    adjustTextareaHeight()
  }, [handleTypingStart, handleTypingStop, adjustTextareaHeight])

  // Send message
  const handleSend = useCallback(async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isSending || disabled) return

    try {
      setIsSending(true)
      handleTypingStop()

      await onSendMessage(trimmedMessage, target, 'user', buildImmediately)

      // Clear input and reset height
      setMessage('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }, [message, isSending, disabled, target, onSendMessage, handleTypingStop, buildImmediately])

  // Handle key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Focus management
  useEffect(() => {
    if (isConnected && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isConnected])

  // Cleanup typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const canSend = message.trim() && !isSending && !disabled && isConnected
  const showConnectionStatus = !isConnected || isConnecting

  return (
    <div className={cn(
      'flex flex-col gap-3',
      // Mobile: no padding since parent container handles it
      showMobileUI ? '' : 'p-4',
      className
    )}>
      {/* Target Selector */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-secondary p-1">
          <button
            onClick={() => setTarget('team')}
            className={cn(
              'rounded-md text-sm font-medium transition-colors',
              // Expert's touch targets: ensure 44px minimum height on mobile
              showMobileUI ? 'px-3 py-2 min-h-11' : 'px-3 py-1',
              target === 'team'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-secondary-foreground hover:text-foreground hover:bg-background/50'
            )}
            disabled={disabled}
          >
            💬 {t('team')}
          </button>
          <button
            onClick={() => setTarget('ai')}
            className={cn(
              'rounded-md text-sm font-medium transition-colors',
              // Expert's touch targets: ensure 44px minimum height on mobile
              showMobileUI ? 'px-3 py-2 min-h-11' : 'px-3 py-1',
              target === 'ai'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-secondary-foreground hover:text-foreground hover:bg-background/50'
            )}
            disabled={disabled}
          >
            🤖 {t('askAi')}
          </button>
        </div>

        {/* NEW: Build Mode Toggle (only show for AI target) */}
        {target === 'ai' && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="build-immediately"
              className="text-sm font-medium text-foreground cursor-pointer"
              title={t('buildModeTooltip')}
            >
              🚀 {t('buildNow')}
            </label>
            <button
              id="build-immediately"
              role="switch"
              aria-checked={buildImmediately}
              aria-label={t('buildModeLabel', {
                mode: buildImmediately ? t('buildImmediatelyOn') : t('planModeOn')
              })}
              onClick={() => handleBuildModeToggle(!buildImmediately)}
              disabled={disabled}
              className={cn(
                'relative inline-flex items-center rounded-full transition-colors',
                showMobileUI ? 'h-8 w-14 min-h-11 min-w-14' : 'h-5 w-9', // Larger touch target on mobile
                buildImmediately
                  ? 'bg-primary'
                  : 'bg-secondary',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'inline-block rounded-full bg-white transition-transform',
                  showMobileUI ? 'h-6 w-6' : 'h-4 w-4',
                  buildImmediately
                    ? (showMobileUI ? 'translate-x-7' : 'translate-x-5')
                    : 'translate-x-1'
                )}
              />
            </button>
          </div>
        )}

        {/* Connection Status */}
        {showConnectionStatus && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isConnecting ? (
              <>
                <div className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                <span>{tConnection('connecting')}</span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-destructive" />
                <span>{tConnection('disconnected')}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              data-testid="chat-input"
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder={target === 'ai' ? t('aiPlaceholder') : t('teamPlaceholder')}
              disabled={disabled}
              // Expert's mobile keyboard improvements
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              className={cn(
                'w-full resize-none rounded-lg border border-border bg-background px-3 py-2',
                // Expert's mobile optimizations
                showMobileUI
                  ? 'min-h-11 text-base' // 16px+ prevents iOS zoom, 44px touch target
                  : 'min-h-[40px] text-sm',
                'placeholder:text-muted-foreground',
                'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border',
                disabled && 'cursor-not-allowed opacity-50'
              )}
              rows={1}
            />

            {/* Character Count (for longer messages) */}
            {message.length > 200 && (
              <div className="absolute bottom-1 right-2 text-xs text-muted-foreground">
                {message.length}/2000
              </div>
            )}
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-disabled={!canSend}
            data-testid="send-button"
            className={cn(
              'flex items-center justify-center rounded-lg transition-all duration-200',
              // Expert's touch targets: 44px minimum on mobile
              showMobileUI ? 'h-11 w-11 min-h-11 min-w-11' : 'h-10 w-10',
              canSend
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed'
            )}
            title={canSend ? t('sendButton') : t('cannotSendButton')}
          >
            {isSending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Typing Indicator */}
        {isTyping && (
          <div className="mt-1 text-xs text-muted-foreground">
            {t('youAreTyping')}
          </div>
        )}

        {/* Keyboard Shortcut Hint */}
        <div className="mt-1 text-xs text-muted-foreground">
          {t('pressEnterToSend')}
        </div>
      </div>

      {/* Enhanced Target Description with Build Mode Info */}
      <div className="text-xs text-muted-foreground">
        {target === 'ai' ? (
          <span>
            🤖 {buildImmediately
              ? t('aiBuildDescription')
              : t('aiPlanDescription')
            }
          </span>
        ) : (
          <span>
            💬 {t('teamMessageVisible')}
          </span>
        )}
      </div>
    </div>
  )
}
