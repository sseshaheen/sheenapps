# Generated Code Viewer Implementation Plan

> **Goal**: Create a real-time generated code viewer experience similar to Lovable/Replit, showing users the AI-generated code as it streams in with syntax highlighting, file navigation, and diff capabilities.

---

## Implementation Progress

### Status: All Phases Complete ✅

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Core Infrastructure | ✅ Complete | All components and store created |
| Phase 2: Streaming Experience | ✅ Complete | SSE hook and cursor component done |
| Phase 3: Diff & Review | ✅ Complete | Diff calculation and view implemented |
| Phase 4: Polish & UX | ✅ Complete | Keyboard shortcuts, search, mobile layout |
| Phase 5: Backend API | ✅ Complete | Worker routes for files, streaming, accept |

### Files Created

**Store:**
- `src/store/code-viewer-store.ts` - Zustand store with Record<string, FileState>

**Components:**
- `src/components/builder/code-viewer/index.ts` - Barrel export
- `src/components/builder/code-viewer/generated-code-viewer.tsx` - Main container with resizable panels + mobile layout
- `src/components/builder/code-viewer/file-tree-panel.tsx` - Left panel with file tree and search
- `src/components/builder/code-viewer/file-tree-node.tsx` - Recursive tree node with status indicators
- `src/components/builder/code-viewer/code-display-panel.tsx` - Right panel with code content + search integration
- `src/components/builder/code-viewer/code-content.tsx` - Syntax highlighting with throttling + search match scrolling
- `src/components/builder/code-viewer/file-tabs.tsx` - Horizontal tabs for open files
- `src/components/builder/code-viewer/streaming-cursor.tsx` - Animated blinking cursor
- `src/components/builder/code-viewer/code-diff-view.tsx` - Unified and split diff views
- `src/components/builder/code-viewer/code-search.tsx` - In-file search with match navigation

**Hooks:**
- `src/hooks/use-code-files.ts` - React Query hooks for file fetching
- `src/hooks/use-code-stream.ts` - SSE streaming with reactive connection state
- `src/hooks/use-code-viewer-keyboard.ts` - Keyboard shortcuts for code viewer

**Utilities:**
- `src/utils/diff-calculation.ts` - Line-based diff calculation using diff-match-patch
- `src/app/globals.css` - Added cursor-blink animation

**Backend (sheenapps-claude-worker):**
- `src/routes/projectFiles.ts` - GET /api/v1/projects/:projectId/files (list + content)
- `src/routes/buildStream.ts` - GET /api/v1/builds/:buildId/stream (SSE streaming)
- `src/routes/buildAccept.ts` - POST /api/v1/builds/:buildId/accept (accept changes)

### Key Implementation Decisions

1. **Throttled highlighting**: Using 80ms throttle (within 50-100ms range) for streaming updates
2. **Large file threshold**: Set to 2000 lines - falls back to plain text
3. **Reactive connection state**: Using `useState` instead of refs for SSE connection state
4. **Query params for paths**: Using `?path=` query param to avoid routing issues with slashes
5. **Content normalization**: All content normalized to `\n` line endings on receive
6. **Diff calculation**: Line-based diff with hunk grouping and context lines
7. **Dual diff views**: Both unified and side-by-side (split) diff modes available
8. **Mobile-first approach**: Slide-out file tree sheet on mobile, resizable panels on desktop
9. **Platform-aware shortcuts**: Auto-detect Mac vs Windows for Cmd/Ctrl key

### Phase 5: Backend API Implementation (sheenapps-claude-worker)

**Endpoints Created:**

1. **GET /api/v1/projects/:projectId/files**
   - Lists all project files recursively (without `?path=`)
   - Returns single file content (with `?path=src/App.tsx`)
   - Uses existing `workspaceFileAccessService` for secure file access
   - Supports ETag caching and immutable caching with `?buildId=`
   - Rate limiting via token bucket per user

2. **GET /api/v1/builds/:buildId/stream**
   - SSE endpoint for real-time build streaming
   - Bridges to existing `eventService` for build events
   - Supports `Last-Event-ID` for resume
   - Keep-alive pings every 30 seconds
   - Events: `file_start`, `file_chunk`, `file_complete`, `build_progress`, `build_complete`, `build_failed`

3. **POST /api/v1/builds/:buildId/accept**
   - Accept generated code changes
   - Optional partial acceptance via `files[]` array
   - Conflict detection via `baseHashes` object
   - Updates version status to "accepted"
   - Bonus: `POST /api/v1/builds/:buildId/reject` for explicit rejection

**Backend Implementation Decisions:**

1. **Leveraged existing services**: Used `workspaceFileAccessService`, `workspacePathValidator`, `SecurePathValidator` for file operations
2. **Security-first**: All endpoints require HMAC signature validation
3. **Platform-aware paths**: Uses `SecurePathValidator.getProjectRoot()` for cross-platform path resolution
4. **Event bridging**: SSE stream bridges to existing `subscribeToEvents()` for real-time updates
5. **Graceful conflict handling**: Accept endpoint returns conflicts without failing, allowing partial acceptance

### Phase 4 Features Implemented

**Keyboard Shortcuts:**
- `Cmd/Ctrl + F` - Open search in file
- `Cmd/Ctrl + B` - Toggle file tree sidebar
- `Cmd/Ctrl + W` - Close current tab
- `Cmd/Ctrl + D` - Cycle view mode (code → diff → preview)
- `Cmd/Ctrl + L` - Toggle follow mode (streaming)
- `Cmd/Ctrl + 1-9` - Switch to tab by number
- `Cmd/Ctrl + [/]` - Previous/Next tab
- `↑/↓` - Navigate files in tree
- `Escape` - Close search

**In-File Search:**
- Search input with match count display
- Previous/Next match navigation (Enter/Shift+Enter)
- Case sensitivity toggle
- Regular expression support
- Auto-scroll to current match
- Yellow highlight for current match line

**Mobile Responsive:**
- Slide-out file tree sheet (< 768px)
- Full-width code display on mobile
- Touch-friendly button sizes
- Auto-close sheet on file selection

### Future Enhancements (Optional)

- [ ] Accept/reject individual changes UI
- [ ] Cross-file search (project-wide)
- [ ] Minimap navigation
- [ ] Code folding
- [ ] Inline editing support

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Component Design](#3-component-design)
4. [Implementation Phases](#4-implementation-phases)
5. [Technical Specifications](#5-technical-specifications)
6. [UI/UX Design](#6-uiux-design)
7. [State Management](#7-state-management)
8. [API Integration](#8-api-integration)
9. [Performance Considerations](#9-performance-considerations)
10. [File Structure](#10-file-structure)
11. [Dependencies](#11-dependencies)
12. [Critical Gotchas](#12-critical-gotchas)

---

## 1. Overview

### What We're Building

A split-pane code viewer that displays AI-generated code in real-time, featuring:

- **Streaming Code Display**: Watch code appear character-by-character as AI generates it
- **Multi-File Navigation**: Tree view for browsing generated files
- **Syntax Highlighting**: Language-aware coloring for 20+ languages
- **Diff View**: Side-by-side comparison showing changes
- **Copy & Download**: Export generated code easily
- **Responsive Design**: Works on desktop, tablet, and mobile
- **RTL Support**: Bidi-safe UI (file tree `dir="auto"`, code always `dir="ltr"`)

### Reference Implementations

| Platform | Key Features to Emulate |
|----------|------------------------|
| **Lovable** | Split view, streaming text, file tabs, copy button |
| **Replit** | File tree, terminal-like output, minimap |
| **v0.dev** | Clean diff view, toggle between code/preview |
| **Cursor** | Inline diff highlighting, accept/reject changes |

### Existing Infrastructure to Leverage

```
✅ file-viewer.tsx         - Existing syntax highlighting component
✅ react-syntax-highlighter - Already in dependencies
✅ SSE streaming            - Persistent chat uses this pattern
✅ Zustand stores           - State management established
✅ React Query              - Data fetching patterns
✅ Tailwind + shadcn/ui     - UI component library
✅ Framer Motion            - Animation library
```

---

## 2. Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interface                               │
│  ┌──────────────┐  ┌──────────────────────────────────────────────┐ │
│  │  File Tree   │  │           Code Viewer Panel                  │ │
│  │              │  │  ┌────────────────────────────────────────┐  │ │
│  │  📁 src/     │  │  │  Tabs: [index.tsx] [App.tsx] [+]      │  │ │
│  │    📄 index  │  │  ├────────────────────────────────────────┤  │ │
│  │    📄 App    │  │  │  1 │ import React from 'react'         │  │ │
│  │  📁 components│ │  │  2 │ import { Button } from './ui'     │  │ │
│  │    📄 Button │  │  │  3 │                                   │  │ │
│  │              │  │  │  4 │ export default function App() {   │  │ │
│  │              │  │  │  5 │   return (                        │  │ │
│  │              │  │  │  6 │     <div className="container">█  │  │ │
│  │              │  │  │    │     ← cursor (streaming)          │  │ │
│  └──────────────┘  │  └────────────────────────────────────────┘  │ │
│                    │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐  │ │
│                    │  │  Copy   │ │  Diff   │ │ Download All    │  │ │
│                    │  └─────────┘ └─────────┘ └─────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       State Management (Zustand)                     │
│  codeViewerStore: {                                                  │
│    filesByPath: Record<path, FileState>    // NOT Map (serializable)│
│    fileOrder: string[]                     // preserves tree order   │
│    activeFile: string                                                │
│    viewMode: 'code' | 'diff' | 'preview'                            │
│    streaming: { isActive, currentFile, cursor, lastEventId }        │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API Layer (React Query + SSE)                    │
│  ┌─────────────────────┐    ┌──────────────────────────────────────┐│
│  │ useCodeFiles()      │    │ useCodeStream()                      ││
│  │ - Fetch file list   │    │ - SSE connection for streaming       ││
│  │ - Cache with RQ     │    │ - Handle code chunks                 ││
│  └─────────────────────┘    └──────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (Fastify)                             │
│  GET  /api/v1/projects/:id/files        - List project files        │
│  GET  /api/v1/projects/:id/files?path=  - Get file content (query)  │
│  GET  /api/v1/builds/:id/stream         - SSE stream for generation │
│  POST /api/v1/builds/:id/accept         - Accept generated changes  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
<GeneratedCodeViewer>
├── <CodeViewerHeader>
│   ├── <ViewModeToggle>         # code | diff | preview
│   └── <ActionButtons>          # copy, download, fullscreen
│
├── <CodeViewerBody>
│   ├── <FileTreePanel>
│   │   ├── <FileTreeHeader>
│   │   ├── <FileTree>
│   │   │   └── <FileTreeNode>   # recursive
│   │   └── <FileTreeFooter>     # file count, size
│   │
│   ├── <ResizableHandle>        # drag to resize panels
│   │
│   └── <CodeDisplayPanel>
│       ├── <FileTabs>
│       │   └── <FileTab>
│       │
│       ├── <CodeContent>
│       │   ├── <LineNumbers>
│       │   ├── <SyntaxHighlighter>
│       │   ├── <StreamingCursor>
│       │   └── <DiffHighlights>  # for diff mode
│       │
│       └── <CodeMinimap>        # optional navigation aid
│
└── <CodeViewerFooter>
    ├── <FileInfo>               # language, size, lines
    └── <StreamingStatus>        # "Generating..." indicator
```

---

## 3. Component Design

### 3.1 Main Container: `GeneratedCodeViewer`

**Purpose**: Orchestrates the entire code viewing experience

```tsx
// src/components/builder/code-viewer/generated-code-viewer.tsx

interface GeneratedCodeViewerProps {
  projectId: string
  buildId?: string
  isStreaming?: boolean
  initialFile?: string
  onFileSelect?: (path: string) => void
  onCodeAccept?: () => void
  className?: string
}

// Features:
// - Resizable split-pane layout
// - Keyboard shortcuts (Cmd+C, Cmd+S, arrow navigation)
// - Mobile-responsive (stacked layout on small screens)
// - RTL support for Arabic locales
```

### 3.2 File Tree Panel: `FileTreePanel`

**Purpose**: Navigate generated files in a tree structure

```tsx
// src/components/builder/code-viewer/file-tree-panel.tsx

interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  language?: string
  size?: number
  isModified?: boolean  // Show indicator for changed files
  isNew?: boolean       // Show indicator for new files
}

// Features:
// - Expand/collapse directories
// - File type icons (tsx, ts, css, json, etc.)
// - Modified/new file indicators
// - Search/filter files
// - Drag to reorder (future)
```

### 3.3 Code Display Panel: `CodeDisplayPanel`

**Purpose**: Show code with syntax highlighting and streaming support

```tsx
// src/components/builder/code-viewer/code-display-panel.tsx

interface CodeDisplayPanelProps {
  file: {
    path: string
    content: string
    language: string
  }
  isStreaming: boolean
  streamingContent?: string
  previousContent?: string  // For diff view
  viewMode: 'code' | 'diff'
  onCopy: () => void
}

// Features:
// - Line numbers with click-to-copy line reference
// - Syntax highlighting for 20+ languages
// - Streaming cursor animation
// - Diff highlighting (green for additions, red for deletions)
// - Code folding for large blocks
// - Search within file (Cmd+F)
```

### 3.4 Streaming Cursor: `StreamingCursor`

**Purpose**: Visual indicator showing where code is being generated

```tsx
// src/components/builder/code-viewer/streaming-cursor.tsx

interface StreamingCursorProps {
  isActive: boolean
  position: { line: number; column: number }
}

// Features:
// - Blinking cursor animation
// - Smooth position transitions
// - Pulse effect when new content arrives
// - Auto-scroll to keep cursor visible
```

### 3.5 Diff View: `CodeDiffView`

**Purpose**: Show changes between previous and generated code

```tsx
// src/components/builder/code-viewer/code-diff-view.tsx

interface CodeDiffViewProps {
  oldContent: string
  newContent: string
  language: string
  highlightChanges: boolean
}

// Features:
// - Side-by-side or unified diff view
// - Line-level and word-level highlighting
// - Accept/reject individual hunks (future)
// - Jump to next/previous change
```

---

## 4. Implementation Phases

### Phase 1: Core Infrastructure (Foundation)

**Goal**: Set up the base components and state management

| Task | Details | Priority |
|------|---------|----------|
| Create Zustand store | `code-viewer-store.ts` with file management | High |
| Build file tree component | Recursive tree with icons | High |
| Implement syntax highlighter wrapper | Extend existing `file-viewer.tsx` | High |
| Add React Query hooks | `useCodeFiles`, `useCodeFile` | High |
| Set up resizable panels | Using `react-resizable-panels` | Medium |

**Deliverables**:
- Basic split-pane layout
- File tree navigation
- Static code display with highlighting

### Phase 2: Streaming Experience (Core Feature)

**Goal**: Real-time code generation display

| Task | Details | Priority |
|------|---------|----------|
| Implement SSE hook | `useCodeStream` with reconnection | High |
| Create streaming cursor | Animated cursor component | High |
| Add auto-scroll logic | Keep cursor in view | High |
| Build streaming indicators | "Generating..." status | Medium |
| Handle chunked updates | Parse SSE events into code | High |

**Deliverables**:
- Live streaming code display
- Visual feedback during generation
- Smooth scrolling experience

### Phase 3: Diff & Review (Enhancement)

**Goal**: Show what changed and allow review

| Task | Details | Priority |
|------|---------|----------|
| Implement diff calculation | Use `diff` library | High |
| Build diff view component | Side-by-side layout | High |
| Add change indicators | Green/red highlighting | High |
| File change badges | Show modified files in tree | Medium |
| Accept/reject UI | Buttons for each change | Medium |

**Deliverables**:
- Toggle between code and diff view
- Clear visualization of changes
- Review workflow

### Phase 4: Polish & UX (Refinement)

**Goal**: Production-ready experience

| Task | Details | Priority |
|------|---------|----------|
| Keyboard shortcuts | Cmd+C, Cmd+F, arrows | Medium |
| Copy functionality | Single file & all files | High |
| Download as ZIP | Client-side small, server-side large | Medium |
| Mobile responsive | Stacked layout | Medium |
| RTL support | Code LTR, file tree auto | Medium |
| Follow mode toggle | Control auto-scroll during streaming | Medium |
| Search in file | Cmd+F within current file | Medium |
| Search in project | Cross-file search (can be Phase 5) | Low |
| Dark/light themes | Match system preference | Low |

**Deliverables**:
- Full keyboard navigation
- Export capabilities (with size-aware client/server split)
- Cross-device support
- User control over streaming UX

---

## 5. Technical Specifications

### 5.1 SSE Event Format

```typescript
// Server sends events in this format
interface CodeStreamEvent {
  type: 'file_start' | 'content' | 'file_end' | 'complete' | 'error'
  data: {
    file?: string           // File path
    content?: string        // Code chunk (prefer line-chunks over char-chunks)
    language?: string       // File language
    cursor?: {              // Cursor position
      line: number
      column: number
    }
    error?: string          // Error message if type === 'error'
  }
}

// IMPORTANT: Include event IDs for resume support on reconnect
// Browser automatically sends Last-Event-ID header when reconnecting

// Example SSE stream with event IDs:
// id: evt_001
// event: file_start
// data: {"file":"src/App.tsx","language":"tsx"}

// id: evt_002
// event: content
// data: {"content":"import React from 'react';\n","cursor":{"line":1,"column":0}}

// id: evt_003
// event: content
// data: {"content":"import { Button } from './ui';\n","cursor":{"line":2,"column":0}}

// id: evt_004
// event: file_end
// data: {"file":"src/App.tsx"}

// id: evt_005
// event: complete
// data: {"files":["src/App.tsx","src/index.tsx"]}

// Server should handle Last-Event-ID header to resume from correct position
// to avoid duplicate chunks or corrupted content on reconnect
```

### 5.2 Language Detection

```typescript
// Map file extensions to syntax highlighter languages
const LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',

  // Web
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.json': 'json',

  // Backend
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',

  // Config
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.env': 'bash',

  // Other
  '.md': 'markdown',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.sh': 'bash',
}
```

### 5.3 Diff Algorithm

```typescript
// Using diff-match-patch for efficient diffing
import { diff_match_patch } from 'diff-match-patch'

interface DiffResult {
  type: 'equal' | 'insert' | 'delete'
  value: string
  lineStart: number
  lineEnd: number
}

function calculateDiff(oldContent: string, newContent: string): DiffResult[] {
  const dmp = new diff_match_patch()
  const diffs = dmp.diff_main(oldContent, newContent)
  dmp.diff_cleanupSemantic(diffs)
  return processDiffs(diffs)
}
```

---

## 6. UI/UX Design

### 6.1 Layout Specifications

```
Desktop (≥1024px):
┌────────────────────────────────────────────────────────────┐
│ Header: [View Toggle] [Actions]                      [···] │
├──────────────┬─────────────────────────────────────────────┤
│ File Tree    │ Code Panel                                  │
│ (250px min)  │ (flex-1)                                    │
│              │                                             │
│ Resizable ←→│                                             │
│              │                                             │
├──────────────┴─────────────────────────────────────────────┤
│ Footer: [File Info] [Status]                               │
└────────────────────────────────────────────────────────────┘

Tablet (768px - 1023px):
┌────────────────────────────────────────────────────────────┐
│ Header (collapsible file tree toggle)                      │
├────────────────────────────────────────────────────────────┤
│ Code Panel (full width)                                    │
│                                                            │
│ Slide-out file tree from left                              │
├────────────────────────────────────────────────────────────┤
│ Footer                                                     │
└────────────────────────────────────────────────────────────┘

Mobile (< 768px):
┌──────────────────────────┐
│ Header [≡] [Actions]     │
├──────────────────────────┤
│ File Tabs (horizontal    │
│ scroll)                  │
├──────────────────────────┤
│ Code Panel               │
│ (touch scroll)           │
│                          │
├──────────────────────────┤
│ Footer (minimal)         │
└──────────────────────────┘
```

### 6.2 Color Scheme

```css
/* Code viewer specific tokens */
:root {
  /* Background layers */
  --cv-bg-primary: hsl(var(--tpl-bg));
  --cv-bg-secondary: hsl(var(--tpl-surface));
  --cv-bg-tertiary: hsl(var(--tpl-surface-alt));

  /* Line numbers */
  --cv-line-number: hsl(var(--tpl-fg) / 0.4);
  --cv-line-number-active: hsl(var(--tpl-fg) / 0.8);

  /* Diff colors */
  --cv-diff-add-bg: hsl(142 76% 36% / 0.15);
  --cv-diff-add-text: hsl(142 76% 36%);
  --cv-diff-remove-bg: hsl(0 84% 60% / 0.15);
  --cv-diff-remove-text: hsl(0 84% 60%);

  /* Streaming */
  --cv-cursor-color: hsl(var(--tpl-accent));
  --cv-streaming-bg: hsl(var(--tpl-accent) / 0.05);
}
```

### 6.3 Animations

```typescript
// Framer Motion variants for smooth transitions
const cursorVariants = {
  blink: {
    opacity: [1, 0, 1],
    transition: { duration: 1, repeat: Infinity }
  }
}

const contentVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } }
}

const panelVariants = {
  collapsed: { width: 0, opacity: 0 },
  expanded: { width: 250, opacity: 1 }
}
```

### 6.4 File Icons

```typescript
// File type to icon mapping (using Lucide icons)
const FILE_ICONS: Record<string, string> = {
  '.tsx': 'file-code',      // React TypeScript
  '.ts': 'file-type',       // TypeScript
  '.jsx': 'file-code',      // React JavaScript
  '.js': 'file-json',       // JavaScript
  '.css': 'file-text',      // CSS
  '.html': 'file-text',     // HTML
  '.json': 'file-json',     // JSON
  '.md': 'file-text',       // Markdown
  '.py': 'file-code',       // Python
  'default': 'file',        // Default
}

// Folder states
const FOLDER_ICONS = {
  open: 'folder-open',
  closed: 'folder',
}
```

---

## 7. State Management

### 7.1 Zustand Store Definition

```typescript
// src/store/code-viewer-store.ts

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface FileState {
  path: string
  content: string
  language: string
  // Version tracking for accept/reject workflow
  baseHash?: string           // Hash before AI changes
  currentHash?: string        // Hash after AI changes
  previousContent?: string    // For diff view
  isModified: boolean
  isNew: boolean
  size: number
  status: 'idle' | 'streaming' | 'error'  // File-level status
}

interface StreamingState {
  isActive: boolean
  currentFile: string | null
  cursor: { line: number; column: number }  // Uses normalized \n positions
  progress: number            // 0-100
}

interface CodeViewerState {
  // File management - use Record, NOT Map (serializable, devtools-friendly)
  filesByPath: Record<string, FileState>
  fileOrder: string[]         // Maintains tree order
  activeFile: string | null
  openTabs: string[]

  // View state
  viewMode: 'code' | 'diff' | 'preview'
  isFileTreeOpen: boolean
  fileTreeWidth: number
  followMode: boolean         // Auto-scroll to streaming cursor

  // Streaming
  streaming: StreamingState

  // Build context
  buildId: string | null

  // Actions
  setActiveFile: (path: string) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  appendStreamingContent: (path: string, chunk: string, cursor: { line: number; column: number }) => void
  setViewMode: (mode: 'code' | 'diff' | 'preview') => void
  toggleFileTree: () => void
  setFileTreeWidth: (width: number) => void
  toggleFollowMode: () => void
  startStreaming: (file: string) => void
  endStreaming: () => void
  resetState: () => void
}

export const useCodeViewerStore = create<CodeViewerState>()(
  immer((set, get) => ({
    // Initial state - Record instead of Map
    filesByPath: {},
    fileOrder: [],
    activeFile: null,
    openTabs: [],
    viewMode: 'code',
    isFileTreeOpen: true,
    fileTreeWidth: 250,
    followMode: true,  // Auto-scroll by default
    streaming: {
      isActive: false,
      currentFile: null,
      cursor: { line: 0, column: 0 },
      progress: 0,
    },
    buildId: null,

    // Actions implementation...
  }))
)
```

### 7.2 React Query Integration

```typescript
// src/hooks/use-code-files.ts

import { useQuery, useMutation } from '@tanstack/react-query'

export function useCodeFiles(projectId: string, buildId?: string) {
  return useQuery({
    queryKey: ['code-files', projectId, buildId],
    queryFn: async () => {
      // Prefer buildId for versioned/immutable caching over timestamp busting
      const params = new URLSearchParams()
      if (buildId) params.set('buildId', buildId)

      const res = await fetch(`/api/v1/projects/${projectId}/files?${params}`)
      return res.json()
    },
    staleTime: buildId ? Infinity : 0,  // Immutable if buildId present
    refetchOnWindowFocus: !buildId,
  })
}

export function useCodeFile(projectId: string, filePath: string, buildId?: string) {
  return useQuery({
    queryKey: ['code-file', projectId, filePath, buildId],
    queryFn: async () => {
      // Use query param for path (avoids routing issues with slashes)
      const params = new URLSearchParams({ path: filePath })
      if (buildId) params.set('buildId', buildId)

      const res = await fetch(`/api/v1/projects/${projectId}/files?${params}`)
      return res.json()
    },
    enabled: !!filePath,
    staleTime: buildId ? Infinity : 0,
  })
}
```

### 7.3 SSE Streaming Hook

**Important**: EventSource cannot send custom headers. Use one of:
- Cookie-based auth (recommended - works seamlessly)
- Token in query string (works, but avoid logging URLs with tokens)
- Switch to `fetch()` + ReadableStream (more control, but manual reconnect)

**Resume strategy**: Rely on SSE `id:` fields + browser's automatic `Last-Event-ID` header on reconnect. Don't duplicate with query params - pick one canonical mechanism.

```typescript
// src/hooks/use-code-stream.ts

import { useEffect, useCallback, useRef, useState } from 'react'
import { useCodeViewerStore } from '@/store/code-viewer-store'

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

interface UseCodeStreamOptions {
  buildId: string
  authToken?: string          // If using query string auth (not cookies)
  onComplete?: () => void
  onError?: (error: Error) => void
}

export function useCodeStream({ buildId, authToken, onComplete, onError }: UseCodeStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  // Reactive connection state (refs don't trigger rerenders)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

  const {
    appendStreamingContent,
    startStreaming,
    endStreaming,
  } = useCodeViewerStore()

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setConnectionState('connecting')

    // Auth token only if not using cookies
    const params = new URLSearchParams()
    if (authToken) params.set('token', authToken)
    // Note: Do NOT pass lastEventId as query param - browser handles this
    // via Last-Event-ID header automatically when server emits id: fields

    const url = `/api/v1/builds/${buildId}/stream?${params}`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnectionState('connected')
    }

    eventSource.addEventListener('file_start', (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      startStreaming(data.file)
    })

    eventSource.addEventListener('content', (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      appendStreamingContent(data.file, data.content, data.cursor)
    })

    eventSource.addEventListener('complete', () => {
      setConnectionState('disconnected')
      endStreaming()
      eventSource.close()
      onComplete?.()
    })

    eventSource.onerror = () => {
      // onerror fires for BOTH transient disconnects AND terminal failures
      // Browser auto-reconnects if readyState becomes CONNECTING
      if (eventSource.readyState === EventSource.CLOSED) {
        // Terminal: connection failed permanently
        setConnectionState('error')
        endStreaming()
        onError?.(new Error('Stream connection closed'))
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        // Transient: browser is auto-reconnecting, don't panic
        setConnectionState('connecting')
      }
    }

    return () => {
      eventSource.close()
      setConnectionState('disconnected')
    }
  }, [buildId, authToken, appendStreamingContent, startStreaming, endStreaming, onComplete, onError])

  useEffect(() => {
    const cleanup = connect()
    return cleanup
  }, [connect])

  return {
    connectionState,  // Reactive, unlike ref-based check
    reconnect: connect,
    disconnect: () => {
      eventSourceRef.current?.close()
      setConnectionState('disconnected')
    },
  }
}
```

---

## 8. API Integration

### 8.1 Backend Endpoints Required

```typescript
// New routes to add in sheenapps-claude-worker

// GET /api/v1/projects/:id/files
// Query params: ?path=src/App.tsx (optional, for single file)
//               ?buildId=xxx (optional, for versioned/immutable cache)
// Returns file tree OR single file based on path param
interface GetFilesResponse {
  files: {
    path: string
    type: 'file' | 'directory'
    size?: number
    language?: string
    hash?: string             // For change detection
    children?: GetFilesResponse['files']
  }[]
  totalFiles: number
  totalSize: number
  buildId?: string
}

interface GetFileResponse {
  path: string
  content: string
  language: string
  size: number
  lastModified: string
  hash: string                // Content hash for version tracking
}

// GET /api/v1/builds/:id/stream
// Query params: ?token=xxx (auth if not using cookies)
//               ?lastEventId=xxx (resume from this event)
// SSE endpoint for code generation streaming
// MUST include event IDs for resume support (see section 5.1)

// POST /api/v1/builds/:id/accept
// Accept generated changes into project
interface AcceptChangesRequest {
  files: string[]             // Paths to accept, empty = all
  baseHashes?: Record<string, string>  // Expected base hashes (conflict detection)
}
interface AcceptChangesResponse {
  accepted: string[]
  conflicts: string[]         // Files that changed since generation
  projectId: string
  newBuildId: string          // New version after accept
}
```

### 8.2 Frontend API Client

```typescript
// src/services/code-viewer-api.ts

import { workerApiClient } from '@/services/worker-api-client'

export const codeViewerApi = {
  // List all files in project
  getFiles: (projectId: string, buildId?: string) => {
    const params = new URLSearchParams()
    if (buildId) params.set('buildId', buildId)
    return workerApiClient.get<GetFilesResponse>(`/projects/${projectId}/files?${params}`)
  },

  // Get single file - use query param to avoid routing issues with slashes
  getFile: (projectId: string, path: string, buildId?: string) => {
    const params = new URLSearchParams({ path })
    if (buildId) params.set('buildId', buildId)
    return workerApiClient.get<GetFileResponse>(`/projects/${projectId}/files?${params}`)
  },

  acceptChanges: (buildId: string, files: string[], baseHashes?: Record<string, string>) =>
    workerApiClient.post<AcceptChangesResponse>(`/builds/${buildId}/accept`, { files, baseHashes }),

  // Note: SSE URL - auth via cookies (preferred) or add ?token= if needed
  createStreamUrl: (buildId: string) =>
    `${process.env.NEXT_PUBLIC_WORKER_URL}/api/v1/builds/${buildId}/stream`,
}
```

---

## 9. Performance Considerations

### 9.1 Large File Handling (Phase 5 / Optional)

**Reality check**: `react-syntax-highlighter` doesn't expose a tokenization API. The "tokenize once, virtualize lines" pattern requires either:
- Building custom tokenization infrastructure
- Switching to `prism-react-renderer` (lower-level API)
- Using Monaco/CodeMirror (full editor engines)

**MVP-safe approach** (no virtualization needed):

```typescript
const LARGE_FILE_THRESHOLD = 2000 // lines

function CodeContent({ content, language, isStreaming }: Props) {
  const lineCount = content.split('\n').length
  const isLargeFile = lineCount > LARGE_FILE_THRESHOLD

  if (isLargeFile) {
    // Large file: render plain monospace (fast)
    // Show warning badge: "Syntax highlighting disabled for large files"
    return (
      <div className="code-plain">
        <LargeFileWarning lines={lineCount} />
        <pre className="font-mono text-sm">{content}</pre>
      </div>
    )
  }

  // Normal file: full syntax highlighting
  return (
    <SyntaxHighlighter language={language} style={theme}>
      {content}
    </SyntaxHighlighter>
  )
}
```

**Phase 5 enhancement**: If virtualization becomes necessary, consider:
1. `prism-react-renderer` for tokenization access + `react-window` for rendering
2. Monaco editor for files >5000 lines (it handles virtualization internally)
3. Accept "highlighting may be inaccurate" for virtualized large files

### 9.2 Throttled Syntax Highlighting (Critical for Streaming)

**Problem**: Re-running Prism/syntax highlighting on every character/chunk causes jank. RAF (≈16ms) is still too frequent for expensive highlight operations.

**Solution**: Throttle to 50-100ms, skip highlighting for large files until complete.

```typescript
const HIGHLIGHT_THROTTLE_MS = 80
const LARGE_FILE_THRESHOLD = 3000 // lines

function useStreamingHighlight(rawContent: string, language: string, isStreaming: boolean) {
  const [highlightedContent, setHighlightedContent] = useState('')
  const pendingRef = useRef<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const lineCount = rawContent.split('\n').length
  const isLargeFile = lineCount > LARGE_FILE_THRESHOLD

  useEffect(() => {
    if (isStreaming) {
      if (isLargeFile) {
        // Large file during streaming: show plain text, highlight after complete
        setHighlightedContent(rawContent)
        return
      }

      // Normal file: throttle highlights to 50-100ms, drop intermediate updates
      pendingRef.current = rawContent
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          if (pendingRef.current) {
            setHighlightedContent(highlight(pendingRef.current, language))
            pendingRef.current = null
          }
          timeoutRef.current = undefined
        }, HIGHLIGHT_THROTTLE_MS)
      }

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
      }
    } else {
      // Streaming ended: highlight immediately (final render)
      setHighlightedContent(highlight(rawContent, language))
    }
  }, [rawContent, language, isStreaming, isLargeFile])

  return highlightedContent
}
```

**Server contract**: Chunks should end on `\n` (except possibly the final line) so cursor `{line, column}` math stays clean and consistent with normalized `\n` storage.

### 9.3 Lazy Loading

```typescript
// Dynamic import for syntax highlighter themes
const SyntaxHighlighter = dynamic(
  () => import('react-syntax-highlighter').then(mod => mod.Prism),
  {
    loading: () => <CodeSkeleton />,
    ssr: false
  }
)

// Lazy load diff library only when needed
const DiffViewer = dynamic(
  () => import('./code-diff-view'),
  { loading: () => <DiffSkeleton /> }
)
```

### 9.4 Memory Management

```typescript
// Clean up old file contents when tab is closed
function closeFile(path: string) {
  set(state => {
    state.openTabs = state.openTabs.filter(p => p !== path)
    // Keep file metadata but clear content if not in tabs
    const file = state.filesByPath[path]  // Record access, not Map.get()
    if (file && !state.openTabs.includes(path)) {
      file.content = ''  // Free memory
    }
  })
}
```

---

## 10. File Structure

```
src/
├── components/
│   └── builder/
│       └── code-viewer/
│           ├── index.ts                        # Barrel export
│           ├── generated-code-viewer.tsx       # Main container
│           ├── code-viewer-header.tsx          # Header with actions
│           ├── file-tree-panel.tsx             # File navigation
│           ├── file-tree-node.tsx              # Tree node component
│           ├── code-display-panel.tsx          # Code viewing area
│           ├── file-tabs.tsx                   # Tab management
│           ├── code-content.tsx                # Syntax highlighted code
│           ├── streaming-cursor.tsx            # Animated cursor
│           ├── code-diff-view.tsx              # Diff visualization
│           ├── line-numbers.tsx                # Line number column
│           ├── code-minimap.tsx                # Navigation minimap
│           ├── code-viewer-footer.tsx          # Status bar
│           └── code-viewer-skeleton.tsx        # Loading state
│
├── hooks/
│   ├── use-code-files.ts                       # React Query hooks
│   ├── use-code-stream.ts                      # SSE streaming hook
│   └── use-code-viewer-keyboard.ts             # Keyboard shortcuts
│
├── store/
│   └── code-viewer-store.ts                    # Zustand store
│
├── services/
│   └── code-viewer-api.ts                      # API client
│
├── types/
│   └── code-viewer.ts                          # TypeScript types
│
└── utils/
    ├── language-detection.ts                   # File → language mapping
    ├── diff-calculation.ts                     # Diff utilities
    └── code-formatting.ts                      # Formatting helpers
```

---

## 11. Dependencies

### Required (New)

```json
{
  "dependencies": {
    "react-resizable-panels": "^2.0.0",     // Resizable split panes
    "diff-match-patch": "^1.0.5",           // Diff calculation
    "jszip": "^3.10.1",                     // Client-side ZIP (small projects)
    "file-saver": "^2.0.5"                  // Download blobs
  },
  "devDependencies": {
    "@types/file-saver": "^2.0.7"
  }
}

// Phase 5 (if virtualization needed):
// "react-window": "^1.8.10"
// "prism-react-renderer": "^2.3.0"
```

### Already Available

```json
{
  "dependencies": {
    "react-syntax-highlighter": "^15.x",    // ✅ Already installed
    "@tanstack/react-query": "^5.x",        // ✅ Already installed
    "zustand": "^4.x",                       // ✅ Already installed
    "framer-motion": "^12.x",               // ✅ Already installed
    "lucide-react": "^0.x"                  // ✅ Already installed
  }
}
```

### Optional Enhancements

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",       // Full editor (if needed later)
    "prism-react-renderer": "^2.3.0"        // Alternative highlighter
  }
}
```

---

## 12. Critical Gotchas

These are the issues most likely to cause problems in production. Address them proactively.

### 12.1 RTL Support: Keep Code LTR

Code should **always** be `dir="ltr"` even in Arabic/Hebrew locales. Otherwise you get punctuation/indentation weirdness.

```tsx
// Correct approach:
<div className="code-viewer">
  {/* File tree: dir="auto" so Arabic filenames display correctly */}
  <FileTree dir="auto" />

  {/* Code area: ALWAYS LTR, even in RTL locales */}
  <pre dir="ltr" style={{ unicodeBidi: 'isolate' }}>
    {code}
  </pre>
</div>

// For Arabic comments inside code (rare but real):
// Use unicode-bidi: isolate on comment spans if needed
```

### 12.2 Diff Computation: Offload for Large Files

`diff-match-patch` is efficient but can freeze the UI on large files.

```typescript
// Threshold-based approach
const DIFF_WORKER_THRESHOLD = 2000 // lines or 200KB

function useDiff(oldContent: string, newContent: string) {
  const isLarge = oldContent.length > 200_000 || newContent.split('\n').length > 2000

  if (isLarge) {
    // Offload to Web Worker
    return useDiffWorker(oldContent, newContent)
  } else {
    // Inline computation is fine
    return useMemo(() => calculateDiff(oldContent, newContent), [oldContent, newContent])
  }
}

// Alternative: Only compute diff when user opens Diff view (lazy)
```

### 12.3 Download ZIP: Client vs Server

Client-side zipping (`jszip`) can explode memory on large projects.

```typescript
const ZIP_CLIENT_LIMIT = 50 * 1024 * 1024 // 50MB

async function downloadProject(files: FileState[], totalSize: number) {
  if (totalSize > ZIP_CLIENT_LIMIT) {
    // Large project: stream from server
    window.location.href = `/api/v1/projects/${projectId}/download?format=zip`
  } else {
    // Small project: client-side zip
    const zip = new JSZip()
    files.forEach(f => zip.file(f.path, f.content))
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${projectName}.zip`)
  }
}
```

### 12.4 Line Ending & Cursor Normalization

Store `\n` internally. **Critical**: cursor `{line, column}` positions must use the same normalization, or cursor placement will drift on Windows CRLF inputs.

```typescript
// On receive from server - normalize content AND ensure cursor matches
function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

// Server contract: cursor positions should be computed against \n-normalized content
// If server sends CRLF content, cursor.line will be wrong after client normalizes

// On download (if preserving original matters)
const downloadContent = originalLineEnding === 'crlf'
  ? content.replace(/\n/g, '\r\n')
  : content
```

### 12.5 File Tree Status Indicators

Show clear visual states in the file tree:

```typescript
interface FileTreeNodeProps {
  status: 'idle' | 'streaming' | 'modified' | 'new' | 'error'
}

// Visual indicators:
// - streaming: pulsing dot animation
// - modified: orange dot
// - new: green "+" badge
// - error: red "!" badge
```

### 12.6 Follow Mode Toggle

Users need control over auto-scrolling during streaming:

```tsx
<div className="code-viewer-controls">
  <Toggle
    pressed={followMode}
    onPressedChange={toggleFollowMode}
    aria-label="Follow streaming cursor"
  >
    <LocateFixed className="h-4 w-4" />
  </Toggle>
</div>

// When followMode is true: auto-scroll to keep cursor visible
// When false: let user scroll freely without interruption
```

---

## Summary

This plan provides a comprehensive roadmap for building a generated code viewer similar to Lovable/Replit. The implementation leverages existing infrastructure (file-viewer, SSE streaming, Zustand, React Query) while adding new capabilities:

1. **Phase 1**: Core split-pane layout with file tree and syntax highlighting
2. **Phase 2**: Real-time streaming with animated cursor
3. **Phase 3**: Diff view for code review workflow
4. **Phase 4**: Polish with keyboard shortcuts, export, and mobile support

### Top 3 Things to Get Right

To avoid most production pain, prioritize these:

1. **Use Record instead of Map** for Zustand store (serializable, devtools-friendly)
2. **Throttle streaming renders** (50-100ms, not RAF) + skip highlighting for large files until `file_end`
3. **SSE resume via `id:` fields** - let browser handle `Last-Event-ID` header automatically

### Internal Consistency Checklist

Before implementation, verify these are aligned:
- [ ] All store access uses `filesByPath[path]`, not `files.get(path)`
- [ ] API client uses `?path=` query param, not `/files/:path` route
- [ ] Connection state is reactive (`useState`), not ref-based
- [ ] Cursor positions assume `\n`-normalized content
- [ ] Large file threshold consistent across components (2000-3000 lines)

The modular component architecture allows incremental delivery while maintaining code quality and performance at scale.
