// API Route for bulk component preview data based on choice selection
import { NextRequest, NextResponse } from 'next/server'
import { PREVIEW_IMPACTS, type ChoiceId } from '@/services/mock/preview-impacts'
import { logger } from '@/utils/logger';

interface RouteParams {
  params: Promise<{
    projectId: string
    choiceId: string
  }>
}

// 🛡️ Protect this API route with authentication and rate limiting
async function handlePreview(request: NextRequest, { user }: { user: any }, params: RouteParams['params']) {
  try {
    const { projectId, choiceId } = await params
    
    logger.info('🚀 API: Bulk preview request received', { 
      projectId, 
      choiceId,
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous',
      hasUser: !!user?.id
    })
    
    // Validate parameters
    if (!projectId || projectId === 'undefined') {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }
    
    if (!choiceId || !(choiceId in PREVIEW_IMPACTS)) {
      return NextResponse.json(
        { error: `Invalid choice ID: ${choiceId}. Valid choices: ${Object.keys(PREVIEW_IMPACTS).join(', ')}` },
        { status: 400 }
      )
    }
    
    // Get the full preview impact for this choice
    const previewImpact = PREVIEW_IMPACTS[choiceId as ChoiceId]
    
    // Extract all component configurations (safely handling missing properties)
    const components = {
      header: previewImpact.modules.header || null,
      hero: previewImpact.modules.hero || null,
      features: ('features' in previewImpact.modules) ? previewImpact.modules.features : null
    }
    
    // Extract global settings
    const globalSettings = {
      colorScheme: previewImpact.modules.colorScheme,
      typography: previewImpact.modules.typography,
      animations: previewImpact.modules.animations,
      customCSS: previewImpact.modules.customCSS
    }
    
    logger.info('✅ API: Successfully retrieved all components for', choiceId);
    
    return NextResponse.json({
      success: true,
      projectId,
      choiceId,
      components,
      globalSettings,
      metadata: {
        timestamp: new Date().toISOString(),
        apiProvider: 'preview-mock-service',
        componentsCount: Object.values(components).filter(Boolean).length,
        hasCustomCSS: !!globalSettings.customCSS,
        previewType: 'bulk'
      }
    })
    
  } catch (error) {
    logger.error('❌ API: Bulk preview generation failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate bulk preview',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Export GET route with authentication wrapper
export async function GET(request: NextRequest, props: RouteParams) {
  // Use auth middleware to authenticate request first
  const { authenticateRequest } = await import('@/lib/auth-middleware')

  const authResult = await authenticateRequest(request)
  if (!authResult.success) {
    return NextResponse.json(
      {
        error: authResult.error?.message || 'Authentication failed',
        code: authResult.error?.code || 'AUTH_FAILED'
      },
      { status: authResult.error?.status || 401 }
    )
  }

  return handlePreview(request, { user: authResult.user }, props.params) // ✅ Pass Promise directly
}

export async function POST(request: NextRequest, props: RouteParams) {
  // For potential future use with dynamic generation
  return GET(request, props) // ✅ Pass props directly (params is Promise)
}