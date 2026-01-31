/**
 * In-House Database Inspector Service
 *
 * Provides secure read-only database access for admin support:
 * - Schema introspection (metadata-only by default)
 * - Sample data with opt-in and PII redaction
 * - Read-only query tool with AST validation
 * - Prebuilt diagnostic templates
 *
 * Security:
 * - Uses inhouse_admin_readonly role (DB-enforced read-only)
 * - SET LOCAL search_path inside BEGIN READ ONLY transactions
 * - AST parser for single-statement enforcement
 * - Qualified identifier rejection (no cross-schema access)
 * - Statement timeout protection
 */

import { createHash } from 'crypto'
import { Pool, PoolClient } from 'pg'
import { parse, Statement, astVisitor } from 'pgsql-ast-parser'
import { getReadonlyDatabase } from '../database'
import { auditAdminAction } from '../../routes/admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

export interface TableInfo {
  name: string
  estimatedRowCount: number
  sizeBytes: number
  sizePretty: string
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default: string | null
  isPrimaryKey: boolean
  isUnique: boolean
}

export interface IndexInfo {
  name: string
  columns: string[]
  isUnique: boolean
  isPrimary: boolean
}

export interface SchemaInfo {
  schemaName: string
  tables: TableInfo[]
}

export interface TableDetails {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  estimatedRowCount: number
  sizeBytes: number
  sizePretty: string
}

export interface SampleDataResult {
  rows: Record<string, unknown>[]
  truncated: boolean
  redactedColumns: string[]
  totalRows: number
}

export interface QueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
  durationMs: number
  truncated: boolean
  plan?: Record<string, unknown>
}

export interface QueryTemplate {
  id: string
  label: string
  description: string
  sql: string
  category: 'diagnostics' | 'performance' | 'errors'
}

interface ValidationResult {
  valid: boolean
  error?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_RESULT_ROWS = 1000
const MAX_SAMPLE_ROWS = 100
const STATEMENT_TIMEOUT = '5s'
const LOCK_TIMEOUT = '1s'

// PII column patterns for redaction
const SENSITIVE_COLUMN_PATTERNS = [
  /email/i,
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api_key/i,
  /phone/i,
  /ssn/i,
  /social_security/i,
  /credit_card/i,
  /card_number/i,
  /cvv/i,
  /cvc/i,
  /address/i,
  /ip_address/i,
  /device_id/i,
]

// Prebuilt query templates
const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'row-counts',
    label: 'Row counts by table',
    description: 'Shows estimated row counts for all tables in the project schema',
    category: 'diagnostics',
    sql: `SELECT schemaname, relname as table_name, n_live_tup as row_count
          FROM pg_stat_user_tables
          WHERE schemaname = current_schema()
          ORDER BY n_live_tup DESC`,
  },
  {
    id: 'largest-tables',
    label: 'Largest tables by size',
    description: 'Shows the 20 largest tables by total size',
    category: 'performance',
    sql: `SELECT tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
            pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
          FROM pg_tables
          WHERE schemaname = current_schema()
          ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
          LIMIT 20`,
  },
  {
    id: 'index-usage',
    label: 'Index usage statistics',
    description: 'Shows how often indexes are being used',
    category: 'performance',
    sql: `SELECT indexrelname as index_name,
            relname as table_name,
            idx_scan as scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes
          WHERE schemaname = current_schema()
          ORDER BY idx_scan DESC`,
  },
  {
    id: 'unused-indexes',
    label: 'Unused indexes',
    description: 'Indexes that have never been scanned (candidates for removal)',
    category: 'performance',
    sql: `SELECT indexrelname as index_name,
            relname as table_name,
            pg_size_pretty(pg_relation_size(indexrelid)) as size
          FROM pg_stat_user_indexes
          WHERE schemaname = current_schema()
            AND idx_scan = 0
          ORDER BY pg_relation_size(indexrelid) DESC`,
  },
  {
    id: 'table-bloat',
    label: 'Table bloat estimate',
    description: 'Estimates dead tuples that could be reclaimed with VACUUM',
    category: 'performance',
    sql: `SELECT relname as table_name,
            n_live_tup as live_rows,
            n_dead_tup as dead_rows,
            CASE WHEN n_live_tup > 0
              THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2)
              ELSE 0
            END as bloat_percent,
            last_vacuum,
            last_autovacuum
          FROM pg_stat_user_tables
          WHERE schemaname = current_schema()
          ORDER BY n_dead_tup DESC
          LIMIT 20`,
  },
]

// =============================================================================
// AST VALIDATION
// =============================================================================

/**
 * Basic complexity guard to prevent Cartesian monsters and huge queries.
 * Simple heuristic but effective at catching abuse.
 */
function basicComplexityGuard(sql: string): ValidationResult {
  // Limit total query size
  if (sql.length > 100_000) {
    return { valid: false, error: 'Query too large (max 100KB)' }
  }

  // Limit JOINs to prevent Cartesian explosions
  const joinCount = (sql.match(/\bjoin\b/gi) || []).length
  if (joinCount > 12) {
    return { valid: false, error: 'Too many JOINs (max 12)' }
  }

  // Limit subqueries
  const subqueryCount = (sql.match(/\(\s*select\b/gi) || []).length
  if (subqueryCount > 10) {
    return { valid: false, error: 'Too many subqueries (max 10)' }
  }

  return { valid: true }
}

/**
 * Validate SQL is a single SELECT or EXPLAIN statement
 * Uses real AST parser to prevent semicolon injection
 */
function validateSingleStatement(sql: string): ValidationResult {
  try {
    const ast = parse(sql)

    // Must be exactly one statement
    if (ast.length !== 1) {
      return { valid: false, error: `Expected 1 statement, got ${ast.length}` }
    }

    const stmt = ast[0]!

    // Handle EXPLAIN wrapping (pgsql-ast-parser types may not include 'explain')
    const stmtType = stmt.type as string
    if (stmtType === 'explain') {
      const innerType = (stmt as unknown as { statement?: { type?: string } }).statement?.type
      const allowedInner = new Set(['select', 'union', 'values', 'with'])
      if (!innerType || !allowedInner.has(innerType)) {
        return { valid: false, error: `EXPLAIN of '${innerType}' not allowed` }
      }
      return { valid: true }
    }

    // Whitelist allowed statement types
    const allowedTypes = new Set(['select', 'union', 'values', 'with'])
    if (!allowedTypes.has(stmtType)) {
      return { valid: false, error: `Statement type '${stmtType}' not allowed. Only SELECT is permitted.` }
    }

    return { valid: true }
  } catch (e) {
    return { valid: false, error: `SQL parse error: ${(e as Error).message}` }
  }
}

/**
 * Reject any qualified identifiers (schema.table) to prevent cross-schema access
 * Disallows ALL schema qualification including pg_catalog.*
 */
function rejectQualifiedIdentifiers(sql: string): ValidationResult {
  try {
    const ast = parse(sql)
    let foundQualified = false
    let qualifiedRef = ''

    const visitor = astVisitor(() => ({
      tableRef: (t: any) => {
        if (t.schema) {
          foundQualified = true
          qualifiedRef = `${t.schema}.${t.name}`
        }
      },
      ref: (r: any) => {
        if (r.table?.schema) {
          foundQualified = true
          qualifiedRef = `${r.table.schema}.${r.table.name}`
        }
      },
    }))

    for (const stmt of ast) {
      visitor.statement(stmt)
    }

    if (foundQualified) {
      return { valid: false, error: `Qualified identifiers not allowed: ${qualifiedRef}. Use unqualified table names.` }
    }

    return { valid: true }
  } catch (e) {
    return { valid: false, error: `AST walk error: ${(e as Error).message}` }
  }
}

/**
 * Reject dollar-quoting which complicates statement detection
 */
function rejectDollarQuoting(sql: string): ValidationResult {
  if (/\$[a-z_]*\$/i.test(sql)) {
    return { valid: false, error: 'Dollar-quoted strings are not allowed in support queries' }
  }
  return { valid: true }
}

/**
 * Full SQL validation pipeline
 */
function validateQuery(sql: string): ValidationResult {
  // Basic complexity guard (size, JOINs, subqueries)
  const complexityCheck = basicComplexityGuard(sql)
  if (!complexityCheck.valid) return complexityCheck

  // Check dollar quoting first (before parsing)
  const dollarCheck = rejectDollarQuoting(sql)
  if (!dollarCheck.valid) return dollarCheck

  // Single statement check
  const singleCheck = validateSingleStatement(sql)
  if (!singleCheck.valid) return singleCheck

  // Cross-schema check
  const qualifiedCheck = rejectQualifiedIdentifiers(sql)
  if (!qualifiedCheck.valid) return qualifiedCheck

  return { valid: true }
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseInspectorService {
  private pool: Pool

  constructor() {
    // Use readonly pool with DB-enforced read-only credentials
    this.pool = getReadonlyDatabase()
  }

  /**
   * Get schema information for a project (metadata only)
   */
  async getSchema(projectId: string): Promise<SchemaInfo> {
    // Get schema name from project
    const schemaResult = await this.pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM inhouse_project_schemas WHERE project_id = $1`,
      [projectId]
    )

    if (schemaResult.rows.length === 0) {
      throw new Error('Project schema not found')
    }

    const schemaName = schemaResult.rows[0]!.schema_name

    // Get tables with estimated row counts and sizes
    const tablesResult = await this.pool.query<TableInfo>(`
      SELECT
        t.tablename as name,
        COALESCE(s.n_live_tup, 0)::integer as "estimatedRowCount",
        pg_total_relation_size(quote_ident($1) || '.' || quote_ident(t.tablename))::bigint as "sizeBytes",
        pg_size_pretty(pg_total_relation_size(quote_ident($1) || '.' || quote_ident(t.tablename))) as "sizePretty"
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = t.schemaname AND s.relname = t.tablename
      WHERE t.schemaname = $1
      ORDER BY "sizeBytes" DESC
    `, [schemaName])

    return {
      schemaName,
      tables: tablesResult.rows,
    }
  }

  /**
   * Get detailed information about a specific table
   */
  async getTableDetails(projectId: string, tableName: string): Promise<TableDetails> {
    // Validate table name
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
      throw new Error('Invalid table name')
    }

    const schemaResult = await this.pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM inhouse_project_schemas WHERE project_id = $1`,
      [projectId]
    )

    if (schemaResult.rows.length === 0) {
      throw new Error('Project schema not found')
    }

    const schemaName = schemaResult.rows[0]!.schema_name

    // Get columns
    const columnsResult = await this.pool.query<ColumnInfo>(`
      SELECT
        c.column_name as name,
        c.data_type as type,
        c.is_nullable = 'YES' as nullable,
        c.column_default as default,
        COALESCE(pk.is_pk, false) as "isPrimaryKey",
        COALESCE(uq.is_unique, false) as "isUnique"
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name, true as is_pk
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) pk ON pk.column_name = c.column_name
      LEFT JOIN (
        SELECT kcu.column_name, true as is_unique
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) uq ON uq.column_name = c.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `, [schemaName, tableName])

    // Get indexes
    const indexesResult = await this.pool.query<IndexInfo>(`
      SELECT
        i.relname as name,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
        ix.indisunique as "isUnique",
        ix.indisprimary as "isPrimary"
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = $1 AND t.relname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary
      ORDER BY i.relname
    `, [schemaName, tableName])

    // Get size info
    const sizeResult = await this.pool.query<{ estimatedRowCount: number; sizeBytes: number; sizePretty: string }>(`
      SELECT
        COALESCE(s.n_live_tup, 0)::integer as "estimatedRowCount",
        pg_total_relation_size(quote_ident($1) || '.' || quote_ident($2))::bigint as "sizeBytes",
        pg_size_pretty(pg_total_relation_size(quote_ident($1) || '.' || quote_ident($2))) as "sizePretty"
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = t.schemaname AND s.relname = t.tablename
      WHERE t.schemaname = $1 AND t.tablename = $2
    `, [schemaName, tableName])

    return {
      name: tableName,
      columns: columnsResult.rows,
      indexes: indexesResult.rows,
      estimatedRowCount: sizeResult.rows[0]?.estimatedRowCount || 0,
      sizeBytes: sizeResult.rows[0]?.sizeBytes || 0,
      sizePretty: sizeResult.rows[0]?.sizePretty || '0 bytes',
    }
  }

  /**
   * Get sample data from a table (opt-in, with PII redaction)
   */
  async getSampleData(
    projectId: string,
    tableName: string,
    limit: number = 10
  ): Promise<SampleDataResult> {
    // Validate inputs
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
      throw new Error('Invalid table name')
    }
    const safeLimit = Math.min(Math.max(1, limit), MAX_SAMPLE_ROWS)

    const schemaResult = await this.pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM inhouse_project_schemas WHERE project_id = $1`,
      [projectId]
    )

    if (schemaResult.rows.length === 0) {
      throw new Error('Project schema not found')
    }

    const schemaName = schemaResult.rows[0]!.schema_name

    // Get column names first to identify sensitive ones
    const columnsResult = await this.pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schemaName, tableName])

    const columns = columnsResult.rows.map(r => r.column_name)
    const redactedColumns: string[] = []

    // Identify columns to redact
    for (const col of columns) {
      if (SENSITIVE_COLUMN_PATTERNS.some(pattern => pattern.test(col))) {
        redactedColumns.push(col)
      }
    }

    // Build SELECT with redaction
    const selectColumns = columns.map(col => {
      if (redactedColumns.includes(col)) {
        return `'[REDACTED]' as "${col}"`
      }
      return `"${col}"`
    }).join(', ')

    // Execute in read-only transaction
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN READ ONLY')
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`)
      await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)

      const result = await client.query(`
        SELECT ${selectColumns}
        FROM "${tableName}"
        LIMIT ${safeLimit + 1}
      `)

      await client.query('ROLLBACK')

      const truncated = result.rows.length > safeLimit
      const rows = truncated ? result.rows.slice(0, safeLimit) : result.rows

      return {
        rows,
        truncated,
        redactedColumns,
        totalRows: rows.length,
      }
    } finally {
      client.release()
    }
  }

  /**
   * Execute a read-only query with full validation
   */
  async executeQuery(
    projectId: string,
    sql: string,
    adminId: string,
    options: {
      explain?: boolean
      ipAddress?: string
    } = {}
  ): Promise<QueryResult> {
    // Validate the query
    const validation = validateQuery(sql)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // Get schema name
    const schemaResult = await this.pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM inhouse_project_schemas WHERE project_id = $1`,
      [projectId]
    )

    if (schemaResult.rows.length === 0) {
      throw new Error('Project schema not found')
    }

    const schemaName = schemaResult.rows[0]!.schema_name
    const startTime = Date.now()
    let resultRows: Record<string, unknown>[] = []
    let columns: string[] = []
    let rowCount = 0
    let truncated = false
    let plan: Record<string, unknown> | undefined
    let errorCode: string | undefined
    let errorMessage: string | undefined

    const client = await this.pool.connect()
    try {
      // Execute in read-only transaction with SET LOCAL
      await client.query('BEGIN READ ONLY')
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`)
      await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
      await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`)
      await client.query(`SET LOCAL work_mem = '4MB'`)

      // Wrap query with LIMIT if needed
      const limitedSql = `SELECT * FROM (${sql}) AS __subq LIMIT ${MAX_RESULT_ROWS + 1}`

      if (options.explain) {
        // Run EXPLAIN ANALYZE
        const explainResult = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`)
        plan = explainResult.rows[0]['QUERY PLAN']
      }

      const result = await client.query(limitedSql)

      await client.query('ROLLBACK')

      // Process results
      if (result.fields) {
        columns = result.fields.map(f => f.name)
      }

      truncated = result.rows.length > MAX_RESULT_ROWS
      resultRows = truncated ? result.rows.slice(0, MAX_RESULT_ROWS) : result.rows
      rowCount = resultRows.length

    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      errorCode = (e as any).code || 'QUERY_ERROR'
      errorMessage = (e as Error).message
      throw e
    } finally {
      client.release()

      // Audit log (fire-and-forget)
      const durationMs = Date.now() - startTime
      const queryHash = createHash('sha256').update(sql.trim().toLowerCase()).digest('hex')

      this.pool.query(`
        INSERT INTO inhouse_admin_queries (
          admin_id, project_id, schema_name, query_text, query_hash,
          result_rows, duration_ms, error_code, error_message, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        adminId, projectId, schemaName, sql, queryHash,
        rowCount, durationMs, errorCode || null, errorMessage || null,
        options.ipAddress || null
      ]).catch(err => console.error('[InspectorService] Audit log error:', err))

      // Also log to admin audit
      auditAdminAction({
        adminId,
        action: 'database_query',
        projectId,
        resourceType: 'query',
        metadata: { queryHash, durationMs, rowCount, error: errorCode },
        ipAddress: options.ipAddress || null,
      })
    }

    return {
      rows: resultRows,
      columns,
      rowCount,
      durationMs: Date.now() - startTime,
      truncated,
      plan,
    }
  }

  /**
   * Execute a prebuilt template query
   */
  async executeTemplate(
    projectId: string,
    templateId: string,
    adminId: string,
    options: { ipAddress?: string } = {}
  ): Promise<QueryResult> {
    const template = QUERY_TEMPLATES.find(t => t.id === templateId)
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`)
    }

    return this.executeQuery(projectId, template.sql, adminId, options)
  }

  /**
   * Get available query templates
   */
  getTemplates(): QueryTemplate[] {
    return QUERY_TEMPLATES
  }
}

// Singleton instance
let instance: InhouseInspectorService | null = null

export function getInhouseInspectorService(): InhouseInspectorService {
  if (!instance) {
    instance = new InhouseInspectorService()
  }
  return instance
}
