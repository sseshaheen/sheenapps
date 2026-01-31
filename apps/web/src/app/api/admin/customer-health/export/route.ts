import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheErrorResponse, noCacheResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/admin/customer-health/export - Export health data
export async function GET(request: NextRequest) {
  const { error } = await requireAdmin('customer_health.read')
  if (error) return error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || ''
  const format = searchParams.get('format') || 'json'

  // For CSV, we need raw response handling
  if (format === 'csv') {
    const result = await workerFetch(`/v1/admin/customer-health/export?status=${encodeURIComponent(status)}&format=csv`)
    if (!result.ok) {
      return noCacheErrorResponse({ error: result.error }, result.status)
    }
    // CSV content is in data as string from worker
    return new NextResponse(result.data as string, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="customer-health-${new Date().toISOString().split('T')[0]}.csv"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  }

  const result = await workerFetch(`/v1/admin/customer-health/export?status=${encodeURIComponent(status)}&format=${encodeURIComponent(format)}`)
  if (!result.ok) {
    return noCacheErrorResponse({ error: result.error }, result.status)
  }
  return noCacheResponse(result.data)
}
