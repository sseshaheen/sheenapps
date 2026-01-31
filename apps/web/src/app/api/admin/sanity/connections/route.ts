/**
 * Admin Sanity Connections API Route
 * Administrative view of all Sanity connections across the system
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
 * Get all Sanity connections (admin view)
 * GET /api/admin/sanity/connections
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
        { error: 'Insufficient permissions to view Sanity connections' },
        403
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const projectId = searchParams.get('project_id');
    const status = searchParams.get('status');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    logger.info('📋 Admin fetching all Sanity connections', { 
      adminId: session.adminId,
      role: session.role,
      filters: { userId, projectId, status, limit, offset }
    });

    try {
      // In a real implementation, this would call an admin-specific endpoint
      // that bypasses user-level filtering and returns system-wide data
      
      // For now, we'll return a basic structure
      const connections = {
        connections: [], // Would contain all system connections
        total: 0,
        filters_applied: {
          user_id: userId,
          project_id: projectId,
          status: status,
          limit: limit ? parseInt(limit) : undefined,
          offset: offset ? parseInt(offset) : undefined
        }
      };

      logger.info('✅ Admin Sanity connections retrieved', { 
        adminId: session.adminId,
        count: connections.total,
        filters: connections.filters_applied
      });

      return noCacheResponse(connections);

    } catch (error) {
      logger.error('🚨 Failed to fetch admin Sanity connections', {
        adminId: session.adminId,
        error: error instanceof Error ? error.message : String(error)
      });

      return noCacheErrorResponse(
        { error: 'Failed to retrieve connections' },
        500
      );
    }

  } catch (error) {
    logger.error('🚨 Admin Sanity connections endpoint error', {
      error: error instanceof Error ? error.message : String(error)
    });

    return noCacheErrorResponse(
      { error: 'Internal server error' },
      500
    );
  }
}