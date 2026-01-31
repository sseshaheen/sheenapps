/**
 * Advisor Workspace Component
 *
 * Main workspace interface for advisors with file browser and log viewer
 * Uses shared workspace components with role-based permissions
 */

'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { WorkspaceLayout } from '@/components/workspace/core/workspace-layout'
import { FileBrowser } from '@/components/workspace/file-browser/file-browser'
import { LogViewer } from '@/components/workspace/log-viewer/log-viewer'
import { SessionManager } from '@/components/workspace/session/session-manager'
import { PerformanceMonitor } from '@/components/workspace/shared/performance-monitor'
import {
  WorkspacePermissionProvider,
  RequireFileAccess,
  RequireLogAccess
} from '@/components/workspace/shared/permission-gate'
import { useWorkspaceSession } from '@/hooks/workspace/use-workspace-session'
import { useFileOperations } from '@/hooks/workspace/use-file-operations'
import { useLogStream } from '@/hooks/workspace/use-log-stream'
import { useWorkspacePermissions, createPermissionContext } from '@/hooks/workspace/use-workspace-permissions'

interface Project {
  id: string
  name: string
  framework: string
}

interface Permissions {
  view_code: boolean
  view_logs: boolean
  manage_sessions: boolean
}

interface Translations {
  workspace: {
    title: string
    files: string
    logs: string
    session: string
    loading: string
    accessDenied: string
    connectionStatus: {
      connected: string
      connecting: string
      disconnected: string
      error: string
    }
  }
}

interface AdvisorWorkspaceProps {
  projectId: string
  advisorId: string
  project: Project
  permissions: Permissions
  translations: Translations
}

export function AdvisorWorkspace({
  projectId,
  advisorId,
  project,
  permissions,
  translations
}: AdvisorWorkspaceProps) {
  // Create permission context for the advisor
  const permissionContext = createPermissionContext({
    userId: advisorId,
    role: 'advisor',
    projectId,
    isProjectOwner: false,
    advisorPermissions: permissions
  })

  return (
    <WorkspacePermissionProvider
      userId={advisorId}
      role="advisor"
      projectId={projectId}
      isProjectOwner={false}
      advisorPermissions={permissions}
    >
      <AdvisorWorkspaceContent
        projectId={projectId}
        advisorId={advisorId}
        project={project}
        permissions={permissions}
        translations={translations}
      />
    </WorkspacePermissionProvider>
  )
}

function AdvisorWorkspaceContent({
  projectId,
  advisorId,
  project,
  permissions,
  translations
}: AdvisorWorkspaceProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null)

  // Get workspace permissions
  const permissionContext = createPermissionContext({
    userId: advisorId,
    role: 'advisor',
    projectId,
    isProjectOwner: false,
    advisorPermissions: permissions
  })

  const { permissions: workspacePermissions, hasAnyFileAccess, hasAnyLogAccess } = useWorkspacePermissions({
    context: permissionContext
  })

  // Session management
  const {
    sessionId,
    isActive: sessionActive,
    startSession,
    endSession,
    error: sessionError
  } = useWorkspaceSession(projectId, advisorId)

  // File operations with read-only permissions
  const {
    files,
    currentFile,
    loadFile,
    loading: filesLoading,
    error: filesError
  } = useFileOperations(projectId, currentPath, {
    readOnly: !workspacePermissions.canEditFiles
  })

  // Log streaming
  const {
    logs,
    connectionStatus,
    isConnected,
    reconnect,
    clearLogs
  } = useLogStream(projectId, advisorId, {
    enabled: workspacePermissions.canViewLogs && sessionActive
  })

  // Auto-start session on mount if permissions allow
  useEffect(() => {
    if (workspacePermissions.canManageSessions && !sessionActive) {
      logger.info('Auto-starting session', {
        projectId,
        advisorId
      }, 'advisor-workspace')
      startSession()
    }
  }, [workspacePermissions.canManageSessions, sessionActive, startSession, projectId, advisorId])

  // Track session start time
  useEffect(() => {
    if (sessionActive && !sessionStartTime) {
      setSessionStartTime(new Date())
    } else if (!sessionActive && sessionStartTime) {
      setSessionStartTime(null)
    }
  }, [sessionActive, sessionStartTime])

  // Handle file selection
  const handleFileSelect = async (filePath: string) => {
    if (!workspacePermissions.canViewFiles) {
      logger.warn('File access denied', {
        filePath,
        advisorId
      }, 'advisor-workspace')
      return
    }

    setSelectedFile(filePath)
    await loadFile(filePath)
  }

  // Handle path navigation
  const handlePathChange = (newPath: string) => {
    setCurrentPath(newPath)
    setSelectedFile(null)
  }

  // Connection status indicator
  const connectionStatusText = connectionStatus.status === 'connected'
    ? translations.workspace.connectionStatus.connected
    : connectionStatus.status === 'connecting'
    ? translations.workspace.connectionStatus.connecting
    : connectionStatus.status === 'error'
    ? translations.workspace.connectionStatus.error
    : translations.workspace.connectionStatus.disconnected

  if (!hasAnyFileAccess && !hasAnyLogAccess) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {translations.workspace.accessDenied}
          </h1>
          <p className="text-muted-foreground">
            You don't have permission to access this workspace.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {translations.workspace.title} • {project.framework}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Performance Monitor */}
            <div className="relative">
              <PerformanceMonitor
                sessionId={sessionId}
                isConnected={isConnected}
                metrics={{
                  sessionDuration: sessionStartTime
                    ? Math.floor((Date.now() - sessionStartTime.getTime()) / 1000)
                    : 0,
                  logCount: logs.length,
                  reconnectAttempts: connectionStatus.retryCount || 0,
                  lastError: connectionStatus.error
                }}
              />
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-green-500'
                    : connectionStatus.status === 'connecting'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-muted-foreground">
                {connectionStatusText}
              </span>
            </div>

            {/* Session Manager */}
            {workspacePermissions.canManageSessions && (
              <SessionManager
                sessionId={sessionId}
                isActive={sessionActive}
                onStart={startSession}
                onEnd={endSession}
                error={sessionError}
                translations={{
                  start: 'Start Session',
                  end: 'End Session',
                  active: 'Session Active',
                  inactive: 'Session Inactive'
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <WorkspaceLayout
          leftPanel={
            <RequireFileAccess
              fallback={
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center">
                    File access not permitted
                  </p>
                </div>
              }
            >
              <FileBrowser
                projectId={projectId}
                currentPath={currentPath}
                files={files}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onPathChange={handlePathChange}
                loading={filesLoading}
                error={filesError}
                readOnly={!workspacePermissions.canEditFiles}
                translations={{
                  files: translations.workspace.files,
                  loading: translations.workspace.loading
                }}
              />
            </RequireFileAccess>
          }
          rightPanel={
            <RequireLogAccess
              fallback={
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center">
                    Log access not permitted
                  </p>
                </div>
              }
            >
              <LogViewer
                projectId={projectId}
                advisorId={advisorId}
                logs={logs}
                connectionStatus={connectionStatus}
                onReconnect={reconnect}
                onClear={clearLogs}
                translations={{
                  logs: translations.workspace.logs,
                  reconnect: 'Reconnect',
                  clear: 'Clear',
                  paused: 'Paused',
                  live: 'Live',
                  history: 'History',
                  loading: 'Loading...',
                  noLogs: 'No logs found',
                  page: 'Page',
                  of: 'of',
                  previous: 'Previous',
                  next: 'Next',
                  filters: 'Filters',
                  search: 'Search logs...',
                  timeRange: 'Time Range',
                  levels: 'Levels',
                  tiers: 'Tiers'
                }}
              />
            </RequireLogAccess>
          }
          currentFile={currentFile}
          error={filesError || sessionError}
        />
      </div>
    </div>
  )
}