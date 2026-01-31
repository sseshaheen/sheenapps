/**
 * Edge API endpoint for uploading compiled component bundles
 * Stores compiled TSX components for CDN distribution
 */

import { NextRequest, NextResponse } from 'next/server'
// import { createClient } from '@/lib/supabase-server' // TODO: Uncomment when setting up Supabase storage

// Edge runtime for global distribution
export const runtime = 'edge'

export async function PUT(request: NextRequest) {
  try {
    // Get component hash from header
    const componentHash = request.headers.get('X-Component-Hash')
    if (!componentHash) {
      return NextResponse.json(
        { error: 'Missing component hash' },
        { status: 400 }
      )
    }
    
    // Get the bundle content
    const bundle = await request.text()
    
    // Check bundle size (60KB limit)
    if (bundle.length > 60_000) {
      return NextResponse.json(
        { error: 'Bundle too large (max 60KB)' },
        { status: 413 }
      )
    }
    
    // TODO: In production, this would upload to Supabase Storage or R2
    // For now, we'll just acknowledge the upload
    
    // Validate the bundle is valid JavaScript
    try {
      // Basic validation - check if it's valid module syntax
      if (!bundle.includes('export') || !bundle.includes('function')) {
        throw new Error('Invalid module format')
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid JavaScript bundle' },
        { status: 400 }
      )
    }
    
    // In production, upload to storage:
    // const supabase = createClient()
    // await supabase.storage
    //   .from('compiled-components')
    //   .upload(`${componentHash}.js`, bundle, {
    //     contentType: 'application/javascript',
    //     cacheControl: '604800', // 1 week
    //     upsert: true
    //   })
    
    return NextResponse.json(
      { 
        success: true,
        hash: componentHash,
        size: bundle.length
      },
      { 
        status: 200,
        headers: {
          'X-Component-Hash': componentHash
        }
      }
    )
  } catch (error: any) {
    console.error('Failed to upload compiled bundle:', error)
    return NextResponse.json(
      { error: 'Failed to upload bundle' },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve compiled bundles (for testing)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const hash = url.searchParams.get('hash')
  
  if (!hash) {
    return NextResponse.json(
      { error: 'Missing hash parameter' },
      { status: 400 }
    )
  }
  
  // TODO: In production, fetch from storage
  // const supabase = createClient()
  // const { data, error } = await supabase.storage
  //   .from('compiled-components')
  //   .download(`${hash}.js`)
  
  // For now, return a placeholder
  return new NextResponse(
    `// Compiled component ${hash}\nexport default function Component() { return null }`,
    {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, immutable, max-age=31536000',
        'X-Component-Hash': hash
      }
    }
  )
}