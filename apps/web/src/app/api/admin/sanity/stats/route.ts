/**
 * Admin Sanity Statistics API Route
 * Provides system-wide Sanity integration statistics for admin panel
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthService } from '@/lib/admin/admin-auth-service';
import { getSanityAPIClient } from '@/services/sanity-api-client';
import { logger } from '@/utils/logger';
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Get Sanity system statistics
 * GET /api/admin/sanity/stats
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate admin user
    const session = await AdminAuthService.getAdminSession();
    
    if (!session?.isValid) {
      return noCacheErrorResponse(
        { error: 'Admin authentication required' },
        401
      );
    }

    // Check permissions
    if (!session.permissions.includes('sanity.read') && session.role !== 'super_admin') {
      return noCacheErrorResponse(
        { error: 'Insufficient permissions to view Sanity statistics' },
        403
      );
    }

    logger.info('📊 Fetching Sanity system statistics', { 
      adminId: session.adminId,
      role: session.role
    });

    try {
      // In a real implementation, these would come from dedicated admin endpoints
      // For now, we'll simulate the data structure based on typical admin needs
      
      const stats = {
        total_connections: 0,
        active_connections: 0,
        failed_connections: 0,
        total_documents: 0,
        breakglass_entries: 0,
        webhooks_processed_24h: 0,
        last_updated: new Date().toISOString()
      };

      // This would typically aggregate data from the backend worker
      // const sanityClient = getSanityAPIClient();
      // const systemStats = await sanityClient.getSystemStatistics();
      
      logger.info('✅ Sanity system statistics retrieved', { 
        adminId: session.adminId,
        stats: Object.keys(stats)
      });

      return noCacheResponse(stats);

    } catch (error) {
      logger.error('🚨 Failed to fetch Sanity statistics', {
        adminId: session.adminId,
        error: error instanceof Error ? error.message : String(error)
      });

      return noCacheErrorResponse(
        { error: 'Failed to retrieve system statistics' },
        500
      );
    }

  } catch (error) {
    logger.error('🚨 Admin Sanity stats endpoint error', {
      error: error instanceof Error ? error.message : String(error)
    });

    return noCacheErrorResponse(
      { error: 'Internal server error' },
      500
    );
  }
}