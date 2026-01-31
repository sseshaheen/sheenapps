# OpenTelemetry Double Initialization Fix

## Problem

**Error**: `MetricReader can not be bound to a MeterProvider again`

This error was occurring even in fork mode because OpenTelemetry was being initialized **twice in the same process**:

1. First by `src/observability/init.ts` (imported by server.ts)
2. Second by `src/observability/index.ts` (side-effect initialization on import)

## Root Cause

The OpenTelemetry SDK's `MetricReader` can only be bound to one `MeterProvider`. When our code tried to initialize the SDK twice with the same reader instance, it threw this error.

## Solution Implemented

### 1. Made Initialization Idempotent

Updated `src/observability/otel.ts` to use a singleton pattern:

```typescript
// SDK singleton management
let sdk: NodeSDK | null = null;
let isInitializing = false;
let isInitialized = false;

export const initializeTelemetry = () => {
  // Prevent double initialization
  if (isInitialized || isInitializing) {
    return sdk;
  }
  
  isInitializing = true;
  
  // Create SDK with fresh readers/exporters
  sdk = new NodeSDK({
    // ... configuration
  });
  
  sdk.start();
  isInitialized = true;
  
  return sdk;
};
```

### 2. Removed Side-Effect Initialization

Removed the automatic initialization from `src/observability/index.ts`:

```diff
- // Initialize observability on import
- if (process.env.OTEL_SDK_DISABLED !== 'true') {
-   import('./otel').then(({ initializeTelemetry }) => {
-     initializeTelemetry();
-   }).catch((error) => {
-     console.error('Failed to initialize OpenTelemetry:', error);
-   });
- }
+ // REMOVED: Double initialization was happening here
+ // Initialization is now handled by src/observability/init.ts
```

### 3. Single Entry Point

Now there's only one initialization path:
- `server.ts` → imports `observability/init.ts` → calls `initializeClusterSafeTelemetry()` → calls `initializeTelemetry()`

## Key Principles

1. **Idempotent Initialization**: Calling `initializeTelemetry()` multiple times is safe
2. **Fresh Readers**: Always create new `MetricReader` instances when initializing
3. **Single Entry Point**: Only initialize from the main entry point (server.ts)
4. **No Side Effects**: Module imports should not trigger initialization

## Testing

Run the singleton test to verify:

```bash
node scripts/test-otel-singleton.js
```

Expected output:
- ✅ First initialization successful
- ✅ Second initialization handled correctly (idempotent)
- ✅ Direct initialization handled correctly (idempotent)
- ✅ Index import did not trigger initialization

## Deployment

1. **Pull latest code** with the singleton fix
2. **Restart PM2** in fork mode:
   ```bash
   pm2 reload sheenapps-claude-worker --env production
   ```
3. **Check logs** for successful initialization:
   ```bash
   pm2 logs sheenapps-claude-worker | grep OTEL
   ```
4. **No more errors** about MetricReader binding

## Benefits

- ✅ Fixes the "MetricReader can not be bound" error
- ✅ Works in both fork and cluster modes
- ✅ Prevents resource leaks from multiple SDKs
- ✅ Clean shutdown handling
- ✅ Future-proof against import order issues

## Related Fixes

This fix works in conjunction with:
- **PM2 Cluster Mode Fix**: Prevents double-clustering
- **Cluster-Safe Implementation**: Handles different process modes

Together, these ensure OpenTelemetry works correctly in all deployment scenarios.