# OpenTelemetry Verbose Logs Suppression Fix

## Problem

The server startup was cluttered with excessive OpenTelemetry instrumentation logs:
- "Loading instrumentation for @opentelemetry/instrumentation-*" messages for 40+ modules
- "OTEL_TRACES_SAMPLER value alwayson invalid" warnings
- "EnvDetector found resource" debug messages
- "ProcessDetector found resource" debug messages
- Console exporter output when not needed

This made it difficult to see actual application logs and errors.

## Issues Identified

1. **Invalid sampler configuration**: `OTEL_TRACES_SAMPLER=alwayson` should be `always_on`
2. **Console exporters active**: Even when OTLP endpoint not available
3. **Debug mode verbosity**: Too many instrumentation loading messages
4. **Missing OTLP collector**: Connection refused errors when collector not running

## Solution Implemented

### 1. Configuration Helper (`src/observability/otel-config.ts`)

Created a clean configuration helper that:
- Fixes invalid sampler names (`alwayson` → `always_on`)
- Conditionally disables console exporters
- Provides no-op exporters when OTLP not available
- Adjusts metric export intervals for different environments
- Suppresses verbose instrumentation logs

```typescript
export function getCleanOtelConfig() {
  return {
    suppressInstrumentationLogs: isDevelopment && process.env.OTEL_DEBUG !== 'true',
    useConsoleExporter: useConsoleExporter && !hasOtlpEndpoint,
    useOtlpExporter: hasOtlpEndpoint || isProduction,
    sampler: process.env.OTEL_TRACES_SAMPLER === 'alwayson' 
      ? 'always_on' 
      : process.env.OTEL_TRACES_SAMPLER,
    metricExportInterval: isDevelopment ? 300000 : 60000, // 5 min in dev, 1 min in prod
  };
}
```

### 2. Log Suppression (`suppressInstrumentationLogs`)

Intercepts console.log and console.info to filter out verbose patterns:
- Loading instrumentation messages
- Instrumentation patch messages
- Resource detector messages
- Invalid sampler warnings

### 3. Early Suppression in cluster-safe.ts

Applies log suppression BEFORE importing any OpenTelemetry modules:

```typescript
// CRITICAL: Suppress verbose instrumentation logs BEFORE any OpenTelemetry imports
if (process.env.NODE_ENV === 'development' && process.env.OTEL_DEBUG !== 'true') {
  const { suppressInstrumentationLogs } = require('./otel-config');
  suppressInstrumentationLogs();
  process.env.OTEL_LOG_LEVEL = process.env.OTEL_LOG_LEVEL || 'error';
}
```

### 4. Smart Exporter Selection

- Uses no-op exporters when OTLP endpoint unavailable
- Prevents "connection refused" errors
- Only uses console exporters when explicitly requested

### 5. Clean Startup Messages

Replaced verbose logs with clean, informative messages:
- Development: `🔭 OpenTelemetry: sheenapps-worker-dev (development)`
- Debug mode: Shows detailed configuration only when `OTEL_DEBUG=true`

## Environment Variables

### Recommended Settings

**Development (clean logs):**
```env
OTEL_EXPORTER_CONSOLE=false
OTEL_TRACES_SAMPLER=always_on
OTEL_LOG_LEVEL=error
OTEL_NODE_DISABLED_INSTRUMENTATIONS=dns,net
```

**Development (debugging):**
```env
OTEL_DEBUG=true
OTEL_LOG_LEVEL=debug
```

**Production:**
```env
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_LOG_LEVEL=warn
OTEL_EXPORTER_CONSOLE=false
```

## Testing

Run the test script to verify clean logs:
```bash
node test-clean-otel.js
```

Expected output:
- ✅ No "Loading instrumentation" messages
- ✅ No "invalid sampler" warnings
- ✅ No console exporter output
- ✅ Single clean startup message

## Benefits

1. **Cleaner Logs**: 40+ verbose lines reduced to 1 clean message
2. **Fixed Configuration**: No more invalid sampler warnings
3. **Graceful Degradation**: Works even without OTLP collector
4. **Debug Mode**: Verbose logs still available when needed
5. **Performance**: Reduced metric export frequency in development

## Related Fixes

This fix works alongside:
- **PM2 Cluster Mode Fix**: Prevents double-clustering conflicts
- **Double Initialization Fix**: Singleton pattern prevents duplicate SDK
- **Cluster-Safe Implementation**: Proper telemetry in all process modes

## Deployment

1. Set appropriate environment variables for your environment
2. Restart the application
3. Verify clean startup logs
4. Use `OTEL_DEBUG=true` if you need to troubleshoot

## Troubleshooting

If verbose logs still appear:
1. Check that `NODE_ENV` is set correctly
2. Ensure `OTEL_DEBUG` is not set to `true`
3. Verify the build includes the latest changes
4. Check that otel-config.ts is being loaded before otel.ts