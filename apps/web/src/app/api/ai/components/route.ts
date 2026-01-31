// Internal AI API - Component Generation Endpoint
// This endpoint will eventually connect to external AI services
// For now, it serves ideal mock responses for development

import { NextRequest, NextResponse } from 'next/server'
import { MockAIService } from '@/services/ai/mock-ai-service'
import { UnifiedAIService } from '@/services/ai/unified-ai-service'
import { AIComponentRequest, AIComponentResponse } from '@/services/ai/mock-responses/types'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { logger } from '@/utils/logger';

const mockAI = new MockAIService()

export async function POST(request: NextRequest) {
  try {
    const body: AIComponentRequest = await request.json()
    
    // Validate request
    if (!body.componentType || !body.userIntent || !body.businessContext) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'INVALID_REQUEST', 
            message: 'Missing required fields: componentType, userIntent, businessContext',
            retryable: false
          } 
        }, 
        { status: 400 }
      )
    }

    logger.info('🤖 AI API: Component request received:', {
      type: body.type,
      componentType: body.componentType,
      businessType: body.businessContext.type,
      intent: body.userIntent.substring(0, 50) + '...'
    })

    let response: AIComponentResponse

    // Check if Claude Worker should be used for component generation
    const useClaudeWorker = FEATURE_FLAGS.ENABLE_CLAUDE_WORKER && 
                           FEATURE_FLAGS.CLAUDE_WORKER_AS_DEFAULT &&
                           process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL &&
                           process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET

    if (useClaudeWorker) {
      logger.info('🎯 Using Claude Worker for component generation')
      
      const unifiedAI = UnifiedAIService.getInstance()
      const aiResponse = await unifiedAI.processRequest({
        type: 'component_generation',
        content: JSON.stringify(body),
        domain: 'web_design',
        priority: 'medium',
        context: {
          componentType: body.componentType,
          style: body.style,
          requirements: body.requirements
        }
      }, {
        useTierRouting: true,
        tierOverride: 'advanced', // Force advanced tier for Claude Worker
        maxCost: 0.1
      })

      if (aiResponse.success && aiResponse.data) {
        response = {
          success: true,
          data: aiResponse.data,
          metadata: {
            model: aiResponse.metadata?.model || 'claude-worker',
            prompt: 'Component generation request',
            reasoning: 'Generated via Claude Worker',
            confidence: 85,
            processingTime: aiResponse.metadata?.responseTime || 1000,
            alternatives: [],
            tags: []
          }
        }
      } else {
        // Fallback to mock if Claude Worker fails
        logger.warn('Claude Worker failed, falling back to mock service')
        response = await mockAI.generateComponent(body)
      }
    } else {
      // Route to appropriate AI service method
      switch (body.type) {
        case 'generate':
          response = await mockAI.generateComponent(body)
          break
        case 'modify':
          response = await mockAI.modifyComponent(body)
          break
        case 'enhance':
          response = await mockAI.enhanceComponent(body)
          break
        default:
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                code: 'INVALID_ACTION', 
                message: 'Invalid action type. Must be generate, modify, or enhance.',
                retryable: false
              } 
            }, 
            { status: 400 }
          )
      }
    }

    // Add request metadata
    const enhancedResponse = {
      ...response,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      apiVersion: '1.0.0'
    }

    console.log('✅ AI API: Component response generated:', {
      success: response.success,
      componentId: response.component?.id,
      confidence: response.metadata?.confidence,
      processingTime: response.metadata?.processingTime
    })

    return NextResponse.json(enhancedResponse)

  } catch (error) {
    logger.error('❌ AI API: Component generation error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during component generation',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          retryable: true
        }
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Get AI service status and analytics
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    switch (action) {
      case 'status':
        return NextResponse.json({
          status: 'operational',
          service: 'mock-ai',
          version: '1.0.0',
          uptime: process.uptime(),
          analytics: {
            successRate: mockAI.getSuccessRate(),
            averageProcessingTime: mockAI.getAverageProcessingTime(),
            totalRequests: mockAI.getRequestHistory().length
          }
        })

      case 'history':
        return NextResponse.json({
          history: mockAI.getRequestHistory().slice(-10) // Last 10 requests
        })

      case 'responses':
        return NextResponse.json({
          availableResponses: mockAI.listMockResponses()
        })

      default:
        return NextResponse.json({
          endpoints: [
            'POST /api/ai/components - Generate/modify/enhance components',
            'GET /api/ai/components?action=status - Service status',
            'GET /api/ai/components?action=history - Request history',
            'GET /api/ai/components?action=responses - Available mock responses'
          ]
        })
    }
  } catch (error) {
    logger.error('❌ AI API: Status error:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}