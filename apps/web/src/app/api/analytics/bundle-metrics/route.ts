import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'

/**
 * 📦 Bundle Performance Metrics Endpoint
 * Correlates bundle optimizations with real-user performance
 */

interface BundleMetricsData {
  bundleLoadTime: number
  jsResourceCount: number
  totalResourceCount: number
  domContentLoaded: number
  url: string
  timestamp: number
}

export async function POST(request: NextRequest) {
  try {
    const data: BundleMetricsData = await request.json()
    
    // Validate required fields
    if (typeof data.bundleLoadTime !== 'number' || !data.url) {
      return NextResponse.json({ error: 'Invalid bundle metrics data' }, { status: 400 })
    }

    // Log bundle performance metrics
    logger.info('📦 Bundle Performance Metrics', {
      bundleLoadTime: `${data.bundleLoadTime}ms`,
      jsResourceCount: data.jsResourceCount,
      domContentLoaded: `${data.domContentLoaded}ms`,
      url: data.url,
      optimizationPhase: 'Post-BD5-MonsterChunkSurgery',
      timestamp: new Date(data.timestamp).toISOString()
    })

    // Correlate with bundle optimization phases
    const isHomepage = data.url === '/' || data.url.match(/\/[a-z]{2}(-[a-z]{2})?$/)
    const isBuilder = data.url.includes('/builder')
    
    if (isHomepage) {
      logger.info('🏠 Homepage Bundle Performance', {
        bundleLoadTime: data.bundleLoadTime,
        jsResources: data.jsResourceCount,
        status: data.bundleLoadTime < 1000 ? 'EXCELLENT' : data.bundleLoadTime < 2000 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        note: 'Post BD-1,2,3,4,5 optimizations'
      })
    }

    if (isBuilder) {
      logger.info('🔧 Builder Bundle Performance', {
        bundleLoadTime: data.bundleLoadTime,
        jsResources: data.jsResourceCount,
        dynamicImports: 'LivePreviewEngine + AIOrchestrator lazy-loaded',
        status: data.bundleLoadTime < 1500 ? 'EXCELLENT' : data.bundleLoadTime < 3000 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
      })
    }

    return NextResponse.json({ 
      success: true,
      bundleLoadTime: data.bundleLoadTime,
      jsResourceCount: data.jsResourceCount
    })

  } catch (error) {
    logger.error('Bundle metrics API error:', error)
    return NextResponse.json({ error: 'Failed to process bundle metrics' }, { status: 500 })
  }
}