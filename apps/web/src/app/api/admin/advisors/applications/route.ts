/**
 * Advisor Applications API Route
 * Manages advisor application review and approval
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock advisor applications for fallback
const mockApplications = [
  {
    id: 'advisor_app_001',
    user_id: 'user_789',
    name: 'John Smith',
    display_name: 'John Smith',
    email: 'john.smith@example.com',
    expertise: ['Business Strategy', 'Marketing', 'SaaS'],
    specialties: ['Business Strategy', 'Marketing', 'SaaS'],
    experience_years: 12,
    years_experience: 12,
    linkedin_url: 'https://linkedin.com/in/johnsmith',
    portfolio_url: 'https://johnsmith.com',
    country_code: 'US',
    verification_status: 'verified',
    languages: ['English'],
    availability: 'full_time',
    hourly_rate: 150,
    status: 'pending',
    submitted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    notes: null,
    profile_image: 'https://ui-avatars.com/api/?name=John+Smith&background=6366f1&color=fff',
    slug: 'john-smith',
    bio: 'Serial entrepreneur with 3 successful exits. Specializing in B2B SaaS go-to-market strategy.'
  },
  {
    id: 'advisor_app_002',
    user_id: 'user_012',
    name: 'Sarah Johnson',
    display_name: 'Sarah Johnson',
    email: 'sarah.j@example.com',
    expertise: ['Finance', 'Fundraising', 'Venture Capital'],
    specialties: ['Finance', 'Fundraising', 'Venture Capital'],
    experience_years: 8,
    years_experience: 8,
    linkedin_url: 'https://linkedin.com/in/sarahjohnson',
    portfolio_url: 'https://sarahj.vc',
    country_code: 'UK',
    verification_status: 'verified',
    languages: ['English', 'French'],
    availability: 'part_time',
    hourly_rate: 200,
    status: 'pending',
    submitted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    notes: null,
    profile_image: 'https://ui-avatars.com/api/?name=Sarah+Johnson&background=ec4899&color=fff',
    slug: 'sarah-johnson',
    bio: 'Former VC partner at top-tier fund. Helped 50+ startups raise $500M+ in funding.'
  },
  {
    id: 'advisor_app_003',
    user_id: 'user_345',
    name: 'Maria Rodriguez',
    display_name: 'Maria Rodriguez',
    email: 'maria.r@example.com',
    expertise: ['Product Management', 'UX Design', 'Growth'],
    specialties: ['Product Management', 'UX Design', 'Growth'],
    experience_years: 10,
    years_experience: 10,
    linkedin_url: 'https://linkedin.com/in/mariarodriguez',
    portfolio_url: 'https://maria.design',
    country_code: 'ES',
    verification_status: 'verified',
    languages: ['English', 'Spanish'],
    availability: 'full_time',
    hourly_rate: 175,
    status: 'approved',
    submitted_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_by: 'admin@sheenapps.com',
    notes: 'Excellent portfolio and experience. Approved for product advisory.',
    profile_image: 'https://ui-avatars.com/api/?name=Emma+Thompson&background=10b981&color=fff',
    slug: 'emma-thompson',
    bio: 'Product management leader with experience at Fortune 500 and high-growth startups.'
  },
  {
    id: 'advisor_app_004',
    user_id: 'user_456',
    name: 'Alex Chen',
    display_name: 'Alex Chen',
    email: 'alex.chen@example.com',
    expertise: ['Engineering', 'DevOps', 'AI/ML'],
    specialties: ['Engineering', 'DevOps', 'AI/ML'],
    experience_years: 15,
    years_experience: 15,
    linkedin_url: 'https://linkedin.com/in/alexchen',
    portfolio_url: 'https://alexchen.dev',
    country_code: 'CA',
    verification_status: 'verified',
    languages: ['English', 'Mandarin'],
    availability: 'full_time',
    hourly_rate: 250,
    status: 'approved',
    submitted_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_by: 'admin@sheenapps.com',
    notes: 'Strong technical background with AI/ML expertise. Great fit for technical advisory.',
    profile_image: 'https://ui-avatars.com/api/?name=Alex+Chen&background=3b82f6&color=fff',
    slug: 'alex-chen',
    bio: 'Principal Engineer at FAANG with deep expertise in ML infrastructure and distributed systems.'
  },
  {
    id: 'advisor_app_005',
    user_id: 'user_567',
    name: 'David Kim',
    display_name: 'David Kim',
    email: 'david.k@example.com',
    expertise: ['Sales', 'Business Development'],
    specialties: ['Sales', 'Business Development'],
    experience_years: 3,
    years_experience: 3,
    linkedin_url: 'https://linkedin.com/in/davidkim',
    portfolio_url: null,
    country_code: 'US',
    verification_status: 'pending',
    languages: ['English'],
    availability: 'freelance',
    hourly_rate: 100,
    status: 'rejected',
    submitted_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    reviewed_by: 'admin@sheenapps.com',
    notes: 'Insufficient experience for advisor role. Minimum 5 years required.',
    profile_image: 'https://ui-avatars.com/api/?name=David+Kim&background=ef4444&color=fff',
    slug: 'david-kim',
    bio: 'Sales professional focused on B2B SaaS. Building expertise to transition into advisory.'
  }
]

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user has advisor management permissions
    const hasAdvisorPermission =
      await AdminAuthService.hasPermission('advisors.view') ||
      await AdminAuthService.hasPermission('advisors.approve') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasAdvisorPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view advisor applications' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'pending'

    logger.info('Fetching advisor applications', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      status,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getAdvisorApplications({
        adminToken: session.token,
        status: status === 'all' ? undefined : status
      })

      // If worker API returns empty applications, only fall back to mock data if enabled
      if (data.success && (!data.applications || data.applications.length === 0)) {
        logger.warn('Worker API returned empty applications', {
          adminId: session.user.id.slice(0, 8),
          correlationId,
          mockFallbackEnabled: process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true',
          workerResponse: data
        })

        // Only use mock data if global mock fallback is enabled
        if (process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true') {
          // Filter mock data based on status
          const filteredApplications = status === 'all'
            ? mockApplications
            : mockApplications.filter(app => app.status === status)

          return NextResponse.json({
            success: true,
            applications: filteredApplications,
            total_count: filteredApplications.length,
            pending_count: mockApplications.filter(a => a.status === 'pending').length,
            correlation_id: correlationId,
            _mock: true,
            _reason: 'Empty worker response'
          })
        }
      }

      return NextResponse.json({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Check if mock fallback is allowed
      const { mockReason, workerStatus } = extractMockReason(apiError)

      const errorResponse = handleMockFallback({
        mockReason,
        workerStatus,
        correlationId,
        endpoint: 'advisor applications'
      })

      if (errorResponse) {
        return errorResponse
      }

      // If mock fallback is enabled, return mock data
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session?.user?.id?.slice(0, 8) || 'unknown',
        correlationId
      })

      // Filter mock data based on status
      const filteredApplications = status === 'all'
        ? mockApplications
        : mockApplications.filter(app => app.status === status)

      return NextResponse.json({
        success: true,
        applications: filteredApplications,
        total_count: filteredApplications.length,
        pending_count: mockApplications.filter(a => a.status === 'pending').length,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()

    logger.error('Error in advisor applications endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch advisor applications',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
