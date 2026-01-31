import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { client } from '@/lib/sanity.client'

// Enable draft mode for Sanity previews
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug')
  const type = searchParams.get('type') || 'post'

  // Check secret token
  if (!secret || secret !== process.env.SANITY_PREVIEW_SECRET) {
    return new NextResponse('Invalid token', { status: 401 })
  }

  // Verify the document exists
  if (slug) {
    try {
      const document = await client.fetch(
        `*[_type == $type && slug.current == $slug][0]`,
        { type, slug }
      )

      if (!document) {
        return new NextResponse('Document not found', { status: 404 })
      }
    } catch (error) {
      return new NextResponse('Document verification failed', { status: 500 })
    }
  }

  // Enable draft mode
  const draft = await draftMode()
  draft.enable()

  // Redirect to the preview URL
  const redirectUrl = slug 
    ? `/${searchParams.get('locale') || 'en'}/blog/${slug}`
    : '/blog'

  return NextResponse.redirect(new URL(redirectUrl, request.url))
}