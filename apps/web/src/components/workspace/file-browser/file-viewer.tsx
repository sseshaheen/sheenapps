/**
 * File Viewer Component
 *
 *
 * Code viewer with syntax highlighting
 * Supports dynamic language imports for bundle optimization
 */

'use client'

import { useEffect, useState } from 'react'
import { LoadingStates } from '../shared/loading-states'

interface FileViewerProps {
  file: {
    path: string
    content: string
    extension?: string
    size: number
    modified: string
  }
  readOnly: boolean
  onEdit?: (content: string) => void
}

interface SyntaxHighlighter {
  highlight: (code: string, language: string) => string
}

// Dynamic syntax highlighter loading (bundle-size conscious)
const loadLanguageHighlighter = async (extension: string): Promise<SyntaxHighlighter> => {
  try {
    switch (extension) {
      case '.ts':
      case '.tsx':
        // Dynamic import would go here in real implementation
        return { highlight: (code) => code } // Placeholder

      case '.js':
      case '.jsx':
        // Dynamic import would go here in real implementation
        return { highlight: (code) => code } // Placeholder

      case '.json':
        return { highlight: (code) => code } // Placeholder

      case '.md':
        return { highlight: (code) => code } // Placeholder

      case '.css':
      case '.scss':
        return { highlight: (code) => code } // Placeholder

      default:
        return { highlight: (code) => code } // Placeholder for generic highlighting
    }
  } catch (error) {
    console.warn('Failed to load syntax highlighter for', extension)
    return { highlight: (code) => code }
  }
}

export function FileViewer({ file, readOnly, onEdit }: FileViewerProps) {
  const [highlighter, setHighlighter] = useState<SyntaxHighlighter | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadHighlighter = async () => {
      setLoading(true)
      try {
        const highlighter = await loadLanguageHighlighter(file.extension || '')
        setHighlighter(highlighter)
      } finally {
        setLoading(false)
      }
    }

    loadHighlighter()
  }, [file.extension])

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(unitIndex > 0 ? 1 : 0)}${units[unitIndex]}`
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return 'Unknown'
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingStates.FileLoading message="Loading syntax highlighter..." />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* File header */}
      <div className="flex-shrink-0 p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {file.path.split('/').pop()}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {formatFileSize(file.size)} • Modified {formatDate(file.modified)}
            </p>
          </div>

          {!readOnly && onEdit && (
            <button
              onClick={() => {
                // In a real implementation, this would open an editor
                console.log('Edit file:', file.path)
              }}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
            <code>
              {highlighter
                ? highlighter.highlight(file.content, file.extension || '')
                : file.content
              }
            </code>
          </pre>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {file.content.split('\n').length} lines
          </span>
          <span>
            {readOnly ? 'Read-only' : 'Editable'}
          </span>
        </div>
      </div>
    </div>
  )
}
