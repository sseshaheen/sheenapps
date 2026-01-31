/**
 * Feedback Segment Report API
 * Generates monthly segment representation report to ensure balanced feedback collection
 *
 * Tracks feedback distribution across:
 * - Device type (desktop, mobile, tablet)
 * - Feedback type (NPS, CSAT, binary, etc.)
 * - Time of day / day of week
 * - Authenticated vs anonymous users
 * - Placement (inline, toast, modal, etc.)
 *
 * Use this report monthly to:
 * 1. Identify over/under-represented segments
 * 2. Adjust sampling rates or targeting
 * 3. Ensure feedback represents actual user base
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { getServiceClient } from '@/lib/server/supabase-clients'

// Use service client for server-side database operations
const supabase = getServiceClient()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SegmentData {
  segment: string
  count: number
  percentage: number
}

interface SegmentReport {
  period: {
    start: string
    end: string
    days: number
  }
  totalSubmissions: number
  byDeviceType: SegmentData[]
  byFeedbackType: SegmentData[]
  byPlacement: SegmentData[]
  byGoal: SegmentData[]
  byUserType: SegmentData[]
  byDayOfWeek: SegmentData[]
  byHourOfDay: Array<{ hour: number; count: number; percentage: number }>
  recommendations: string[]
  generatedAt: string
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin auth
    const adminSession = await AdminAuthService.getAdminSession()
    if (!adminSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // PERF: Single query to fetch all needed columns instead of 7 separate queries
    // This scales much better as feedback volume grows
    const { data, error } = await supabase
      .from('feedback_submissions')
      .select('device_type, type, placement, goal, user_id, created_at')
      .gte('created_at', startDate.toISOString())

    if (error) {
      console.error('Segment report query error:', error)
      throw error
    }

    const rows = data || []
    const total = rows.length

    // Aggregate all segments from the single fetch
    const byDeviceType = aggregateSegment(
      rows.map((r) => r.device_type || 'unknown'),
      total
    )

    const byFeedbackType = aggregateSegment(
      rows.map((r) => r.type),
      total
    )

    const byPlacement = aggregateSegment(
      rows.map((r) => r.placement),
      total
    )

    const byGoal = aggregateSegment(
      rows.map((r) => r.goal),
      total
    )

    const byUserType = aggregateSegment(
      rows.map((r) => (r.user_id ? 'authenticated' : 'anonymous')),
      total
    )

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const byDayOfWeek = aggregateSegment(
      rows.map((r) => dayNames[new Date(r.created_at).getDay()]),
      total
    )

    // Get breakdown by hour of day
    const hourCounts: Record<number, number> = Object.fromEntries(
      Array.from({ length: 24 }, (_, i) => [i, 0])
    )

    for (const r of rows) {
      const hour = new Date(r.created_at).getHours()
      hourCounts[hour]++
    }

    const byHourOfDay = Object.entries(hourCounts).map(([hour, count]) => ({
      hour: parseInt(hour),
      count,
      percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
    }))

    // Generate recommendations based on findings
    const recommendations = generateRecommendations({
      byDeviceType,
      byFeedbackType,
      byUserType,
      byDayOfWeek,
      byHourOfDay,
      total,
    })

    const report: SegmentReport = {
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days,
      },
      totalSubmissions: total,
      byDeviceType,
      byFeedbackType,
      byPlacement,
      byGoal,
      byUserType,
      byDayOfWeek,
      byHourOfDay,
      recommendations,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      report,
    })
  } catch (error) {
    console.error('Segment report error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}

function aggregateSegment(values: string[], total: number): SegmentData[] {
  const counts: Record<string, number> = {}

  for (const value of values) {
    counts[value] = (counts[value] || 0) + 1
  }

  return Object.entries(counts)
    .map(([segment, count]) => ({
      segment,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

function generateRecommendations(data: {
  byDeviceType: SegmentData[]
  byFeedbackType: SegmentData[]
  byUserType: SegmentData[]
  byDayOfWeek: SegmentData[]
  byHourOfDay: Array<{ hour: number; count: number; percentage: number }>
  total: number
}): string[] {
  const recommendations: string[] = []

  // Check device type balance
  const mobileData = data.byDeviceType.find((d) => d.segment === 'mobile')
  const desktopData = data.byDeviceType.find((d) => d.segment === 'desktop')

  if (mobileData && desktopData) {
    if (mobileData.percentage < 20 && desktopData.percentage > 60) {
      recommendations.push(
        'Mobile users are under-represented. Consider adjusting mobile prompt timing or placement.'
      )
    } else if (mobileData.percentage > 60 && desktopData.percentage < 20) {
      recommendations.push(
        'Desktop users are under-represented. Review desktop prompt visibility.'
      )
    }
  }

  // Check user type balance
  const authData = data.byUserType.find((d) => d.segment === 'authenticated')
  const anonData = data.byUserType.find((d) => d.segment === 'anonymous')

  if (anonData && anonData.percentage > 70) {
    recommendations.push(
      'High proportion of anonymous feedback. Consider incentivizing authenticated users to provide feedback.'
    )
  }

  // Check feedback type distribution
  const npsData = data.byFeedbackType.find((d) => d.segment === 'nps')
  if (!npsData || npsData.count < 10) {
    recommendations.push(
      'Low NPS response volume. Consider reviewing NPS trigger conditions or timing.'
    )
  }

  // Check for day-of-week gaps
  const lowDays = data.byDayOfWeek.filter(
    (d) => d.percentage < 10 && data.total > 100
  )
  if (lowDays.length > 0) {
    recommendations.push(
      `Low feedback on: ${lowDays.map((d) => d.segment).join(', ')}. Consider scheduling prompts for these days.`
    )
  }

  // Check for hour gaps (during business hours)
  const businessHours = data.byHourOfDay.filter(
    (h) => h.hour >= 9 && h.hour <= 17
  )
  const lowHours = businessHours.filter((h) => h.count === 0)
  if (lowHours.length > 2) {
    recommendations.push(
      'Feedback gaps during business hours. Review prompt triggering during 9AM-5PM.'
    )
  }

  // Sample size recommendations
  if (data.total < 50) {
    recommendations.push(
      'Low total feedback volume. Focus on increasing response rates before optimizing segments.'
    )
  } else if (data.total > 500) {
    recommendations.push(
      'Good feedback volume. Consider reducing prompt frequency to avoid survey fatigue.'
    )
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Feedback distribution looks balanced across segments. Continue monitoring monthly.'
    )
  }

  return recommendations
}
