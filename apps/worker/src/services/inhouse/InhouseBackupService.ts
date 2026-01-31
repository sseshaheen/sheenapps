/**
 * Inhouse Backup Service
 *
 * Automated daily backups for Easy Mode project databases.
 * Uses envelope encryption (same pattern as InhouseSecretsService)
 * and R2 storage (same pattern as InhouseStorageService).
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { spawn } from 'child_process'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'
import { getPool, getClient } from '../database'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
// Use dedicated backup bucket or same bucket with prefix
const R2_BACKUP_BUCKET = process.env.R2_BACKUP_BUCKET || 'sheenapps-backups'

// Database connection for pg_dump
const DB_HOST = process.env.BACKUP_DB_HOST || process.env.DATABASE_HOST || 'localhost'
const DB_PORT = process.env.BACKUP_DB_PORT || process.env.DATABASE_PORT || '5432'
const DB_NAME = process.env.BACKUP_DB_NAME || process.env.DATABASE_NAME || 'postgres'
const DB_USER = process.env.BACKUP_DB_USER || process.env.DATABASE_USER || 'postgres'
const DB_PASSWORD = process.env.BACKUP_DB_PASSWORD || process.env.DATABASE_PASSWORD || ''

// S3 client for R2
const s3Client = R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY ? new S3Client({
  region: 'auto',
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
}) : null

// =============================================================================
// TYPES
// =============================================================================

export interface CreateBackupOptions {
  reason?: 'daily' | 'manual' | 'pre_destructive' | 'pre_restore'
  createdBy?: 'system' | 'user' | 'admin'
  // Note: 'directory' format is not supported as pg_dump outputs to multiple files
  // which cannot be captured via stdout. Only 'custom' and 'plain' work with pipes.
  format?: 'custom' | 'plain'
}

export interface BackupMetadata {
  id: string
  projectId: string
  schemaName: string
  format: string
  sizeBytes: number
  checksumSha256: string
  r2Bucket: string
  r2Key: string
  createdAt: string
  createdBy: string
  reason: string
  retentionExpiresAt: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'deleted'
  error?: string
  completedAt?: string
  downloadedAt?: string
  downloadedBy?: string
}

export interface ListBackupsOptions {
  status?: BackupMetadata['status']
  limit?: number
  offset?: number
}

export interface ListBackupsResult {
  backups: BackupMetadata[]
  total: number
}

// =============================================================================
// ENCRYPTION HELPERS (Envelope Encryption - same pattern as InhouseSecretsService)
// =============================================================================

/**
 * Get the master key from environment variable.
 * Can use dedicated backup key or reuse secrets key.
 */
function getMasterKey(): Buffer {
  const key = process.env.SHEEN_BACKUP_MASTER_KEY || process.env.SHEEN_SECRETS_MASTER_KEY
  if (!key) {
    throw new Error('SHEEN_BACKUP_MASTER_KEY or SHEEN_SECRETS_MASTER_KEY environment variable not set')
  }
  const keyBuffer = Buffer.from(key, 'base64')
  if (keyBuffer.length !== 32) {
    throw new Error('Backup master key must be 32 bytes (256 bits) base64 encoded')
  }
  return keyBuffer
}

/**
 * Encrypt data using envelope encryption.
 * 1. Generate a random Data Encryption Key (DEK)
 * 2. Encrypt the data with the DEK using AES-256-GCM
 * 3. Encrypt the DEK with the master key (KEK) using AES-256-GCM
 * 4. Return encrypted data, encrypted DEK, and IVs
 */
function encryptWithEnvelope(plaintext: Buffer): {
  encryptedData: Buffer
  encryptedDataKey: Buffer
  dataKeyIv: Buffer
  encryptionIv: Buffer
} {
  const masterKey = getMasterKey()

  // Generate random DEK (Data Encryption Key)
  const dek = randomBytes(32)

  // Generate random IVs
  const dataKeyIv = randomBytes(12) // 96 bits for GCM
  const encryptionIv = randomBytes(12)

  // Encrypt the DEK with master key
  const keyCipher = createCipheriv('aes-256-gcm', masterKey, dataKeyIv)
  const encryptedDek = Buffer.concat([keyCipher.update(dek), keyCipher.final()])
  const keyAuthTag = keyCipher.getAuthTag()
  const encryptedDataKey = Buffer.concat([encryptedDek, keyAuthTag])

  // Encrypt the data with DEK
  const dataCipher = createCipheriv('aes-256-gcm', dek, encryptionIv)
  const encryptedContent = Buffer.concat([dataCipher.update(plaintext), dataCipher.final()])
  const dataAuthTag = dataCipher.getAuthTag()
  const encryptedData = Buffer.concat([encryptedContent, dataAuthTag])

  return {
    encryptedData,
    encryptedDataKey,
    dataKeyIv,
    encryptionIv,
  }
}

/**
 * Decrypt data using envelope encryption.
 * Reverse of encryptWithEnvelope.
 */
function decryptWithEnvelope(
  encryptedData: Buffer,
  encryptedDataKey: Buffer,
  dataKeyIv: Buffer,
  encryptionIv: Buffer
): Buffer {
  const masterKey = getMasterKey()

  // Decrypt the DEK with master key
  const keyAuthTag = encryptedDataKey.subarray(-16)
  const encryptedDek = encryptedDataKey.subarray(0, -16)
  const keyDecipher = createDecipheriv('aes-256-gcm', masterKey, dataKeyIv)
  keyDecipher.setAuthTag(keyAuthTag)
  const dek = Buffer.concat([keyDecipher.update(encryptedDek), keyDecipher.final()])

  // Decrypt the data with DEK
  const dataAuthTag = encryptedData.subarray(-16)
  const encryptedContent = encryptedData.subarray(0, -16)
  const dataDecipher = createDecipheriv('aes-256-gcm', dek, encryptionIv)
  dataDecipher.setAuthTag(dataAuthTag)
  const plaintext = Buffer.concat([dataDecipher.update(encryptedContent), dataDecipher.final()])

  return plaintext
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate SHA-256 checksum of data
 */
function calculateChecksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Convert R2 response stream to buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Run pg_dump via child_process.spawn
 * Note: 'directory' format is not supported as it outputs to multiple files
 */
function runPgDump(schemaName: string, format: 'custom' | 'plain'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const formatFlag = format === 'custom' ? 'c' : 'p'
    const args = [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '-n', schemaName,
      '-F', formatFlag,
      '--no-owner',
      '--no-acl',
    ]

    const env = {
      ...process.env,
      PGPASSWORD: DB_PASSWORD,
    }

    const pgDump = spawn('pg_dump', args, { env })

    const chunks: Buffer[] = []
    let errorOutput = ''

    pgDump.stdout.on('data', (chunk) => {
      chunks.push(chunk)
    })

    pgDump.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString()
    })

    pgDump.on('error', (err) => {
      reject(new Error(`pg_dump spawn error: ${err.message}`))
    })

    pgDump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${errorOutput}`))
        return
      }
      resolve(Buffer.concat(chunks))
    })

    // Set timeout (5 minutes max)
    const timeout = setTimeout(() => {
      pgDump.kill('SIGTERM')
      reject(new Error('pg_dump timeout (5 minutes exceeded)'))
    }, 5 * 60 * 1000)

    pgDump.on('close', () => {
      clearTimeout(timeout)
    })
  })
}

/**
 * Map database row to BackupMetadata
 */
function rowToMetadata(row: any): BackupMetadata {
  return {
    id: row.id,
    projectId: row.project_id,
    schemaName: row.schema_name,
    format: row.format,
    sizeBytes: parseInt(row.size_bytes, 10) || 0,
    checksumSha256: row.checksum_sha256,
    r2Bucket: row.r2_bucket,
    r2Key: row.r2_key,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    createdBy: row.created_by,
    reason: row.reason,
    retentionExpiresAt: row.retention_expires_at?.toISOString?.() || row.retention_expires_at,
    status: row.status,
    error: row.error || undefined,
    completedAt: row.completed_at?.toISOString?.() || row.completed_at || undefined,
    downloadedAt: row.downloaded_at?.toISOString?.() || row.downloaded_at || undefined,
    downloadedBy: row.downloaded_by || undefined,
  }
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class InhouseBackupService {
  /**
   * Create a backup for a project
   */
  async createBackup(projectId: string, options: CreateBackupOptions = {}): Promise<BackupMetadata> {
    if (!s3Client) {
      throw new Error('Backup service not configured (R2 credentials missing)')
    }

    const pool = getPool()
    const {
      reason = 'manual',
      createdBy = 'system',
      format = 'custom',
    } = options

    // 1. Get project schema name
    const projectResult = await pool.query(
      `SELECT inhouse_schema_name FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
      [projectId]
    )

    if (projectResult.rows.length === 0) {
      throw new Error(`Easy Mode project not found: ${projectId}`)
    }

    const schemaName = projectResult.rows[0].inhouse_schema_name
    if (!schemaName) {
      throw new Error(`Project ${projectId} does not have a schema name`)
    }

    // 2. Create backup record (pending)
    // The partial unique index uq_inhouse_backups_inflight prevents concurrent backups
    let backupResult
    try {
      backupResult = await pool.query(
        `INSERT INTO inhouse_backups (
          project_id, schema_name, format, reason, created_by,
          r2_bucket, r2_key, checksum_sha256, status,
          retention_expires_at, db_host
        ) VALUES (
          $1, $2, $3, $4, $5, $6, '', '', 'pending',
          calculate_backup_retention($1), $7
        ) RETURNING id`,
        [projectId, schemaName, format, reason, createdBy, R2_BACKUP_BUCKET, DB_HOST]
      )
    } catch (error: any) {
      // Check for unique constraint violation (concurrent backup in progress)
      if (error.code === '23505' && error.constraint?.includes('inflight')) {
        const backupError = new Error('A backup is already in progress for this project') as any
        backupError.code = 'BACKUP_ALREADY_RUNNING'
        backupError.statusCode = 409
        throw backupError
      }
      throw error
    }

    const backupId = backupResult.rows[0].id
    const r2Key = `backups/${projectId}/${backupId}.dump.enc`

    // Update with actual R2 key
    await pool.query(
      `UPDATE inhouse_backups SET r2_key = $1, status = 'in_progress' WHERE id = $2`,
      [r2Key, backupId]
    )

    try {
      // 3. Run pg_dump
      console.log(`[InhouseBackup] Running pg_dump for schema ${schemaName}`)
      const dumpData = await runPgDump(schemaName, format)
      console.log(`[InhouseBackup] pg_dump completed, size: ${dumpData.length} bytes`)

      // 4. Calculate checksum of unencrypted data
      const checksum = calculateChecksum(dumpData)

      // 5. Encrypt with envelope encryption
      const {
        encryptedData,
        encryptedDataKey,
        dataKeyIv,
        encryptionIv,
      } = encryptWithEnvelope(dumpData)

      // 6. Upload to R2
      console.log(`[InhouseBackup] Uploading to R2: ${r2Key}`)
      const uploadCommand = new PutObjectCommand({
        Bucket: R2_BACKUP_BUCKET,
        Key: r2Key,
        Body: encryptedData,
        ContentType: 'application/octet-stream',
        Metadata: {
          'x-backup-id': backupId,
          'x-project-id': projectId,
          'x-schema-name': schemaName,
          'x-checksum': checksum,
        },
      })
      await s3Client.send(uploadCommand)

      // 7. Update backup record with encryption metadata
      await pool.query(
        `UPDATE inhouse_backups SET
          size_bytes = $1,
          checksum_sha256 = $2,
          encrypted_data_key = $3,
          data_key_iv = $4,
          encryption_iv = $5,
          status = 'completed',
          completed_at = NOW()
        WHERE id = $6`,
        [
          encryptedData.length,
          checksum,
          encryptedDataKey.toString('base64'),
          dataKeyIv.toString('base64'),
          encryptionIv.toString('base64'),
          backupId,
        ]
      )

      // 8. Log in audit
      await pool.query(
        `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_type, details)
         VALUES ($1, $2, 'backup_completed', $3, $4)`,
        [
          projectId,
          backupId,
          createdBy,
          JSON.stringify({
            schemaName,
            sizeBytes: encryptedData.length,
            format,
            reason,
          }),
        ]
      )

      // 9. Return metadata
      const metadataResult = await pool.query(
        `SELECT * FROM inhouse_backups WHERE id = $1`,
        [backupId]
      )

      return rowToMetadata(metadataResult.rows[0])

    } catch (error) {
      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await pool.query(
        `UPDATE inhouse_backups SET status = 'failed', error = $1 WHERE id = $2`,
        [errorMessage, backupId]
      )

      // Log failure
      await pool.query(
        `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_type, details)
         VALUES ($1, $2, 'backup_failed', $3, $4)`,
        [projectId, backupId, createdBy, JSON.stringify({ error: errorMessage })]
      )

      throw error
    }
  }

  /**
   * List backups for a project
   */
  async listBackups(projectId: string, options: ListBackupsOptions = {}): Promise<ListBackupsResult> {
    const pool = getPool()
    const { status, limit = 50, offset = 0 } = options

    const params: any[] = [projectId]
    let whereClause = 'WHERE project_id = $1'

    if (status) {
      params.push(status)
      whereClause += ` AND status = $${params.length}`
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM inhouse_backups ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0].count, 10)

    // Get backups
    params.push(limit, offset)
    const backupsResult = await pool.query(
      `SELECT * FROM inhouse_backups ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    return {
      backups: backupsResult.rows.map(rowToMetadata),
      total,
    }
  }

  /**
   * Get a single backup by ID
   */
  async getBackup(backupId: string): Promise<BackupMetadata | null> {
    const pool = getPool()

    const result = await pool.query(
      `SELECT * FROM inhouse_backups WHERE id = $1`,
      [backupId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return rowToMetadata(result.rows[0])
  }

  /**
   * Get decrypted backup data for streaming download
   * SECURITY: Returns buffer to be streamed directly by route handler.
   * Never stores plaintext backup in R2 or other persistent storage.
   */
  async getDecryptedBackup(
    backupId: string,
    userId?: string
  ): Promise<{ data: Buffer; filename: string; checksum: string } | null> {
    if (!s3Client) {
      throw new Error('Backup service not configured (R2 credentials missing)')
    }

    const pool = getPool()

    // 1. Get backup metadata
    const result = await pool.query(
      `SELECT * FROM inhouse_backups WHERE id = $1 AND status = 'completed'`,
      [backupId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const backup = result.rows[0]

    // 2. Download encrypted backup from R2
    const getCommand = new GetObjectCommand({
      Bucket: backup.r2_bucket,
      Key: backup.r2_key,
    })
    const response = await s3Client.send(getCommand)

    if (!response.Body) {
      throw new Error('Failed to download backup from R2')
    }

    const encryptedData = await streamToBuffer(response.Body as Readable)

    // 3. Decrypt the backup
    const decryptedData = decryptWithEnvelope(
      encryptedData,
      Buffer.from(backup.encrypted_data_key, 'base64'),
      Buffer.from(backup.data_key_iv, 'base64'),
      Buffer.from(backup.encryption_iv, 'base64')
    )

    // 4. Verify checksum
    const checksum = calculateChecksum(decryptedData)
    if (checksum !== backup.checksum_sha256) {
      throw new Error('Backup checksum verification failed')
    }

    // 5. Update download tracking
    await pool.query(
      `UPDATE inhouse_backups SET downloaded_at = NOW(), downloaded_by = $1 WHERE id = $2`,
      [userId || null, backupId]
    )

    // 6. Log in audit
    await pool.query(
      `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
       VALUES ($1, $2, 'backup_downloaded', $3, $4, $5)`,
      [
        backup.project_id,
        backupId,
        userId || null,
        userId ? 'user' : 'system',
        JSON.stringify({ method: 'stream' }),
      ]
    )

    const filename = `${backup.schema_name}-${backup.id}.dump`
    return { data: decryptedData, filename, checksum }
  }

  /**
   * @deprecated Use getDecryptedBackup() with streaming route instead.
   * This method uploads plaintext to R2 which is a security risk.
   */
  async getDownloadUrl(
    backupId: string,
    userId?: string
  ): Promise<{ url: string; expiresAt: string } | null> {
    // For backwards compatibility, call the new method and provide a warning
    console.warn('[InhouseBackup] getDownloadUrl is deprecated. Use streaming download route with getDecryptedBackup() instead.')

    const result = await this.getDecryptedBackup(backupId, userId)
    if (!result) {
      return null
    }

    // Return a placeholder - the route should use streaming instead
    return {
      url: `/v1/inhouse/projects/PLACEHOLDER/backups/${backupId}/download/stream`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string, actorId?: string): Promise<boolean> {
    if (!s3Client) {
      throw new Error('Backup service not configured (R2 credentials missing)')
    }

    const pool = getPool()

    // 1. Get backup metadata
    const result = await pool.query(
      `SELECT * FROM inhouse_backups WHERE id = $1 AND status != 'deleted'`,
      [backupId]
    )

    if (result.rows.length === 0) {
      return false
    }

    const backup = result.rows[0]

    try {
      // 2. Delete from R2
      const deleteCommand = new DeleteObjectCommand({
        Bucket: backup.r2_bucket,
        Key: backup.r2_key,
      })
      await s3Client.send(deleteCommand)

      // 3. Update status
      await pool.query(
        `UPDATE inhouse_backups SET status = 'deleted' WHERE id = $1`,
        [backupId]
      )

      // 4. Log in audit
      await pool.query(
        `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
         VALUES ($1, $2, 'backup_deleted', $3, $4, $5)`,
        [
          backup.project_id,
          backupId,
          actorId || null,
          actorId ? 'user' : 'system',
          JSON.stringify({ reason: 'manual_deletion' }),
        ]
      )

      return true
    } catch (error) {
      console.error(`[InhouseBackup] Failed to delete backup ${backupId}:`, error)
      return false
    }
  }

  /**
   * Cleanup expired backups (retention policy)
   */
  async cleanupExpiredBackups(): Promise<{ deleted: number; failed: number }> {
    if (!s3Client) {
      throw new Error('Backup service not configured (R2 credentials missing)')
    }

    const pool = getPool()
    let deleted = 0
    let failed = 0

    // Find expired backups
    const result = await pool.query(
      `SELECT id, r2_bucket, r2_key, project_id FROM inhouse_backups
       WHERE retention_expires_at < NOW() AND status = 'completed'`
    )

    console.log(`[InhouseBackup] Found ${result.rows.length} expired backups to cleanup`)

    for (const backup of result.rows) {
      try {
        // Delete from R2
        const deleteCommand = new DeleteObjectCommand({
          Bucket: backup.r2_bucket,
          Key: backup.r2_key,
        })
        await s3Client.send(deleteCommand)

        // Update status
        await pool.query(
          `UPDATE inhouse_backups SET status = 'deleted' WHERE id = $1`,
          [backup.id]
        )

        // Log
        await pool.query(
          `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_type, details)
           VALUES ($1, $2, 'backup_deleted', 'system', $3)`,
          [backup.project_id, backup.id, JSON.stringify({ reason: 'retention_expired' })]
        )

        deleted++
      } catch (error) {
        console.error(`[InhouseBackup] Failed to cleanup backup ${backup.id}:`, error)
        failed++
      }
    }

    console.log(`[InhouseBackup] Cleanup complete: ${deleted} deleted, ${failed} failed`)
    return { deleted, failed }
  }

  /**
   * Run daily backups for all Easy Mode projects
   */
  async runDailyBackups(): Promise<{ success: number; failed: number; skipped: number }> {
    const pool = getPool()
    let success = 0
    let failed = 0
    let skipped = 0

    // Find projects without today's backup
    const result = await pool.query(`
      SELECT p.id, p.name, p.inhouse_schema_name
      FROM projects p
      WHERE p.infra_mode = 'easy'
        AND p.archived_at IS NULL
        AND p.inhouse_schema_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM inhouse_backups b
          WHERE b.project_id = p.id
            AND b.reason = 'daily'
            AND DATE(b.created_at) = CURRENT_DATE
            AND b.status IN ('pending', 'in_progress', 'completed')
        )
    `)

    console.log(`[InhouseBackup] Starting daily backups for ${result.rows.length} projects`)

    for (const project of result.rows) {
      try {
        // Check if project schema actually exists
        const schemaCheck = await pool.query(
          `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
          [project.inhouse_schema_name]
        )

        if (schemaCheck.rows.length === 0) {
          console.log(`[InhouseBackup] Skipping ${project.id} - schema ${project.inhouse_schema_name} does not exist`)
          skipped++
          continue
        }

        console.log(`[InhouseBackup] Creating daily backup for ${project.name} (${project.id})`)
        await this.createBackup(project.id, {
          reason: 'daily',
          createdBy: 'system',
          format: 'custom',
        })
        success++
      } catch (error) {
        console.error(`[InhouseBackup] Failed to backup ${project.id}:`, error)
        failed++
        // Continue with other projects
      }
    }

    console.log(`[InhouseBackup] Daily backups complete: ${success} success, ${failed} failed, ${skipped} skipped`)
    return { success, failed, skipped }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let instance: InhouseBackupService | null = null

export function getInhouseBackupService(): InhouseBackupService {
  if (!instance) {
    instance = new InhouseBackupService()
  }
  return instance
}
