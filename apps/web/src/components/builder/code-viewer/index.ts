/**
 * Code Viewer Components
 *
 * Barrel export for all code viewer components.
 */

// Main component
export { GeneratedCodeViewer } from './generated-code-viewer'
export type { GeneratedCodeViewerProps } from './generated-code-viewer'

// Sub-components
export { FileTreePanel } from './file-tree-panel'
export { FileTreeNode } from './file-tree-node'
export { CodeDisplayPanel } from './code-display-panel'
export { CodeContent } from './code-content'
export { FileTabs } from './file-tabs'
export { StreamingCursor } from './streaming-cursor'
export { CodeDiffView, SplitDiffView } from './code-diff-view'
export type { CodeDiffViewProps, SplitDiffViewProps } from './code-diff-view'
export { CodeSearchBar, useCodeSearch, highlightMatches } from './code-search'
export type { CodeSearchProps, SearchMatch } from './code-search'
