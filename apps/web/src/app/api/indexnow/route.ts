import { NextRequest, NextResponse } from 'next/server'

// 🚀 IndexNow API Integration for Instant Search Engine Indexing
// Based on expert recommendations for Arabic content optimization

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastError
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      await sleep(500 * (i + 1)) // Exponential backoff
    }
  }
  throw lastError
}

export async function POST(request: NextRequest) {
  try {
    const { urls = [], type = 'urlUpdated' } = await request.json() as {
      urls: string[]
      type?: 'urlUpdated' | 'urlDeleted'
    }

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No URLs provided' },
        { status: 400 }
      )
    }

    // Validate environment variables
    if (!process.env.INDEXNOW_KEY) {
      console.warn('IndexNow: INDEXNOW_KEY not configured')
      return NextResponse.json(
        { success: false, error: 'IndexNow not configured' },
        { status: 500 }
      )
    }

    const host = new URL(urls[0]).host

    // 1) IndexNow API - Works with Bing, Yandex, and others
    const indexNowBody = {
      host,
      key: process.env.INDEXNOW_KEY,
      keyLocation: process.env.INDEXNOW_KEY_LOCATION || `https://${host}/indexnow-key.txt`,
      urlList: urls
    }

    console.log(`🚀 IndexNow: Submitting ${urls.length} URLs for indexing`, { host, type })

    const indexNowResult = await withRetry(async () => {
      const response = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SheenApps-IndexNow/1.0'
        },
        body: JSON.stringify(indexNowBody)
      })

      if (!response.ok) {
        throw new Error(`IndexNow API failed: ${response.status} ${response.statusText}`)
      }

      const result = response.status === 202 ? { status: 'accepted' } : await response.json()
      return result
    })

    // 2) Optional: Bing Webmaster Tools URL Submission API
    let bingResult = null
    if (process.env.BING_API_KEY && process.env.BING_SITE_URL) {
      try {
        const bingEndpoint = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${process.env.BING_API_KEY}`
        const bingPayload = {
          siteUrl: process.env.BING_SITE_URL,
          urlList: urls
        }

        bingResult = await withRetry(async () => {
          const response = await fetch(bingEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SheenApps-Bing/1.0'
            },
            body: JSON.stringify(bingPayload)
          })

          if (!response.ok) {
            throw new Error(`Bing API failed: ${response.status} ${response.statusText}`)
          }

          return await response.json()
        })

        console.log('✅ Bing WebMaster: URLs submitted successfully')
      } catch (error) {
        console.warn('⚠️ Bing WebMaster submission failed (non-critical):', error)
        // Don't fail the whole request if Bing fails
      }
    }

    console.log('✅ IndexNow: URLs submitted successfully')

    return NextResponse.json({
      success: true,
      message: `Successfully submitted ${urls.length} URLs for indexing`,
      indexnow: indexNowResult,
      bing: bingResult,
      submittedUrls: urls
    })

  } catch (error: any) {
    console.error('❌ IndexNow API Error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  const isConfigured = !!(process.env.INDEXNOW_KEY && process.env.INDEXNOW_KEY_LOCATION)
  
  return NextResponse.json({
    status: 'IndexNow API Ready',
    configured: isConfigured,
    timestamp: new Date().toISOString()
  })
}