/**
 * Workspace Type Definitions
 *
 * Shared types for workspace components and services
 * Part of the expert-validated workspace architecture
 */

// Project and permission types
export interface Project {
  id: string
  name: string
  framework: string
  advisor_code_access: boolean
  restricted_paths?: string[]
}

export interface WorkspacePermissions {
  view_code: boolean
  view_logs: boolean
  manage_sessions: boolean
}

export interface AdvisorAssignment {
  project_id: string
  advisor_id: string
  status: 'active' | 'inactive'
  workspace_permissions: WorkspacePermissions
}

// Session management types
export interface WorkspaceSession {
  id: string
  project_id: string
  advisor_id: string
  status: 'active' | 'ended'
  started_at: string
  ended_at?: string
  last_heartbeat: string
  duration_seconds?: number
}

export interface SessionStartRequest {
  project_id: string
  advisor_id: string
}

export interface SessionStartResponse {
  session_id: string
  started_at: string
  heartbeat_interval: number
  project_id: string
}

export interface SessionEndRequest {
  session_id: string
  advisor_id: string
}

export interface SessionEndResponse {
  success: boolean
  session_duration_seconds: number
  ended_at: string
}

export interface SessionPingRequest {
  session_id: string
  advisor_id: string
}

export interface SessionPingResponse {
  success: boolean
  last_heartbeat: string
  session_active: boolean
}

// File system types
export interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  extension?: string
}

export interface FilesListRequest {
  project_id: string
  advisor_id: string
  path: string
}

export interface FilesListResponse {
  files: FileItem[]
  current_path: string
  parent_path?: string
  total_count: number
  restricted_paths: string[]
}

export interface FileContentRequest {
  project_id: string
  advisor_id: string
  file_path: string
}

export interface FileContentResponse {
  content: string
  path: string
  size: number
  modified: string
  extension?: string
  is_binary: boolean
  etag: string
}

export interface FileDownloadResponse {
  download_url: string
  filename: string
  size: number
  reason: 'too_large' | 'binary_file'
}

// Log streaming types
export interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  retryCount?: number
  isLeader?: boolean
  activeConnections?: number
}

export interface LogStreamEvent {
  type: 'log' | 'connection_status' | 'heartbeat'
  data: LogEvent | ConnectionStatus | Record<string, never>
  timestamp: string
}

// Workspace access types
export interface WorkspaceAccessRequest {
  project_id: string
  advisor_id: string
}

export interface WorkspaceAccessResponse {
  hasAccess: boolean
  permissions: WorkspacePermissions
  projectStatus: 'active' | 'archived' | 'not_found'
  advisorStatus: 'active' | 'inactive' | 'not_assigned'
  restrictions?: string[]
}

// Component prop types
export interface WorkspaceLayoutProps {
  leftPanel: React.ReactNode
  rightPanel: React.ReactNode
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

export interface FileBrowserProps {
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

export interface LogViewerProps {
  projectId: string
  logs: LogEvent[]
  connectionStatus: ConnectionStatus
  onReconnect: () => void
  onClear: () => void
  translations: {
    logs: string
    reconnect: string
    clear: string
    paused: string
    live: string
  }
}

export interface SessionManagerProps {
  sessionId?: string | null
  isActive: boolean
  onStart: () => Promise<void> | void
  onEnd: () => Promise<void> | void
  error?: string | null
  translations: {
    start: string
    end: string
    active: string
    inactive: string
  }
}

// Hook option types
export interface UseWorkspaceSessionOptions {
  autoStart?: boolean
  heartbeatInterval?: number
}

export interface UseFileOperationsOptions {
  readOnly: boolean
  cacheSize?: number
}

export interface UseLogStreamOptions {
  enabled?: boolean
  maxLogLines?: number
  reconnectAttempts?: number
}

// API error types
export interface WorkspaceAPIError {
  error: string
  code?: string
  details?: Record<string, any>
}

// Security filter types
export interface SecurityFilter {
  pattern: RegExp
  reason: string
  category: 'environment' | 'build' | 'vcs' | 'system' | 'temporary'
}

// ETag cache types
export interface ETagCacheEntry {
  etag: string
  lastModified: string
  cached_at: number
}

// Syntax highlighting types
export interface SyntaxHighlighter {
  highlight: (code: string, language: string) => string
  getLanguage: (extension: string) => string
}

export interface LanguageConfig {
  extensions: string[]
  highlighter: () => Promise<SyntaxHighlighter>
  displayName: string
}

// Virtualization types (for log viewer)
export interface VirtualizedLogItem {
  index: number
  log: LogEvent
  height: number
  visible: boolean
}

// Performance monitoring types
export interface WorkspaceMetrics {
  logStreamConnected: boolean
  logCount: number
  filesCached: number
  sessionDuration: number
  reconnectAttempts: number
  lastError?: string
}

// Translation types
export interface WorkspaceTranslations {
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