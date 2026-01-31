import { z } from 'zod'

// **EXPERT ENHANCEMENT**: Frozen error code taxonomy with validation
export const ERROR_CODES = {
  // AI & Processing (already implemented)
  AI_LIMIT_REACHED: 'AI_LIMIT_REACHED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE', 
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  
  // Build Process (comprehensive event codes from codebase scan)
  BUILD_STARTED: 'BUILD_STARTED',
  BUILD_QUEUED: 'BUILD_QUEUED',
  BUILD_VALIDATING: 'BUILD_VALIDATING',
  BUILD_DEVELOPMENT_STARTING: 'BUILD_DEVELOPMENT_STARTING', 
  BUILD_DEVELOPMENT_COMPLETE: 'BUILD_DEVELOPMENT_COMPLETE',
  BUILD_DEPENDENCIES_INSTALLING: 'BUILD_DEPENDENCIES_INSTALLING',
  BUILD_DEPENDENCIES_COMPLETE: 'BUILD_DEPENDENCIES_COMPLETE',
  BUILD_COMPILING: 'BUILD_COMPILING',
  BUILD_DEPLOYING: 'BUILD_DEPLOYING',
  BUILD_PREVIEW_PREPARING: 'BUILD_PREVIEW_PREPARING',
  BUILD_METADATA_GENERATING: 'BUILD_METADATA_GENERATING',
  BUILD_METADATA_COMPLETE: 'BUILD_METADATA_COMPLETE',
  BUILD_RECOMMENDATIONS_GENERATED: 'BUILD_RECOMMENDATIONS_GENERATED',
  BUILD_COMPLETED: 'BUILD_COMPLETED',
  BUILD_FAILED: 'BUILD_FAILED',
  BUILD_TIMEOUT: 'BUILD_TIMEOUT',
  BUILD_CANCELLED: 'BUILD_CANCELLED',
  
  // Rollback Process (MISSING from original list!)
  ROLLBACK_STARTED: 'ROLLBACK_STARTED',
  ROLLBACK_VALIDATING: 'ROLLBACK_VALIDATING',
  ROLLBACK_ARTIFACT_DOWNLOADING: 'ROLLBACK_ARTIFACT_DOWNLOADING',
  ROLLBACK_WORKING_DIR_SYNCING: 'ROLLBACK_WORKING_DIR_SYNCING',
  ROLLBACK_PREVIEW_UPDATING: 'ROLLBACK_PREVIEW_UPDATING',
  ROLLBACK_COMPLETED: 'ROLLBACK_COMPLETED',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
  
  // Authentication & Authorization
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  
  // Rate Limiting & System
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // =========================================================================
  // Easy Mode / In-House Specific Error Codes
  // Pattern: Category_WHAT_HAPPENED (for clear i18n keys)
  // =========================================================================

  // Domain Operations
  DOMAIN_SEARCH_FAILED: 'DOMAIN_SEARCH_FAILED',
  DOMAIN_UNAVAILABLE: 'DOMAIN_UNAVAILABLE',
  DOMAIN_PURCHASE_FAILED: 'DOMAIN_PURCHASE_FAILED',
  DOMAIN_VERIFICATION_PENDING: 'DOMAIN_VERIFICATION_PENDING',
  DOMAIN_VERIFICATION_TIMEOUT: 'DOMAIN_VERIFICATION_TIMEOUT',
  DOMAIN_VERIFICATION_FAILED: 'DOMAIN_VERIFICATION_FAILED',
  DOMAIN_ALREADY_REGISTERED: 'DOMAIN_ALREADY_REGISTERED',
  DOMAIN_TRANSFER_FAILED: 'DOMAIN_TRANSFER_FAILED',

  // Email / Mailbox Operations
  EMAIL_QUOTA_EXCEEDED: 'EMAIL_QUOTA_EXCEEDED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_DOMAIN_NOT_VERIFIED: 'EMAIL_DOMAIN_NOT_VERIFIED',
  MAILBOX_CREATE_FAILED: 'MAILBOX_CREATE_FAILED',
  MAILBOX_LIMIT_REACHED: 'MAILBOX_LIMIT_REACHED',
  MAILBOX_NAME_TAKEN: 'MAILBOX_NAME_TAKEN',

  // CMS / Content Operations
  CMS_CONTENT_TYPE_CREATE_FAILED: 'CMS_CONTENT_TYPE_CREATE_FAILED',
  CMS_CONTENT_TYPE_NOT_FOUND: 'CMS_CONTENT_TYPE_NOT_FOUND',
  CMS_ENTRY_CREATE_FAILED: 'CMS_ENTRY_CREATE_FAILED',
  CMS_ENTRY_UPDATE_FAILED: 'CMS_ENTRY_UPDATE_FAILED',
  CMS_ENTRY_NOT_FOUND: 'CMS_ENTRY_NOT_FOUND',
  CMS_MEDIA_UPLOAD_FAILED: 'CMS_MEDIA_UPLOAD_FAILED',
  CMS_MEDIA_TOO_LARGE: 'CMS_MEDIA_TOO_LARGE',

  // Deployment Operations
  DEPLOY_R2_UPLOAD_FAILED: 'DEPLOY_R2_UPLOAD_FAILED',
  DEPLOY_WORKERS_FAILED: 'DEPLOY_WORKERS_FAILED',
  DEPLOY_DNS_FAILED: 'DEPLOY_DNS_FAILED',
  DEPLOY_CERTIFICATE_PENDING: 'DEPLOY_CERTIFICATE_PENDING',
  DEPLOY_CERTIFICATE_FAILED: 'DEPLOY_CERTIFICATE_FAILED',

  // Payment Operations
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_METHOD_REQUIRED: 'PAYMENT_METHOD_REQUIRED',
  PAYMENT_CARD_DECLINED: 'PAYMENT_CARD_DECLINED',
  PAYMENT_3DS_REQUIRED: 'PAYMENT_3DS_REQUIRED',

  // Project Operations
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_LIMIT_REACHED: 'PROJECT_LIMIT_REACHED',
  PROJECT_SUSPENDED: 'PROJECT_SUSPENDED'
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

// **EXPERT ENHANCEMENT**: Validate error codes at emission
// Use a Set of values for correct validation (keys == values today, but values is safer)
const ERROR_CODE_VALUES = new Set(Object.values(ERROR_CODES))

export function validateErrorCode(code: string): asserts code is ErrorCode {
  if (!ERROR_CODE_VALUES.has(code as ErrorCode)) {
    throw new Error(`Unknown error code: ${code}`)
  }
}

// **EXPERT ENHANCEMENT**: Parameter schema validation with Zod (RAW PRIMITIVES ONLY)
export const ErrorParamSchemas = {
  INSUFFICIENT_BALANCE: z.object({
    requiredBalance: z.number().positive(),     // Raw number only - NO formatting
    currentBalance: z.number().min(0),          // Raw number only - NO formatting
    recommendation: z.enum(['purchase', 'upgrade']).optional()
  }),
  AI_LIMIT_REACHED: z.object({
    resetTime: z.number().positive(),           // Epoch ms only - NO "in X minutes"
    retryAfter: z.number().positive(),          // Raw seconds only - NO formatting
    provider: z.string().optional()
  }),
  BUILD_FAILED: z.object({
    reason: z.string().optional(),              // Simple text only - NO formatted strings
    duration: z.number().optional()            // Raw seconds only - NO formatting
  })
}

export function validateErrorParams(code: ErrorCode, params: any) {
  const schema = ErrorParamSchemas[code as keyof typeof ErrorParamSchemas]
  if (schema) {
    try {
      return schema.parse(params)
    } catch (error) {
      console.error(`❌ Invalid params for ${code}:`, error)
      throw error
    }
  }
  return params
}

// **EXPERT ENHANCEMENT**: Kill switch for error messages
// After cutoff date, NEVER include error messages regardless of env var
// This prevents accidental PII leakage in production responses
const MESSAGE_CUTOFF_DATE = new Date('2025-03-01')
const isPastCutoff = Date.now() > MESSAGE_CUTOFF_DATE.getTime()

// Safe: enforce cutoff without crashing the process
export const INCLUDE_ERROR_MESSAGE =
  process.env.WORKER_INCLUDE_ERROR_MESSAGE === 'true' && !isPastCutoff

// Log warning once on startup if past cutoff and env var is still set
if (isPastCutoff && process.env.WORKER_INCLUDE_ERROR_MESSAGE === 'true') {
  console.warn(
    '⚠️  WORKER_INCLUDE_ERROR_MESSAGE is set but past cutoff date (2025-03-01). ' +
    'Error messages will NOT be included in responses. Remove the env var.'
  )
}