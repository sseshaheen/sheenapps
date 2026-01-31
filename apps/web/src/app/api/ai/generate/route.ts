import { NextRequest, NextResponse } from 'next/server'
import { RealAIService } from '@/services/ai/real-ai-service'
import { UnifiedAIService } from '@/services/ai/unified-ai-service'
import { BusinessAnalysis } from '@/services/ai/types'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger';
import { normalizeLocale } from '@/services/ai/locale-aware-prompts';

// 🛡️ Protect this API route with authentication and rate limiting
async function handleGenerate(request: NextRequest, { user }: { user: any }) {
  try {
    const { type, analysis, selectedName, serviceKey } = await request.json()

    if (!type || !analysis) {
      return NextResponse.json(
        { error: 'Type and analysis are required' },
        { status: 400 }
      )
    }

    // Extract and normalize locale at route boundary for consistent downstream handling
    const rawLocale = request.headers.get('x-sheen-locale')
    const locale = rawLocale ? normalizeLocale(rawLocale) : undefined

    logger.info('🎲 Generation request received:', {
      type,
      service: serviceKey ? 'configured' : 'default',
      locale: locale || 'default',
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous',
      hasUser: !!user?.id
    })

    // Determine if we should use tier routing
    const useTierRouting = process.env.AI_TIER_ROUTING_ENABLED === 'true'

    let result

    if (useTierRouting) {
      logger.info('🎯 Using tier routing for generation')
      
      // Lazy-load the service to avoid build-time API key requirements
      const unifiedAI = UnifiedAIService.getInstance()
      
      // Use unified service with appropriate cost limits per type
      const costLimits = {
        names: 0.05,      // Simple generation
        taglines: 0.05,   // Simple generation  
        features: 0.08,   // Moderate complexity
        pricing: 0.12     // Higher complexity
      }

      const maxCost = costLimits[type as keyof typeof costLimits] || 0.05

      switch (type) {
        case 'names':
          result = await unifiedAI.generateBusinessNames(analysis, {
            useTierRouting: true,
            maxCost,
            enableFallback: true,
            locale // Pass locale for Arabic/non-English support
          })
          break
        case 'taglines':
          if (!selectedName) {
            return NextResponse.json(
              { error: 'Selected name is required for taglines' },
              { status: 400 }
            )
          }
          // For taglines, we need to pass both analysis and selectedName
          result = await unifiedAI.processRequest({
            type: 'tagline_generation',
            content: JSON.stringify({ analysis, selectedName }),
            domain: 'business',
            priority: 'low',
            locale // Pass locale for Arabic/non-English support
          }, {
            useTierRouting: true,
            maxCost,
            enableFallback: true,
            locale
          })
          break
        case 'features':
          result = await unifiedAI.processRequest({
            type: 'feature_recommendation',
            content: JSON.stringify(analysis),
            domain: 'business',
            priority: 'medium',
            locale // Pass locale for Arabic/non-English support
          }, {
            useTierRouting: true,
            maxCost,
            enableFallback: true,
            locale
          })
          break
        case 'pricing':
          result = await unifiedAI.processRequest({
            type: 'pricing_strategy',
            content: JSON.stringify(analysis),
            domain: 'business',
            priority: 'high',
            locale // Pass locale for Arabic/non-English support
          }, {
            useTierRouting: true,
            maxCost,
            enableFallback: true,
            locale
          })
          break
        default:
          return NextResponse.json(
            { error: 'Invalid generation type' },
            { status: 400 }
          )
      }

      // Add tier routing metadata
      if (result.success && result.metadata?.tierRouting) {
        result.tierInfo = result.metadata.tierRouting
      }
    } else {
      logger.info('🔄 Using legacy AI service for generation')

      // Fallback to existing service
      const aiService = new RealAIService()

      switch (type) {
        case 'names':
          result = await aiService.generateBusinessNames(analysis as BusinessAnalysis, serviceKey, locale)
          break
        case 'taglines':
          if (!selectedName) {
            return NextResponse.json(
              { error: 'Selected name is required for taglines' },
              { status: 400 }
            )
          }
          result = await aiService.generateTaglines(analysis as BusinessAnalysis, selectedName, serviceKey, locale)
          break
        case 'features':
          result = await aiService.recommendFeatures(analysis as BusinessAnalysis, serviceKey, locale)
          break
        case 'pricing':
          result = await aiService.generatePricingStrategy(analysis as BusinessAnalysis, serviceKey, locale)
          break
        default:
          return NextResponse.json(
            { error: 'Invalid generation type' },
            { status: 400 }
          )
      }
    }

    
    return NextResponse.json(result)
    
  } catch (error) {
    logger.error('AI generation API error:', error)
    return NextResponse.json(
      { error: 'Generation failed' },
      { status: 500 }
    )
  }
}

// 🛡️ Export the protected route with authentication only
export const POST = authPresets.authenticated(handleGenerate)