import { NextRequest, NextResponse } from 'next/server'
import { RealAIService } from '@/services/ai/real-ai-service'
import { UnifiedAIService } from '@/services/ai/unified-ai-service'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger';
import { normalizeLocale } from '@/services/ai/locale-aware-prompts';

// 🛡️ Protect this API route with authentication and rate limiting
async function handleAnalyze(request: NextRequest, { user }: { user: any }) {
  try {
    const { idea, serviceKey } = await request.json()

    if (!idea) {
      return NextResponse.json(
        { error: 'Business idea is required' },
        { status: 400 }
      )
    }

    // Extract and normalize locale at route boundary for consistent downstream handling
    const rawLocale = request.headers.get('x-sheen-locale')
    const locale = rawLocale ? normalizeLocale(rawLocale) : undefined

    logger.info('🔍 Business analysis request received:', {
      ideaLength: idea.length,
      service: serviceKey ? 'configured' : 'default',
      locale: locale || 'default',
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous',
      hasUser: !!user?.id
    })

    // Determine if we should use tier routing
    const useTierRouting = process.env.AI_TIER_ROUTING_ENABLED === 'true'

    let result

    if (useTierRouting) {
      logger.info('🎯 Using tier routing for business analysis')

      // Lazy-load the service to avoid build-time API key requirements
      const unifiedAI = UnifiedAIService.getInstance()

      // Business analysis is complex and should use higher tiers
      result = await unifiedAI.analyzeBusinessIdea(idea, {
        useTierRouting: true,
        maxCost: 0.15, // Higher budget for analysis
        enableFallback: true,
        locale // Pass locale for Arabic/non-English support
      })

      // Add tier routing metadata to response
      if (result.success && result.metadata?.tierRouting) {
        result.tierInfo = result.metadata.tierRouting
      }
    } else {
      logger.info('🔄 Using legacy AI service for analysis')

      // Fallback to existing service
      const aiService = new RealAIService()
      result = await aiService.analyzeBusinessIdea(idea, serviceKey, locale)
    }

    console.log('✅ Analysis completed:', {
      success: result.success,
      provider: result.tierInfo?.finalProvider || 'legacy',
      tier: result.tierInfo?.finalTier || 'unknown',
      userId: user?.id || 'anonymous'
    })

    return NextResponse.json(result)

  } catch (error) {
    logger.error('❌ AI analysis API error:', error)
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    )
  }
}

// 🛡️ Export the protected route with authentication
export const POST = authPresets.authenticated(handleAnalyze)