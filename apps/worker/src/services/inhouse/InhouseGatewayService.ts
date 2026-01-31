/**
 * In-House API Gateway Service
 *
 * The security boundary between user apps and the shared database.
 * All Easy Mode database access goes through this gateway.
 *
 * Key responsibilities:
 * 1. Validate API keys and extract project context
 * 2. Enforce table/column allowlists (including column-level permissions)
 * 3. Generate parameterized SQL from query contracts
 * 4. Schema-per-project tenant isolation (queries target project's schema)
 * 5. Rate limiting and quota enforcement
 * 6. Request logging for analytics
 *
 * SECURITY MODEL:
 * - Tenant isolation via PostgreSQL schemas (each project has its own schema)
 * - All column references validated (select, filter, sort, returning, data, set)
 * - Filterless UPDATE/DELETE prevented
 * - Column-level read/write permissions enforced
 */

import { createHash } from 'crypto'
import { getDatabase, getClient } from '../database'
import type {
  QueryContract,
  QueryResponse,
  QueryError,
  QueryFilter,
  QuerySort,
  GatewayContext,
  TableMetadata,
  ColumnMetadata,
  ApiKeyValidation,
  RateLimitResult,
  QuotaCheckResult,
  GATEWAY_ERROR_CODES,
  GatewayErrorCode,
} from '../../types/inhouseGateway'

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_LIMIT = 1000
const DEFAULT_LIMIT = 100
const MAX_OFFSET = 100_000 // Prevent expensive offset scans
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const MAX_QUERY_TIMEOUT_MS = 10_000 // 10 seconds
const DEFAULT_PUBLIC_KEY_MAX_ROWS = 50 // Default row limit for UPDATE/DELETE with public keys

// =============================================================================
// ERROR HELPERS
// =============================================================================

function createError(
  code: GatewayErrorCode,
  message: string,
  details?: string,
  hint?: string
): QueryError {
  return {
    code,
    message,
    ...(details ? { details } : {}),
    ...(hint ? { hint } : {}),
  }
}

// =============================================================================
// API KEY VALIDATION
// =============================================================================

/**
 * Hash an API key for comparison
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Validate an API key and extract project context
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidation> {
  const db = getDatabase()

  // API key format: sheen_{type}_{random}
  // e.g., sheen_pk_abc123def456 (public key)
  // e.g., sheen_sk_abc123def456 (server key)

  if (!apiKey.startsWith('sheen_')) {
    return { valid: false, error: 'Invalid API key format' }
  }

  const keyHash = hashApiKey(apiKey)
  const keyPrefix = apiKey.substring(0, 12) // "sheen_pk_xxx"

  try {
    const result = await db.query(`
      SELECT
        k.id,
        k.project_id,
        k.key_type,
        k.scopes,
        k.status,
        k.expires_at,
        p.inhouse_schema_name
      FROM inhouse_api_keys k
      JOIN projects p ON p.id = k.project_id
      WHERE k.key_hash = $1
        AND k.status = 'active'
        AND (k.expires_at IS NULL OR k.expires_at > NOW())
      LIMIT 1
    `, [keyHash])

    if (result.rows.length === 0) {
      // Check if key exists but is revoked/expired
      const checkResult = await db.query(`
        SELECT status, expires_at FROM inhouse_api_keys
        WHERE key_hash = $1
        LIMIT 1
      `, [keyHash])

      if (checkResult.rows.length > 0) {
        const { status, expires_at } = checkResult.rows[0]
        if (status === 'revoked') {
          return { valid: false, error: 'API key has been revoked' }
        }
        if (expires_at && new Date(expires_at) < new Date()) {
          return { valid: false, error: 'API key has expired' }
        }
      }

      return { valid: false, error: 'Invalid API key' }
    }

    const row = result.rows[0]

    // Update last used timestamp (fire and forget)
    db.query(`
      UPDATE inhouse_api_keys
      SET last_used_at = NOW(), usage_count = usage_count + 1
      WHERE id = $1
    `, [row.id]).catch(() => {})

    return {
      valid: true,
      projectId: row.project_id,
      schemaName: row.inhouse_schema_name,
      keyId: row.id,
      keyType: row.key_type,
      scopes: row.scopes || ['read', 'write'],
    }
  } catch (error) {
    console.error('[InhouseGateway] API key validation error:', error)
    return { valid: false, error: 'Failed to validate API key' }
  }
}

// =============================================================================
// SCHEMA METADATA
// =============================================================================

/**
 * Cache for table metadata (per project).
 *
 * HORIZONTAL SCALING NOTE: This is per-instance cache. When horizontally scaled,
 * each instance has its own cache. For shared caching, consider Redis.
 * See: HORIZONTAL_SCALING_NOTES.md
 */
const tableMetadataCache = new Map<string, { metadata: Map<string, TableMetadata>, expiresAt: number }>()
const METADATA_CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Cleanup expired metadata cache entries to prevent unbounded memory growth.
 */
function cleanupStaleMetadataCacheEntries(): void {
  const now = Date.now()
  for (const [key, entry] of tableMetadataCache) {
    if (entry.expiresAt < now) {
      tableMetadataCache.delete(key)
    }
  }
}

// Periodic cleanup every 5 minutes (matches rate limit cleanup interval)
setInterval(cleanupStaleMetadataCacheEntries, 5 * 60 * 1000)

/**
 * Get table metadata for a project (with caching)
 */
export async function getTableMetadata(
  projectId: string,
  schemaName: string
): Promise<Map<string, TableMetadata>> {
  const cacheKey = `${projectId}:${schemaName}`
  const cached = tableMetadataCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.metadata
  }

  const db = getDatabase()

  try {
    // Fetch tables
    const tablesResult = await db.query(`
      SELECT
        t.id,
        t.table_name,
        t.is_system_table,
        t.allow_client_read,
        t.allow_client_write
      FROM inhouse_tables t
      JOIN inhouse_project_schemas s ON s.id = t.schema_id
      WHERE s.project_id = $1 AND s.schema_name = $2
    `, [projectId, schemaName])

    // Fetch columns for all tables
    const tableIds = tablesResult.rows.map((t: any) => t.id)
    let columnsResult: any = { rows: [] }

    if (tableIds.length > 0) {
      columnsResult = await db.query(`
        SELECT
          c.table_id,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.is_primary_key,
          c.is_sensitive,
          c.allow_client_read,
          c.allow_client_write
        FROM inhouse_columns c
        WHERE c.table_id = ANY($1)
      `, [tableIds])
    }

    // Build metadata map
    const metadata = new Map<string, TableMetadata>()
    const columnsByTable = new Map<string, ColumnMetadata[]>()

    // Group columns by table
    for (const col of columnsResult.rows) {
      const tableColumns = columnsByTable.get(col.table_id) || []
      tableColumns.push({
        name: col.column_name,
        dataType: col.data_type,
        isNullable: col.is_nullable,
        isPrimaryKey: col.is_primary_key,
        isSensitive: col.is_sensitive,
        allowClientRead: col.allow_client_read,
        allowClientWrite: col.allow_client_write,
      })
      columnsByTable.set(col.table_id, tableColumns)
    }

    // Build table metadata
    for (const table of tablesResult.rows) {
      metadata.set(table.table_name, {
        name: table.table_name,
        columns: columnsByTable.get(table.id) || [],
        isSystemTable: table.is_system_table,
        allowClientRead: table.allow_client_read,
        allowClientWrite: table.allow_client_write,
      })
    }

    // Cache the result
    tableMetadataCache.set(cacheKey, {
      metadata,
      expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
    })

    return metadata
  } catch (error) {
    console.error('[InhouseGateway] Failed to fetch table metadata:', error)
    return new Map()
  }
}

// =============================================================================
// QUERY VALIDATION
// =============================================================================

/**
 * Helper to check column-level read permissions
 * Exported for use by schema endpoint to filter sensitive columns
 */
export function canReadColumn(col: ColumnMetadata, apiKeyType: string): boolean {
  // Server keys can read everything except explicitly hidden columns
  if (apiKeyType === 'server') {
    return col.allowClientRead !== false
  }
  // Public keys: must have allowClientRead=true and not be sensitive
  return col.allowClientRead !== false && !col.isSensitive
}

/**
 * Helper to check column-level write permissions
 */
function canWriteColumn(col: ColumnMetadata, apiKeyType: string): boolean {
  // Server keys can write to any column
  if (apiKeyType === 'server') {
    return true
  }
  // Public keys: must have allowClientWrite=true
  return col.allowClientWrite !== false
}

/**
 * Get the list of column names that a given API key type can read
 * This is used to expand SELECT * and RETURNING * safely
 */
function getReadableColumnNames(tableMeta: TableMetadata, apiKeyType: string): string[] {
  return tableMeta.columns
    .filter(col => canReadColumn(col, apiKeyType))
    .map(col => col.name)
}

/**
 * Resolve SELECT/RETURNING columns, expanding * to only readable columns
 *
 * SECURITY CRITICAL: This prevents SELECT * from leaking sensitive columns
 * to public keys. Must be called before generateSQL().
 */
function resolveSelectColumns(
  columns: string[] | undefined,
  tableMeta: TableMetadata,
  apiKeyType: string
): string[] {
  const readableColumns = getReadableColumnNames(tableMeta, apiKeyType)

  // If no columns specified or contains *, expand to readable columns
  if (!columns || columns.length === 0 || columns.includes('*')) {
    return readableColumns
  }

  // Otherwise return as-is (validation will check permissions)
  return columns
}

/**
 * Resolve RETURNING columns for mutations, expanding * to only readable columns
 *
 * SECURITY CRITICAL: Prevents RETURNING * from leaking sensitive columns
 */
function resolveReturningColumns(
  returning: string[] | undefined,
  tableMeta: TableMetadata,
  apiKeyType: string
): string[] {
  const readableColumns = getReadableColumnNames(tableMeta, apiKeyType)

  // If no returning specified or contains *, expand to readable columns
  // For public keys, default to returning readable columns (not *)
  if (!returning || returning.length === 0 || returning.includes('*')) {
    return readableColumns
  }

  // Otherwise return as-is (validation will check permissions)
  return returning
}

/**
 * Validate a query contract against the project schema
 *
 * SECURITY: This validates ALL column references including:
 * - SELECT columns
 * - Filter columns
 * - Sort columns
 * - Returning columns
 * - INSERT data keys
 * - UPDATE set keys
 */
export async function validateQuery(
  query: QueryContract,
  ctx: GatewayContext
): Promise<QueryError | null> {
  const metadata = await getTableMetadata(ctx.projectId, ctx.schemaName)

  // Check table exists
  const tableMeta = metadata.get(query.table)
  if (!tableMeta) {
    return createError(
      'TABLE_NOT_FOUND',
      `Table '${query.table}' does not exist`,
      'The table you are trying to access has not been created or does not exist in this project',
      'Check your table name or create the table first'
    )
  }

  // Build column lookup maps for efficient validation
  const columnMap = new Map(tableMeta.columns.map(c => [c.name, c]))
  const columnNames = new Set(tableMeta.columns.map(c => c.name))

  // Check table access based on operation
  const isRead = query.operation === 'select'
  const isWrite = ['insert', 'update', 'delete'].includes(query.operation)

  if (isRead && !tableMeta.allowClientRead) {
    return createError(
      'TABLE_NOT_READABLE',
      `Table '${query.table}' is not readable from client`,
      'This table has been configured to disallow client-side reads',
      'Use a server key or contact support if you need read access'
    )
  }

  if (isWrite && !tableMeta.allowClientWrite) {
    return createError(
      'TABLE_NOT_WRITABLE',
      `Table '${query.table}' is not writable from client`,
      'This table has been configured to disallow client-side writes',
      'Use a server key or contact support if you need write access'
    )
  }

  // Check write scope
  if (isWrite && !ctx.scopes.includes('write')) {
    return createError(
      'INSUFFICIENT_SCOPES',
      'API key does not have write permission',
      'This API key only has read access',
      'Use a key with write scope for insert/update/delete operations'
    )
  }

  // Validate SELECT columns
  if (query.columns && query.columns.length > 0) {
    for (const col of query.columns) {
      if (col === '*') continue

      if (!columnNames.has(col)) {
        return createError(
          'COLUMN_NOT_FOUND',
          `Column '${col}' does not exist in table '${query.table}'`,
          undefined,
          'Check your column names'
        )
      }

      // Check column-level read permissions
      const colMeta = columnMap.get(col)!
      if (!canReadColumn(colMeta, ctx.apiKeyType)) {
        return createError(
          'SENSITIVE_COLUMN_ACCESS',
          `Column '${col}' cannot be read with this API key`,
          colMeta.isSensitive
            ? 'This column is marked as sensitive'
            : 'This column has restricted read access',
          'Use a server key to access this column'
        )
      }
    }
  }

  // Validate filters
  // SECURITY: Also check read permissions to prevent inference attacks
  // (filtering by sensitive columns can reveal their values through result presence)
  if (query.filters && query.filters.length > 0) {
    for (const filter of query.filters) {
      if (!columnNames.has(filter.column)) {
        return createError(
          'COLUMN_NOT_FOUND',
          `Column '${filter.column}' does not exist in table '${query.table}'`,
          undefined,
          'Check your filter column names'
        )
      }

      // Check read permissions for filter columns (prevents inference attacks)
      const colMeta = columnMap.get(filter.column)!
      if (!canReadColumn(colMeta, ctx.apiKeyType)) {
        return createError(
          'SENSITIVE_COLUMN_ACCESS',
          `Column '${filter.column}' cannot be used in filters with this API key`,
          'Filtering by sensitive columns could reveal their values',
          'Use a server key to filter by this column'
        )
      }
    }
  }

  // Validate sorts
  // SECURITY: Also check read permissions to prevent inference attacks
  if (query.sorts && query.sorts.length > 0) {
    for (const sort of query.sorts) {
      if (!columnNames.has(sort.column)) {
        return createError(
          'COLUMN_NOT_FOUND',
          `Column '${sort.column}' does not exist in table '${query.table}'`,
          'Cannot sort by a column that does not exist',
          'Check your sort column names'
        )
      }

      // Check read permissions for sort columns (prevents inference attacks)
      const colMeta = columnMap.get(sort.column)!
      if (!canReadColumn(colMeta, ctx.apiKeyType)) {
        return createError(
          'SENSITIVE_COLUMN_ACCESS',
          `Column '${sort.column}' cannot be used for sorting with this API key`,
          'Sorting by sensitive columns could reveal their values',
          'Use a server key to sort by this column'
        )
      }
    }
  }

  // Validate returning columns (for INSERT/UPDATE/DELETE)
  if (query.returning && query.returning.length > 0) {
    for (const col of query.returning) {
      if (col === '*') continue

      if (!columnNames.has(col)) {
        return createError(
          'COLUMN_NOT_FOUND',
          `Column '${col}' does not exist in table '${query.table}'`,
          'Cannot return a column that does not exist',
          'Check your returning column names'
        )
      }

      // Check column-level read permissions for returning
      const colMeta = columnMap.get(col)!
      if (!canReadColumn(colMeta, ctx.apiKeyType)) {
        return createError(
          'SENSITIVE_COLUMN_ACCESS',
          `Column '${col}' cannot be returned with this API key`,
          'This column has restricted read access',
          'Use a server key or omit this column from returning'
        )
      }
    }
  }

  // Validate INSERT data keys
  if (query.operation === 'insert' && query.data) {
    const rows = Array.isArray(query.data) ? query.data : [query.data]
    for (const row of rows) {
      for (const col of Object.keys(row)) {
        if (!columnNames.has(col)) {
          return createError(
            'COLUMN_NOT_FOUND',
            `Column '${col}' does not exist in table '${query.table}'`,
            'Cannot insert data into a column that does not exist',
            'Check your data field names'
          )
        }

        // Check column-level write permissions
        const colMeta = columnMap.get(col)!
        if (!canWriteColumn(colMeta, ctx.apiKeyType)) {
          return createError(
            'COLUMN_NOT_WRITABLE',
            `Column '${col}' cannot be written with this API key`,
            'This column has restricted write access',
            'Use a server key to write to this column'
          )
        }
      }
    }
  }

  // Validate UPDATE set keys
  if (query.operation === 'update' && query.set) {
    for (const col of Object.keys(query.set)) {
      if (!columnNames.has(col)) {
        return createError(
          'COLUMN_NOT_FOUND',
          `Column '${col}' does not exist in table '${query.table}'`,
          'Cannot update a column that does not exist',
          'Check your set field names'
        )
      }

      // Check column-level write permissions
      const colMeta = columnMap.get(col)!
      if (!canWriteColumn(colMeta, ctx.apiKeyType)) {
        return createError(
          'COLUMN_NOT_WRITABLE',
          `Column '${col}' cannot be updated with this API key`,
          'This column has restricted write access',
          'Use a server key to update this column'
        )
      }
    }
  }

  // SECURITY: Prevent filterless UPDATE/DELETE (would affect all rows)
  // This prevents accidental "update all" or "delete all" operations
  if ((query.operation === 'update' || query.operation === 'delete')) {
    const hasFilters = query.filters && query.filters.length > 0

    if (!hasFilters) {
      return createError(
        'FILTERLESS_MUTATION',
        `${query.operation.toUpperCase()} requires at least one filter`,
        `${query.operation} without filters would affect all rows in the table`,
        'Add a filter like .eq("id", value) to target specific rows'
      )
    }
  }

  // Validate limit
  if (query.limit !== undefined && (query.limit < 0 || query.limit > MAX_LIMIT)) {
    return createError(
      'INVALID_VALUE',
      `Limit must be between 0 and ${MAX_LIMIT}`,
      `Received limit: ${query.limit}`,
      `Use a limit of ${MAX_LIMIT} or less`
    )
  }

  // Validate offset
  if (query.offset !== undefined && (query.offset < 0 || query.offset > MAX_OFFSET)) {
    return createError(
      'INVALID_VALUE',
      `Offset must be between 0 and ${MAX_OFFSET}`,
      `Received offset: ${query.offset}`,
      `Use keyset pagination for large result sets instead of high offsets`
    )
  }

  return null
}

// =============================================================================
// SQL GENERATION
// =============================================================================

/**
 * Generate parameterized SQL from a query contract
 *
 * CRITICAL SECURITY: All values are passed as parameters, never interpolated.
 * Table and column names are validated against the allowlist before use.
 */
export function generateSQL(
  query: QueryContract,
  schemaName: string
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  let paramIndex = 1

  const addParam = (value: unknown): string => {
    params.push(value)
    return `$${paramIndex++}`
  }

  // Quote identifier (table/column name)
  const qi = (name: string): string => `"${name.replace(/"/g, '""')}"`

  // Full table name with schema
  const fullTableName = `${qi(schemaName)}.${qi(query.table)}`

  // Generate WHERE clause from filters
  const generateWhere = (filters: QueryFilter[] | undefined): string => {
    if (!filters || filters.length === 0) return ''

    const conditions = filters.map(f => {
      const col = qi(f.column)
      switch (f.op) {
        case 'eq':
          return `${col} = ${addParam(f.value)}`
        case 'neq':
          return `${col} != ${addParam(f.value)}`
        case 'gt':
          return `${col} > ${addParam(f.value)}`
        case 'gte':
          return `${col} >= ${addParam(f.value)}`
        case 'lt':
          return `${col} < ${addParam(f.value)}`
        case 'lte':
          return `${col} <= ${addParam(f.value)}`
        case 'like':
          return `${col} LIKE ${addParam(f.value)}`
        case 'ilike':
          return `${col} ILIKE ${addParam(f.value)}`
        case 'in':
          if (!Array.isArray(f.value)) {
            throw new Error('IN operator requires an array value')
          }
          return `${col} = ANY(${addParam(f.value)})`
        case 'is':
          // IS operator only supports NULL, TRUE, FALSE in PostgreSQL
          // Any other value would generate invalid SQL
          if (f.value === null) {
            return `${col} IS NULL`
          } else if (f.value === true) {
            return `${col} IS TRUE`
          } else if (f.value === false) {
            return `${col} IS FALSE`
          }
          // SECURITY: Reject invalid values instead of generating broken SQL
          throw new Error(`Invalid value for 'is' operator: only null, true, or false are allowed`)
        case 'contains':
          return `${col} @> ${addParam(f.value)}`
        case 'containedBy':
          return `${col} <@ ${addParam(f.value)}`
        case 'overlaps':
          return `${col} && ${addParam(f.value)}`
        default:
          throw new Error(`Unknown filter operator: ${f.op}`)
      }
    })

    return ` WHERE ${conditions.join(' AND ')}`
  }

  // Generate ORDER BY clause
  const generateOrderBy = (sorts: QuerySort[] | undefined): string => {
    if (!sorts || sorts.length === 0) return ''

    const orderParts = sorts.map(s => {
      const dir = s.direction === 'desc' ? 'DESC' : 'ASC'
      const nulls = s.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST'
      return `${qi(s.column)} ${dir} ${nulls}`
    })

    return ` ORDER BY ${orderParts.join(', ')}`
  }

  // Generate LIMIT/OFFSET
  const generateLimitOffset = (): string => {
    const parts: string[] = []
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
    parts.push(` LIMIT ${limit}`)
    if (query.offset) {
      parts.push(` OFFSET ${addParam(query.offset)}`)
    }
    return parts.join('')
  }

  // Build SQL based on operation
  switch (query.operation) {
    case 'select': {
      const columns = query.columns && query.columns.length > 0
        ? query.columns.map(c => c === '*' ? '*' : qi(c)).join(', ')
        : '*'

      const sql = `SELECT ${columns} FROM ${fullTableName}` +
        generateWhere(query.filters) +
        generateOrderBy(query.sorts) +
        generateLimitOffset()

      return { sql, params }
    }

    case 'insert': {
      if (!query.data) {
        throw new Error('INSERT requires data')
      }

      const rows = Array.isArray(query.data) ? query.data : [query.data]
      if (rows.length === 0) {
        throw new Error('INSERT requires at least one row')
      }

      const firstRow = rows[0]!
      const columns = Object.keys(firstRow).sort()
      const columnSet = new Set(columns)

      // Validate all rows have identical keys (prevents undefined values becoming NULL)
      for (let i = 1; i < rows.length; i++) {
        const rowKeys = Object.keys(rows[i]!).sort()
        if (rowKeys.length !== columns.length || !rowKeys.every(k => columnSet.has(k))) {
          throw new Error(`INSERT row ${i + 1} has different columns than row 1`)
        }
      }

      const columnList = columns.map(qi).join(', ')

      const valueLists = rows.map(row => {
        const values = columns.map(col => addParam(row[col]))
        return `(${values.join(', ')})`
      })

      const returning = query.returning && query.returning.length > 0
        ? ` RETURNING ${query.returning.map(c => c === '*' ? '*' : qi(c)).join(', ')}`
        : ' RETURNING *'

      const sql = `INSERT INTO ${fullTableName} (${columnList}) VALUES ${valueLists.join(', ')}${returning}`

      return { sql, params }
    }

    case 'update': {
      if (!query.set || Object.keys(query.set).length === 0) {
        throw new Error('UPDATE requires set values')
      }

      const setParts = Object.entries(query.set).map(([col, value]) =>
        `${qi(col)} = ${addParam(value)}`
      )

      const returning = query.returning && query.returning.length > 0
        ? ` RETURNING ${query.returning.map(c => c === '*' ? '*' : qi(c)).join(', ')}`
        : ' RETURNING *'

      const sql = `UPDATE ${fullTableName} SET ${setParts.join(', ')}` +
        generateWhere(query.filters) +
        returning

      return { sql, params }
    }

    case 'delete': {
      const returning = query.returning && query.returning.length > 0
        ? ` RETURNING ${query.returning.map(c => c === '*' ? '*' : qi(c)).join(', ')}`
        : ' RETURNING *'

      const sql = `DELETE FROM ${fullTableName}` +
        generateWhere(query.filters) +
        returning

      return { sql, params }
    }

    default:
      throw new Error(`Unknown operation: ${query.operation}`)
  }
}

/**
 * Result from bounded mutation execution
 */
export interface BoundedMutationResult<T = unknown> {
  success: boolean
  rows: T[]
  rowCount: number
  matchedRows?: number // Number of rows that matched (before limit check)
}

/**
 * Generate bounded CTE SQL for UPDATE/DELETE with maxRows limit
 *
 * Uses ctid-based CTE pattern to:
 * 1. Select up to maxRows+1 matching rows (to detect if limit exceeded)
 * 2. Count how many matched
 * 3. Only execute the mutation if count <= maxRows
 *
 * If more than maxRows would be affected, the mutation returns 0 rows.
 * The count is returned separately to generate the error message.
 *
 * SECURITY: Uses ctid (physical row ID) which is safe and efficient for this pattern.
 * The LIMIT prevents full table scans even for large tables.
 */
export function generateBoundedSQL(
  query: QueryContract,
  schemaName: string,
  maxRows: number
): { sql: string; params: unknown[]; countParamIndex: number } {
  const params: unknown[] = []
  let paramIndex = 1

  const addParam = (value: unknown): string => {
    params.push(value)
    return `$${paramIndex++}`
  }

  // Quote identifier (table/column name)
  const qi = (name: string): string => `"${name.replace(/"/g, '""')}"`

  // Full table name with schema
  const fullTableName = `${qi(schemaName)}.${qi(query.table)}`

  // Generate WHERE clause from filters (same as in generateSQL)
  const generateWhere = (filters: QueryFilter[] | undefined): string => {
    if (!filters || filters.length === 0) return ''

    const conditions = filters.map(f => {
      const col = qi(f.column)
      switch (f.op) {
        case 'eq':
          return `${col} = ${addParam(f.value)}`
        case 'neq':
          return `${col} != ${addParam(f.value)}`
        case 'gt':
          return `${col} > ${addParam(f.value)}`
        case 'gte':
          return `${col} >= ${addParam(f.value)}`
        case 'lt':
          return `${col} < ${addParam(f.value)}`
        case 'lte':
          return `${col} <= ${addParam(f.value)}`
        case 'like':
          return `${col} LIKE ${addParam(f.value)}`
        case 'ilike':
          return `${col} ILIKE ${addParam(f.value)}`
        case 'in':
          if (!Array.isArray(f.value)) {
            throw new Error('IN operator requires an array value')
          }
          return `${col} = ANY(${addParam(f.value)})`
        case 'is':
          if (f.value === null) {
            return `${col} IS NULL`
          } else if (f.value === true) {
            return `${col} IS TRUE`
          } else if (f.value === false) {
            return `${col} IS FALSE`
          }
          throw new Error(`Invalid value for 'is' operator: only null, true, or false are allowed`)
        case 'contains':
          return `${col} @> ${addParam(f.value)}`
        case 'containedBy':
          return `${col} <@ ${addParam(f.value)}`
        case 'overlaps':
          return `${col} && ${addParam(f.value)}`
        default:
          throw new Error(`Unknown filter operator: ${f.op}`)
      }
    })

    return ` WHERE ${conditions.join(' AND ')}`
  }

  const whereClause = generateWhere(query.filters)

  // Add maxRows + 1 as parameter for the LIMIT (to detect if exceeded)
  const limitParam = addParam(maxRows + 1)
  const countParamIndex = paramIndex - 1

  // Add maxRows as parameter for the count check
  const maxRowsParam = addParam(maxRows)

  // Generate RETURNING clause
  const returning = query.returning && query.returning.length > 0
    ? query.returning.map(c => c === '*' ? '*' : qi(c)).join(', ')
    : '*'

  if (query.operation === 'update') {
    if (!query.set || Object.keys(query.set).length === 0) {
      throw new Error('UPDATE requires set values')
    }

    const setParts = Object.entries(query.set).map(([col, value]) =>
      `${qi(col)} = ${addParam(value)}`
    )

    // Bounded UPDATE CTE pattern:
    // 1. targets: Select ctid of rows matching filter, limit to maxRows+1
    // 2. check_count: Count how many targets we found
    // 3. UPDATE: Only update if count <= maxRows (returns 0 rows if exceeded)
    const sql = `
WITH targets AS (
  SELECT ctid FROM ${fullTableName}${whereClause}
  LIMIT ${limitParam}
),
check_count AS (
  SELECT COUNT(*) as cnt FROM targets
)
UPDATE ${fullTableName}
SET ${setParts.join(', ')}
WHERE ctid IN (SELECT ctid FROM targets)
  AND (SELECT cnt FROM check_count) <= ${maxRowsParam}
RETURNING ${returning}, (SELECT cnt FROM check_count) as __matched_count__
`.trim()

    return { sql, params, countParamIndex }
  }

  if (query.operation === 'delete') {
    // Bounded DELETE CTE pattern (same structure as UPDATE)
    const sql = `
WITH targets AS (
  SELECT ctid FROM ${fullTableName}${whereClause}
  LIMIT ${limitParam}
),
check_count AS (
  SELECT COUNT(*) as cnt FROM targets
)
DELETE FROM ${fullTableName}
WHERE ctid IN (SELECT ctid FROM targets)
  AND (SELECT cnt FROM check_count) <= ${maxRowsParam}
RETURNING ${returning}, (SELECT cnt FROM check_count) as __matched_count__
`.trim()

    return { sql, params, countParamIndex }
  }

  throw new Error(`generateBoundedSQL only supports update and delete operations`)
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Simple in-memory rate limiter with TTL cleanup.
 *
 * HORIZONTAL SCALING NOTE: This is per-instance state. When horizontally scaled,
 * each instance has its own rate limit counters. For true global rate limiting,
 * migrate to Redis (Upstash) or Cloudflare Durable Objects.
 * See: HORIZONTAL_SCALING_NOTES.md
 */
const rateLimitWindows = new Map<string, { count: number; windowStart: number }>()

/**
 * Cleanup stale rate limit entries to prevent unbounded memory growth.
 * Entries older than 2x the window period are removed.
 */
function cleanupStaleRateLimitEntries(): void {
  const now = Date.now()
  const staleThreshold = RATE_LIMIT_WINDOW_MS * 2

  for (const [key, window] of rateLimitWindows) {
    if (now - window.windowStart > staleThreshold) {
      rateLimitWindows.delete(key)
    }
  }
}

// Periodic cleanup every 5 minutes (defense-in-depth)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
setInterval(cleanupStaleRateLimitEntries, CLEANUP_INTERVAL_MS)

/**
 * Check rate limit for a project
 */
export async function checkRateLimit(
  projectId: string,
  limitPerMinute: number = 100
): Promise<RateLimitResult> {
  const now = Date.now()
  const key = `ratelimit:${projectId}`

  let window = rateLimitWindows.get(key)

  // Reset window if expired (also serves as lazy cleanup for this entry)
  if (!window || (now - window.windowStart) >= RATE_LIMIT_WINDOW_MS) {
    window = { count: 0, windowStart: now }
    rateLimitWindows.set(key, window)
  }

  window.count++

  const remaining = Math.max(0, limitPerMinute - window.count)
  const resetAt = window.windowStart + RATE_LIMIT_WINDOW_MS

  if (window.count > limitPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil((resetAt - now) / 1000),
    }
  }

  return {
    allowed: true,
    remaining,
    resetAt,
  }
}

// =============================================================================
// QUOTA CHECKING
// =============================================================================

/**
 * Check if a project is within its quotas
 *
 * SECURITY: Fails closed on DB error (denies request rather than allowing unlimited)
 * Also handles daily counter reset atomically.
 */
export async function checkQuotas(projectId: string): Promise<QuotaCheckResult> {
  const db = getDatabase()

  try {
    // Step 1: Atomically reset daily counters if reset time has passed
    // This eliminates the need for a separate cron job
    await db.query(`
      UPDATE inhouse_quotas
      SET requests_used_today = 0,
          bandwidth_used_bytes = 0,
          requests_reset_at = NOW() + INTERVAL '1 day'
      WHERE project_id = $1
        AND (requests_reset_at IS NULL OR requests_reset_at < NOW())
    `, [projectId])

    // Step 2: Fetch current quotas (after potential reset)
    const result = await db.query(`
      SELECT
        tier,
        db_size_limit_bytes, db_size_used_bytes,
        storage_size_limit_bytes, storage_size_used_bytes,
        requests_limit_daily, requests_used_today,
        bandwidth_limit_bytes, bandwidth_used_bytes
      FROM inhouse_quotas
      WHERE project_id = $1
    `, [projectId])

    if (result.rows.length === 0) {
      // No quota record = assume defaults (free tier)
      return { withinLimits: true, violations: [] }
    }

    const quota = result.rows[0]
    const violations: QuotaCheckResult['violations'] = []

    // Check each quota
    if (quota.db_size_used_bytes >= quota.db_size_limit_bytes) {
      violations.push({
        type: 'database',
        used: quota.db_size_used_bytes,
        limit: quota.db_size_limit_bytes,
        percentUsed: (quota.db_size_used_bytes / quota.db_size_limit_bytes) * 100,
      })
    }

    if (quota.requests_used_today >= quota.requests_limit_daily) {
      violations.push({
        type: 'requests',
        used: quota.requests_used_today,
        limit: quota.requests_limit_daily,
        percentUsed: (quota.requests_used_today / quota.requests_limit_daily) * 100,
      })
    }

    if (quota.bandwidth_used_bytes >= quota.bandwidth_limit_bytes) {
      violations.push({
        type: 'bandwidth',
        used: quota.bandwidth_used_bytes,
        limit: quota.bandwidth_limit_bytes,
        percentUsed: (quota.bandwidth_used_bytes / quota.bandwidth_limit_bytes) * 100,
      })
    }

    return {
      withinLimits: violations.length === 0,
      violations,
    }
  } catch (error) {
    console.error('[InhouseGateway] Failed to check quotas:', error)

    // FAIL CLOSED: On DB error, deny the request rather than allowing unlimited access
    // This prevents abuse if the database is temporarily unavailable
    return {
      withinLimits: false,
      violations: [{
        type: 'requests',
        used: 0,
        limit: 0,
        percentUsed: 100,
      }],
    }
  }
}

// =============================================================================
// MAIN QUERY EXECUTION
// =============================================================================

/**
 * Execute a query through the gateway
 *
 * This is the main entry point for all user app database access.
 *
 * SECURITY: This function resolves SELECT/RETURNING columns to prevent
 * sensitive column leakage via * expansion.
 */
export async function executeQuery<T = unknown>(
  query: QueryContract,
  ctx: GatewayContext
): Promise<QueryResponse<T>> {
  const startTime = Date.now()

  try {
    // 0. Get table metadata for column resolution
    const metadata = await getTableMetadata(ctx.projectId, ctx.schemaName)
    const tableMeta = metadata.get(query.table)

    if (!tableMeta) {
      return {
        data: null,
        error: createError(
          'TABLE_NOT_FOUND',
          `Table '${query.table}' does not exist`
        ),
        status: 400,
      }
    }

    // 1. SECURITY CRITICAL: Resolve columns to prevent * from leaking sensitive data
    // This must happen BEFORE generateSQL to ensure * is expanded to safe columns
    const resolvedColumns = query.operation === 'select'
      ? resolveSelectColumns(query.columns, tableMeta, ctx.apiKeyType)
      : query.columns
    const resolvedReturning = ['insert', 'update', 'delete'].includes(query.operation)
      ? resolveReturningColumns(query.returning, tableMeta, ctx.apiKeyType)
      : query.returning

    // SECURITY: Fail closed if no readable columns (prevents SELECT * fallback data leak)
    if (query.operation === 'select' && resolvedColumns && resolvedColumns.length === 0) {
      return {
        data: null,
        error: createError(
          'INSUFFICIENT_SCOPES',
          'No readable columns available for this table',
          'All columns in this table are restricted',
          'Use a server key to access this table'
        ),
        status: 403,
      }
    }

    // SECURITY: Fail closed if no returnable columns (prevents RETURNING * fallback)
    if (['insert', 'update', 'delete'].includes(query.operation) && resolvedReturning && resolvedReturning.length === 0) {
      return {
        data: null,
        error: createError(
          'INSUFFICIENT_SCOPES',
          'No returnable columns available for this table',
          'All columns in this table are restricted',
          'Use a server key or omit RETURNING clause'
        ),
        status: 403,
      }
    }

    // 2. SECURITY: Apply default maxRows for public keys on UPDATE/DELETE
    // This prevents accidental mass deletions from frontend code
    let effectiveMaxRows = query.maxRows
    if ((query.operation === 'update' || query.operation === 'delete') && ctx.apiKeyType === 'public') {
      // Public keys get a default limit unless explicitly specified
      if (effectiveMaxRows === undefined) {
        effectiveMaxRows = DEFAULT_PUBLIC_KEY_MAX_ROWS
      }
    }

    const resolvedQuery: QueryContract = {
      ...query,
      // Conditionally include to satisfy exactOptionalPropertyTypes
      ...(resolvedColumns ? { columns: resolvedColumns } : {}),
      ...(resolvedReturning ? { returning: resolvedReturning } : {}),
      ...(effectiveMaxRows !== undefined ? { maxRows: effectiveMaxRows } : {}),
    }

    // 3. Validate the resolved query
    const validationError = await validateQuery(resolvedQuery, ctx)
    if (validationError) {
      return { data: null, error: validationError, status: 400 }
    }

    // 4. Determine if we need bounded execution for UPDATE/DELETE with maxRows
    const useBoundedExecution = (
      (resolvedQuery.operation === 'update' || resolvedQuery.operation === 'delete') &&
      resolvedQuery.maxRows !== undefined
    )

    // 5. Generate SQL (bounded or regular)
    let sql: string
    let params: unknown[]

    if (useBoundedExecution) {
      const bounded = generateBoundedSQL(resolvedQuery, ctx.schemaName, resolvedQuery.maxRows!)
      sql = bounded.sql
      params = bounded.params
    } else {
      const regular = generateSQL(resolvedQuery, ctx.schemaName)
      sql = regular.sql
      params = regular.params
    }

    // 6. Execute with statement_timeout in a transaction
    // CRITICAL: Must use dedicated client - pool.query() uses different connections per call
    // SET LOCAL only works within a single connection's transaction
    const client = await getClient()
    const timeoutMs = MAX_QUERY_TIMEOUT_MS
    let result: any

    try {
      // Use dedicated client for entire transaction
      await client.query('BEGIN')
      await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`)
      result = await client.query(sql, params)
      await client.query('COMMIT')
    } catch (txError) {
      // Rollback on any error (including timeout)
      await client.query('ROLLBACK').catch(() => {})
      throw txError
    } finally {
      // Always release client back to pool
      client.release()
    }

    // 7. Handle bounded execution results
    if (useBoundedExecution) {
      // Extract the matched count from the __matched_count__ column
      // If the mutation returned 0 rows, we need to check if it was due to row limit
      const matchedCount = result.rows.length > 0
        ? parseInt(result.rows[0].__matched_count__, 10)
        : 0

      // If more rows matched than maxRows allows, the mutation didn't execute
      if (matchedCount > resolvedQuery.maxRows!) {
        // Increment quota even for blocked requests (they consumed resources)
        await incrementRequestQuota(ctx.projectId)

        // Log the blocked request
        logRequest(ctx, query, 400, Date.now() - startTime).catch(() => {})

        return {
          data: null,
          error: createError(
            'ROW_LIMIT_EXCEEDED',
            `Operation would affect more than ${resolvedQuery.maxRows} rows`,
            JSON.stringify({ maxRows: resolvedQuery.maxRows, matchedRows: matchedCount }),
            'Reduce the scope of your filter or increase maxRows limit'
          ),
          status: 400,
        }
      }

      // Strip the __matched_count__ column from results
      const cleanedRows = result.rows.map((row: any) => {
        const { __matched_count__, ...rest } = row
        return rest
      })

      // 8. Increment quota count (reliable - awaited)
      await incrementRequestQuota(ctx.projectId)

      // 9. Log the request for analytics (fire and forget - can fail without affecting quotas)
      logRequest(ctx, query, 200, Date.now() - startTime).catch(() => {})

      return {
        data: cleanedRows as T,
        error: null,
        count: result.rowCount ?? undefined,
        status: 200,
      }
    }

    // 8. Increment quota count (reliable - awaited)
    await incrementRequestQuota(ctx.projectId)

    // 9. Log the request for analytics (fire and forget - can fail without affecting quotas)
    logRequest(ctx, query, 200, Date.now() - startTime).catch(() => {})

    return {
      data: result.rows as T,
      error: null,
      count: result.rowCount ?? undefined,
      status: 200,
    }
  } catch (error) {
    console.error('[InhouseGateway] Query execution error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Increment quota even for failed requests (they still consumed resources)
    await incrementRequestQuota(ctx.projectId)

    // Log the failed request for analytics (fire and forget)
    logRequest(ctx, query, 500, Date.now() - startTime).catch(() => {})

    // PostgreSQL statement_timeout throws: "canceling statement due to statement timeout"
    if (errorMessage.includes('statement timeout') || errorMessage.includes('canceling statement')) {
      return {
        data: null,
        error: createError('QUERY_TIMEOUT', 'Query took too long to execute'),
        status: 504,
      }
    }

    return {
      data: null,
      error: createError('QUERY_FAILED', 'Failed to execute query', errorMessage),
      status: 500,
    }
  }
}

// =============================================================================
// QUOTA TRACKING
// =============================================================================

/**
 * Increment request quota count (reliable, not fire-and-forget)
 *
 * IMPORTANT: This is separate from logging and must succeed for quota enforcement.
 * If this fails, we log but don't block the request (fail-open for availability).
 */
async function incrementRequestQuota(projectId: string): Promise<void> {
  const db = getDatabase()
  try {
    await db.query(`
      UPDATE inhouse_quotas
      SET requests_used_today = requests_used_today + 1
      WHERE project_id = $1
    `, [projectId])
  } catch (error) {
    // Log but don't throw - quota tracking failure shouldn't break requests
    // However, this should be monitored as it could indicate a larger problem
    console.error('[InhouseGateway] Failed to increment quota:', error)
  }
}

// =============================================================================
// REQUEST LOGGING
// =============================================================================

/**
 * Log a gateway request for analytics (fire-and-forget)
 *
 * NOTE: Quota increment is handled separately by incrementRequestQuota()
 * This function is purely for analytics and can fail without affecting quotas.
 */
async function logRequest(
  ctx: GatewayContext,
  query: QueryContract,
  statusCode: number,
  durationMs: number
): Promise<void> {
  const db = getDatabase()

  try {
    await db.query(`
      INSERT INTO inhouse_request_log (
        project_id, api_key_id, method, path, status_code, duration_ms, client_ip, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      ctx.projectId,
      ctx.apiKeyId,
      query.operation.toUpperCase(),
      `/db/${query.table}`,
      statusCode,
      durationMs,
      ctx.clientIp,
      ctx.userAgent,
    ])
  } catch (error) {
    // Logging failures should not break the request
    console.error('[InhouseGateway] Failed to log request:', error)
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const InhouseGatewayService = {
  validateApiKey,
  getTableMetadata,
  validateQuery,
  generateSQL,
  generateBoundedSQL,
  checkRateLimit,
  checkQuotas,
  executeQuery,
  canReadColumn,
}
