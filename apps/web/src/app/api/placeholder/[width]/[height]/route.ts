import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: Promise<{
    width: string
    height: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { width, height } = await params
  
  // Validate dimensions
  const w = parseInt(width)
  const h = parseInt(height)
  
  if (isNaN(w) || isNaN(h) || w > 2000 || h > 2000 || w < 1 || h < 1) {
    return NextResponse.json({ error: 'Invalid dimensions' }, { status: 400 })
  }
  
  // Create SVG placeholder
  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8f6f3"/>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" opacity="0.8"/>
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#d4af37;stop-opacity:0.1" />
          <stop offset="100%" style="stop-color:#8B4513;stop-opacity:0.05" />
        </linearGradient>
      </defs>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" dy="0.3em" fill="#6b5b4f" opacity="0.8">
        ${w} × ${h}
      </text>
      <circle cx="${w/4}" cy="${h/4}" r="10" fill="#d4af37" opacity="0.3"/>
      <circle cx="${w*3/4}" cy="${h*3/4}" r="8" fill="#8B4513" opacity="0.2"/>
    </svg>
  `
  
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}