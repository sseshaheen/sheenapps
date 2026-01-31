import { NextRequest, NextResponse } from 'next/server'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

async function handleDuplicateProject(
  request: NextRequest, 
  { user, params }: { user: any; params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    logger.info('📂 Duplicating project', {
      projectId: projectId.slice(0, 8),
      userId: user.id.slice(0, 8)
    })

    const supabase = await createServerSupabaseClientNew()

    // First, get the original project
    const { data: originalProject, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (fetchError || !originalProject) {
      logger.error('Project not found', { projectId: projectId.slice(0, 8) })
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      )
    }

    if ((originalProject as any).owner_id !== user.id) {
      logger.error('Unauthorized project access', {
        projectId: projectId.slice(0, 8),
        userId: user.id.slice(0, 8)
      })
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Create the duplicate
    const duplicateName = `${(originalProject as any).name} (Copy)`
    const now = new Date().toISOString()

    const { data: duplicateProject, error } = await supabase
      .from('projects')
      .insert({
        name: duplicateName,
        owner_id: user.id,
        created_at: now,
        updated_at: now
      } as any)
      .select()
      .single()

    if (error) {
      logger.error('Failed to duplicate project', error)
      return NextResponse.json(
        { success: false, error: 'Failed to duplicate project' },
        { status: 500 }
      )
    }

    logger.info('✅ Project duplicated', {
      originalId: projectId.slice(0, 8),
      duplicateId: (duplicateProject as any)?.id.slice(0, 8),
      userId: user.id.slice(0, 8)
    })

    return NextResponse.json({
      success: true,
      project: duplicateProject
    })

  } catch (error) {
    logger.error('Project duplication failed', error)
    return NextResponse.json(
      { success: false, error: 'Failed to duplicate project' },
      { status: 500 }
    )
  }
}

export const POST = authPresets.authenticated(handleDuplicateProject)