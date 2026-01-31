import { CronJob } from 'cron';
import { pool } from '../services/database';
import { aiTimeBillingService } from '../services/aiTimeBillingService';
import { jobMonitoringService } from '../services/jobMonitoringService';

// Configuration
const GHOST_BUILD_TIMEOUT_HOURS = 2;
const MAX_REFUNDS_PER_RUN = 50; // Safety limit

// Metrics emitting function
async function emitMetric(name: string, value: number): Promise<void> {
  try {
    console.log(`[Metrics] ${name}: ${value}`);
    // TODO: Integrate with actual metrics system
  } catch (error) {
    console.error(`[Ghost Detection] Failed to emit metric ${name}:`, error);
  }
}

// Alert operations team function
async function alertOps(message: string, details?: any): Promise<void> {
  try {
    console.error(`[ALERT] ${message}`, details);
    // TODO: Integrate with actual alerting system
  } catch (error) {
    console.error(`[Ghost Detection] Failed to send alert:`, error);
  }
}

interface GhostBuild {
  build_id: string;
  user_id: string;
  operation_type: string;
  started_at: Date;
  project_id: string;
  estimated_seconds: number;
}

export class GhostBuildDetectionJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;

  constructor() {
    // Run every 30 minutes to catch hung builds quickly
    this.cronJob = new CronJob(
      '*/30 * * * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  start() {
    this.cronJob.start();
    console.log('✅ Ghost build detection job scheduled (every 30 minutes)');
  }

  stop() {
    this.cronJob.stop();
    console.log('🛑 Ghost build detection job stopped');
  }

  async runNow() {
    console.log('[Ghost Detection] Manual execution requested');
    await this.run();
  }

  private async run() {
    if (this.isRunning) {
      console.log('[Ghost Detection] Job already running, skipping...');
      return;
    }

    this.isRunning = true;

    // Generate unique job ID for tracking
    const jobId = `ghost-detection-${Date.now()}`;
    const idempotencyKey = `scan-${Math.floor(Date.now() / 1800000)}`; // 30-minute window

    try {
      console.log('[Ghost Detection] Starting ghost build detection scan with monitoring');

      // Execute job with full monitoring capabilities
      const result = await jobMonitoringService.executeJob(
        {
          jobId,
          jobType: 'ghost_build_detection',
          expectedRuntimeMs: 120000, // Expected 2 minutes
          maxRetries: 3, // Allow 3 retries for ghost detection
          idempotencyKey, // Prevent duplicate scans in 30-minute window
          metadata: {
            timeoutHours: GHOST_BUILD_TIMEOUT_HOURS,
            maxRefunds: MAX_REFUNDS_PER_RUN,
            scanStarted: new Date().toISOString()
          }
        },
        async () => {
          const ghostBuilds = await this.detectGhostBuilds();
          const refundedBuilds = await this.processGhostBuilds(ghostBuilds);

          return {
            ghostBuilds: ghostBuilds.length,
            refundedBuilds,
            details: ghostBuilds.slice(0, 5) // First 5 for analysis
          };
        }
      );

      console.log(`[Ghost Detection] Completed: ${result.ghostBuilds} ghost builds detected, ${result.refundedBuilds} refunded`);

      // Legacy metrics for backward compatibility
      await emitMetric('ghost_builds.detected', result.ghostBuilds);
      await emitMetric('ghost_builds.refunded', result.refundedBuilds);

      // Alert if many ghost builds detected
      if (result.ghostBuilds > 10) {
        await alertOps(`High number of ghost builds detected: ${result.ghostBuilds}`, {
          ghostBuilds: result.details,
          totalDetected: result.ghostBuilds,
          totalRefunded: result.refundedBuilds
        });
      }

    } catch (error) {
      console.error('[Ghost Detection] Failed:', error);

      // Legacy failure metrics for backward compatibility
      await emitMetric('ghost_builds.scan_errors', 1);
      await alertOps('Ghost build detection failed', {
        error: error instanceof Error ? error.message : String(error),
        jobId
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Detect ghost builds - builds that started tracking but never recorded consumption
   */
  private async detectGhostBuilds(): Promise<GhostBuild[]> {
    if (!pool) {
      throw new Error('Database pool not available');
    }

    console.log(`[Ghost Detection] Scanning for builds older than ${GHOST_BUILD_TIMEOUT_HOURS} hours...`);
    
    // Find AI time tracking sessions that started >2 hours ago but have no corresponding consumption record
    const result = await pool.query(`
      SELECT DISTINCT
        s.build_id,
        s.user_id,
        s.operation_type,
        s.started_at,
        s.project_id,
        s.estimated_seconds
      FROM (
        -- Find all tracking sessions from metrics (simulated table - adjust based on actual schema)
        SELECT 
          build_id,
          user_id,
          'main_build' as operation_type, -- Default, could be enhanced to track actual type
          started_at,
          project_id,
          180 as estimated_seconds -- Default estimate, could be enhanced
        FROM project_build_metrics 
        WHERE status = 'started'
          AND started_at < NOW() - INTERVAL '${GHOST_BUILD_TIMEOUT_HOURS} hours'
      ) s
      LEFT JOIN user_ai_time_consumption c ON s.build_id = c.build_id
      WHERE c.build_id IS NULL  -- No consumption record exists
      ORDER BY s.started_at ASC
      LIMIT ${MAX_REFUNDS_PER_RUN}
    `);

    const ghostBuilds = result.rows.map(row => ({
      build_id: row.build_id,
      user_id: row.user_id,
      operation_type: row.operation_type,
      started_at: new Date(row.started_at),
      project_id: row.project_id,
      estimated_seconds: parseInt(row.estimated_seconds) || 180
    }));

    if (ghostBuilds.length > 0) {
      console.log(`[Ghost Detection] Found ${ghostBuilds.length} potential ghost builds:`, 
        ghostBuilds.map(b => `${b.build_id} (${b.user_id}, started ${b.started_at.toISOString()})`));
    } else {
      console.log('[Ghost Detection] No ghost builds detected');
    }

    return ghostBuilds;
  }

  /**
   * Process detected ghost builds by refunding time and marking as failed
   */
  private async processGhostBuilds(ghostBuilds: GhostBuild[]): Promise<number> {
    let refundedCount = 0;

    for (const ghost of ghostBuilds) {
      try {
        console.log(`[Ghost Detection] Processing ghost build ${ghost.build_id} for user ${ghost.user_id}`);
        
        // Attempt to refund the ghost build
        await this.refundGhostBuild(ghost);
        refundedCount++;
        
        console.log(`[Ghost Detection] Successfully refunded ghost build ${ghost.build_id}`);
        
      } catch (error) {
        console.error(`[Ghost Detection] Failed to refund ghost build ${ghost.build_id}:`, error);
        
        // Continue processing other builds even if one fails
        await emitMetric('ghost_builds.refund_errors', 1);
      }
    }

    return refundedCount;
  }

  /**
   * Refund a specific ghost build
   */
  private async refundGhostBuild(ghost: GhostBuild): Promise<void> {
    if (!pool) {
      throw new Error('Database pool not available for refund');
    }

    // Start a transaction for atomic refund
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Skip creating consumption record for ghost builds since no time was actually consumed
      // Ghost builds that never started or completed don't need consumption tracking
      console.log(`[Ghost Detection] Skipping consumption record for ghost build ${ghost.build_id} (no actual time consumed)`);
      
      // Update the build status to failed in project_build_metrics
      await client.query(`
        UPDATE project_build_metrics 
        SET 
          status = 'failed',
          failure_stage = 'ghost_build_timeout',
          completed_at = NOW(),
          total_duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
        WHERE build_id = $1
      `, [ghost.build_id]);
      
      await client.query('COMMIT');
      
      console.log(`[Ghost Detection] Ghost build ${ghost.build_id} marked as failed and recorded with 0 consumption`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get statistics about ghost builds
   */
  async getStatistics(): Promise<{
    isRunning: boolean;
    isScheduled: boolean;
    currentGhostBuilds: number;
    recentRefunds: number;
  }> {
    const stats = {
      isRunning: this.isRunning,
      isScheduled: this.cronJob.running,
      currentGhostBuilds: 0,
      recentRefunds: 0
    };

    try {
      // Count current ghost builds
      const ghostBuilds = await this.detectGhostBuilds();
      stats.currentGhostBuilds = ghostBuilds.length;

      // Count refunds in last 24 hours
      if (pool) {
        const refundResult = await pool.query(`
          SELECT COUNT(*) as count
          FROM user_ai_time_consumption
          WHERE error_type = 'ghost_build_timeout'
            AND created_at > NOW() - INTERVAL '24 hours'
        `);
        stats.recentRefunds = parseInt(refundResult.rows[0]?.count || '0', 10);
      }

    } catch (error) {
      console.error('[Ghost Detection] Failed to get statistics:', error);
    }

    return stats;
  }
}

// Singleton instance
export const ghostBuildDetectionJob = new GhostBuildDetectionJob();

// Ensure cleanup on shutdown
process.on('beforeExit', () => {
  ghostBuildDetectionJob.stop();
});

process.on('SIGINT', () => {
  console.log('[Ghost Detection] Received SIGINT, stopping ghost build detection job...');
  ghostBuildDetectionJob.stop();
});

process.on('SIGTERM', () => {
  console.log('[Ghost Detection] Received SIGTERM, stopping ghost build detection job...');
  ghostBuildDetectionJob.stop();
});