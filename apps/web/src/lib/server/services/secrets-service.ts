/**
 * Secrets Service
 *
 * Business logic for secrets management with envelope encryption.
 * Server-only - never expose to client.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import type { createServerSupabaseClientNew } from '@/lib/supabase-server'

// Type alias for Supabase client (extracted from our server client factory)
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientNew>>

// =============================================================================
// TYPES
// =============================================================================

export type SecretCategory = 'payment' | 'email' | 'ai' | 'webhook' | 'storage' | 'other'

export interface Secret {
  id: string
  projectId: string
  name: string
  description: string | null
  category: SecretCategory | null
  tags: string[]
  status: 'active' | 'rotated' | 'deleted'
  createdAt: string
  updatedAt: string
  lastAccessedAt: string | null
  accessCount: number
}

export interface SecretWithValue extends Secret {
  value: string
}

export interface CreateSecretInput {
  name: string
  value: string
  description?: string
  category?: SecretCategory
  tags?: string[]
}

export interface UpdateSecretInput {
  value?: string
  description?: string
  category?: SecretCategory
  tags?: string[]
}

export interface ListSecretsInput {
  category?: SecretCategory
  status?: 'active' | 'rotated' | 'deleted'
  limit?: number
  offset?: number
}

export interface ServiceResult<T> {
  data: T | null
  error: { code: string; message: string; details?: unknown } | null
}

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

// TODO: Replace with external KMS integration (AWS KMS, HashiCorp Vault, etc.)
// For now, using environment variable as master key (NOT PRODUCTION READY)
function getMasterKey(): Buffer {
  const key = process.env.SHEEN_SECRETS_MASTER_KEY
  if (!key) {
    throw new Error('SHEEN_SECRETS_MASTER_KEY environment variable not set')
  }
  // Key should be 32 bytes (256 bits) for AES-256
  const keyBuffer = Buffer.from(key, 'base64')
  if (keyBuffer.length !== 32) {
    throw new Error('SHEEN_SECRETS_MASTER_KEY must be 32 bytes (256 bits) base64 encoded')
  }
  return keyBuffer
}

/**
 * Encrypt a secret value using envelope encryption
 * Returns: { encryptedValue, encryptedDataKey, iv, dataKeyIv }
 */
function encryptSecret(plaintext: string): {
  encryptedValue: Buffer
  encryptedDataKey: Buffer
  iv: Buffer
  dataKeyIv: Buffer
} {
  const masterKey = getMasterKey()

  // Generate a random data key for this secret
  const dataKey = randomBytes(32) // AES-256

  // Encrypt the plaintext with the data key
  const iv = randomBytes(16) // AES block size
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const encryptedValue = Buffer.concat([encrypted, authTag])

  // Encrypt the data key with the master key
  const dataKeyIv = randomBytes(16)
  const keyCipher = createCipheriv('aes-256-gcm', masterKey, dataKeyIv)
  const encryptedKey = Buffer.concat([keyCipher.update(dataKey), keyCipher.final()])
  const keyAuthTag = keyCipher.getAuthTag()
  const encryptedDataKey = Buffer.concat([encryptedKey, keyAuthTag])

  return {
    encryptedValue,
    encryptedDataKey,
    iv,
    dataKeyIv
  }
}

/**
 * Decrypt a secret value using envelope encryption
 */
function decryptSecret(
  encryptedValue: Buffer,
  encryptedDataKey: Buffer,
  iv: Buffer,
  dataKeyIv: Buffer
): string {
  const masterKey = getMasterKey()

  // Decrypt the data key with the master key
  const keyAuthTag = encryptedDataKey.subarray(-16)
  const encryptedKeyData = encryptedDataKey.subarray(0, -16)
  const keyDecipher = createDecipheriv('aes-256-gcm', masterKey, dataKeyIv)
  keyDecipher.setAuthTag(keyAuthTag)
  const dataKey = Buffer.concat([keyDecipher.update(encryptedKeyData), keyDecipher.final()])

  // Decrypt the value with the data key
  const authTag = encryptedValue.subarray(-16)
  const encryptedData = encryptedValue.subarray(0, -16)
  const decipher = createDecipheriv('aes-256-gcm', dataKey, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(encryptedData), decipher.final()])

  return plaintext.toString('utf8')
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class SecretsService {
  constructor(
    private supabase: SupabaseClient,
    private projectId: string,
    private actorId: string
  ) {}

  // ===========================================================================
  // CREATE
  // ===========================================================================

  async create(input: CreateSecretInput): Promise<ServiceResult<Secret>> {
    try {
      // Validate name format
      if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(input.name)) {
        return {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Secret name must be UPPER_SNAKE_CASE (e.g., STRIPE_SECRET_KEY)',
            details: { field: 'name' }
          }
        }
      }

      // Check for existing secret with same name
      const { data: existing } = await this.supabase
        .from('inhouse_secrets')
        .select('id')
        .eq('project_id', this.projectId)
        .eq('name', input.name)
        .eq('status', 'active')
        .single()

      if (existing) {
        return {
          data: null,
          error: {
            code: 'ALREADY_EXISTS',
            message: `Secret "${input.name}" already exists`
          }
        }
      }

      // Encrypt the secret value
      const { encryptedValue, encryptedDataKey, iv, dataKeyIv } = encryptSecret(input.value)

      // Insert the secret
      const { data, error } = await this.supabase
        .from('inhouse_secrets')
        .insert({
          project_id: this.projectId,
          name: input.name,
          description: input.description || null,
          category: input.category || null,
          tags: input.tags || [],
          encrypted_value: encryptedValue,
          encrypted_data_key: encryptedDataKey,
          encryption_iv: iv,
          data_key_iv: dataKeyIv,
          key_version: 1 // Current master key version
        })
        .select('id, project_id, name, description, category, tags, status, created_at, updated_at, last_accessed_at, access_count')
        .single()

      if (error) {
        console.error('[SecretsService] Create error:', error)
        return {
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to create secret' }
        }
      }

      // Record audit
      await this.recordAudit(data.id, input.name, 'create')

      return {
        data: this.mapToSecret(data),
        error: null
      }
    } catch (err) {
      console.error('[SecretsService] Create exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create secret' }
      }
    }
  }

  // ===========================================================================
  // GET
  // ===========================================================================

  async get(name: string): Promise<ServiceResult<SecretWithValue>> {
    try {
      const { data, error } = await this.supabase
        .from('inhouse_secrets')
        .select('*')
        .eq('project_id', this.projectId)
        .eq('name', name)
        .eq('status', 'active')
        .single()

      if (error || !data) {
        return {
          data: null,
          error: { code: 'NOT_FOUND', message: `Secret "${name}" not found` }
        }
      }

      // Decrypt the value
      const value = decryptSecret(
        Buffer.from(data.encrypted_value),
        Buffer.from(data.encrypted_data_key),
        Buffer.from(data.encryption_iv),
        Buffer.from(data.data_key_iv)
      )

      // Update access tracking
      await this.supabase.rpc('record_secret_access', { p_secret_id: data.id })

      // Record audit
      await this.recordAudit(data.id, name, 'read')

      return {
        data: {
          ...this.mapToSecret(data),
          value
        },
        error: null
      }
    } catch (err) {
      console.error('[SecretsService] Get exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get secret' }
      }
    }
  }

  // ===========================================================================
  // GET MULTIPLE
  // ===========================================================================

  async getMultiple(names: string[]): Promise<ServiceResult<Record<string, string>>> {
    try {
      const { data, error } = await this.supabase
        .from('inhouse_secrets')
        .select('*')
        .eq('project_id', this.projectId)
        .in('name', names)
        .eq('status', 'active')

      if (error) {
        return {
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to get secrets' }
        }
      }

      const result: Record<string, string> = {}

      for (const row of data || []) {
        const value = decryptSecret(
          Buffer.from(row.encrypted_value),
          Buffer.from(row.encrypted_data_key),
          Buffer.from(row.encryption_iv),
          Buffer.from(row.data_key_iv)
        )
        result[row.name] = value

        // Update access tracking and audit
        await this.supabase.rpc('record_secret_access', { p_secret_id: row.id })
        await this.recordAudit(row.id, row.name, 'read')
      }

      return { data: result, error: null }
    } catch (err) {
      console.error('[SecretsService] GetMultiple exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get secrets' }
      }
    }
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  async update(name: string, input: UpdateSecretInput): Promise<ServiceResult<Secret>> {
    try {
      // Get existing secret
      const { data: existing, error: getError } = await this.supabase
        .from('inhouse_secrets')
        .select('id')
        .eq('project_id', this.projectId)
        .eq('name', name)
        .eq('status', 'active')
        .single()

      if (getError || !existing) {
        return {
          data: null,
          error: { code: 'NOT_FOUND', message: `Secret "${name}" not found` }
        }
      }

      // Build update object
      const updates: Record<string, unknown> = {}

      if (input.description !== undefined) updates.description = input.description
      if (input.category !== undefined) updates.category = input.category
      if (input.tags !== undefined) updates.tags = input.tags

      // Re-encrypt if value is being updated
      if (input.value !== undefined) {
        const { encryptedValue, encryptedDataKey, iv, dataKeyIv } = encryptSecret(input.value)
        updates.encrypted_value = encryptedValue
        updates.encrypted_data_key = encryptedDataKey
        updates.encryption_iv = iv
        updates.data_key_iv = dataKeyIv
      }

      if (Object.keys(updates).length === 0) {
        return {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'No fields to update' }
        }
      }

      const { data, error } = await this.supabase
        .from('inhouse_secrets')
        .update(updates)
        .eq('id', existing.id)
        .select('id, project_id, name, description, category, tags, status, created_at, updated_at, last_accessed_at, access_count')
        .single()

      if (error) {
        return {
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to update secret' }
        }
      }

      // Record audit
      await this.recordAudit(data.id, name, 'update')

      return {
        data: this.mapToSecret(data),
        error: null
      }
    } catch (err) {
      console.error('[SecretsService] Update exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update secret' }
      }
    }
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  async delete(name: string): Promise<ServiceResult<{ success: boolean }>> {
    try {
      const { data, error } = await this.supabase
        .from('inhouse_secrets')
        .update({ status: 'deleted' })
        .eq('project_id', this.projectId)
        .eq('name', name)
        .eq('status', 'active')
        .select('id')
        .single()

      if (error || !data) {
        return {
          data: null,
          error: { code: 'NOT_FOUND', message: `Secret "${name}" not found` }
        }
      }

      // Record audit
      await this.recordAudit(data.id, name, 'delete')

      return { data: { success: true }, error: null }
    } catch (err) {
      console.error('[SecretsService] Delete exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete secret' }
      }
    }
  }

  // ===========================================================================
  // LIST
  // ===========================================================================

  async list(input?: ListSecretsInput): Promise<ServiceResult<{ secrets: Secret[]; total: number }>> {
    try {
      let query = this.supabase
        .from('inhouse_secrets')
        .select('id, project_id, name, description, category, tags, status, created_at, updated_at, last_accessed_at, access_count', { count: 'exact' })
        .eq('project_id', this.projectId)

      // Apply filters
      if (input?.category) query = query.eq('category', input.category)
      query = query.eq('status', input?.status || 'active')

      // Apply pagination
      const limit = input?.limit || 100
      const offset = input?.offset || 0
      query = query.range(offset, offset + limit - 1)

      // Order by name
      query = query.order('name')

      const { data, error, count } = await query

      if (error) {
        return {
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to list secrets' }
        }
      }

      // Record audit for list operation
      await this.recordAudit(null, '*', 'list')

      return {
        data: {
          secrets: (data || []).map(row => this.mapToSecret(row)),
          total: count || 0
        },
        error: null
      }
    } catch (err) {
      console.error('[SecretsService] List exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list secrets' }
      }
    }
  }

  // ===========================================================================
  // EXISTS
  // ===========================================================================

  async exists(name: string): Promise<ServiceResult<{ exists: boolean }>> {
    try {
      const { data, error } = await this.supabase
        .from('inhouse_secrets')
        .select('id')
        .eq('project_id', this.projectId)
        .eq('name', name)
        .eq('status', 'active')
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        return {
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to check secret existence' }
        }
      }

      return { data: { exists: !!data }, error: null }
    } catch (err) {
      console.error('[SecretsService] Exists exception:', err)
      return {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to check secret existence' }
      }
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private mapToSecret(row: Record<string, unknown>): Secret {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      name: row.name as string,
      description: row.description as string | null,
      category: row.category as SecretCategory | null,
      tags: row.tags as string[],
      status: row.status as 'active' | 'rotated' | 'deleted',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastAccessedAt: row.last_accessed_at as string | null,
      accessCount: row.access_count as number
    }
  }

  private async recordAudit(
    secretId: string | null,
    secretName: string,
    action: string
  ): Promise<void> {
    try {
      await this.supabase.rpc('record_secret_audit', {
        p_secret_id: secretId,
        p_project_id: this.projectId,
        p_secret_name: secretName,
        p_actor_type: 'user',
        p_actor_id: this.actorId,
        p_action: action
      })
    } catch (err) {
      // Don't fail the operation if audit fails, but log it
      console.error('[SecretsService] Audit error:', err)
    }
  }
}
