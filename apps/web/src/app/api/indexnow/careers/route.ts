import { NextRequest, NextResponse } from 'next/server'
import { IndexNowService } from '@/services/indexnow-service'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Manual triggers for career pages IndexNow
 * POST /api/indexnow/careers - Trigger main careers page
 * POST /api/indexnow/careers?slug=job-slug - Trigger specific job posting
 * 
 * Usage: 
 * - Call after updating careers page content
 * - Call after publishing/updating job postings
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    
    if (slug) {
      // Trigger specific job posting
      logger.info('💼 Manual career post IndexNow trigger initiated', { slug })
      await IndexNowService.indexCareerPost(slug)
      
      return NextResponse.json({
        success: true,
        message: `Career post IndexNow triggered successfully: ${slug}`,
        locales_updated: 9,
        slug,
        timestamp: new Date().toISOString()
      })
    } else {
      // Trigger main careers page
      logger.info('💼 Manual careers page IndexNow trigger initiated')
      await IndexNowService.indexCareersPage()
      
      return NextResponse.json({
        success: true,
        message: 'Careers page IndexNow triggered successfully',
        locales_updated: 9,
        timestamp: new Date().toISOString()
      })
    }

  } catch (error: any) {
    logger.error('❌ Career pages IndexNow trigger failed:', error)
    
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
    endpoint: 'careers-indexnow',
    status: 'ready',
    description: 'Manual trigger for career pages IndexNow across all locales',
    usage: {
      careers_page: 'POST /api/indexnow/careers',
      job_posting: 'POST /api/indexnow/careers?slug=job-slug'
    }
  })
}