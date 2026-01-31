import { NextRequest, NextResponse } from 'next/server'
import { IndexNowService } from '@/services/indexnow-service'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Sanity CMS webhook for automatic IndexNow triggers
 * POST /api/webhooks/sanity
 * 
 * Automatically triggers IndexNow when:
 * - Blog posts are published/updated
 * - Career posts are published/updated
 * 
 * Setup in Sanity Studio:
 * - URL: https://your-domain.com/api/webhooks/sanity
 * - HTTP method: POST
 * - Include drafts: false
 * - Filter: _type == "blogPost" || _type == "post" || _type == "career" || _type == "job"
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Validate webhook signature/secret for security
    // const signature = request.headers.get('sanity-webhook-signature')
    // if (!isValidSignature(signature, body)) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    // }

    const body = await request.json()
    
    // Extract document info from Sanity webhook payload
    const { _type, slug, _id } = body || {}
    
    if (!_type || !slug?.current) {
      logger.warn('⚠️ Invalid Sanity webhook payload - missing type or slug', { _type, _id })
      return NextResponse.json(
        { error: 'Invalid webhook payload - missing required fields' },
        { status: 400 }
      )
    }

    logger.info('📡 Sanity webhook received', {
      type: _type,
      slug: slug.current,
      documentId: _id?.slice(0, 8)
    })

    // Handle different document types
    switch (_type) {
      case 'blogPost':
      case 'post':
        await IndexNowService.indexBlogPost(slug.current)
        logger.info('📝 Blog post IndexNow triggered', { slug: slug.current })
        break
        
      case 'career':
      case 'job':
        await IndexNowService.indexCareerPost(slug.current)
        logger.info('💼 Career post IndexNow triggered', { slug: slug.current })
        break
        
      default:
        logger.info('ℹ️ Unhandled document type in Sanity webhook', { type: _type })
        return NextResponse.json({
          success: true,
          message: `Document type '${_type}' not configured for IndexNow`,
          skipped: true
        })
    }

    return NextResponse.json({
      success: true,
      message: `IndexNow triggered successfully for ${_type}: ${slug.current}`,
      document_type: _type,
      slug: slug.current,
      locales_updated: 9,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error('❌ Sanity webhook IndexNow trigger failed:', error)
    
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
    endpoint: 'sanity-webhook',
    status: 'ready',
    description: 'Automatic IndexNow triggers for Sanity CMS content',
    supported_types: ['blogPost', 'post', 'career', 'job'],
    webhook_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/sanity`
  })
}