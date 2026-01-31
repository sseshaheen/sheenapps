/**
 * Server Actions for Worker API Communication
 * Provides secure server-side interface to worker services
 * Prevents client-side exposure of worker secrets
 */

import 'server-only'

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { PreviewDeploymentService } from '@/server/services/preview-deployment'
import { revalidatePath } from 'next/cache'

/**
 * Server action to update a project via worker API
 * @param projectId - Project ID to update
 * @param changes - Changes to apply to the project
 * @param prompt - User prompt for the update
 * @returns Update result from worker API
 */
export async function updateProjectAction(
  projectId: string,
  changes: any,
  prompt: string
) {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Call the worker API with user ID
    const result = await PreviewDeploymentService.updateProject(
      projectId,
      changes,
      prompt,
      user.id
    )

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    revalidatePath(`/builder/${projectId}`)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Worker update project action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to deploy a preview via worker API
 * @param projectId - Project ID (null for new projects)
 * @param templateData - Template data for deployment
 * @param generateProjectId - Whether to generate a new project ID
 * @returns Deployment result from worker API
 */
export async function deployPreviewAction(
  projectId: string | null,
  templateData: any,
  generateProjectId: boolean = false
) {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Call the worker API
    const result = await PreviewDeploymentService.deployPreview(
      projectId,
      templateData,
      generateProjectId
    )

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    if (projectId) {
      revalidatePath(`/builder/${projectId}`)
    }

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Worker deploy preview action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}