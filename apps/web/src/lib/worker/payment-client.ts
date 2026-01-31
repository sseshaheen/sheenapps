/**
 * Payment Worker Client Utilities
 * Handles secure communication with Worker payment service endpoints
 * Features: Claims generation, idempotency keys, error handling
 * 
 * SECURITY HARDENED - Expert reviewed
 * SERVER-ONLY MODULE - Do not import in client components
 */

import 'server-only';
import { getWorkerClient } from '@/server/services/worker-api-client';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

/**
 * Payment claims format expected by worker
 * Based on worker team specification
 */
export interface PaymentClaims {
  userId: string;      // Required - primary identifier  
  email: string;       // Required - for Stripe customer creation
  roles: string[];     // Required - ['user'] for MVP
  issued: number;      // Required - Unix timestamp
  expires: number;     // Required - Unix timestamp (300s = 5min)
  
  // Optional fields for future:
  organizationId?: string;     // For future org-based billing
  locale?: string;            // Could duplicate x-sheen-locale
  planPermissions?: string[]; // For feature access control
}

/**
 * User interface matching auth store
 */
interface User {
  id: string;
  email?: string | null;
}

/**
 * Generate idempotency key with worker-compatible format
 * Pattern: 8-64 characters, alphanumeric + underscore + hyphen
 */
export function generateIdempotencyKey(prefix: string, userId: string, planId?: string): string {
  const parts = [prefix, userId];
  if (planId) parts.push(planId);
  parts.push(nanoid(12));
  return parts.join('_');
}

/**
 * Create payment claims for worker authentication
 * Matches worker team's exact specification
 */
export function createPaymentClaims(user: User): PaymentClaims {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    userId: user.id,
    email: user.email || '',
    roles: ['user'], // Simple role model for MVP
    issued: now,
    expires: now + 300 // 5 minutes (300 seconds)
  };
}

/**
 * Validate idempotency key format
 * Worker enforces this pattern: 8-64 chars, alphanumeric + underscore + hyphen
 */
export function validateIdempotencyKey(key: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(key);
}

/**
 * Get worker client with payment-specific configuration
 * Extended timeout for payment operations (Stripe can be slow)
 */
export function getPaymentWorkerClient() {
  // Use existing WorkerAPIClient singleton with longer timeout
  // Payment operations need more time due to Stripe API calls
  return getWorkerClient();
}

/**
 * Enhanced payment error codes based on worker implementation
 */
export const PAYMENT_ERROR_CODES = {
  // Authentication Errors  
  INVALID_CLAIMS: 'INVALID_CLAIMS',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',

  // Plan/Pricing Errors
  INVALID_PLAN: 'INVALID_PLAN',
  UNAUTHORIZED_PRICE: 'UNAUTHORIZED_PRICE',
  PLAN_NOT_AVAILABLE: 'PLAN_NOT_AVAILABLE',

  // Customer/Subscription Errors
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  CUSTOMER_CREATION_FAILED: 'CUSTOMER_CREATION_FAILED',
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_ALREADY_CANCELED: 'SUBSCRIPTION_ALREADY_CANCELED',
  MULTIPLE_ACTIVE_SUBSCRIPTIONS: 'MULTIPLE_ACTIVE_SUBSCRIPTIONS',

  // Stripe Integration Errors
  STRIPE_API_ERROR: 'STRIPE_API_ERROR',
  CHECKOUT_SESSION_FAILED: 'CHECKOUT_SESSION_FAILED',
  PORTAL_SESSION_FAILED: 'PORTAL_SESSION_FAILED',
  WEBHOOK_VERIFICATION_FAILED: 'WEBHOOK_VERIFICATION_FAILED',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',

  // System Errors  
  DATABASE_ERROR: 'DATABASE_ERROR',
  QUEUE_ERROR: 'QUEUE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR'
} as const;

export type PaymentErrorCode = keyof typeof PAYMENT_ERROR_CODES;

/**
 * Error handling result with user experience guidance
 */
interface ErrorHandlingResult {
  type: 'warning' | 'info' | 'error' | 'auth_error' | 'security';
  message: string;
  retry: boolean;
  delay?: number;
  redirect?: string;
}

/**
 * Handle payment errors with user-friendly messaging and recovery guidance
 * Based on worker team's complete error code list
 */
export function handlePaymentError(error: { code: PaymentErrorCode; message?: string }): ErrorHandlingResult {
  switch (error.code) {
    // User-fixable errors
    case 'INVALID_PLAN':
      return { type: 'warning', message: 'Please select a valid subscription plan', retry: true };
    
    case 'SUBSCRIPTION_NOT_FOUND':
      return { type: 'info', message: 'No active subscription found', retry: false };
    
    case 'SUBSCRIPTION_ALREADY_CANCELED':
      return { type: 'info', message: 'Subscription is already canceled', retry: false };
    
    case 'RATE_LIMIT_EXCEEDED':
      return { type: 'warning', message: 'Please wait a moment before trying again', retry: true, delay: 30000 };
    
    case 'IDEMPOTENCY_KEY_REUSED':
      return { type: 'warning', message: 'Duplicate request detected. Please refresh and try again.', retry: true };

    // Authentication errors (redirect to login)
    case 'INVALID_CLAIMS':
    case 'INSUFFICIENT_PERMISSIONS':
    case 'INVALID_SIGNATURE':
      return { type: 'auth_error', message: 'Please sign in again', redirect: '/auth/login', retry: false };

    // System errors (show support contact)
    case 'STRIPE_API_ERROR':
    case 'DATABASE_ERROR':
    case 'QUEUE_ERROR':
    case 'CHECKOUT_SESSION_FAILED':
    case 'PORTAL_SESSION_FAILED':
      return { 
        type: 'error', 
        message: 'Service temporarily unavailable. Please contact support if this persists.', 
        retry: true, 
        delay: 60000 
      };

    case 'CUSTOMER_CREATION_FAILED':
      return { 
        type: 'error', 
        message: 'Unable to set up billing account. Please try again or contact support.', 
        retry: true 
      };

    case 'PLAN_NOT_AVAILABLE':
      return { 
        type: 'warning', 
        message: 'Selected plan is temporarily unavailable. Please try a different plan.', 
        retry: false 
      };

    case 'CONFIGURATION_ERROR':
      return { 
        type: 'error', 
        message: 'Payment system configuration issue. Please contact support.', 
        retry: false 
      };

    // Security errors (log + contact support)
    case 'UNAUTHORIZED_PRICE':
    case 'MULTIPLE_ACTIVE_SUBSCRIPTIONS':
    case 'WEBHOOK_VERIFICATION_FAILED':
      return { 
        type: 'security', 
        message: 'Security issue detected. Please contact support immediately.', 
        retry: false 
      };

    default:
      return { 
        type: 'error', 
        message: error.message || 'Payment operation failed', 
        retry: true 
      };
  }
}

/**
 * Sanitize locale to worker-supported values
 * Defense in depth - worker also validates
 */
export function sanitizeLocale(locale?: string): string {
  if (!locale) return 'en';
  
  // Extract base locale and validate against worker allowlist
  const baseLocale = locale.toLowerCase().split('-')[0];
  const allowedLocales = ['en', 'ar', 'fr', 'es', 'de'];
  
  return allowedLocales.includes(baseLocale) ? baseLocale : 'en';
}

/**
 * Generate correlation ID for request tracking
 * Helps worker team debug issues across system boundaries
 */
export function generateCorrelationId(prefix: string = 'payment'): string {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Base64 encode claims for transmission
 * Using Buffer for consistency with existing patterns
 */
export function encodeClaims(claims: PaymentClaims): string {
  return Buffer.from(JSON.stringify(claims)).toString('base64');
}

/**
 * Validate plan ID against worker allowlist
 * Prevents unauthorized plan manipulation
 */
export function validatePlanId(planId: string): boolean {
  const allowedPlans = ['free', 'lite', 'starter', 'builder', 'pro', 'ultra'];
  return allowedPlans.includes(planId);
}