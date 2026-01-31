import * as crypto from 'crypto';
import { ServerLoggingService } from './serverLoggingService';

/**
 * AES-GCM Token Encryption Service
 * Provides secure encryption/decryption for OAuth tokens using AES-256-GCM
 * Each encrypted value includes random IV and authentication tag
 */

export interface EncryptedToken {
  encrypted: string;    // Hex-encoded encrypted data
  iv: string;          // Hex-encoded initialization vector (96-bit for GCM)
  authTag: string;     // Hex-encoded authentication tag (128-bit)
}

export class TokenEncryptionService {
  private static instance: TokenEncryptionService;
  private readonly encryptionKey: Buffer;
  private readonly loggingService: ServerLoggingService;
  private readonly additionalData = Buffer.from('supabase-oauth-token'); // AAD for GCM

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    
    // Get encryption key from environment
    const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyBase64) {
      throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
    }

    try {
      this.encryptionKey = Buffer.from(keyBase64, 'base64');
      if (this.encryptionKey.length !== 32) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be a 256-bit (32-byte) key encoded as base64');
      }
    } catch (error) {
      throw new Error(`Invalid TOKEN_ENCRYPTION_KEY: ${(error as Error).message}`);
    }
  }

  static getInstance(): TokenEncryptionService {
    if (!TokenEncryptionService.instance) {
      TokenEncryptionService.instance = new TokenEncryptionService();
    }
    return TokenEncryptionService.instance;
  }

  /**
   * Encrypt a plaintext token using AES-256-GCM
   */
  async encryptToken(plaintext: string): Promise<EncryptedToken> {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Invalid plaintext: must be a non-empty string');
    }

    try {
      // Generate random 96-bit IV for GCM (recommended size)
      const iv = crypto.randomBytes(12);
      
      // Create cipher with AES-256-GCM
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      // Set additional authenticated data (AAD)
      cipher.setAAD(this.additionalData);
      
      // Encrypt the plaintext
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      await this.loggingService.logCriticalError(
        'token_encryption_failed',
        error as Error,
        { plaintextLength: plaintext.length }
      );
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Decrypt an encrypted token using AES-256-GCM
   */
  async decryptToken(encryptedToken: EncryptedToken): Promise<string> {
    if (!encryptedToken || !encryptedToken.encrypted || !encryptedToken.iv || !encryptedToken.authTag) {
      throw new Error('Invalid encrypted token: missing required fields (encrypted, iv, authTag)');
    }

    try {
      // Convert hex strings back to buffers
      const iv = Buffer.from(encryptedToken.iv, 'hex');
      const authTag = Buffer.from(encryptedToken.authTag, 'hex');
      
      // Validate IV and auth tag sizes
      if (iv.length !== 12) {
        throw new Error('Invalid IV length: must be 12 bytes (96 bits)');
      }
      if (authTag.length !== 16) {
        throw new Error('Invalid auth tag length: must be 16 bytes (128 bits)');
      }
      
      // Create decipher with AES-256-GCM
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      // Set additional authenticated data (must match encryption)
      decipher.setAAD(this.additionalData);
      
      // Set authentication tag
      decipher.setAuthTag(authTag);
      
      // Decrypt the data
      let decrypted = decipher.update(encryptedToken.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      await this.loggingService.logCriticalError(
        'token_decryption_failed',
        error as Error,
        { 
          hasEncrypted: !!encryptedToken.encrypted,
          hasIv: !!encryptedToken.iv,
          hasAuthTag: !!encryptedToken.authTag,
          ivLength: encryptedToken.iv?.length,
          authTagLength: encryptedToken.authTag?.length
        }
      );
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Encrypt multiple tokens in a batch
   */
  async encryptTokenBatch(tokens: Record<string, string>): Promise<Record<string, EncryptedToken>> {
    const encrypted: Record<string, EncryptedToken> = {};
    
    for (const [key, plaintext] of Object.entries(tokens)) {
      encrypted[key] = await this.encryptToken(plaintext);
    }
    
    return encrypted;
  }

  /**
   * Decrypt multiple tokens in a batch
   */
  async decryptTokenBatch(encryptedTokens: Record<string, EncryptedToken>): Promise<Record<string, string>> {
    const decrypted: Record<string, string> = {};
    
    for (const [key, encryptedToken] of Object.entries(encryptedTokens)) {
      decrypted[key] = await this.decryptToken(encryptedToken);
    }
    
    return decrypted;
  }

  /**
   * Validate that an encrypted token structure is well-formed
   */
  validateEncryptedToken(encryptedToken: any): encryptedToken is EncryptedToken {
    if (!encryptedToken || typeof encryptedToken !== 'object') {
      return false;
    }

    const { encrypted, iv, authTag } = encryptedToken;
    
    // Check that all required fields are present and are hex strings
    if (typeof encrypted !== 'string' || !/^[0-9a-f]*$/i.test(encrypted)) {
      return false;
    }
    if (typeof iv !== 'string' || !/^[0-9a-f]{24}$/i.test(iv)) { // 12 bytes = 24 hex chars
      return false;
    }
    if (typeof authTag !== 'string' || !/^[0-9a-f]{32}$/i.test(authTag)) { // 16 bytes = 32 hex chars
      return false;
    }

    return true;
  }

  /**
   * Generate a new encryption key (for setup/rotation)
   * Returns base64-encoded 256-bit key
   */
  static generateEncryptionKey(): string {
    const key = crypto.randomBytes(32); // 256 bits
    return key.toString('base64');
  }

  /**
   * Test encryption/decryption with a sample payload
   */
  async testEncryption(): Promise<boolean> {
    try {
      const testData = 'test-oauth-token-' + Date.now();
      const encrypted = await this.encryptToken(testData);
      const decrypted = await this.decryptToken(encrypted);
      
      const success = decrypted === testData;
      
      await this.loggingService.logServerEvent(
        'capacity',
        success ? 'info' : 'error',
        `Token encryption test: ${success ? 'PASSED' : 'FAILED'}`,
        { testDataLength: testData.length }
      );
      
      return success;
    } catch (error) {
      await this.loggingService.logCriticalError(
        'token_encryption_test_failed',
        error as Error
      );
      return false;
    }
  }
}

/**
 * Utility functions for working with encrypted tokens in database contexts
 */
export class TokenStorageUtils {
  private static encryptionService = TokenEncryptionService.getInstance();

  /**
   * Prepare tokens for database storage (encrypt and JSON serialize)
   */
  static async prepareForStorage(tokens: {
    access_token: string;
    refresh_token: string;
  }): Promise<{
    access_token_encrypted: string;
    refresh_token_encrypted: string;
  }> {
    const accessTokenEncrypted = await this.encryptionService.encryptToken(tokens.access_token);
    const refreshTokenEncrypted = await this.encryptionService.encryptToken(tokens.refresh_token);

    return {
      access_token_encrypted: JSON.stringify(accessTokenEncrypted),
      refresh_token_encrypted: JSON.stringify(refreshTokenEncrypted)
    };
  }

  /**
   * Retrieve tokens from database storage (deserialize and decrypt)
   */
  static async retrieveFromStorage(storedTokens: {
    access_token_encrypted: string;
    refresh_token_encrypted: string;
  }): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    try {
      const accessTokenEncrypted: EncryptedToken = JSON.parse(storedTokens.access_token_encrypted);
      const refreshTokenEncrypted: EncryptedToken = JSON.parse(storedTokens.refresh_token_encrypted);

      const access_token = await this.encryptionService.decryptToken(accessTokenEncrypted);
      const refresh_token = await this.encryptionService.decryptToken(refreshTokenEncrypted);

      return { access_token, refresh_token };
    } catch (error) {
      throw new Error('Failed to retrieve tokens from storage: invalid format or decryption failed');
    }
  }

  /**
   * Validate that stored token data is properly formatted
   */
  static validateStoredTokenFormat(storedTokens: {
    access_token_encrypted?: string;
    refresh_token_encrypted?: string;
  }): boolean {
    try {
      if (!storedTokens.access_token_encrypted || !storedTokens.refresh_token_encrypted) {
        return false;
      }

      const accessTokenEncrypted = JSON.parse(storedTokens.access_token_encrypted);
      const refreshTokenEncrypted = JSON.parse(storedTokens.refresh_token_encrypted);

      return (
        this.encryptionService.validateEncryptedToken(accessTokenEncrypted) &&
        this.encryptionService.validateEncryptedToken(refreshTokenEncrypted)
      );
    } catch {
      return false;
    }
  }
}