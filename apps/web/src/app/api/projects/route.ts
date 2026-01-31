/**
 * Projects API Route - MIGRATED TO REPOSITORY PATTERN
 *
 * Migration: Phase 2.1 - Service Layer Modernization
 * Replaced direct Supabase calls with ProjectRepository
 * Maintains all original functionality with improved architecture
 */

import { authPresets } from '@/lib/auth-middleware'
import { assertSameOrigin } from '@/lib/security/csrf'
import { ProjectRepository } from '@/lib/server/repositories/project-repository'
import { type IndustryTag } from '@/lib/run/industry-tags'
import { createEasyModeProject } from '@/server/services/easy-project-service'
import { PreviewDeploymentService } from '@/server/services/preview-deployment'
import { mapWorkerStatusToProjectStatus } from '@/utils/build-state-mapping'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  resolveTemplate,
  validateTemplateAccess,
  buildTemplatePrompt,
  type UserPlan
} from '@sheenapps/templates'

// Force dynamic rendering and use Node.js runtime for database operations
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function mapTemplateCategoryToIndustry(category?: string, tags?: string[]): IndustryTag {
  const normalized = category?.toLowerCase() || ''
  const tagSet = new Set((tags || []).map(tag => tag.toLowerCase()))

  if (normalized === 'retail' || tagSet.has('ecommerce')) return 'ecommerce'
  if (normalized === 'services') return 'services'
  if (normalized === 'food') return 'restaurant'
  if (normalized === 'creative') return 'portfolio'
  if (normalized === 'education') return 'course'
  if (normalized === 'health') return 'fitness'
  if (normalized === 'publishing') return 'publishing'
  if (normalized === 'technology') return 'saas'
  if (normalized === 'platform') return 'marketplace'
  if (normalized === 'real-estate') return 'real-estate'
  if (normalized === 'events') return 'events'

  return 'generic'
}

// Expert recommendation: Input validation with Zod
const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name too long').optional(),
  config: z.object({}).optional(),
  businessIdea: z.string().min(1, 'Business idea is required').max(2000, 'Business idea too long').optional(),
  templateId: z.string().optional(),
  infraMode: z.enum(['easy', 'pro']).optional(), // Easy Mode or Pro Mode (default: pro for backwards compatibility)
  /** ISO 4217 currency code (e.g., USD, SAR, EGP). Defaults to USD. */
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
})

/**
 * GET /api/projects
 * Fetch all projects for the authenticated user
 *
 * Uses ProjectRepository with built-in access control
 */
async function handleGetProjects(request: NextRequest, { user }: { user: any }) {
  try {
    // WORKER TEAM DEBUGGING: Log ALL API requests
    console.log('🌐 [NextJS API Route] GET /api/projects:', {
      method: 'GET',
      userId: user?.id?.slice(0, 8) || 'anonymous',
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer')
    });

    logger.info('📂 Fetching projects via repository', {
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous'
    })

    // Use repository pattern with built-in access control and authentication
    const projects = await ProjectRepository.findByOwner(user.id)

    logger.info('✅ Projects fetched via repository', {
      projectCount: projects?.length || 0,
      userId: user.id.slice(0, 8)
    })

    // Transform projects to API format (sanitize sensitive data)
    const sanitizedProjects = projects.map(project => ({
      id: project.id,
      name: project.name,
      created_at: project.created_at,
      updated_at: project.updated_at,
      archived_at: project.archived_at,
      owner_id: project.owner_id,
      // Include build information from new schema columns
      buildId: project.current_build_id || (project.config as any)?.buildId || null,
      status: project.build_status || 'queued',
      businessIdea: (project.config as any)?.businessIdea || null,
      // Include preview URL from new schema column
      previewUrl: project.preview_url || null,
      // Only include templateData if it exists (for template preview)
      templateData: (project.config as any)?.templateData || null,
      // Include a flag to indicate if there's a template available
      hasTemplate: !!((project.config as any)?.templateData)
    }))

    // Expert recommendation: Standardized success response
    return NextResponse.json(
      {
        ok: true,
        data: {
          projects: sanitizedProjects
        }
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Projects fetch failed via repository', {
      error: error instanceof Error ? error.message : String(error),
      userId: user?.id?.slice(0, 8)
    })

    // Expert recommendation: Standardized error response
    return NextResponse.json(
      {
        ok: false,
        code: 'PROJECT_FETCH_ERROR',
        message: 'Failed to fetch projects'
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}

/**
 * POST /api/projects
 * Create a new project with optional business idea processing
 *
 * Uses ProjectRepository for database operations and Worker API for builds
 *
 * EXPERT FIX ROUND 4: Added CSRF protection
 */
async function handleCreateProject(request: NextRequest, { user }: { user: any }) {
  try {
    // EXPERT FIX ROUND 4: CSRF Protection (cookie-authenticated mutation)
    try {
      assertSameOrigin(request)
    } catch (e) {
      logger.warn('CSRF check failed on project creation', {
        error: e instanceof Error ? e.message : String(e),
        origin: request.headers.get('origin'),
        host: request.headers.get('host')
      })
      return NextResponse.json(
        {
          ok: false,
          code: 'FORBIDDEN',
          message: 'Forbidden'
        },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Expert recommendation: Input validation
    const validation = CreateProjectSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validation.error.issues
        },
        { status: 400 }
      )
    }

    const { name, config, businessIdea, templateId, infraMode, currencyCode } = validation.data

    // Template validation and PRO gating (if templateId provided)
    let resolvedTemplate = null
    if (templateId) {
      resolvedTemplate = resolveTemplate(templateId)

      if (!resolvedTemplate) {
        return NextResponse.json(
          {
            ok: false,
            code: 'TEMPLATE_NOT_FOUND',
            message: `Template '${templateId}' not found`
          },
          { status: 400 }
        )
      }

      // Server-side PRO template enforcement
      const userPlan = (user.plan || 'free') as UserPlan
      const accessResult = validateTemplateAccess(resolvedTemplate.id, userPlan)

      if (!accessResult.allowed) {
        logger.info('🚫 PRO template access denied', {
          templateId: resolvedTemplate.id,
          templateTier: resolvedTemplate.tier,
          userPlan,
          userId: user.id.slice(0, 8)
        })

        return NextResponse.json(
          {
            ok: false,
            code: accessResult.code || 'PRO_TEMPLATE_REQUIRES_UPGRADE',
            message: 'This template requires a paid plan',
            template: accessResult.template
          },
          { status: 402 }
        )
      }
    }

    // Generate project name (shared between Easy/Pro modes)
    let projectName = name?.trim()

    // Use template name if no name provided and template exists
    if (!projectName && resolvedTemplate) {
      // Extract name from translation key (e.g., "templates.ecommerce.name" -> "E-commerce Store")
      projectName = resolvedTemplate.id.charAt(0).toUpperCase() + resolvedTemplate.id.slice(1).replace(/-/g, ' ')
    }

    if (!projectName && businessIdea) {
      // Simple name generation from business idea
      const ideaLower = businessIdea.toLowerCase()
      if (ideaLower.includes('booking') || ideaLower.includes('appointment')) {
        projectName = 'Booking System'
      } else if (ideaLower.includes('store') || ideaLower.includes('shop') || ideaLower.includes('sell')) {
        projectName = 'Online Store'
      } else if (ideaLower.includes('restaurant') || ideaLower.includes('food')) {
        projectName = 'Restaurant App'
      } else if (ideaLower.includes('salon') || ideaLower.includes('beauty')) {
        projectName = 'Salon Business'
      } else {
        // Fallback: use first few words
        const words = businessIdea.split(' ').slice(0, 3).join(' ')
        projectName = words.charAt(0).toUpperCase() + words.slice(1)
      }
    }

    if (!projectName) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'Project name or business idea is required'
        },
        { status: 400 }
      )
    }

    // Build prompt using shared helper for consistency (Next.js + Worker)
    let finalPrompt: string
    if (resolvedTemplate && businessIdea) {
      // Template + custom prompt: use buildTemplatePrompt for structured format
      finalPrompt = buildTemplatePrompt({
        userPrompt: businessIdea,
        template: resolvedTemplate
      })
    } else if (resolvedTemplate) {
      // Template only: generate default prompt with template context
      finalPrompt = buildTemplatePrompt({
        userPrompt: `Create a ${resolvedTemplate.prompting.systemContext}`,
        template: resolvedTemplate
      })
    } else if (businessIdea) {
      // Business idea only: use as-is
      finalPrompt = businessIdea
    } else {
      // Fallback
      finalPrompt = `Create a ${projectName} project`
    }

    const templateSnapshot = resolvedTemplate ? {
      id: resolvedTemplate.id,
      category: resolvedTemplate.category,
      tags: resolvedTemplate.metadata?.tags || []
    } : null
    const industryTag = resolvedTemplate
      ? mapTemplateCategoryToIndustry(resolvedTemplate.category, resolvedTemplate.metadata?.tags)
      : null
    const runSettings = resolvedTemplate ? {
      industry_tag: industryTag,
      default_packs: industryTag ? [industryTag] : ['generic'],
      template_snapshot: templateSnapshot
    } : null

    // Build templateData with enhanced metadata
    const templateData = {
      prompt: finalPrompt,
      files: {},
      metadata: {
        projectType: resolvedTemplate ? 'template' : (businessIdea ? 'business-idea' : 'minimal'),
        templateId: resolvedTemplate?.id || null,
        templateVersion: resolvedTemplate?.version || null,
        templateTier: resolvedTemplate?.tier || null,
        templateCategory: resolvedTemplate?.category || null,
        estimatedBuildTime: resolvedTemplate?.metadata.estimatedBuildTime || null,
        source: 'project-creation',
        runSettings,
        templateSnapshot
      }
    }

    // EASY MODE ROUTING: Create project + trigger build pipeline
    if (infraMode === 'easy') {
      logger.info('🚀 Creating Easy Mode project via shared service', {
        userId: user.id.slice(0, 8),
        name: projectName,
        infraMode
      })

      const result = await createEasyModeProject({
        userId: user.id,
        projectName,
        subdomain: body.subdomain || undefined,
        tier: 'free',
        currencyCode: currencyCode || undefined,
        template: resolvedTemplate ? {
          id: resolvedTemplate.id,
          version: resolvedTemplate.version,
          tier: resolvedTemplate.tier,
          category: resolvedTemplate.category,
          tags: resolvedTemplate.metadata?.tags || []
        } : undefined,
        // Pass starter content from template to pre-populate CMS
        starterContent: resolvedTemplate?.starterContent
      })

      if (!result.ok) {
        const error = (result as { error?: { code?: string; message?: string } }).error
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: error?.code ?? 'EASY_MODE_ERROR',
              message: error?.message ?? 'Failed to create Easy Mode project',
            },
          },
          { status: 500 }
        )
      }
      const { projectId, subdomain, url, schemaName, publicApiKey, tier } = result.data

      // Trigger AI build pipeline for Easy Mode project
      const deployResult = await PreviewDeploymentService.deployPreview(
        projectId,
        templateData,
        true
      )

      if (!deployResult.success || !deployResult.buildId) {
        // Handle insufficient balance
        if (deployResult.error?.toLowerCase().includes('insufficient')) {
          return NextResponse.json(
            {
              ok: false,
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient AI time balance to create project',
              recommendation: deployResult.balanceCheck?.recommendation,
              suggestion: 'You can add more AI time credits to continue building your project.'
            },
            { status: 402 }
          )
        }

        return NextResponse.json(
          {
            ok: false,
            code: 'BUILD_FAILED',
            message: deployResult.error || 'Failed to create Easy Mode project build. Please try again.',
            details: deployResult.details
          },
          { status: 500 }
        )
      }

      const buildStatus = mapWorkerStatusToProjectStatus(deployResult.status || 'building')
      const previewUrl = deployResult.previewUrl || url

      // Return in the same format as Pro Mode projects
      // EXPERT FIX: Don't fabricate timestamps - let client treat as provisional
      return NextResponse.json(
        {
          ok: true,
          data: {
            project: {
              id: projectId,
              name: projectName,
              created_at: null,  // Real timestamp available after DB replication
              updated_at: null,  // Real timestamp available after DB replication
              archived_at: null,
              owner_id: user.id,
              buildId: deployResult.buildId,
              status: buildStatus,
              businessIdea: businessIdea || null,
              previewUrl,
              infraMode: 'easy',
              subdomain,
              schemaName,
              publicApiKey,
              tier,
              templateData: resolvedTemplate ? templateData : null,
              hasTemplate: !!resolvedTemplate
            }
          }
        },
        { status: 201 }
      )
    }

    // PRO MODE: Continue with existing flow
    // WORKER TEAM DEBUGGING: Log ALL project creation requests
    // console.log('🌐 [NextJS API Route] POST /api/projects - PROJECT CREATION:', {
    //   method: 'POST',
    //   userId: user?.id?.slice(0, 8) || 'anonymous',
    //   timestamp: new Date().toISOString(),
    //   hasBusinessIdea: !!businessIdea,
    //   hasTemplateId: !!templateId,
    //   hasName: !!name,
    //   hasConfig: !!config,
    //   userAgent: request.headers.get('user-agent'),
    //   referer: request.headers.get('referer'),
    //   origin: request.headers.get('origin'),
    //   requestBody: {
    //     businessIdea: businessIdea?.slice(0, 100) + '...',
    //     templateId,
    //     name
    //   }
    // });

    // Handle both old format (config object) and new format (direct fields)
    const projectConfig = (config || {}) as Record<string, any>
    if (businessIdea) projectConfig.businessIdea = businessIdea
    if (templateId) projectConfig.templateId = templateId

    // Single Worker API call for all project creation paths
    let buildId: string | null = null
    let projectId: string | null = null
    let buildStatus: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded' = 'queued'
    let previewUrl: string | null = null

    try {
      logger.info('🤖 Calling Worker API for project creation', {
        hasBusinessIdea: !!businessIdea,
        hasTemplateId: !!templateId,
        templateId: resolvedTemplate?.id || null,
        templateVersion: resolvedTemplate?.version || null,
        templateTier: resolvedTemplate?.tier || null,
        projectName,
        promptLength: finalPrompt.length
      })

      const deployResult = await PreviewDeploymentService.deployPreview(null, templateData, true)

      logger.info('🔍 Worker API deploy result:', {
        success: deployResult.success,
        buildId: deployResult.buildId,
        projectId: deployResult.projectId,
        status: deployResult.status,
        error: deployResult.error
      })

      // EXPERT FIX: Hard guard that worker success includes both identifiers
      // If worker returns ok:true but missing projectId or buildId, treat as error
      if (!deployResult.success || !deployResult.projectId || !deployResult.buildId) {
        logger.error('❌ Worker API failed or returned incomplete response', {
          success: deployResult.success,
          hasProjectId: !!deployResult.projectId,
          hasBuildId: !!deployResult.buildId,
          error: deployResult.error,
          details: deployResult.details,
          balanceCheck: deployResult.balanceCheck
        })

        // Check if it's insufficient balance
        if (deployResult.error?.includes('insufficient') || deployResult.error?.includes('balance')) {
          return NextResponse.json(
            {
              ok: false,
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient AI time balance to create project',
              recommendation: deployResult.balanceCheck?.recommendation,
              suggestion: 'You can add more AI time credits to continue building your project.'
            },
            { status: 402 }
          )
        }

        // Generic error response
        return NextResponse.json(
          {
            ok: false,
            code: 'BUILD_FAILED',
            message: deployResult.error || 'Failed to create project. Please try again.',
            details: deployResult.details
          },
          { status: 500 }
        )
      }

      // Set everything from the single response
      projectId = deployResult.projectId
      buildId = deployResult.buildId || null
      buildStatus = mapWorkerStatusToProjectStatus(deployResult.status || 'building')
      previewUrl = deployResult.previewUrl || null

      if (businessIdea) projectConfig.businessIdea = businessIdea
      if (buildId) projectConfig.buildId = buildId

      logger.info('✅ Worker API project created successfully', {
        projectId: projectId.slice(0, 8),
        buildId: buildId?.slice(0, 8) || 'none',
        status: buildStatus
      })

    } catch (error) {
      logger.error('❌ Unexpected error with Worker API', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })

      return NextResponse.json(
        {
          ok: false,
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while creating your project. Please try again.',
          suggestion: 'If this continues, try refreshing the page or contact support.'
        },
        { status: 500 }
      )
    }

    // TRUST THE WORKER RESPONSE
    // The worker is the source of truth for project creation. If it says success,
    // the project exists (or will exist momentarily due to eventual consistency).
    // The client will poll build status by buildId - that's the correct success criterion.
    // See: Expert analysis on "eventual consistency sleep" removal (Jan 2026)

    logger.info('✅ Returning worker response directly (no DB verification needed)', {
      projectId: projectId.slice(0, 8),
      buildId: buildId?.slice(0, 8) || 'none',
      status: buildStatus
    })

    // Return project data constructed from worker response + input
    // The DB row will be consistent by the time client polls build status
    // EXPERT FIX: Don't fabricate timestamps - let client treat as provisional
    const sanitizedProject = {
      id: projectId,
      name: projectName,
      created_at: null,  // Real timestamp available after DB replication
      updated_at: null,  // Real timestamp available after DB replication
      archived_at: null,
      owner_id: user.id,
      buildId: buildId,
      status: buildStatus,
      previewUrl: previewUrl,
      templateData: resolvedTemplate ? templateData : null,
      hasTemplate: !!resolvedTemplate,
      businessIdea: businessIdea || null
    }

    return NextResponse.json({
      ok: true,
      data: {
        project: sanitizedProject
      }
    })

  } catch (error) {
    logger.error('Project creation failed', error)
    return NextResponse.json(
      {
        ok: false,
        code: 'PROJECT_CREATION_ERROR',
        message: 'Failed to create project'
      },
      { status: 500 }
    )
  }
}

// WORKER TEAM DEBUGGING: Wrap handlers to log ALL requests
const loggedHandleGetProjects = async (request: NextRequest, context: any) => {
  return handleGetProjects(request, context);
};

const loggedHandleCreateProject = async (request: NextRequest, context: any) => {
  console.log('🚨 [NextJS API Route] ENTRY POINT - POST /api/projects:', {
    method: 'POST',
    url: request.url,
    timestamp: new Date().toISOString(),
    context: {
      hasUser: !!context?.user,
      userId: context?.user?.id?.slice(0, 8) || 'none'
    }
  });

  try {
    const result = await handleCreateProject(request, context);

    console.log('🚨 [NextJS API Route] EXIT POINT - POST /api/projects:', {
      method: 'POST',
      status: result.status,
      timestamp: new Date().toISOString(),
      success: result.status < 400
    });

    return result;
  } catch (error) {
    console.error('🚨 [NextJS API Route] ERROR - POST /api/projects:', {
      method: 'POST',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

export const GET = authPresets.authenticated(loggedHandleGetProjects)
export const POST = authPresets.authenticated(loggedHandleCreateProject)
