/**
 * Message Bubble Component
 * Displays individual messages with different styles for user types
 * Supports team messages, AI responses, and system events
 */

'use client'

import React from 'react'
import { PersistentChatMessage } from '@/services/persistent-chat-client'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: PersistentChatMessage
  isCurrentUser: boolean
  showTimestamp?: boolean
  showAvatar?: boolean
  className?: string
}

/**
 * Individual message bubble with participant badges and proper styling
 */
export function MessageBubble({
  message,
  isCurrentUser,
  showTimestamp = false,
  showAvatar = true,
  className
}: MessageBubbleProps) {
  const isSystem = message.message_type === 'system'
  const isAssistant = message.message_type === 'assistant'
  // EXPERT FIX: Optimistic detection via client_msg_id and lack of seq instead of seq=-1
  const isOptimistic = !message.seq && message.client_msg_id?.startsWith('client_') // Client-side optimistic message


  // Get message styling based on type and sender
  const getMessageStyle = () => {
    if (isSystem) {
      return {
        container: 'justify-center',
        bubble: 'bg-secondary text-secondary-foreground border border-border rounded-full px-3 py-1 text-sm',
        text: 'text-center'
      }
    }

    if (isAssistant) {
      return {
        container: 'justify-start',
        bubble: 'bg-primary/10 border border-primary/30 text-card-foreground rounded-2xl rounded-bl-md max-w-[80%] px-4 py-2',
        text: 'text-sm leading-relaxed'
      }
    }

    if (isCurrentUser) {
      return {
        container: 'justify-end',
        bubble: 'bg-primary text-primary-foreground rounded-2xl rounded-br-md max-w-[95%] px-4 py-2',
        text: 'text-sm leading-relaxed'
      }
    }

    return {
      container: 'justify-start',
      bubble: 'bg-secondary border border-border text-secondary-foreground rounded-2xl rounded-bl-md max-w-[80%] px-4 py-2',
      text: 'text-sm leading-relaxed'
    }
  }

  const styles = getMessageStyle()

  // Format timestamp
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Get participant badge info
  const getParticipantBadge = () => {
    if (isSystem) return null

    if (isAssistant) {
      return {
        label: 'AI Assistant',
        color: 'bg-primary/10 text-primary'
      }
    }

    if (isCurrentUser) {
      return {
        label: 'You',
        color: 'bg-primary/20 text-primary'
      }
    }

    return {
      label: 'Team Member', // In real implementation, would show actual user name
      color: 'bg-secondary text-secondary-foreground'
    }
  }

  const participantBadge = getParticipantBadge()

  return (
    <div className={cn('flex w-full', styles.container, className)}>
      <div className="flex max-w-full items-end gap-2">
        {/* Avatar - Hide for current user since it's obvious from alignment/styling */}
        {!isSystem && !isCurrentUser && (showAvatar || isAssistant) && (
          <div className="flex-shrink-0">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                isAssistant 
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary text-secondary-foreground'
              )}
            >
              {isAssistant ? 'AI' : 'T'}
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1">
          {/* Participant Badge - Show for other users (always for AI, first in group for others) */}
          {participantBadge && !isCurrentUser && (showAvatar || isAssistant) && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  participantBadge.color
                )}
              >
                {participantBadge.label}
              </span>
              
              {/* Target Badge (Team/AI) */}
              {message.target && message.target !== 'team' && (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  → {message.target.toUpperCase()}
                </span>
              )}
            </div>
          )}

          {/* Message Bubble */}
          <div className={cn(styles.bubble, isOptimistic && 'opacity-60')}>
            <div className={styles.text}>
              {/* System Message Special Formatting */}
              {isSystem ? (
                <SystemMessageContent message={message} />
              ) : (
                <span>{message.text}</span>
              )}
              
              {/* Optimistic Message Indicator */}
              {isOptimistic && (
                <span className="ml-2 text-xs opacity-70">Sending...</span>
              )}
            </div>

            {/* Message Metadata */}
            <div className="mt-1 flex items-center justify-between text-xs opacity-70">
              {showTimestamp && (
                <span>{formatTime(message.created_at)}</span>
              )}
              
              {/* Sequence Number (Debug) */}
              {/* eslint-disable-next-line no-restricted-globals */}
              {process.env.NODE_ENV === 'development' && message.seq > 0 && (
                <span className="font-mono">#{message.seq}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * System Message Content Formatter
 * Handles special formatting for system messages
 */
function SystemMessageContent({ message }: { message: PersistentChatMessage }) {
  // Parse system message data if available
  const systemData = message.response_data?.systemMessage

  if (systemData) {
    // Handle build status changes
    if (systemData.type === 'build_status_changed') {
      return (
        <span>
          Build status changed to{' '}
          <span className="font-medium">
            {systemData.status}
          </span>
        </span>
      )
    }

    // Handle presence updates
    if (systemData.type === 'user_joined') {
      return (
        <span>
          <span className="font-medium">{systemData.userName}</span> joined the chat
        </span>
      )
    }

    if (systemData.type === 'user_left') {
      return (
        <span>
          <span className="font-medium">{systemData.userName}</span> left the chat
        </span>
      )
    }
  }

  // Fallback to plain text
  return <span>{message.text}</span>
}
