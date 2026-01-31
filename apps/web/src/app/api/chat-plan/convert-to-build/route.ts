/**
 * Chat Plan to Build Conversion API Route
 * Handles converting feature/fix plans into actual build processes
 * Integrates with existing build system and timeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkerClient } from '@/server/services/worker-api-client'
import { logger } from '@/utils/logger'
import { type BuildConversionRequest, type BuildConversionResponse } from '@/types/chat-plan'

/**
 * Handle POST requests for plan to build conversion
 */
export async function POST(req: NextRequest) {
  try {
    const payload: BuildConversionRequest = await req.json()
    
    // Validate required fields
    if (!payload.userId || !payload.projectId || !payload.sessionId || !payload.planData) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          required: ['userId', 'projectId', 'sessionId', 'planData']
        },
        { status: 400 }
      )
    }

    // Validate plan data can be converted
    if (!payload.planData || (payload.planData.mode !== 'feature' && payload.planData.mode !== 'fix')) {
      return NextResponse.json(
        {
          error: 'INVALID_PLAN_TYPE',
          message: 'Only feature and fix plans can be converted to builds',
          planMode: payload.planData?.mode || 'unknown'
        },
        { status: 400 }
      )
    }

    logger.info('Converting plan to build', {
      userId: payload.userId.slice(0, 8),
      projectId: payload.projectId.slice(0, 8),
      sessionId: payload.sessionId.slice(0, 8),
      planMode: payload.planData.mode,
      planSummary: payload.planData.mode === 'feature' ? payload.planData.summary : 'Bug Fix'
    }, 'chat-plan-convert')

    // Get worker client instance
    const workerClient = getWorkerClient()
    
    // Prepare conversion request - Worker API expects specific root-level structure
    const conversionPayload = {
      sessionId: payload.sessionId,  // AI session ID from planning phase (root level)
      planData: payload.planData,    // Plan data from Claude's response (root level)
      userId: payload.userId,        // User ID (root level)
      projectId: payload.projectId   // Project ID (root level)
    }

    // Make request to worker service
    const workerResponse = await workerClient.postWithoutCorrelation<BuildConversionResponse>(
      '/v1/chat-plan/convert-to-build',
      conversionPayload
    )

    logger.info('Build conversion response received', {
      userId: payload.userId.slice(0, 8),
      projectId: payload.projectId.slice(0, 8),
      success: workerResponse.success,
      buildId: workerResponse.buildId?.slice(0, 8),
      estimatedMinutes: workerResponse.estimated_minutes
    }, 'chat-plan-convert')

    // Return successful response
    return NextResponse.json(workerResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    // Handle different types of errors
    if (error instanceof Error) {
      logger.error('Build conversion failed', {
        error: error.message,
        stack: error.stack
      }, 'chat-plan-convert')

      // Check for specific worker API errors
      if (error.message.includes('402') || error.message.includes('Payment Required')) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient AI credits to start build process',
            code: 402
          },
          { status: 402 }
        )
      }

      if (error.message.includes('404') || error.message.includes('Not Found')) {
        return NextResponse.json(
          {
            error: 'PROJECT_NOT_FOUND',
            message: 'Project or session not found',
            code: 404
          },
          { status: 404 }
        )
      }

      if (error.message.includes('409') || error.message.includes('Conflict')) {
        return NextResponse.json(
          {
            error: 'BUILD_IN_PROGRESS',
            message: 'Another build is already in progress for this project',
            code: 409
          },
          { status: 409 }
        )
      }

      // Generic server error
      return NextResponse.json(
        {
          error: 'CONVERSION_FAILED',
          message: `Failed to convert plan to build: ${error.message}`,
          code: 500
        },
        { status: 500 }
      )
    }

    // Unknown error type
    logger.error('Unknown error in build conversion', {
      error: String(error)
    }, 'chat-plan-convert')

    return NextResponse.json(
      {
        error: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred during conversion',
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
    endpoint: '/api/chat-plan/convert-to-build',
    description: 'Convert feature/fix plans into actual build processes',
    methods: ['POST'],
    supportedModes: ['feature', 'fix'],
    example: {
      userId: 'user_123',
      projectId: 'proj_456',
      sessionId: 'sess_789',
      planData: {
        mode: 'feature',
        title: 'Add dark mode toggle',
        description: 'Implement system-wide dark mode...',
        steps: [
          {
            id: '1',
            title: 'Create theme context',
            description: 'Set up React context for theme state',
            files_affected: ['src/contexts/theme.tsx']
          }
        ],
        acceptance_criteria: [
          'User can toggle between light and dark themes',
          'Theme preference persists across sessions'
        ],
        estimated_time_minutes: 45,
        feasibility: 'moderate'
      }
    }
  })
}