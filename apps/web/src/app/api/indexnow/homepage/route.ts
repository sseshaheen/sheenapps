import { NextRequest, NextResponse } from 'next/server'
import { IndexNowService } from '@/services/indexnow-service'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Manual trigger for homepage IndexNow across all locales
 * POST /api/indexnow/homepage
 * 
 * Usage: Call this endpoint after updating homepage content
 */
export async function POST(request: NextRequest) {
  try {
    logger.info('🏠 Manual homepage IndexNow trigger initiated')

    // Optional: Add basic authentication check
    // For now, allow any POST request - you can add auth later if needed
    
    await IndexNowService.indexHomepage()
    
    return NextResponse.json({
      success: true,
      message: 'Homepage IndexNow triggered successfully',
      locales_updated: 9,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error('❌ Homepage IndexNow trigger failed:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: 'homepage-indexnow',
    status: 'ready',
    description: 'Manual trigger for homepage IndexNow across all locales'
  })
}