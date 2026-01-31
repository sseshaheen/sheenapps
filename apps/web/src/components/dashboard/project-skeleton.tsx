'use client'

import { cn } from '@/lib/utils'

interface ProjectSkeletonProps {
  viewMode: 'grid' | 'list'
  count?: number
}

export function ProjectSkeleton({ viewMode, count = 6 }: ProjectSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
            <div className="flex items-center space-x-4 rtl:space-x-reverse">
              <div className="w-12 h-12 bg-muted rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/6" />
              </div>
              <div className="flex space-x-2 rtl:space-x-reverse">
                <div className="w-8 h-8 bg-muted rounded" />
                <div className="w-8 h-8 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-lg border border-border overflow-hidden animate-pulse">
          <div
            className="bg-muted"
            style={{ aspectRatio: '16/10' }}
          />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  searchQuery: string
  filterBy: 'all' | 'active' | 'archived'
  onClearFilters: () => void
  onCreateProject: () => void
  translations: any
}

export function EmptyState({
  searchQuery,
  filterBy,
  onClearFilters,
  onCreateProject,
  translations
}: EmptyStateProps) {
  const hasFilters = searchQuery || filterBy !== 'all'

  if (hasFilters) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-foreground mb-2">{translations.dashboard?.noProjects || 'No projects found'}</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery && `No projects matching "${searchQuery}"`}
            {!searchQuery && filterBy === 'archived' && (translations.dashboard?.noArchivedProjects || 'No archived projects')}
            {!searchQuery && filterBy === 'active' && (translations.dashboard?.noActiveProjects || 'No active projects')}
          </p>
          <button
            onClick={onClearFilters}
            className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
          >
            {translations.dashboard?.clearFilters || 'Clear filters'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center py-12 space-y-4">
      <div className="mx-auto w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-medium text-foreground mb-2">{translations.dashboard?.noProjects || 'No projects yet'}</h3>
        <p className="text-muted-foreground mb-4">
          {translations.dashboard?.noProjectsDescription || 'Create your first project to get started'}
        </p>
        <button
          onClick={onCreateProject}
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <svg className="w-5 h-5 me-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {translations.dashboard?.createProject || 'Create Project'}
        </button>
      </div>
    </div>
  )
}
