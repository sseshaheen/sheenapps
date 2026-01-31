/**
 * API Route: Project Status
 * Provides real-time project status from database
 * 
 * MIGRATION: Updated to use authPresets pattern like main route
 */

import { NextRequest, NextResponse } from 'next/server';
import { authPresets } from '@/lib/auth-middleware';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { logger } from '@/utils/logger';

// Force dynamic to prevent ALL caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * GET /api/projects/[id]/status
 * Fetch current project status from database using same auth pattern as main route
 */
async function handleGetProjectStatus(
  request: NextRequest,
  { user, params }: { user: any; params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    logger.info(`📊 Fetching project status for ${projectId}`, {
      userId: user?.id?.slice(0, 8)
    });

    if (!user) {
      logger.error('No user in context');
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const supabase = await createServerSupabaseClientNew();

    // 🔍 PHASE 0 DEBUG: Log current_user and JWT claims (expert recommendation)  
    try {
      const { data: debugData, error: debugError } = await (supabase as any)
        .rpc('debug_auth_context', {});
        
      logger.info('🔍 Debug auth context', {
        projectId: projectId.slice(0, 8),
        debugData,
        debugError: debugError?.message,
        hasUser: !!user,
        userId: user?.id?.slice(0, 8)
      });
    } catch (debugErr) {
      logger.info('🔍 Debug auth context (RPC not available)', {
        message: 'Will create debug function after privilege restore'
      });
    }

    // Fetch the project with ownership validation
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', user.id) // Ensure user owns the project
      .single();

    if (error || !project) {
      // 🚨 PHASE 0 FIX: Stop masking 42501 as 404 (expert recommendation)
      if (error) {
        logger.error('Database error details', {
          projectId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          userId: user.id?.slice(0, 8)
        });

        // Return 403 for permission issues so we can see real failures during rollout
        if (error.code === '42501') {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: 'PERMISSION_DENIED',
                message: 'Database permission denied',
                details: error.message
              }
            },
            {
              status: 403,
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Timestamp': new Date().toISOString(),
                'X-Error-Code': error.code
              }
            }
          );
        }

        // Other database errors as 500
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Database operation failed',
              details: error.message
            }
          },
          {
            status: 500,
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              'X-Timestamp': new Date().toISOString(),
              'X-Error-Code': error.code
            }
          }
        );
      }

      // Only return 404 if no error but also no project (actual not found)
      logger.warn('Project not found (no database error)', {
        projectId,
        userId: user.id?.slice(0, 8)
      });

      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Timestamp': new Date().toISOString()
          }
        }
      );
    }

    // Transform to consistent status format
    const projectData = project as any
    const projectStatus = {
      id: projectData.id,
      name: projectData.name,
      buildStatus: projectData.build_status,
      currentBuildId: projectData.current_build_id,
      currentVersionId: projectData.current_version_id,
      currentVersionName: projectData.current_version_name,
      previewUrl: projectData.preview_url,
      subdomain: projectData.subdomain,
      framework: projectData.framework,
      lastBuildStarted: projectData.last_build_started,
      lastBuildCompleted: projectData.last_build_completed,
      updatedAt: projectData.updated_at
    };

    logger.info(`✅ Retrieved project status for ${projectId}`, {
      buildStatus: projectStatus.buildStatus,
      previewUrl: projectStatus.previewUrl,
      currentVersionName: projectStatus.currentVersionName
    });

    // Return with standardized response format and cache-busting headers
    return NextResponse.json(
      { ok: true, data: projectStatus },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store',
          'X-Timestamp': new Date().toISOString()
        }
      }
    );

  } catch (error) {
    logger.error('❌ Failed to fetch project status:', error);

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch project status',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Timestamp': new Date().toISOString()
        }
      }
    );
  }
}

export const GET = authPresets.authenticated(handleGetProjectStatus);