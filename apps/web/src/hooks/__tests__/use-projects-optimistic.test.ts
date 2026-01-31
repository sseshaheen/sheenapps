import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProjectsOptimistic } from '../use-projects-optimistic'
import { useProjects } from '../use-projects'
import type { Project } from '@/types/database'

// Mock the useProjects hook
vi.mock('../use-projects')

describe('useProjectsOptimistic', () => {
  const mockProjects: Project[] = [
    {
      id: '1',
      user_id: 'user-1',
      name: 'Project 1',
      description: 'Description 1',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      archived_at: null,
      metadata: {},
      deleted_at: null
    },
    {
      id: '2',
      user_id: 'user-1',
      name: 'Project 2',
      description: 'Description 2',
      created_at: '2024-01-02',
      updated_at: '2024-01-02',
      archived_at: null,
      metadata: {},
      deleted_at: null
    }
  ]

  const mockUseProjects = {
    projects: mockProjects,
    isLoading: false,
    error: null,
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    refetch: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useProjects).mockReturnValue(mockUseProjects)
  })

  it('should return projects from useProjects', () => {
    const { result } = renderHook(() => useProjectsOptimistic('user-1'))

    expect(result.current.projects).toEqual(mockProjects)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
  })

  describe('optimistic updates', () => {
    it('should optimistically update project name', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      // Simulate successful update
      mockUseProjects.updateProject.mockResolvedValueOnce({
        ...mockProjects[0],
        name: 'Updated Project 1'
      })

      await act(async () => {
        await result.current.updateProject('1', { name: 'Updated Project 1' })
      })

      // Check that updateProject was called
      expect(mockUseProjects.updateProject).toHaveBeenCalledWith('1', { name: 'Updated Project 1' })
    })

    it('should optimistically archive project', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      const archivedAt = new Date().toISOString()
      mockUseProjects.updateProject.mockResolvedValueOnce({
        ...mockProjects[0],
        archived_at: archivedAt
      })

      await act(async () => {
        await result.current.updateProject('1', { archived_at: archivedAt })
      })

      expect(mockUseProjects.updateProject).toHaveBeenCalledWith('1', { archived_at: archivedAt })
    })

    it('should optimistically restore project', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      mockUseProjects.updateProject.mockResolvedValueOnce({
        ...mockProjects[0],
        archived_at: null
      })

      await act(async () => {
        await result.current.updateProject('1', { archived_at: null })
      })

      expect(mockUseProjects.updateProject).toHaveBeenCalledWith('1', { archived_at: null })
    })

    it('should handle update errors and maintain original state', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      // Simulate failed update
      const error = new Error('Update failed')
      mockUseProjects.updateProject.mockRejectedValueOnce(error)

      await expect(
        act(async () => {
          await result.current.updateProject('1', { name: 'Failed Update' })
        })
      ).rejects.toThrow('Update failed')

      // Verify original state is maintained
      expect(result.current.projects).toEqual(mockProjects)
    })
  })

  describe('create project', () => {
    it('should create a new project', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      const newProject: Project = {
        id: '3',
        user_id: 'user-1',
        name: 'New Project',
        description: null,
        created_at: '2024-01-03',
        updated_at: '2024-01-03',
        archived_at: null,
        metadata: {},
        deleted_at: null
      }

      mockUseProjects.createProject.mockResolvedValueOnce(newProject)

      await act(async () => {
        const createdProject = await result.current.createProject({ name: 'New Project' })
        expect(createdProject).toEqual(newProject)
      })

      expect(mockUseProjects.createProject).toHaveBeenCalledWith({ name: 'New Project' })
    })

    it('should handle create errors', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      const error = new Error('Create failed')
      mockUseProjects.createProject.mockRejectedValueOnce(error)

      await expect(
        act(async () => {
          await result.current.createProject({ name: 'Failed Project' })
        })
      ).rejects.toThrow('Create failed')
    })
  })

  describe('delete project', () => {
    it('should delete a project', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      mockUseProjects.deleteProject.mockResolvedValueOnce(undefined)

      await act(async () => {
        await result.current.deleteProject('1')
      })

      expect(mockUseProjects.deleteProject).toHaveBeenCalledWith('1')
    })

    it('should handle delete errors', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      const error = new Error('Delete failed')
      mockUseProjects.deleteProject.mockRejectedValueOnce(error)

      await expect(
        act(async () => {
          await result.current.deleteProject('1')
        })
      ).rejects.toThrow('Delete failed')
    })
  })

  describe('duplicate project', () => {
    it('should duplicate a project', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      const duplicatedProject: Project = {
        ...mockProjects[0],
        id: '3',
        name: 'Copy of Project 1'
      }

      mockUseProjects.duplicateProject.mockResolvedValueOnce(duplicatedProject)

      await act(async () => {
        const duplicated = await result.current.duplicateProject('1')
        expect(duplicated).toEqual(duplicatedProject)
      })

      expect(mockUseProjects.duplicateProject).toHaveBeenCalledWith('1')
    })

    it('should handle duplicate errors', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      const error = new Error('Duplicate failed')
      mockUseProjects.duplicateProject.mockRejectedValueOnce(error)

      await expect(
        act(async () => {
          await result.current.duplicateProject('1')
        })
      ).rejects.toThrow('Duplicate failed')
    })
  })

  describe('pending updates tracking', () => {
    it('should track pending updates during async operations', async () => {
      const { result } = renderHook(() => useProjectsOptimistic('user-1'))

      expect(result.current.hasPendingUpdates).toBe(false)

      // Create a promise that we can control
      let resolveUpdate: (value: any) => void
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve
      })

      mockUseProjects.updateProject.mockReturnValueOnce(updatePromise)

      // Start the update
      act(() => {
        result.current.updateProject('1', { name: 'Pending Update' })
      })

      // Should have pending updates
      expect(result.current.hasPendingUpdates).toBe(true)

      // Resolve the update
      await act(async () => {
        resolveUpdate!({ ...mockProjects[0], name: 'Pending Update' })
        await updatePromise
      })

      // Should no longer have pending updates
      expect(result.current.hasPendingUpdates).toBe(false)
    })
  })
})