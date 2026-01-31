# OpenTelemetry Re-enablement Guide for Production

## Executive Summary

We've implemented a **cluster-safe OpenTelemetry initialization** that resolves the PM2 cluster mode conflicts. The server team can now safely re-enable OpenTelemetry observability.

## Current Status

- **Previously**: `OTEL_SDK_DISABLED=true` (disabled due to cluster conflicts)
- **Now Ready**: Cluster-safe implementation that works with both fork and cluster modes
- **Recommendation**: Re-enable in fork mode first, then optionally move to cluster mode

## What Changed

### New Cluster-Safe Implementation
- Automatically detects execution mode (fork/cluster/standalone)
- Prevents port binding conflicts in cluster mode
- Implements IPC-based metrics aggregation for workers
- Follows OpenTelemetry official best practices

### Files Added/Modified
```
src/observability/
├── cluster-safe.ts    # NEW: Cluster-safe logic
├── init.ts           # UPDATED: Uses cluster-safe init
└── server.ts         # UPDATED: Cluster-safe shutdown
```

## Re-enablement Steps

### Step 1: Test in Staging (Fork Mode)

```bash
# In ecosystem.config.js or .env
OTEL_SDK_DISABLED=false
exec_mode: 'fork'  # Keep fork mode initially

# Deploy to staging
pm2 reload sheenapps-worker --env staging
```

### Step 2: Verify Telemetry

```bash
# Check logs for successful initialization
pm2 logs sheenapps-worker | grep "\[OTEL\]"

# Expected output:
# [OTEL] Initializing telemetry in fork mode
# [OTEL] Standalone/fork telemetry initialized successfully
```

### Step 3: Monitor for 24 Hours

Check for:
- ✅ No port binding errors
- ✅ Metrics appearing in your observability backend
- ✅ Traces being collected
- ✅ No performance degradation

### Step 4: Production Deployment

```bash
# After successful staging test
OTEL_SDK_DISABLED=false  # In production .env

# Deploy with zero downtime
pm2 reload sheenapps-worker --env production
```

## Optional: Enable Cluster Mode

After fork mode is stable, you can optionally enable cluster mode for better CPU utilization:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'sheenapps-worker',
    exec_mode: 'cluster',     // Change from 'fork'
    instances: 'max',         // Or specific number
    env: {
      OTEL_SDK_DISABLED: 'false'
    }
  }]
};
```

## Rollback Plan

If any issues occur:

### Quick Disable (No Restart)
```bash
# Just disable OpenTelemetry
OTEL_SDK_DISABLED=true pm2 reload sheenapps-worker
```

### Full Rollback
```bash
# Revert ecosystem.config.js
exec_mode: 'fork'
OTEL_SDK_DISABLED: 'true'

# Reload
pm2 reload sheenapps-worker
```

## Monitoring & Verification

### Check Process Mode
```bash
node scripts/test-otel-cluster-safe.js
```

### Health Check Endpoint
```bash
curl http://localhost:3000/myhealthz
```

### PM2 Monitoring
```bash
pm2 monit
pm2 describe sheenapps-worker
```

## Expected Benefits

After re-enabling OpenTelemetry:

1. **Full Observability**
   - Distributed tracing across services
   - Performance metrics and bottleneck identification
   - Error tracking with context

2. **Better Debugging**
   - Request flow visualization
   - Latency analysis
   - Resource utilization metrics

3. **Proactive Monitoring**
   - Alert on performance degradation
   - Track SLIs/SLOs
   - Capacity planning data

## Technical Details

### How It Works

1. **Fork Mode**: Standard OpenTelemetry initialization
2. **Cluster Mode**: 
   - Primary process: Full SDK + aggregation
   - Worker processes: Lightweight, IPC-based metrics
   - No port conflicts

### Environment Variables

```bash
# Core settings (already configured)
OTEL_SERVICE_NAME=sheenapps-worker
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling in production

# Enable/Disable
OTEL_SDK_DISABLED=false  # Set to 'true' to disable

# Optional: Set OTLP endpoint if not using default
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318
```

## Support & Troubleshooting

### Common Issues

1. **"Port already in use" error**
   - Verify cluster-safe implementation is loaded
   - Check only one process is binding to metrics port

2. **Missing metrics from workers**
   - Verify IPC communication is working
   - Check worker process logs

3. **High memory usage**
   - Reduce sampling rate
   - Check for metric cardinality explosion

### Debug Mode

Enable debug logging:
```bash
OTEL_DEBUG=true pm2 reload sheenapps-worker
```

### Contact

For issues or questions:
- Check logs for `[OTEL]` prefixed messages
- Review `/docs/OPENTELEMETRY_CLUSTER_SAFE_IMPLEMENTATION.md`
- Test with `scripts/test-otel-cluster-safe.js`

## Summary

✅ **Safe to re-enable** OpenTelemetry with the new cluster-safe implementation
✅ **Start with fork mode** (current production setting)
✅ **No code changes needed** - just set `OTEL_SDK_DISABLED=false`
✅ **Full rollback capability** if any issues arise

The implementation follows OpenTelemetry official recommendations and community best practices for handling Node.js cluster mode.