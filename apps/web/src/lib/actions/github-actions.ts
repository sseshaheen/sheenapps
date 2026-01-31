/**
 * Server Actions for GitHub Integration
 * Provides secure server-side interface to GitHub sync operations
 * Prevents client-side exposure of GitHub secrets and HMAC keys
 */

import 'server-only'

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { 
  githubAPIClient,
  getGitHubInstallations,
  getGitHubRepositories,
  getProjectGitHubConfig,
  pushProjectToGitHub,
  pullProjectFromGitHub,
  syncProjectWithGitHub
} from '@/server/services/github-api-client'
import {
  GitHubInstallation,
  GitHubRepository,
  GitHubBranch,
  ProjectGitHubConfig,
  GitHubSyncOperation,
  GitHubInstallationsResponse,
  GitHubRepositoriesResponse,
  GitHubBranchesResponse,
  GitHubSyncMode
} from '@/types/github-sync'
import { revalidatePath } from 'next/cache'

/**
 * Server action to get GitHub installations for the authenticated user
 * @returns User's GitHub installations
 */
export async function getGitHubInstallationsAction(): Promise<{
  success: boolean
  data?: GitHubInstallationsResponse
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Get GitHub installations via API client
    const result = await getGitHubInstallations(user.id)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('GitHub installations action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to get repositories for a GitHub installation
 * @param installationId - GitHub installation ID
 * @param options - Search and pagination options
 * @returns Repositories for the installation
 */
export async function getGitHubRepositoriesAction(
  installationId: number,
  options: { search?: string; cursor?: string; limit?: number } = {}
): Promise<{
  success: boolean
  data?: GitHubRepositoriesResponse
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Get repositories via API client
    const result = await getGitHubRepositories(installationId, user.id, options)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('GitHub repositories action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to get branches for a GitHub repository
 * @param installationId - GitHub installation ID
 * @param repositoryId - GitHub repository ID
 * @returns Repository branches
 */
export async function getGitHubBranchesAction(
  installationId: number,
  repositoryId: number
): Promise<{
  success: boolean
  data?: GitHubBranchesResponse
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Get branches via API client
    const result = await githubAPIClient.getBranches(installationId, repositoryId, user.id)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('GitHub branches action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to get GitHub configuration for a project
 * @param projectId - Project ID
 * @returns Project's GitHub configuration
 */
export async function getProjectGitHubConfigAction(
  projectId: string
): Promise<{
  success: boolean
  data?: ProjectGitHubConfig | null
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Get project GitHub config via API client
    const result = await getProjectGitHubConfig(projectId, user.id)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Get project GitHub config action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to update GitHub configuration for a project
 * @param projectId - Project ID
 * @param config - GitHub configuration to update
 * @returns Updated GitHub configuration
 */
export async function updateProjectGitHubConfigAction(
  projectId: string,
  config: Partial<ProjectGitHubConfig>
): Promise<{
  success: boolean
  data?: ProjectGitHubConfig
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Update project GitHub config via API client
    const result = await githubAPIClient.updateProjectConfig(projectId, config, user.id)

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    revalidatePath(`/builder/workspace/${projectId}`)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Update project GitHub config action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to delete GitHub configuration for a project
 * @param projectId - Project ID
 * @returns Deletion result
 */
export async function deleteProjectGitHubConfigAction(
  projectId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Delete project GitHub config via API client
    await githubAPIClient.deleteProjectConfig(projectId, user.id)

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    revalidatePath(`/builder/workspace/${projectId}`)

    return {
      success: true
    }
  } catch (error) {
    console.error('Delete project GitHub config action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to push project to GitHub
 * @param projectId - Project ID
 * @param options - Push options
 * @returns Push operation result
 */
export async function pushProjectToGitHubAction(
  projectId: string,
  options: {
    commitMessage?: string
    branch?: string
    createPR?: boolean
    prTitle?: string
    prBody?: string
  } = {}
): Promise<{
  success: boolean
  data?: GitHubSyncOperation
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Push to GitHub via API client
    const result = await pushProjectToGitHub(projectId, user.id, options)

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    revalidatePath(`/builder/workspace/${projectId}`)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Push to GitHub action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to pull project from GitHub
 * @param projectId - Project ID
 * @param options - Pull options
 * @returns Pull operation result
 */
export async function pullProjectFromGitHubAction(
  projectId: string,
  options: { branch?: string; commitSha?: string } = {}
): Promise<{
  success: boolean
  data?: GitHubSyncOperation
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Pull from GitHub via API client
    const result = await pullProjectFromGitHub(projectId, user.id, options)

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    revalidatePath(`/builder/workspace/${projectId}`)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Pull from GitHub action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to sync project with GitHub
 * @param projectId - Project ID
 * @param options - Sync options
 * @returns Sync operation result
 */
export async function syncProjectWithGitHubAction(
  projectId: string,
  options: {
    direction: 'push' | 'pull' | 'bidirectional'
    resolveConflicts?: 'ours' | 'theirs' | 'manual'
  }
): Promise<{
  success: boolean
  data?: GitHubSyncOperation
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Sync with GitHub via API client
    const result = await syncProjectWithGitHub(projectId, user.id, options)

    // Revalidate relevant paths to refresh UI
    revalidatePath('/dashboard')
    revalidatePath(`/builder/workspace/${projectId}`)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Sync with GitHub action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to get GitHub sync operation status
 * @param operationId - Operation ID
 * @returns Operation status
 */
export async function getGitHubSyncOperationAction(
  operationId: string
): Promise<{
  success: boolean
  data?: GitHubSyncOperation
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Get sync operation via API client
    const result = await githubAPIClient.getSyncOperation(operationId, user.id)

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Get GitHub sync operation action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to cancel GitHub sync operation
 * @param operationId - Operation ID
 * @returns Cancellation result
 */
export async function cancelGitHubSyncOperationAction(
  operationId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Cancel sync operation via API client
    await githubAPIClient.cancelSyncOperation(operationId, user.id)

    return {
      success: true
    }
  } catch (error) {
    console.error('Cancel GitHub sync operation action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Server action to create a new branch in GitHub repository
 * @param installationId - GitHub installation ID
 * @param repositoryId - GitHub repository ID
 * @param branchName - New branch name
 * @param fromBranch - Base branch to create from
 * @returns Created branch
 */
export async function createGitHubBranchAction(
  installationId: number,
  repositoryId: number,
  branchName: string,
  fromBranch: string
): Promise<{
  success: boolean
  data?: GitHubBranch
  error?: string
}> {
  try {
    // Get authenticated user from session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new Error('Unauthorized - invalid session')
    }

    // Create branch via API client
    const result = await githubAPIClient.createBranch(
      installationId,
      repositoryId,
      branchName,
      fromBranch,
      user.id
    )

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Create GitHub branch action failed:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}