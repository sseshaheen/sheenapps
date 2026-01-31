import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}))
    const { version = '1.0.0' } = body
    
    return NextResponse.json({
      success: true,
      message: 'Test data seeding completed successfully (simple mock)',
      data: { version, mode: 'simple-mock' }
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    message: 'Test data cleanup completed successfully (simple mock)'
  })
}