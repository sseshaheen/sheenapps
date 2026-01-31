'use client'

import { useState, useCallback, useEffect } from 'react'
import { useProjects } from './use-projects'
import { logger } from '@/utils/logger'

// Wrapper around useProjects that adds optimistic update functionality
export function useProjectsOptimistic(userId?: string) {
  const {
    projects,
    isLoading,
    error,
    refetch,
    createProject: originalCreate,
    updateProject: originalUpdate,
    deleteProject: originalDelete,
    duplicateProject: originalDuplicate
  } = useProjects(userId)
  
  const [optimisticProjects, setOptimisticProjects] = useState(projects)
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set())
  
  // Sync optimistic state with real state when it changes
  useEffect(() => {
    if (projects && pendingUpdates.size === 0) {
      setOptimisticProjects(projects)
    }
  }, [projects, pendingUpdates.size])
  
  // Optimistic update wrapper
  const updateProject = useCallback(async (id: string, data: any) => {
    // Find the project to update
    const projectToUpdate = optimisticProjects?.find(p => p.id === id)
    if (!projectToUpdate) throw new Error('Project not found')
    
    // Apply optimistic update immediately
    const optimisticProject = { ...projectToUpdate, ...data, updated_at: new Date().toISOString() }
    setOptimisticProjects(prev => 
      prev?.map(p => p.id === id ? optimisticProject : p) || null
    )
    
    // Track pending update
    setPendingUpdates(prev => new Set(prev).add(id))
    
    try {
      // Perform actual update
      const result = await originalUpdate(id, data)
      
      
      // Update succeeded - update with server response
      setOptimisticProjects(prev => 
        prev?.map(p => p.id === id ? result : p) || null
      )
      
      return result
    } catch (error) {
      // Rollback on failure
      logger.warn('Rolling back optimistic update', { projectId: id })
      setOptimisticProjects(prev => 
        prev?.map(p => p.id === id ? projectToUpdate : p) || null
      )
      throw error
    } finally {
      // Remove from pending
      setPendingUpdates(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [optimisticProjects, originalUpdate])
  
  // Optimistic delete wrapper
  const deleteProject = useCallback(async (id: string) => {
    // Store project for rollback
    const projectToDelete = optimisticProjects?.find(p => p.id === id)
    if (!projectToDelete) throw new Error('Project not found')
    
    // Remove immediately
    setOptimisticProjects(prev => 
      prev?.filter(p => p.id !== id) || null
    )
    
    // Track pending
    setPendingUpdates(prev => new Set(prev).add(id))
    
    try {
      await originalDelete(id)
      // Success - keep removed
    } catch (error) {
      // Rollback - restore project
      logger.warn('Rolling back optimistic delete', { projectId: id })
      setOptimisticProjects(prev => 
        prev ? [...prev, projectToDelete] : [projectToDelete]
      )
      throw error
    } finally {
      setPendingUpdates(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [optimisticProjects, originalDelete])
  
  // Optimistic duplicate wrapper  
  const duplicateProject = useCallback(async (id: string) => {
    const projectToDuplicate = optimisticProjects?.find(p => p.id === id)
    if (!projectToDuplicate) throw new Error('Project not found')
    
    // Create optimistic duplicate
    const tempId = `temp_${Date.now()}`
    const optimisticDuplicate = {
      ...projectToDuplicate,
      id: tempId,
      name: `Copy of ${projectToDuplicate.name}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    // Add immediately
    setOptimisticProjects(prev => 
      prev ? [optimisticDuplicate, ...prev] : [optimisticDuplicate]
    )
    
    // Track pending
    setPendingUpdates(prev => new Set(prev).add(tempId))
    
    try {
      const result = await originalDuplicate(id)
      
      // Replace temp with real
      setOptimisticProjects(prev => 
        prev?.map(p => p.id === tempId ? result : p) || null
      )
      
      return result
    } catch (error) {
      // Remove optimistic duplicate
      logger.warn('Rolling back optimistic duplicate', { projectId: id })
      setOptimisticProjects(prev => 
        prev?.filter(p => p.id !== tempId) || null
      )
      throw error
    } finally {
      setPendingUpdates(prev => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
    }
  }, [optimisticProjects, originalDuplicate])
  
  return {
    projects: optimisticProjects || projects,
    isLoading,
    error,
    refetch,
    createProject: originalCreate, // Create doesn't need optimistic update
    updateProject,
    deleteProject,
    duplicateProject,
    hasPendingUpdates: pendingUpdates.size > 0
  }
}