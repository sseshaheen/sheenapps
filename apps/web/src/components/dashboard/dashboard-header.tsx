'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { dashboardEventCoordinator } from '@/services/events/dashboard-coordinator'
import { useAuthStore } from '@/store'
import { useEffect, useRef, useMemo } from 'react'
import { KeyboardShortcuts } from './keyboard-shortcuts'

interface DashboardHeaderProps {
  translations: any
  searchQuery: string
  onSearchChange: (query: string) => void
  sortBy: 'updated' | 'created' | 'name'
  onSortChange: (sort: 'updated' | 'created' | 'name') => void
  filterBy: 'all' | 'active' | 'archived'
  onFilterChange: (filter: 'all' | 'active' | 'archived') => void
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
  onCreateProject: () => void
  projectCount: number
}

export function DashboardHeader({
  translations,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onCreateProject,
  projectCount
}: DashboardHeaderProps) {
  const { user } = useAuthStore()
  const previousFilters = useRef({ searchQuery, filterBy, sortBy })
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // ✅ EXPERT FIX: Memoize options to prevent infinite loop from changing identity
  const sortOptions = useMemo(() => [
    { value: 'updated', label: translations.dashboard.lastUpdated },
    { value: 'created', label: translations.dashboard.created },
    { value: 'name', label: translations.dashboard.name || 'Name' }
  ], [translations.dashboard.lastUpdated, translations.dashboard.created, translations.dashboard.name])

  const filterOptions = useMemo(() => [
    { value: 'active', label: translations.dashboard.active },
    { value: 'all', label: translations.dashboard.allProjects },
    { value: 'archived', label: translations.dashboard.archived }
  ], [translations.dashboard.active, translations.dashboard.allProjects, translations.dashboard.archived])

  // Focus search on mount and when pressing "/"
  useEffect(() => {
    // Focus on mount
    searchInputRef.current?.focus()

    // Keyboard shortcut handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search on "/" key
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Clear search on Escape
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        e.preventDefault()
        onSearchChange('')
        searchInputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSearchChange])

  // Emit search events when search parameters change (expert: debounced)
  useEffect(() => {
    const prev = previousFilters.current
    const hasChanged = (
      searchQuery !== prev.searchQuery ||
      filterBy !== prev.filterBy ||
      sortBy !== prev.sortBy
    )

    if (hasChanged && user) {
      // Calculate results count (could be passed as prop for accuracy)
      const resultsCount = projectCount // Approximation
      
      // Emit search event (will be automatically debounced)
      dashboardEventCoordinator.emitSearchEvent(
        searchQuery,
        resultsCount,
        filterBy,
        sortBy
      )

      // Update previous values
      previousFilters.current = { searchQuery, filterBy, sortBy }
    }
  }, [searchQuery, filterBy, sortBy, projectCount, user])

  return (
    <div className="space-y-4">
      {/* Title and Create Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {translations.dashboard.title}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {translations.dashboard.subtitle} • {projectCount} {translations.dashboard.projectsLabel || 'projects'}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
          onClick={() => {
            if (user) {
              dashboardEventCoordinator.emitProjectAction('create', [], user.id)
            }
            onCreateProject()
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
          size="sm"
        >
            <Icon name="plus" className="w-4 h-4 sm:me-2" />
            <span className="hidden sm:inline">{translations.dashboard.createProject}</span>
            <span className="sm:hidden">{translations.dashboard.createShort || 'Create'}</span>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative w-full">
          <Icon name="search" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={translations.dashboard.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="ps-10 w-full bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-purple-500"
            aria-label="Search projects"
          />
        </div>

        {/* Filters and View Controls - Mobile Optimized */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          {/* Left side - Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Keyboard Shortcuts - Hidden on mobile */}
            <div className="hidden lg:block">
              <KeyboardShortcuts />
            </div>
            
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-0">
                  <Icon name="filter" className="w-4 h-4 sm:mr-2" />
                  {/* ✅ EXPERT FIX: Always render span, use CSS to hide - prevents hydration anchor remount */}
                  <span className="hidden sm:inline">
                    {filterOptions.find(opt => opt.value === filterBy)?.label}
                  </span>
                  <Icon name="chevron-down" className="w-4 h-4 sm:ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {filterOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => onFilterChange(option.value as any)}
                    className={cn(
                      "cursor-pointer",
                      filterBy === option.value && "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                    )}
                  >
                    <Icon name="check" className={cn(
                      "w-4 h-4 me-2",
                      filterBy === option.value ? "opacity-100" : "opacity-0"
                    )} />
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-0">
                  <Icon name="arrow-up-down" className="w-4 h-4 sm:mr-2" />
                  {/* ✅ EXPERT FIX: Always render span, use CSS to hide - prevents hydration anchor remount */}
                  <span className="hidden sm:inline">
                    {sortOptions.find(opt => opt.value === sortBy)?.label}
                  </span>
                  <Icon name="chevron-down" className="w-4 h-4 sm:ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {sortOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => onSortChange(option.value as any)}
                    className={cn(
                      "cursor-pointer",
                      sortBy === option.value && "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                    )}
                  >
                    <Icon name="check" className={cn(
                      "w-4 h-4 me-2",
                      sortBy === option.value ? "opacity-100" : "opacity-0"
                    )} />
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right side - View Mode Toggle */}
          <div className="flex border border-border rounded-md bg-card ms-auto">
            <button
              onClick={() => {
                if (viewMode !== 'grid') {
                  dashboardEventCoordinator.emitViewChange(viewMode, 'grid')
                }
                onViewModeChange('grid')
              }}
              className={cn(
                "p-2 rounded-s-md transition-colors min-w-[40px] flex items-center justify-center",
                viewMode === 'grid'
                  ? "bg-purple-600 text-white"
                  : "bg-card text-muted-foreground hover:text-foreground"
              )}
              aria-label="Grid view"
            >
              <Icon name="grid-3x3" className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (viewMode !== 'list') {
                  dashboardEventCoordinator.emitViewChange(viewMode, 'list')
                }
                onViewModeChange('list')
              }}
              className={cn(
                "p-2 rounded-e-md transition-colors min-w-[40px] flex items-center justify-center",
                viewMode === 'list'
                  ? "bg-purple-600 text-white"
                  : "bg-card text-muted-foreground hover:text-foreground"
              )}
              aria-label="List view"
            >
              <Icon name="list" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}