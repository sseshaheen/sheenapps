// Internal AI API - Content Generation Endpoint
// Enhanced with AI tier routing for cost optimization and intelligent provider selection
// Maintains backward compatibility while adding tier-aware processing

import { NextRequest, NextResponse } from 'next/server'
import { MockAIService } from '@/services/ai/mock-ai-service'
import { UnifiedAIService } from '@/services/ai/unified-ai-service'
import { tierMonitor } from '@/services/ai/tier-monitoring'
import { AIContentRequest, AIContentResponse } from '@/services/ai/mock-responses/types'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger';

const mockAI = new MockAIService()

// 🛡️ Protect this API route with authentication and rate limiting
async function handleContentGeneration(request: NextRequest, { user }: { user: any }) {
  try {
    const body: AIContentRequest = await request.json()
    
    // Validate request
    if (!body.type || !body.section || !body.businessContext || !body.tone) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'INVALID_REQUEST', 
            message: 'Missing required fields: type, section, businessContext, tone',
            retryable: false
          } 
        }, 
        { status: 400 }
      )
    }

    logger.info('🤖 AI API: Content request received:', {
      type: body.type,
      section: body.section,
      tone: body.tone,
      businessType: body.businessContext.type,
      businessName: body.businessContext.name ? '[REDACTED]' : 'none',
      length: body.length,
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous',
      hasUser: !!user?.id
    })

    // Determine if we should use tier routing
    const useTierRouting = process.env.AI_TIER_ROUTING_ENABLED === 'true'
    
    // Check if this is a web design request and Claude Worker is available  
    const isWebDesignRequest = body.section === 'design' || body.componentType !== undefined
    const useClaudeWorker = isWebDesignRequest &&
                           process.env.NEXT_PUBLIC_ENABLE_CLAUDE_WORKER !== 'false' &&
                           process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL &&
                           process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET
    
    let response: AIContentResponse

    if (useTierRouting) {
      logger.info('🎯 Using tier routing for content generation')
      
      // Lazy-load the service to avoid build-time API key requirements
      const unifiedAI = UnifiedAIService.getInstance()
      
      // Use unified AI service with tier routing
      const tierResponse = await unifiedAI.generateContent(body, {
        useTierRouting: true,
        maxCost: 0.03, // Reasonable limit for content generation
        enableFallback: true
      })

      // Convert unified response to expected format
      if (tierResponse.success) {
        response = {
          success: true,
          content: tierResponse.data,
          metadata: {
            readabilityScore: 0.8, // Default for tier routing
            seoScore: 0.75, // Default for tier routing
            emotionalTone: 'professional',
            keywords: ['professional', 'quality'],
            readingTime: '30 seconds',
            targetAudience: ['professionals']
          }
        }
        // Add tier info as a separate property
        ;(response as any).tierInfo = (tierResponse.metadata as any).tierRouting
      } else {
        throw new Error(tierResponse.error?.message || 'Tier routing failed')
      }
    } else {
      logger.info('🔄 Using legacy mock AI service')
      
      // Fallback to existing mock service
      response = await mockAI.generateContent(body)
    }

    // Add request metadata
    const enhancedResponse = {
      ...response,
      requestId: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      apiVersion: '1.0.0'
    }

    console.log('✅ AI API: Content response generated:', {
      success: response.success,
      contentLength: response.content?.primary?.length,
      readabilityScore: response.metadata?.readabilityScore,
      seoScore: response.metadata?.seoScore,
      alternatives: response.content?.alternatives?.length,
      tierUsed: (response as any).tierInfo?.finalTier || 'legacy',
      userId: user?.id || 'anonymous'
    })

    // Record tier usage metrics
    if (useTierRouting && (response as any).tierInfo) {
      const tierInfo = (response as any).tierInfo
      tierMonitor.recordUsage({
        tier: tierInfo.finalTier,
        provider: tierInfo.finalProvider,
        requestType: 'content_generation',
        cost: tierInfo.totalCost || 0,
        responseTime: (enhancedResponse.metadata as any)?.processingTime || 0,
        success: response.success,
        endpoint: '/api/ai/content'
      })
    }

    return NextResponse.json(enhancedResponse)

  } catch (error) {
    logger.error('❌ AI API: Content generation error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during content generation',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          retryable: true
        }
      },
      { status: 500 }
    )
  }
}

// 🛡️ Export the protected POST route with authentication
export const POST = authPresets.authenticated(handleContentGeneration)

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    switch (action) {
      case 'status':
        const unifiedAI = UnifiedAIService.getInstance()
        const healthInfo = await unifiedAI.getServiceHealth()
        return NextResponse.json({
          status: 'operational',
          service: 'ai-content-enhanced',
          version: '2.0.0',
          tierRouting: {
            enabled: healthInfo.tierRoutingEnabled,
            availableProviders: healthInfo.availableProviders,
            cacheSize: healthInfo.cacheSize
          },
          supportedTypes: ['copy', 'headlines', 'descriptions', 'cta', 'testimonials'],
          supportedTones: ['professional', 'friendly', 'luxury', 'casual', 'energetic'],
          supportedLengths: ['short', 'medium', 'long']
        })

      case 'analytics':
        return NextResponse.json({
          analytics: {
            successRate: mockAI.getSuccessRate(),
            averageProcessingTime: mockAI.getAverageProcessingTime(),
            totalRequests: mockAI.getRequestHistory().length,
            requestsByType: mockAI.getRequestHistory().reduce((acc, req) => {
              const type = req.request.type || 'unknown'
              acc[type] = (acc[type] || 0) + 1
              return acc
            }, {} as Record<string, number>)
          }
        })

      default:
        return NextResponse.json({
          endpoints: [
            'POST /api/ai/content - Generate content',
            'GET /api/ai/content?action=status - Service status',
            'GET /api/ai/content?action=analytics - Usage analytics'
          ],
          exampleRequest: {
            type: 'copy',
            section: 'hero',
            tone: 'professional',
            length: 'medium',
            businessContext: {
              type: 'salon',
              name: 'Sunny Styles',
              services: ['haircuts', 'coloring', 'styling'],
              uniqueValue: 'Premium luxury experience',
              targetAudience: ['professionals', 'luxury_seekers']
            },
            requirements: {
              includeKeywords: ['luxury', 'professional'],
              callToAction: 'Book Now',
              emotionalTone: 'aspirational'
            }
          }
        })
    }
  } catch (error) {
    logger.error('❌ AI API: Content status error:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}