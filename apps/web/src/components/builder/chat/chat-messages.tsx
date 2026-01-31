'use client'

/**
 * Chat Messages Component  
 * Displays the message list with typing indicators and auto-scroll
 * Phase 2.3: Extracted from BuilderChatInterface
 */

import React, { useEffect, useLayoutEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { MessageComponent } from '../message-component'
import { StreamingStatus } from './streaming-status'
import type { ProjectRecommendation } from '@/types/project-recommendations'
import type { SendMessageFunction } from '@/hooks/use-apply-recommendation'
import type { Message } from './message-types'
import { useAutoScroll } from '@/hooks/use-auto-scroll'

// Re-export message types for backward compatibility
export type {
  BaseMessage,
  UserMessage,
  AssistantMessage,
  RecommendationMessage,
  InteractiveMessage,
  CleanEventMessage,
  SystemMessage,
  Message
} from './message-types'

interface ChatMessagesProps {
  /** Array of messages to display */
  messages: Message[]
  /** Whether assistant is currently typing */
  isAssistantTyping: boolean
  /** EXPERT FIX ROUND 6: Send message function for recommendations (optional for backward compat) */
  sendMessage?: SendMessageFunction
  /** Handler for interactive message selections */
  onInteractiveSelect: (messageId: string, value: string) => void
  /** Handler for rating messages */
  onRate: (messageId: string, rating: 'positive' | 'negative') => void
  /** Handler for recommendation selections */
  onRecommendationSelect: (recommendation: ProjectRecommendation) => void
  /** Handler for converting feature plans to builds */
  onConvertToBuild?: (plan: any) => void
  /** Streaming status props */
  isStreaming?: boolean
  streamingProgress?: number
  streamingPhase?: string
  streamingProgressText?: string
  streamingTools?: string[]
  streamingStartTime?: Date
  onStreamingCancel?: () => void
  /** Optional className override for mobile layout */
  className?: string
  /** Translations for typing indicator */
  translations: {
    chat: {
      thinking: string
    }
  }
  /** Infrastructure mode for showing Easy Mode links in build completion */
  infraMode?: 'easy' | 'pro' | null
}

export function ChatMessages({
  messages,
  isAssistantTyping,
  sendMessage,
  onInteractiveSelect,
  onRate,
  onRecommendationSelect,
  onConvertToBuild,
  isStreaming = false,
  streamingProgress,
  streamingPhase,
  streamingProgressText,
  streamingTools = [],
  streamingStartTime,
  onStreamingCancel,
  className,
  translations,
  infraMode
}: ChatMessagesProps) {
  // EXPERT FIX ROUND 8: Use proper auto-scroll hook with near-bottom tracking
  // Fixes: 1) Auto-scroll failing when user was near-bottom before scrollHeight grows
  //        2) Force-scrolling when user intentionally scrolled up to read earlier messages
  const { containerRef, endRef, scrollToBottom, shouldAutoScroll } = useAutoScroll({ thresholdPx: 120 })

  // EXPERT FIX ROUND 9: Use layout effect so scroll happens after DOM updates but before paint "settles"
  // On new messages: auto-scroll only if the user was already near bottom OR we're streaming
  useLayoutEffect(() => {
    if (isStreaming || shouldAutoScroll()) {
      scrollToBottom(isStreaming ? 'instant' : 'smooth')
    }
    // Intentionally omit scrollToBottom/shouldAutoScroll from deps - they're stable callbacks from the hook
    // If a future refactor changes identity, including them would cause re-scroll loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isStreaming])

  // When typing finishes: do NOT yank the user to bottom unless they were near bottom
  useEffect(() => {
    if (isAssistantTyping) return
    if (!shouldAutoScroll()) return

    const t = setTimeout(() => scrollToBottom('smooth'), 60)
    return () => clearTimeout(t)
  }, [isAssistantTyping, scrollToBottom, shouldAutoScroll])

  return (
    <div
      ref={containerRef}
      className={className || "h-full min-h-0 overflow-y-auto overscroll-contain p-2 md:p-4 lg:p-5 space-y-2 md:space-y-4"}
    >
      <AnimatePresence>
        {messages.map((message) => (
          <MessageComponent
            key={message.id}
            message={message}
            sendMessage={sendMessage}  // EXPERT FIX ROUND 6: Thread sendMessage for recommendations
            onInteractiveSelect={onInteractiveSelect}
            onRate={onRate}
            onRecommendationSelect={onRecommendationSelect}
            onConvertToBuild={onConvertToBuild}
            infraMode={infraMode}  // Pass infrastructure mode for Easy Mode links
          />
        ))}
      </AnimatePresence>
      
      {/* Inline Streaming Status */}
      {isStreaming && (
        <div className="space-y-2 md:space-y-3">
          {/* Progress text */}
          {streamingProgressText && (
            <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400 px-2 md:px-0">
              {streamingProgressText}
            </div>
          )}
          
          {/* Active tools */}
          {streamingTools && streamingTools.length > 0 && (
            <div className="flex flex-wrap gap-1 md:gap-2">
              {streamingTools.map((tool, index) => (
                <span key={index} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                  {tool}
                </span>
              ))}
            </div>
          )}
          
          {/* Main streaming status */}
          <StreamingStatus
            isStreaming={isStreaming}
            progress={streamingProgress}
            phase={streamingPhase}
            startTime={streamingStartTime}
            onCancel={onStreamingCancel}
          />
        </div>
      )}
      
      {/* Typing Indicator */}
      {isAssistantTyping && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-2 md:gap-3 text-gray-400 px-2 md:px-0"
        >
          <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
            <Icon name="sparkles" className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" />
          </div>
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
          </div>
          <span className="text-xs md:text-sm truncate">{translations.chat.thinking}</span>
        </m.div>
      )}
      
      <div ref={endRef} />
    </div>
  )
}