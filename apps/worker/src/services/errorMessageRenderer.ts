import { InternalError } from './providerErrorMapper';
import { ErrorCode } from '../types/errorCodes';

/**
 * Error Message Renderer
 * Converts structured error codes to user-friendly messages
 * Designed for future internationalization support
 */
export class ErrorMessageRenderer {
  /**
   * Render a user-friendly error message from structured error data
   * 
   * @param errorCode - Structured error code
   * @param params - Error parameters for context
   * @param locale - Language locale (future i18n support)
   * @returns User-friendly error message
   */
  static renderErrorForUser(
    errorCode: ErrorCode, 
    params?: Record<string, any>, 
    locale = 'en'
  ): string {
    switch (errorCode) {
      case 'AI_LIMIT_REACHED':
        return this.renderAILimitError(params);
        
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment before trying again.';
        
      case 'AUTH_FAILED':
        return 'Authentication failed. Please refresh the page and try again.';
        
      case 'NETWORK_TIMEOUT':
        return 'Request timed out. Please check your connection and try again.';
        
      case 'PROVIDER_UNAVAILABLE':
        return 'Service temporarily unavailable. Please try again in a moment.';
        
      case 'INTERNAL_ERROR':
      default:
        return 'An unexpected error occurred. Our team has been notified.';
    }
  }

  /**
   * Render AI limit error with dynamic timing information
   * DEPRECATED: This formats server-side - for legacy compatibility only
   * 
   * @param params - Parameters containing resetTime and other context
   * @returns Contextual AI limit message
   */
  private static renderAILimitError(params?: Record<string, any>): string {
    // **EXPERT GUIDANCE**: Keep simple message only for legacy transition
    // DO NOT format numbers/dates - NextJS should handle all formatting
    if (params?.resetTime) {
      const timeUntil = params.resetTime - Date.now();
      const minutes = Math.ceil(timeUntil / (60 * 1000));
      
      // SIMPLIFIED: Return basic message without formatted times
      // The params object contains raw values for client formatting
      if (minutes <= 1) {
        return 'AI capacity reached. Please try again shortly.';
      }
      return 'AI capacity reached. Check error params for retry time.';
    }
    
    return 'AI capacity reached. Please try again later.';
  }

  /**
   * Get structured error response for API responses
   * 
   * @param errorCode - Internal error code
   * @param params - Error parameters
   * @param includeMessage - Whether to include rendered message (for backward compatibility)
   * @returns Structured error object for API responses
   */
  static getStructuredError(
    errorCode: ErrorCode,
    params?: Record<string, any>,
    includeMessage = true
  ): {
    code: string;
    params?: Record<string, any>;
    message?: string;
  } {
    const errorResponse: any = { code: errorCode };
    
    if (params && Object.keys(params).length > 0) {
      errorResponse.params = params;
    }
    
    if (includeMessage) {
      errorResponse.message = this.renderErrorForUser(errorCode, params);
    }
    
    return errorResponse;
  }

  /**
   * **RAW PRIMITIVES**: Ensure params contain only raw values
   * Added to enforce expert guidance on server-side formatting
   * 
   * @param errorCode - Error code
   * @param params - Raw parameters to sanitize
   * @returns Params with only raw primitive values
   */
  static ensureRawPrimitives(
    errorCode: ErrorCode,
    params?: Record<string, any>
  ): Record<string, any> | undefined {
    if (!params) return undefined;
    
    const rawParams: Record<string, any> = {};
    
    // Process based on error code to ensure correct format
    switch (errorCode) {
      case 'AI_LIMIT_REACHED':
        if (params.resetTime) {
          // Ensure resetTime is epoch ms (number), not formatted string
          rawParams.resetTime = typeof params.resetTime === 'number' 
            ? params.resetTime 
            : new Date(params.resetTime).getTime();
          
          // Add retryAfter in raw seconds
          rawParams.retryAfter = Math.ceil((rawParams.resetTime - Date.now()) / 1000);
        }
        if (params.provider) {
          rawParams.provider = String(params.provider);
        }
        break;
        
      case 'INSUFFICIENT_BALANCE':
        // Ensure balance values are raw numbers
        if (params.requiredBalance !== undefined) {
          rawParams.requiredBalance = Number(params.requiredBalance);
        }
        if (params.currentBalance !== undefined) {
          rawParams.currentBalance = Number(params.currentBalance);
        }
        if (params.recommendation) {
          rawParams.recommendation = String(params.recommendation);
        }
        break;
        
      default:
        // Pass through other params as-is but validate types
        Object.keys(params).forEach(key => {
          const value = params[key];
          // Only allow primitives - no formatted strings with $ or dates
          if (typeof value === 'number' || typeof value === 'boolean') {
            rawParams[key] = value;
          } else if (typeof value === 'string' && !value.includes('$') && !value.match(/\d+\s*(minutes?|hours?|days?)/i)) {
            rawParams[key] = value;
          }
        });
    }
    
    return Object.keys(rawParams).length > 0 ? rawParams : undefined;
  }

  /**
   * Future: Load localized error messages from i18n files
   * This method is prepared for future internationalization implementation
   * 
   * @param locale - Target locale (e.g., 'en', 'es', 'fr')
   * @returns Localized error message templates
   */
  static getI18nErrorMessages(locale: string): Record<string, string> {
    // Example structure for future internationalization
    const messages: Record<string, Record<string, string>> = {
      en: {
        AI_LIMIT_REACHED: "Our AI is at capacity. Try again in {minutes} minutes.",
        RATE_LIMITED: "Too many requests. Please wait a moment.",
        AUTH_FAILED: "Authentication failed. Please refresh and try again.",
        NETWORK_TIMEOUT: "Network timeout. Check your connection and retry.",
        PROVIDER_UNAVAILABLE: "Service temporarily unavailable. Please try again in a moment.",
        INTERNAL: "An unexpected error occurred. Our team has been notified."
      },
      es: {
        AI_LIMIT_REACHED: "Nuestro servicio de IA está a capacidad. Intenta de nuevo en {minutes} minutos.",
        RATE_LIMITED: "Demasiadas solicitudes. Por favor espera un momento.",
        AUTH_FAILED: "Falló la autenticación. Actualiza la página e intenta de nuevo.",
        NETWORK_TIMEOUT: "Tiempo de espera agotado. Verifica tu conexión e intenta de nuevo.",
        PROVIDER_UNAVAILABLE: "Servicio temporalmente no disponible. Intenta de nuevo en un momento.",
        INTERNAL: "Ocurrió un error inesperado. Nuestro equipo ha sido notificado."
      }
    };
    
    // Note: Using non-null assertion since we know 'en' exists in the messages object above
    return messages[locale] ?? messages.en!;
  }
}