//src/app/api/preview/[projectId]/[choiceId]/[componentName]/route.ts
// API Route for component preview data based on choice selection
import { PREVIEW_IMPACTS, type ChoiceId } from '@/services/mock/preview-impacts';
import { logger } from '@/utils/logger';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    projectId: string
    choiceId: string
    componentName: string
  }>
}

const VALID_COMPONENTS = ['header', 'hero', 'features'] as const // Only components available in mock data
type ValidComponent = typeof VALID_COMPONENTS[number]

// Realistic generation times based on component complexity
const COMPONENT_GENERATION_TIMES = {
  header: 800,      // Simple navigation, fast
  hero: 1500,       // Complex hero section, medium
  features: 2200,   // Feature cards with content, slower
} as const

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, choiceId, componentName } = await params

    logger.info('🚀 API: Preview request received', { projectId, choiceId, componentName });

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

    if (!componentName || !VALID_COMPONENTS.includes(componentName as ValidComponent)) {
      return NextResponse.json(
        { error: `Invalid component name: ${componentName}. Valid components: ${VALID_COMPONENTS.join(', ')}` },
        { status: 400 }
      )
    }

    // Add realistic generation delay
    const startTime = Date.now()
    const expectedTime = COMPONENT_GENERATION_TIMES[componentName as ValidComponent] || 1000

    logger.info(`🔄 API: Generating ${componentName} component (expected ${expectedTime}ms);`)

    // Simulate AI generation time
    await new Promise(resolve => setTimeout(resolve, expectedTime))

    const actualTime = Date.now() - startTime

    // Get the preview impact for this choice
    const previewImpact = PREVIEW_IMPACTS[choiceId as ChoiceId]

    // Extract the specific component configuration
    const componentConfig = previewImpact.modules[componentName as ValidComponent]

    if (!componentConfig) {
      return NextResponse.json(
        { error: `Component '${componentName}' not found for choice '${choiceId}'` },
        { status: 404 }
      )
    }

    // Extract global settings (only for primary components to avoid duplication)
    const isPrimaryComponent = ['header', 'hero'].includes(componentName)
    const globalSettings = isPrimaryComponent ? {
      colorScheme: previewImpact.modules.colorScheme,
      typography: previewImpact.modules.typography,
      animations: previewImpact.modules.animations,
      customCSS: componentName === 'hero' ? previewImpact.modules.customCSS : undefined
    } : {}

    logger.info(`✅ API: Generated ${componentName} component in ${actualTime}ms`);

    return NextResponse.json({
      success: true,
      projectId,
      choiceId,
      component: {
        name: componentName,
        config: componentConfig,
        ...globalSettings
      },
      metadata: {
        generationTime: actualTime,
        expectedTime,
        timestamp: new Date().toISOString(),
        apiProvider: 'component-generation-service',
        componentType: componentConfig?.component || componentName,
        isPrimary: isPrimaryComponent,
        hasCustomCSS: !!globalSettings.customCSS
      }
    })

  } catch (error) {
    logger.error('❌ API: Preview generation failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate component preview',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, props: RouteParams) {
  // For potential future use with dynamic generation
  return GET(request, props) // ✅ Pass props directly (params is Promise)
}
