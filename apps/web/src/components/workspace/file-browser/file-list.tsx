/**
 * File List Component
 *
 * Flat file listing with metadata
 * Part of shared workspace file browser
 */

'use client'

import { Icon } from '@/components/ui/icon'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  extension?: string
}

interface FileListProps {
  files: FileItem[]
  selectedFile?: string | null
  onFileSelect: (filePath: string) => void
  readOnly: boolean
}

export function FileList({
  files,
  selectedFile,
  onFileSelect,
  readOnly
}: FileListProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return '-'
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(unitIndex > 0 ? 1 : 0)}${units[unitIndex]}`
  }

  const getFileIcon = (item: FileItem) => {
    if (item.type === 'directory') {
      return <Icon name="folder" className="w-4 h-4 text-blue-500"  />
    }
    return <Icon name="file-text" className="w-4 h-4 text-muted-foreground"  />
  }

  // Sort files: directories first, then files, both alphabetically
  const sortedFiles = [...files].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="h-full overflow-y-auto">
      {files.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground text-sm">No files found</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30 sticky top-0">
            <div className="col-span-6">Name</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-4">Modified</div>
          </div>

          {/* File rows */}
          {sortedFiles.map((file) => {
            const isSelected = selectedFile === file.path

            return (
              <div
                key={file.path}
                className={`grid grid-cols-12 gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors ${
                  isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
                }`}
                onClick={() => onFileSelect(file.path)}
              >
                {/* Name with icon */}
                <div className="col-span-6 flex items-center min-w-0">
                  <div className="flex-shrink-0 mr-2">
                    {getFileIcon(file)}
                  </div>
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>

                {/* Size */}
                <div className="col-span-2 text-muted-foreground">
                  {file.type === 'file' ? formatFileSize(file.size) : '-'}
                </div>

                {/* Modified date */}
                <div className="col-span-4 text-muted-foreground">
                  {formatDate(file.modified)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}