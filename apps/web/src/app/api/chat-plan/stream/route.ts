/**
 * Chat Plan SSE Streaming API Route
 * Proxies Server-Sent Events streaming from Worker v2 API
 * Implements all 7 event types with proper HMAC authentication
 */

import { type ChatPlanRequest } from '@/types/chat-plan'
import { logger } from '@/utils/logger'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { NextRequest, NextResponse } from 'next/server'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com'

/**
 * Handle POST requests for SSE streaming
 */
export async function POST(req: NextRequest) {
  try {
    const payload: ChatPlanRequest = await req.json()

    // Validate required fields
    if (!payload.userId || !payload.projectId || !payload.message) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: ['userId', 'projectId', 'message']
        },
        { status: 400 }
      )
    }

    logger.info('Starting SSE stream', {
      userId: payload.userId.slice(0, 8),
      projectId: payload.projectId.slice(0, 8),
      messageLength: payload.message.length,
      locale: req.headers.get('x-sheen-locale') || 'en'
    }, 'chat-plan-stream')

    // Prepare request to worker service
    const workerPath = '/v1/chat-plan'
    const requestBody = JSON.stringify({
      userId: payload.userId,
      projectId: payload.projectId,
      message: payload.message,
      locale: req.headers.get('x-sheen-locale') || 'en',
      context: payload.context || {}
    })

    // Generate HMAC signature with CORRECT parameter order
    const headers = createWorkerAuthHeaders('POST', workerPath, requestBody, {
      'Accept': 'text/event-stream',
      'Accept-Language': req.headers.get('x-sheen-locale') || 'en-US',
      'Cache-Control': 'no-cache',
      'User-Agent': 'SheenApps-NextJS-SSE/2.0'
    })

    logger.debug('chat-plan-stream', 'Making SSE request to worker', {
      url: `${WORKER_BASE_URL}${workerPath}`,
      headers: Object.keys(headers),
      bodyLength: requestBody.length
    })

    // Make streaming request to worker
    const workerResponse = await fetch(`${WORKER_BASE_URL}${workerPath}`, {
      method: 'POST',
      headers,
      body: requestBody
    })

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text().catch(() => 'Unknown error')
      logger.error('Worker API error', {
        status: workerResponse.status,
        statusText: workerResponse.statusText,
        error: errorText
      }, 'chat-plan-stream')

      return NextResponse.json(
        {
          error: 'WORKER_API_ERROR',
          message: `Worker API returned ${workerResponse.status}: ${errorText}`,
          status: workerResponse.status
        },
        { status: workerResponse.status }
      )
    }

    // Check if response is actually SSE
    const contentType = workerResponse.headers.get('content-type')
    if (!contentType?.includes('text/event-stream')) {
      logger.warn('Worker response is not SSE', {
        contentType,
        status: workerResponse.status
      }, 'chat-plan-stream')

      // Fallback to regular JSON response
      const jsonData = await workerResponse.json()
      return NextResponse.json(jsonData, { status: workerResponse.status })
    }

    // Create SSE response stream
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        logger.info('chat-plan-stream', 'SSE stream started')

        // Set up reader for worker response
        const reader = workerResponse.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          controller.close()
          return
        }

        // Function to read and forward SSE data
        const pump = async () => {
          let isClosed = false
          
          const safeClose = () => {
            if (!isClosed) {
              isClosed = true
              controller.close()
            }
          }
          
          const safeEnqueue = (data: Uint8Array) => {
            if (!isClosed) {
              try {
                controller.enqueue(data)
              } catch (error) {
                if (error instanceof Error && error.message.includes('Controller is already closed')) {
                  isClosed = true
                } else {
                  throw error
                }
              }
            }
          }
          
          try {
            while (!isClosed) {
              const { done, value } = await reader.read()

              if (done) {
                logger.info('chat-plan-stream', 'SSE stream completed')
                safeClose()
                break
              }

              // Decode and forward the chunk
              const chunk = decoder.decode(value, { stream: true })
              const sseData = encoder.encode(chunk)

              safeEnqueue(sseData)

              // Log significant events (not every chunk to avoid spam)
              if (chunk.includes('event: complete') || chunk.includes('event: error')) {
                logger.debug('chat-plan-stream', 'SSE event forwarded', {
                  chunkLength: chunk.length,
                  hasEvent: chunk.includes('event:')
                })
              }
            }
          } catch (error) {
            if (!isClosed) {
              logger.error('SSE stream error', {
                error: error instanceof Error ? error.message : String(error)
              }, 'chat-plan-stream')

              // Send error event to client
              const errorEvent = `event: error\ndata: ${JSON.stringify({
                code: 'STREAM_ERROR',
                message: 'Stream processing failed'
              })}\n\n`

              safeEnqueue(encoder.encode(errorEvent))
              safeClose()
            }
          }
        }

        // Start pumping data
        pump()
      },

      cancel() {
        logger.info('chat-plan-stream', 'SSE stream cancelled by client')
      }
    })

    // Return SSE response
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })

  } catch (error) {
    logger.error('SSE endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'chat-plan-stream')

    // For streaming endpoint, we need to return SSE format even for errors
    const errorEvent = `event: error\ndata: ${JSON.stringify({
      code: 'ENDPOINT_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    })}\n\n`

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(errorEvent))
        controller.close()
      }
    })

    return new NextResponse(stream, {
      status: 200, // SSE always returns 200, errors are in the stream
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
    })
  }
}

/**
 * Handle GET requests - return endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/chat-plan/stream',
    description: 'Server-Sent Events streaming for real-time chat plan responses (Worker v2 API)',
    methods: ['POST'],
    contentType: 'text/event-stream',
    events: [
      'connection - Session established',
      'assistant_text - AI\'s text responses',
      'tool_use - Tool usage transparency',
      'tool_result - Tool execution results',
      'progress_update - Processing progress',
      'complete - Final response with full data',
      'error - Error events with i18n codes'
    ],
    example: {
      userId: 'user_123',
      projectId: 'proj_456',
      message: 'Create a user authentication system',
      locale: 'en-US'
    }
  })
}
