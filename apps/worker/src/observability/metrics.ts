/**
 * Custom Metrics for Worker Service
 * Defines and exports metrics for job processing, external calls, and system health
 */

import { metrics as otelMetrics, ValueType } from '@opentelemetry/api';

// Get meter instance
const meter = otelMetrics.getMeter('sheenapps-worker', '1.0.0');

// Job processing metrics - using Prometheus naming conventions
const workerJobDurationSeconds = meter.createHistogram('worker_job_duration_seconds', {
  description: 'Job processing duration in seconds',
  unit: 's',
  valueType: ValueType.DOUBLE,
});

const workerJobsProcessedTotal = meter.createCounter('worker_jobs_processed_total', {
  description: 'Total number of jobs processed',
  valueType: ValueType.INT,
});

const workerJobErrorsTotal = meter.createCounter('worker_job_errors_total', {
  description: 'Total number of job processing errors',
  valueType: ValueType.INT,
});

const workerActiveJobs = meter.createUpDownCounter('worker_active_jobs', {
  description: 'Number of currently active jobs',
  valueType: ValueType.INT,
});

// Heartbeat metric for health monitoring
const workerHeartbeat = meter.createUpDownCounter('worker_heartbeat', {
  description: 'Worker heartbeat signal',
  unit: '1',
  valueType: ValueType.INT,
});

// Start heartbeat
setInterval(() => {
  workerHeartbeat.add(1, { service: 'sheenapps-worker' });
}, 30000); // Every 30 seconds

// Queue metrics with Prometheus naming
const workerQueueSize = meter.createObservableGauge('worker_queue_size', {
  description: 'Current queue size',
  valueType: ValueType.INT,
});

const workerQueueLagSeconds = meter.createObservableGauge('worker_queue_lag_seconds', {
  description: 'Queue processing lag in seconds',
  unit: 's',
  valueType: ValueType.DOUBLE,
});

const workerQueueMessagesReceivedTotal = meter.createCounter('worker_queue_messages_received_total', {
  description: 'Total number of messages received from queue',
  valueType: ValueType.INT,
});

const workerQueueMessagesDeletedTotal = meter.createCounter('worker_queue_messages_deleted_total', {
  description: 'Total number of messages deleted from queue',
  valueType: ValueType.INT,
});

// External service metrics with Prometheus naming
const workerExternalCallDurationSeconds = meter.createHistogram('worker_external_call_duration_seconds', {
  description: 'External service call duration in seconds',
  unit: 's',
  valueType: ValueType.DOUBLE,
});

const workerExternalCallErrorsTotal = meter.createCounter('worker_external_call_errors_total', {
  description: 'Total number of external service call errors',
  valueType: ValueType.INT,
});

// Database metrics with Prometheus naming
const workerDbConnectionPoolSize = meter.createObservableGauge('worker_db_connection_pool_size', {
  description: 'Database connection pool size',
  valueType: ValueType.INT,
});

const workerDbQueryDurationSeconds = meter.createHistogram('worker_db_query_duration_seconds', {
  description: 'Database query duration in seconds',
  unit: 's',
  valueType: ValueType.DOUBLE,
});

// Cache metrics with Prometheus naming
const workerCacheHitRatio = meter.createObservableGauge('worker_cache_hit_ratio', {
  description: 'Cache hit ratio',
  valueType: ValueType.DOUBLE,
});

const workerCacheOperationsTotal = meter.createCounter('worker_cache_operations_total', {
  description: 'Total number of cache operations',
  valueType: ValueType.INT,
});

// System health metrics with Prometheus naming
const workerHealthStatus = meter.createObservableGauge('worker_health_status', {
  description: 'Health check status (1 = healthy, 0 = unhealthy)',
  valueType: ValueType.INT,
});

// Memory metrics with Prometheus naming
const workerProcessMemoryBytes = meter.createObservableGauge('worker_process_memory_bytes', {
  description: 'Process memory usage in bytes',
  unit: 'bytes',
  valueType: ValueType.INT,
});

// Queue monitoring state (for observable gauges)
let queueStats = {
  size: 0,
  lag: 0,
  lastChecked: Date.now(),
};

let dbStats = {
  poolSize: 0,
  activeConnections: 0,
  idleConnections: 0,
};

let cacheStats = {
  hits: 0,
  misses: 0,
  operations: 0,
};

let healthStatus = {
  isHealthy: true,
  lastCheck: Date.now(),
};

// Register callbacks for observable gauges
workerQueueSize.addCallback((result: any) => {
  result.observe(queueStats.size, {
    'queue_name': 'default',
  });
});

workerQueueLagSeconds.addCallback((result: any) => {
  result.observe(queueStats.lag, {
    'queue_name': 'default',
  });
});

workerDbConnectionPoolSize.addCallback((result: any) => {
  result.observe(dbStats.poolSize, {
    'db_state': 'total',
  });
  result.observe(dbStats.activeConnections, {
    'db_state': 'active',
  });
  result.observe(dbStats.idleConnections, {
    'db_state': 'idle',
  });
});

workerCacheHitRatio.addCallback((result: any) => {
  const total = cacheStats.hits + cacheStats.misses;
  const ratio = total > 0 ? cacheStats.hits / total : 0;
  result.observe(ratio);
});

workerHealthStatus.addCallback((result: any) => {
  result.observe(healthStatus.isHealthy ? 1 : 0);
});

workerProcessMemoryBytes.addCallback((result: any) => {
  const usage = process.memoryUsage();
  result.observe(usage.heapUsed, {
    'memory_type': 'heap_used',
  });
  result.observe(usage.heapTotal, {
    'memory_type': 'heap_total',
  });
  result.observe(usage.rss, {
    'memory_type': 'rss',
  });
  result.observe(usage.external, {
    'memory_type': 'external',
  });
});

// Export metric recording functions
export const metrics = {
  /**
   * Record job processing metrics
   */
  recordJobMetrics(
    jobType: string,
    duration: number,
    success: boolean,
    queue?: string
  ): void {
    const labels = {
      'job_type': jobType,
      'status': success ? 'success' : 'failure',
      'queue_name': queue || 'default',
    };

    // Convert duration from ms to seconds for Prometheus convention
    workerJobDurationSeconds.record(duration / 1000, labels);
    workerJobsProcessedTotal.add(1, labels);

    if (!success) {
      workerJobErrorsTotal.add(1, {
        'job_type': jobType,
        'queue_name': queue || 'default',
      });
    }
  },

  /**
   * Track active job count
   */
  incrementActiveJobs(jobType: string): void {
    workerActiveJobs.add(1, { 'job_type': jobType });
  },

  decrementActiveJobs(jobType: string): void {
    workerActiveJobs.add(-1, { 'job_type': jobType });
  },

  /**
   * Record queue metrics
   */
  recordQueueMessage(operation: 'received' | 'deleted', queue?: string): void {
    const labels = { 'queue_name': queue || 'default' };
    
    if (operation === 'received') {
      workerQueueMessagesReceivedTotal.add(1, labels);
    } else {
      workerQueueMessagesDeletedTotal.add(1, labels);
    }
  },

  updateQueueStats(size: number, lag: number): void {
    queueStats.size = size;
    queueStats.lag = lag;
    queueStats.lastChecked = Date.now();
  },

  /**
   * Record external service call metrics
   */
  recordExternalCallMetrics(
    service: string,
    operation: string,
    duration: number,
    success: boolean
  ): void {
    const labels = {
      'peer_service': service,
      'peer_operation': operation,
      'status': success ? 'success' : 'failure',
    };

    // Convert duration from ms to seconds
    workerExternalCallDurationSeconds.record(duration / 1000, labels);

    if (!success) {
      workerExternalCallErrorsTotal.add(1, {
        'peer_service': service,
        'peer_operation': operation,
      });
    }
  },

  /**
   * Record database metrics
   */
  recordDatabaseQuery(
    operation: string,
    table: string,
    duration: number
  ): void {
    // Convert duration from ms to seconds
    workerDbQueryDurationSeconds.record(duration / 1000, {
      'db_operation': operation,
      'db_table': table,
    });
  },

  updateDatabasePoolStats(
    poolSize: number,
    active: number,
    idle: number
  ): void {
    dbStats.poolSize = poolSize;
    dbStats.activeConnections = active;
    dbStats.idleConnections = idle;
  },

  /**
   * Record cache metrics
   */
  recordCacheMetrics(operation: string, hit?: boolean): void {
    workerCacheOperationsTotal.add(1, {
      'cache_operation': operation,
    });

    if (operation === 'get' && hit !== undefined) {
      if (hit) {
        cacheStats.hits++;
      } else {
        cacheStats.misses++;
      }
    }
    cacheStats.operations++;
  },

  /**
   * Update health status
   */
  updateHealthStatus(isHealthy: boolean): void {
    healthStatus.isHealthy = isHealthy;
    healthStatus.lastCheck = Date.now();
  },

  /**
   * Create custom histogram buckets for specific metrics
   */
  getHistogramBuckets(metricName: string): number[] {
    switch (metricName) {
      case 'job.duration':
        // Buckets: 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s, 30s, 60s
        return [10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000];
      
      case 'external.call.duration':
        // Buckets: 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
        return [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
      
      case 'db.query.duration':
        // Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s
        return [1, 5, 10, 25, 50, 100, 250, 500, 1000];
      
      default:
        // Default exponential buckets
        return [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    }
  },
};