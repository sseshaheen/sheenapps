/**
 * File Browser Component
 *
 * Directory tree navigation and file listing
 * Part of shared workspace component architecture
 */

'use client'

import { useState } from 'react'
import { FileTree } from './file-tree'
import { FileList } from './file-list'
import { FileSearch } from './file-search'
import { LoadingStates } from '../shared/loading-states'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  extension?: string
}

interface FileBrowserProps {
  projectId: string
  currentPath: string
  files: FileItem[]
  selectedFile?: string | null
  onFileSelect: (filePath: string) => void
  onPathChange: (newPath: string) => void
  loading: boolean
  error?: string | null
  readOnly: boolean
  translations: {
    files: string
    loading: string
  }
}

export function FileBrowser({
  projectId,
  currentPath,
  files,
  selectedFile,
  onFileSelect,
  onPathChange,
  loading,
  error,
  readOnly,
  translations
}: FileBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')

  // Filter files based on search query
  const filteredFiles = searchQuery
    ? files.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : files

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 p-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            {translations.files}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <LoadingStates.FileLoading message={translations.loading} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 p-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            {translations.files}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-4">
            <div className="text-red-500 text-lg mb-2">⚠️</div>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with view controls */}
      <div className="flex-shrink-0 p-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            {translations.files}
          </h3>

          {/* View mode toggle */}
          <div className="flex bg-muted rounded-md p-0.5">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === 'tree'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Search */}
        <FileSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search files..."
        />
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'tree' ? (
          <FileTree
            projectId={projectId}
            currentPath={currentPath}
            files={filteredFiles}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            onPathChange={onPathChange}
            readOnly={readOnly}
          />
        ) : (
          <FileList
            files={filteredFiles}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            readOnly={readOnly}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">
          {filteredFiles.length} items
          {searchQuery && ` (filtered from ${files.length})`}
        </p>
      </div>
    </div>
  )
}