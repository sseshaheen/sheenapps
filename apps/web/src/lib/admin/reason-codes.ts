/**
 * Admin Reason Codes
 * Client-safe constants for structured reason collection
 * This file can be imported in both client and server components
 */

// Expert's structured reason codes
export const REASON_CODES = {
  trust_safety: {
    T01: 'Suspicious activity pattern',
    T02: 'Harassment or abusive behavior',
    T03: 'Spam or automated behavior',
    T04: 'Terms of service violation', 
    T05: 'Security threat detected',
  },
  financial: {
    F01: 'Chargeback risk',
    F02: 'Payment dispute',
    F03: 'Account compromise suspected',
  },
  promotion: {
    P01: 'Promotion expired',
    P02: 'Campaign budget exceeded', 
    P03: 'Targeting criteria mismatch',
  },
} as const

// Type for reason categories
export type ReasonCategory = keyof typeof REASON_CODES

// Helper function to sanitize reason text (client-safe version)
// NOTE: PII masking disabled for now to aid troubleshooting. Only XSS protection is active.
export function sanitizeReason(reason: string): string {
  // Basic XSS protection only - keep actual data for troubleshooting
  return reason
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .trim()
}

// Helper to get reason code description
export function getReasonDescription(category: ReasonCategory, code: string): string | undefined {
  return REASON_CODES[category]?.[code as keyof typeof REASON_CODES[typeof category]]
}

// Helper to validate reason length
export function validateReasonLength(reason: string, minLength: number = 10): boolean {
  return reason.trim().length >= minLength
}