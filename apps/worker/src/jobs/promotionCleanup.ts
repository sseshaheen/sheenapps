/**
 * Promotion Cleanup Job
 * 
 * Production-hardened scheduled job that:
 * - Expires old promotion reservations with batch processing
 * - Cleans up expired provider artifacts
 * - Updates promotion status based on validity dates
 * - Emits metrics for monitoring
 * 
 * Runs daily at 3 AM UTC with batch limits to prevent vacuum spikes
 */

import { Pool } from 'pg';
import { FastifyBaseLogger } from 'fastify';
import { 
  StripePromotionAdapter,
  FawryPromotionAdapter,
  PaymobPromotionAdapter,
  STCPayPromotionAdapter,
  PayTabsPromotionAdapter
} from '../services/promotionAdapters';
import crypto from 'crypto';

interface CleanupMetrics {
  expired_reservations: number;
  deleted_artifacts: number;
  updated_promotions: number;
  errors: string[];
  duration_ms: number;
}

export class PromotionCleanupJob {
  private pool: Pool;
  private logger: FastifyBaseLogger;
  private isRunning: boolean = false;
  private providerAdapters: Map<string, any>;

  constructor(pool: Pool, logger: FastifyBaseLogger) {
    this.pool = pool;
    this.logger = logger;
    
    // Initialize provider adapters for cleanup
    this.providerAdapters = new Map([
      ['stripe', new StripePromotionAdapter(pool, logger)],
      ['fawry', new FawryPromotionAdapter(pool, logger)],
      ['paymob', new PaymobPromotionAdapter(pool, logger)],
      ['stcpay', new STCPayPromotionAdapter(pool, logger)],
      ['paytabs', new PayTabsPromotionAdapter(pool, logger)]
    ]);
  }

  /**
   * Main cleanup execution
   */
  async execute(): Promise<CleanupMetrics> {
    if (this.isRunning) {
      this.logger.warn('Promotion cleanup job already running, skipping execution');
      return {
        expired_reservations: 0,
        deleted_artifacts: 0,
        updated_promotions: 0,
        errors: ['Job already running'],
        duration_ms: 0
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const metrics: CleanupMetrics = {
      expired_reservations: 0,
      deleted_artifacts: 0,
      updated_promotions: 0,
      errors: [],
      duration_ms: 0
    };

    try {
      this.logger.info('Starting promotion cleanup job');

      // Step 1: Expire old reservations with batch processing
      metrics.expired_reservations = await this.expireReservations();
      
      // Step 2: Clean up expired artifacts with batch processing
      metrics.deleted_artifacts = await this.cleanupArtifacts();
      
      // Step 3: Update promotion statuses based on validity dates
      metrics.updated_promotions = await this.updatePromotionStatuses();
      
      // Step 4: Clean up provider-specific artifacts
      await this.cleanupProviderArtifacts();

      metrics.duration_ms = Date.now() - startTime;
      
      // Log metrics
      await this.logMetrics(metrics);
      
      this.logger.info(metrics, 'Promotion cleanup job completed successfully');
      
    } catch (error) {
      this.logger.error({ error }, 'Promotion cleanup job failed');
      metrics.errors.push(error instanceof Error ? error.message : 'Unknown error');
      metrics.duration_ms = Date.now() - startTime;
    } finally {
      this.isRunning = false;
    }

    return metrics;
  }

  /**
   * Expire old reservations with batch processing
   */
  private async expireReservations(): Promise<number> {
    let expiredCount = 0;
    let batchExpired = 0;
    const expiredIds: any[] = [];

    try {
      await this.pool.query('BEGIN');

      // PRODUCTION-HARDENED: Batch processing to prevent vacuum spikes
      do {
        const expiredReservations = await this.pool.query(`
          UPDATE promotion_reservations
          SET status = 'expired'
          WHERE status = 'reserved' 
            AND expires_at < NOW()
            AND id IN (
              SELECT id FROM promotion_reservations
              WHERE status = 'reserved' AND expires_at < NOW()
              LIMIT 1000
            )
          RETURNING id, promotion_id, user_id
        `);
        
        batchExpired = expiredReservations.rowCount || 0;
        expiredCount += batchExpired;
        expiredIds.push(...expiredReservations.rows);
        
        // Small delay between batches to reduce load
        if (batchExpired > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } while (batchExpired > 0);

      // Release any associated provider artifacts
      for (const reservation of expiredIds) {
        try {
          await this.releaseProviderArtifacts(reservation.id);
        } catch (error) {
          this.logger.warn({ error, reservationId: reservation.id }, 'Failed to release artifacts for reservation');
        }
      }

      await this.pool.query('COMMIT');
      
      if (expiredCount > 0) {
        this.logger.info({ count: expiredCount }, 'Expired promotion reservations');
      }
      
    } catch (error) {
      await this.pool.query('ROLLBACK');
      this.logger.error({ error }, 'Failed to expire reservations');
      throw error;
    }

    return expiredCount;
  }

  /**
   * Clean up expired artifacts with batch processing
   */
  private async cleanupArtifacts(): Promise<number> {
    let deletedCount = 0;
    let batchDeleted = 0;

    try {
      // PRODUCTION-HARDENED: Batch deletion with limit
      do {
        const deletedArtifacts = await this.pool.query(`
          DELETE FROM promotion_artifacts
          WHERE expires_at < NOW() - INTERVAL '24 hours'
            AND id IN (
              SELECT id FROM promotion_artifacts
              WHERE expires_at < NOW() - INTERVAL '24 hours'
              LIMIT 5000
            )
          RETURNING id, gateway, external_coupon_id, external_promotion_code_id
        `);
        
        batchDeleted = deletedArtifacts.rowCount || 0;
        deletedCount += batchDeleted;
        
        // Clean up external provider resources
        for (const artifact of deletedArtifacts.rows) {
          try {
            const adapter = this.providerAdapters.get(artifact.gateway);
            if (adapter && adapter.cleanupArtifact) {
              await adapter.cleanupArtifact({
                couponId: artifact.external_coupon_id,
                promotionCodeId: artifact.external_promotion_code_id
              });
            }
          } catch (error) {
            this.logger.warn({ 
              error, 
              artifact 
            }, 'Failed to cleanup provider artifact');
          }
        }
        
        // Small delay between batches
        if (batchDeleted > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } while (batchDeleted > 0);
      
      if (deletedCount > 0) {
        this.logger.info({ count: deletedCount }, 'Deleted expired promotion artifacts');
      }
      
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup artifacts');
      throw error;
    }

    return deletedCount;
  }

  /**
   * Update promotion statuses based on validity dates
   */
  private async updatePromotionStatuses(): Promise<number> {
    try {
      // Expire promotions that have passed their valid_until date
      const expiredResult = await this.pool.query(`
        UPDATE promotions
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active'
          AND valid_until IS NOT NULL
          AND valid_until < NOW()
      `);

      // Activate promotions that have reached their valid_from date
      const activatedResult = await this.pool.query(`
        UPDATE promotions
        SET status = 'active', updated_at = NOW()
        WHERE status = 'paused'
          AND valid_from IS NOT NULL
          AND valid_from <= NOW()
          AND (valid_until IS NULL OR valid_until > NOW())
      `);

      const totalUpdated = (expiredResult.rowCount || 0) + (activatedResult.rowCount || 0);
      
      if (totalUpdated > 0) {
        this.logger.info({
          expired: expiredResult.rowCount,
          activated: activatedResult.rowCount
        }, 'Updated promotion statuses');
      }

      return totalUpdated;
      
    } catch (error) {
      this.logger.error({ error }, 'Failed to update promotion statuses');
      throw error;
    }
  }

  /**
   * Release provider artifacts for a reservation
   */
  private async releaseProviderArtifacts(reservationId: string): Promise<void> {
    const artifacts = await this.pool.query(`
      SELECT gateway, external_coupon_id, external_promotion_code_id
      FROM promotion_artifacts
      WHERE reservation_id = $1
    `, [reservationId]);
    
    for (const artifact of artifacts.rows) {
      const adapter = this.providerAdapters.get(artifact.gateway);
      if (adapter && adapter.cleanupArtifact) {
        try {
          await adapter.cleanupArtifact({
            couponId: artifact.external_coupon_id,
            promotionCodeId: artifact.external_promotion_code_id
          });
        } catch (error) {
          this.logger.warn({ 
            error, 
            gateway: artifact.gateway,
            reservationId 
          }, 'Failed to cleanup provider artifact');
        }
      }
    }
  }

  /**
   * Clean up provider-specific expired resources
   */
  private async cleanupProviderArtifacts(): Promise<void> {
    // Stripe-specific cleanup
    try {
      const stripeAdapter = this.providerAdapters.get('stripe');
      if (stripeAdapter) {
        // Get expired Stripe artifacts
        const stripeArtifacts = await this.pool.query(`
          SELECT external_coupon_id, external_promotion_code_id
          FROM promotion_artifacts
          WHERE gateway = 'stripe'
            AND expires_at < NOW() - INTERVAL '7 days'
          LIMIT 100
        `);
        
        for (const artifact of stripeArtifacts.rows) {
          try {
            await stripeAdapter.cleanupArtifact({
              couponId: artifact.external_coupon_id,
              promotionCodeId: artifact.external_promotion_code_id
            });
          } catch (error) {
            this.logger.warn({ error, artifact }, 'Failed to cleanup Stripe artifact');
          }
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Stripe cleanup failed');
    }

    // Other providers don't require external cleanup as they use internal references
  }

  /**
   * Log metrics to database for monitoring
   */
  private async logMetrics(metrics: CleanupMetrics): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO job_execution_logs (
          id, job_name, status, metrics, duration_ms, executed_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        crypto.randomUUID(),
        'promotion_cleanup',
        metrics.errors.length === 0 ? 'success' : 'partial_failure',
        JSON.stringify(metrics),
        metrics.duration_ms
      ]);
    } catch (error) {
      this.logger.error({ error }, 'Failed to log cleanup metrics');
    }
  }

  /**
   * Schedule the cleanup job to run daily
   */
  static schedule(pool: Pool, logger: FastifyBaseLogger, cronSchedule: string = '0 3 * * *'): void {
    const job = new PromotionCleanupJob(pool, logger);
    
    // Use node-cron or similar scheduler in production
    // For now, we'll provide a simple interval-based approach
    const runDaily = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      
      // Run at 3:00 AM UTC
      if (hours === 3 && minutes === 0) {
        job.execute().catch(error => {
          logger.error({ error }, 'Scheduled promotion cleanup failed');
        });
      }
    };
    
    // Check every minute
    setInterval(runDaily, 60 * 1000);
    
    logger.info({ schedule: cronSchedule }, 'Promotion cleanup job scheduled');
  }
}

export default PromotionCleanupJob;