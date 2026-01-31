/**
 * 🎬 Project Repository Server Actions
 * 
 * Phase 2.4: Repository Pattern - Demo Implementation
 * Example server actions using the new repository pattern
 * 
 * PURPOSE: Show how to integrate repositories with server actions
 * DEMONSTRATES: Type-safe operations, error handling, revalidation
 * 
 * NOTE: These actions demonstrate the pattern. Integrate with your existing
 * project actions or use as reference for new implementations.
 */

'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { ProjectRepository, type CreateProjectData, type UpdateProjectData } from '@/lib/server/repositories'

// ====================================
// PROJECT CRUD ACTIONS
// ====================================

/**
 * Create a new project using repository pattern
 * Demonstrates: Type-safe creation, error handling, cache invalidation
 */
export async function createProjectWithRepository(formData: FormData) {
  try {
    const projectData: CreateProjectData = {
      name: formData.get('name') as string,
      template_id: formData.get('template_id') as string || undefined,
      config: {} // Default empty config
      // Note: description field removed as it doesn't exist in database schema
    }

    // Validate required fields
    if (!projectData.name?.trim()) {
      return { 
        success: false, 
        error: 'Project name is required' 
      }
    }

    // Use repository for creation
    const project = await ProjectRepository.create(projectData)

    // Cache invalidation
    revalidateTag('projects', 'max')
    revalidateTag('user-projects', 'max')

    return { 
      success: true, 
      project,
      message: `Project "${project.name}" created successfully` 
    }

  } catch (error) {
    console.error('Create project error:', error)
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to create project'

    return { 
      success: false, 
      error: errorMessage 
    }
  }
}

/**
 * Update project using repository pattern
 * Demonstrates: Access control, partial updates, optimistic UI
 */
export async function updateProjectWithRepository(
  projectId: string, 
  updates: UpdateProjectData
) {
  try {
    // Repository handles access control automatically
    const project = await ProjectRepository.update(projectId, updates)

    // Granular cache invalidation
    revalidateTag('projects', 'max')
    revalidateTag(`project:${projectId}`, 'max')
    revalidateTag('user-projects', 'max')

    return { 
      success: true, 
      project,
      message: `Project "${project.name}" updated successfully` 
    }

  } catch (error) {
    console.error('Update project error:', error)
    
    // Handle different error types
    if (error instanceof Error) {
      if (error.message.includes('Forbidden')) {
        return { 
          success: false, 
          error: 'You don\'t have permission to update this project',
          code: 'FORBIDDEN'
        }
      }
      
      if (error.message.includes('not found')) {
        return { 
          success: false, 
          error: 'Project not found',
          code: 'NOT_FOUND'
        }
      }
    }

    return { 
      success: false, 
      error: 'Failed to update project' 
    }
  }
}

/**
 * Delete project with confirmation
 * Demonstrates: Access control, cascade considerations, redirect
 */
export async function deleteProjectWithRepository(projectId: string) {
  try {
    // Get project info before deletion (for confirmation)
    const project = await ProjectRepository.findById(projectId)
    
    if (!project) {
      return { 
        success: false, 
        error: 'Project not found' 
      }
    }

    // Repository handles access control
    await ProjectRepository.delete(projectId)

    // Cache invalidation
    revalidateTag('projects', 'max')
    revalidateTag(`project:${projectId}`, 'max')
    revalidateTag('user-projects', 'max')

    return { 
      success: true, 
      message: `Project "${project.name}" deleted successfully` 
    }

  } catch (error) {
    console.error('Delete project error:', error)
    
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return { 
        success: false, 
        error: 'You don\'t have permission to delete this project' 
      }
    }

    return { 
      success: false, 
      error: 'Failed to delete project' 
    }
  }
}

// ====================================
// BUILD MANAGEMENT ACTIONS
// ====================================

/**
 * Update build status using repository
 * Used by build system integration
 */
export async function updateBuildStatusAction(
  projectId: string,
  buildStatus: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded',
  buildId?: string,
  previewUrl?: string
) {
  try {
    const project = await ProjectRepository.updateBuildStatus(
      projectId, 
      buildStatus, 
      buildId, 
      previewUrl
    )

    // Invalidate build-related caches
    revalidateTag(`project:${projectId}`, 'max')
    revalidateTag(`build:${projectId}`, 'max')

    return { 
      success: true, 
      project,
      message: `Build status updated to "${buildStatus}"` 
    }

  } catch (error) {
    console.error('Update build status error:', error)
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update build status' 
    }
  }
}

// ====================================
// QUERY ACTIONS (for server components)
// ====================================

/**
 * Get user projects (for server components)
 * Demonstrates: Repository queries in server components
 */
export async function getUserProjectsAction() {
  try {
    const projects = await ProjectRepository.findByOwner()
    
    return { 
      success: true, 
      projects 
    }

  } catch (error) {
    console.error('Get user projects error:', error)
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/auth/login')
    }

    return { 
      success: false, 
      error: 'Failed to load projects',
      projects: []
    }
  }
}

/**
 * Get project by ID (for server components)
 */
export async function getProjectByIdAction(projectId: string) {
  try {
    const project = await ProjectRepository.findById(projectId)
    
    if (!project) {
      return { 
        success: false, 
        error: 'Project not found',
        project: null 
      }
    }

    return { 
      success: true, 
      project 
    }

  } catch (error) {
    console.error('Get project by ID error:', error)
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/auth/login')
    }

    return { 
      success: false, 
      error: 'Failed to load project',
      project: null 
    }
  }
}

// ====================================
// EXPERT IMPLEMENTATION NOTES
// ====================================

/*
REPOSITORY INTEGRATION PATTERNS:

1. ✅ ERROR HANDLING:
   - Repository throws descriptive errors
   - Server actions catch and transform for UI
   - Different error types handled appropriately
   - Auth errors trigger redirects

2. ✅ CACHE INVALIDATION:
   - Granular tag-based invalidation
   - User-specific and project-specific tags
   - Build status updates invalidate relevant caches

3. ✅ TYPE SAFETY:
   - Repository interfaces ensure correct data types
   - Server actions validate input data
   - Return types consistent for client handling

4. ✅ ACCESS CONTROL:
   - Repository enforces access control automatically
   - Server actions don't need to duplicate security logic
   - Consistent permission handling across all operations

INTEGRATION EXAMPLES:

// ✅ Use in forms with server actions
<form action={createProjectWithRepository}>
  <input name="name" required />
  <input name="description" />
  <button type="submit">Create Project</button>
</form>

// ✅ Use in API routes
export async function POST(request: Request) {
  const { name, description } = await request.json()
  
  const project = await ProjectRepository.create({ name, description })
  return NextResponse.json(project)
}

// ✅ Use in server components
async function ProjectsList() {
  const { projects } = await getUserProjectsAction()
  
  return (
    <div>
      {projects.map(project => (
        <div key={project.id}>{project.name}</div>
      ))}
    </div>
  )
}

MIGRATION STRATEGY:
1. Start using repository actions for new features
2. Gradually replace existing direct database calls
3. Test each migration step thoroughly
4. Keep backward compatibility during transition
*/