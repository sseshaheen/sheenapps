/**
 * Chat Plan Client Service
 * Handles SSE streaming from Worker API using EventSourcePolyfill
 * Implements all 7 event types from the Worker API specification
 */


import type {
  ChatPlanRequest,
  // ConnectionEvent,
  // AssistantTextEvent,
  // ToolUseEvent,
  // ToolResultEvent,
  // ProgressUpdateEvent,
  // CompleteEvent,
  // ErrorEvent,
  StreamEventHandlers
} from '@/types/chat-plan'
import { logger } from '@/utils/logger'
import { EventSourcePolyfill } from 'event-source-polyfill'

export class ChatPlanClient {
  private eventSource: EventSourcePolyfill | null = null
  private abortController: AbortController | null = null
  private lastErrorCode: string | null = null

  constructor() {
    // No secrets needed - we use our secure proxy
  }

  /**
   * Start streaming chat response from Worker API
   */
  async streamChat(
    request: ChatPlanRequest,
    handlers: StreamEventHandlers
  ): Promise<void> {
    // Clean up any existing connection
    this.close()
    
    // Reset error tracking for new stream
    this.lastErrorCode = null

    try {
      logger.info('Starting SSE stream via proxy', {
        projectId: request.projectId.slice(0, 8),
        userId: request.userId.slice(0, 8),
        // locale now passed via headers
        messageLength: request.message.length
      }, 'chat-plan-client')

      // Create new EventSource with POST support - connect to our secure proxy
      // TEMP FIX: EventSourcePolyfill seems to be making GET instead of POST
      // Let's use custom fetch-based SSE for now
      this.abortController = new AbortController()

      logger.info('Making POST request to SSE endpoint with custom fetch', {
        url: '/api/chat-plan/stream',
        method: 'POST',
        requestData: {
          userId: request.userId.slice(0, 8),
          projectId: request.projectId.slice(0, 8),
          messageLength: request.message.length
        }
      }, 'chat-plan-client')

      const response = await fetch('/api/chat-plan/stream', {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json',
          'x-sheen-locale': 'en' // Default locale - can be overridden by caller
        },
        body: JSON.stringify({
          userId: request.userId,
          projectId: request.projectId,
          message: request.message,
          context: request.context
          // locale removed from body - now using x-sheen-locale header
        }),
        signal: this.abortController.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body for SSE stream')
      }

      // Process the SSE stream manually
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      const processStream = async () => {
        try {
          let buffer = ''
          let currentEventType: string | null = null

          while (true) {
            const { value, done } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmedLine = line.trim()

              if (trimmedLine.startsWith('event: ')) {
                currentEventType = trimmedLine.slice(7).trim()
                continue
              }

              if (trimmedLine.startsWith('data: ')) {
                const eventData = trimmedLine.slice(6).trim()
                if (eventData && currentEventType) {
                  try {
                    // Parse and dispatch the event with type
                    this.handleSSEEvent(currentEventType, eventData, handlers)
                    currentEventType = null // Reset after processing
                  } catch (error) {
                    logger.error('Failed to parse SSE event data', { error, eventData, eventType: currentEventType }, 'chat-plan-client')
                  }
                }
              }

              // Empty line resets event type (SSE spec)
              if (trimmedLine === '') {
                currentEventType = null
              }
            }
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            logger.error('SSE stream error', { error }, 'chat-plan-client')
            handlers.onError?.({
              code: 'STREAM_ERROR',
              params: { message: error instanceof Error ? error.message : 'Stream error' },
              recoverable: false
            })
          }
        } finally {
          reader.releaseLock()
        }
      }

      processStream()

      // Create a mock EventSource for compatibility
      this.eventSource = {
        close: () => {
          this.abortController?.abort()
        },
        readyState: 1
      } as any

      // Event handlers are now processed in handleSSEEvent method

    } catch (error) {
      logger.error('Failed to start streaming', { error }, 'chat-plan-client')
      handlers.onError?.({
        code: 'CHAT_ERROR_GENERAL',
        params: { message: error instanceof Error ? error.message : 'Unknown error' },
        recoverable: false
      })
      this.close()
    }
  }

  /**
   * Close the EventSource connection
   */
  close() {
    if (this.eventSource) {
      logger.debug('chat-plan-client', 'Closing EventSource connection')
      this.eventSource.close()
      this.eventSource = null
    }
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    // Reset error tracking
    this.lastErrorCode = null
  }


  /**
   * Handle SSE event data parsing and dispatching
   */
  private handleSSEEvent(eventType: string, eventData: string, handlers: StreamEventHandlers): void {
    try {
      const data = JSON.parse(eventData)

      logger.debug('chat-plan-client', 'Processing SSE event', {
        eventType,
        dataPreview: JSON.stringify(data).slice(0, 100)
      })

      // Dispatch based on actual event type from SSE stream
      switch (eventType) {
        case 'connection':
          handlers.onConnection?.(data)
          logger.info('Chat session established', {
            sessionId: data.sessionId?.slice(0, 8)
          }, 'chat-plan-client')
          break

        case 'assistant_text':
          // Handle both plain text and JSON responses from worker
          let processedData = data
          if (data.text && typeof data.text === 'string') {
            // Check if this is a raw JSON block that should be ignored
            if (data.text.trim().startsWith('```json')) {
              console.log('🚫 CHAT-CLIENT: Found assistant_text with raw JSON block', {
                textPreview: data.text.slice(0, 50) + '...',
                messageId: data.messageId,
                isPartial: data.isPartial,
                reason: 'Raw JSON should be handled by complete event'
              })
              
              // Instead of completely ignoring, show a placeholder message
              // This handles cases where there's only one assistant_text event with raw JSON
              processedData = {
                ...data,
                text: "✨ Creating an interactive plan for you...", // User-friendly placeholder
                structuredResponse: undefined,
                featurePlan: undefined,
                fixPlan: undefined
              }
              
              handlers.onAssistantText?.(processedData)
              break
            }

            try {
              // Try to parse as JSON first
              let jsonResponse = JSON.parse(data.text)
              
              // Handle fullResponse wrapper if present
              if (jsonResponse.fullResponse) {
                jsonResponse = jsonResponse.fullResponse
              }

              // DEBUG: Log the parsed response structure
              console.log('🔍 RESPONSE DEBUG:', {
                intent: jsonResponse.intent,
                hasResponse: !!jsonResponse.response,
                hasMessageAtRoot: !!jsonResponse.message,
                hasMessageInResponse: !!jsonResponse.response?.message,
                topLevelKeys: Object.keys(jsonResponse),
                responseKeys: jsonResponse.response ? Object.keys(jsonResponse.response) : 'none'
              })

              if (jsonResponse.response) {
                let formattedText = ''

                // Handle different response types based on intent
                if (jsonResponse.intent === 'question' && jsonResponse.response.answer) {
                  // Question responses - extract answer
                  formattedText = jsonResponse.response.answer

                } else if (jsonResponse.intent === 'general') {
                  // General responses have different structure - message in response object
                  console.log('🔍 GENERAL INTENT PROCESSING:', {
                    hasResponse: !!jsonResponse.response,
                    hasMessage: !!jsonResponse.response?.message,
                    hasAnswer: !!jsonResponse.response?.answer,
                    messageContent: jsonResponse.response?.message?.slice(0, 100) + '...'
                  })
                  
                  if (jsonResponse.response && jsonResponse.response.message) {
                    formattedText = jsonResponse.response.message
                    console.log('✅ GENERAL: Using response.message', formattedText.slice(0, 50) + '...')
                  } else if (jsonResponse.response && jsonResponse.response.answer) {
                    formattedText = jsonResponse.response.answer
                    console.log('✅ GENERAL: Using response.answer', formattedText.slice(0, 50) + '...')
                  }

                } else if (jsonResponse.intent === 'feature' && jsonResponse.response.plan) {
                  // Feature plan responses - preserve structured data for interactive UI
                  // formattedText = `✨ I've created an interactive plan for enhancing your index page with ${jsonResponse.response.plan.steps.length} steps.`
                  formattedText = `✨ Here you go...`

                } else if (jsonResponse.intent === 'fix') {
                  // Fix plan responses - preserve structured data for interactive UI
                  formattedText = `✨ Here's your fix plan...`

                } else if (jsonResponse.intent === 'analysis') {
                  // Analysis responses - format findings and recommendations (guaranteed arrays)
                  const response = jsonResponse.response
                  formattedText = `**Analysis Summary:**\n${response.summary}\n\n`

                  // Findings array is guaranteed (may be empty)
                  if (response.findings.length > 0) {
                    formattedText += `**Key Findings:**\n`
                    response.findings.forEach((finding: any) => {
                      const severityIcon = finding.severity === 'error' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵'
                      formattedText += `\n${severityIcon} **${finding.title}** (${finding.category})\n`
                      formattedText += `   ${finding.description}\n`
                      if (finding.file) {
                        formattedText += `   *File: ${finding.file}${finding.line ? `:${finding.line}` : ''}*\n`
                      }
                      if (finding.recommendation) {
                        formattedText += `   *Recommendation: ${finding.recommendation}*\n`
                      }
                    })
                  }

                  // Recommendations array is guaranteed (may be empty)
                  if (response.recommendations.length > 0) {
                    formattedText += `\n**Recommendations:**\n`
                    response.recommendations.forEach((rec: string) => {
                      formattedText += `• ${rec}\n`
                    })
                  }

                  if (response.metrics) {
                    formattedText += `\n**Metrics:**\n`
                    if (response.metrics.lines_of_code) formattedText += `• Lines of Code: ${response.metrics.lines_of_code.toLocaleString()}\n`
                    if (response.metrics.complexity_score) formattedText += `• Complexity Score: ${response.metrics.complexity_score}\n`
                    if (response.metrics.test_coverage) formattedText += `• Test Coverage: ${response.metrics.test_coverage}%\n`
                    if (response.metrics.dependencies) formattedText += `• Dependencies: ${response.metrics.dependencies}\n`
                  }

                } else if (jsonResponse.intent === 'build') {
                  // Build intent responses - guaranteed structure
                  const response = jsonResponse.response
                  formattedText = `**${response.message}**\n\n`

                  if (response.status === 'initiated' && response.buildId) {
                    formattedText += `Build Status: ${response.status}\n`
                    formattedText += `Build ID: ${response.buildId.slice(0, 8)}\n`

                    if (response.estimatedDuration) {
                      const minutes = Math.ceil(response.estimatedDuration / 60)
                      formattedText += `Estimated Duration: ${minutes} minute${minutes !== 1 ? 's' : ''}\n`
                    }
                  } else if (response.status === 'error') {
                    formattedText += '⚠️ There was an issue initiating the build. Please try again.'
                  }

                } else if (jsonResponse.response.summary || jsonResponse.response.analysis) {
                  // Generic responses with summary or analysis
                  formattedText = jsonResponse.response.summary || jsonResponse.response.analysis

                } else {
                  // Fallback - try to format the response object nicely
                  formattedText = JSON.stringify(jsonResponse.response, null, 2)
                }

                console.log('🔍 FINAL TEXT PROCESSING:', {
                  hasFormattedText: !!formattedText,
                  textLength: formattedText?.length,
                  textPreview: formattedText?.slice(0, 100) + '...'
                })

                if (formattedText) {
                  processedData = {
                    ...data,
                    text: formattedText,
                    structuredResponse: jsonResponse, // Keep original for reference
                    featurePlan: jsonResponse.intent === 'feature' ? jsonResponse.response : undefined, // Pass feature plan for UI
                    fixPlan: jsonResponse.intent === 'fix' ? jsonResponse.response : undefined // Pass fix plan for UI
                  }

                  // DEBUG: Log feature plan data extraction
                  if (jsonResponse.intent === 'feature') {
                    console.log('🔍 CHAT-CLIENT: Feature plan extracted', {
                      hasFeaturePlan: !!processedData.featurePlan,
                      stepsCount: processedData.featurePlan?.plan?.steps?.length,
                      summary: processedData.featurePlan?.summary?.slice(0, 50) + '...',
                      processedDataKeys: Object.keys(processedData)
                    })
                  }

                  // DEBUG: Log fix plan data extraction
                  if (jsonResponse.intent === 'fix') {
                    console.log('🔍 CHAT-CLIENT: Fix plan extracted', {
                      hasFixPlan: !!processedData.fixPlan,
                      issueDescription: processedData.fixPlan?.issue?.description?.slice(0, 50) + '...',
                      changesCount: processedData.fixPlan?.solution?.changes?.length,
                      processedDataKeys: Object.keys(processedData)
                    })
                  }
                }
              }
            } catch (e) {
              // Not JSON, use as-is (plain text response)
            }
          }

          handlers.onAssistantText?.(processedData)
          break

        case 'tool_use':
          logger.debug('chat-plan-client', 'Tool use', {
            toolName: data.toolName,
            toolId: data.toolId?.slice(0, 8)
          })
          handlers.onToolUse?.(data)
          break

        case 'tool_result':
          logger.debug('chat-plan-client', 'Tool result received', {
            toolUseId: data.toolUseId?.slice(0, 8),
            size: data.size
          })
          handlers.onToolResult?.(data)
          break

        case 'progress_update':
          logger.debug('chat-plan-client', 'Progress update', {
            stage: data.stage,
            message: data.message
          })
          handlers.onProgressUpdate?.(data)
          break

        case 'complete':
          logger.info('Stream completed', {
            sessionId: data.sessionId?.slice(0, 8),
            duration: data.duration,
            mode: data.fullResponse?.intent
          }, 'chat-plan-client')

          // Ensure the complete event has the proper response structure
          let processedCompleteData = data
          if (data.fullResponse && data.fullResponse.response) {
            processedCompleteData = {
              ...data,
              // Maintain compatibility with existing complete handler expectations
              fullResponse: {
                mode: data.fullResponse.intent || 'question',
                data: data.fullResponse.response
              }
            }
          }

          handlers.onComplete?.(processedCompleteData)
          this.close()
          break

        case 'error':
          // Track last error for context FIRST (before logging)
          const previousError = this.lastErrorCode
          this.lastErrorCode = data.code
          
          // Check if this is a balance-related error (either by code or message content)
          const messageText = data.params?.message || ''
          const lowerMessage = messageText.toLowerCase()
          const isBalanceRelated = 
            data.code === 'CHAT_ERROR_INSUFFICIENT_BALANCE' ||
            (data.code === 'STREAM_ERROR' && 
             (lowerMessage.includes('insufficient') || lowerMessage.includes('balance')))
          
          // Debug logging to understand why balance detection might fail
          if (data.code === 'STREAM_ERROR' && messageText) {
            logger.debug('chat-plan-client', 'Stream error analysis', {
              message: messageText,
              lowerMessage,
              hasInsufficient: lowerMessage.includes('insufficient'),
              hasBalance: lowerMessage.includes('balance'),
              isBalanceRelated
            })
          }
          
          // Enhanced logging for balance errors (INFO level - expected business condition)
          if (data.code === 'CHAT_ERROR_INSUFFICIENT_BALANCE') {
            logger.info('Insufficient balance detected', {
              code: data.code,
              recoverable: data.recoverable,
              params: data.params,
              hasRequired: data.params?.required !== undefined,
              hasAvailable: data.params?.available !== undefined,
              hasRecommendation: data.params?.recommendation !== undefined
            }, 'chat-plan-client')
          } else if (isBalanceRelated) {
            // Stream errors with balance-related messages
            logger.info('Balance-related stream error', {
              code: data.code,
              message: data.params?.message,
              recoverable: data.recoverable
            }, 'chat-plan-client')
          } else if (data.code === 'STREAM_ERROR' && previousError === 'CHAT_ERROR_INSUFFICIENT_BALANCE') {
            // Downgrade subsequent stream errors after balance errors to debug
            logger.debug('chat-plan-client', 'Expected stream error after balance error', {
              code: data.code,
              afterBalanceError: true,
              previousError
            })
          } else if (data.code === 'STREAM_ERROR') {
            // Generic stream errors are common and less severe
            logger.warn('Stream connection issue', {
              code: data.code,
              recoverable: data.recoverable,
              params: data.params
            }, 'chat-plan-client')
          } else {
            // Log other genuine errors
            logger.error('Stream error', {
              code: data.code,
              recoverable: data.recoverable,
              params: data.params
            }, 'chat-plan-client')
          }
          
          handlers.onError?.(data)
          this.close()
          break

        case 'intent_detected':
        case 'metrics':
        case 'references':
          // These events don't have specific handlers but are expected
          logger.debug('chat-plan-client', `Received ${eventType} event`, {
            intent: data.intent,
            confidence: data.confidence,
            processingTime: data.processingTime,
            cacheHit: data.cacheHit,
            files: data.files?.length
          })
          break

        default:
          logger.debug('chat-plan-client', 'Unhandled SSE event type', {
            eventType,
            data
          })
          break
      }
    } catch (error) {
      logger.error('Failed to parse SSE event JSON', {
        error,
        eventData,
        eventType
      }, 'chat-plan-client')
    }
  }

  /**
   * Check if streaming is active
   */
  isActive(): boolean {
    return this.eventSource !== null && this.eventSource.readyState !== EventSource.CLOSED
  }
}

// Export singleton factory for convenience
let clientInstance: ChatPlanClient | null = null

export function getChatPlanClient(): ChatPlanClient {
  if (!clientInstance) {
    clientInstance = new ChatPlanClient()
  }
  return clientInstance
}
