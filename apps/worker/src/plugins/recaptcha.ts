/**
 * reCAPTCHA Verification Plugin
 * 
 * Server-side verification for Google reCAPTCHA v3
 * Configurable to support hCaptcha as alternative
 */

import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

// =====================================================
// Types
// =====================================================

export interface RecaptchaConfig {
  provider: 'recaptcha' | 'hcaptcha';
  secret: string;
  scoreThreshold?: number; // For reCAPTCHA v3 (default 0.5)
  enabled: boolean;
}

export interface RecaptchaVerifyResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  score?: number | undefined;
  action?: string | undefined;
  hostname?: string | undefined;
  errorCodes?: string[] | undefined;
}

// =====================================================
// Configuration
// =====================================================

const config: RecaptchaConfig = {
  provider: (process.env.CAPTCHA_PROVIDER as 'recaptcha' | 'hcaptcha') || 'recaptcha',
  secret: process.env.RECAPTCHA_SECRET_KEY || process.env.HCAPTCHA_SECRET || '',
  scoreThreshold: parseFloat(process.env.RECAPTCHA_SCORE_THRESHOLD || '0.5'),
  enabled: process.env.CAPTCHA_ENABLED !== 'false' // Default to enabled
};

// Verification endpoints
const VERIFY_URLS = {
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://hcaptcha.com/siteverify'
};

// =====================================================
// Verification Functions
// =====================================================

/**
 * Verifies a CAPTCHA token with the configured provider
 * 
 * @param token - CAPTCHA token from client
 * @param remoteIp - Optional client IP for additional verification
 * @returns Verification result
 */
export async function verifyCaptcha(
  token: string,
  remoteIp?: string
): Promise<RecaptchaVerifyResult> {
  // Skip verification if disabled (for development/testing)
  if (!config.enabled) {
    await loggingService.logServerEvent('capacity', 'info', 'captcha_verification_skipped', {
      reason: 'CAPTCHA verification disabled in configuration'
    });
    return { success: true };
  }

  // Validate inputs
  if (!token) {
    return {
      success: false,
      errorCodes: ['missing-token']
    };
  }

  if (!config.secret) {
    await loggingService.logCriticalError('captcha_config_error', new Error('CAPTCHA secret not configured'), {
      provider: config.provider
    });
    return {
      success: false,
      errorCodes: ['server-configuration-error']
    };
  }

  try {
    // Build verification request
    const verifyUrl = VERIFY_URLS[config.provider];
    const params = new URLSearchParams({
      secret: config.secret,
      response: token
    });

    // Add IP if provided
    if (remoteIp) {
      params.append('remoteip', remoteIp);
    }

    // Make verification request
    const response = await fetch(verifyUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      throw new Error(`CAPTCHA verification request failed: ${response.status}`);
    }

    const data = await response.json();

    // Log verification attempt
    await loggingService.logServerEvent('capacity', 'info', 'captcha_verification_attempt', {
      provider: config.provider,
      success: data.success,
      score: data.score,
      action: data.action,
      errorCodes: data['error-codes']
    });

    // Check basic success
    if (!data.success) {
      return {
        success: false,
        errorCodes: data['error-codes'] || ['verification-failed']
      };
    }

    // For reCAPTCHA v3, check score threshold
    if (config.provider === 'recaptcha' && data.score !== undefined) {
      const scorePass = data.score >= (config.scoreThreshold || 0.5);
      
      if (!scorePass) {
        await loggingService.logServerEvent('capacity', 'warn', 'captcha_score_below_threshold', {
          score: data.score,
          threshold: config.scoreThreshold,
          action: data.action
        });
      }

      return {
        success: scorePass,
        score: data.score,
        action: data.action,
        hostname: data.hostname,
        errorCodes: scorePass ? undefined : ['score-too-low']
      };
    }

    // For hCaptcha or reCAPTCHA v2, just return success
    return {
      success: true,
      hostname: data.hostname
    };

  } catch (error) {
    await loggingService.logCriticalError('captcha_verification_error', error as Error, {
      provider: config.provider
    });

    return {
      success: false,
      errorCodes: ['network-error']
    };
  }
}

/**
 * Express/Fastify middleware for CAPTCHA verification
 * 
 * @param options - Middleware options
 * @returns Middleware function
 */
export function captchaMiddleware(options?: {
  tokenField?: string;
  ipHeader?: string;
  skipRoutes?: string[];
}) {
  const tokenField = options?.tokenField || 'captcha_token';
  const ipHeader = options?.ipHeader || 'x-forwarded-for';

  return async (request: any, reply: any) => {
    // Skip if route is excluded
    if (options?.skipRoutes?.includes(request.url)) {
      return;
    }

    // Extract token from body or query
    const token = request.body?.[tokenField] || request.query?.[tokenField];
    
    // Extract client IP
    const remoteIp = request.headers[ipHeader] || request.ip;

    // Verify CAPTCHA
    const result = await verifyCaptcha(token, remoteIp);

    if (!result.success) {
      return reply.code(422).send({
        success: false,
        error: 'CAPTCHA verification failed',
        errorCodes: result.errorCodes
      });
    }

    // Store result for logging
    (request as any).captchaResult = result;
  };
}

/**
 * Checks if CAPTCHA is enabled
 */
export function isCaptchaEnabled(): boolean {
  return config.enabled;
}

/**
 * Gets the current CAPTCHA provider
 */
export function getCaptchaProvider(): string {
  return config.provider;
}

/**
 * Updates CAPTCHA configuration (for testing)
 */
export function updateCaptchaConfig(newConfig: Partial<RecaptchaConfig>): void {
  Object.assign(config, newConfig);
}