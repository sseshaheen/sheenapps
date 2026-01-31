'use client'

import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { dashboardEventCoordinator } from '@/services/events/dashboard-coordinator'
import { useAuthStore } from '@/store'

// Project interface based on sanitized API response (sensitive config data removed)
export interface Project {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
  archived_at?: string | null
  // Only template data is exposed for preview functionality
  templateData?: any | null
  hasTemplate?: boolean
  // Legacy fields for backwards compatibility
  subdomain?: string | null
  last_accessed_at?: string | null
  thumbnail_url?: string | null
  user_id?: string
  
  // ✅ NEW: Version information (worker team integration)
  current_version_id?: string | null
  current_version_name?: string | null
  build_status?: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded'
  preview_url?: string | null
  framework?: string
  last_build_started?: string | null
  last_build_completed?: string | null
}

interface CreateProjectRequest {
  name: string
  description?: string
  config: any
}

interface UpdateProjectRequest {
  name?: string
  config?: any
  archived_at?: string | null
}

interface UseProjectsReturn {
  projects: Project[] | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  createProject: (data: CreateProjectRequest) => Promise<Project>
  updateProject: (id: string, data: UpdateProjectRequest) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<Project>
}

export function useProjects(userId?: string): UseProjectsReturn {
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    if (!userId) {
      setProjects([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      logger.info('📂 Fetching projects', {
        userId: userId.slice(0, 8)
      })

      const response = await fetch(`/api/projects?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store'
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`)
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch projects')
      }

      setProjects(data.projects)
      logger.info('✅ Projects loaded', {
        projectCount: data.projects.length
      })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      logger.error('Failed to fetch projects', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const createProject = useCallback(async (data: CreateProjectRequest): Promise<Project> => {
    const startTime = Date.now()
    
    try {
      logger.info('📂 Creating project', {
        name: data.name,
        hasConfig: !!data.config
      })

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error(`Failed to create project: ${response.status}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create project')
      }

      const newProject = result.project
      const duration = Date.now() - startTime
      
      // Update local state
      setProjects(prev => prev ? [newProject, ...prev] : [newProject])
      
      // Emit dashboard event (API level)
      if (user) {
        dashboardEventCoordinator.emitProjectAction(
          'create',
          [newProject.id],
          user.id,
          newProject.name
        )
      }
      
      logger.info('✅ Project created', {
        projectId: newProject.id.slice(0, 8),
        name: newProject.name,
        duration
      })

      return newProject

    } catch (err) {
      // Emit error event
      if (user) {
        dashboardEventCoordinator.emitErrorEvent(
          'create',
          err,
          user.id
        )
      }
      logger.error('Failed to create project', err)
      throw err
    }
  }, [user])

  const updateProject = useCallback(async (id: string, data: UpdateProjectRequest): Promise<Project> => {
    try {
      logger.info('📂 Updating project', {
        projectId: id.slice(0, 8),
        updates: Object.keys(data),
        data: JSON.stringify(data)
      })

      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        // Try to get error details from response
        let errorDetails = `${response.status}`
        try {
          const errorBody = await response.json()
          errorDetails = errorBody.error || errorBody.message || errorDetails
          console.error('API Error Response:', errorBody)
        } catch {
          // Couldn't parse error response
        }
        throw new Error(`Failed to update project: ${errorDetails}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update project')
      }

      const updatedProject = result.project
      
      // Update local state
      setProjects(prev => 
        prev?.map(p => p.id === id ? updatedProject : p) || null
      )
      
      logger.info('✅ Project updated', {
        projectId: updatedProject.id.slice(0, 8)
      })

      return updatedProject

    } catch (err) {
      logger.error('Failed to update project', err)
      throw err
    }
  }, [])

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    try {
      logger.info('📂 Deleting project', {
        projectId: id.slice(0, 8)
      })

      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to delete project: ${response.status}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete project')
      }
      
      // Update local state
      setProjects(prev => 
        prev?.filter(p => p.id !== id) || null
      )
      
      logger.info('✅ Project deleted', {
        projectId: id.slice(0, 8)
      })

    } catch (err) {
      logger.error('Failed to delete project', err)
      throw err
    }
  }, [])

  const duplicateProject = useCallback(async (id: string): Promise<Project> => {
    try {
      logger.info('📂 Duplicating project', {
        projectId: id.slice(0, 8)
      })

      const response = await fetch(`/api/projects/${id}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to duplicate project: ${response.status}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to duplicate project')
      }

      const duplicatedProject = result.project
      
      // Update local state
      setProjects(prev => prev ? [duplicatedProject, ...prev] : [duplicatedProject])
      
      logger.info('✅ Project duplicated', {
        originalId: id.slice(0, 8),
        duplicateId: duplicatedProject.id.slice(0, 8)
      })

      return duplicatedProject

    } catch (err) {
      logger.error('Failed to duplicate project', err)
      throw err
    }
  }, [])

  // Fetch projects when userId changes
  useEffect(() => {
    if (userId) {
      fetchProjects()
    } else {
      setProjects([])
      setError(null)
    }
  }, [userId, fetchProjects])

  return {
    projects,
    isLoading,
    error,
    refetch: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject
  }
}