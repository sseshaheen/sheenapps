/**
 * Persistent Chat Helper Functions
 * Client-side utilities for persistent chat functionality
 */

'use client'

import { PersistentChatMessage } from '@/services/persistent-chat-client'

/**
 * Parse Accept-Language header to extract locale for backend compatibility
 */
export function parseLocale(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null
  
  const locales = acceptLanguage.split(',').map(lang => {
    const [locale] = lang.trim().split(';')
    return locale.toLowerCase()
  })
  
  // Convert to base locale for backend compatibility  
  for (const locale of locales) {
    const base = locale.split('-')[0]
    const supportedBaseLocales = ['en', 'ar', 'fr', 'es', 'de']
    if (supportedBaseLocales.includes(base)) {
      return base
    }
  }
  
  return 'en'
}

/**
 * Format message timestamp for display
 */
export function formatMessageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format date label for message grouping
 */
export function formatDateLabel(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
}

/**
 * Determine if timestamp should be shown for message
 */
export function shouldShowTimestamp(
  currentMessage: PersistentChatMessage,
  previousMessage?: PersistentChatMessage
): boolean {
  if (!previousMessage) return true

  const currentTime = new Date(currentMessage.created_at)
  const previousTime = new Date(previousMessage.created_at)
  const timeDiff = currentTime.getTime() - previousTime.getTime()

  // Show timestamp if more than 5 minutes apart or different user
  return timeDiff > 5 * 60 * 1000 || currentMessage.user_id !== previousMessage.user_id
}

/**
 * Determine if avatar should be shown for message
 */
export function shouldShowAvatar(
  currentMessage: PersistentChatMessage,
  previousMessage?: PersistentChatMessage,
  nextMessage?: PersistentChatMessage
): boolean {
  // Always show for first message or different user than previous
  if (!previousMessage || currentMessage.user_id !== previousMessage.user_id) {
    return true
  }

  // Show if next message is from different user (end of group)
  if (!nextMessage || currentMessage.user_id !== nextMessage.user_id) {
    return true
  }

  return false
}