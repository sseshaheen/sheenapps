/**
 * Workspace File Operations Service
 *
 * Handles file editing operations for workspace
 * Part of Phase 3 client integration preparation
 */

import { logger } from '@/utils/logger'

export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'rename' | 'move'
  path: string
  newPath?: string // for rename/move operations
  content?: string // for create/update operations
  userId: string
  timestamp: Date
}

export interface FileEditResult {
  success: boolean
  etag?: string
  lastModified?: string
  error?: string
}

export interface FileValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

class WorkspaceFileOperationsService {
  private pendingOperations = new Map<string, FileOperation>()

  /**
   * Save file content to the workspace
   */
  async saveFile(
    projectId: string,
    filePath: string,
    content: string,
    userId: string,
    options: {
      etag?: string
      createIfNotExists?: boolean
      validateSyntax?: boolean
    } = {}
  ): Promise<FileEditResult> {
    try {
      logger.info('Saving file', {
        projectId,
        filePath,
        userId,
        contentLength: content.length
      }, 'workspace-file-ops')

      // Validate file before saving
      const validation = this.validateFileContent(filePath, content)
      if (!validation.valid) {
        return {
          success: false,
          error: `File validation failed: ${validation.errors.join(', ')}`
        }
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        logger.warn('File validation warnings', {
          filePath,
          warnings: validation.warnings
        }, 'workspace-file-ops')
      }

      // Prepare operation for audit trail
      const operation: FileOperation = {
        type: options.createIfNotExists ? 'create' : 'update',
        path: filePath,
        content,
        userId,
        timestamp: new Date()
      }

      // Store pending operation
      this.pendingOperations.set(`${projectId}:${filePath}`, operation)

      // Make API call to save file
      const response = await fetch('/api/workspace/files/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.etag && { 'If-Match': options.etag })
        },
        body: JSON.stringify({
          project_id: projectId,
          file_path: filePath,
          content,
          create_if_not_exists: options.createIfNotExists,
          user_id: userId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()

      // Remove from pending operations on success
      this.pendingOperations.delete(`${projectId}:${filePath}`)

      logger.info('File saved successfully', {
        projectId,
        filePath,
        userId,
        etag: result.etag
      }, 'workspace-file-ops')

      return {
        success: true,
        etag: result.etag,
        lastModified: result.last_modified
      }

    } catch (error) {
      logger.error('Failed to save file', {
        projectId,
        filePath,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'workspace-file-ops')

      // Remove from pending operations on error
      this.pendingOperations.delete(`${projectId}:${filePath}`)

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file'
      }
    }
  }

  /**
   * Create a new file
   */
  async createFile(
    projectId: string,
    filePath: string,
    content: string,
    userId: string
  ): Promise<FileEditResult> {
    return this.saveFile(projectId, filePath, content, userId, {
      createIfNotExists: true
    })
  }

  /**
   * Delete a file
   */
  async deleteFile(
    projectId: string,
    filePath: string,
    userId: string
  ): Promise<FileEditResult> {
    try {
      logger.info('Deleting file', {
        projectId,
        filePath,
        userId
      }, 'workspace-file-ops')

      const response = await fetch('/api/workspace/files/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: projectId,
          file_path: filePath,
          user_id: userId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      logger.info('File deleted successfully', {
        projectId,
        filePath,
        userId
      }, 'workspace-file-ops')

      return { success: true }

    } catch (error) {
      logger.error('Failed to delete file', {
        projectId,
        filePath,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'workspace-file-ops')

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file'
      }
    }
  }

  /**
   * Rename or move a file
   */
  async moveFile(
    projectId: string,
    oldPath: string,
    newPath: string,
    userId: string
  ): Promise<FileEditResult> {
    try {
      logger.info('Moving file', {
        projectId,
        oldPath,
        newPath,
        userId
      }, 'workspace-file-ops')

      const response = await fetch('/api/workspace/files/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: projectId,
          old_path: oldPath,
          new_path: newPath,
          user_id: userId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      logger.info('File moved successfully', {
        projectId,
        oldPath,
        newPath,
        userId
      }, 'workspace-file-ops')

      return { success: true }

    } catch (error) {
      logger.error('Failed to move file', {
        projectId,
        oldPath,
        newPath,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'workspace-file-ops')

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to move file'
      }
    }
  }

  /**
   * Validate file content before saving
   */
  private validateFileContent(filePath: string, content: string): FileValidation {
    const errors: string[] = []
    const warnings: string[] = []

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (content.length > maxSize) {
      errors.push(`File size exceeds ${maxSize.toLocaleString()} bytes limit`)
    }

    // Check for binary content in text files
    const textExtensions = ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.css', '.html', '.xml', '.yml', '.yaml']
    const isTextFile = textExtensions.some(ext => filePath.toLowerCase().endsWith(ext))

    if (isTextFile) {
      // Check for null bytes (binary content)
      if (content.includes('\0')) {
        errors.push('File appears to contain binary content')
      }

      // Check for extremely long lines
      const lines = content.split('\n')
      const maxLineLength = 10000
      const longLines = lines.filter(line => line.length > maxLineLength)
      if (longLines.length > 0) {
        warnings.push(`${longLines.length} lines exceed ${maxLineLength} characters`)
      }
    }

    // Validate JSON files
    if (filePath.toLowerCase().endsWith('.json')) {
      try {
        JSON.parse(content)
      } catch (error) {
        errors.push('Invalid JSON syntax')
      }
    }

    // Check for potentially dangerous content
    const dangerousPatterns = [
      /eval\s*\(/g,
      /document\.write\s*\(/g,
      /innerHTML\s*=/g,
      /<script/gi
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        warnings.push('File contains potentially unsafe code patterns')
        break
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Get pending operations for a project
   */
  getPendingOperations(projectId: string): FileOperation[] {
    return Array.from(this.pendingOperations.entries())
      .filter(([key]) => key.startsWith(`${projectId}:`))
      .map(([, operation]) => operation)
  }

  /**
   * Cancel a pending operation
   */
  cancelPendingOperation(projectId: string, filePath: string): boolean {
    return this.pendingOperations.delete(`${projectId}:${filePath}`)
  }

  /**
   * Clear all pending operations for a project
   */
  clearPendingOperations(projectId: string): void {
    for (const [key] of this.pendingOperations.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        this.pendingOperations.delete(key)
      }
    }
  }
}

// Export singleton instance
export const workspaceFileOperations = new WorkspaceFileOperationsService()

