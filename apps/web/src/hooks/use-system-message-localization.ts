/**
 * System Message Localization Hook
 * Handles localization of system messages from persistent chat backend
 * 
 * CRITICAL: Uses tolerant code/params reading pattern for backward compatibility
 */

'use client'

import { useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { PersistentChatMessage } from '@/services/persistent-chat-client'

export function useSystemMessageLocalization() {
  const locale = useLocale()
  const t = useTranslations('persistentChat')
  
  const localizeSystemMessage = useCallback((message: PersistentChatMessage) => {
    // Handle both top-level and message-level code/params (tolerant read)
    const systemData = message.response_data?.systemMessage
    if (!systemData) return message.text
    
    // Try to get code and params from system data or response_data
    const code = systemData.code ?? message.response_data?.code
    const params = systemData.params ?? message.response_data?.params ?? {}
    
    // If no code, fall back to message text
    if (!code) return message.text
    
    try {
      return t(code, params)
    } catch (error) {
      console.warn('Failed to localize system message:', { code, params, error })
      return message.text
    }
  }, [locale, t])
  
  return { localizeSystemMessage, locale }
}