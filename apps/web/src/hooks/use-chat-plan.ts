/**
 * Chat Plan Hook with SSE Streaming
 * Handles real-time streaming of AI responses using Worker v2 API
 * Implements all 7 event types with proper i18n support
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ChatPlanClient } from '@/services/chat-plan-client'
import { useAuthStore } from '@/store'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { postWithBalanceHandling } from '@/utils/api-client'
import type { 
  ChatMessage, 
  ChatPlanRequest,
  ChatPlanError,
  BuildConversionResponse,
  FeaturePlanResponse,
  FixPlanResponse
} from '@/types/chat-plan'

interface UseChatPlanOptions {
  onSuccess?: (response: any) => void
  onError?: (error: ChatPlanError) => void
  onSettled?: () => void
}

interface UseBuildConversionOptions {
  onSuccess?: (response: BuildConversionResponse) => void
  onError?: (error: ChatPlanError) => void
  onSettled?: () => void
}

/**
 * Main chat plan hook with streaming support
 * Uses EventSourcePolyfill for real-time SSE streaming
 */
export function useChatPlan(projectId: string, options: UseChatPlanOptions = {}) {
  const t = useTranslations('chat')
  const locale = useLocale()
  const user = useAuthStore(state => state.user)
  const queryClient = useQueryClient()
  const clientRef = useRef<ChatPlanClient | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentText, setCurrentText] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [progress, setProgress] = useState<string>('')
  const [sessionId, setSessionId] = useState<string>('')
  const [error, setError] = useState<ChatPlanError | null>(null)

  // Use refs to track current data to avoid closure issues
  const currentTextRef = useRef('')
  const structuredDataRef = useRef<any>(null)
  const hasBalanceErrorRef = useRef<boolean>(false)

  // Initialize client once
  useEffect(() => {
    if (!isInitialized) {
      clientRef.current = new ChatPlanClient()
      setIsInitialized(true)
    }
  }, [isInitialized])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.close()
      }
    }
  }, [])

  const sendMessage = useCallback(async (message: string, context?: any) => {
    if (!user?.id) {
      const error: ChatPlanError = {
        code: 'UNAUTHENTICATED',
        message: 'Please sign in to use chat'
      }
      setError(error)
      options.onError?.(error)
      return
    }

    if (!clientRef.current) {
      const error: ChatPlanError = {
        code: 'NOT_INITIALIZED',
        message: 'Chat service is initializing, please try again'
      }
      setError(error)
      options.onError?.(error)
      return
    }

    // Reset error state
    setError(null)
    hasBalanceErrorRef.current = false

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])

    // Start streaming
    setIsStreaming(true)
    setCurrentText('')
    currentTextRef.current = '' // Reset ref as well
    setTools([])
    setProgress('')

    logger.info('Starting chat stream', {
      projectId: projectId.slice(0, 8),
      fullProjectId: projectId, // Show full ID for debugging
      messageLength: message.length,
      locale: locale,
      userId: user.id.slice(0, 8)
    }, 'use-chat-plan')

    try {
      await clientRef.current.streamChat(
        {
          userId: user.id,
          projectId,
          message,
          // TODO: Add locale to ChatPlanRequest type
          // locale: locale,
          context
        },
        {
          onConnection: (data) => {
            setSessionId(data.sessionId)
            logger.info('Chat session established', {
              sessionId: data.sessionId.slice(0, 8)
            }, 'use-chat-plan')
          },

          onAssistantText: (data) => {
            // Update both state and ref to avoid closure issues
            const newText = currentTextRef.current + data.text
            currentTextRef.current = newText
            setCurrentText(newText)
            
            // Preserve structured data for interactive UI
            if (data.featurePlan) {
              structuredDataRef.current = { featurePlan: data.featurePlan }
              
              // DEBUG: Log feature plan preservation in hook
              console.log('🔍 HOOK: Feature plan preserved', {
                hasFeaturePlan: !!data.featurePlan,
                stepsCount: data.featurePlan?.plan?.steps?.length,
                structuredRefSet: !!structuredDataRef.current?.featurePlan
              })
            }

            // Preserve fix plan data for interactive UI
            if (data.fixPlan) {
              structuredDataRef.current = { fixPlan: data.fixPlan }
              
              // DEBUG: Log fix plan preservation in hook
              console.log('🔍 HOOK: Fix plan preserved', {
                hasFixPlan: !!data.fixPlan,
                issueDescription: data.fixPlan?.issue?.description?.slice(0, 50) + '...',
                changesCount: data.fixPlan?.solution?.changes?.length,
                structuredRefSet: !!structuredDataRef.current?.fixPlan
              })
            }
          },

          onToolUse: (data) => {
            // Translate tool usage message
            const toolMessage = t(data.description, {
              file: data.input.file_path,
              pattern: data.input.pattern,
              tool: data.toolName,
              ...data.input
            })
            setTools(prev => [...prev, toolMessage])
            
            logger.debug('use-chat-plan', 'Tool usage', {
              toolName: data.toolName,
              toolId: data.toolId.slice(0, 8)
            })
          },

          onToolResult: (data) => {
            // Optional: Could add tool result to messages if needed
            logger.debug('use-chat-plan', 'Tool result', {
              toolUseId: data.toolUseId.slice(0, 8),
              size: data.size
            })
          },

          onProgressUpdate: (data) => {
            // Translate progress message
            const progressMessage = t(data.message)
            setProgress(progressMessage)
            
            logger.debug('use-chat-plan', 'Progress', {
              stage: data.stage,
              message: data.message
            })
          },

          onComplete: (data) => {
            // Use ref value to avoid closure issues with state
            let content = currentTextRef.current
            
            // If no accumulated text, try to extract from structured response
            if (!content && data.fullResponse?.data) {
              if (typeof data.fullResponse.data === 'string') {
                content = data.fullResponse.data
              } else if (data.fullResponse.data.answer) {
                content = data.fullResponse.data.answer
              } else if (data.fullResponse.data.message) {
                content = data.fullResponse.data.message
              } else {
                // Fallback to formatted JSON
                content = JSON.stringify(data.fullResponse.data, null, 2)
              }
            }
            
            logger.debug('use-chat-plan', 'Complete event content resolution', {
              accumulatedText: currentTextRef.current.length,
              stateText: currentText.length,
              finalContent: content?.length || 0,
              hasStructuredData: !!data.fullResponse?.data
            })
            
            // Extract feature plan data from complete event if available
            let featurePlanData = structuredDataRef.current?.featurePlan
            
            // If no feature plan from streaming events, extract from complete event
            if (!featurePlanData && data.fullResponse?.mode === 'feature' && data.fullResponse?.data) {
              featurePlanData = data.fullResponse.data
              console.log('🔍 HOOK: Feature plan extracted from complete event', {
                hasFeaturePlan: !!featurePlanData,
                stepsCount: featurePlanData?.plan?.steps?.length,
                summary: featurePlanData?.summary?.slice(0, 50) + '...'
              })
            }

            // Extract fix plan data from complete event if available
            let fixPlanData = structuredDataRef.current?.fixPlan
            
            // If no fix plan from streaming events, extract from complete event
            if (!fixPlanData && data.fullResponse?.mode === 'fix' && data.fullResponse?.data) {
              fixPlanData = data.fullResponse.data
              console.log('🔍 HOOK: Fix plan extracted from complete event', {
                hasFixPlan: !!fixPlanData,
                issueDescription: fixPlanData?.issue?.description?.slice(0, 50) + '...',
                changesCount: fixPlanData?.solution?.changes?.length
              })
            }
            
            // Add assistant message with complete response
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              type: 'assistant',
              content: content || 'Response received',
              timestamp: new Date(),
              metadata: {
                mode: data.fullResponse?.mode || 'question',
                duration: data.duration,
                tools: tools.length > 0 ? tools : undefined,
                sessionId: data.sessionId,
                structuredData: data.fullResponse?.data,
                featurePlan: featurePlanData, // Use feature plan from streaming events OR complete event
                fixPlan: fixPlanData // Use fix plan from streaming events OR complete event
              }
            }
            
            // DEBUG: Log message creation with structured plan data
            console.log('🔍 HOOK: Message created', {
              messageId: assistantMessage.id,
              hasFeaturePlan: !!assistantMessage.metadata?.featurePlan,
              hasFixPlan: !!assistantMessage.metadata?.fixPlan,
              stepsCount: assistantMessage.metadata?.featurePlan?.plan?.steps?.length,
              changesCount: assistantMessage.metadata?.fixPlan?.solution?.changes?.length,
              contentLength: assistantMessage.content?.length,
              metadataKeys: Object.keys(assistantMessage.metadata || {})
            })
            
            setMessages(prev => [...prev, assistantMessage])
            setIsStreaming(false)
            setCurrentText('')
            currentTextRef.current = '' // Reset ref as well
            structuredDataRef.current = null // Reset structured data ref
            setProgress('')
            setTools([])
            
            // Invalidate queries for cache refresh
            queryClient.invalidateQueries({ queryKey: ['timeline', projectId] })
            queryClient.invalidateQueries({ queryKey: ['chat-history', projectId] })
            
            logger.info('Chat stream completed', {
              sessionId: data.sessionId.slice(0, 8),
              mode: data.fullResponse.mode,
              duration: data.duration
            }, 'use-chat-plan')
            
            options.onSuccess?.(data.fullResponse)
            options.onSettled?.()
          },

          onError: (data) => {
            // Handle balance errors specially for better UX
            if (data.code === 'CHAT_ERROR_INSUFFICIENT_BALANCE') {
              logger.info('Balance error detected, checking for balance error UI', {
                code: data.code,
                hasParams: !!data.params,
                params: data.params,
                hasRequired: data.params?.required !== undefined,
                hasAvailable: data.params?.available !== undefined
              }, 'chat-plan')
              
              // Determine which translation to use based on available parameters
              let errorMessage: string
              
              // Check if we have both required parameters for the full message
              if (data.params?.required !== undefined && data.params?.available !== undefined) {
                try {
                  errorMessage = t(data.code, {
                    required: data.params.required,
                    available: data.params.available
                  })
                } catch (translationError) {
                  logger.warn('Balance error translation with params failed, using simple version', {
                    error: translationError,
                    code: data.code,
                    params: data.params
                  }, 'chat-plan')
                  errorMessage = t('CHAT_ERROR_INSUFFICIENT_BALANCE_SIMPLE')
                }
              } else {
                // Use simple version when parameters are missing
                logger.info('Using simple balance error message due to missing parameters', {
                  code: data.code,
                  params: data.params
                }, 'chat-plan')
                errorMessage = t('CHAT_ERROR_INSUFFICIENT_BALANCE_SIMPLE')
              }
              
              // Set balance error for banner instead of chat message
              const balanceError: ChatPlanError = {
                code: data.code,
                message: errorMessage,
                details: data.params
              }
              setError(balanceError)
              
              // Mark that we've encountered a balance error
              hasBalanceErrorRef.current = true
              
              setIsStreaming(false)
              setCurrentText('')
              currentTextRef.current = ''
              setProgress('')
              setTools([])
              
              // Call onError callback so the interface can clean up typing state
              options.onError?.(balanceError)
              options.onSettled?.()
              return
            }
            
            // Skip subsequent errors if we already have a balance error
            if (hasBalanceErrorRef.current) {
              logger.debug('use-chat-plan', 'Expected error after balance error', {
                code: data.code,
                afterBalanceError: true
              })
              
              // Still clean up state but don't show error in chat
              setIsStreaming(false)
              setCurrentText('')
              currentTextRef.current = ''
              setProgress('')
              setTools([])
              options.onSettled?.()
              return
            }
            
            // Handle other errors normally
            let errorMessage: string
            try {
              errorMessage = t(data.code, data.params)
            } catch (translationError) {
              logger.warn('Error translation failed, using fallback', {
                error: translationError,
                code: data.code,
                params: data.params
              }, 'chat-plan')
              
              // Use specific fallbacks for known error types
              if (data.code === 'STREAM_ERROR') {
                errorMessage = t('CHAT_STREAM_ERROR')
              } else {
                // Fallback to generic error message
                errorMessage = t('CHAT_ERROR_GENERAL', { message: data.params?.message || 'Unknown error' })
              }
            }
            
            const errorMessageObj: ChatMessage = {
              id: `error-${Date.now()}`,
              type: 'error',
              content: errorMessage,
              timestamp: new Date()
            }
            
            setMessages(prev => [...prev, errorMessageObj])
            setIsStreaming(false)
            setCurrentText('')
            currentTextRef.current = '' // Reset ref as well
            setProgress('')
            setTools([])
            
            const error: ChatPlanError = {
              code: data.code,
              message: errorMessage
            }
            setError(error)
            
            // Log genuine errors that aren't expected
            if (data.code !== 'STREAM_ERROR') {
              logger.error('Chat stream error', {
                code: data.code,
                params: data.params,
                recoverable: data.recoverable
              }, 'use-chat-plan')
            } else {
              // Stream errors are common and less severe
              logger.warn('Stream connection issue', {
                code: data.code,
                params: data.params
              }, 'use-chat-plan')
            }
            
            options.onError?.(error)
            options.onSettled?.()
          }
        }
      )
    } catch (error) {
      logger.error('Failed to start chat stream', { error }, 'use-chat-plan')
      
      const chatError: ChatPlanError = {
        code: 'STREAM_ERROR',
        message: t('CHAT_STREAM_ERROR')
      }
      
      setError(chatError)
      setIsStreaming(false)
      setCurrentText('')
      currentTextRef.current = '' // Reset ref on error as well
      options.onError?.(chatError)
      options.onSettled?.()
    }
  }, [user?.id, projectId, locale, t, queryClient, options])

  // Abort streaming
  const abort = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close()
      setIsStreaming(false)
      setCurrentText('')
      currentTextRef.current = '' // Reset ref as well
      setProgress('')
      setTools([])
      logger.info('Chat stream aborted by user', {}, 'use-chat-plan')
    }
  }, [])

  // Reset chat
  const reset = useCallback(() => {
    setMessages([])
    setIsStreaming(false)
    setCurrentText('')
    currentTextRef.current = '' // Reset ref as well
    setTools([])
    setProgress('')
    setSessionId('')
    setError(null)
    hasBalanceErrorRef.current = false
  }, [])

  return {
    // State
    messages,
    isStreaming,
    currentText,
    tools,
    progress,
    sessionId,
    error,
    
    // Actions
    sendMessage,
    abort,
    reset,
    
    // Compatibility aliases
    isLoading: isStreaming,
    data: messages[messages.length - 1]?.metadata
  }
}

/**
 * Hook for converting chat plans to builds
 * Transforms feature/fix plans into executable build processes
 */
export function useBuildConversion(projectId: string, options: UseBuildConversionOptions = {}) {
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<ChatPlanError | null>(null)
  const [data, setData] = useState<BuildConversionResponse | null>(null)

  const convertToBuild = useCallback(async (planData: FeaturePlanResponse | FixPlanResponse) => {
    if (!user?.id) {
      const error: ChatPlanError = {
        code: 'UNAUTHENTICATED',
        message: 'User not authenticated'
      }
      setError(error)
      options.onError?.(error)
      return
    }

    setIsConverting(true)
    setError(null)

    const sessionId = planData.session_id || ''
    
    const payload = {
      sessionId,
      userId: user.id,
      projectId,
      planData
    }

    logger.info('Converting plan to build', {
      projectId: projectId.slice(0, 8),
      planMode: planData.mode,
      sessionId: sessionId.slice(0, 8)
    }, 'build-conversion')

    try {
      const response = await postWithBalanceHandling<BuildConversionResponse>(
        '/api/chat-plan/convert-to-build',
        payload
      )

      logger.info('Build conversion response', {
        projectId: projectId.slice(0, 8),
        success: response.success,
        buildId: response.buildId?.slice(0, 8)
      }, 'build-conversion')

      setData(response)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['builds', projectId] })
      
      options.onSuccess?.(response)
    } catch (error: any) {
      const chatError: ChatPlanError = {
        code: error.code || 'CONVERSION_FAILED',
        message: error.message || 'Failed to convert plan to build',
        status: error.status,
        details: error
      }
      setError(chatError)
      options.onError?.(chatError)
    } finally {
      setIsConverting(false)
      options.onSettled?.()
    }
  }, [user?.id, projectId, queryClient, options])

  const reset = useCallback(() => {
    setError(null)
    setData(null)
    setIsConverting(false)
  }, [])

  return {
    convertToBuild,
    isConverting,
    error,
    data,
    reset
  }
}

// Alias exports for easier migration
export const useChatPlanEnhanced = useChatPlan
export const useBuildConversionEnhanced = useBuildConversion