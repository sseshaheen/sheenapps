/**
 * Lazy-Loaded Workspace Components
 *
 * Dynamic imports for workspace components to reduce bundle size
 * Part of Phase 3 bundle optimization
 */

'use client'

import dynamic from 'next/dynamic'
import { ComponentType } from 'react'

// Loading component for workspace features
const WorkspaceLoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-2">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <p className="text-sm text-muted-foreground">Loading workspace...</p>
    </div>
  </div>
)

// Error boundary for workspace components
const WorkspaceErrorFallback = ({ error }: { error: Error }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="text-red-500 text-lg mb-2">⚠️</div>
      <p className="text-sm text-foreground mb-1">Failed to load workspace component</p>
      <p className="text-xs text-muted-foreground">{error.message}</p>
    </div>
  </div>
)

// Core workspace components (loaded on demand)
export const LazyAdvisorWorkspace = dynamic(
  () => import('@/components/advisor/advisor-workspace').then(mod => ({ default: mod.AdvisorWorkspace })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

export const LazyWorkspaceLayout = dynamic(
  () => import('@/components/workspace/core/workspace-layout').then(mod => ({ default: mod.WorkspaceLayout })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

// File browser components
export const LazyFileBrowser = dynamic(
  () => import('@/components/workspace/file-browser/file-browser').then(mod => ({ default: mod.FileBrowser })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

export const LazyEnhancedFileViewer = dynamic(
  () => import('@/components/workspace/file-browser/enhanced-file-viewer').then(mod => ({ default: mod.EnhancedFileViewer })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

// Log viewer components
export const LazyLogViewer = dynamic(
  () => import('@/components/workspace/log-viewer/log-viewer').then(mod => ({ default: mod.LogViewer })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

export const LazyLogHistory = dynamic(
  () => import('@/components/workspace/log-viewer/log-history').then(mod => ({ default: mod.LogHistory })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

// Session management
export const LazySessionManager = dynamic(
  () => import('@/components/workspace/session/session-manager').then(mod => ({ default: mod.SessionManager })),
  {
    loading: () => <div className="animate-pulse bg-muted rounded h-8 w-24" />,
    ssr: false
  }
)

// Performance monitoring
export const LazyPerformanceMonitor = dynamic(
  () => import('@/components/workspace/shared/performance-monitor').then(mod => ({ default: mod.PerformanceMonitor })),
  {
    loading: () => <div className="animate-pulse bg-muted rounded h-6 w-16" />,
    ssr: false
  }
)

// Collaboration features
export const LazyPresenceIndicator = dynamic(
  () => import('@/components/workspace/shared/presence-indicator').then(mod => ({ default: mod.PresenceIndicator })),
  {
    loading: () => <div className="animate-pulse bg-muted rounded-full h-8 w-16" />,
    ssr: false
  }
)

// Advanced features (Phase 3)
export const LazyCollaborativeCursors = dynamic(
  () => import('@/components/workspace/collaboration/collaborative-cursors').then(mod => ({ default: mod.CollaborativeCursors })),
  {
    loading: () => null, // No loading state for cursors
    ssr: false
  }
)

export const LazyActivityFeed = dynamic(
  () => import('@/components/workspace/collaboration/activity-feed').then(mod => ({ default: mod.ActivityFeed })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

export const LazyNotificationCenter = dynamic(
  () => import('@/components/workspace/collaboration/notification-center').then(mod => ({ default: mod.NotificationCenter })),
  {
    loading: () => <div className="animate-pulse bg-muted rounded h-8 w-8" />,
    ssr: false
  }
)

// Higher-order component for conditional loading based on permissions
interface ConditionalWorkspaceComponentProps {
  condition: boolean
  fallback?: ComponentType | null
  children: ComponentType
}

export function ConditionalWorkspaceComponent({
  condition,
  fallback: Fallback = null,
  children: Component
}: ConditionalWorkspaceComponentProps) {
  if (!condition) {
    return Fallback ? <Fallback /> : null
  }

  return <Component />
}

// Bundle for advisor-only features
export const LazyAdvisorFeatures = dynamic(
  () => import('@/components/workspace/advisor/advisor-features').then(mod => ({ default: mod.AdvisorFeatures })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

// Bundle for client-only features
export const LazyClientFeatures = dynamic(
  () => import('@/components/workspace/client/client-features').then(mod => ({ default: mod.ClientFeatures })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

// Bundle for project owner features
export const LazyProjectOwnerFeatures = dynamic(
  () => import('@/components/workspace/admin/project-owner-features').then(mod => ({ default: mod.ProjectOwnerFeatures })),
  {
    loading: () => <WorkspaceLoadingSpinner />,
    ssr: false
  }
)

// Utility function to preload workspace components
// TODO: Next.js dynamic() doesn't support preload() yet - these are placeholders
export const preloadWorkspaceComponents = {
  // Core components
  core: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  // File management
  files: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  // Logging
  logs: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  // Collaboration
  collaboration: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  // Role-specific features
  advisor: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  client: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  projectOwner: () => {
    // Preload not yet supported by Next.js dynamic()
  },

  // Preload all
  all: () => {
    preloadWorkspaceComponents.core()
    preloadWorkspaceComponents.files()
    preloadWorkspaceComponents.logs()
    preloadWorkspaceComponents.collaboration()
  }
}

// Performance metrics for bundle optimization
export const workspaceComponentMetrics = {
  // Estimated bundle sizes (in KB)
  bundleSizes: {
    core: 45,
    fileBrowser: 32,
    logViewer: 28,
    collaboration: 24,
    advisor: 18,
    client: 22,
    projectOwner: 15
  },

  // Performance thresholds
  thresholds: {
    maxBundleSize: 150, // KB
    maxLoadTime: 2000,  // ms
    maxRenderTime: 100  // ms
  },

  // Optimization flags
  flags: {
    enablePreloading: true,
    enableCodeSplitting: true,
    enableTreeShaking: true,
    enableCompression: true
  }
}

// Development helpers
// TODO: Re-enable when Next.js dynamic() supports preload()
// if (process.env.NODE_ENV === 'development') {
//   // Log bundle loading for debugging
//   const originalPreload = LazyAdvisorWorkspace.preload
//   LazyAdvisorWorkspace.preload = () => {
//     console.log('🚀 Preloading AdvisorWorkspace component')
//     return originalPreload()
//   }
// }