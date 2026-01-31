'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react'
import { logger } from '@/utils/logger'

export interface DashboardState {
  searchQuery: string
  filterBy: 'all' | 'active' | 'archived'
  sortBy: 'updated' | 'created' | 'name'
  isLoading: boolean
  viewMode: 'grid' | 'list'
}

interface DashboardStateContextType extends DashboardState {
  setSearchQuery: (query: string) => void
  setFilterBy: (filter: 'all' | 'active' | 'archived') => void
  setSortBy: (sort: 'updated' | 'created' | 'name') => void
  setViewMode: (mode: 'grid' | 'list') => void
  setIsLoading: (loading: boolean) => void
  resetFilters: () => void
}

const DashboardStateContext = createContext<DashboardStateContextType | null>(null)

export function useDashboardState() {
  const context = useContext(DashboardStateContext)
  if (!context) {
    throw new Error('useDashboardState must be used within DashboardStateProvider')
  }
  return context
}

interface DashboardStateProviderProps {
  children: ReactNode
  initialState?: Partial<DashboardState>
}

const defaultState: DashboardState = {
  searchQuery: '',
  filterBy: 'active',
  sortBy: 'updated',
  isLoading: false,
  viewMode: 'grid'
}

export function DashboardStateProvider({ 
  children, 
  initialState 
}: DashboardStateProviderProps) {
  const [state, setState] = useState<DashboardState>({
    ...defaultState,
    ...initialState
  })

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }))
    logger.info('🔍 Search query updated', { query })
  }, [])

  const setFilterBy = useCallback((filter: 'all' | 'active' | 'archived') => {
    setState(prev => ({ ...prev, filterBy: filter }))
    logger.info('🔧 Filter updated', { filter })
  }, [])

  const setSortBy = useCallback((sort: 'updated' | 'created' | 'name') => {
    setState(prev => ({ ...prev, sortBy: sort }))
    logger.info('🔀 Sort updated', { sort })
  }, [])

  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setState(prev => ({ ...prev, viewMode: mode }))
    logger.info('👁️ View mode updated', { mode })
  }, [])

  const setIsLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }))
  }, [])

  const resetFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      searchQuery: '',
      filterBy: 'active',
      sortBy: 'updated'
    }))
    logger.info('🔄 Filters reset')
  }, [])

  const value = useMemo(() => ({
    ...state,
    setSearchQuery,
    setFilterBy,
    setSortBy,
    setViewMode,
    setIsLoading,
    resetFilters
  }), [state, setSearchQuery, setFilterBy, setSortBy, setViewMode, setIsLoading, resetFilters])

  return (
    <DashboardStateContext.Provider value={value}>
      {children}
    </DashboardStateContext.Provider>
  )
}