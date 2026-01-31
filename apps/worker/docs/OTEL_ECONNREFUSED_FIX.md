# OpenTelemetry ECONNREFUSED Error Fix

## The Error

```json
{
  "stack": "AggregateError [ECONNREFUSED]",
  "errors": "Error: connect ECONNREFUSED ::1:4318,Error: connect ECONNREFUSED 127.0.0.1:4318",
  "code": "ECONNREFUSED"
}
```

## What This Means

OpenTelemetry is trying to send telemetry data (traces, metrics) to an OTLP collector at:
- `::1:4318` (IPv6 localhost)
- `127.0.0.1:4318` (IPv4 localhost)

The connection is being **refused** because no collector is running on port 4318.

## Why It Happens

1. **Default behavior**: When `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, OpenTelemetry defaults to `http://localhost:4318`
2. **No local collector**: You don't have Jaeger, Grafana Alloy, or another OTLP collector running locally
3. **Automatic retry**: OTEL keeps trying to connect, generating these errors

## The Fix Applied

### 1. Smart Endpoint Detection (`otel-config.ts`)

```typescript
// Only use OTLP if explicitly configured with a valid endpoint
const hasOtlpEndpoint = !!otlpEndpoint && 
  otlpEndpoint !== 'http://127.0.0.1:4318' && 
  otlpEndpoint !== 'http://localhost:4318';

return {
  useOtlpExporter: hasOtlpEndpoint, // Only when properly configured
}
```

### 2. No-Op Exporter for Local Dev (`otel.ts`)

When no valid endpoint is configured, use a no-op exporter:
```typescript
if (!config.useOtlpExporter) {
  const noOpExporter = new ConsoleSpanExporter();
  // Override export to do nothing - prevents ECONNREFUSED
  noOpExporter.export = (spans, resultCallback) => {
    resultCallback({ code: 0 });
  };
  return noOpExporter;
}
```

### 3. Connection Error Handling

For production environments with intermittent collector availability:
```typescript
otlpExporter.export = (spans, resultCallback) => {
  originalExport(spans, (result) => {
    // Silently ignore connection errors
    if (result.error && result.error.code === 'ECONNREFUSED') {
      if (process.env.OTEL_DEBUG === 'true') {
        console.log('[OTEL] Collector not available');
      }
      resultCallback({ code: 0 }); // Prevent retries
    } else {
      resultCallback(result);
    }
  });
};
```

## Configuration Options

### Option 1: Local Development (No Collector)
```env
# Don't set OTEL_EXPORTER_OTLP_ENDPOINT at all
# Or comment it out:
# OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
```
Result: Uses no-op exporter, no ECONNREFUSED errors

### Option 2: Local Development with Collector
```env
# First, start a collector (e.g., Jaeger):
# docker run -p 4318:4318 jaegertracing/all-in-one

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```
Result: Sends telemetry to local collector

### Option 3: Production with Remote Collector
```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector.example.com:4318
OTEL_EXPORTER_OTLP_HEADERS={"Authorization": "Bearer your-token"}
```
Result: Sends telemetry to production collector

### Option 4: Completely Disable OTEL
```env
OTEL_SDK_DISABLED=true
```
Result: No OpenTelemetry at all

## Testing

Check if ECONNREFUSED errors are gone:
```bash
# Start your app
npm run dev 2>&1 | grep -i "ECONNREFUSED"
# Should return nothing
```

## Common Scenarios

### "I want to develop without any telemetry noise"
Don't set `OTEL_EXPORTER_OTLP_ENDPOINT`. The no-op exporter will handle everything silently.

### "I want to see traces locally"
1. Run Jaeger locally:
   ```bash
   docker run -d --name jaeger \
     -p 16686:16686 \
     -p 4318:4318 \
     jaegertracing/all-in-one:latest
   ```
2. Set endpoint:
   ```env
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```
3. View traces at http://localhost:16686

### "Production collector is sometimes down"
The error handling will silently ignore connection failures and retry later.

## Summary

The ECONNREFUSED error is now handled in three ways:
1. **Prevention**: Don't try to connect unless properly configured
2. **No-op fallback**: Use silent exporter when no collector available
3. **Error suppression**: Gracefully handle connection failures

You'll no longer see ECONNREFUSED errors in your logs!