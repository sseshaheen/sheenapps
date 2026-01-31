'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import Icon from '@/components/ui/icon'
import type { ApiResponse, DatabaseSchema } from '@/types/inhouse-api'

interface SchemaBrowserProps {
  projectId: string
  translations: {
    title: string
    tables: string
    columns: string
    type: string
    nullable: string
    primaryKey: string
    loading: string
    error: string
    noTables: string
    createFirst: string
    createTable: string
    rows: string
  }
  onCreateTable: () => void
}

/**
 * Schema Browser Component
 *
 * Displays database schema with expandable table cards.
 * Shows columns, types, nullable flags, and primary keys.
 */
export function SchemaBrowser({
  projectId,
  translations,
  onCreateTable
}: SchemaBrowserProps) {
  // Fetch schema with React Query
  const { data, error, isLoading } = useQuery<DatabaseSchema, Error>({
    queryKey: ['project-schema', projectId],
    queryFn: async (): Promise<DatabaseSchema> => {
      // EXPERT FIX: Removed cache-busting timestamp - React Query + cache: 'no-store' is sufficient
      const response = await fetch(`/api/inhouse/projects/${projectId}/schema`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })

      // EXPERT FIX: Graceful non-JSON error handling (proxy errors, 502 pages, etc.)
      if (!response.ok) {
        let message = `Failed to fetch schema (HTTP ${response.status})`
        try {
          const errorData = await response.json() as ApiResponse<never>
          if (errorData?.ok === false) {
            message = errorData.error.message
          }
        } catch {
          // Ignore JSON parse error - use HTTP status message
        }
        throw new Error(message)
      }

      const responseData = await response.json() as ApiResponse<DatabaseSchema>

      if (!responseData.ok) {
        throw new Error('Failed to fetch schema')
      }

      return responseData.data
    },
    refetchOnWindowFocus: false,
    // EXPERT FIX: Removed refetchOnReconnect to avoid spam on flaky connections
    staleTime: 30000 // EXPERT FIX: Increased to 30s - schema changes rarely
  })

  // Track expanded tables
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  // EXPERT FIX: Functional setState to avoid stale closures
  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev)
      if (next.has(tableName)) {
        next.delete(tableName)
      } else {
        next.add(tableName)
      }
      return next
    })
  }

  // Loading state - Milestone C: Enhanced Skeleton Loaders
  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading schema">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>

        {/* Table card skeletons (show 3 cards) */}
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-4 rounded" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <Icon name="alert-circle" className="h-4 w-4" />
        <AlertDescription>{translations.error}: {error.message}</AlertDescription>
      </Alert>
    )
  }

  // Empty state
  if (!data || data.tables.length === 0) {
    return (
      <div className="text-center p-8 space-y-4">
        <Icon name="database" className="w-12 h-12 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{translations.noTables}</p>
        <Button onClick={onCreateTable} size="sm">
          <Icon name="plus" className="w-4 h-4 me-2" />
          {translations.createFirst}
        </Button>
      </div>
    )
  }

  // Schema display
  return (
    <div className="space-y-4">
      {/* Header with stats and create button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {translations.tables}: <span className="font-semibold">{data.totalTables}</span>
        </div>
        <Button onClick={onCreateTable} size="sm" variant="outline">
          <Icon name="plus" className="w-4 h-4 me-2" />
          {translations.createTable}
        </Button>
      </div>

      {/* Table cards */}
      {data.tables.map((table) => (
        <Card key={table.name} className="overflow-hidden">
          {/* EXPERT FIX: Added keyboard accessibility (role, tabIndex, onKeyDown) */}
          <CardHeader
            role="button"
            tabIndex={0}
            className="cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => toggleTable(table.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleTable(table.name)
              }
            }}
            aria-expanded={expandedTables.has(table.name)}
            aria-label={`Toggle ${table.name} table details`}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Icon name="list" className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono truncate max-w-[200px]" title={table.name}>{table.name}</span>
                {table.rowCount !== undefined && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({table.rowCount} {translations.rows})
                  </span>
                )}
              </CardTitle>
              <Icon
                name={expandedTables.has(table.name) ? "chevron-up" : "chevron-down"}
                className="w-4 h-4 text-muted-foreground"
              />
            </div>
          </CardHeader>

          {/* Column details (expanded) */}
          {expandedTables.has(table.name) && (
            <CardContent className="pt-0 overflow-x-auto">
              <div className="space-y-2">
                {table.columns.map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono text-foreground truncate max-w-[150px]" title={col.name}>{col.name}</span>
                      {col.isPrimaryKey && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                          {translations.primaryKey}
                        </span>
                      )}
                      {/* EXPERT FIX: Show NOT NULL badge for non-nullable columns */}
                      {!col.nullable && !col.isPrimaryKey && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                          NOT NULL
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
                      <span className="font-mono text-xs truncate max-w-[120px]" title={col.type}>{col.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}
