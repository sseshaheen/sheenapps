import { NextRequest, NextResponse } from 'next/server';
import type { AdvisorSearchRequest, AdvisorSearchResponse } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

// Public endpoint - no authentication required
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract locale from request headers or URL parameter
    const urlLocale = searchParams.get('lang');
    const headerLocale = request.headers.get('x-sheen-locale');
    const acceptLanguage = request.headers.get('accept-language');
    const locale = urlLocale || headerLocale || acceptLanguage?.split(',')[0] || 'en';
    
    // EXPERT FIX: Return mock data in test mode
    const isTestMode = request.headers.get('X-Test-Mode') === 'true' || process.env.TEST_E2E === '1';
    
    if (isTestMode) {
      logger.info('🧪 Using mock advisor data for test mode');
      
      const mockAdvisors = [
        {
          id: 'advisor-1',
          user_id: 'user-sarah-chen',
          display_name: 'Sarah Chen',
          specialties: [
            { key: 'web-development', label: 'Web Development' },
            { key: 'react', label: 'React Development' },
            { key: 'typescript', label: 'TypeScript Development' }
          ],
          languages: ['English'],
          approval_status: 'approved',
          country_code: 'US',
          skills: ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Next.js'],
          rating: 4.9,
          review_count: 124,
          years_experience: 8,
          is_accepting_bookings: true,
          booking_status: 'available',
          hourly_rate: 150,
          avatar_url: null,
          bio: 'Senior React developer with expertise in TypeScript and modern web development',
          pricing_mode: 'platform',
          created_at: '2024-01-01T00:00:00Z',
          timezone: 'America/New_York'
        },
        {
          id: 'advisor-2',
          user_id: 'user-alex-thompson',
          display_name: 'Alex Thompson',
          specialties: [
            { key: 'backend-development', label: 'Backend Development' },
            { key: 'api-design', label: 'API Design' },
            { key: 'microservices', label: 'Microservices' }
          ],
          languages: ['English'],
          approval_status: 'approved',
          country_code: 'CA',
          skills: ['Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'Docker'],
          rating: 4.8,
          review_count: 89,
          years_experience: 7,
          is_accepting_bookings: true,
          booking_status: 'available',
          hourly_rate: 140,
          avatar_url: null,
          bio: 'Backend engineer specializing in scalable API development',
          pricing_mode: 'platform',
          created_at: '2024-01-01T00:00:00Z',
          timezone: 'America/Toronto'
        }
      ];
      
      const limit = parseInt(searchParams.get('limit') || '6');
      const offset = parseInt(searchParams.get('offset') || '0');
      const paginatedAdvisors = mockAdvisors.slice(offset, offset + limit);
      
      return NextResponse.json({
        success: true,
        advisors: paginatedAdvisors,
        total: mockAdvisors.length,
        has_more: (offset + limit) < mockAdvisors.length,
        pagination: {
          current_page: Math.floor(offset / limit) + 1,
          total_pages: Math.ceil(mockAdvisors.length / limit),
          per_page: limit,
          total_items: mockAdvisors.length
        }
      }, {
        headers: {
          'Content-Language': locale || 'en',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }
    
    // Build search parameters for worker API
    const workerParams = new URLSearchParams();
    
    // Pass through all search parameters
    const skills = searchParams.get('skills');
    const specialties = searchParams.get('specialties');
    const languages = searchParams.get('languages');
    const rating_min = searchParams.get('rating_min');
    const available_only = searchParams.get('available_only');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    
    if (skills) workerParams.set('skills', skills);
    if (specialties) workerParams.set('specialties', specialties);
    if (languages) workerParams.set('languages', languages);
    if (rating_min) workerParams.set('rating_min', rating_min);
    if (available_only) workerParams.set('available_only', available_only);
    if (limit) workerParams.set('limit', limit);
    if (offset) workerParams.set('offset', offset);

    const workerBaseUrl = process.env.WORKER_BASE_URL || 'http://localhost:8081';
    const workerUrl = `${workerBaseUrl}/api/v1/advisors/search?${workerParams.toString()}`;
    
    logger.info('🔍 Fetching advisors from worker (public)', { 
      workerUrl,
      locale,
      params: Object.fromEntries(workerParams) 
    });
    
    // Call worker API with locale header
    const response = await fetch(workerUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-locale': locale || 'en',
        'User-Agent': 'SheenApps-Public-API/1.0'
      },
      // Add timeout
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Worker API responded with ${response.status}: ${response.statusText}`);
    }

    const data: AdvisorSearchResponse = await response.json();
    
    logger.info('✅ Advisors fetched successfully from worker', { 
      count: data.advisors?.length || 0,
      total: data.total || 0 
    });

    // Set Content-Language response header for SEO/caching
    return NextResponse.json(data, {
      headers: {
        'Content-Language': data.advisors?.[0]?.bio_locale_used || locale || 'en',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to fetch advisors from worker', error);
    
    // Return error response
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch advisors',
        advisors: [],
        total: 0,
        has_more: false
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}