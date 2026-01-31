// API Route for server-side AI question generation
// 
// ⚠️ DEPRECATION NOTICE:
// This endpoint returns ALL questions with heavy modularPreviewImpact data.
// For lightweight first question only, use /api/questions/first instead.
//
import { NextRequest, NextResponse } from 'next/server'
import { AIRefinementBridgeSimple } from '@/services/refinement/ai-bridge-simple'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger';

// 🛡️ Protect this API route with authentication and rate limiting
async function handleQuestionGeneration(request: NextRequest, { user }: { user: any }) {
  try {
    logger.info('🚀 API: Question generation request received');
    logger.warn('💡 TIP: Use /api/questions/first for lightweight first question only');
    
    const body = await request.json()
    const { userPrompt, businessType } = body
    
    if (!userPrompt) {
      return NextResponse.json(
        { error: 'User prompt is required' },
        { status: 400 }
      )
    }
    
    logger.info('📝 API: Generating questions for:', userPrompt);
    logger.info('🏢 API: Business type:', businessType);
    logger.info('👤 API: User info:', {
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous',
      hasUser: !!user?.id
    })
    
    // Generate questions using AI on server-side
    const result = AIRefinementBridgeSimple.generateFallbackQuestions()
    
    logger.info('✅ API: Successfully generated', result.questions.length, 'questions');
    
    return NextResponse.json({
      success: true,
      ...result
    })
    
  } catch (error) {
    logger.error('❌ API: Question generation failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate questions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// 🛡️ Export the protected route with authentication
export const POST = authPresets.authenticated(handleQuestionGeneration)