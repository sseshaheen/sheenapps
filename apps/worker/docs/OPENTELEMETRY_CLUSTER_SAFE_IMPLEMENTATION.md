# OpenTelemetry Cluster-Safe Implementation

## Overview

This document describes the cluster-safe OpenTelemetry implementation for the Sheenapps Worker service, following official OpenTelemetry best practices and addressing PM2 cluster mode conflicts.

## Problem Statement

When using OpenTelemetry with PM2 cluster mode or Node.js native cluster module:
- Each worker process tries to bind to the same metrics export port
- This causes port binding conflicts and crashes
- Metrics are duplicated or lost
- The standard OpenTelemetry SDK doesn't handle cluster mode natively

## Solution Architecture

### Process Mode Detection

The implementation automatically detects the execution mode:
- **Standalone**: Single process, no PM2 or clustering
- **Fork**: PM2 fork mode (single process per PM2 instance)
- **PM2-Cluster**: PM2 cluster mode (PM2 handles clustering, app acts as standalone)
- **Primary**: Native cluster master/primary process (non-PM2)
- **Worker**: Native cluster worker process (non-PM2)

### Mode-Specific Behavior

#### Fork/Standalone Mode
- Full OpenTelemetry SDK initialization
- Direct metrics export to backend
- Standard tracing and logging
- No special handling needed

#### PM2 Cluster Mode
- Full OpenTelemetry SDK initialization
- Each PM2 worker acts as an independent process
- Direct metrics export from each worker
- **No use of Node.js cluster module** (prevents double-clustering)
- PM2 handles all clustering logic

#### Native Cluster Primary Mode
- Full OpenTelemetry SDK initialization
- Aggregates metrics from workers via IPC
- Exports aggregated metrics to backend
- Handles worker lifecycle events

#### Native Cluster Worker Mode
- Lightweight telemetry initialization
- No port binding (avoids conflicts)
- Forwards metrics to primary via IPC
- Tracing still works normally

## Implementation Details

### File Structure
```
src/observability/
├── cluster-safe.ts    # Cluster-safe initialization logic
├── init.ts           # Entry point (uses cluster-safe)
├── otel.ts           # Standard OpenTelemetry configuration
└── index.ts          # Module exports
```

### Key Components

1. **Process Mode Detection** (`getProcessMode()`)
   - Checks PM2 environment variables
   - Detects Node.js cluster mode
   - Returns appropriate mode identifier

2. **Cluster-Safe Initialization** (`initializeClusterSafeTelemetry()`)
   - Routes to appropriate initialization based on mode
   - Handles OTEL_SDK_DISABLED flag
   - Provides graceful error handling

3. **IPC-Based Metrics Aggregation**
   - Workers send metrics via `process.send()`
   - Primary aggregates metrics from all workers
   - Periodic flush to backend

## Configuration

### Environment Variables

```bash
# Enable/disable OpenTelemetry
OTEL_SDK_DISABLED=false  # Set to 'true' to disable

# Standard OpenTelemetry configuration
OTEL_SERVICE_NAME=sheenapps-worker
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'sheenapps-worker',
    script: './dist/server.js',
    exec_mode: 'fork',  // or 'cluster'
    instances: 1,       // or number of instances for cluster mode
    env: {
      OTEL_SDK_DISABLED: 'false',  // Re-enable OpenTelemetry
    }
  }]
};
```

## Migration Guide

### From Disabled OpenTelemetry

1. **Test in Fork Mode First**
   ```bash
   # In ecosystem.config.js
   exec_mode: 'fork'
   OTEL_SDK_DISABLED: 'false'
   ```

2. **Monitor for Issues**
   - Check logs for `[OTEL]` prefixed messages
   - Verify no port binding errors
   - Confirm metrics are being exported

3. **Enable Cluster Mode (if needed)**
   ```bash
   # After fork mode is stable
   exec_mode: 'cluster'
   instances: 'max'  # or specific number
   ```

### Rollback Procedure

If issues occur:
```bash
# Quick disable
OTEL_SDK_DISABLED=true pm2 reload sheenapps-worker

# Or revert ecosystem.config.js
exec_mode: 'fork'
OTEL_SDK_DISABLED: 'true'
```

## Testing

### Local Testing

```bash
# Test fork mode
OTEL_SDK_DISABLED=false npm run start

# Test cluster mode
OTEL_SDK_DISABLED=false pm2 start ecosystem.config.js --env cluster

# Check telemetry
curl http://localhost:3000/otel/health
```

### Verification Steps

1. **Fork Mode**
   - Single process should initialize telemetry
   - No port binding errors
   - Metrics exported normally

2. **PM2 Cluster Mode**
   - Each worker initializes full SDK independently
   - No double-clustering errors
   - Direct metrics export from each worker
   - No port conflicts (using OTLP collector)

3. **Native Cluster Mode** (without PM2)
   - Primary process initializes full SDK
   - Workers use IPC forwarding
   - No port conflicts
   - Aggregated metrics from all workers

## Known Limitations

1. **Native Cluster IPC Aggregation**
   - Only applies to native Node.js cluster (not PM2)
   - Worker metrics aggregated periodically (60s default)
   - Some real-time precision may be lost

2. **PM2 Cluster Metrics**
   - Each worker exports independently (no aggregation)
   - Metric deduplication handled by backend/collector
   - Slightly higher network traffic

3. **Complex Metrics in Native Cluster**
   - Histograms and summaries need special aggregation logic
   - Currently optimized for counters and gauges

## Best Practices

1. **Start with Fork Mode**
   - Simpler, no aggregation complexity
   - Sufficient for many workloads

2. **Use Cluster Mode When**
   - High CPU-bound workloads
   - Need to utilize multiple cores
   - Have proper load balancing

3. **Monitor Resource Usage**
   - Watch for memory leaks in workers
   - Monitor IPC message queue size
   - Track aggregation latency

## Troubleshooting

### Port Binding Errors
```
Error: bind EADDRINUSE 0.0.0.0:9464
```
**Solution**: Ensure cluster-safe initialization is being used

### Missing Metrics from Workers
**Check**:
- Worker processes are sending IPC messages
- Primary process is aggregating correctly
- No IPC message queue overflow

### High Memory Usage
**Consider**:
- Reduce metric cardinality
- Increase aggregation frequency
- Limit number of custom attributes

## References

- [OpenTelemetry Node.js Documentation](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [OpenTelemetry GitHub Issue #1252](https://github.com/open-telemetry/opentelemetry-js/issues/1252)
- [PM2 Cluster Mode Documentation](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [Node.js Cluster Module](https://nodejs.org/api/cluster.html)

## Future Improvements

1. **Official Cluster Support**
   - Monitor for official `@opentelemetry/instrumentation-cluster` package
   - Migrate when available

2. **Enhanced Aggregation**
   - Implement histogram/summary aggregation
   - Add percentile calculations

3. **Performance Optimizations**
   - Batch IPC messages
   - Implement backpressure handling
   - Add circuit breaker for failed exports