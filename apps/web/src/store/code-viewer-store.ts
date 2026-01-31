/**
 * Code Viewer Store
 *
 * Manages state for the generated code viewer similar to Lovable/Replit.
 * Uses Record instead of Map for serialization and devtools compatibility.
 */

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// ============================================================================
// Types
// ============================================================================

export type FileStatus = 'idle' | 'streaming' | 'modified' | 'new' | 'error' | 'pending'
export type ViewMode = 'code' | 'diff' | 'preview'
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface FileState {
  path: string
  content: string
  language: string
  // Version tracking for accept/reject workflow
  baseHash?: string
  currentHash?: string
  previousContent?: string
  isModified: boolean
  isNew: boolean
  size: number
  status: FileStatus
}

export interface StreamingState {
  isActive: boolean
  currentFile: string | null
  cursor: { line: number; column: number }
  progress: number // 0-100
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  language?: string
  size?: number
  isModified?: boolean
  isNew?: boolean
  status?: FileStatus
}

// ============================================================================
// Store Interface
// ============================================================================

interface CodeViewerState {
  // File management - use Record, NOT Map (serializable, devtools-friendly)
  filesByPath: Record<string, FileState>
  fileOrder: string[]
  activeFile: string | null
  openTabs: string[]

  // View state
  viewMode: ViewMode
  isFileTreeOpen: boolean
  fileTreeWidth: number
  followMode: boolean

  // Streaming
  streaming: StreamingState

  // Build context
  buildId: string | null
  projectId: string | null

  // Connection state (for SSE)
  connectionState: ConnectionState
}

interface CodeViewerActions {
  // File actions
  setActiveFile: (path: string) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  closeAllFiles: () => void

  // Content actions
  setFiles: (files: FileState[]) => void
  setPlannedFiles: (paths: string[]) => void
  updateFileContent: (path: string, content: string) => void
  appendStreamingContent: (
    path: string,
    chunk: string,
    cursor: { line: number; column: number }
  ) => void
  setFileStatus: (path: string, status: FileStatus) => void

  // View actions
  setViewMode: (mode: ViewMode) => void
  toggleFileTree: () => void
  setFileTreeWidth: (width: number) => void
  toggleFollowMode: () => void

  // Streaming actions
  startStreaming: (file: string) => void
  endStreaming: () => void
  setStreamingProgress: (progress: number) => void

  // Context actions
  setBuildId: (buildId: string | null) => void
  setProjectId: (projectId: string | null) => void
  setConnectionState: (state: ConnectionState) => void

  // Reset
  resetState: () => void
}

type CodeViewerStore = CodeViewerState & CodeViewerActions

// ============================================================================
// Initial State
// ============================================================================

const initialState: CodeViewerState = {
  filesByPath: {},
  fileOrder: [],
  activeFile: null,
  openTabs: [],
  viewMode: 'code',
  isFileTreeOpen: true,
  fileTreeWidth: 280,
  followMode: true,
  streaming: {
    isActive: false,
    currentFile: null,
    cursor: { line: 0, column: 0 },
    progress: 0,
  },
  buildId: null,
  projectId: null,
  connectionState: 'disconnected',
}

// ============================================================================
// Store
// ============================================================================

export const useCodeViewerStore = create<CodeViewerStore>()(
  devtools(
    immer((set, get) => ({
      ...initialState,

      // ========================================================================
      // File Actions
      // ========================================================================

      setActiveFile: (path: string) => {
        set((state) => {
          state.activeFile = path
          // Add to open tabs if not already there
          if (!state.openTabs.includes(path)) {
            state.openTabs.push(path)
          }
        })
      },

      openFile: (path: string) => {
        set((state) => {
          if (!state.openTabs.includes(path)) {
            state.openTabs.push(path)
          }
          state.activeFile = path
        })
      },

      closeFile: (path: string) => {
        set((state) => {
          state.openTabs = state.openTabs.filter((p) => p !== path)

          // If closing active file, switch to another tab
          if (state.activeFile === path) {
            const lastTab = state.openTabs[state.openTabs.length - 1]
            state.activeFile = lastTab || null
          }

          // Clear content from closed files to free memory (but keep metadata)
          const file = state.filesByPath[path]
          if (file && !state.openTabs.includes(path)) {
            file.content = ''
          }
        })
      },

      closeAllFiles: () => {
        set((state) => {
          state.openTabs = []
          state.activeFile = null
        })
      },

      // ========================================================================
      // Content Actions
      // ========================================================================

      setFiles: (files: FileState[]) => {
        set((state) => {
          state.filesByPath = {}
          state.fileOrder = []

          for (const file of files) {
            state.filesByPath[file.path] = file
            state.fileOrder.push(file.path)
          }

          // Auto-select first file if none selected
          if (!state.activeFile && files.length > 0) {
            state.activeFile = files[0].path
            state.openTabs = [files[0].path]
          }
        })
      },

      /**
       * Set planned files as pending placeholders
       * Used to show skeleton file tree before actual files are generated
       * @see ux-analysis-code-generation-wait-time.md
       */
      setPlannedFiles: (paths: string[]) => {
        set((state) => {
          // Don't clear existing files - planned files are additive
          // Skip paths that already exist (actual files take precedence)
          for (const path of paths) {
            if (state.filesByPath[path]) continue

            // Determine language from file extension
            const ext = path.split('.').pop()?.toLowerCase() || ''
            const languageMap: Record<string, string> = {
              ts: 'typescript',
              tsx: 'typescript',
              js: 'javascript',
              jsx: 'javascript',
              css: 'css',
              scss: 'scss',
              html: 'html',
              json: 'json',
              md: 'markdown',
              py: 'python',
              rs: 'rust',
              go: 'go',
            }

            const pendingFile: FileState = {
              path,
              content: '', // Empty content for pending files
              language: languageMap[ext] || 'plaintext',
              isModified: false,
              isNew: true,
              size: 0,
              status: 'pending',
            }

            state.filesByPath[path] = pendingFile
            // Add to order if not already present
            if (!state.fileOrder.includes(path)) {
              state.fileOrder.push(path)
            }
          }
        })
      },

      updateFileContent: (path: string, content: string) => {
        set((state) => {
          const file = state.filesByPath[path]
          if (file) {
            // Store previous content for diff
            if (!file.previousContent) {
              file.previousContent = file.content
            }
            file.content = content
            file.size = new Blob([content]).size
            file.isModified = true
          }
        })
      },

      appendStreamingContent: (
        path: string,
        chunk: string,
        cursor: { line: number; column: number }
      ) => {
        set((state) => {
          let file = state.filesByPath[path]

          // Create file if it doesn't exist (new file being streamed)
          if (!file) {
            file = {
              path,
              content: '',
              language: detectLanguage(path),
              isModified: false,
              isNew: true,
              size: 0,
              status: 'streaming',
            }
            state.filesByPath[path] = file
            state.fileOrder.push(path)
          }

          file.content += chunk
          // Use string length as approximation during streaming (faster than Blob)
          // Exact size will be calculated when file status changes
          file.size += chunk.length
          file.status = 'streaming'

          // Update streaming cursor
          state.streaming.cursor = cursor
          state.streaming.currentFile = path

          // Follow mode behavior (FIX Jan 2026: don't yank user away from other files)
          // Only auto-switch if:
          // 1. No active file (first file being streamed), OR
          // 2. The active file IS this streaming file (continue following)
          // This prevents the UX footgun of yanking user away while reading another file
          if (state.followMode) {
            const shouldFocus = !state.activeFile || state.activeFile === path
            if (!state.openTabs.includes(path)) {
              state.openTabs.push(path)
            }
            if (shouldFocus) {
              state.activeFile = path
            }
          }
        })
      },

      setFileStatus: (path: string, status: FileStatus) => {
        set((state) => {
          const file = state.filesByPath[path]
          if (file) {
            // FIX (Jan 2026): When transitioning from streaming, compute correct status and size
            // Previously file_end set all files to 'new' and only endStreaming() corrected the last one
            if (file.status === 'streaming' && status !== 'streaming') {
              file.size = new Blob([file.content]).size
              // Compute actual status based on file flags (ignore passed status)
              file.status = file.isNew ? 'new' : file.isModified ? 'modified' : 'idle'
            } else {
              file.status = status
            }
          }
        })
      },

      // ========================================================================
      // View Actions
      // ========================================================================

      setViewMode: (mode: ViewMode) => {
        set((state) => {
          state.viewMode = mode
        })
      },

      toggleFileTree: () => {
        set((state) => {
          state.isFileTreeOpen = !state.isFileTreeOpen
        })
      },

      setFileTreeWidth: (width: number) => {
        set((state) => {
          // Allow width between 180px (min-w-[180px]) and 600px for usability
          state.fileTreeWidth = Math.max(180, Math.min(width, 600))
        })
      },

      toggleFollowMode: () => {
        set((state) => {
          state.followMode = !state.followMode
        })
      },

      // ========================================================================
      // Streaming Actions
      // ========================================================================

      startStreaming: (file: string) => {
        set((state) => {
          state.streaming.isActive = true
          state.streaming.currentFile = file
          state.streaming.cursor = { line: 0, column: 0 }
          state.streaming.progress = 0

          // Mark file as streaming
          const fileState = state.filesByPath[file]
          if (fileState) {
            fileState.status = 'streaming'
          }
        })
      },

      endStreaming: () => {
        set((state) => {
          const currentFile = state.streaming.currentFile
          if (currentFile) {
            const file = state.filesByPath[currentFile]
            if (file) {
              file.status = file.isNew ? 'new' : file.isModified ? 'modified' : 'idle'
              // Recalculate accurate size now that streaming is done
              file.size = new Blob([file.content]).size
            }
          }

          state.streaming.isActive = false
          state.streaming.currentFile = null
          state.streaming.progress = 100
        })
      },

      setStreamingProgress: (progress: number) => {
        set((state) => {
          state.streaming.progress = Math.max(0, Math.min(100, progress))
        })
      },

      // ========================================================================
      // Context Actions
      // ========================================================================

      setBuildId: (buildId: string | null) => {
        set((state) => {
          state.buildId = buildId
        })
      },

      setProjectId: (projectId: string | null) => {
        set((state) => {
          state.projectId = projectId
        })
      },

      setConnectionState: (connectionState: ConnectionState) => {
        set((state) => {
          state.connectionState = connectionState
        })
      },

      // ========================================================================
      // Reset
      // ========================================================================

      resetState: () => {
        set(initialState)
      },
    })),
    {
      name: 'code-viewer-store',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)

// ============================================================================
// Selectors
// ============================================================================

export const useActiveFile = () =>
  useCodeViewerStore((state) => {
    const path = state.activeFile
    return path ? state.filesByPath[path] : null
  })

export const useFileByPath = (path: string) =>
  useCodeViewerStore((state) => state.filesByPath[path] || null)

export const useOpenTabs = () => useCodeViewerStore((state) => state.openTabs)

export const useIsStreaming = () =>
  useCodeViewerStore((state) => state.streaming.isActive)

export const useStreamingCursor = () =>
  useCodeViewerStore((state) => state.streaming.cursor)

export const useViewMode = () => useCodeViewerStore((state) => state.viewMode)

export const useConnectionState = () =>
  useCodeViewerStore((state) => state.connectionState)

// ============================================================================
// Utilities
// ============================================================================

/**
 * Detect language from file extension
 */
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''

  const LANGUAGE_MAP: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    xml: 'xml',
    svg: 'xml',

    // Backend
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',

    // Config
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    env: 'bash',

    // Other
    md: 'markdown',
    mdx: 'markdown',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  }

  return LANGUAGE_MAP[ext] || 'text'
}

/**
 * Build file tree from flat file list
 */
export function buildFileTree(files: FileState[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  const dirMap = new Map<string, FileTreeNode>()

  // Sort files by path for consistent ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of sortedFiles) {
    const parts = file.path.split('/')
    let currentPath = ''
    let currentLevel = root

    // Create/traverse directories
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part

      let dir = dirMap.get(currentPath)
      if (!dir) {
        dir = {
          name: part,
          path: currentPath,
          type: 'directory',
          children: [],
        }
        dirMap.set(currentPath, dir)
        currentLevel.push(dir)
      }
      currentLevel = dir.children!
    }

    // Add file
    const fileName = parts[parts.length - 1]
    currentLevel.push({
      name: fileName,
      path: file.path,
      type: 'file',
      language: file.language,
      size: file.size,
      isModified: file.isModified,
      isNew: file.isNew,
      status: file.status,
    })
  }

  // Sort each level: directories first, then files, alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  const sortRecursively = (nodes: FileTreeNode[]): FileTreeNode[] => {
    const sorted = sortNodes(nodes)
    for (const node of sorted) {
      if (node.children) {
        node.children = sortRecursively(node.children)
      }
    }
    return sorted
  }

  return sortRecursively(root)
}

/**
 * Normalize line endings to \n
 */
export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n')
}
