'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { dashboardEventCoordinator } from '@/services/events/dashboard-coordinator'
import { useAuthStore } from '@/store'
import type { Project } from './use-projects'

interface CreateProjectRequest {
  name: string
  description?: string
  templateId?: string
  currencyCode?: string
  config: any
}

interface UpdateProjectRequest {
  name?: string
  config?: any
  archived_at?: string | null
}

// Import centralized query keys
import { projectsKeys } from '@/lib/query-keys'

// Fetch projects function
async function fetchProjects(userId?: string): Promise<Project[]> {
  if (!userId) {
    return []
  }

  logger.info('📂 Fetching projects', {
    userId: userId.slice(0, 8)
  })

  const response = await fetch('/api/projects', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // ✅ EXPERT FIX: Ensure cookies are sent
    cache: 'no-store',
  })

  if (!response.ok) {
    // ✅ EXPERT FIX: Structured error for retry logic
    const error = new Error(`Failed to fetch projects: ${response.status}`)
    if (response.status === 401) {
      ;(error as any).status = 401
      ;(error as any).code = 'NO_USER'
    }
    throw error
  }

  const data = await response.json()
  
  // ✅ FIX: Handle both response formats (ok + data structure vs success structure)
  if (!data.ok && !data.success) {
    throw new Error(data.error || 'Failed to fetch projects')
  }

  // ✅ FIX: Extract projects from correct location in response
  const projects = data.data?.projects || data.projects || []

  logger.info('✅ Projects loaded', {
    projectCount: projects.length,
    responseFormat: data.ok ? 'ok+data' : 'success',
    hasDataWrapper: !!data.data
  })

  return projects
}

// Create project function
async function createProject(data: CreateProjectRequest): Promise<Project> {
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

  logger.info('✅ Project created', {
    projectId: result.project.id.slice(0, 8),
    name: result.project.name
  })

  return result.project
}

// Update project function
async function updateProject({ id, ...data }: UpdateProjectRequest & { id: string }): Promise<Project> {
  logger.info('📂 Updating project', {
    projectId: id.slice(0, 8),
    updates: Object.keys(data),
    updateData: data,
    hasArchivedAt: 'archived_at' in data,
    archivedAtValue: data.archived_at
  })

  const response = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    let errorDetails = `${response.status}`
    try {
      const errorBody = await response.json()
      errorDetails = errorBody.error || errorBody.message || errorDetails
    } catch {
      // Couldn't parse error response
    }
    throw new Error(`Failed to update project: ${errorDetails}`)
  }

  const result = await response.json()
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to update project')
  }

  if (!result.project) {
    logger.error('❌ Update response missing project data', {
      result,
      hasSuccess: result.success,
      keys: Object.keys(result)
    })
    throw new Error('Update response missing project data')
  }

  logger.info('✅ Project updated', {
    projectId: result.project.id.slice(0, 8)
  })

  return result.project
}

// Duplicate project function
async function duplicateProject(id: string): Promise<Project> {
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

  logger.info('✅ Project duplicated', {
    originalId: id.slice(0, 8),
    duplicateId: result.project.id.slice(0, 8)
  })

  return result.project
}

// Custom hook for projects query
export function useProjectsQuery(userId?: string, options?: {
  enabled?: boolean
  retry?: (count: number, error: any) => boolean
  refetchOnWindowFocus?: boolean
  staleTime?: number
}) {
  // ✅ FIXED: Use useAuthStore directly instead of problematic useAuthStatus
  const { isAuthenticated, user } = useAuthStore()
  const queryKey = projectsKeys.byUser(userId || '')
  
  // ✅ FIXED: Now using correct server auth store via conditional export
  const enabled = isAuthenticated && 
                 Boolean(userId) && 
                 (options?.enabled !== false)
  
  console.log('🔍 DEBUG: useProjectsQuery called', {
    isAuthenticated,
    hasUser: !!user,
    authStoreUserId: user?.id?.slice(0, 8),
    passedUserId: userId?.slice(0, 8),
    enabled,
    optionsEnabled: options?.enabled,
    userObject: user,
    storeSource: 'useAuthStore from /store (conditional export - should be server auth store)'
  })
  
  logger.info('📊 Projects query auth gating', {
    isAuthenticated,
    hasUser: !!user,
    userId: userId?.slice(0, 8),
    enabled
  })
  
  // ✅ CRITICAL FIX: ALWAYS call useQuery hook - use enabled to gate execution
  const query = useQuery({
    queryKey,
    queryFn: () => fetchProjects(userId),
    enabled,
    retry: options?.retry || ((count, err: any) => {
      // Short-circuit 401s and auth errors
      if (err?.status === 401 || err?.code === 'NO_USER') return false
      return count < 2
    }),
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: options?.staleTime ?? 30_000,
  })
  
  // Log query key for debugging
  useEffect(() => {
    logger.info('📊 Projects query setup', {
      queryKey,
      queryKeyString: JSON.stringify(queryKey),
      userId: userId?.slice(0, 8),
      enabled // Use actual computed enabled value, not !!userId
    })
  }, [userId, queryKey, enabled])
  
  return query
}

// Custom hook for project mutations
export function useProjectMutations(userId?: string) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  
  // Use passed userId or fall back to auth store user
  const effectiveUserId = userId || user?.id
  
  logger.info('🔧 useProjectMutations setup', {
    passedUserId: userId?.slice(0, 8),
    authUserId: user?.id?.slice(0, 8),
    effectiveUserId: effectiveUserId?.slice(0, 8)
  })

  const createMutation = useMutation({
    mutationFn: async (data: CreateProjectRequest) => {
      // WORKER TEAM DEBUGGING: Log React Query mutation attempts
      console.log('🔄 [NextJS React Query] CREATE PROJECT MUTATION STARTED:', {
        timestamp: new Date().toISOString(),
        userId: effectiveUserId?.slice(0, 8),
        projectName: data.name,
        mutationId: 'create-project-' + Date.now()
      });
      
      try {
        const result = await createProject(data);
        
        console.log('✅ [NextJS React Query] CREATE PROJECT MUTATION SUCCESS:', {
          timestamp: new Date().toISOString(),
          projectId: result.id?.slice(0, 8),
          projectName: result.name
        });
        
        return result;
      } catch (error) {
        console.error('❌ [NextJS React Query] CREATE PROJECT MUTATION ERROR:', {
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          willRetry: true // React Query will retry this automatically
        });
        throw error;
      }
    },
    onSuccess: (newProject) => {
      // Add to cache optimistically
      queryClient.setQueryData(
        projectsKeys.byUser(effectiveUserId || ''),
        (old: Project[] | undefined) => {
          return old ? [newProject, ...old] : [newProject]
        }
      )
      
      // Emit dashboard event
      if (user) {
        dashboardEventCoordinator.emitProjectAction(
          'create',
          [newProject.id],
          user.id,
          newProject.name
        )
      }
    },
    onError: (error) => {
      if (user) {
        dashboardEventCoordinator.emitErrorEvent('create', error, user.id)
      }
      logger.error('Failed to create project', error)
    },
  })

  const updateMutation = useMutation({
    mutationFn: updateProject,
    onMutate: async (variables) => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      logger.info('🔄 Starting optimistic update', {
        queryKey,
        queryKeyString: JSON.stringify(queryKey),
        effectiveUserId: effectiveUserId?.slice(0, 8),
        projectId: variables.id,
        newName: variables.name
      })
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })
      
      // Snapshot the previous value
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey)
      
      // Debug: Log all cache keys
      const allCacheData = queryClient.getQueryCache().getAll()
      const allKeys = allCacheData.map(q => q.queryKey)
      
      logger.info('📊 Current cache state', {
        queryKey,
        queryKeyString: JSON.stringify(queryKey),
        hasData: !!previousProjects,
        projectCount: previousProjects?.length,
        allCacheKeys: allKeys.map(k => JSON.stringify(k)),
        matchingKey: allKeys.find(k => JSON.stringify(k) === JSON.stringify(queryKey))
      })
      
      // Optimistically update
      queryClient.setQueryData(
        queryKey,
        (old: Project[] | undefined) => {
          const updated = old?.map(project => 
            project.id === variables.id 
              ? { ...project, ...variables, updated_at: new Date().toISOString() }
              : project
          ) || []
          
          logger.info('✅ Optimistic update applied', {
            queryKey,
            oldCount: old?.length,
            updatedCount: updated.length,
            updatedProject: updated.find(p => p.id === variables.id)?.name
          })
          
          return updated
        }
      )
      
      return { previousProjects }
    },
    onSuccess: (updatedProject, variables) => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Update cache with server response
      queryClient.setQueryData(
        queryKey,
        (old: Project[] | undefined) => {
          return old?.map(project => 
            project.id === updatedProject.id ? updatedProject : project
          ) || []
        }
      )
      
      logger.info('📝 Server response applied to cache', {
        queryKey,
        projectId: updatedProject.id,
        projectName: updatedProject.name
      })
    },
    onError: (error, variables, context) => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKey, context.previousProjects)
      }
      logger.error('Failed to update project', error)
    },
    onSettled: () => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Invalidate queries - React Query will handle the refetch
      queryClient.invalidateQueries({ queryKey })
      
      logger.info('🔃 Queries invalidated', { queryKey })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateProject,
    onMutate: async (projectId) => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })
      
      // Get the project to duplicate
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey)
      
      const projectToDuplicate = previousProjects?.find(p => p.id === projectId)
      
      if (projectToDuplicate) {
        // Create optimistic duplicate
        const tempId = `temp_${Date.now()}`
        const optimisticDuplicate = {
          ...projectToDuplicate,
          id: tempId,
          name: `Copy of ${projectToDuplicate.name}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        // Add optimistic duplicate to cache
        queryClient.setQueryData(
          queryKey,
          (old: Project[] | undefined) => {
            return old ? [optimisticDuplicate, ...old] : [optimisticDuplicate]
          }
        )
        
        return { previousProjects, tempId }
      }
      
      return { previousProjects }
    },
    onSuccess: (newProject, variables, context) => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Replace temp project with real one
      if (context?.tempId) {
        queryClient.setQueryData(
          queryKey,
          (old: Project[] | undefined) => {
            return old?.map(project => 
              project.id === context.tempId ? newProject : project
            ) || []
          }
        )
      }
    },
    onError: (error, variables, context) => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKey, context.previousProjects)
      }
      logger.error('Failed to duplicate project', error)
    },
    onSettled: () => {
      const queryKey = projectsKeys.byUser(effectiveUserId || '')
      
      // Invalidate queries - React Query will handle the refetch
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    createProject: createMutation,
    updateProject: updateMutation,
    duplicateProject: duplicateMutation,
  }
}