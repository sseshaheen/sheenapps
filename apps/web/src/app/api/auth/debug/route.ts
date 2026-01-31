import { NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mock = url.searchParams.get('mock')
  
  // Mock authenticated user for testing
  if (mock === 'auth') {
    return NextResponse.json({
      hasUser: true,
      userId: 'mock-user-123',
      userEmail: 'test@example.com',
      error: null,
      timestamp: new Date().toISOString(),
      note: 'MOCK AUTHENTICATED USER'
    }, { headers: { 'Cache-Control': 'no-store' }})
  }
  
  const supabase = await createServerSupabaseClientNew() // write-capable
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({
    hasUser: !!user,
    userId: user?.id,
    userEmail: user?.email,
    error: error?.message,
    timestamp: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store' }})
}
