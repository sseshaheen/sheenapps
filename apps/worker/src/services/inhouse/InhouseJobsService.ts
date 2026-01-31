/**
 * In-House Jobs Service
 *
 * Background job and scheduling operations for Easy Mode projects.
 * Uses BullMQ for job queue management.
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { Queue, Job, QueueEvents, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { getPool } from '../databaseWrapper';
import { getInhouseMeteringService } from './InhouseMeteringService';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

// Default job options
const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_TIMEOUT_MS = 1800000; // 30 minutes (plan-dependent)

// =============================================================================
// TYPES
// =============================================================================

export interface EnqueueJobOptions {
  name: string;
  payload: Record<string, unknown>;
  delay?: string; // '30m', '1h', etc.
  timeoutMs?: number;
  maxAttempts?: number;
  concurrencyKey?: string;
  idempotencyKey?: string;
}

export interface JobInfo {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed';
  createdAt: string;
  processedAt?: string;
  finishedAt?: string;
  attemptsMade: number;
  maxAttempts: number;
  progress?: number;
  result?: unknown;
  error?: string;
  failedReason?: string;
}

export interface ListJobsOptions {
  name?: string;
  status?: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'all';
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'processedAt';
  orderDir?: 'asc' | 'desc';
}

export interface ListJobsResult {
  jobs: JobInfo[];
  total: number;
  hasMore: boolean;
}

export interface ListDLQResult {
  jobs: JobInfo[];
  total: number;
  hasMore: boolean;
}

export interface ScheduleOptions {
  name: string;
  cronExpression: string;
  payload: Record<string, unknown>;
  timezone?: string;
  active?: boolean;
  description?: string;
}

export interface ScheduleInfo {
  id: string;
  name: string;
  cronExpression: string;
  payload: Record<string, unknown>;
  timezone: string;
  active: boolean;
  description?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateScheduleOptions {
  cronExpression?: string;
  payload?: Record<string, unknown>;
  timezone?: string;
  active?: boolean;
  description?: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseJobsService {
  private projectId: string;
  private queue: Queue;
  private queueEvents: QueueEvents;
  private redis: Redis;

  // TTL for concurrency locks (24 hours) - should be longer than max job duration
  private static readonly CONCURRENCY_LOCK_TTL_SECONDS = 86400;

  constructor(projectId: string) {
    this.projectId = projectId;
    // Create project-specific queue
    const queueName = `inhouse-jobs-${projectId}`;
    this.queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed
        removeOnFail: 100, // Keep last 100 failed
        attempts: DEFAULT_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
    this.queueEvents = new QueueEvents(queueName, { connection });
    // Create Redis client for concurrency key locking
    this.redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
    });
  }

  /**
   * List failed jobs (DLQ view)
   */
  async listDLQ(limit = 50, offset = 0): Promise<ListDLQResult> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    try {
      const total = await this.queue.getFailedCount();
      const jobs = await this.queue.getJobs(['failed'], safeOffset, safeOffset + safeLimit - 1);
      const mapped = await Promise.all(jobs.map((job) => this.jobToInfo(job)));

      return {
        jobs: mapped,
        total,
        hasMore: safeOffset + mapped.length < total,
      };
    } catch {
      return { jobs: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get failed job count (DLQ preview)
   */
  async getDLQCount(): Promise<number> {
    try {
      return await this.queue.getFailedCount();
    } catch {
      return 0;
    }
  }

  /**
   * Retry failed jobs (DLQ)
   */
  async retryFailed(limit: number): Promise<{ retriedCount: number; failedCount: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const failedJobs = await this.queue.getJobs(['failed'], 0, safeLimit - 1);
    let retriedCount = 0;
    let failedCount = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    return { retriedCount, failedCount };
  }

  /**
   * Rate limit admin bulk retries (per project)
   */
  async checkAdminRetryRateLimit(maxPerMinute = 20): Promise<{ allowed: boolean; remaining: number }> {
    const key = `admin:dlq-retry:${this.projectId}:${Math.floor(Date.now() / 60000)}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60);
    }
    const remaining = Math.max(0, maxPerMinute - current);
    return { allowed: current <= maxPerMinute, remaining };
  }

  /**
   * Parse delay string to milliseconds
   */
  private parseDelay(delay: string): number {
    const match = delay.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      return 0;
    }
    // match[1] and match[2] are guaranteed to exist after the regex match check above
    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 3600 * 1000;
      case 'd': return value * 86400 * 1000;
      default: return 0;
    }
  }

  /**
   * Convert BullMQ job state to our status
   */
  private mapJobState(state: string): JobInfo['status'] {
    switch (state) {
      case 'waiting':
      case 'prioritized':
        return 'pending';
      case 'active':
        return 'active';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'delayed':
        return 'delayed';
      default:
        return 'pending';
    }
  }

  /**
   * Convert BullMQ job to JobInfo
   */
  private async jobToInfo(job: Job): Promise<JobInfo> {
    const state = await job.getState();
    return {
      id: job.id || '',
      name: job.name,
      payload: job.data,
      status: this.mapJobState(state),
      createdAt: new Date(job.timestamp).toISOString(),
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || DEFAULT_MAX_ATTEMPTS,
      progress: typeof job.progress === 'number' ? job.progress : undefined,
      result: job.returnvalue,
      error: job.failedReason,
      failedReason: job.failedReason,
    };
  }

  /**
   * Enqueue a job
   *
   * Uses atomic quota reservation to prevent race conditions where multiple
   * concurrent requests could exceed quota by passing the check before any tracking happens.
   *
   * Concurrency key handling uses Redis SETNX for atomic lock acquisition
   * to prevent race conditions where multiple concurrent enqueue() calls
   * could all pass the "check for existing job" step before any add a job.
   */
  async enqueue(options: EnqueueJobOptions): Promise<JobInfo> {
    // Validate job name (no sys: prefix for user jobs)
    if (options.name.startsWith('sys:')) {
      throw new Error('Job name cannot start with "sys:" (reserved for system jobs)');
    }

    // Reserve quota atomically BEFORE creating the job (prevents race condition)
    // This increments usage count immediately; we release on failure
    const meteringService = getInhouseMeteringService();
    const quotaReservation = await meteringService.reserveProjectQuota(this.projectId, 'job_runs', 1);

    if (!quotaReservation.allowed) {
      throw new Error(`Job quota exceeded: ${quotaReservation.used}/${quotaReservation.limit} job runs used this period`);
    }

    // Handle concurrency key atomically by storing job ID in the lock value
    // This prevents race conditions where state could change between lock acquisition and job creation
    if (options.concurrencyKey) {
      const lockKey = `job_concurrency:${this.projectId}:${options.concurrencyKey}`;

      // First, check if lock exists and get its value (the job ID)
      const existingJobId = await this.redis.get(lockKey);
      if (existingJobId) {
        // Lock exists - try to find and return that job
        const existingJob = await this.queue.getJob(existingJobId);
        if (existingJob) {
          // Job still exists, release quota and return it
          await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);
          return this.jobToInfo(existingJob);
        }
        // Job no longer exists (completed/failed) - delete the stale lock and proceed
        await this.redis.del(lockKey);
      }

      // Generate job ID first (use idempotencyKey if provided)
      const jobId = options.idempotencyKey || randomUUID();

      // Try to acquire lock with the job ID as value
      const acquired = await this.redis.set(
        lockKey,
        jobId,
        'EX',
        InhouseJobsService.CONCURRENCY_LOCK_TTL_SECONDS,
        'NX'
      );

      if (!acquired) {
        // Another process acquired it between our check and set
        // Get their job ID and return that job
        const otherJobId = await this.redis.get(lockKey);
        if (otherJobId) {
          const otherJob = await this.queue.getJob(otherJobId);
          if (otherJob) {
            await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);
            return this.jobToInfo(otherJob);
          }
        }
        await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);
        throw new Error(`Job with concurrency key "${options.concurrencyKey}" is already running or pending`);
      }

      // We have the lock with our job ID stored in it
      // Parse delay and timeout
      const delayMs = options.delay ? this.parseDelay(options.delay) : 0;
      const timeoutMs = Math.min(options.timeoutMs || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

      // Now create the job with that specific ID
      try {
        const job = await this.queue.add(
          options.name,
          {
            ...options.payload,
            _projectId: this.projectId,
            _concurrencyKey: options.concurrencyKey,
            _timeoutMs: timeoutMs,
          },
          {
            jobId,
            delay: delayMs,
            attempts: options.maxAttempts || DEFAULT_MAX_ATTEMPTS,
          }
        );

        return this.jobToInfo(job);
      } catch (error) {
        // Failed to create job - release our lock and quota
        await this.redis.del(lockKey);
        await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);
        throw error;
      }
    }

    // Non-concurrency-key flow: Check idempotency key if provided
    if (options.idempotencyKey) {
      const existingJob = await this.queue.getJob(options.idempotencyKey);
      if (existingJob) {
        // Release the quota reservation since we're returning an existing job
        await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);
        return this.jobToInfo(existingJob);
      }
    }

    // Parse delay
    const delayMs = options.delay ? this.parseDelay(options.delay) : 0;

    // Validate timeout
    const timeoutMs = Math.min(options.timeoutMs || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    try {
      // Add job to queue
      const job = await this.queue.add(
        options.name,
        {
          ...options.payload,
          _projectId: this.projectId,
          _timeoutMs: timeoutMs,
        },
        {
          jobId: options.idempotencyKey || randomUUID(),
          delay: delayMs,
          attempts: options.maxAttempts || DEFAULT_MAX_ATTEMPTS,
        }
      );

      // Quota was already reserved, no need to track again
      return this.jobToInfo(job);
    } catch (error) {
      // Release the quota reservation on failure
      await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);
      throw error;
    }
  }

  /**
   * Release a concurrency lock when a job completes or fails.
   * Should be called by the job processor when the job finishes.
   */
  async releaseConcurrencyLock(concurrencyKey: string): Promise<void> {
    const lockKey = `job_concurrency:${this.projectId}:${concurrencyKey}`;
    await this.redis.del(lockKey);
  }

  /**
   * Get a job by ID
   */
  async get(jobId: string): Promise<JobInfo | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }
    return this.jobToInfo(job);
  }

  /**
   * List jobs
   */
  async list(options: ListJobsOptions = {}): Promise<ListJobsResult> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    // Get jobs by status
    let jobs: Job[] = [];
    const status = options.status || 'all';

    if (status === 'all') {
      jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
    } else {
      const bullState = status === 'pending' ? 'waiting' : status;
      jobs = await this.queue.getJobs([bullState]);
    }

    // Filter by name if provided
    if (options.name) {
      jobs = jobs.filter(j => j.name === options.name);
    }

    // Sort
    const sortField = options.orderBy === 'processedAt' ? 'processedOn' : 'timestamp';
    const sortDir = options.orderDir === 'asc' ? 1 : -1;
    jobs.sort((a, b) => {
      const aVal = (a as any)[sortField] || 0;
      const bVal = (b as any)[sortField] || 0;
      return (aVal - bVal) * sortDir;
    });

    const total = jobs.length;

    // Paginate
    jobs = jobs.slice(offset, offset + limit);

    // Convert to JobInfo
    const jobInfos = await Promise.all(jobs.map(j => this.jobToInfo(j)));

    return {
      jobs: jobInfos,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Cancel a job
   *
   * Releases the quota reservation since the job will not run.
   */
  async cancel(jobId: string): Promise<{ success: boolean; job?: JobInfo }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { success: false };
    }

    const state = await job.getState();

    // Can only cancel waiting or delayed jobs
    if (state !== 'waiting' && state !== 'delayed') {
      throw new Error(`Cannot cancel job in state: ${state}`);
    }

    // Release concurrency lock if this job had one
    const concurrencyKey = job.data._concurrencyKey;
    if (concurrencyKey) {
      await this.releaseConcurrencyLock(concurrencyKey);
    }

    // Release the quota reservation since the job will not run
    const meteringService = getInhouseMeteringService();
    await meteringService.releaseProjectQuota(this.projectId, 'job_runs', 1);

    await job.remove();
    return { success: true };
  }

  /**
   * Retry a failed job
   */
  async retry(jobId: string): Promise<{ success: boolean; job?: JobInfo }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { success: false };
    }

    const state = await job.getState();

    // Can only retry failed jobs
    if (state !== 'failed') {
      throw new Error(`Cannot retry job in state: ${state}`);
    }

    await job.retry();
    const updatedJob = await this.queue.getJob(jobId);
    if (!updatedJob) {
      return { success: true };
    }

    return {
      success: true,
      job: await this.jobToInfo(updatedJob),
    };
  }

  // ===========================================================================
  // SCHEDULE MANAGEMENT (stored in database)
  // ===========================================================================

  /**
   * Create a schedule
   */
  async createSchedule(options: ScheduleOptions): Promise<ScheduleInfo> {
    // Validate cron expression (basic validation)
    const cronParts = options.cronExpression.split(' ');
    if (cronParts.length < 5 || cronParts.length > 6) {
      throw new Error('Invalid cron expression (must have 5 or 6 parts)');
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const { rows } = await getPool().query(
      `INSERT INTO inhouse_job_schedules (id, project_id, name, cron_expression, payload, timezone, active, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        id,
        this.projectId,
        options.name,
        options.cronExpression,
        JSON.stringify(options.payload),
        options.timezone || 'UTC',
        options.active !== false,
        options.description || null,
        now,
      ]
    );

    const row = rows[0];
    return this.rowToScheduleInfo(row);
  }

  /**
   * List schedules
   */
  async listSchedules(): Promise<{ schedules: ScheduleInfo[]; total: number }> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_job_schedules
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [this.projectId]
    );

    return {
      schedules: rows.map(row => this.rowToScheduleInfo(row)),
      total: rows.length,
    };
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<ScheduleInfo | null> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_job_schedules
       WHERE id = $1 AND project_id = $2`,
      [scheduleId, this.projectId]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.rowToScheduleInfo(rows[0]);
  }

  /**
   * Update a schedule
   */
  async updateSchedule(scheduleId: string, options: UpdateScheduleOptions): Promise<ScheduleInfo | null> {
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (options.cronExpression !== undefined) {
      // Validate cron expression
      const cronParts = options.cronExpression.split(' ');
      if (cronParts.length < 5 || cronParts.length > 6) {
        throw new Error('Invalid cron expression (must have 5 or 6 parts)');
      }
      updates.push(`cron_expression = $${paramIndex++}`);
      values.push(options.cronExpression);
    }

    if (options.payload !== undefined) {
      updates.push(`payload = $${paramIndex++}`);
      values.push(JSON.stringify(options.payload));
    }

    if (options.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(options.timezone);
    }

    if (options.active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(options.active);
    }

    if (options.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(options.description);
    }

    if (updates.length === 0) {
      // Nothing to update, return existing
      return this.getSchedule(scheduleId);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());

    values.push(scheduleId);
    values.push(this.projectId);

    const { rows } = await getPool().query(
      `UPDATE inhouse_job_schedules
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND project_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return null;
    }

    return this.rowToScheduleInfo(rows[0]);
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    const { rowCount } = await getPool().query(
      `DELETE FROM inhouse_job_schedules
       WHERE id = $1 AND project_id = $2`,
      [scheduleId, this.projectId]
    );

    return (rowCount ?? 0) > 0;
  }

  /**
   * Convert database row to ScheduleInfo
   */
  private rowToScheduleInfo(row: any): ScheduleInfo {
    return {
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      timezone: row.timezone,
      active: row.active,
      description: row.description,
      nextRunAt: row.next_run_at,
      lastRunAt: row.last_run_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.queueEvents.close();
    await this.redis.quit();
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const serviceInstances = new Map<string, InhouseJobsService>();

export function getInhouseJobsService(projectId: string): InhouseJobsService {
  let service = serviceInstances.get(projectId);
  if (!service) {
    service = new InhouseJobsService(projectId);
    serviceInstances.set(projectId, service);
  }
  return service;
}

// Clean up old instances periodically
setInterval(() => {
  if (serviceInstances.size > 100) {
    // Keep only most recent 50
    const entries = Array.from(serviceInstances.entries());
    for (let i = 0; i < 50; i++) {
      const entry = entries[i];
      if (!entry) break;
      const [key, service] = entry;
      service.close().catch(() => {}); // Ignore close errors
      serviceInstances.delete(key);
    }
  }
}, 60 * 60 * 1000); // Every hour
