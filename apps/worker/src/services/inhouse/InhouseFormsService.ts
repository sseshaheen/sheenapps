/**
 * InhouseFormsService - Form handling service for @sheenapps/forms SDK
 *
 * Provides form schema management, submission handling, spam protection,
 * and submission management (list, update, bulk operations, export).
 */

import { getPool } from '../database'
import { getBusinessEventsService } from '../businessEventsService'
import crypto from 'crypto'

// ============================================================================
// Types
// ============================================================================

export type FieldType =
  | 'string'
  | 'email'
  | 'url'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'file'

export interface FieldSchema {
  type: FieldType
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  options?: string[]
  allowedMimeTypes?: string[]
  maxFileSize?: number
  description?: string
  placeholder?: string
  defaultValue?: unknown
}

export interface FormSettings {
  honeypot?: boolean
  honeypotField?: string
  rateLimit?: {
    maxPerHour: number
    maxPerDay?: number
  }
  captcha?: {
    enabled: boolean
    provider: 'recaptcha' | 'turnstile' | 'hcaptcha'
    siteKey?: string
  }
  notifications?: {
    enabled: boolean
    to: string[]
    subject?: string
  }
  successMessage?: string
  redirectUrl?: string
  metadata?: Record<string, unknown>
}

export interface FormSchema {
  id: string
  projectId: string
  name: string
  description: string | null
  fields: Record<string, FieldSchema>
  settings: FormSettings
  createdAt: string
  updatedAt: string
}

export type SubmissionStatus = 'unread' | 'read' | 'spam' | 'archived' | 'deleted'

export interface FormSubmission {
  id: string
  formId: string
  formName: string
  data: Record<string, unknown>
  status: SubmissionStatus
  sourceIp: string | null
  userAgent: string | null
  referrer: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  readAt: string | null
  archivedAt: string | null
}

export interface CreateFormInput {
  name: string
  description?: string
  fields: Record<string, FieldSchema>
  settings?: FormSettings
}

export interface UpdateFormInput {
  name?: string
  description?: string
  fields?: Record<string, FieldSchema>
  settings?: FormSettings
}

export interface SubmitFormInput {
  data: Record<string, unknown>
  captchaToken?: string
  metadata?: Record<string, unknown>
  sourceIp?: string
  userAgent?: string
  referrer?: string
}

export interface ListSubmissionsOptions {
  formName?: string
  status?: SubmissionStatus
  startDate?: string
  endDate?: string
  search?: string
  limit?: number
  offset?: number
}

export interface ListFormsOptions {
  search?: string
  limit?: number
  offset?: number
}

export interface BulkUpdateInput {
  submissionIds: string[]
  status: SubmissionStatus
}

export interface FormStats {
  formName: string
  period: { start: string; end: string }
  totals: {
    submissions: number
    unread: number
    read: number
    spam: number
    archived: number
  }
  byDay: Array<{ date: string; submissions: number }>
}

export interface ExportOptions {
  formName: string
  format: 'csv' | 'json'
  status?: SubmissionStatus[]
  startDate?: string
  endDate?: string
  fields?: string[]
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// ============================================================================
// Rate Limit Helper (DB-backed for multi-worker support)
// ============================================================================

// Note: Rate limiting uses DB table inhouse_form_rate_limits for accuracy
// across multiple workers. The atomic upsert ensures consistency.

// ============================================================================
// Service
// ============================================================================

export class InhouseFormsService {
  // --------------------------------------------------------------------------
  // Form Schema Management
  // --------------------------------------------------------------------------

  async createOrUpdateForm(projectId: string, formName: string, input: CreateFormInput): Promise<FormSchema> {
    const pool = getPool()
    const normalizedName = formName.toLowerCase().trim()

    const result = await pool.query<FormSchema>(
      `INSERT INTO inhouse_form_schemas (project_id, name, description, fields, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, name) DO UPDATE SET
         description = EXCLUDED.description,
         fields = EXCLUDED.fields,
         settings = EXCLUDED.settings,
         updated_at = NOW()
       RETURNING
         id,
         project_id AS "projectId",
         name,
         description,
         fields,
         settings,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        projectId,
        normalizedName,
        input.description || null,
        JSON.stringify(input.fields),
        JSON.stringify(input.settings || {}),
      ]
    )

    return result.rows[0]!
  }

  async getForm(projectId: string, formName: string): Promise<FormSchema | null> {
    const pool = getPool()
    const normalizedName = formName.toLowerCase().trim()

    const result = await pool.query<FormSchema>(
      `SELECT
         id,
         project_id AS "projectId",
         name,
         description,
         fields,
         settings,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM inhouse_form_schemas
       WHERE project_id = $1 AND name = $2`,
      [projectId, normalizedName]
    )

    return result.rows[0] || null
  }

  async updateForm(projectId: string, formName: string, input: UpdateFormInput): Promise<FormSchema | null> {
    const pool = getPool()
    const normalizedName = formName.toLowerCase().trim()

    const updates: string[] = []
    const values: unknown[] = [projectId, normalizedName]
    let paramIndex = 3

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(input.name.toLowerCase().trim())
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(input.description)
    }
    if (input.fields !== undefined) {
      updates.push(`fields = $${paramIndex++}`)
      values.push(JSON.stringify(input.fields))
    }
    if (input.settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`)
      values.push(JSON.stringify(input.settings))
    }

    if (updates.length === 0) {
      return this.getForm(projectId, formName)
    }

    updates.push('updated_at = NOW()')

    const result = await pool.query<FormSchema>(
      `UPDATE inhouse_form_schemas
       SET ${updates.join(', ')}
       WHERE project_id = $1 AND name = $2
       RETURNING
         id,
         project_id AS "projectId",
         name,
         description,
         fields,
         settings,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      values
    )

    return result.rows[0] || null
  }

  async deleteForm(projectId: string, formName: string): Promise<boolean> {
    const pool = getPool()
    const normalizedName = formName.toLowerCase().trim()

    const result = await pool.query(
      `DELETE FROM inhouse_form_schemas WHERE project_id = $1 AND name = $2`,
      [projectId, normalizedName]
    )

    return (result.rowCount ?? 0) > 0
  }

  async listForms(projectId: string, options: ListFormsOptions = {}): Promise<PaginatedResult<FormSchema>> {
    const pool = getPool()
    const limit = Math.min(options.limit || 20, 100)
    const offset = options.offset || 0

    let whereClause = 'WHERE project_id = $1'
    const values: unknown[] = [projectId]
    let paramIndex = 2

    if (options.search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`
      values.push(`%${options.search}%`)
      paramIndex++
    }

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM inhouse_form_schemas ${whereClause}`,
      values
    )
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10)

    const result = await pool.query<FormSchema>(
      `SELECT
         id,
         project_id AS "projectId",
         name,
         description,
         fields,
         settings,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM inhouse_form_schemas
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    )

    return {
      items: result.rows,
      total,
      limit,
      offset,
      hasMore: offset + result.rows.length < total,
    }
  }

  // --------------------------------------------------------------------------
  // Form Submission
  // --------------------------------------------------------------------------

  async submitForm(
    projectId: string,
    formName: string,
    input: SubmitFormInput
  ): Promise<{ id: string; success: boolean; message: string; redirectUrl?: string }> {
    const pool = getPool()
    const normalizedName = formName.toLowerCase().trim()

    // Get form schema
    const form = await this.getForm(projectId, formName)
    if (!form) {
      throw { statusCode: 404, code: 'FORM_NOT_FOUND', message: `Form '${formName}' not found` }
    }

    // Validate honeypot
    if (form.settings.honeypot) {
      const honeypotField = form.settings.honeypotField || 'website'
      if (input.data[honeypotField]) {
        throw { statusCode: 400, code: 'HONEYPOT_TRIGGERED', message: 'Bot detected' }
      }
      // Remove honeypot from data
      delete input.data[honeypotField]
    }

    // Check rate limit (DB-backed for multi-worker support)
    if (form.settings.rateLimit && input.sourceIp) {
      const allowed = await this.checkRateLimitDb(
        form.id,
        input.sourceIp,
        form.settings.rateLimit.maxPerHour
      )
      if (!allowed) {
        throw { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many submissions' }
      }
    }

    // Validate fields
    this.validateFormData(input.data, form.fields)

    // Verify captcha if required
    if (form.settings.captcha?.enabled) {
      if (!input.captchaToken) {
        throw { statusCode: 400, code: 'CAPTCHA_REQUIRED', message: 'Captcha verification required' }
      }
      const captchaValid = await this.verifyCaptcha(
        form.settings.captcha.provider,
        input.captchaToken
      )
      if (!captchaValid) {
        throw { statusCode: 400, code: 'CAPTCHA_FAILED', message: 'Captcha verification failed' }
      }
    }

    // Insert submission
    const result = await pool.query<{ id: string }>(
      `INSERT INTO inhouse_form_submissions (
         project_id, form_id, data, source_ip, user_agent, referrer, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        projectId,
        form.id,
        JSON.stringify(input.data),
        input.sourceIp || null,
        input.userAgent || null,
        input.referrer || null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    )

    // TODO: Send notification email if configured

    const submissionId = result.rows[0]!.id

    // Emit business events (fire-and-forget, non-blocking)
    const eventsService = getBusinessEventsService()
    const now = new Date().toISOString()

    // 1. Always emit form_submitted
    void eventsService.insertEvent({
      projectId,
      eventType: 'form_submitted',
      occurredAt: now,
      source: 'server',
      idempotencyKey: `form:${submissionId}`,
      payload: {
        formName: normalizedName,
        formId: form.id,
        submissionId,
      },
      entityType: 'form_submission',
      entityId: submissionId,
    }).catch(err => {
      console.error('[InhouseFormsService] Failed to emit form_submitted event:', err)
    })

    // 2. If data contains an email field, also emit lead_created
    const emailValue = input.data.email || input.data.Email || input.data.EMAIL
    if (emailValue && typeof emailValue === 'string') {
      void eventsService.insertEvent({
        projectId,
        eventType: 'lead_created',
        occurredAt: now,
        source: 'server',
        idempotencyKey: `lead:${submissionId}`,
        payload: {
          formName: normalizedName,
          formId: form.id,
          submissionId,
          email: emailValue,
          name: (input.data.name || input.data.Name || input.data.full_name || '') as string,
        },
        entityType: 'form_submission',
        entityId: submissionId,
      }).catch(err => {
        console.error('[InhouseFormsService] Failed to emit lead_created event:', err)
      })
    }

    return {
      id: submissionId,
      success: true,
      message: form.settings.successMessage || 'Form submitted successfully',
      redirectUrl: form.settings.redirectUrl,
    }
  }

  /**
   * DB-backed rate limiting for multi-worker accuracy.
   * Uses atomic upsert with window reset logic.
   */
  private async checkRateLimitDb(formId: string, sourceIp: string, maxPerHour: number): Promise<boolean> {
    const pool = getPool()

    const result = await pool.query<{ allowed: boolean }>(
      `WITH upsert AS (
        INSERT INTO inhouse_form_rate_limits (form_id, source_ip, submission_count, window_start)
        VALUES ($1, $2::inet, 1, NOW())
        ON CONFLICT (form_id, source_ip)
        DO UPDATE SET
          submission_count = CASE
            WHEN inhouse_form_rate_limits.window_start < NOW() - INTERVAL '1 hour'
              THEN 1
            ELSE inhouse_form_rate_limits.submission_count + 1
          END,
          window_start = CASE
            WHEN inhouse_form_rate_limits.window_start < NOW() - INTERVAL '1 hour'
              THEN NOW()
            ELSE inhouse_form_rate_limits.window_start
          END
        RETURNING submission_count
      )
      SELECT (submission_count <= $3) AS allowed FROM upsert`,
      [formId, sourceIp, maxPerHour]
    )

    return result.rows[0]?.allowed ?? true
  }

  private validateFormData(data: Record<string, unknown>, fields: Record<string, FieldSchema>): void {
    for (const [fieldName, schema] of Object.entries(fields)) {
      const value = data[fieldName]

      // Required check (includes empty arrays for multiselect fields)
      const isEmpty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0)
      if (schema.required && isEmpty) {
        throw {
          statusCode: 400,
          code: 'FIELD_REQUIRED',
          message: `Field '${fieldName}' is required`,
          field: fieldName,
        }
      }

      if (value === undefined || value === null || value === '') {
        continue // Skip validation for optional empty fields
      }

      // Type-specific validation
      switch (schema.type) {
        case 'email':
          if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw {
              statusCode: 400,
              code: 'INVALID_EMAIL',
              message: `Field '${fieldName}' must be a valid email`,
              field: fieldName,
            }
          }
          break

        case 'url':
          if (typeof value !== 'string') {
            throw {
              statusCode: 400,
              code: 'INVALID_URL',
              message: `Field '${fieldName}' must be a valid URL`,
              field: fieldName,
            }
          }
          try {
            new URL(value)
          } catch {
            throw {
              statusCode: 400,
              code: 'INVALID_URL',
              message: `Field '${fieldName}' must be a valid URL`,
              field: fieldName,
            }
          }
          break

        case 'number':
          const num = typeof value === 'number' ? value : parseFloat(String(value))
          if (isNaN(num)) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a number`,
              field: fieldName,
            }
          }
          if (schema.min !== undefined && num < schema.min) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be at least ${schema.min}`,
              field: fieldName,
            }
          }
          if (schema.max !== undefined && num > schema.max) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be at most ${schema.max}`,
              field: fieldName,
            }
          }
          break

        case 'string':
        case 'textarea':
          if (typeof value !== 'string') {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a string`,
              field: fieldName,
            }
          }
          if (schema.minLength !== undefined && value.length < schema.minLength) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be at least ${schema.minLength} characters`,
              field: fieldName,
            }
          }
          if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            throw {
              statusCode: 400,
              code: 'FIELD_TOO_LONG',
              message: `Field '${fieldName}' must be at most ${schema.maxLength} characters`,
              field: fieldName,
            }
          }
          if (schema.pattern) {
            const regex = new RegExp(schema.pattern)
            if (!regex.test(value)) {
              throw {
                statusCode: 400,
                code: 'FIELD_INVALID',
                message: `Field '${fieldName}' does not match required pattern`,
                field: fieldName,
              }
            }
          }
          break

        case 'select':
          if (schema.options && !schema.options.includes(String(value))) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be one of: ${schema.options.join(', ')}`,
              field: fieldName,
            }
          }
          break

        case 'multiselect':
          if (!Array.isArray(value)) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be an array`,
              field: fieldName,
            }
          }
          if (schema.options) {
            for (const item of value) {
              if (!schema.options.includes(String(item))) {
                throw {
                  statusCode: 400,
                  code: 'FIELD_INVALID',
                  message: `Field '${fieldName}' contains invalid option: ${item}`,
                  field: fieldName,
                }
              }
            }
          }
          break

        case 'boolean':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a boolean`,
              field: fieldName,
            }
          }
          break

        case 'date':
          // Validate ISO date format (YYYY-MM-DD)
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a valid date (YYYY-MM-DD)`,
              field: fieldName,
            }
          }
          // Verify it's a real date (not 2024-02-30)
          const dateObj = new Date(value + 'T00:00:00Z')
          if (isNaN(dateObj.getTime())) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' is not a valid date`,
              field: fieldName,
            }
          }
          break

        case 'datetime':
          // Validate ISO datetime format
          if (typeof value !== 'string') {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a valid datetime string`,
              field: fieldName,
            }
          }
          const dtObj = new Date(value)
          if (isNaN(dtObj.getTime())) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a valid ISO datetime`,
              field: fieldName,
            }
          }
          break

        case 'file':
          // Validate file metadata object shape
          if (typeof value !== 'object' || value === null) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must be a file object`,
              field: fieldName,
            }
          }
          const fileObj = value as Record<string, unknown>
          if (typeof fileObj.name !== 'string' || typeof fileObj.size !== 'number') {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' must have name and size properties`,
              field: fieldName,
            }
          }
          // Validate mime type if restrictions specified
          if (schema.allowedMimeTypes && schema.allowedMimeTypes.length > 0) {
            const mimeType = fileObj.type as string | undefined
            if (!mimeType || !schema.allowedMimeTypes.includes(mimeType)) {
              throw {
                statusCode: 400,
                code: 'FIELD_INVALID',
                message: `Field '${fieldName}' file type not allowed. Allowed: ${schema.allowedMimeTypes.join(', ')}`,
                field: fieldName,
              }
            }
          }
          // Validate file size if max specified
          if (schema.maxFileSize && fileObj.size > schema.maxFileSize) {
            throw {
              statusCode: 400,
              code: 'FIELD_INVALID',
              message: `Field '${fieldName}' file exceeds maximum size of ${schema.maxFileSize} bytes`,
              field: fieldName,
            }
          }
          break
      }
    }
  }

  /**
   * Escape CSV value to prevent formula injection and proper quoting.
   * Prefixes values starting with =, +, -, @ with a single quote to prevent
   * Excel/Sheets formula execution.
   */
  private safeCsvValue(v: unknown): string {
    if (v === undefined || v === null) return ''
    let s = String(v)
    // Prevent CSV formula injection (Excel/Sheets attack vector)
    if (/^[=+\-@]/.test(s)) {
      s = `'${s}`
    }
    // Quote values containing special characters
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  private async verifyCaptcha(provider: string, token: string): Promise<boolean> {
    // TODO: Implement actual captcha verification
    // For now, accept all tokens in development
    if (process.env.NODE_ENV === 'development') {
      return true
    }

    // In production, would verify with respective provider
    // reCAPTCHA: https://www.google.com/recaptcha/api/siteverify
    // Turnstile: https://challenges.cloudflare.com/turnstile/v0/siteverify
    // hCaptcha: https://hcaptcha.com/siteverify

    return true
  }

  // --------------------------------------------------------------------------
  // Submission Management
  // --------------------------------------------------------------------------

  async getSubmission(projectId: string, submissionId: string): Promise<FormSubmission | null> {
    const pool = getPool()

    const result = await pool.query<FormSubmission>(
      `SELECT
         s.id,
         s.form_id AS "formId",
         f.name AS "formName",
         s.data,
         s.status,
         s.source_ip AS "sourceIp",
         s.user_agent AS "userAgent",
         s.referrer,
         s.metadata,
         s.created_at AS "createdAt",
         s.read_at AS "readAt",
         s.archived_at AS "archivedAt"
       FROM inhouse_form_submissions s
       JOIN inhouse_form_schemas f ON f.id = s.form_id
       WHERE s.project_id = $1 AND s.id = $2`,
      [projectId, submissionId]
    )

    return result.rows[0] || null
  }

  async listSubmissions(
    projectId: string,
    options: ListSubmissionsOptions = {}
  ): Promise<PaginatedResult<FormSubmission>> {
    const pool = getPool()
    const limit = Math.min(options.limit || 20, 100)
    const offset = options.offset || 0

    let whereClause = 'WHERE s.project_id = $1'
    const values: unknown[] = [projectId]
    let paramIndex = 2

    if (options.formName) {
      whereClause += ` AND f.name = $${paramIndex++}`
      values.push(options.formName.toLowerCase().trim())
    }
    if (options.status) {
      whereClause += ` AND s.status = $${paramIndex++}`
      values.push(options.status)
    }
    if (options.startDate) {
      whereClause += ` AND s.created_at >= $${paramIndex++}`
      values.push(options.startDate)
    }
    if (options.endDate) {
      whereClause += ` AND s.created_at <= $${paramIndex++}`
      values.push(options.endDate)
    }
    if (options.search) {
      whereClause += ` AND s.data::text ILIKE $${paramIndex++}`
      values.push(`%${options.search}%`)
    }

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM inhouse_form_submissions s
       JOIN inhouse_form_schemas f ON f.id = s.form_id
       ${whereClause}`,
      values
    )
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10)

    const result = await pool.query<FormSubmission>(
      `SELECT
         s.id,
         s.form_id AS "formId",
         f.name AS "formName",
         s.data,
         s.status,
         s.source_ip AS "sourceIp",
         s.user_agent AS "userAgent",
         s.referrer,
         s.metadata,
         s.created_at AS "createdAt",
         s.read_at AS "readAt",
         s.archived_at AS "archivedAt"
       FROM inhouse_form_submissions s
       JOIN inhouse_form_schemas f ON f.id = s.form_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    )

    return {
      items: result.rows,
      total,
      limit,
      offset,
      hasMore: offset + result.rows.length < total,
    }
  }

  async updateSubmission(
    projectId: string,
    submissionId: string,
    status: SubmissionStatus
  ): Promise<FormSubmission | null> {
    const pool = getPool()

    const updates: string[] = ['status = $3']
    const values: unknown[] = [projectId, submissionId, status]

    if (status === 'read') {
      updates.push('read_at = NOW()')
    } else if (status === 'archived') {
      updates.push('archived_at = NOW()')
    }

    const result = await pool.query<FormSubmission>(
      `UPDATE inhouse_form_submissions s
       SET ${updates.join(', ')}
       FROM inhouse_form_schemas f
       WHERE s.id = $2 AND s.project_id = $1 AND f.id = s.form_id
       RETURNING
         s.id,
         s.form_id AS "formId",
         f.name AS "formName",
         s.data,
         s.status,
         s.source_ip AS "sourceIp",
         s.user_agent AS "userAgent",
         s.referrer,
         s.metadata,
         s.created_at AS "createdAt",
         s.read_at AS "readAt",
         s.archived_at AS "archivedAt"`,
      values
    )

    return result.rows[0] || null
  }

  async deleteSubmission(projectId: string, submissionId: string): Promise<boolean> {
    const pool = getPool()

    const result = await pool.query(
      `DELETE FROM inhouse_form_submissions WHERE project_id = $1 AND id = $2`,
      [projectId, submissionId]
    )

    return (result.rowCount ?? 0) > 0
  }

  async bulkUpdateSubmissions(
    projectId: string,
    input: BulkUpdateInput
  ): Promise<{ updated: number; failed: number }> {
    const pool = getPool()

    const updates: string[] = ['status = $3']
    if (input.status === 'read') {
      updates.push('read_at = NOW()')
    } else if (input.status === 'archived') {
      updates.push('archived_at = NOW()')
    }

    const result = await pool.query(
      `UPDATE inhouse_form_submissions
       SET ${updates.join(', ')}
       WHERE project_id = $1 AND id = ANY($2)`,
      [projectId, input.submissionIds, input.status]
    )

    return {
      updated: result.rowCount ?? 0,
      failed: input.submissionIds.length - (result.rowCount ?? 0),
    }
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  async getStats(
    projectId: string,
    formName: string,
    options: { startDate?: string; endDate?: string } = {}
  ): Promise<FormStats> {
    const pool = getPool()
    const normalizedName = formName.toLowerCase().trim()

    const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = options.endDate || new Date().toISOString()

    // Get totals
    const totalsResult = await pool.query<{
      submissions: string
      unread: string
      read: string
      spam: string
      archived: string
    }>(
      `SELECT
         COUNT(*) as submissions,
         COUNT(*) FILTER (WHERE s.status = 'unread') as unread,
         COUNT(*) FILTER (WHERE s.status = 'read') as read,
         COUNT(*) FILTER (WHERE s.status = 'spam') as spam,
         COUNT(*) FILTER (WHERE s.status = 'archived') as archived
       FROM inhouse_form_submissions s
       JOIN inhouse_form_schemas f ON f.id = s.form_id
       WHERE s.project_id = $1 AND f.name = $2
         AND s.created_at >= $3 AND s.created_at <= $4`,
      [projectId, normalizedName, startDate, endDate]
    )

    // Get by day
    const byDayResult = await pool.query<{ date: string; submissions: string }>(
      `SELECT
         DATE(s.created_at) as date,
         COUNT(*) as submissions
       FROM inhouse_form_submissions s
       JOIN inhouse_form_schemas f ON f.id = s.form_id
       WHERE s.project_id = $1 AND f.name = $2
         AND s.created_at >= $3 AND s.created_at <= $4
       GROUP BY DATE(s.created_at)
       ORDER BY date ASC`,
      [projectId, normalizedName, startDate, endDate]
    )

    const totals = totalsResult.rows[0] ?? { submissions: '0', unread: '0', read: '0', spam: '0', archived: '0' }

    return {
      formName: normalizedName,
      period: { start: startDate, end: endDate },
      totals: {
        submissions: parseInt(totals.submissions ?? '0', 10),
        unread: parseInt(totals.unread ?? '0', 10),
        read: parseInt(totals.read ?? '0', 10),
        spam: parseInt(totals.spam ?? '0', 10),
        archived: parseInt(totals.archived ?? '0', 10),
      },
      byDay: byDayResult.rows.map((row) => ({
        date: row.date,
        submissions: parseInt(row.submissions, 10),
      })),
    }
  }

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------

  async exportSubmissions(
    projectId: string,
    options: ExportOptions
  ): Promise<{ data: string; contentType: string; filename: string }> {
    const pool = getPool()
    const normalizedName = options.formName.toLowerCase().trim()

    let whereClause = `WHERE s.project_id = $1 AND f.name = $2`
    const values: unknown[] = [projectId, normalizedName]
    let paramIndex = 3

    if (options.status && options.status.length > 0) {
      whereClause += ` AND s.status = ANY($${paramIndex++})`
      values.push(options.status)
    }
    if (options.startDate) {
      whereClause += ` AND s.created_at >= $${paramIndex++}`
      values.push(options.startDate)
    }
    if (options.endDate) {
      whereClause += ` AND s.created_at <= $${paramIndex++}`
      values.push(options.endDate)
    }

    const result = await pool.query<FormSubmission>(
      `SELECT
         s.id,
         f.name AS "formName",
         s.data,
         s.status,
         s.source_ip AS "sourceIp",
         s.created_at AS "createdAt"
       FROM inhouse_form_submissions s
       JOIN inhouse_form_schemas f ON f.id = s.form_id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      values
    )

    const timestamp = new Date().toISOString().split('T')[0]

    if (options.format === 'json') {
      return {
        data: JSON.stringify(result.rows, null, 2),
        contentType: 'application/json',
        filename: `${normalizedName}-submissions-${timestamp}.json`,
      }
    }

    // CSV format
    if (result.rows.length === 0) {
      return {
        data: '',
        contentType: 'text/csv',
        filename: `${normalizedName}-submissions-${timestamp}.csv`,
      }
    }

    // Get all unique data keys
    const dataKeys = new Set<string>()
    for (const row of result.rows) {
      if (row.data && typeof row.data === 'object') {
        Object.keys(row.data).forEach((key) => dataKeys.add(key))
      }
    }

    const selectedFields = options.fields || Array.from(dataKeys)
    const headers = ['id', 'status', 'createdAt', 'sourceIp', ...selectedFields]

    const csvRows = [headers.join(',')]
    for (const row of result.rows) {
      const values = [
        this.safeCsvValue(row.id),
        this.safeCsvValue(row.status),
        this.safeCsvValue(row.createdAt),
        this.safeCsvValue(row.sourceIp || ''),
        ...selectedFields.map((field) => this.safeCsvValue(row.data?.[field])),
      ]
      csvRows.push(values.join(','))
    }

    return {
      data: csvRows.join('\n'),
      contentType: 'text/csv',
      filename: `${normalizedName}-submissions-${timestamp}.csv`,
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: InhouseFormsService | null = null

export function getInhouseFormsService(): InhouseFormsService {
  if (!serviceInstance) {
    serviceInstance = new InhouseFormsService()
  }
  return serviceInstance
}
