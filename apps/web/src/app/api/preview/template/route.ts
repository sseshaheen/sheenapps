/**
 * Template Preview API Route
 * Secure endpoint for rendering AI-generated templates
 */

import { NextRequest, NextResponse } from 'next/server'
import { withPreviewCSP } from '@/middleware-utils/csp-headers'
import { templateRenderer } from '@/services/template-renderer'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { authPresets } from '@/lib/auth-middleware'

// Disable caching for this dynamic route
export const dynamic = 'force-dynamic'

async function handleTemplatePreview(
  request: NextRequest,
  { user }: { user: any }
) {
  try {
    // Check feature flag
    if (!FEATURE_FLAGS.ENABLE_PREVIEW_V2) {
      return NextResponse.json(
        { error: 'Preview V2 is not enabled' },
        { status: 403 }
      )
    }

    // Get template data from request
    const templateData = await request.json()

    if (!templateData || !templateData.metadata?.components) {
      return NextResponse.json(
        { error: 'Invalid template data' },
        { status: 400 }
      )
    }

    // Log preview request
    console.log('[Preview API] Rendering template', {
      userId: user?.id,
      componentCount: Object.keys(templateData.metadata.components).length,
      hasDesignTokens: !!templateData.metadata.design_tokens
    })

    // Render template securely
    const renderResult = await templateRenderer.renderTemplate(templateData)

    if (!renderResult.success) {
      console.error('[Preview API] Render failed:', renderResult.error)
      return NextResponse.json(
        { 
          error: 'Failed to render template',
          details: renderResult.error?.message 
        },
        { status: 500 }
      )
    }

    // Return rendered template
    return NextResponse.json({
      success: true,
      data: renderResult.data,
      metadata: {
        renderedAt: new Date().toISOString(),
        userId: user?.id
      }
    })

  } catch (error) {
    console.error('[Preview API] Error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Apply authentication and CSP headers
export const POST = authPresets.public(
  async (req: NextRequest, context: any) => {
    const response = await handleTemplatePreview(req, context)
    return withPreviewCSP(async () => response)(req)
  }
)