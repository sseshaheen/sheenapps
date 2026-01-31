/**
 * Inhouse Secrets Service
 *
 * Provides decryption functionality for Easy Mode project secrets.
 * Uses AES-256-GCM envelope encryption - the same pattern as secrets-service.ts
 * in sheenappsai.
 *
 * Encryption Pattern:
 * 1. Each secret has a Data Encryption Key (DEK) encrypted with the master key (KEK)
 * 2. The actual secret value is encrypted with the DEK
 * 3. To decrypt: First decrypt DEK using master key, then decrypt value using DEK
 */

import { createDecipheriv } from 'crypto'
import { getPool } from '../database'

// =============================================================================
// TYPES
// =============================================================================

export interface SecretRow {
  name: string
  encrypted_value: Buffer
  encrypted_data_key: Buffer
  encryption_iv: Buffer
  data_key_iv: Buffer
}

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

/**
 * Get the master key from environment variable.
 * The master key is used to encrypt/decrypt the Data Encryption Keys (DEKs).
 */
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
 * Decrypt a secret value using envelope encryption.
 *
 * @param encryptedValue - The encrypted secret value (includes auth tag)
 * @param encryptedDataKey - The encrypted DEK (includes auth tag)
 * @param iv - Initialization vector for the value decryption
 * @param dataKeyIv - Initialization vector for the DEK decryption
 * @returns The decrypted plaintext value
 */
function decryptSecretValue(
  encryptedValue: Buffer,
  encryptedDataKey: Buffer,
  iv: Buffer,
  dataKeyIv: Buffer
): string {
  const masterKey = getMasterKey()

  // Decrypt the data key with the master key
  // Auth tag is the last 16 bytes
  const keyAuthTag = encryptedDataKey.subarray(-16)
  const encryptedKeyData = encryptedDataKey.subarray(0, -16)
  const keyDecipher = createDecipheriv('aes-256-gcm', masterKey, dataKeyIv)
  keyDecipher.setAuthTag(keyAuthTag)
  const dataKey = Buffer.concat([keyDecipher.update(encryptedKeyData), keyDecipher.final()])

  // Decrypt the value with the data key
  // Auth tag is the last 16 bytes
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

export class InhouseSecretsService {
  private projectId: string

  constructor(projectId: string) {
    this.projectId = projectId
  }

  /**
   * Decrypt a single secret by name.
   *
   * @param name - The secret name (e.g., 'stripe_secret_key')
   * @returns The decrypted value, or null if not found
   */
  async decryptSecret(name: string): Promise<string | null> {
    const pool = getPool()

    const result = await pool.query<SecretRow>(
      `SELECT name, encrypted_value, encrypted_data_key, encryption_iv, data_key_iv
       FROM inhouse_secrets
       WHERE project_id = $1
         AND name = $2
         AND status = 'active'`,
      [this.projectId, name]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    try {
      return decryptSecretValue(
        Buffer.from(row.encrypted_value),
        Buffer.from(row.encrypted_data_key),
        Buffer.from(row.encryption_iv),
        Buffer.from(row.data_key_iv)
      )
    } catch (err) {
      console.error('[InhouseSecretsService] Failed to decrypt secret:', name, err)
      throw new Error(`Failed to decrypt secret: ${name}`)
    }
  }

  /**
   * Decrypt multiple secrets by name.
   *
   * @param names - Array of secret names to decrypt
   * @returns Record of secret names to their decrypted values (only includes found secrets)
   */
  async decryptSecrets(names: string[]): Promise<Record<string, string>> {
    if (names.length === 0) {
      return {}
    }

    const pool = getPool()

    const result = await pool.query<SecretRow>(
      `SELECT name, encrypted_value, encrypted_data_key, encryption_iv, data_key_iv
       FROM inhouse_secrets
       WHERE project_id = $1
         AND name = ANY($2)
         AND status = 'active'`,
      [this.projectId, names]
    )

    const secrets: Record<string, string> = {}

    for (const row of result.rows) {
      try {
        secrets[row.name] = decryptSecretValue(
          Buffer.from(row.encrypted_value),
          Buffer.from(row.encrypted_data_key),
          Buffer.from(row.encryption_iv),
          Buffer.from(row.data_key_iv)
        )
      } catch (err) {
        console.error('[InhouseSecretsService] Failed to decrypt secret:', row.name, err)
        // Skip this secret but continue with others
      }
    }

    return secrets
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an InhouseSecretsService instance for a project.
 */
export function getInhouseSecretsService(projectId: string): InhouseSecretsService {
  return new InhouseSecretsService(projectId)
}
