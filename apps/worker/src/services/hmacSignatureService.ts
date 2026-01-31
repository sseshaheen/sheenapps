import * as crypto from 'crypto';
import Redis from 'ioredis';
import { ServerLoggingService } from './serverLoggingService';

/**
 * HMAC Signature Verification Service
 * Implements dual signature rollout (v1 + v2) with anti-replay protection
 * Supports safe migration from v1 to v2 signatures over a configurable period
 */
export interface SignatureValidationResult {
  valid: boolean;
  version: 'v1' | 'v2' | 'both' | 'none';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  v1Result?: {
    valid: boolean;
    signature: string;
    error?: string | undefined;
  } | undefined;
  v2Result?: {
    valid: boolean;
    signature: string;
    canonicalPayload: string;
    error?: string | undefined;
  } | undefined;
  timestamp: {
    valid: boolean;
    value: number;
    skew: number;
    error?: string | undefined;
  };
  nonce: {
    valid: boolean;
    value?: string | undefined;
    cached: boolean;
    error?: string | undefined;
  };
  warnings: string[];
}

export interface SignatureHeaders {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  'x-sheen-signature'?: string | undefined;      // v1 signature
  'x-sheen-sig-v2'?: string | undefined;         // v2 signature
  'x-sheen-timestamp': string;       // Unix timestamp
  'x-sheen-nonce'?: string | undefined;          // Anti-replay nonce (optional for v1)
}

export class HmacSignatureService {
  private static instance: HmacSignatureService;
  private redis: Redis;
  private loggingService: ServerLoggingService;
  private readonly hmacSecret: string;
  private readonly hmacSecretV2: string;
  private readonly timestampTolerance: number = 120; // ±120 seconds
  private readonly nonceTTL: number = 600; // 10 minutes
  private readonly rolloutEndTime: number;
  private readonly enableDualSignature: boolean;
  
  // In-memory nonce cache for single-pod deployments
  private nonceCache = new Map<string, number>();
  private nonceCacheCleanupTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.loggingService = ServerLoggingService.getInstance();
    this.hmacSecret = process.env.SHARED_SECRET || process.env.HMAC_SECRET || 'default-secret-change-me';
    this.hmacSecretV2 = process.env.HMAC_SECRET_V2 || this.hmacSecret; // Fallback to v1 secret
    
    // Configure rollout period (default: 1 week from now)
    const rolloutPeriodMs = parseInt(process.env.HMAC_ROLLOUT_PERIOD_MS || (7 * 24 * 60 * 60 * 1000).toString());
    this.rolloutEndTime = parseInt(process.env.HMAC_ROLLOUT_END_TIME || (Date.now() + rolloutPeriodMs).toString());
    this.enableDualSignature = process.env.ENABLE_DUAL_SIGNATURE !== 'false';
    
    // Start nonce cleanup for in-memory cache
    this.startNonceCacheCleanup();
  }
  
  static getInstance(): HmacSignatureService {
    if (!HmacSignatureService.instance) {
      HmacSignatureService.instance = new HmacSignatureService();
    }
    return HmacSignatureService.instance;
  }

  /**
   * Validate HMAC signature with dual signature support
   * @param payload - Raw request payload (body for POST, query string for GET)
   * @param headers - Signature headers
   * @param method - HTTP method
   * @param path - Request path
   */
  async validateSignature(
    payload: string | Buffer,
    headers: SignatureHeaders,
    method: string,
    path: string
  ): Promise<SignatureValidationResult> {
    const startTime = Date.now();
    const payloadString = typeof payload === 'string' ? payload : payload.toString();
    
    try {
      // Extract and validate timestamp
      const timestampResult = this.validateTimestamp(headers['x-sheen-timestamp']);
      
      // Validate nonce (anti-replay protection)
      const nonceResult = await this.validateNonce(headers['x-sheen-nonce'], timestampResult.value);
      
      // Determine which signatures to validate based on rollout phase
      const shouldValidateV1 = this.shouldValidateV1();
      const shouldValidateV2 = this.shouldValidateV2();
      
      let v1Result: SignatureValidationResult['v1Result'] | undefined;
      let v2Result: SignatureValidationResult['v2Result'] | undefined;
      const warnings: string[] = [];
      
      // Validate v1 signature if present and enabled
      if (headers['x-sheen-signature'] && shouldValidateV1) {
        v1Result = this.validateV1Signature(
          payloadString,
          headers['x-sheen-signature'],
          headers['x-sheen-timestamp']
        );
      } else if (headers['x-sheen-signature'] && !shouldValidateV1) {
        warnings.push('v1 signature provided but validation is disabled (rollout period ended)');
      }
      
      // Validate v2 signature if present and enabled
      if (headers['x-sheen-sig-v2'] && shouldValidateV2) {
        v2Result = this.validateV2Signature(
          payloadString,
          headers['x-sheen-sig-v2'],
          headers['x-sheen-timestamp'],
          method,
          path,
          headers['x-sheen-nonce']
        );
      }
      
      // Determine overall validation result
      const validationResult = this.determineValidationResult(v1Result, v2Result, timestampResult, nonceResult);
      
      // Check for signature mismatches (critical monitoring point)
      if (v1Result && v2Result) {
        if (v1Result.valid !== v2Result.valid) {
          warnings.push(`CRITICAL: v1 and v2 signature validation results differ (v1: ${v1Result.valid}, v2: ${v2Result.valid})`);
          
          await this.loggingService.logCriticalError(
            'signature_version_mismatch',
            `v1 result: ${v1Result.valid}, v2 result: ${v2Result.valid}`,
            {
              method,
              path,
              v1Signature: headers['x-sheen-signature'],
              v2Signature: headers['x-sheen-sig-v2'],
              timestamp: headers['x-sheen-timestamp'],
              nonce: headers['x-sheen-nonce'],
              payloadLength: payloadString.length
            }
          );
        }
      }
      
      // Log validation attempt for monitoring
      await this.logValidationAttempt(validationResult, method, path, startTime);
      
      return {
        ...validationResult,
        warnings
      };
      
    } catch (error) {
      await this.loggingService.logCriticalError(
        'signature_validation_error',
        error as Error,
        { method, path, hasV1: !!headers['x-sheen-signature'], hasV2: !!headers['x-sheen-sig-v2'] }
      );
      
      return {
        valid: false,
        version: 'none',
        timestamp: { valid: false, value: 0, skew: 0, error: 'Validation failed' },
        nonce: { valid: false, cached: false, error: 'Validation failed' },
        warnings: [`Internal signature validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Generate v1 signature for testing/validation
   */
  generateV1Signature(payload: string, timestamp: string): string {
    const message = `${timestamp}${payload}`;
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Generate v2 signature with canonicalization
   */
  generateV2Signature(
    payload: string,
    timestamp: string,
    method: string,
    path: string,
    nonce?: string
  ): { signature: string; canonicalPayload: string } {
    // Parse and sort query parameters for canonicalization
    const [basePath, queryString] = path.split('?');
    let canonicalQuery = '';
    
    if (queryString) {
      const params = new URLSearchParams(queryString);
      const sortedParams = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b));
      canonicalQuery = new URLSearchParams(sortedParams).toString();
    }
    
    const canonicalPath = basePath + (canonicalQuery ? `?${canonicalQuery}` : '');
    
    // Create canonical payload
    const canonicalPayload = [
      method.toUpperCase(),
      canonicalPath,
      timestamp,
      nonce || '',
      payload
    ].join('\n');
    
    const signature = crypto
      .createHmac('sha256', this.hmacSecretV2)
      .update(canonicalPayload)
      .digest('hex');
    
    return { signature, canonicalPayload };
  }

  // ============================================================================
  // PRIVATE VALIDATION METHODS
  // ============================================================================

  private validateTimestamp(timestampStr: string): SignatureValidationResult['timestamp'] {
    try {
      const timestamp = parseInt(timestampStr);
      
      if (isNaN(timestamp)) {
        return { valid: false, value: 0, skew: 0, error: 'Invalid timestamp format' };
      }
      
      const now = Math.floor(Date.now() / 1000);
      const skew = Math.abs(now - timestamp);
      
      if (skew > this.timestampTolerance) {
        return {
          valid: false,
          value: timestamp,
          skew,
          error: `Timestamp skew ${skew}s exceeds tolerance ${this.timestampTolerance}s`
        };
      }
      
      return { valid: true, value: timestamp, skew };
    } catch (error) {
      return { valid: false, value: 0, skew: 0, error: (error as Error).message };
    }
  }

  private async validateNonce(nonce: string | undefined, timestamp: number): Promise<SignatureValidationResult['nonce']> {
    if (!nonce) {
      // Nonce is optional for v1, but recommended for v2
      return { valid: true, cached: false }; // Allow requests without nonce during transition
    }
    
    try {
      // Check if nonce was already used (anti-replay protection)
      const isUsed = await this.isNonceUsed(nonce);
      
      if (isUsed) {
        return {
          valid: false,
          value: nonce,
          cached: true,
          error: 'Nonce has already been used (replay attack detected)'
        };
      }
      
      // Store nonce to prevent reuse
      await this.storeNonce(nonce, timestamp);
      
      return { valid: true, value: nonce, cached: false };
    } catch (error) {
      console.error('[HMAC] Nonce validation error:', error);
      
      // In case of nonce validation failure, allow the request but log the issue
      // This prevents Redis issues from breaking all requests
      return {
        valid: true, // Graceful degradation
        value: nonce,
        cached: false,
        error: `Nonce validation failed: ${(error as Error).message}`
      };
    }
  }

  private validateV1Signature(
    payload: string,
    signature: string,
    timestamp: string
  ): SignatureValidationResult['v1Result'] {
    try {
      const expectedSignature = this.generateV1Signature(payload, timestamp);
      const valid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
      
      return { valid, signature: expectedSignature };
    } catch (error) {
      return {
        valid: false,
        signature: '',
        error: (error as Error).message
      };
    }
  }

  private validateV2Signature(
    payload: string,
    signature: string,
    timestamp: string,
    method: string,
    path: string,
    nonce?: string
  ): SignatureValidationResult['v2Result'] {
    try {
      const { signature: expectedSignature, canonicalPayload } = this.generateV2Signature(
        payload,
        timestamp,
        method,
        path,
        nonce
      );
      
      const valid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
      
      return { valid, signature: expectedSignature, canonicalPayload };
    } catch (error) {
      return {
        valid: false,
        signature: '',
        canonicalPayload: '',
        error: (error as Error).message
      };
    }
  }

  private determineValidationResult(
    v1Result: SignatureValidationResult['v1Result'],
    v2Result: SignatureValidationResult['v2Result'],
    timestampResult: SignatureValidationResult['timestamp'],
    nonceResult: SignatureValidationResult['nonce']
  ): Pick<SignatureValidationResult, 'valid' | 'version' | 'v1Result' | 'v2Result' | 'timestamp' | 'nonce'> {
    // Timestamp and nonce must be valid regardless of signature version
    if (!timestampResult.valid || !nonceResult.valid) {
      return {
        valid: false,
        version: 'none',
        v1Result,
        v2Result,
        timestamp: timestampResult,
        nonce: nonceResult
      };
    }
    
    // Determine which signature validations passed
    const v1Valid = v1Result?.valid || false;
    const v2Valid = v2Result?.valid || false;
    
    let version: SignatureValidationResult['version'];
    let valid: boolean;
    
    if (v1Valid && v2Valid) {
      version = 'both';
      valid = true;
    } else if (v1Valid) {
      version = 'v1';
      valid = true;
    } else if (v2Valid) {
      version = 'v2';
      valid = true;
    } else {
      version = 'none';
      valid = false;
    }
    
    return {
      valid,
      version,
      v1Result,
      v2Result,
      timestamp: timestampResult,
      nonce: nonceResult
    };
  }

  // ============================================================================
  // NONCE MANAGEMENT (ANTI-REPLAY PROTECTION)
  // ============================================================================

  private async isNonceUsed(nonce: string): Promise<boolean> {
    try {
      // Try Redis first for multi-pod deployments
      const redisResult = await this.redis.exists(`nonce:${nonce}`);
      if (redisResult === 1) {
        return true;
      }
      
      // Fallback to in-memory cache for single-pod deployments
      return this.nonceCache.has(nonce);
    } catch (error) {
      console.error('[HMAC] Redis nonce check failed, using memory cache:', error);
      return this.nonceCache.has(nonce);
    }
  }

  private async storeNonce(nonce: string, timestamp: number): Promise<void> {
    try {
      // Store in Redis with TTL
      await this.redis.setex(`nonce:${nonce}`, this.nonceTTL, timestamp.toString());
    } catch (error) {
      console.error('[HMAC] Redis nonce storage failed, using memory cache:', error);
    }
    
    // Always store in memory cache as backup
    this.nonceCache.set(nonce, Date.now());
  }

  private startNonceCacheCleanup(): void {
    if (this.nonceCacheCleanupTimer) {
      clearInterval(this.nonceCacheCleanupTimer);
    }
    
    // Clean up expired nonces every 5 minutes
    this.nonceCacheCleanupTimer = setInterval(() => {
      const cutoff = Date.now() - (this.nonceTTL * 1000);
      
      for (const [nonce, timestamp] of Array.from(this.nonceCache.entries())) {
        if (timestamp < cutoff) {
          this.nonceCache.delete(nonce);
        }
      }
    }, 5 * 60 * 1000);
  }

  // ============================================================================
  // ROLLOUT MANAGEMENT
  // ============================================================================

  private shouldValidateV1(): boolean {
    if (!this.enableDualSignature) return false;
    return Date.now() < this.rolloutEndTime; // Only validate v1 during rollout period
  }

  private shouldValidateV2(): boolean {
    return true; // Always validate v2 (it's the future)
  }

  /**
   * Get rollout status information
   */
  getRolloutStatus(): {
    dualSignatureEnabled: boolean;
    rolloutEndTime: number;
    timeRemaining: number;
    phase: 'rollout' | 'v2-only' | 'disabled';
    acceptsV1: boolean;
    acceptsV2: boolean;
  } {
    const now = Date.now();
    const timeRemaining = Math.max(0, this.rolloutEndTime - now);
    
    let phase: 'rollout' | 'v2-only' | 'disabled';
    if (!this.enableDualSignature) {
      phase = 'disabled';
    } else if (timeRemaining > 0) {
      phase = 'rollout';
    } else {
      phase = 'v2-only';
    }
    
    return {
      dualSignatureEnabled: this.enableDualSignature,
      rolloutEndTime: this.rolloutEndTime,
      timeRemaining,
      phase,
      acceptsV1: this.shouldValidateV1(),
      acceptsV2: this.shouldValidateV2()
    };
  }

  // ============================================================================
  // MONITORING AND LOGGING
  // ============================================================================

  private async logValidationAttempt(
    result: Pick<SignatureValidationResult, 'valid' | 'version' | 'v1Result' | 'v2Result'>,
    method: string,
    path: string,
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;
    
    await this.loggingService.logServerEvent(
      'capacity', // Using capacity log type for now
      result.valid ? 'info' : 'warn',
      `HMAC signature validation: ${result.valid ? 'SUCCESS' : 'FAILED'} (${result.version})`,
      {
        signatureVersion: result.version,
        method,
        path,
        validationResult: result.valid,
        v1Valid: result.v1Result?.valid,
        v2Valid: result.v2Result?.valid,
        durationMs: duration,
        rolloutPhase: this.getRolloutStatus().phase
      }
    );
  }

  /**
   * Get signature validation statistics
   */
  async getValidationStats(hours: number = 24): Promise<{
    totalValidations: number;
    successfulValidations: number;
    failedValidations: number;
    versionDistribution: Record<string, number>;
    averageLatency: number;
    recentFailures: any[];
  }> {
    // This would integrate with actual metrics collection
    // For now, return structure that could be populated from logs
    
    const recentLogs = await this.loggingService.getRecentLogs(1000, 'capacity');
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    const signatureLogs = recentLogs.filter(log => 
      log.message.includes('HMAC signature validation') && 
      log.timestamp >= cutoffTime
    );
    
    const stats = {
      totalValidations: signatureLogs.length,
      successfulValidations: signatureLogs.filter(log => log.message.includes('SUCCESS')).length,
      failedValidations: signatureLogs.filter(log => log.message.includes('FAILED')).length,
      versionDistribution: {} as Record<string, number>,
      averageLatency: 0,
      recentFailures: signatureLogs
        .filter(log => log.message.includes('FAILED'))
        .slice(0, 10)
        .map(log => ({
          timestamp: new Date(log.timestamp).toISOString(),
          method: log.metadata.method,
          path: log.metadata.path,
          version: log.metadata.signatureVersion,
          serverId: log.serverId
        }))
    };
    
    // Calculate version distribution
    signatureLogs.forEach(log => {
      const version = log.metadata.signatureVersion || 'unknown';
      stats.versionDistribution[version] = (stats.versionDistribution[version] || 0) + 1;
    });
    
    // Calculate average latency
    const latencies = signatureLogs
      .map(log => log.metadata.durationMs)
      .filter(Boolean);
    
    if (latencies.length > 0) {
      stats.averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    }
    
    return stats;
  }
}