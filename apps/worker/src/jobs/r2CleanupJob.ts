import { CronJob } from 'cron';
import { pool } from '../services/database';
import { getR2GarbageCollector } from '../services/r2GarbageCollector';

/**
 * R2 Cleanup Job - Removes orphaned artifacts and unused storage
 * 
 * Runs weekly at 2 AM UTC on Sundays to prevent silent multi-terabyte growth.
 * Expert recommendation: Garbage collection to delete artifacts older than retention period.
 * 
 * This job prevents storage bloat and reduces R2 costs significantly.
 */
export class R2CleanupJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;

  constructor() {
    // Run weekly on Sundays at 2 AM UTC - Expert recommendation for garbage collection
    this.cronJob = new CronJob('0 2 * * 0', () => this.run(), null, false, 'UTC');
  }

  /**
   * Main cleanup execution
   */
  private async run(): Promise<void> {
    if (this.isRunning) {
      console.log('[R2 Cleanup] Skipping run - cleanup already in progress');
      return;
    }

    if (!pool) {
      console.log('[R2 Cleanup] No database configured, skipping cleanup');
      return;
    }

    this.isRunning = true;
    console.log('[R2 Cleanup] Starting R2 artifact garbage collection...');
    
    const startTime = Date.now();
    const retentionDays = 30; // Expert recommendation: 30-day retention

    try {
      // Run garbage collection using the new service
      const garbageCollector = getR2GarbageCollector();
      const result = await garbageCollector.run(retentionDays);
      
      const duration = Date.now() - startTime;
      console.log(`[R2 Cleanup] Completed in ${duration}ms: ${result.deletedCount} artifacts deleted, ${this.formatFileSize(result.totalSize)} freed, ${result.errors.length} errors`);
      
      // Record cleanup metrics
      await this.recordCleanupMetrics(result.deletedCount, result.errors.length, duration, result.totalSize);
      
    } catch (error) {
      console.error('[R2 Cleanup] Critical failure:', error);
      // Record the error in metrics
      await this.recordCleanupMetrics(0, 1, Date.now() - startTime, 0);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Format file size for human-readable output
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Record cleanup metrics for monitoring
   */
  private async recordCleanupMetrics(deletedCount: number, errorCount: number, duration: number, totalSizeFreed: number = 0): Promise<void> {
    if (!pool) {
      console.warn('[R2 Cleanup] No database configured, skipping metrics recording');
      return;
    }

    try {
      // Store cleanup metrics in a simple log table (create if needed)
      await pool.query(`
        INSERT INTO r2_cleanup_logs (
          cleanup_date, 
          files_deleted, 
          errors_count, 
          duration_ms,
          size_freed_bytes,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT DO NOTHING
      `, [
        new Date().toISOString().split('T')[0], // YYYY-MM-DD
        deletedCount,
        errorCount,
        duration,
        totalSizeFreed
      ]);
    } catch (error) {
      // Don't fail the cleanup if metrics recording fails
      console.warn('[R2 Cleanup] Failed to record metrics:', error);
    }
  }

  /**
   * Start the cleanup job
   */
  start(): void {
    this.cronJob.start();
    console.log('✅ R2 garbage collection job scheduled (Sundays at 2 AM UTC)');
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    this.cronJob.stop();
    console.log('🛑 R2 garbage collection job stopped');
  }

  /**
   * Run garbage collection manually (for testing)
   */
  async runManually(retentionDays: number = 30): Promise<void> {
    console.log('[R2 Cleanup] Manual garbage collection triggered');
    if (this.isRunning) {
      console.log('[R2 Cleanup] Garbage collection already in progress');
      return;
    }
    
    const garbageCollector = getR2GarbageCollector();
    const result = await garbageCollector.run(retentionDays);
    
    console.log(`[R2 Cleanup] Manual run completed: ${result.deletedCount} deleted, ${this.formatFileSize(result.totalSize)} freed`);
  }

  /**
   * Get cleanup job status
   */
  getStatus(): { running: boolean, nextRun: Date | null, isActive: boolean } {
    return {
      running: this.isRunning,
      nextRun: this.cronJob.nextDate()?.toJSDate() || null,
      isActive: this.cronJob.running
    };
  }
}

// Export singleton instance
export const r2CleanupJob = new R2CleanupJob();