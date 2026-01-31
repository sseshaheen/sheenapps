/**
 * API Route: Update Version Note
 * Allows users to add or update a note/comment for a specific version
 * Directly updates the user_comment column in the project_versions table
 * 
 * Security: Following SUPABASE_AUTH_IMPLEMENTATION_GUIDE.md best practices
 * - Uses getUser() for secure token validation
 * - Multi-layer ownership verification
 * - Server-only implementation
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/server/supabase';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { logger } from '@/utils/logger';

// Force dynamic to prevent caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string; // project id
    versionId: string;
  }>;
}

/**
 * PATCH /api/projects/[id]/version-notes/[versionId]
 * Update the note/comment for a specific version
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate user
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Await params in Next.js 15
    const { id: projectId, versionId } = await params;
    const body = await req.json();
    const { note } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'Version ID is required' },
        { status: 400 }
      );
    }

    if (typeof note !== 'string') {
      return NextResponse.json(
        { error: 'Note must be a string' },
        { status: 400 }
      );
    }

    logger.info(`📝 Updating note for version ${versionId}`, {
      userId: user.id,
      projectId,
      noteLength: note.length
    });

    // Get Supabase client with proper authentication context
    const supabase = await createServerSupabaseClientNew();

    // SECURITY: Multi-layer ownership verification
    // Since project_versions table is not in TypeScript types (managed by Worker),
    // we use type assertions for tables not in our schema
    
    // 1. First, verify the version exists and get ownership info
    const { data: versionData, error: versionError } = await (supabase as any)
      .from('project_versions')
      .select('project_id, user_id')
      .eq('version_id', versionId)
      .single() as { data: { project_id: string; user_id: string } | null; error: any };

    logger.info(`🔍 Version lookup result:`, {
      versionId,
      found: !!versionData,
      error: versionError?.message,
      versionUserId: versionData?.user_id,
      currentUserId: user.id,
      versionProjectId: versionData?.project_id,
      urlProjectId: projectId
    });

    if (versionError || !versionData) {
      logger.error(`Version not found: ${versionId}`, versionError);
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // Verify the version belongs to the project in the URL
    if (versionData.project_id !== projectId) {
      logger.error(`Version ${versionId} does not belong to project ${projectId}`);
      return NextResponse.json(
        { error: 'Version does not belong to this project' },
        { status: 400 }
      );
    }

    // Check if user owns the version (first layer of security)
    // The user_id in project_versions is stored as text (Supabase Auth UUID)
    if (versionData.user_id !== user.id) {
      logger.warn(`Unauthorized access attempt to version ${versionId} by user ${user.id}`, {
        versionUserId: versionData.user_id,
        currentUserId: user.id,
        match: versionData.user_id === user.id
      });
      return NextResponse.json(
        { error: 'You do not have permission to edit this version' },
        { status: 403 }
      );
    }

    // Double-check ownership through projects table (second layer of security)
    // This table IS in our TypeScript types - note it uses owner_id, not user_id
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', versionData.project_id)
      .single();

    if (projectError || !projectData || (projectData as any).owner_id !== user.id) {
      logger.error(`Project ownership verification failed for project ${versionData.project_id}`, projectError);
      return NextResponse.json(
        { error: 'Project ownership verification failed' },
        { status: 403 }
      );
    }

    // Update the user_comment column in project_versions table
    // Only update if all ownership checks pass
    // Additional safety: include user_id in the WHERE clause for belt-and-suspenders security
    const { data: updateData, error: updateError } = await (supabase as any)
      .from('project_versions')
      .update({ 
        user_comment: note.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('version_id', versionId)
      .eq('user_id', user.id)  // Extra safety: ensure we only update our own records
      .select()
      .single() as { data: { updated_at: string } | null; error: any };

    if (updateError) {
      logger.error(`Failed to update version note:`, updateError);
      return NextResponse.json(
        { 
          error: 'Failed to update note',
          details: updateError.message
        },
        { status: 500 }
      );
    }

    logger.info(`✅ Note updated successfully for version ${versionId}`);
    
    return NextResponse.json({
      success: true,
      versionId,
      note: note.trim(),
      updatedAt: updateData?.updated_at || new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to update version note:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to update note',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/version-notes/[versionId]
 * Alternative method for updating notes (for clients that don't support PATCH)
 */
export async function POST(req: NextRequest, props: RouteParams) {
  return PATCH(req, props); // ✅ Pass props directly (params is Promise)
}