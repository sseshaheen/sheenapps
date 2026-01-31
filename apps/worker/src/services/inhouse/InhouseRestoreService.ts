/**
 * Inhouse Restore Service
 *
 * Schema-swap restore for Easy Mode project databases.
 * Uses atomic schema swapping to safely restore backups with rollback capability.
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { spawn } from 'child_process'
import { createDecipheriv, createHash } from 'crypto'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { getPool, getClient } from '../database'
import { getInhouseBackupService, BackupMetadata } from './InhouseBackupService'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BACKUP_BUCKET = process.env.R2_BACKUP_BUCKET || 'sheenapps-backups'

// Database connection for pg_restore
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

export type RestoreStatus =
  | 'pending'
  | 'downloading'
  | 'creating_pre_restore_backup'
  | 'restoring'
  | 'validating'
  | 'swapping'
  | 'completed'
  | 'failed'
  | 'rolled_back'

export type InitiatedByType = 'user' | 'admin' | 'system'

export interface RestoreMetadata {
  id: string
  projectId: string
  backupId: string
  status: RestoreStatus
  initiatedBy: string
  initiatedByType: InitiatedByType
  tempSchemaName: string | null
  oldSchemaName: string | null
  preRestoreBackupId: string | null
  validationResults: ValidationResults | null
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  oldSchemaCleanupAt: string | null
  oldSchemaDroppedAt: string | null
}

export interface ValidationResults {
  tableCount: number
  expectedTableCount?: number
  keyTablesExist: boolean
  missingKeyTables: string[]
  sampleRowCounts: Record<string, number>
  validationPassed: boolean
  validationErrors: string[]
}

export interface RestoreStatusResult {
  restore: RestoreMetadata
  backup: BackupMetadata | null
}

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

/**
 * Get the master key from environment variable.
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
 * Decrypt data using envelope encryption.
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
 * Run pg_restore via child_process.spawn
 * Note: Restores into the schema name contained in the dump file.
 * For schema-swap restore, use rename-before-restore pattern:
 * 1. Rename current schema to old_xxx
 * 2. pg_restore (restores into original schema name, now free)
 * 3. Validate
 * 4. Keep old_xxx for rollback window
 */
function runPgRestore(dumpData: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '--no-owner',
      '--no-acl',
      '--single-transaction',
    ]

    const env = {
      ...process.env,
      PGPASSWORD: DB_PASSWORD,
    }

    const pgRestore = spawn('pg_restore', args, { env })

    let errorOutput = ''

    pgRestore.stdin.write(dumpData)
    pgRestore.stdin.end()

    pgRestore.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString()
    })

    pgRestore.on('error', (err) => {
      reject(new Error(`pg_restore spawn error: ${err.message}`))
    })

    pgRestore.on('close', (code) => {
      if (code !== 0) {
        // pg_restore returns non-zero for warnings too, check for actual errors
        const hasErrors = errorOutput.includes('ERROR:') || errorOutput.includes('FATAL:')
        if (hasErrors) {
          reject(new Error(`pg_restore failed: ${errorOutput}`))
          return
        }
        console.log(`[InhouseRestore] pg_restore exited with code ${code}, stderr: ${errorOutput}`)
      }
      resolve()
    })

    // Set timeout (10 minutes max)
    const timeout = setTimeout(() => {
      pgRestore.kill('SIGTERM')
      reject(new Error('pg_restore timeout (10 minutes exceeded)'))
    }, 10 * 60 * 1000)

    pgRestore.on('close', () => {
      clearTimeout(timeout)
    })
  })
}

/**
 * Generate a stable advisory lock key from project ID
 */
function projectLockKey(projectId: string): number {
  const hex = createHash('sha256').update(projectId).digest('hex').slice(0, 8)
  return parseInt(hex, 16) | 0 // Convert to int32
}

/**
 * Map database row to RestoreMetadata
 */
function rowToMetadata(row: any): RestoreMetadata {
  return {
    id: row.id,
    projectId: row.project_id,
    backupId: row.backup_id,
    status: row.status,
    initiatedBy: row.initiated_by,
    initiatedByType: row.initiated_by_type,
    tempSchemaName: row.temp_schema_name || null,
    oldSchemaName: row.old_schema_name || null,
    preRestoreBackupId: row.pre_restore_backup_id || null,
    validationResults: row.validation_results || null,
    error: row.error || null,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    startedAt: row.started_at?.toISOString?.() || row.started_at || null,
    completedAt: row.completed_at?.toISOString?.() || row.completed_at || null,
    oldSchemaCleanupAt: row.old_schema_cleanup_at?.toISOString?.() || row.old_schema_cleanup_at || null,
    oldSchemaDroppedAt: row.old_schema_dropped_at?.toISOString?.() || row.old_schema_dropped_at || null,
  }
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class InhouseRestoreService {
  /**
   * Initiate a restore from a backup
   * Creates restore record, downloads backup, creates pre-restore backup
   */
  async initiateRestore(
    backupId: string,
    initiatedBy: string,
    initiatedByType: InitiatedByType
  ): Promise<string> {
    if (!s3Client) {
      throw new Error('Restore service not configured (R2 credentials missing)')
    }

    const pool = getPool()
    const backupService = getInhouseBackupService()

    // 1. Get backup metadata
    const backup = await backupService.getBackup(backupId)
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`)
    }

    if (backup.status !== 'completed') {
      throw new Error(`Backup ${backupId} is not in completed status`)
    }

    // 2. Verify project exists
    const projectResult = await pool.query(
      `SELECT id, inhouse_schema_name FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
      [backup.projectId]
    )

    if (projectResult.rows.length === 0) {
      throw new Error(`Easy Mode project not found: ${backup.projectId}`)
    }

    const currentSchemaName = projectResult.rows[0].inhouse_schema_name
    if (!currentSchemaName) {
      throw new Error(`Project ${backup.projectId} does not have a schema name`)
    }

    // 3. Create restore record
    // The partial unique index uq_inhouse_restores_inflight prevents concurrent restores
    let restoreResult
    try {
      restoreResult = await pool.query(
        `INSERT INTO inhouse_restores (
          project_id, backup_id, status, initiated_by, initiated_by_type
        ) VALUES ($1, $2, 'pending', $3, $4)
        RETURNING id`,
        [backup.projectId, backupId, initiatedBy, initiatedByType]
      )
    } catch (error: any) {
      // Check for unique constraint violation (concurrent restore in progress)
      if (error.code === '23505' && error.constraint?.includes('inflight')) {
        const restoreError = new Error('A restore is already in progress for this project') as any
        restoreError.code = 'RESTORE_ALREADY_RUNNING'
        restoreError.statusCode = 409
        throw restoreError
      }
      throw error
    }

    const restoreId = restoreResult.rows[0].id

    try {
      // 5. Update status to downloading
      await pool.query(
        `UPDATE inhouse_restores SET status = 'downloading', started_at = NOW() WHERE id = $1`,
        [restoreId]
      )

      // 6. Download and decrypt backup from R2
      console.log(`[InhouseRestore] Downloading backup ${backupId} from R2`)
      const backupData = await pool.query(
        `SELECT r2_bucket, r2_key, encrypted_data_key, data_key_iv, encryption_iv, checksum_sha256
         FROM inhouse_backups WHERE id = $1`,
        [backupId]
      )

      const backupRow = backupData.rows[0]
      const getCommand = new GetObjectCommand({
        Bucket: backupRow.r2_bucket,
        Key: backupRow.r2_key,
      })
      const response = await s3Client.send(getCommand)

      if (!response.Body) {
        throw new Error('Failed to download backup from R2')
      }

      const encryptedData = await streamToBuffer(response.Body as Readable)

      // Decrypt the backup
      const decryptedData = decryptWithEnvelope(
        encryptedData,
        Buffer.from(backupRow.encrypted_data_key, 'base64'),
        Buffer.from(backupRow.data_key_iv, 'base64'),
        Buffer.from(backupRow.encryption_iv, 'base64')
      )

      // Verify checksum of decrypted data
      if (backupRow.checksum_sha256) {
        const calculatedChecksum = createHash('sha256').update(decryptedData).digest('hex')
        if (calculatedChecksum !== backupRow.checksum_sha256) {
          throw new Error(`Backup checksum mismatch: expected ${backupRow.checksum_sha256}, got ${calculatedChecksum}`)
        }
        console.log(`[InhouseRestore] Checksum verified for backup ${backupId}`)
      } else {
        console.warn(`[InhouseRestore] No checksum available for backup ${backupId} - skipping verification`)
      }

      // Store decrypted data temporarily for executeRestore
      // We'll store it in the restore record as base64 (for small backups)
      // For large backups, this should use a temp file instead
      if (decryptedData.length > 100 * 1024 * 1024) { // 100MB limit
        throw new Error('Backup too large for in-memory restore. Use streaming restore instead.')
      }

      await pool.query(
        `UPDATE inhouse_restores SET
          temp_dump_data = $1,
          status = 'creating_pre_restore_backup'
        WHERE id = $2`,
        [decryptedData.toString('base64'), restoreId]
      )

      // 7. Create pre-restore backup
      console.log(`[InhouseRestore] Creating pre-restore backup for project ${backup.projectId}`)
      const preRestoreBackup = await backupService.createBackup(backup.projectId, {
        reason: 'pre_restore',
        createdBy: initiatedByType,
      })

      await pool.query(
        `UPDATE inhouse_restores SET pre_restore_backup_id = $1 WHERE id = $2`,
        [preRestoreBackup.id, restoreId]
      )

      // 8. Log to audit
      await pool.query(
        `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
         VALUES ($1, $2, 'restore_initiated', $3, $4, $5)`,
        [
          backup.projectId,
          backupId,
          initiatedBy,
          initiatedByType,
          JSON.stringify({
            restoreId,
            preRestoreBackupId: preRestoreBackup.id,
          }),
        ]
      )

      return restoreId

    } catch (error) {
      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await pool.query(
        `UPDATE inhouse_restores SET status = 'failed', error = $1 WHERE id = $2`,
        [errorMessage, restoreId]
      )

      // Log failure
      await pool.query(
        `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
         VALUES ($1, $2, 'restore_failed', $3, $4, $5)`,
        [backup.projectId, backupId, initiatedBy, initiatedByType, JSON.stringify({ error: errorMessage, phase: 'initiate' })]
      )

      throw error
    }
  }

  /**
   * Execute the restore process
   * Uses rename-before-restore pattern:
   * 1. Acquire advisory lock (prevent concurrent restores)
   * 2. Rename current schema to old_xxx
   * 3. pg_restore (restores into original schema name, now free)
   * 4. Validate the restored schema
   * 5. Keep old_xxx for rollback window (24 hours)
   */
  async executeRestore(restoreId: string): Promise<void> {
    const pool = getPool()

    // 1. Get restore record
    const restoreResult = await pool.query(
      `SELECT * FROM inhouse_restores WHERE id = $1`,
      [restoreId]
    )

    if (restoreResult.rows.length === 0) {
      throw new Error(`Restore not found: ${restoreId}`)
    }

    const restore = restoreResult.rows[0]

    if (!['pending', 'creating_pre_restore_backup'].includes(restore.status)) {
      throw new Error(`Restore ${restoreId} is not ready to execute (status: ${restore.status})`)
    }

    // 2. Get project schema
    const projectResult = await pool.query(
      `SELECT inhouse_schema_name FROM projects WHERE id = $1`,
      [restore.project_id]
    )

    if (projectResult.rows.length === 0) {
      throw new Error(`Project not found: ${restore.project_id}`)
    }

    const currentSchemaName = projectResult.rows[0].inhouse_schema_name
    const oldSchemaName = `old_${Date.now()}`
    const lockKey = projectLockKey(restore.project_id)

    // 3. Acquire advisory lock for this project
    const client = await getClient()
    let lockAcquired = false

    try {
      // Try to acquire lock (non-blocking)
      const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockKey])
      lockAcquired = lockResult.rows[0]?.locked === true

      if (!lockAcquired) {
        throw new Error('Another restore operation is in progress for this project')
      }

      // 4. Update status to restoring
      await pool.query(
        `UPDATE inhouse_restores SET
          status = 'restoring',
          old_schema_name = $1
        WHERE id = $2`,
        [oldSchemaName, restoreId]
      )

      // 5. Get the backup dump data
      console.log(`[InhouseRestore] Preparing to restore into schema ${currentSchemaName}`)
      const dumpDataBase64 = restore.temp_dump_data
      if (!dumpDataBase64) {
        throw new Error('Backup data not found in restore record')
      }
      const dumpData = Buffer.from(dumpDataBase64, 'base64')

      // 6. Rename current schema out of the way (in transaction)
      console.log(`[InhouseRestore] Renaming ${currentSchemaName} -> ${oldSchemaName}`)
      await client.query('BEGIN')
      try {
        await client.query(`ALTER SCHEMA "${currentSchemaName}" RENAME TO "${oldSchemaName}"`)
        await client.query('COMMIT')
      } catch (renameError) {
        await client.query('ROLLBACK')
        throw new Error(`Failed to rename current schema: ${renameError instanceof Error ? renameError.message : 'Unknown error'}`)
      }

      // 7. Run pg_restore (restores into the original schema name, now free)
      console.log(`[InhouseRestore] Running pg_restore to recreate ${currentSchemaName}`)
      try {
        await runPgRestore(dumpData)
      } catch (restoreError) {
        // Restore failed - try to restore original schema name
        console.error(`[InhouseRestore] pg_restore failed, attempting to restore original schema name`)
        try {
          await client.query('BEGIN')
          await client.query(`ALTER SCHEMA "${oldSchemaName}" RENAME TO "${currentSchemaName}"`)
          await client.query('COMMIT')
        } catch (rollbackError) {
          console.error(`[InhouseRestore] Failed to rollback schema rename:`, rollbackError)
        }
        throw restoreError
      }

      // 8. Update status to validating
      await pool.query(
        `UPDATE inhouse_restores SET status = 'validating' WHERE id = $1`,
        [restoreId]
      )

      // 9. Run sanity checks on restored schema
      console.log(`[InhouseRestore] Running validation on ${currentSchemaName}`)
      const validationResults = await this.runValidation(currentSchemaName, oldSchemaName)

      await pool.query(
        `UPDATE inhouse_restores SET validation_results = $1 WHERE id = $2`,
        [JSON.stringify(validationResults), restoreId]
      )

      if (!validationResults.validationPassed) {
        // Validation failed - rollback to old schema
        console.error(`[InhouseRestore] Validation failed, rolling back`)
        const failedSchemaName = `failed_${Date.now()}`
        try {
          await client.query('BEGIN')
          await client.query(`ALTER SCHEMA "${currentSchemaName}" RENAME TO "${failedSchemaName}"`)
          await client.query(`ALTER SCHEMA "${oldSchemaName}" RENAME TO "${currentSchemaName}"`)
          await client.query('COMMIT')
          // Drop the failed schema
          await pool.query(`DROP SCHEMA IF EXISTS "${failedSchemaName}" CASCADE`)
        } catch (rollbackError) {
          await client.query('ROLLBACK').catch(() => {})
          console.error(`[InhouseRestore] Failed to rollback after validation failure:`, rollbackError)
        }
        throw new Error(`Validation failed: ${validationResults.validationErrors.join(', ')}`)
      }

      // 10. Set cleanup time (24 hours) and complete
      const cleanupAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

      await pool.query(
        `UPDATE inhouse_restores SET
          status = 'completed',
          completed_at = NOW(),
          old_schema_cleanup_at = $1,
          temp_dump_data = NULL
        WHERE id = $2`,
        [cleanupAt, restoreId]
      )

      // 11. Log to audit
      await pool.query(
        `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
         VALUES ($1, $2, 'restore_completed', $3, $4, $5)`,
        [
          restore.project_id,
          restore.backup_id,
          restore.initiated_by,
          restore.initiated_by_type,
          JSON.stringify({
            restoreId,
            oldSchemaName,
            cleanupAt: cleanupAt.toISOString(),
            validationResults,
          }),
        ]
      )

      console.log(`[InhouseRestore] Restore ${restoreId} completed successfully`)

    } catch (error) {
      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      try {
        await pool.query(
          `UPDATE inhouse_restores SET
            status = 'failed',
            error = $1,
            temp_dump_data = NULL
          WHERE id = $2`,
          [errorMessage, restoreId]
        )

        // Log failure
        await pool.query(
          `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
           VALUES ($1, $2, 'restore_failed', $3, $4, $5)`,
          [
            restore.project_id,
            restore.backup_id,
            restore.initiated_by,
            restore.initiated_by_type,
            JSON.stringify({ error: errorMessage, phase: 'execute' }),
          ]
        )
      } catch (dbError) {
        console.error(`[InhouseRestore] Failed to update failure status:`, dbError)
      }

      throw error
    } finally {
      // Always release advisory lock
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {})
      }
      client.release()
    }
  }

  /**
   * Run validation on restored schema
   */
  private async runValidation(
    restoredSchema: string,
    originalSchema: string
  ): Promise<ValidationResults> {
    const pool = getPool()
    const validationErrors: string[] = []

    // Key tables that should exist in any Easy Mode schema
    const keyTables = ['users', 'sessions', 'app_data']

    // 1. Count tables in restored schema
    const tableCountResult = await pool.query(
      `SELECT COUNT(*) FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [restoredSchema]
    )
    const tableCount = parseInt(tableCountResult.rows[0].count, 10)

    // 2. Count tables in original schema for comparison
    const originalTableCountResult = await pool.query(
      `SELECT COUNT(*) FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [originalSchema]
    )
    const expectedTableCount = parseInt(originalTableCountResult.rows[0].count, 10)

    // 3. Check key tables exist
    const missingKeyTables: string[] = []
    for (const table of keyTables) {
      const tableExists = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2`,
        [restoredSchema, table]
      )
      if (tableExists.rows.length === 0) {
        missingKeyTables.push(table)
      }
    }

    // Note: Not all Easy Mode projects have all key tables, so only warn
    const keyTablesExist = missingKeyTables.length === 0

    // 4. Sample row counts
    const sampleRowCounts: Record<string, number> = {}
    const tablesResult = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       LIMIT 10`,
      [restoredSchema]
    )

    for (const row of tablesResult.rows) {
      const tableName = row.table_name
      try {
        const countResult = await pool.query(
          `SELECT COUNT(*) FROM "${restoredSchema}"."${tableName}"`
        )
        sampleRowCounts[tableName] = parseInt(countResult.rows[0].count, 10)
      } catch (countError) {
        sampleRowCounts[tableName] = -1 // Error counting
      }
    }

    // 5. Validation checks
    if (tableCount === 0) {
      validationErrors.push('No tables found in restored schema')
    }

    if (tableCount < expectedTableCount * 0.5) {
      validationErrors.push(
        `Table count (${tableCount}) is less than 50% of expected (${expectedTableCount})`
      )
    }

    const validationPassed = validationErrors.length === 0

    return {
      tableCount,
      expectedTableCount,
      keyTablesExist,
      missingKeyTables,
      sampleRowCounts,
      validationPassed,
      validationErrors,
    }
  }

  /**
   * Rollback a restore - swap back to old schema
   */
  async rollbackRestore(restoreId: string): Promise<void> {
    const pool = getPool()

    // 1. Get restore record
    const restoreResult = await pool.query(
      `SELECT * FROM inhouse_restores WHERE id = $1`,
      [restoreId]
    )

    if (restoreResult.rows.length === 0) {
      throw new Error(`Restore not found: ${restoreId}`)
    }

    const restore = restoreResult.rows[0]

    if (restore.status !== 'completed') {
      throw new Error(`Cannot rollback restore with status: ${restore.status}`)
    }

    if (!restore.old_schema_name) {
      throw new Error('Old schema name not found - rollback not possible')
    }

    if (restore.old_schema_dropped_at) {
      throw new Error('Old schema has already been dropped - rollback not possible')
    }

    // 2. Get current schema name
    const projectResult = await pool.query(
      `SELECT inhouse_schema_name FROM projects WHERE id = $1`,
      [restore.project_id]
    )

    if (projectResult.rows.length === 0) {
      throw new Error(`Project not found: ${restore.project_id}`)
    }

    const currentSchemaName = projectResult.rows[0].inhouse_schema_name
    const failedSchemaName = `failed_${Date.now()}`

    // 3. Check old schema still exists
    const oldSchemaExists = await pool.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [restore.old_schema_name]
    )

    if (oldSchemaExists.rows.length === 0) {
      throw new Error(`Old schema ${restore.old_schema_name} no longer exists`)
    }

    // 4. Atomic schema swap back
    console.log(`[InhouseRestore] Rolling back: ${currentSchemaName} -> ${failedSchemaName}, ${restore.old_schema_name} -> ${currentSchemaName}`)
    const client = await getClient()

    try {
      await client.query('BEGIN')

      // Rename current (restored) schema to failed
      await client.query(`ALTER SCHEMA "${currentSchemaName}" RENAME TO "${failedSchemaName}"`)

      // Rename old schema back to current
      await client.query(`ALTER SCHEMA "${restore.old_schema_name}" RENAME TO "${currentSchemaName}"`)

      await client.query('COMMIT')
    } catch (swapError) {
      await client.query('ROLLBACK')
      throw swapError
    } finally {
      client.release()
    }

    // 5. Update restore status
    await pool.query(
      `UPDATE inhouse_restores SET status = 'rolled_back' WHERE id = $1`,
      [restoreId]
    )

    // 6. Cleanup failed schema
    try {
      await pool.query(`DROP SCHEMA IF EXISTS "${failedSchemaName}" CASCADE`)
    } catch (cleanupError) {
      console.error(`[InhouseRestore] Failed to cleanup failed schema ${failedSchemaName}:`, cleanupError)
    }

    // 7. Log to audit
    await pool.query(
      `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_id, actor_type, details)
       VALUES ($1, $2, 'restore_rolled_back', $3, $4, $5)`,
      [
        restore.project_id,
        restore.backup_id,
        restore.initiated_by,
        restore.initiated_by_type,
        JSON.stringify({ restoreId, failedSchemaName }),
      ]
    )

    console.log(`[InhouseRestore] Restore ${restoreId} rolled back successfully`)
  }

  /**
   * Cleanup old schemas from completed restores
   */
  async cleanupOldSchemas(): Promise<{ cleaned: number; failed: number }> {
    const pool = getPool()
    let cleaned = 0
    let failed = 0

    // Find restores with old schemas ready for cleanup
    const result = await pool.query(
      `SELECT id, project_id, backup_id, old_schema_name, initiated_by, initiated_by_type
       FROM inhouse_restores
       WHERE old_schema_cleanup_at < NOW()
         AND old_schema_dropped_at IS NULL
         AND status = 'completed'
         AND old_schema_name IS NOT NULL`
    )

    console.log(`[InhouseRestore] Found ${result.rows.length} old schemas to cleanup`)

    for (const restore of result.rows) {
      try {
        // Check if schema still exists
        const schemaExists = await pool.query(
          `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
          [restore.old_schema_name]
        )

        if (schemaExists.rows.length > 0) {
          // Drop the old schema
          await pool.query(`DROP SCHEMA IF EXISTS "${restore.old_schema_name}" CASCADE`)
          console.log(`[InhouseRestore] Dropped old schema ${restore.old_schema_name}`)
        }

        // Update restore record
        await pool.query(
          `UPDATE inhouse_restores SET old_schema_dropped_at = NOW() WHERE id = $1`,
          [restore.id]
        )

        // Log to audit
        await pool.query(
          `INSERT INTO inhouse_backup_audit_log (project_id, backup_id, action, actor_type, details)
           VALUES ($1, $2, 'old_schema_dropped', 'system', $3)`,
          [
            restore.project_id,
            restore.backup_id,
            JSON.stringify({ restoreId: restore.id, schemaName: restore.old_schema_name }),
          ]
        )

        cleaned++
      } catch (error) {
        console.error(`[InhouseRestore] Failed to cleanup old schema for restore ${restore.id}:`, error)
        failed++
      }
    }

    console.log(`[InhouseRestore] Cleanup complete: ${cleaned} cleaned, ${failed} failed`)
    return { cleaned, failed }
  }

  /**
   * Get restore status with details
   */
  async getRestoreStatus(restoreId: string): Promise<RestoreStatusResult | null> {
    const pool = getPool()
    const backupService = getInhouseBackupService()

    const result = await pool.query(
      `SELECT * FROM inhouse_restores WHERE id = $1`,
      [restoreId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const restore = rowToMetadata(result.rows[0])
    const backup = await backupService.getBackup(restore.backupId)

    return { restore, backup }
  }

  /**
   * List restores for a project
   */
  async listRestores(
    projectId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ restores: RestoreMetadata[]; total: number }> {
    const pool = getPool()
    const { limit = 20, offset = 0 } = options

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM inhouse_restores WHERE project_id = $1`,
      [projectId]
    )
    const total = parseInt(countResult.rows[0].count, 10)

    // Get restores
    const result = await pool.query(
      `SELECT * FROM inhouse_restores
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [projectId, limit, offset]
    )

    return {
      restores: result.rows.map(rowToMetadata),
      total,
    }
  }

  /**
   * Get a single restore by ID
   */
  async getRestore(restoreId: string): Promise<RestoreMetadata | null> {
    const pool = getPool()

    const result = await pool.query(
      `SELECT * FROM inhouse_restores WHERE id = $1`,
      [restoreId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return rowToMetadata(result.rows[0])
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let instance: InhouseRestoreService | null = null

export function getInhouseRestoreService(): InhouseRestoreService {
  if (!instance) {
    instance = new InhouseRestoreService()
  }
  return instance
}
