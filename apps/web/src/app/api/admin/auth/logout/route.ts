import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  try {
    // Clear admin session
    await AdminAuthService.clearAdminSession()
    
    // Redirect to admin login page for better UX
    return NextResponse.redirect(new URL('/admin-login', request.url))
  } catch (error) {
    console.error('Logout error:', error)
    // Even on error, redirect to login
    return NextResponse.redirect(new URL('/admin-login', request.url))
  }
}