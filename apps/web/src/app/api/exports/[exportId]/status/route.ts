/**
 * Export Status API Route
 * Checks the status of a project export
 */

import { NextRequest, NextResponse } from 'next/server';
import { ProjectExportService } from '@/server/services/project-export';
import { getCurrentUserId } from '@/utils/auth';
import { logger } from '@/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ exportId: string }> }
) {
  try {
    const { exportId } = await params;
    const userId = await getCurrentUserId();

    logger.info(`🔍 Checking export status: ${exportId}`, { userId });

    const status = await ProjectExportService.getExportStatus(exportId, userId);

    logger.info(`✅ Export status retrieved for ${exportId}:`, {
      status: status.status,
      progress: status.progress,
      hasDownloadUrl: !!status.downloadUrl
    });

    return NextResponse.json(status);

  } catch (error) {
    logger.error('❌ Export status API error:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to get export status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}