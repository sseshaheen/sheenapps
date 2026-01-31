'use client'

import { useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from '@/i18n/routing'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading'
import Icon from '@/components/ui/icon'
import { useChatPlan } from '@/hooks/use-chat-plan'
import { cn } from '@/lib/utils'
import { EasyModeVoiceButton } from './EasyModeVoiceButton'
import { matchCommand, executeVoiceCommand, type VoiceCommandContext } from '@/lib/voice-commands'

interface VoiceTranslations {
  start: string
  stop: string
  listening: string
  processing: string
  commandExecuted: string
  noMatch: string
}

interface EasyModeHelperTranslations {
  title: string
  placeholder: string
  close: string
  thinking: string
  errorGeneric: string
  suggestedQuestions: string
  suggestions: string[]
  voice?: VoiceTranslations
}

interface EasyModeHelperProps {
  projectId: string
  translations: EasyModeHelperTranslations
  /** Optional callbacks for voice commands that need external context */
  voiceCallbacks?: VoiceCommandContext['callbacks']
  /** Callback when open state changes (for coordinating with other floating elements) */
  onOpenChange?: (open: boolean) => void
}

export function EasyModeHelper({ projectId, translations, voiceCallbacks, onOpenChange }: EasyModeHelperProps) {
  const [open, setOpenState] = useState(false)

  // Wrap setOpen to notify parent
  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const newValue = typeof value === 'function' ? value(open) : value
    setOpenState(newValue)
    onOpenChange?.(newValue)
  }
  const [input, setInput] = useState('')
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'processing' | 'error'>('idle')
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shouldAutoScrollRef = useRef(true)

  // Track if user has scrolled up (to disable auto-scroll)
  const handleMessagesScroll = useCallback(() => {
    const el = messagesListRef.current
    if (!el) return
    // Consider "near bottom" if within 120px of bottom
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    shouldAutoScrollRef.current = nearBottom
  }, [])

  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  const {
    messages,
    isStreaming,
    currentText,
    error,
    sendMessage,
  } = useChatPlan(projectId)

  // Clear voice feedback after a delay
  useEffect(() => {
    if (voiceFeedback) {
      const timer = setTimeout(() => setVoiceFeedback(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [voiceFeedback])

  // Handle voice transcription result
  const handleTranscription = useCallback((text: string): boolean => {
    // Try to match as a command
    const match = matchCommand(text)

    if (match) {
      // Build command context with callbacks
      const context: VoiceCommandContext = {
        projectId,
        router,
        locale,
        callbacks: {
          ...voiceCallbacks,
          // Add helper-specific callbacks
          onOpenHelper: () => setOpen(true),
          onCloseHelper: () => setOpen(false)
        }
      }

      // Execute the command
      const result = executeVoiceCommand(match.action, context)

      if (result.success) {
        // Show feedback
        setVoiceFeedback(
          translations.voice?.commandExecuted?.replace('{{command}}', match.matchedPhrase) ||
          `Executed: ${match.matchedPhrase}`
        )
        return true
      }
    }

    return false
  }, [projectId, router, locale, voiceCallbacks, translations.voice])

  // Send transcribed text to chat
  const handleSendToChat = useCallback((text: string) => {
    if (!isStreaming) {
      sendMessage(text, { mode: 'question' })
      setVoiceFeedback(translations.voice?.noMatch || 'Sending to assistant...')
    }
  }, [isStreaming, sendMessage, translations.voice])

  // Auto-scroll on new messages (only if user is near bottom to avoid fighting scroll)
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentText])

  // Escape key to close
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    sendMessage(trimmed, { mode: 'question' })
    setInput('')
  }

  const handleSuggestion = (question: string) => {
    if (isStreaming) return
    sendMessage(question, { mode: 'question' })
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Floating button when closed
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 end-6 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105"
        aria-label={translations.title}
      >
        <Icon name="message-circle" className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 start-4 end-4 sm:start-auto sm:end-6 z-50 sm:w-[360px] max-h-[500px] bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon name="message-circle" className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{translations.title}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setOpen(false)}
          aria-label={translations.close}
        >
          <Icon name="x" className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <div
        ref={messagesListRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[340px]"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center py-2">
              {translations.suggestedQuestions}
            </p>
            <div className="space-y-1.5">
              {translations.suggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(q)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'text-sm rounded-lg px-3 py-2 max-w-[90%]',
              msg.type === 'user'
                ? 'bg-primary text-primary-foreground ms-auto'
                : 'bg-muted'
            )}
          >
            <div className="whitespace-pre-wrap break-words text-xs">
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="bg-muted text-sm rounded-lg px-3 py-2 max-w-[90%]">
            {currentText ? (
              <div className="whitespace-pre-wrap break-words text-xs">{currentText}</div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoadingSpinner size="sm" />
                {translations.thinking}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive text-xs rounded-lg px-3 py-2">
            {error.message || translations.errorGeneric}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Voice feedback */}
      {voiceFeedback && (
        <div className="px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground text-center border-t">
          {voiceFeedback}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={translations.placeholder}
            className="h-9 text-xs"
            disabled={isStreaming || voiceStatus === 'recording' || voiceStatus === 'processing'}
          />

          {/* Voice button - only show if translations available */}
          {translations.voice && (
            <EasyModeVoiceButton
              projectId={projectId}
              translations={translations.voice}
              disabled={isStreaming}
              onTranscription={handleTranscription}
              onSendToChat={handleSendToChat}
              onStatusChange={setVoiceStatus}
            />
          )}

          <Button
            size="sm"
            className="h-9 w-9 p-0 flex-shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || voiceStatus === 'recording'}
          >
            <Icon name="arrow-right" className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
