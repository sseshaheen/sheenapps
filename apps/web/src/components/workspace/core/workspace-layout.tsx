/**
 * Workspace Layout Component
 *
 *
 * Flexible split-pane layout for workspace interfaces
 * Supports resizable panels with shared component architecture
 */

'use client'

import { ReactNode, useState } from 'react'
import { FileViewer } from '../file-browser/file-viewer'
import { ErrorBoundary } from '../shared/error-boundary'
import { ResizablePanes } from '../shared/resizable-panes'

interface WorkspaceLayoutProps {
  leftPanel: ReactNode
  rightPanel: ReactNode
  currentFile?: {
    path: string
    content: string
    extension?: string
    size: number
    modified: string
  } | null
  error?: string | null
  className?: string
}

export function WorkspaceLayout({
  leftPanel,
  rightPanel,
  currentFile,
  error,
  className = ''
}: WorkspaceLayoutProps) {
  const [leftPanelSize, setLeftPanelSize] = useState(25) // 25% default
  const [rightPanelSize, setRightPanelSize] = useState(25) // 25% default

  return (
    <div className={`flex-1 flex overflow-hidden ${className}`}>
      <ErrorBoundary>
        <ResizablePanes
          direction="horizontal"
          panes={[
            {
              id: 'file-browser',
              title: 'Files',
              size: leftPanelSize,
              minSize: 200,
              maxSize: 400,
              content: leftPanel
            },
            {
              id: 'main-content',
              title: 'Content',
              size: 100 - leftPanelSize - rightPanelSize,
              minSize: 300,
              content: (
                <div className="h-full flex flex-col bg-background">
                  {error ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-red-500 text-lg mb-2">⚠️</div>
                        <p className="text-foreground font-medium mb-1">
                          Workspace Error
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {error}
                        </p>
                      </div>
                    </div>
                  ) : currentFile ? (
                    <FileViewer
                      file={currentFile}
                      readOnly={true}
                      onEdit={undefined}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-muted-foreground text-lg mb-2">📄</div>
                        <p className="text-foreground font-medium mb-1">
                          No File Selected
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Select a file from the browser to view its contents
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            },
            {
              id: 'log-viewer',
              title: 'Logs',
              size: rightPanelSize,
              minSize: 200,
              maxSize: 400,
              content: rightPanel
            }
          ]}
          onResize={(sizes) => {
            setLeftPanelSize(sizes[0])
            setRightPanelSize(sizes[2])
          }}
        />
      </ErrorBoundary>
    </div>
  )
}
