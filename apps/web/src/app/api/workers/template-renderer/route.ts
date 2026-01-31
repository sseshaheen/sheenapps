/**
 * Template Renderer Worker API Route
 * Serves the worker script securely with authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { authPresets } from '@/lib/auth-middleware'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import fs from 'fs'
import path from 'path'

// Disable caching for this dynamic route
export const dynamic = 'force-dynamic'

async function handleWorkerRequest(
  request: NextRequest,
  { user }: { user: any }
) {
  try {
    // Check feature flag
    if (!FEATURE_FLAGS.ENABLE_PREVIEW_V2) {
      return NextResponse.json(
        { error: 'Preview V2 is not enabled' },
        { status: 403 }
      )
    }

    // Optional: Add additional authentication checks
    // For now, we'll allow any authenticated user
    
    // Read the worker file
    const workerPath = path.join(process.cwd(), 'src/workers/template-renderer.worker.ts')
    
    if (!fs.existsSync(workerPath)) {
      console.error('[Worker API] Worker file not found:', workerPath)
      return NextResponse.json(
        { error: 'Worker not available' },
        { status: 404 }
      )
    }

    const workerContent = fs.readFileSync(workerPath, 'utf-8')
    
    // Convert TypeScript to JavaScript for the worker
    // In a real implementation, you'd use a proper bundler
    const jsContent = workerContent
      .replace(/: any/g, '') // Remove type annotations
      .replace(/: string/g, '')
      .replace(/: number/g, '')
      .replace(/: boolean/g, '')
      .replace(/: Record<string, any>/g, '')
      .replace(/: Array<[^>]+>/g, '')
      .replace(/declare const self: DedicatedWorkerGlobalScope/g, '')
      .replace(/export \{\}/g, '')
      .replace(/import.*from.*['"].*['"];?\s*/g, '')

    // Set appropriate headers
    const response = new NextResponse(jsContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    })

    // Log worker access
    console.log('[Worker API] Worker served to user:', user?.id || 'anonymous')

    return response

  } catch (error) {
    console.error('[Worker API] Error serving worker:', error)
    return NextResponse.json(
      { error: 'Failed to serve worker' },
      { status: 500 }
    )
  }
}

// Apply authentication - only authenticated users can access the worker
export const GET = authPresets.authenticated(handleWorkerRequest)