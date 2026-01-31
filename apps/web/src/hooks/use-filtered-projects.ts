'use client'

import { useMemo } from 'react'
import { useDashboardState } from '@/components/dashboard/dashboard-state-context'
import type { Project } from './use-projects'

export function useFilteredProjects(projects: Project[] | null) {
  const { searchQuery, filterBy, sortBy } = useDashboardState()

  const filteredAndSortedProjects = useMemo(() => {
    if (!projects) return []

    let filtered = [...projects]

    // Project filtering logic (debug logs removed for production)

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(project => 
        project.name.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    switch (filterBy) {
      case 'active':
        // Check archived_at column for archive status
        const beforeActiveFilter = filtered.length
        filtered = filtered.filter(project => 
          !project.archived_at
        )
        // Active projects filtered
        break
      case 'archived':
        // Check archived_at column for archive status
        const beforeArchivedFilter = filtered.length
        filtered = filtered.filter(project => 
          !!project.archived_at
        )
        // Archived projects filtered
        break
      case 'all':
        // No filtering needed
        // Showing all projects
        break
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return 0
      }
    })

    return filtered
  }, [projects, searchQuery, filterBy, sortBy])

  return filteredAndSortedProjects
}