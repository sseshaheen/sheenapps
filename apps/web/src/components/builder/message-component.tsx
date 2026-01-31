'use client'

import React, { memo } from 'react'
import { m } from '@/components/ui/motion-provider'
import Icon, { type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { BuildTimeline, processEventsWithStates } from './build-timeline'
import { CompactBuildProgress } from './compact-build-progress'
import { CleanBuildProgress } from './clean-build-progress'
import { FeaturePlanResponse } from './chat/feature-plan-response'
import { FixPlanResponse } from './chat/fix-plan-response'
import type { CleanBuildEvent } from '@/types/build-events'
import type { SendMessageFunction } from '@/hooks/use-apply-recommendation'
import type { Message } from './chat/message-types'

// 📦 PERFORMANCE: Move helper functions outside component to prevent recreation on every render
// EXPERT FIX ROUND 8: Handle both Date and ISO string (server sends strings, client may use Date)
function formatTime(timestamp: string | Date): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getEmotionIcon(emotion?: string): string {
  switch (emotion) {
    case 'excited': return 'zap'
    case 'thinking': return 'brain'
    case 'celebrating': return 'sparkles'
    case 'helpful': return 'lightbulb'
    default: return 'sparkles'
  }
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'completed': return 'text-green-400 border-green-400/30 bg-green-400/10'
    case 'failed': return 'text-red-400 border-red-400/30 bg-red-400/10'
    case 'progress': return 'text-blue-400 border-blue-400/30 bg-blue-400/10'
    case 'started': return 'text-purple-400 border-purple-400/30 bg-purple-400/10'
    case 'queued': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
    default: return 'text-gray-400 border-gray-400/30 bg-gray-400/10'
  }
}

function getSystemIcon(eventCode: string, fallbackIcon?: IconName): IconName {
  if (eventCode === 'advisor_joined') return 'user-check'
  return fallbackIcon || 'info'
}

function getSystemColor(eventCode: string): string {
  if (eventCode === 'advisor_joined') return 'text-green-400 border-green-400/30 bg-green-400/10'
  return 'text-blue-400 border-blue-400/30 bg-blue-400/10'
}

interface MessageComponentProps {
  message: Message
  sendMessage?: SendMessageFunction  // EXPERT FIX ROUND 6: Critical for recommendations in chat timeline
  onInteractiveSelect?: (messageId: string, value: string) => void
  onRate?: (messageId: string, rating: 'positive' | 'negative') => void
  onRecommendationSelect?: (recommendation: any) => void
  onConvertToBuild?: (plan: any) => void
  infraMode?: 'easy' | 'pro' | null  // Infrastructure mode for showing Easy Mode links
}

// 📦 PERFORMANCE: Wrap in React.memo to prevent re-renders when props haven't changed
// This is critical for chat performance during streaming when many messages are displayed
function MessageComponentInner({
  message,
  sendMessage,
  onInteractiveSelect,
  onRate,
  onRecommendationSelect,
  onConvertToBuild,
  infraMode
}: MessageComponentProps) {

  if (message.type === 'user') {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[80%] bg-purple-600 text-white rounded-lg px-3 md:px-4 py-2 md:py-3">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs opacity-70">
              {message.mode === 'plan' ? '💭 Planning' : '⚡ Building'}
            </span>
            <span className="text-xs opacity-70">{formatTime(message.timestamp)}</span>
          </div>
        </div>
      </m.div>
    )
  }

  if (message.type === 'assistant') {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
          <Icon 
            name={getEmotionIcon(message.emotion) as IconName} 
            className="w-4 h-4 text-white" 
          />
        </div>
        <div className="flex-1 max-w-[80%]">
          <div className="bg-gray-800 text-gray-100 rounded-lg px-3 md:px-4 py-2 md:py-3">
            {message.isTyping ? (
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
                <span className="text-xs text-gray-400">Typing...</span>
              </div>
            ) : (
              <>
                {/* Feature Plan Interactive UI */}
                {message.featurePlan ? (
                  <div className="mt-2">
                    <p className="text-sm text-gray-300 mb-4">{message.content}</p>
                    <FeaturePlanResponse 
                      plan={message.featurePlan}
                      onConvertToBuild={onConvertToBuild}
                    />
                  </div>
                ) : message.fixPlan ? (
                  <div className="mt-2">
                    <p className="text-sm text-gray-300 mb-4">{message.content}</p>
                    <FixPlanResponse 
                      plan={message.fixPlan}
                      onConvertToBuild={onConvertToBuild}
                    />
                  </div>
                ) : (
                  <>
                    {/* EXPERT FIX ROUND 6: Removed render-time console.log (runs too frequently, breaks in strict mode) */}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    
                    {/* Chat Plan Mode Response Components */}
                    {message.chatPlanResponse && (
                      <div className="mt-3">
                        {/* This would render the appropriate chat plan component */}
                        <div className="text-xs text-gray-400 mb-2">
                          Chat Plan Response ({message.chatPlanResponse.mode})
                        </div>
                        {/* TODO: Add proper component rendering based on response type */}
                        <div className="bg-gray-700 rounded p-2 text-xs">
                          Mode: {message.chatPlanResponse.mode}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          
          {message.actions && message.actions.length > 0 && !message.isTyping && (
            <div className="flex flex-wrap gap-2 mt-2 md:mt-3">
              {message.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.handler}
                  className="min-h-[44px] px-3 py-2 text-xs md:text-sm bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-md transition-colors font-medium flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          
          <span className="text-xs text-gray-500 mt-1 block">{formatTime(message.timestamp)}</span>
        </div>
      </m.div>
    )
  }

  if (message.type === 'build_event') {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center"
      >
        <div className={cn(
          "border rounded-lg px-4 py-3 max-w-[90%]",
          getEventColor(message.eventType)
        )}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{message.title}</span>
            {message.progress !== undefined && (
              <span className="text-xs opacity-70">{message.progress}%</span>
            )}
          </div>
          <p className="text-xs opacity-80">{message.description}</p>
          {message.details?.estimatedTime && (
            <p className="text-xs opacity-60 mt-1">
              Estimated: {message.details.estimatedTime}
            </p>
          )}
          <span className="text-xs opacity-50 block mt-2">{formatTime(message.timestamp)}</span>
        </div>
      </m.div>
    )
  }

  if (message.type === 'recommendation') {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3"
        data-testid="recommendations-section"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center flex-shrink-0">
          <Icon name="lightbulb" className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 max-w-[80%]">
          <div className="bg-blue-900/30 border border-blue-400/30 rounded-lg px-3 md:px-4 py-2 md:py-3">
            <h4 className="font-medium text-blue-200 mb-2" data-testid="recommendations-title">{message.title}</h4>
            <ul className="space-y-1" data-testid="suggestions-list">
              {message.suggestions.map((suggestion, index) => (
                <li key={index} className="text-sm text-blue-100 flex items-start gap-2" data-testid="suggestion-item">
                  <Icon name="check" className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span data-testid="suggestion-text">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {message.rateable && onRate && (
            <div className="flex flex-col sm:flex-row gap-2 mt-2 md:mt-3">
              <button
                onClick={() => onRate(message.id, 'positive')}
                className={cn(
                  "min-h-[44px] px-3 py-2 text-xs md:text-sm rounded-md transition-colors font-medium flex items-center justify-center gap-1",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
                  message.rating === 'positive'
                    ? 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-500 focus:ring-gray-500'
                )}
              >
                <span>👍</span>
                <span className="hidden sm:inline">Helpful</span>
              </button>
              <button
                onClick={() => onRate(message.id, 'negative')}
                className={cn(
                  "min-h-[44px] px-3 py-2 text-xs md:text-sm rounded-md transition-colors font-medium flex items-center justify-center gap-1",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
                  message.rating === 'negative'
                    ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-500 focus:ring-gray-500'
                )}
              >
                <span>👎</span>
                <span className="hidden sm:inline">Not helpful</span>
              </button>
            </div>
          )}
          
          <span className="text-xs text-gray-500 mt-1 block">{formatTime(message.timestamp)}</span>
        </div>
      </m.div>
    )
  }

  if (message.type === 'interactive') {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
          <Icon name="help-circle" className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 max-w-[80%]">
          <div className="bg-gray-800 text-gray-100 rounded-lg px-3 md:px-4 py-2 md:py-3">
            <p className="text-sm mb-3">{message.question}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
              {message.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onInteractiveSelect?.(message.id, option.value)}
                  disabled={!!message.selectedValue}
                  className={cn(
                    "min-h-[44px] p-3 md:p-4 text-left text-sm md:text-base rounded-md border transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
                    message.selectedValue === option.value
                      ? 'bg-purple-600 border-purple-500 text-white focus:ring-purple-500'
                      : message.selectedValue
                      ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-not-allowed focus:ring-gray-500'
                      : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 active:bg-gray-500 focus:ring-purple-500'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {option.icon && (
                      <Icon name={option.icon} className="w-4 h-4" />
                    )}
                    {option.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-gray-500 mt-1 block">{formatTime(message.timestamp)}</span>
        </div>
      </m.div>
    )
  }

  if (message.type === 'build_event_timeline') {
    // Transform events to match CompactBuildProgress interface
    const transformedEvents = message.events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      timestamp: event.timestamp,
      duration: event.duration, // Use calculated duration from chat interface
      details: {
        category: event.details?.category,
        specificMessage: event.details?.specificMessage
      }
    }))
    
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center"
      >
        <div className="w-full">
          <CompactBuildProgress 
            events={transformedEvents}
            className="mb-2"
          />
          <span className="text-xs text-gray-500 text-center block">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </m.div>
    )
  }

  if (message.type === 'clean_build_events') {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center"
      >
        <div className="w-full">
          <CleanBuildProgress
            buildId={message.buildId}
            userId={message.userId}
            projectId={message.projectId}
            projectBuildStatus={message.projectBuildStatus}
            sendMessage={sendMessage}  // EXPERT FIX ROUND 6: Critical - enables recommendations
            infraMode={infraMode}  // Pass infrastructure mode for Easy Mode links
            className="mb-2"
          />
          {/* EXPERT FIX ROUND 11 (v9): Removed dead preview link - CleanBuildProgress handles this */}
          <span className="text-xs text-gray-500 text-center block mt-2">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </m.div>
    )
  }

  if (message.type === 'system') {
    // System messages for advisor events, workspace notifications, etc.
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center"
      >
        <div className={cn(
          "border rounded-lg px-4 py-3 max-w-[90%] flex items-center gap-3",
          getSystemColor(message.eventCode)
        )}>
          <Icon name={getSystemIcon(message.eventCode, message.icon)} className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm">{message.content}</p>
            <span className="text-xs opacity-50 block mt-1">{formatTime(message.timestamp)}</span>
          </div>
        </div>
      </m.div>
    )
  }

  return null
}

// 📦 PERFORMANCE: Export memoized component to prevent unnecessary re-renders
// During chat streaming, this prevents all existing messages from re-rendering when a new message arrives
export const MessageComponent = memo(MessageComponentInner)