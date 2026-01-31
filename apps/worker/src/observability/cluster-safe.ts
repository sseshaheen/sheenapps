/**
 * Cluster-Safe OpenTelemetry Initialization
 * 
 * This module implements best practices for using OpenTelemetry with Node.js
 * in both fork and cluster modes, following official OpenTelemetry recommendations.
 * 
 * Based on:
 * - OpenTelemetry GitHub Issue #1252 (cluster mode metrics)
 * - Official OpenTelemetry Node.js documentation
 * - Community best practices for metrics aggregation in cluster mode
 */

// CRITICAL: Suppress verbose instrumentation logs BEFORE any OpenTelemetry imports
// This must happen before any OTEL modules are loaded to prevent verbose output
if (process.env.NODE_ENV === 'development' && process.env.OTEL_DEBUG !== 'true') {
  // Use require to ensure this happens before ES6 imports
  const { suppressInstrumentationLogs } = require('./otel-config');
  suppressInstrumentationLogs();
  
  // Also set log level to reduce verbosity
  process.env.OTEL_LOG_LEVEL = process.env.OTEL_LOG_LEVEL || 'error';
}

import cluster from 'cluster';
import { metrics as otelMetrics } from '@opentelemetry/api';
import { initializeTelemetry as originalInitTelemetry, shutdownTelemetry } from './otel';

/**
 * Detects the current process mode (PM2 fork, cluster, or standalone)
 * 
 * IMPORTANT: When PM2 runs in cluster mode, PM2 is the cluster manager.
 * Our app should NOT use node:cluster module in this case to avoid double-clustering.
 */
export function getProcessMode(): 'primary' | 'worker' | 'fork' | 'standalone' | 'pm2-cluster' {
  // Check if running under PM2
  const isPM2 = !!process.env.PM2_HOME || !!process.env.pm_id || !!process.env.NODE_APP_INSTANCE;
  const pm2ExecMode = process.env.exec_mode;
  
  // PM2 cluster mode - PM2 is handling clustering, we should act as standalone
  if (isPM2 && pm2ExecMode === 'cluster') {
    return 'pm2-cluster';
  }
  
  // PM2 fork mode - we can use our own clustering if needed
  if (isPM2 && pm2ExecMode === 'fork') {
    return 'fork';
  }
  
  // Only check cluster module if NOT in PM2 cluster mode
  // This prevents double-clustering issues
  if (!isPM2) {
    // Cluster mode detection for non-PM2 environments
    if (cluster.isPrimary) {
      return 'primary';
    }
    
    if (cluster.isWorker) {
      return 'worker';
    }
  }
  
  // Standalone process (no PM2, no cluster)
  return 'standalone';
}

/**
 * Cluster-safe telemetry initialization following OpenTelemetry best practices
 * 
 * Behavior by mode:
 * - standalone/fork: Full telemetry initialization
 * - primary: Full telemetry initialization (master process)
 * - worker: Limited initialization with IPC-based metrics aggregation
 */
export function initializeClusterSafeTelemetry(): void {
  const mode = getProcessMode();
  
  // Check if explicitly disabled
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    console.log(`[OTEL] Telemetry disabled via OTEL_SDK_DISABLED (mode: ${mode})`);
    return;
  }
  
  console.log(`[OTEL] Initializing telemetry in ${mode} mode`);
  
  switch (mode) {
    case 'standalone':
    case 'fork':
    case 'pm2-cluster':  // PM2 cluster workers act as standalone processes
      // Full initialization for non-clustered modes
      // In PM2 cluster mode, PM2 handles clustering, so each worker is standalone
      initializeStandaloneTelemetry();
      break;
      
    case 'primary':
      // Master process handles telemetry export (only for native cluster, not PM2)
      initializePrimaryTelemetry();
      break;
      
    case 'worker':
      // Workers use lightweight telemetry with IPC (only for native cluster, not PM2)
      initializeWorkerTelemetry();
      break;
  }
}

/**
 * Initialize telemetry for standalone/fork/pm2-cluster mode
 * This is the standard initialization with full capabilities
 * 
 * Note: PM2 cluster workers are treated as standalone because PM2 handles clustering
 */
function initializeStandaloneTelemetry(): void {
  try {
    // Add unique instance identifier for better observability
    if (process.env.pm_id) {
      process.env.OTEL_RESOURCE_ATTRIBUTES = [
        process.env.OTEL_RESOURCE_ATTRIBUTES,
        `service.instance.id=${process.env.HOSTNAME || 'unknown'}-pm${process.env.pm_id}`
      ].filter(Boolean).join(',');
    }
    
    // For PM2 cluster mode, add worker instance info
    if (process.env.NODE_APP_INSTANCE) {
      process.env.OTEL_RESOURCE_ATTRIBUTES = [
        process.env.OTEL_RESOURCE_ATTRIBUTES,
        `pm2.instance=${process.env.NODE_APP_INSTANCE}`
      ].filter(Boolean).join(',');
    }
    
    // Use the original initialization
    originalInitTelemetry();
    
    const mode = getProcessMode();
    if (mode === 'pm2-cluster') {
      console.log(`[OTEL] PM2 cluster worker ${process.env.NODE_APP_INSTANCE} telemetry initialized (PM2 handles clustering)`);
    } else {
      console.log('[OTEL] Standalone/fork telemetry initialized successfully');
    }
  } catch (error) {
    console.error('[OTEL] Failed to initialize standalone telemetry:', error);
    // Don't crash the process - continue without telemetry
  }
}

/**
 * Initialize telemetry for cluster primary/master process
 * Handles metrics aggregation from workers
 */
function initializePrimaryTelemetry(): void {
  try {
    // Initialize full telemetry
    originalInitTelemetry();
    
    // Set up IPC listener for worker metrics
    setupWorkerMetricsAggregation();
    
    console.log('[OTEL] Primary process telemetry initialized with worker aggregation');
  } catch (error) {
    console.error('[OTEL] Failed to initialize primary telemetry:', error);
  }
}

/**
 * Initialize lightweight telemetry for cluster workers
 * Sends metrics to primary via IPC instead of direct export
 */
function initializeWorkerTelemetry(): void {
  try {
    // Workers should NOT initialize the full SDK to avoid port conflicts
    // Instead, set up IPC-based metric forwarding
    
    console.log(`[OTEL] Worker ${process.pid} using IPC-based telemetry`);
    
    // Create a custom metric provider that forwards to master
    setupWorkerMetricForwarding();
    
    // Note: Tracing can still work in workers as it doesn't bind ports
    // But metrics need special handling to avoid conflicts
    
  } catch (error) {
    console.error('[OTEL] Failed to initialize worker telemetry:', error);
  }
}

/**
 * Set up metrics aggregation in the primary process
 * Listens for metrics from workers via IPC
 */
function setupWorkerMetricsAggregation(): void {
  if (!cluster.isPrimary) return;
  
  cluster.on('message', (worker, message) => {
    if (message && message.type === 'otel-metric') {
      handleWorkerMetric(worker, message.data);
    }
  });
  
  // Periodically flush aggregated metrics
  setInterval(() => {
    flushAggregatedMetrics();
  }, 60000); // Every minute
}

/**
 * Set up metric forwarding in worker processes
 * Sends metrics to primary via IPC
 */
function setupWorkerMetricForwarding(): void {
  if (!cluster.isWorker || !process.send) return;
  
  // Override the default metric recording to forward via IPC
  const meter = otelMetrics.getMeter('worker-metrics');
  
  // Example: Create a counter that forwards to master
  const requestCounter = meter.createCounter('http_requests_total', {
    description: 'Total HTTP requests'
  });
  
  // Wrap the original add method to forward via IPC
  const originalAdd = requestCounter.add.bind(requestCounter);
  requestCounter.add = (value: number, attributes?: any) => {
    // Forward to master via IPC
    if (process.send) {
      process.send({
        type: 'otel-metric',
        data: {
          name: 'http_requests_total',
          value,
          attributes,
          timestamp: Date.now(),
          workerId: cluster.worker?.id
        }
      });
    }
    
    // Still call original for local processing if needed
    return originalAdd(value, attributes);
  };
}

/**
 * Handle metrics received from workers
 */
function handleWorkerMetric(worker: any, metricData: any): void {
  // Aggregate metrics from workers
  // This is where you'd implement the actual aggregation logic
  
  const meter = otelMetrics.getMeter('aggregated-metrics');
  const counter = meter.createCounter(metricData.name);
  
  // Add worker ID to attributes for tracking
  const attributes = {
    ...metricData.attributes,
    worker_id: metricData.workerId
  };
  
  counter.add(metricData.value, attributes);
}

/**
 * Flush aggregated metrics to the backend
 */
function flushAggregatedMetrics(): void {
  // This would trigger the metric reader to export
  // The actual flush happens via the configured metric exporter
  console.log('[OTEL] Flushing aggregated metrics');
}

/**
 * Graceful shutdown handler for cluster-safe telemetry
 */
export async function shutdownClusterSafeTelemetry(): Promise<void> {
  const mode = getProcessMode();
  console.log(`[OTEL] Shutting down telemetry in ${mode} mode`);
  
  try {
    if (mode === 'primary' || mode === 'standalone' || mode === 'fork' || mode === 'pm2-cluster') {
      // Use the centralized shutdown function
      await shutdownTelemetry();
    }
    
    console.log('[OTEL] Telemetry shutdown complete');
  } catch (error) {
    console.error('[OTEL] Error during telemetry shutdown:', error);
  }
}

// Export for testing
export const _testing = {
  setupWorkerMetricsAggregation,
  setupWorkerMetricForwarding,
  handleWorkerMetric,
  flushAggregatedMetrics
};