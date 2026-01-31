/**
 * File Tree Component
 *
 * Directory tree navigation with expandable folders
 * Part of shared workspace file browser
 */

'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  extension?: string
}

interface FileTreeProps {
  projectId: string
  currentPath: string
  files: FileItem[]
  selectedFile?: string | null
  onFileSelect: (filePath: string) => void
  onPathChange: (newPath: string) => void
  readOnly: boolean
}

export function FileTree({
  projectId,
  currentPath,
  files,
  selectedFile,
  onFileSelect,
  onPathChange,
  readOnly
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']))

  // Build tree structure from flat file list
  const buildTree = (files: FileItem[]) => {
    const tree: Record<string, FileItem[]> = {}

    files.forEach(file => {
      const pathParts = file.path.split('/').filter(Boolean)
      const parentPath = pathParts.length > 1
        ? '/' + pathParts.slice(0, -1).join('/')
        : '/'

      if (!tree[parentPath]) {
        tree[parentPath] = []
      }
      tree[parentPath].push(file)
    })

    return tree
  }

  const tree = buildTree(files)

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath)
    } else {
      newExpanded.add(folderPath)
      // Load folder contents if needed
      onPathChange(folderPath)
    }
    setExpandedFolders(newExpanded)
  }

  const renderTreeNode = (item: FileItem, level: number = 0) => {
    const isSelected = selectedFile === item.path
    const isExpanded = expandedFolders.has(item.path)
    const hasChildren = item.type === 'directory' && tree[item.path]?.length > 0

    return (
      <div key={item.path}>
        <div
          className={`flex items-center px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 ${
            isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
          }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => {
            if (item.type === 'directory') {
              toggleFolder(item.path)
            } else {
              onFileSelect(item.path)
            }
          }}
        >
          {/* Expand/Collapse Icon */}
          {item.type === 'directory' && (
            <div className="w-4 h-4 mr-1 flex items-center justify-center">
              {hasChildren ? (
                isExpanded ? (
                  <Icon name="chevron-down" className="w-3 h-3"  />
                ) : (
                  <Icon name="chevron-right" className="w-3 h-3"  />
                )
              ) : null}
            </div>
          )}

          {/* File/Folder Icon */}
          <div className="w-4 h-4 mr-2 flex-shrink-0">
            {item.type === 'directory' ? (
              isExpanded ? (
                <Icon name="folder-open" className="w-4 h-4 text-blue-500"  />
              ) : (
                <Icon name="folder" className="w-4 h-4 text-blue-500"  />
              )
            ) : (
              <Icon name="file-text" className="w-4 h-4 text-muted-foreground"  />
            )}
          </div>

          {/* File/Folder Name */}
          <span className="truncate flex-1">{item.name}</span>

          {/* File Size */}
          {item.type === 'file' && item.size && (
            <span className="text-xs text-muted-foreground ml-2">
              {formatFileSize(item.size)}
            </span>
          )}
        </div>

        {/* Render children if expanded */}
        {item.type === 'directory' && isExpanded && tree[item.path] && (
          <div>
            {tree[item.path]
              .sort((a, b) => {
                // Directories first, then files, both alphabetically
                if (a.type !== b.type) {
                  return a.type === 'directory' ? -1 : 1
                }
                return a.name.localeCompare(b.name)
              })
              .map(child => renderTreeNode(child, level + 1))
            }
          </div>
        )}
      </div>
    )
  }

  // Start with root level items
  const rootItems = tree[currentPath] || []

  return (
    <div className="h-full overflow-y-auto">
      {rootItems.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground text-sm">No files found</p>
        </div>
      ) : (
        <div className="py-1">
          {rootItems
            .sort((a, b) => {
              // Directories first, then files, both alphabetically
              if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1
              }
              return a.name.localeCompare(b.name)
            })
            .map(item => renderTreeNode(item))
          }
        </div>
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)}${units[unitIndex]}`
}