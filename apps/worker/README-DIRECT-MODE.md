# Direct Mode Testing (No Redis Required)

## Overview

Direct mode allows you to test the build preview functionality without requiring Redis or BullMQ. This is ideal for local development and testing individual prompts.

## How It Works

When `SKIP_QUEUE=true` is set in your environment, the system:
- Bypasses the Redis queue completely
- Executes builds synchronously
- Returns results immediately in the API response

## Usage

### Method 1: Using the test script

```bash
# Test with default prompt
npm run test:direct

# Test with custom prompt
npm run test:direct --prompt "Create a React app with a navbar"
```

### Method 2: Setting environment variable

```bash
# Add to .env file
SKIP_QUEUE=true

# Then run the server normally
npm run dev

# Use the regular test script
npm run test:worker
```

### Method 3: For one-time testing

```bash
# Set env var temporarily
SKIP_QUEUE=true npm run dev
```

## Important Notes

1. **Performance**: Direct mode executes builds synchronously, which means:
   - The API request will take longer to respond (up to several minutes)
   - The server cannot handle other requests while building
   - This is why production systems use queues

2. **Development Only**: This mode is intended for local development only. In production, always use the queue system with Redis.

3. **No Concurrent Builds**: Unlike the queue system, direct mode cannot handle multiple builds simultaneously.

## Troubleshooting

If you see Redis connection errors when not using direct mode:
1. Ensure Redis is installed: `brew install redis` (macOS)
2. Start Redis: `redis-server`
3. Or enable direct mode: `SKIP_QUEUE=true`

## Example Output

When running in direct mode, you'll see:
```
🎯 Direct mode enabled - skipping Redis/BullMQ setup
   Builds will execute synchronously without queueing
```

And when making requests:
```
🎯 Direct mode enabled - bypassing queue
🎯 Executing build directly (no queue)...
✅ Direct build completed: {
  versionId: "01HXABC123...",
  deploymentUrl: "https://preview-abc123.pages.dev",
  status: "completed"
}
```