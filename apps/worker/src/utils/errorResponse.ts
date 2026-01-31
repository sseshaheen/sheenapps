import { ERROR_CODES, validateErrorParams, INCLUDE_ERROR_MESSAGE } from '../types/errorCodes'
import { ErrorMessageRenderer } from '../services/errorMessageRenderer'
import { FastifyRequest, FastifyReply } from 'fastify'

// **Expert-recommended**: Machine-readable error response format
export function formatErrorResponse(
  request: FastifyRequest, // Fastify request with middleware locale
  code: keyof typeof ERROR_CODES,
  params?: Record<string, any>,
  statusCode = 500
) {
  // **CRITICAL**: Validate params to ensure raw primitives only
  const validatedParams = params ? validateErrorParams(code, params) : undefined

  const response = {
    success: false,
    error: {
      code,                                  // Stable, public error code
      i18nKey: `errors.${code.toLowerCase()}`, // Frontend translation key
      params: validatedParams,               // Raw parameters for interpolation
      locale: request.locale || 'en',       // Response locale (matches Content-Language header)

      // **EXPERT GUIDANCE**: Fallback message for non-JS clients
      ...(INCLUDE_ERROR_MESSAGE && {
        message: ErrorMessageRenderer.renderErrorForUser(code, validatedParams, request.locale)
      })
    }
  }
  
  return { response, statusCode }
}

// **RAW PRIMITIVES**: Example with validated raw values only
export function handleInsufficientBalance(request: FastifyRequest, reply: FastifyReply) {
  const { response, statusCode } = formatErrorResponse(
    request,
    'INSUFFICIENT_BALANCE',
    {
      requiredBalance: 100,        // Raw number - NO "$100.00"
      currentBalance: 50,          // Raw number - NO "$50.00"  
      recommendation: 'purchase'   // Enum value - NO formatted text
    },
    402
  )
  
  return reply.status(statusCode).send(response)
}

// **RAW PRIMITIVES**: AI limit example with epoch time
export function handleAILimit(request: FastifyRequest, reply: FastifyReply, resetTime: number) {
  const { response, statusCode } = formatErrorResponse(
    request,
    'AI_LIMIT_REACHED',
    {
      resetTime,                           // Raw epoch ms - NO "in 1 hour"
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000), // Raw seconds
      provider: 'anthropic'                // Raw string - NO formatted text
    },
    429
  )
  
  return reply.status(statusCode).send(response)
}

// **DISCOVERY**: Helper to convert legacy error messages to structured format
export function convertLegacyError(errorMessage: string): { code: string; params?: any } {
  // Common patterns from existing error messages
  if (errorMessage.includes('AI capacity reached') || errorMessage.includes('rate limit')) {
    const minutesMatch = errorMessage.match(/(\d+)\s*minutes?/i)
    const minutes = minutesMatch?.[1] ? parseInt(minutesMatch[1]) : 5
    
    return {
      code: 'AI_LIMIT_REACHED',
      params: {
        resetTime: Date.now() + (minutes * 60000),
        retryAfter: minutes * 60,
        provider: 'anthropic'
      }
    }
  }
  
  if (errorMessage.includes('insufficient balance') || errorMessage.includes('credits')) {
    const numbersMatch = errorMessage.match(/\d+/g)
    const [required, current] = numbersMatch || [100, 0]
    
    return {
      code: 'INSUFFICIENT_BALANCE',
      params: {
        requiredBalance: parseInt(String(required)),
        currentBalance: parseInt(String(current))
      }
    }
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return {
      code: 'NETWORK_TIMEOUT',
      params: {}
    }
  }
  
  // Fallback for unknown errors
  return {
    code: 'INTERNAL_ERROR',
    params: {
      originalMessage: errorMessage
    }
  }
}

console.log('📝 Error response utility initialized with raw primitives enforcement')