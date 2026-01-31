import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'
import { z } from 'zod'

/**
 * Web-Vitals Analytics Endpoint
 *
 * Receives Core Web Vitals data from real users and stores in database.
 * Part of performance monitoring system - see docs/PERFORMANCE_ANALYSIS.md
 *
 * Data flow:
 * 1. Browser sends web vitals via web-vitals library
 * 2. This endpoint samples (10%) and stores in web_vitals_raw
 * 3. Hourly cron aggregates into web_vitals_hourly
 * 4. Admin dashboard queries hourly aggregates
 */

// Sampling rate: 10% of requests are stored
// Adjust based on traffic volume (higher traffic = lower sample rate)
const SAMPLE_RATE = 0.1

// FIX: Only log in dev or 1% of production requests (avoid DDoS-ing logs)
const LOG_SAMPLE_RATE = process.env.NODE_ENV !== 'production' ? 1.0 : 0.01

// FIX: Payload size guard to prevent oversized POST attacks
const MAX_PAYLOAD_BYTES = 10_000 // 10KB is plenty for web vitals

// FIX: Strict payload validation with zod
const WebVitalSchema = z.object({
  name: z.string().min(1).max(32),
  value: z.number().finite(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  delta: z.number().finite().optional(),
  id: z.string().max(128).optional(),
  navigationType: z.string().max(32).optional(),
  url: z.string().max(2048),
  timestamp: z.number().int().optional(),
}).passthrough() // Allow custom metadata fields

/**
 * Parse user agent to device class and browser
 * Returns simplified, privacy-friendly values
 */
function parseUserAgent(ua: string | null): { deviceClass: string; browser: string } {
  if (!ua) return { deviceClass: 'unknown', browser: 'unknown' }

  // Device class detection
  let deviceClass = 'desktop'
  if (/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    deviceClass = /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile'
  }

  // Browser detection (simplified)
  let browser = 'other'
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'chrome'
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'safari'
  else if (ua.includes('Firefox')) browser = 'firefox'
  else if (ua.includes('Edg')) browser = 'edge'

  return { deviceClass, browser }
}

/**
 * Extract route from URL (remove query params and locale variations)
 */
function normalizeRoute(url: string): string {
  try {
    const urlObj = new URL(url)
    let path = urlObj.pathname

    // FIX: Put longer locales first to prevent partial matches
    // (e.g., 'ar' would match before 'ar-eg', leaving '-eg')
    // Use lookahead (?=\/|$) to properly handle path boundary
    path = path.replace(
      /^\/(ar-eg|ar-sa|ar-ae|fr-ma|en|ar|fr|es|de)(?=\/|$)/,
      ''
    )

    // Ensure path starts with /
    if (!path.startsWith('/')) {
      path = '/' + path
    }

    // Remove trailing slash (except for root)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }

    // Replace dynamic segments with placeholders for grouping
    // e.g., /builder/workspace/abc123 -> /builder/workspace/[id]
    path = path
      .replace(/\/workspace\/[^/]+/, '/workspace/[id]')
      .replace(/\/projects\/[^/]+/, '/projects/[id]')
      .replace(/\/builds\/[^/]+/, '/builds/[id]')

    return path || '/'
  } catch {
    return '/'
  }
}

export async function POST(request: NextRequest) {
  try {
    // FIX: Cheap payload size guard (reject before parsing)
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // FIX: Validate payload with zod
    const rawBody = await request.json()
    const parsed = WebVitalSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const data = parsed.data

    // FIX: Sample logs in production to avoid excessive log volume
    if (Math.random() < LOG_SAMPLE_RATE) {
      logger.info(`Web Vital: ${data.name}`, {
        value: Math.round(data.value),
        rating: data.rating,
        route: normalizeRoute(data.url),
      })
    }

    // Store with sampling
    if (Math.random() < SAMPLE_RATE) {
      try {
        const supabase = await createServerSupabaseClientNew()
        const userAgent = request.headers.get('user-agent')
        const { deviceClass, browser } = parseUserAgent(userAgent)

        const { error } = await supabase.from('web_vitals_raw').insert({
          metric_name: data.name,
          value: data.value,
          rating: data.rating,
          route: normalizeRoute(data.url),
          device_class: deviceClass,
          browser: browser,
          build_version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || 'dev',
        })

        if (error) {
          // Log error but don't fail the request - analytics should be fire-and-forget
          logger.warn('Failed to store web vital', { error: error.message, metric: data.name })
        }
      } catch (dbError) {
        // Log but don't fail - analytics collection should be resilient
        logger.warn('Database error storing web vital', {
          error: dbError instanceof Error ? dbError.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      metric: data.name,
      value: data.value,
      rating: data.rating,
    })
  } catch (error) {
    logger.error('Web-vitals API error:', error)
    return NextResponse.json({ error: 'Failed to process web vital data' }, { status: 500 })
  }
}
