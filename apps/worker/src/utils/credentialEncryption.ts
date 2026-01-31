/**
 * Credential Encryption Utility
 *
 * AES-256-GCM encryption/decryption for sensitive credentials.
 * Used by InhouseConnectorService (OAuth tokens) and InhouseDomainsService (CF API tokens).
 */

import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.CONNECTOR_ENCRYPTION_KEY || ''
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('CONNECTOR_ENCRYPTION_KEY environment variable is not set')
  }
  // Key should be 32 bytes for AES-256
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
}

export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Combine encrypted data with auth tag
  return {
    encrypted: encrypted + ':' + authTag.toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getEncryptionKey()
  const ivBuffer = Buffer.from(iv, 'base64')

  const [encryptedData, authTagBase64] = encrypted.split(':')
  if (!encryptedData || !authTagBase64) {
    throw new Error('Invalid encrypted data format')
  }

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, ivBuffer)
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'))

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
