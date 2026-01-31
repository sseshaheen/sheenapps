/**
 * Chat Plan Message API Route
 * Handles basic (non-streaming) chat plan requests to the Worker service
 * Provides simple question/answer functionality before implementing SSE
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkerClient } from '@/server/services/worker-api-client'
import { logger } from '@/utils/logger'
import { type ChatPlanRequest, type ChatPlanResponse, type QuestionResponse } from '@/types/chat-plan'

/**
 * Handle POST requests for chat plan messages
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

    logger.info('Processing chat plan message', {
      userId: payload.userId.slice(0, 8),
      projectId: payload.projectId.slice(0, 8),
      messageLength: payload.message.length,
      locale: req.headers.get('x-sheen-locale') || 'en',
      hasContext: !!payload.context
    }, 'chat-plan')

    // Get worker client instance
    const workerClient = getWorkerClient()
    
    // Make request to worker service
    let workerResponse: any;
    try {
      workerResponse = await workerClient.postWithoutCorrelation<any>(
        '/v1/chat-plan',
        {
          userId: payload.userId,
          projectId: payload.projectId,
          message: payload.message,
          locale: req.headers.get('x-sheen-locale') || 'en',
          context: payload.context || {}
        }
      )
    } catch (workerError: any) {
      logger.error('Worker API call failed', {
        error: workerError.message,
        status: workerError.status,
        response: workerError.response
      }, 'chat-plan')
      throw workerError;
    }

    // Log the COMPLETE raw worker response for debugging
    console.log('\n=== WORKER RAW RESPONSE START ===');
    console.log(JSON.stringify(workerResponse, null, 2));
    console.log('=== WORKER RAW RESPONSE END ===\n');
    
    logger.info('Chat plan COMPLETE RAW response structure:', {
      fullResponse: JSON.stringify(workerResponse, null, 2),
      responseKeys: Object.keys(workerResponse || {}),
      dataKeys: Object.keys(workerResponse?.data || {}),
      hasData: !!workerResponse?.data,
      dataType: typeof workerResponse?.data,
      mode: workerResponse?.mode,
      sessionId: workerResponse?.sessionId
    }, 'chat-plan')
    
    // Log each potential field
    if (workerResponse?.data) {
      logger.info('Worker data field contents:', {
        dataAnswer: workerResponse.data.answer,
        dataMessage: workerResponse.data.message,
        dataResponse: workerResponse.data.response,
        dataText: workerResponse.data.text,
        dataContent: workerResponse.data.content,
        allDataFields: Object.entries(workerResponse.data).map(([k, v]) => 
          `${k}: ${typeof v === 'string' ? v.slice(0, 50) : typeof v}`
        )
      }, 'chat-plan')
    }

    // According to CHAT_API_REFERENCE.md, for question/general mode:
    // Worker now correctly returns: { answer: string, references?: ..., relatedTopics?: ... }
    
    // Handle different worker response structures
    let responseText = '';
    const extractedData = {};
    
    // Check if this is an error response
    if (workerResponse.subtype === 'error') {
      logger.error('Worker returned error response', {
        error: workerResponse.error,
        type: workerResponse.type,
        subtype: workerResponse.subtype
      }, 'chat-plan')
      responseText = `Error: ${workerResponse.error?.message || 'Unknown error occurred'}`;
    } else {
      // Worker now properly returns answer in the correct field!
      const data = workerResponse.data || {};
      
      // Extract the answer from the standard field
      responseText = data.answer || '';
      
      // Log if we still get empty answer despite tokens consumed
      if (!responseText && workerResponse.metadata?.tokens_used > 0) {
        logger.warn('Worker consumed tokens but returned empty answer', {
          tokensUsed: workerResponse.metadata.tokens_used,
          mode: workerResponse.mode,
          dataFields: Object.keys(data)
        }, 'chat-plan')
      }
    }
    
    logger.info('Chat plan response received', {
      userId: payload.userId.slice(0, 8),
      projectId: payload.projectId.slice(0, 8),
      mode: workerResponse.mode,
      sessionId: workerResponse.sessionId?.slice(0, 8),
      answer: responseText.slice(0, 50) || 'EMPTY',
      hasAnswer: !!responseText,
      answerLength: responseText.length || 0,
      dataFields: Object.keys(workerResponse.data || {}),
      tokensUsed: workerResponse.metadata?.tokens_used
    }, 'chat-plan')

    // Check if we got an empty response
    if (!responseText) {
      logger.error('Worker returned empty response!', {
        mode: workerResponse.mode,
        sessionId: workerResponse.sessionId,
        dataFields: Object.keys(workerResponse.data || {}),
        metadata: workerResponse.metadata
      }, 'chat-plan')
      
      // Log a detailed message for debugging
      logger.error('WORKER ISSUE: Empty response despite token consumption', {
        expected: '{ answer: "response text" }',
        received: JSON.stringify(workerResponse.data),
        fullWorkerResponse: JSON.stringify(workerResponse),
        allTopLevelKeys: Object.keys(workerResponse || {}),
        tokensUsed: workerResponse.metadata?.tokens_used,
        mode: workerResponse.mode
      }, 'chat-plan')
    }

    // Transform worker response to our expected format
    const transformedResponse: ChatPlanResponse = {
      mode: workerResponse.mode === 'general' ? 'question' : workerResponse.mode || 'question',
      session_id: workerResponse.sessionId,
      timestamp: workerResponse.timestamp,
      metadata: {
        duration_ms: workerResponse.metadata?.duration_ms,
        tokens_used: workerResponse.metadata?.tokens_used,
        session_id: workerResponse.sessionId
      },
      // Include the answer field
      answer: responseText || 'I apologize, but I received an empty response. Please try again.',
      // Include other fields if present
      references: workerResponse.data?.references,
      relatedTopics: workerResponse.data?.relatedTopics
    } as QuestionResponse

    // Return transformed response
    return NextResponse.json(transformedResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    // Handle different types of errors
    if (error instanceof Error) {
      logger.error('Chat plan message failed', {
        error: error.message,
        stack: error.stack
      }, 'chat-plan')

      // Check for specific worker API errors
      if (error.message.includes('402') || error.message.includes('Payment Required')) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient AI credits to process request',
            code: 402
          },
          { status: 402 }
        )
      }

      if (error.message.includes('429') || error.message.includes('Rate limit')) {
        return NextResponse.json(
          {
            error: 'RATE_LIMIT_EXCEEDED', 
            message: 'Too many requests - please wait before trying again',
            code: 429
          },
          { status: 429 }
        )
      }

      if (error.message.includes('404') || error.message.includes('Not Found')) {
        return NextResponse.json(
          {
            error: 'PROJECT_NOT_FOUND',
            message: 'Project not found or access denied',
            code: 404
          },
          { status: 404 }
        )
      }

      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        return NextResponse.json(
          {
            error: 'AUTHENTICATION_FAILED',
            message: 'Authentication failed - invalid signature',
            code: 401
          },
          { status: 401 }
        )
      }

      // Generic server error
      return NextResponse.json(
        {
          error: 'WORKER_API_ERROR',
          message: error.message,
          code: 500
        },
        { status: 500 }
      )
    }

    // Unknown error type
    logger.error('Unknown error in chat plan message', {
      error: String(error)
    }, 'chat-plan')

    return NextResponse.json(
      {
        error: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        details: String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * Handle GET requests - return endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/chat-plan/message',
    description: 'Send chat plan messages to AI for planning, Q&A, analysis, and fixes',
    methods: ['POST'],
    example: {
      userId: 'user_123',
      projectId: 'proj_456', 
      message: 'How do I add a dark mode toggle?',
      locale: 'en',
      context: {
        previousMessages: 2
      }
    }
  })
}