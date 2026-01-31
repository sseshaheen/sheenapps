/**
 * In-House Database Inspector Admin
 *
 * Provides secure read-only database access for admin support:
 * - Schema introspection (metadata-only by default)
 * - Sample data with opt-in and PII redaction
 * - Read-only query tool with prebuilt templates
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  RefreshCw,
  Play,
  Database,
  TableProperties,
  Eye,
  AlertTriangle,
  Clock,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface TableInfo {
  name: string
  estimatedRowCount: number
  sizeBytes: number
  sizePretty: string
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default: string | null
  isPrimaryKey: boolean
  isUnique: boolean
}

interface IndexInfo {
  name: string
  columns: string[]
  isUnique: boolean
  isPrimary: boolean
}

interface TableDetails {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  estimatedRowCount: number
  sizeBytes: number
  sizePretty: string
}

interface QueryTemplate {
  id: string
  label: string
  description: string
  category: string
}

interface QueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
  durationMs: number
  truncated: boolean
}

interface SampleDataResult {
  rows: Record<string, unknown>[]
  truncated: boolean
  redactedColumns: string[]
  totalRows: number
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseDatabaseAdmin() {
  // State
  const [projectId, setProjectId] = useState('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [schemaName, setSchemaName] = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableDetails, setTableDetails] = useState<TableDetails | null>(null)
  const [templates, setTemplates] = useState<QueryTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)

  // Query state
  const [sql, setSql] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [showExplain, setShowExplain] = useState(false)

  // Sample data state
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false)
  const [sampleData, setSampleData] = useState<SampleDataResult | null>(null)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [sampleTable, setSampleTable] = useState<string | null>(null)

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/admin/inhouse/database/templates')
        if (response.ok) {
          const result = await response.json()
          setTemplates(result.templates || [])
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error)
      }
    }
    fetchTemplates()
  }, [])

  // Fetch schema when projectId changes
  const fetchSchema = useCallback(async () => {
    if (!projectId) {
      setTables([])
      setSchemaName('')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/database/projects/${projectId}/schema`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch schema')
      }
      const result = await response.json()
      setTables(result.tables || [])
      setSchemaName(result.schemaName || '')
      setSelectedTable(null)
      setTableDetails(null)
    } catch (error) {
      console.error('Failed to fetch schema:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to fetch schema')
      setTables([])
      setSchemaName('')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Fetch table details when selected
  const fetchTableDetails = useCallback(async (tableName: string) => {
    if (!projectId) return

    setTableLoading(true)
    setSelectedTable(tableName)
    try {
      const response = await fetch(
        `/api/admin/inhouse/database/projects/${projectId}/tables/${encodeURIComponent(tableName)}`
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch table details')
      }
      const result = await response.json()
      setTableDetails(result)
    } catch (error) {
      console.error('Failed to fetch table details:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to fetch table details')
      setTableDetails(null)
    } finally {
      setTableLoading(false)
    }
  }, [projectId])

  // Fetch sample data (opt-in)
  const fetchSampleData = useCallback(async (tableName: string) => {
    if (!projectId) return

    setSampleLoading(true)
    setSampleTable(tableName)
    setSampleDialogOpen(true)
    try {
      const response = await fetch(
        `/api/admin/inhouse/database/projects/${projectId}/tables/${encodeURIComponent(tableName)}/sample?enableSampling=true&limit=10`
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch sample data')
      }
      const result = await response.json()
      setSampleData(result)
    } catch (error) {
      console.error('Failed to fetch sample data:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to fetch sample data')
      setSampleData(null)
    } finally {
      setSampleLoading(false)
    }
  }, [projectId])

  // Execute query
  const executeQuery = useCallback(async () => {
    if (!projectId || !sql.trim()) return

    setQueryLoading(true)
    setQueryError(null)
    setQueryResult(null)
    try {
      const response = await fetch(`/api/admin/inhouse/database/projects/${projectId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, explain: showExplain }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Query failed')
      }
      setQueryResult(result)
    } catch (error) {
      console.error('Query failed:', error)
      setQueryError(error instanceof Error ? error.message : 'Query failed')
    } finally {
      setQueryLoading(false)
    }
  }, [projectId, sql, showExplain])

  // Execute template
  const executeTemplate = useCallback(async (templateId: string) => {
    if (!projectId) return

    setQueryLoading(true)
    setQueryError(null)
    setQueryResult(null)
    try {
      const response = await fetch(`/api/admin/inhouse/database/projects/${projectId}/query/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Template query failed')
      }
      setQueryResult(result)
    } catch (error) {
      console.error('Template query failed:', error)
      setQueryError(error instanceof Error ? error.message : 'Template query failed')
    } finally {
      setQueryLoading(false)
    }
  }, [projectId])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Project Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Inspector
            </CardTitle>
            <CardDescription>
              Read-only schema and query access for debugging. Sample data requires explicit opt-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3 items-end">
            <div className="flex-1 max-w-md">
              <label className="text-sm font-medium mb-1.5 block">Project ID</label>
              <Input
                placeholder="Enter project ID (UUID)"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            </div>
            <Button onClick={fetchSchema} disabled={!projectId || loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Load Schema
            </Button>
          </CardContent>
        </Card>

        {/* Schema View */}
        {schemaName && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tables List */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TableProperties className="h-4 w-4" />
                  Tables
                </CardTitle>
                <CardDescription>Schema: {schemaName}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-y-auto">
                  {tables.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-4">No tables found</div>
                  ) : (
                    <div className="divide-y">
                      {tables.map((table) => (
                        <button
                          key={table.name}
                          onClick={() => fetchTableDetails(table.name)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between ${
                            selectedTable === table.name ? 'bg-muted' : ''
                          }`}
                        >
                          <div>
                            <div className="font-medium text-sm">{table.name}</div>
                            <div className="text-xs text-muted-foreground">
                              ~{table.estimatedRowCount.toLocaleString()} rows · {table.sizePretty}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Table Details */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{selectedTable ? `Table: ${selectedTable}` : 'Select a table'}</span>
                  {selectedTable && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchSampleData(selectedTable)}
                          disabled={sampleLoading}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Sample Data
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View sample rows (PII redacted)</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tableLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : tableDetails ? (
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="flex gap-4 text-sm">
                      <Badge variant="secondary">
                        ~{tableDetails.estimatedRowCount.toLocaleString()} rows
                      </Badge>
                      <Badge variant="secondary">{tableDetails.sizePretty}</Badge>
                    </div>

                    {/* Columns */}
                    <div>
                      <h4 className="font-medium text-sm mb-2">Columns</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Nullable</TableHead>
                            <TableHead>Default</TableHead>
                            <TableHead>Constraints</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableDetails.columns.map((col) => (
                            <TableRow key={col.name}>
                              <TableCell className="font-mono text-xs">{col.name}</TableCell>
                              <TableCell className="font-mono text-xs">{col.type}</TableCell>
                              <TableCell>{col.nullable ? 'Yes' : 'No'}</TableCell>
                              <TableCell className="font-mono text-xs max-w-[150px] truncate">
                                {col.default || '-'}
                              </TableCell>
                              <TableCell>
                                {col.isPrimaryKey && <Badge variant="default" className="mr-1">PK</Badge>}
                                {col.isUnique && !col.isPrimaryKey && <Badge variant="secondary">Unique</Badge>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Indexes */}
                    {tableDetails.indexes.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Indexes</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Columns</TableHead>
                              <TableHead>Type</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableDetails.indexes.map((idx) => (
                              <TableRow key={idx.name}>
                                <TableCell className="font-mono text-xs">{idx.name}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {idx.columns.join(', ')}
                                </TableCell>
                                <TableCell>
                                  {idx.isPrimary ? (
                                    <Badge variant="default">Primary</Badge>
                                  ) : idx.isUnique ? (
                                    <Badge variant="secondary">Unique</Badge>
                                  ) : (
                                    <Badge variant="outline">Index</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Select a table from the list to view its structure
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Query Tool */}
        {schemaName && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Query Tool
              </CardTitle>
              <CardDescription>
                Read-only queries only. Single SELECT statements, 5s timeout, max 1000 rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Templates */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground mr-2">Quick queries:</span>
                {templates.map((template) => (
                  <Tooltip key={template.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => executeTemplate(template.id)}
                        disabled={queryLoading}
                      >
                        {template.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{template.description}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Custom Query */}
              <div>
                <Textarea
                  placeholder="SELECT * FROM users LIMIT 10"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  className="font-mono text-sm min-h-[100px]"
                />
              </div>

              <div className="flex items-center gap-4">
                <Button onClick={executeQuery} disabled={!sql.trim() || queryLoading}>
                  <Play className={`h-4 w-4 mr-2 ${queryLoading ? 'animate-pulse' : ''}`} />
                  Run Query
                </Button>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="explain"
                    checked={showExplain}
                    onCheckedChange={(checked) => setShowExplain(checked === true)}
                  />
                  <label htmlFor="explain" className="text-sm">
                    Include EXPLAIN plan
                  </label>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  5s timeout
                </div>
              </div>

              {/* Query Error */}
              {queryError && (
                <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{queryError}</span>
                </div>
              )}

              {/* Query Results */}
              {queryResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{queryResult.rowCount} rows</span>
                    <span>{queryResult.durationMs}ms</span>
                    {queryResult.truncated && (
                      <Badge variant="secondary">Truncated to 1000 rows</Badge>
                    )}
                  </div>
                  <div className="border rounded-md overflow-x-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {queryResult.columns.map((col) => (
                            <TableHead key={col} className="font-mono text-xs whitespace-nowrap">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queryResult.rows.map((row, i) => (
                          <TableRow key={i}>
                            {queryResult.columns.map((col) => (
                              <TableCell key={col} className="font-mono text-xs max-w-[200px] truncate">
                                {row[col] === null ? (
                                  <span className="text-muted-foreground">NULL</span>
                                ) : typeof row[col] === 'object' ? (
                                  JSON.stringify(row[col])
                                ) : (
                                  String(row[col])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sample Data Dialog */}
        <Dialog open={sampleDialogOpen} onOpenChange={setSampleDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Sample Data: {sampleTable}</DialogTitle>
              <DialogDescription>
                Showing up to 10 rows. Sensitive columns are redacted.
              </DialogDescription>
            </DialogHeader>
            {sampleLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
            ) : sampleData ? (
              <div className="space-y-4">
                {sampleData.redactedColumns.length > 0 && (
                  <div className="bg-muted/50 px-4 py-2 rounded-md">
                    <span className="text-sm text-muted-foreground">
                      Redacted columns:{' '}
                      {sampleData.redactedColumns.map((col) => (
                        <Badge key={col} variant="secondary" className="mr-1">
                          {col}
                        </Badge>
                      ))}
                    </span>
                  </div>
                )}
                {sampleData.truncated && (
                  <Badge variant="secondary">Results truncated</Badge>
                )}
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {sampleData.rows.length > 0 &&
                          Object.keys(sampleData.rows[0]).map((col) => (
                            <TableHead key={col} className="font-mono text-xs whitespace-nowrap">
                              {col}
                            </TableHead>
                          ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampleData.rows.map((row, i) => (
                        <TableRow key={i}>
                          {Object.entries(row).map(([col, val]) => (
                            <TableCell key={col} className="font-mono text-xs max-w-[200px] truncate">
                              {val === null ? (
                                <span className="text-muted-foreground">NULL</span>
                              ) : val === '[REDACTED]' ? (
                                <span className="text-destructive">[REDACTED]</span>
                              ) : typeof val === 'object' ? (
                                JSON.stringify(val)
                              ) : (
                                String(val)
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No sample data available
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
