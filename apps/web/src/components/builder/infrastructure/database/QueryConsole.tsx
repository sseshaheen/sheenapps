'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import Icon from '@/components/ui/icon'
import type { ApiResponse, QueryResult } from '@/types/inhouse-api'

interface QueryConsoleProps {
  projectId: string
  translations: {
    title: string
    description: string
    queryPlaceholder: string
    run: string
    running: string
    clear: string
    results: string
    noResults: string
    executionTime: string
    rowCount: string
    error: string
    selectOnlyWarning: string
  }
}

/**
 * Query Console Component
 *
 * SQL query editor for running SELECT statements.
 * Features:
 * - Textarea for SQL input
 * - Query execution with loading state
 * - Results table display
 * - Execution time and row count
 * - Error handling
 * - SELECT-only enforcement
 */
export function QueryConsole({ projectId, translations }: QueryConsoleProps) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  // EXPERT FIX: Mirror server-side validation (support WITH, normalize SQL)
  const isAllowedSelect = (sql: string): boolean => {
    const trimmed = sql.trim()
    if (!trimmed) return false

    const withoutTrailing = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed
    if (withoutTrailing.includes(';')) return false

    // Mirror server normalization
    const normalized = withoutTrailing
      .replace(/\/\*[\s\S]*?\*\//g, ' ')  // Remove /* block comments */
      .replace(/--.*$/gm, ' ')             // Remove -- line comments
      .replace(/'([^']|'')*'/g, "''")      // Replace string literals
      .replace(/\s+/g, ' ')                // Collapse whitespace
      .trim()

    const upper = normalized.toUpperCase()
    const isSelect = upper.startsWith('SELECT ')
    const isWithSelect = upper.startsWith('WITH ') && upper.includes(' SELECT ')
    if (!isSelect && !isWithSelect) return false

    const forbidden = ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'TRUNCATE ', 'CREATE ']
    if (forbidden.some(k => upper.includes(k))) return false

    return true
  }

  const handleRunQuery = async () => {
    // EXPERT FIX: Use enhanced validation that mirrors server
    if (!isAllowedSelect(query)) {
      setError(translations.selectOnlyWarning || 'Only a single SELECT query is allowed')
      return
    }

    setIsExecuting(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/inhouse/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          query: query.trim()
        })
      })

      const data = await response.json() as ApiResponse<QueryResult>

      if (!response.ok || !data.ok) {
        throw new Error(data.ok === false ? data.error.message : 'Query execution failed')
      }

      setResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while executing the query')
    } finally {
      setIsExecuting(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    setResult(null)
    setError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to run query
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (query.trim() && !isExecuting) {
        handleRunQuery()
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Query Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{translations.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {translations.description}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                disabled={isExecuting || (!query && !result && !error)}
              >
                <Icon name="x" className="w-4 h-4 me-1" />
                {translations.clear}
              </Button>
              <Button
                onClick={handleRunQuery}
                size="sm"
                disabled={!query.trim() || isExecuting}
              >
                {isExecuting ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 me-1 animate-spin" />
                    {translations.running}
                  </>
                ) : (
                  <>
                    <Icon name="play" className="w-4 h-4 me-1" />
                    {translations.run}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={translations.queryPlaceholder}
            className="font-mono text-sm min-h-[120px] resize-y"
            disabled={isExecuting}
          />
          <p className="text-xs text-muted-foreground mt-2">
            💡 {translations.selectOnlyWarning}
          </p>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <AlertDescription>
            <strong>{translations.error}:</strong> {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State - Milestone C: Enhanced Skeleton Loader */}
      {isExecuting && (
        <Card aria-busy="true" aria-label="Executing query">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon name="loader-2" className="w-4 h-4 animate-spin text-muted-foreground" />
              <Skeleton className="h-5 w-24" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Simulate table rows loading */}
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 flex-1" style={{ width: `${100 - i * 10}%` }} />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {!isExecuting && result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{translations.results}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  {translations.rowCount}: <strong className="text-foreground">{result.rowCount}</strong>
                </span>
                <span>
                  {translations.executionTime}: <strong className="text-foreground">{result.executionTimeMs}ms</strong>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {result.rows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Icon name="folder-open" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{translations.noResults}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          className="px-4 py-2 text-start font-medium text-foreground border-b border-border"
                        >
                          <span className="font-mono text-xs">{col}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className="hover:bg-muted/30 border-b border-border last:border-0"
                      >
                        {result.columns.map((col) => (
                          <td
                            key={col}
                            className="px-4 py-2 text-muted-foreground font-mono text-xs"
                          >
                            {row[col] === null ? (
                              <span className="text-muted-foreground/50 italic">NULL</span>
                            ) : typeof row[col] === 'object' ? (
                              <code className="text-xs bg-muted px-1 rounded">
                                {JSON.stringify(row[col])}
                              </code>
                            ) : typeof row[col] === 'boolean' ? (
                              <span className={row[col] ? 'text-green-600' : 'text-red-600'}>
                                {String(row[col])}
                              </span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
