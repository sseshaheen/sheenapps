/**
 * File Editing Hook
 *
 * Provides file editing capabilities for workspace components
 * Part of Phase 3 client integration preparation
 */

'use client'

import { useState, useCallback } from 'react'
import { workspaceFileOperations, FileEditResult } from '@/services/workspace-file-operations'
import { useWorkspacePermissionContext } from '@/components/workspace/shared/permission-gate'
import { useWorkspacePermissions } from '@/hooks/workspace/use-workspace-permissions'
import { logger } from '@/utils/logger'

interface UseFileEditingProps {
  projectId: string
  onFileChanged?: (filePath: string) => void
  onFileCreated?: (filePath: string) => void
  onFileDeleted?: (filePath: string) => void
}

interface UseFileEditingResult {
  // File operations
  saveFile: (filePath: string, content: string, options?: SaveFileOptions) => Promise<FileEditResult>
  createFile: (filePath: string, content: string) => Promise<FileEditResult>
  deleteFile: (filePath: string) => Promise<FileEditResult>
  moveFile: (oldPath: string, newPath: string) => Promise<FileEditResult>

  // State
  savingFiles: Set<string>
  errors: Map<string, string>
  pendingOperations: number

  // Utilities
  clearError: (filePath: string) => void
  clearAllErrors: () => void
  canEdit: boolean
  canCreate: boolean
  canDelete: boolean
}

interface SaveFileOptions {
  etag?: string
  createIfNotExists?: boolean
  validateSyntax?: boolean
}

export function useFileEditing({
  projectId,
  onFileChanged,
  onFileCreated,
  onFileDeleted
}: UseFileEditingProps): UseFileEditingResult {
  const [savingFiles, setSavingFiles] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  const context = useWorkspacePermissionContext()
  const { permissions } = useWorkspacePermissions({ context })

  const canEdit = permissions.canEditFiles
  const canCreate = permissions.canEditFiles
  const canDelete = permissions.canEditFiles

  const clearError = useCallback((filePath: string) => {
    setErrors(prev => {
      const newErrors = new Map(prev)
      newErrors.delete(filePath)
      return newErrors
    })
  }, [])

  const clearAllErrors = useCallback(() => {
    setErrors(new Map())
  }, [])

  const setFileError = useCallback((filePath: string, error: string) => {
    setErrors(prev => new Map(prev).set(filePath, error))
  }, [])

  const setSaving = useCallback((filePath: string, saving: boolean) => {
    setSavingFiles(prev => {
      const newSet = new Set(prev)
      if (saving) {
        newSet.add(filePath)
      } else {
        newSet.delete(filePath)
      }
      return newSet
    })
  }, [])

  const saveFile = useCallback(async (
    filePath: string,
    content: string,
    options: SaveFileOptions = {}
  ): Promise<FileEditResult> => {
    if (!canEdit) {
      const error = 'No permission to edit files'
      setFileError(filePath, error)
      return { success: false, error }
    }

    clearError(filePath)
    setSaving(filePath, true)

    try {
      logger.info('Saving file', {
        projectId,
        filePath,
        userId: context.userId,
        contentLength: content.length
      }, 'file-editing')

      const result = await workspaceFileOperations.saveFile(
        projectId,
        filePath,
        content,
        context.userId,
        options
      )

      if (result.success) {
        onFileChanged?.(filePath)
      } else {
        setFileError(filePath, result.error || 'Failed to save file')
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setFileError(filePath, errorMessage)

      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setSaving(filePath, false)
    }
  }, [canEdit, projectId, context.userId, clearError, setSaving, setFileError, onFileChanged])

  const createFile = useCallback(async (
    filePath: string,
    content: string
  ): Promise<FileEditResult> => {
    if (!canCreate) {
      const error = 'No permission to create files'
      setFileError(filePath, error)
      return { success: false, error }
    }

    clearError(filePath)
    setSaving(filePath, true)

    try {
      logger.info('Creating file', {
        projectId,
        filePath,
        userId: context.userId,
        contentLength: content.length
      }, 'file-editing')

      const result = await workspaceFileOperations.createFile(
        projectId,
        filePath,
        content,
        context.userId
      )

      if (result.success) {
        onFileCreated?.(filePath)
      } else {
        setFileError(filePath, result.error || 'Failed to create file')
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setFileError(filePath, errorMessage)

      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setSaving(filePath, false)
    }
  }, [canCreate, projectId, context.userId, clearError, setSaving, setFileError, onFileCreated])

  const deleteFile = useCallback(async (filePath: string): Promise<FileEditResult> => {
    if (!canDelete) {
      const error = 'No permission to delete files'
      setFileError(filePath, error)
      return { success: false, error }
    }

    clearError(filePath)
    setSaving(filePath, true)

    try {
      logger.info('Deleting file', {
        projectId,
        filePath,
        userId: context.userId
      }, 'file-editing')

      const result = await workspaceFileOperations.deleteFile(
        projectId,
        filePath,
        context.userId
      )

      if (result.success) {
        onFileDeleted?.(filePath)
      } else {
        setFileError(filePath, result.error || 'Failed to delete file')
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setFileError(filePath, errorMessage)

      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setSaving(filePath, false)
    }
  }, [canDelete, projectId, context.userId, clearError, setSaving, setFileError, onFileDeleted])

  const moveFile = useCallback(async (
    oldPath: string,
    newPath: string
  ): Promise<FileEditResult> => {
    if (!canEdit) {
      const error = 'No permission to move files'
      setFileError(oldPath, error)
      return { success: false, error }
    }

    clearError(oldPath)
    clearError(newPath)
    setSaving(oldPath, true)

    try {
      logger.info('Moving file', {
        projectId,
        oldPath,
        newPath,
        userId: context.userId
      }, 'file-editing')

      const result = await workspaceFileOperations.moveFile(
        projectId,
        oldPath,
        newPath,
        context.userId
      )

      if (result.success) {
        onFileDeleted?.(oldPath)
        onFileCreated?.(newPath)
      } else {
        setFileError(oldPath, result.error || 'Failed to move file')
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setFileError(oldPath, errorMessage)

      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setSaving(oldPath, false)
    }
  }, [canEdit, projectId, context.userId, clearError, setSaving, setFileError, onFileCreated, onFileDeleted])

  const pendingOperations = workspaceFileOperations.getPendingOperations(projectId).length

  return {
    saveFile,
    createFile,
    deleteFile,
    moveFile,
    savingFiles,
    errors,
    pendingOperations,
    clearError,
    clearAllErrors,
    canEdit,
    canCreate,
    canDelete
  }
}