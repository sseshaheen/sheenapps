import { authPresets } from '@/lib/auth-middleware'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createErrorResponse, isNotFoundError } from '@/lib/supabase-errors'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'

// Disable ALL caching for this dynamic route
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

async function handleUpdateProject(
  request: NextRequest,
  { user, params }: { user: any; params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    logger.info('📂 PATCH handler started with auth', {
      projectId: projectId?.slice(0, 8),
      hasUser: !!user,
      userId: user?.id?.slice(0, 8),
      method: request.method,
      userEmail: user?.email
    })

    if (!projectId) {
      logger.error('Missing project ID')
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      )
    }

    if (!user) {
      logger.error('No user in context')
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    logger.info('📂 Starting project update', {
      projectId: projectId.slice(0, 8),
      userId: user.id.slice(0, 8),
      method: request.method,
      contentType: request.headers.get('content-type')
    })

    let body;
    try {
      body = await request.json()
    } catch (parseError) {
      logger.error('Failed to parse request body', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        contentType: request.headers.get('content-type')
      })
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { name, config, archived_at } = body

    logger.info('📂 Parsed request body', {
      projectId: projectId.slice(0, 8),
      userId: user.id.slice(0, 8),
      updates: Object.keys(body),
      bodyStringified: JSON.stringify(body),
      hasName: name !== undefined,
      hasConfig: config !== undefined,
      hasArchivedAt: archived_at !== undefined,
      configType: typeof config,
      configValue: config ? JSON.stringify(config) : 'undefined',
      archivedAtValue: archived_at
    })

    logger.info('📂 Creating Supabase client...')
    const supabase = await createServerSupabaseClientNew()
    logger.info('📂 Supabase client created successfully')

    // First, verify the project belongs to the user
    logger.info('📂 Fetching existing project...')
    const { data: existingProject, error: fetchError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single()

    logger.info('📂 Project fetch result:', {
      hasData: !!existingProject,
      hasError: !!fetchError,
      errorMessage: fetchError?.message,
      errorCode: fetchError?.code
    })

    if (fetchError || !existingProject) {
      logger.error('Project not found', { projectId: projectId.slice(0, 8) })
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      )
    }

    logger.info('📂 Checking ownership', {
      projectOwnerId: (existingProject as any).owner_id?.slice(0, 8),
      requestUserId: user.id?.slice(0, 8),
      matches: (existingProject as any).owner_id === user.id
    })

    if ((existingProject as any).owner_id !== user.id) {
      logger.error('Unauthorized project access', {
        projectId: projectId.slice(0, 8),
        userId: user.id.slice(0, 8),
        projectOwnerId: (existingProject as any).owner_id?.slice(0, 8)
      })
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updateData.name = name.trim()
    if (config !== undefined) updateData.config = config
    if (archived_at !== undefined) updateData.archived_at = archived_at

    // Update the project
    logger.info('📂 Executing database update', {
      projectId: projectId.slice(0, 8),
      updateData: JSON.stringify(updateData)
    })

    const { data: project, error } = await (supabase
      .from('projects') as any)
      .update(updateData)
      .eq('id', projectId)
      .eq('owner_id', user.id) // Add explicit owner check for RLS
      .select()
      .single()

    logger.info('📂 Database update result', {
      hasData: !!project,
      hasError: !!error,
      errorMessage: error?.message,
      errorCode: error?.code
    })

    if (error) {
      logger.error('Failed to update project', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        updateData: JSON.stringify(updateData)
      })
      return NextResponse.json(
        { success: false, error: 'Failed to update project', details: error.message },
        { status: 500 }
      )
    }

    if (!project) {
      logger.error('Project update returned no data', {
        projectId: projectId.slice(0, 8),
        updateData: JSON.stringify(updateData)
      })
      return NextResponse.json(
        { success: false, error: 'Failed to update project', details: 'No data returned from update' },
        { status: 500 }
      )
    }

    logger.info('✅ Project updated', {
      projectId: project.id.slice(0, 8),
      userId: user.id.slice(0, 8)
    })

    return NextResponse.json({
      success: true,
      project
    })

  } catch (error) {
    logger.error('Project update failed - detailed error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update project',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

async function handleDeleteProject(
  request: NextRequest,
  { user, params }: { user: any; params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    logger.info('📂 Deleting project', {
      projectId: projectId.slice(0, 8),
      userId: user.id.slice(0, 8)
    })

    const supabase = await createServerSupabaseClientNew()

    // First, verify the project belongs to the user
    const { data: existingProject, error: fetchError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single()

    if (fetchError || !existingProject) {
      logger.error('Project not found', { projectId: projectId.slice(0, 8) })
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      )
    }

    if ((existingProject as any).owner_id !== user.id) {
      logger.error('Unauthorized project access', {
        projectId: projectId.slice(0, 8),
        userId: user.id.slice(0, 8)
      })
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Delete the project
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error) {
      logger.error('Failed to delete project', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete project' },
        { status: 500 }
      )
    }

    // Refund the project quota
    const { data: refundResult, error: refundError } = await (supabase as any)
      .rpc('refund_project_quota', {
        p_user_id: user.id,
        p_project_id: projectId
      })
      .single()

    if (refundError) {
      logger.error('Failed to refund project quota', refundError)
      // Don't fail the deletion, just log the error
    } else if (refundResult) {
      logger.info('📊 Project quota refunded', {
        projectId: projectId.slice(0, 8),
        userId: user.id.slice(0, 8),
        previousUsage: refundResult.previous_usage,
        newUsage: refundResult.new_usage,
        message: refundResult.message
      })
    }

    logger.info('✅ Project deleted', {
      projectId: projectId.slice(0, 8),
      userId: user.id.slice(0, 8)
    })

    return NextResponse.json({
      success: true
    })

  } catch (error) {
    logger.error('Project deletion failed', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}

async function handleGetProject(
  request: NextRequest,
  { user, params }: { user: any; params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Project ID required',
          code: 'INVALID_REQUEST'
        },
        { status: 400 }
      )
    }

    logger.info('📂 Fetching project', {
      projectId: projectId.slice(0, 8),
      userId: user?.id?.slice(0, 8)
    })

    const supabase = await createServerSupabaseClientNew()

    // Fetch the project - force fresh data with no cache
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (error) {
      logger.error('Failed to fetch project', {
        error: error.message,
        code: error.code,
        projectId: projectId.slice(0, 8)
      })

      // Use our error mapper for consistent responses
      return createErrorResponse(error, isNotFoundError(error) ? 'Project not found' : undefined)
    }

    // Check if user has access (for authenticated users)
    if (user && (project as any)?.owner_id !== user.id) {
      logger.warn('Unauthorized project access attempt', {
        projectId: projectId.slice(0, 8),
        userId: user.id.slice(0, 8),
        ownerId: (project as any)?.owner_id?.slice(0, 8)
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        },
        { status: 403 }
      )
    }

    logger.info('✅ Project fetched successfully', {
      projectId: (project as any)?.id?.slice(0, 8),
      name: (project as any)?.name,
      configKeys: (project as any)?.config ? Object.keys((project as any).config) : 'no config',
      hasTemplateData: !!((project as any)?.config?.templateData),
      templateName: ((project as any)?.config as any)?.templateData?.name || 'no template',
      buildStatus: (project as any)?.build_status,
      previewUrl: (project as any)?.preview_url
    })

    // Get buildId from new schema column, fallback to config if null
    const latestBuildId = (project as any)?.current_build_id || ((project as any)?.config as any)?.buildId || null
    
    if (!latestBuildId) {
      logger.info('📋 No buildId found in project', {
        projectId: projectId.slice(0, 8),
        buildStatus: (project as any)?.build_status
      })
    }

    // Sanitize project to remove sensitive config data
    // ✅ PHASE 1: Enhanced with status fields in consistent camelCase naming
    const projectData = project as any
    const sanitizedProject = {
      id: projectData.id,
      name: projectData.name,
      
      // ✅ Consistent camelCase naming for timestamps
      createdAt: projectData.created_at,
      updatedAt: projectData.updated_at,
      archivedAt: projectData.archived_at,
      ownerId: projectData.owner_id,
      
      // Business logic fields
      businessIdea: projectData.config?.businessIdea || null,
      templateData: projectData.config?.templateData || null,
      hasTemplate: !!(projectData.config?.templateData),
      
      // ✅ NEW: Status fields with consistent camelCase naming
      buildStatus: projectData.build_status || 'queued',
      currentBuildId: projectData.current_build_id,
      currentVersionId: projectData.current_version_id,
      currentVersionName: projectData.current_version_name,
      framework: projectData.framework,
      previewUrl: projectData.preview_url,
      subdomain: projectData.subdomain,
      lastBuildStarted: projectData.last_build_started,
      lastBuildCompleted: projectData.last_build_completed,
      
      // ✅ Legacy fields maintained during transition
      buildId: latestBuildId, // Keep for existing components
      status: projectData.build_status || 'queued' // Keep for existing components
    }

    // Return with cache-busting headers to ensure fresh data
    return NextResponse.json(
      {
        success: true,
        project: sanitizedProject,
        timestamp: new Date().toISOString() // Add timestamp to verify freshness
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store'
        }
      }
    )

  } catch (error) {
    logger.error('Project fetch failed', error)
    return createErrorResponse(error)
  }
}

export const GET = authPresets.authenticated(handleGetProject)
export const PATCH = authPresets.authenticated(handleUpdateProject)
export const DELETE = authPresets.authenticated(handleDeleteProject)
