import { ServerLoggingService } from '../services/serverLoggingService';

/**
 * URL Validation Utility
 * Prevents open redirect attacks by validating redirect URLs
 */

export interface UrlValidationResult {
  valid: boolean;
  safeUrl: string;
  reason?: string;
  blocked?: boolean;
}

export class UrlValidator {
  private static instance: UrlValidator;
  private loggingService: ServerLoggingService;
  
  // Allowed origins for redirects
  private readonly ALLOWED_ORIGINS = [
    'https://sheenapps.com',
    'https://www.sheenapps.com',
    ...(process.env.NODE_ENV === 'development' ? [
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ] : [])
  ];

  // Default safe URL to redirect to if validation fails
  private readonly DEFAULT_SAFE_URL = '/dashboard';

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): UrlValidator {
    if (!UrlValidator.instance) {
      UrlValidator.instance = new UrlValidator();
    }
    return UrlValidator.instance;
  }

  /**
   * Validate a redirect URL for security
   */
  async validateRedirectUrl(
    nextUrl: string,
    context: string = 'unknown',
    userId?: string,
    projectId?: string
  ): Promise<UrlValidationResult> {
    try {
      // Handle empty or null URLs
      if (!nextUrl || typeof nextUrl !== 'string') {
        await this.logValidation('empty_url', context, nextUrl, false, userId, projectId);
        return {
          valid: false,
          safeUrl: this.DEFAULT_SAFE_URL,
          reason: 'Empty or invalid URL'
        };
      }

      // Allow relative URLs (most common and safest case)
      if (this.isRelativeUrl(nextUrl)) {
        // Additional validation for relative URLs
        if (this.isValidRelativeUrl(nextUrl)) {
          await this.logValidation('relative_url_allowed', context, nextUrl, true, userId, projectId);
          return {
            valid: true,
            safeUrl: nextUrl
          };
        } else {
          await this.logValidation('relative_url_blocked', context, nextUrl, false, userId, projectId);
          return {
            valid: false,
            safeUrl: this.DEFAULT_SAFE_URL,
            reason: 'Invalid relative URL format',
            blocked: true
          };
        }
      }

      // Parse absolute URLs
      const url = new URL(nextUrl);

      // Check against allowlist
      if (this.ALLOWED_ORIGINS.includes(url.origin)) {
        await this.logValidation('absolute_url_allowed', context, nextUrl, true, userId, projectId);
        return {
          valid: true,
          safeUrl: nextUrl
        };
      }

      // Block external redirects
      await this.logValidation('external_redirect_blocked', context, nextUrl, false, userId, projectId, {
        blockedOrigin: url.origin,
        allowedOrigins: this.ALLOWED_ORIGINS
      });

      return {
        valid: false,
        safeUrl: this.DEFAULT_SAFE_URL,
        reason: `External redirect blocked: ${url.origin}`,
        blocked: true
      };

    } catch (error) {
      // Invalid URL format
      await this.logValidation('invalid_url_format', context, nextUrl, false, userId, projectId, {
        error: (error as Error).message
      });

      return {
        valid: false,
        safeUrl: this.DEFAULT_SAFE_URL,
        reason: 'Invalid URL format',
        blocked: true
      };
    }
  }

  /**
   * Check if URL is relative
   */
  private isRelativeUrl(url: string): boolean {
    return url.startsWith('/') && !url.startsWith('//');
  }

  /**
   * Validate relative URL format
   */
  private isValidRelativeUrl(url: string): boolean {
    // Basic validation for relative URLs
    try {
      // Check for suspicious patterns
      const suspiciousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /file:/i,
        /%00/,        // Null byte
        /%0d%0a/i,    // CRLF injection
        /\.\.\//,     // Directory traversal
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(url)) {
          return false;
        }
      }

      // URL must start with / and not contain protocol
      if (!url.startsWith('/') || url.includes('://')) {
        return false;
      }

      // Basic length check
      if (url.length > 2048) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Log validation attempts for security monitoring
   */
  private async logValidation(
    validationType: string,
    context: string,
    url: string,
    allowed: boolean,
    userId?: string,
    projectId?: string,
    additional?: Record<string, any>
  ): Promise<void> {
    try {
      const logLevel = allowed ? 'info' : 'warn';
      const eventType = allowed ? 'url_validation_success' : 'url_validation_blocked';

      await this.loggingService.logServerEvent(
        'error', // Use 'error' logType for security events
        logLevel,
        `URL validation: ${validationType}`,
        {
          validationType,
          context,
          url,
          allowed,
          userId,
          projectId,
          userAgent: 'server', // Server-side validation
          timestamp: new Date().toISOString(),
          ...additional
        }
      );

      // Log critical security events separately
      if (!allowed) {
        await this.loggingService.logCriticalError(
          'url_validation_security_block',
          new Error(`Blocked potentially malicious redirect: ${url}`),
          {
            validationType,
            context,
            url,
            userId,
            projectId,
            ...additional
          }
        );
      }
    } catch (error) {
      // Don't throw on logging errors, but ensure we record them
      console.error('URL validation logging failed:', error);
    }
  }

  /**
   * Get allowed origins (for debugging/testing)
   */
  getAllowedOrigins(): string[] {
    return [...this.ALLOWED_ORIGINS];
  }

  /**
   * Test URL validation with a sample set
   */
  async testValidation(): Promise<{
    passed: number;
    failed: number;
    results: Array<{ url: string; valid: boolean; reason?: string }>;
  }> {
    const testCases = [
      // Valid cases
      '/',
      '/dashboard',
      '/projects/123/settings',
      'https://sheenapps.com/dashboard',
      
      // Invalid cases
      'https://evil.com/callback',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.com/callback',
      '../../../etc/passwd',
      '/path%00injection',
      
      // Edge cases
      '',
      null as any,
      undefined as any,
      'a'.repeat(3000), // Too long
    ];

    const results = [];
    let passed = 0;
    let failed = 0;

    for (const url of testCases) {
      const result = await this.validateRedirectUrl(url, 'test');
      const entry: { url: string; valid: boolean; reason?: string } = {
        url: url || 'null/undefined',
        valid: result.valid
      };
      if (result.reason) {
        entry.reason = result.reason;
      }
      results.push(entry);

      if (result.valid) passed++;
      else failed++;
    }

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'URL validation test completed',
      { passed, failed, totalTests: testCases.length }
    );

    return { passed, failed, results };
  }
}

/**
 * Helper function for quick validation
 */
export async function validateRedirectUrl(
  nextUrl: string,
  context?: string,
  userId?: string,
  projectId?: string
): Promise<UrlValidationResult> {
  const validator = UrlValidator.getInstance();
  return await validator.validateRedirectUrl(nextUrl, context, userId, projectId);
}