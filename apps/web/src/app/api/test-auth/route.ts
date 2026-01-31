import { NextRequest, NextResponse } from 'next/server'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger'

async function handleTestAuth(
  request: NextRequest, 
  { user }: { user: any }
) {
  logger.info('🧪 Test auth endpoint called', {
    method: request.method,
    hasUser: !!user,
    userId: user?.id?.slice(0, 8)
  })

  return NextResponse.json({
    success: true,
    message: 'Auth middleware working',
    user: user ? {
      id: user.id,
      email: user.email
    } : null
  })
}

export const GET = authPresets.authenticated(handleTestAuth)
export const POST = authPresets.authenticated(handleTestAuth)
export const PATCH = authPresets.authenticated(handleTestAuth)