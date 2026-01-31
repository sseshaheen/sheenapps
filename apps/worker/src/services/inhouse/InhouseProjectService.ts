/**
 * In-House Project Service
 *
 * Manages Easy Mode project lifecycle:
 * - Creating projects with in-house infrastructure
 * - Generating API keys
 * - Managing project schemas
 * - Tracking quotas
 */

import { createHash, randomBytes, randomUUID } from 'crypto'
import { getDatabase } from '../database'
import { InhouseCmsService } from './InhouseCmsService'

// =============================================================================
// TYPES
// =============================================================================

/** Starter content from template */
export interface StarterContent {
  contentTypes: Array<{
    name: string
    slug: string
    fields: Array<{
      name: string
      type: 'text' | 'number' | 'email' | 'url' | 'date' | 'select' | 'image' | 'boolean' | 'richtext' | 'json'
      required?: boolean
      options?: string[]
    }>
  }>
  entries: Array<{
    contentType: string  // slug reference
    data: Record<string, unknown>
    status?: 'draft' | 'published'
  }>
}

export interface CreateEasyModeProjectInput {
  name: string
  ownerId: string
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte'
  subdomain?: string
  /** ISO 4217 currency code (e.g., USD, SAR, EGP). Defaults to USD. */
  currencyCode?: string
  template?: {
    id: string
    version: number
    tier: string
    category: string
    tags?: string[]
  }
  /** Starter content to pre-populate (from template) */
  starterContent?: StarterContent
}

export interface EasyModeProject {
  id: string
  name: string
  ownerId: string
  framework: string
  subdomain: string
  schemaName: string
  previewUrl: string
  createdAt: string
  apiKey: {
    publicKey: string
    keyPrefix: string
  }
  inbox?: {
    inboxId: string
    address: string
  }
}

export interface CreateTableInput {
  projectId: string
  tableName: string
  columns: Array<{
    name: string
    type: string
    nullable?: boolean
    primaryKey?: boolean
    unique?: boolean
    default?: string
  }>
}

// =============================================================================
// SECURITY VALIDATORS
// =============================================================================

/**
 * Valid PostgreSQL identifier pattern
 * Must start with letter or underscore, contain only alphanumeric and underscores
 * Max 63 characters (PostgreSQL limit)
 */
const IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]{0,62}$/i

/**
 * Validate a PostgreSQL identifier (table name, column name)
 */
function validateIdentifier(name: string, label: string): void {
  if (!name || !IDENTIFIER_REGEX.test(name)) {
    throw new Error(
      `Invalid ${label}: "${name}". Must start with letter or underscore, ` +
      `contain only alphanumeric characters and underscores, max 63 chars.`
    )
  }
  // Reserved words check (common ones that could cause issues)
  const reserved = ['user', 'order', 'group', 'select', 'insert', 'update', 'delete', 'table', 'index', 'key']
  if (reserved.includes(name.toLowerCase())) {
    throw new Error(`Invalid ${label}: "${name}" is a reserved word. Use a different name.`)
  }
}

/**
 * Allowed PostgreSQL data types for user tables
 * Restricting to safe, common types
 */
const ALLOWED_COLUMN_TYPES = new Set([
  // Numeric
  'integer', 'int', 'bigint', 'smallint', 'serial', 'bigserial',
  'decimal', 'numeric', 'real', 'double precision',
  // Text
  'text', 'varchar', 'char', 'character varying',
  // Boolean
  'boolean', 'bool',
  // Date/Time
  'date', 'time', 'timestamp', 'timestamptz', 'timestamp with time zone',
  'interval',
  // UUID
  'uuid',
  // JSON
  'json', 'jsonb',
  // Arrays of allowed types
  'integer[]', 'text[]', 'varchar[]', 'uuid[]', 'jsonb[]',
])

/**
 * Validate a column type
 * Normalizes and checks against allowlist
 */
function validateColumnType(rawType: string): string {
  const normalizedType = rawType.toLowerCase().trim()

  // Handle types with length specifier like varchar(255)
  const baseType = normalizedType.replace(/\(\d+\)/, '').trim()

  if (!ALLOWED_COLUMN_TYPES.has(baseType)) {
    throw new Error(
      `Invalid column type: "${rawType}". Allowed types: ${Array.from(ALLOWED_COLUMN_TYPES).join(', ')}`
    )
  }

  // Return the original (preserving length specifier) but lowercase
  return normalizedType
}

/**
 * Validate and sanitize a column default value
 * Only allow specific safe patterns
 */
function validateColumnDefault(defaultValue: string | undefined): string | null {
  if (!defaultValue) return null

  const normalized = defaultValue.trim()

  // Defense in depth: block SQL injection patterns regardless of other checks
  const dangerousPatterns = [
    /;/,           // Statement terminator
    /--/,          // Single-line comment
    /\/\*/,        // Multi-line comment start
    /\*\//,        // Multi-line comment end
    /\bDROP\b/i,   // DDL
    /\bALTER\b/i,  // DDL
    /\bTRUNCATE\b/i, // DDL
    /\bEXEC\b/i,   // Execute
  ]

  if (dangerousPatterns.some(pattern => pattern.test(normalized))) {
    throw new Error(`Invalid default value: contains forbidden SQL pattern`)
  }

  // Allowed patterns:
  // - NULL
  // - Boolean literals: true, false
  // - Numeric literals: 0, 123, -45, 3.14
  // - String literals: 'text' (single quotes only)
  // - Function calls: NOW(), CURRENT_TIMESTAMP, gen_random_uuid()
  // - Empty array: '{}'

  const safePatterns = [
    /^NULL$/i,
    /^(true|false)$/i,
    /^-?\d+(\.\d+)?$/,
    /^'[^']*'$/,  // Single quoted string (no nesting)
    /^NOW\(\)$/i,
    /^CURRENT_TIMESTAMP$/i,
    /^CURRENT_DATE$/i,
    /^gen_random_uuid\(\)$/i,
    /^'\{\}'$/,
    /^\{\}$/,
  ]

  const isSafe = safePatterns.some(pattern => pattern.test(normalized))

  if (!isSafe) {
    throw new Error(
      `Invalid default value: "${defaultValue}". ` +
      `Allowed: NULL, true/false, numbers, 'text', NOW(), CURRENT_TIMESTAMP, gen_random_uuid()`
    )
  }

  return normalized
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a unique subdomain from project name
 */
function generateSubdomain(name: string, existingSubdomains: Set<string>): string {
  // Normalize: lowercase, replace non-alphanumeric with hyphens
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)

  if (!base) base = 'project'

  let subdomain = base
  let counter = 0

  while (existingSubdomains.has(subdomain)) {
    counter++
    subdomain = `${base}-${counter}`
  }

  return subdomain
}

/**
 * Generate a schema name from project ID
 */
function generateSchemaName(projectId: string): string {
  return `project_${projectId.replace(/-/g, '').substring(0, 32)}`
}

/**
 * Generate a unique, non-guessable inbox ID
 * Format: p_ + 12 lowercase hex characters (48 bits entropy)
 * Example: p_3fa9c02b1d7e (hex only: 0-9, a-f)
 */
function generateInboxId(): string {
  // Generate 6 random bytes = 48 bits entropy = 12 hex chars
  // 48 bits provides ~281 trillion combinations, collision-resistant at scale
  const bytes = randomBytes(6)
  const hex = bytes.toString('hex').toLowerCase()
  return `p_${hex}`
}

/**
 * Generate an API key
 */
function generateApiKey(type: 'public' | 'server'): { key: string; prefix: string; hash: string } {
  const prefix = type === 'public' ? 'sheen_pk_' : 'sheen_sk_'
  const randomPart = randomBytes(24).toString('base64url')
  const key = `${prefix}${randomPart}`
  const hash = createHash('sha256').update(key).digest('hex')
  const displayPrefix = key.substring(0, 12)

  return { key, prefix: displayPrefix, hash }
}

/**
 * Validate ISO 4217 currency code
 * Must be 3 uppercase letters
 */
function validateCurrencyCode(code: string | undefined): string {
  const normalized = (code || 'USD').toUpperCase().trim()

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(
      `Invalid currency code: "${code}". Must be a 3-letter ISO 4217 code (e.g., USD, EUR, SAR).`
    )
  }

  return normalized
}

function mapTemplateCategoryToIndustry(category?: string, tags?: string[]): string {
  const normalized = category?.toLowerCase() || '';
  const tagSet = new Set((tags || []).map(tag => tag.toLowerCase()));

  if (normalized === 'retail' || tagSet.has('ecommerce')) return 'ecommerce';
  if (normalized === 'services') return 'services';
  if (normalized === 'food') return 'restaurant';
  if (normalized === 'creative') return 'portfolio';
  if (normalized === 'education') return 'course';
  if (normalized === 'health') return 'fitness';
  if (normalized === 'publishing') return 'publishing';
  if (normalized === 'technology') return 'saas';
  if (normalized === 'platform') return 'marketplace';
  if (normalized === 'real-estate') return 'real-estate';
  if (normalized === 'events') return 'events';

  return 'generic';
}

function buildRunSettings(template?: CreateEasyModeProjectInput['template']) {
  if (!template) return null;
  const industryTag = mapTemplateCategoryToIndustry(template.category, template.tags);
  const defaultPacks = industryTag === 'generic' ? ['generic'] : [industryTag];
  return {
    industry_tag: industryTag,
    default_packs: defaultPacks,
    template_snapshot: {
      id: template.id,
      category: template.category,
      tags: template.tags || []
    }
  };
}

// =============================================================================
// PROJECT SERVICE
// =============================================================================

export class InhouseProjectService {
  /**
   * Create a new Easy Mode project
   *
   * Uses retry logic for subdomain conflicts to handle race conditions
   * where two parallel creates could generate the same subdomain.
   */
  async createProject(input: CreateEasyModeProjectInput): Promise<EasyModeProject> {
    const db = getDatabase()
    const MAX_SUBDOMAIN_RETRIES = 5

    // 1. Check for existing subdomains
    const existingResult = await db.query(`
      SELECT inhouse_subdomain FROM projects
      WHERE inhouse_subdomain IS NOT NULL
    `)
    const existingSubdomains = new Set(
      existingResult.rows.map((r: any) => r.inhouse_subdomain)
    )

    // 2. Generate initial subdomain and other values
    let subdomain = input.subdomain || generateSubdomain(input.name, existingSubdomains)
    const projectId = randomUUID()
    const schemaName = generateSchemaName(projectId)
    const framework = input.framework || 'nextjs'

    // 3. Create the project with retry for subdomain conflicts
    const runSettings = buildRunSettings(input.template);
    const config = input.template ? {
      template: input.template,
      run_settings: runSettings
    } : {};
    const currencyCode = validateCurrencyCode(input.currencyCode);

    let insertSuccess = false
    for (let attempt = 0; attempt < MAX_SUBDOMAIN_RETRIES; attempt++) {
      try {
        await db.query(`
          INSERT INTO projects (
            id, owner_id, name, framework, infra_mode,
            inhouse_subdomain, inhouse_schema_name, created_by_service, config, currency_code
          ) VALUES ($1, $2, $3, $4, 'easy', $5, $6, 'inhouse-service', $7, $8)
        `, [projectId, input.ownerId, input.name, framework, subdomain, schemaName, config, currencyCode])
        insertSuccess = true
        break
      } catch (error: any) {
        // Check if it's a unique constraint violation on inhouse_subdomain
        if (error.code === '23505' && error.constraint?.includes('subdomain')) {
          // Generate a new subdomain with random suffix
          const suffix = randomBytes(2).toString('hex')
          subdomain = `${subdomain.replace(/-[a-f0-9]{4}$/, '')}-${suffix}`
          existingSubdomains.add(subdomain) // Track to avoid re-using
          console.warn(`[InhouseProject] Subdomain conflict, retrying with: ${subdomain}`)
          continue
        }
        // Not a subdomain conflict, re-throw
        throw error
      }
    }

    if (!insertSuccess) {
      throw new Error(`Failed to create project after ${MAX_SUBDOMAIN_RETRIES} subdomain conflict retries`)
    }

    // 4. Create the quota record (trigger should do this, but be explicit)
    await db.query(`
      INSERT INTO inhouse_quotas (project_id, tier)
      VALUES ($1, 'free')
      ON CONFLICT (project_id) DO NOTHING
    `, [projectId])

    // 5. Create the project schema record
    await db.query(`
      INSERT INTO inhouse_project_schemas (project_id, schema_name)
      VALUES ($1, $2)
    `, [projectId, schemaName])

    // 6. Create the actual PostgreSQL schema (for tenant isolation)
    // Note: In production, this would be done on a separate tenant database
    // For now, we're simulating with a schema in the main database
    try {
      await db.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

      // 6b. Grant read access to admin readonly role (for Database Inspector)
      // This allows the inhouse_admin_readonly role to inspect this schema
      try {
        await db.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO inhouse_admin_readonly`)
        await db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schemaName}" TO inhouse_admin_readonly`)
        // Also grant SELECT on future tables in this schema
        await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT SELECT ON TABLES TO inhouse_admin_readonly`)
        // Grant sequence access for introspection queries (harmless for read-only)
        await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT USAGE, SELECT ON SEQUENCES TO inhouse_admin_readonly`)
      } catch (grantError) {
        // Don't fail project creation if grants fail (role may not exist yet)
        console.warn(`[InhouseProject] Could not grant readonly access to ${schemaName}:`, grantError)
      }
    } catch (error) {
      console.warn(`[InhouseProject] Could not create schema ${schemaName}:`, error)
    }

    // 7. Generate API key
    const apiKeyData = generateApiKey('public')
    await db.query(`
      INSERT INTO inhouse_api_keys (
        project_id, key_prefix, key_hash, key_type, name, scopes
      ) VALUES ($1, $2, $3, 'public', 'Default Public Key', ARRAY['read', 'write'])
    `, [projectId, apiKeyData.prefix, apiKeyData.hash])

    // 8. Create inbox config with unique inbox_id
    const inboxId = generateInboxId()
    await db.query(`
      INSERT INTO inhouse_inbox_config (
        project_id, inbox_id, display_name
      ) VALUES ($1, $2, $3)
      ON CONFLICT (project_id) DO NOTHING
    `, [projectId, inboxId, input.name])

    // 9. Process starter content (from template) - non-blocking
    // Don't fail project creation if starter content fails
    if (input.starterContent) {
      try {
        await this.processStarterContent(projectId, input.starterContent)
      } catch (error) {
        console.warn(`[InhouseProject] Starter content creation failed for ${projectId}:`, error)
        // Continue - project is created, just without sample content
      }
    }

    // 10. Return the created project
    return {
      id: projectId,
      name: input.name,
      ownerId: input.ownerId,
      framework,
      subdomain,
      schemaName,
      previewUrl: `https://${subdomain}.sheenapps.com`,
      createdAt: new Date().toISOString(),
      apiKey: {
        publicKey: apiKeyData.key, // Full key - only returned on creation!
        keyPrefix: apiKeyData.prefix,
      },
      inbox: {
        inboxId,
        address: `${inboxId}@inbox.sheenapps.com`,
      },
    }
  }

  /**
   * Process starter content from template
   * Creates content types and sample entries for new projects
   *
   * This enables "default success" - users see sample content immediately
   * instead of starting with an empty site (which causes abandonment)
   */
  private async processStarterContent(projectId: string, starterContent: StarterContent): Promise<void> {
    const cmsService = new InhouseCmsService()

    // Map of slug -> contentTypeId for entry creation
    const contentTypeMap = new Map<string, string>()

    // 1. Create content types
    for (const ctDef of starterContent.contentTypes) {
      try {
        // Convert fields array to CMS schema format
        const schema = {
          fields: ctDef.fields.map(f => ({
            name: f.name,
            type: f.type,
            ...(f.required && { required: f.required }),
            ...(f.options && { options: f.options }),
          }))
        }

        const created = await cmsService.createContentType({
          projectId,
          name: ctDef.name,
          slug: ctDef.slug,
          schema,
        })

        contentTypeMap.set(ctDef.slug, created.id)
        console.log(`[InhouseProject] Created starter content type: ${ctDef.name} (${created.id})`)
      } catch (error) {
        console.warn(`[InhouseProject] Failed to create content type ${ctDef.name}:`, error)
        // Continue with other content types
      }
    }

    // 2. Create sample entries
    for (const entryDef of starterContent.entries) {
      const contentTypeId = contentTypeMap.get(entryDef.contentType)
      if (!contentTypeId) {
        console.warn(`[InhouseProject] No content type found for entry: ${entryDef.contentType}`)
        continue
      }

      try {
        await cmsService.createEntry({
          projectId,
          contentTypeId,
          data: entryDef.data as Record<string, any>,
          status: entryDef.status || 'published',
        })
        console.log(`[InhouseProject] Created starter entry for: ${entryDef.contentType}`)
      } catch (error) {
        console.warn(`[InhouseProject] Failed to create entry for ${entryDef.contentType}:`, error)
        // Continue with other entries
      }
    }

    console.log(`[InhouseProject] Starter content processing complete for project ${projectId}`)
  }

  /**
   * Create a table in a project's schema
   *
   * SECURITY: All identifiers and types are validated before use in SQL.
   * No user input is directly interpolated without validation.
   */
  async createTable(input: CreateTableInput): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase()

    try {
      // Validate table name
      validateIdentifier(input.tableName, 'table name')

      // Validate all columns
      for (const col of input.columns) {
        validateIdentifier(col.name, 'column name')
        validateColumnType(col.type)
        if (col.default) {
          validateColumnDefault(col.default)
        }
      }

      // 1. Get schema name
      const schemaResult = await db.query(`
        SELECT schema_name FROM inhouse_project_schemas
        WHERE project_id = $1
      `, [input.projectId])

      if (schemaResult.rows.length === 0) {
        return { success: false, error: 'Project schema not found' }
      }

      const schemaName = schemaResult.rows[0].schema_name

      // Quote identifier helper (escapes any remaining special chars)
      const qi = (name: string): string => `"${name.replace(/"/g, '""')}"`

      // 2. Build CREATE TABLE statement with validated inputs
      // Normalize column definitions once to avoid SQL/metadata mismatch
      const normalizedColumns = input.columns.map(col => {
        const validatedType = validateColumnType(col.type)
        const validatedDefault = col.default ? validateColumnDefault(col.default) : null
        // Normalize nullable: default to true (nullable) if not specified
        // This must be consistent between SQL generation and metadata storage
        const isNullable = col.nullable ?? true
        const isPrimaryKey = col.primaryKey ?? false

        return {
          name: col.name,
          type: validatedType,
          default: validatedDefault,
          nullable: isNullable,
          primaryKey: isPrimaryKey,
          unique: col.unique ?? false,
        }
      })

      const columnDefs = normalizedColumns.map(col => {
        const parts = [qi(col.name), col.type]
        if (col.primaryKey) parts.push('PRIMARY KEY')
        if (!col.nullable && !col.primaryKey) parts.push('NOT NULL')
        if (col.unique) parts.push('UNIQUE')
        if (col.default) parts.push(`DEFAULT ${col.default}`)
        return parts.join(' ')
      })

      const createTableSQL = `
        CREATE TABLE ${qi(schemaName)}.${qi(input.tableName)} (
          ${columnDefs.join(',\n          ')}
        )
      `

      await db.query(createTableSQL)

      // 3. Register table in metadata
      const tableResult = await db.query(`
        INSERT INTO inhouse_tables (
          schema_id, project_id, table_name, display_name
        )
        SELECT s.id, $1, $2, $3
        FROM inhouse_project_schemas s
        WHERE s.project_id = $1
        RETURNING id
      `, [input.projectId, input.tableName, input.tableName])

      const tableId = tableResult.rows[0].id

      // 4. Register columns in metadata (using normalized values for consistency)
      for (const col of normalizedColumns) {
        await db.query(`
          INSERT INTO inhouse_columns (
            table_id, column_name, data_type, is_nullable, is_primary_key
          ) VALUES ($1, $2, $3, $4, $5)
        `, [tableId, col.name, col.type, col.nullable, col.primaryKey])
      }

      // 5. Update table count
      await db.query(`
        UPDATE inhouse_project_schemas
        SET table_count = table_count + 1, updated_at = NOW()
        WHERE project_id = $1
      `, [input.projectId])

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Get project details
   */
  async getProject(projectId: string): Promise<EasyModeProject | null> {
    const db = getDatabase()

    const result = await db.query(`
      SELECT
        p.id, p.name, p.owner_id, p.framework, p.created_at,
        p.inhouse_subdomain, p.inhouse_schema_name,
        k.key_prefix
      FROM projects p
      LEFT JOIN inhouse_api_keys k ON k.project_id = p.id AND k.key_type = 'public' AND k.status = 'active'
      WHERE p.id = $1 AND p.infra_mode = 'easy'
      LIMIT 1
    `, [projectId])

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      framework: row.framework,
      subdomain: row.inhouse_subdomain,
      schemaName: row.inhouse_schema_name,
      previewUrl: `https://${row.inhouse_subdomain}.sheenapps.com`,
      createdAt: row.created_at,
      apiKey: {
        publicKey: '', // Never return full key after creation
        keyPrefix: row.key_prefix,
      },
    }
  }

  /**
   * List user's Easy Mode projects
   */
  async listProjects(ownerId: string): Promise<Array<Omit<EasyModeProject, 'apiKey'>>> {
    const db = getDatabase()

    const result = await db.query(`
      SELECT
        id, name, owner_id, framework, created_at,
        inhouse_subdomain, inhouse_schema_name
      FROM projects
      WHERE owner_id = $1 AND infra_mode = 'easy' AND archived_at IS NULL
      ORDER BY created_at DESC
    `, [ownerId])

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      framework: row.framework,
      subdomain: row.inhouse_subdomain,
      schemaName: row.inhouse_schema_name,
      previewUrl: `https://${row.inhouse_subdomain}.sheenapps.com`,
      createdAt: row.created_at,
    }))
  }

  /**
   * Generate a new API key for a project
   */
  async generateNewApiKey(
    projectId: string,
    type: 'public' | 'server' = 'public',
    name?: string
  ): Promise<{ key: string; prefix: string } | null> {
    const db = getDatabase()

    // Verify project exists and is Easy Mode
    const projectCheck = await db.query(`
      SELECT id FROM projects WHERE id = $1 AND infra_mode = 'easy'
    `, [projectId])

    if (projectCheck.rows.length === 0) return null

    // Generate new key
    const apiKeyData = generateApiKey(type)

    // Insert key record
    await db.query(`
      INSERT INTO inhouse_api_keys (
        project_id, key_prefix, key_hash, key_type, name, scopes
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      projectId,
      apiKeyData.prefix,
      apiKeyData.hash,
      type,
      name || `${type} key`,
      type === 'server' ? ['read', 'write', 'admin'] : ['read', 'write'],
    ])

    return {
      key: apiKeyData.key,
      prefix: apiKeyData.prefix,
    }
  }

  /**
   * Regenerate an API key with rotation (grace period for old key)
   *
   * INHOUSE_MODE_REMAINING.md Task 4:
   * - Creates new key immediately
   * - Old key gets 15-minute grace period (expires_at)
   * - Rate limited: 3/hour, 10/day per project
   *
   * @returns New key data and old key expiration time
   */
  async regenerateApiKey(
    projectId: string,
    keyType: 'public' | 'server'
  ): Promise<{
    newKey: string
    newKeyPrefix: string
    oldKeyExpiresAt: Date
  }> {
    const db = getDatabase()
    const GRACE_PERIOD_MINUTES = 15

    // 1. Check rate limits
    const rateLimitResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as hourly_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as daily_count
      FROM inhouse_api_keys
      WHERE project_id = $1 AND key_type = $2
    `, [projectId, keyType])

    const { hourly_count, daily_count } = rateLimitResult.rows[0]
    if (parseInt(hourly_count) >= 3) {
      throw new Error('Rate limit exceeded: maximum 3 key regenerations per hour')
    }
    if (parseInt(daily_count) >= 10) {
      throw new Error('Rate limit exceeded: maximum 10 key regenerations per day')
    }

    // 2. Set expiration on current active key(s) - 15 minute grace period
    const expiresAt = new Date(Date.now() + GRACE_PERIOD_MINUTES * 60 * 1000)
    await db.query(`
      UPDATE inhouse_api_keys
      SET expires_at = $1
      WHERE project_id = $2 AND key_type = $3 AND status = 'active' AND expires_at IS NULL
    `, [expiresAt.toISOString(), projectId, keyType])

    // 3. Generate and create new key
    const apiKeyData = generateApiKey(keyType)
    await db.query(`
      INSERT INTO inhouse_api_keys (
        project_id, key_prefix, key_hash, key_type, name, scopes
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      projectId,
      apiKeyData.prefix,
      apiKeyData.hash,
      keyType,
      `Regenerated ${keyType} key`,
      keyType === 'server' ? ['read', 'write', 'admin'] : ['read', 'write'],
    ])

    return {
      newKey: apiKeyData.key,
      newKeyPrefix: apiKeyData.prefix,
      oldKeyExpiresAt: expiresAt,
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(projectId: string, keyPrefix: string): Promise<boolean> {
    const db = getDatabase()

    const result = await db.query(`
      UPDATE inhouse_api_keys
      SET status = 'revoked', revoked_at = NOW()
      WHERE project_id = $1 AND key_prefix = $2 AND status = 'active'
    `, [projectId, keyPrefix])

    return (result.rowCount || 0) > 0
  }

  /**
   * Get project quota status
   */
  async getQuotaStatus(projectId: string): Promise<{
    tier: string
    database: { used: number; limit: number; percent: number }
    storage: { used: number; limit: number; percent: number }
    requests: { used: number; limit: number; percent: number }
  } | null> {
    const db = getDatabase()

    const result = await db.query(`
      SELECT
        tier,
        db_size_used_bytes, db_size_limit_bytes,
        storage_size_used_bytes, storage_size_limit_bytes,
        requests_used_today, requests_limit_daily
      FROM inhouse_quotas
      WHERE project_id = $1
    `, [projectId])

    if (result.rows.length === 0) return null

    const row = result.rows[0]

    // Safe percent calculation - avoid division by zero/null
    const safePercent = (used: number, limit: number): number => {
      if (!limit || limit <= 0) return 0
      return Math.min((used / limit) * 100, 100) // Cap at 100%
    }

    return {
      tier: row.tier,
      database: {
        used: row.db_size_used_bytes || 0,
        limit: row.db_size_limit_bytes || 0,
        percent: safePercent(row.db_size_used_bytes, row.db_size_limit_bytes),
      },
      storage: {
        used: row.storage_size_used_bytes || 0,
        limit: row.storage_size_limit_bytes || 0,
        percent: safePercent(row.storage_size_used_bytes, row.storage_size_limit_bytes),
      },
      requests: {
        used: row.requests_used_today || 0,
        limit: row.requests_limit_daily || 0,
        percent: safePercent(row.requests_used_today, row.requests_limit_daily),
      },
    }
  }
}

// Singleton instance
let instance: InhouseProjectService | null = null

export function getInhouseProjectService(): InhouseProjectService {
  if (!instance) {
    instance = new InhouseProjectService()
  }
  return instance
}
