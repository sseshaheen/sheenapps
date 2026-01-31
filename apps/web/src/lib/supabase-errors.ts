/**
 * Supabase Error Mapping Utility
 * Maps Supabase error codes to standardized application error responses
 */

import type { PostgrestError } from '@supabase/postgrest-js'
import { NextResponse } from 'next/server'

export interface AppError {
  error: string
  code: string
  message?: string
  details?: any
}

export interface ErrorMapping {
  code: string
  status: number
  message: string
}

/**
 * Map of Supabase error codes to application error codes
 */
const ERROR_MAPPINGS: Record<string, ErrorMapping> = {
  // PostgreSQL/PostgREST errors
  'PGRST116': {
    code: 'PROJECT_NOT_FOUND',
    status: 404,
    message: 'Project not found'
  },
  '42501': {
    code: 'PERMISSION_DENIED',
    status: 403,
    message: 'Permission denied'
  },
  '23505': {
    code: 'DUPLICATE_RESOURCE',
    status: 409,
    message: 'Resource already exists'
  },
  '23503': {
    code: 'FOREIGN_KEY_VIOLATION',
    status: 400,
    message: 'Invalid reference'
  },
  '22P02': {
    code: 'INVALID_INPUT',
    status: 400,
    message: 'Invalid input format'
  },
  '42P01': {
    code: 'TABLE_NOT_FOUND',
    status: 500,
    message: 'Database configuration error'
  },
  '42703': {
    code: 'COLUMN_NOT_FOUND',
    status: 500,
    message: 'Database configuration error'
  },
  '42P17': {
    code: 'INFINITE_RECURSION',
    status: 500,
    message: 'Database policy error'
  },
  
  // RLS (Row Level Security) errors
  'insufficient_privilege': {
    code: 'ACCESS_DENIED',
    status: 403,
    message: 'Access denied'
  },
  'new row violates row-level security policy': {
    code: 'RLS_VIOLATION',
    status: 403,
    message: 'Operation not allowed'
  }
}

/**
 * Convert a Supabase error to a standardized app error
 */
export function mapSupabaseError(error: PostgrestError | Error | any): {
  appError: AppError
  status: number
} {
  // Handle PostgrestError
  if ('code' in error && error.code) {
    const mapping = ERROR_MAPPINGS[error.code]
    if (mapping) {
      return {
        appError: {
          error: mapping.message,
          code: mapping.code,
          details: error.details || error.hint
        },
        status: mapping.status
      }
    }
  }
  
  // Check error message for RLS violations
  if (error.message) {
    for (const [key, mapping] of Object.entries(ERROR_MAPPINGS)) {
      if (error.message.toLowerCase().includes(key.toLowerCase())) {
        return {
          appError: {
            error: mapping.message,
            code: mapping.code,
            message: error.message
          },
          status: mapping.status
        }
      }
    }
  }
  
  // Handle 406 "no rows found" specifically
  if (error.message?.includes('406') || error.code === 'PGRST116') {
    return {
      appError: {
        error: 'Resource not found',
        code: 'NOT_FOUND',
        message: error.message
      },
      status: 404
    }
  }
  
  // Default error
  return {
    appError: {
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      message: error.message || 'Unknown error',
      details: error
    },
    status: 500
  }
}

/**
 * Create a NextResponse with proper error formatting
 */
export function createErrorResponse(
  error: PostgrestError | Error | any,
  customMessage?: string
): NextResponse {
  const { appError, status } = mapSupabaseError(error)
  
  if (customMessage) {
    appError.error = customMessage
  }
  
  return NextResponse.json(
    { success: false, ...appError },
    { status }
  )
}

/**
 * Check if error is a "not found" error
 */
export function isNotFoundError(error: any): boolean {
  if (!error) return false
  
  return (
    error.code === 'PGRST116' ||
    error.message?.includes('406') ||
    error.message?.toLowerCase().includes('not found') ||
    error.message?.toLowerCase().includes('no rows')
  )
}

/**
 * Check if error is a permission/access error
 */
export function isAccessError(error: any): boolean {
  if (!error) return false
  
  return (
    error.code === '42501' ||
    error.message?.toLowerCase().includes('permission') ||
    error.message?.toLowerCase().includes('policy') ||
    error.message?.toLowerCase().includes('unauthorized')
  )
}