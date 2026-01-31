import 'server-only'

/**
 * Server-only Dashboard Utilities
 * Contains Node.js-specific utilities that should only run on the server
 */

import { z } from 'zod'
import { logger } from '@/utils/logger'

// ==========================================
// Server-Only Pagination Utilities  
// ==========================================

/**
 * Parse base64 cursor for pagination (server-only)
 * Format: base64(scheduled_at|id)
 */
export function parseCursor(cursor?: string): { scheduledAt?: string; id?: string } {
  if (!cursor) return {}
  
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
    const [scheduledAt, id] = decoded.split('|')
    return { scheduledAt, id }
  } catch (error) {
    logger.warn('Failed to parse cursor', { cursor, error })
    return {}
  }
}

/**
 * Generate base64 cursor for pagination (server-only)
 * Format: base64(scheduled_at|id)  
 */
export function generateCursor(scheduledAt: string, id: string): string {
  const raw = `${scheduledAt}|${id}`
  return Buffer.from(raw, 'utf-8').toString('base64')
}