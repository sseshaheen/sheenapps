# Direct Mode - Local Testing Without Redis

Direct mode allows you to test the build preview functionality without requiring Redis or BullMQ to be running. This is useful for local development and testing.

## How it Works

When direct mode is enabled:
- Build requests are executed synchronously instead of being queued
- Mock implementations are used for external services (Database, Cloudflare KV/R2/Pages)
- The Claude CLI can be mocked to avoid requiring actual API calls

## Enabling Direct Mode

Direct mode is automatically enabled when either:
1. `SKIP_QUEUE=true` is set in your `.env` file
2. `NODE_ENV=development` is set

## Testing Direct Mode

### 1. Basic Direct Mode Test
Tests with real Claude CLI (requires Claude to be installed):
```bash
npm run test:direct
```

### 2. Fully Mocked Test
Tests with mock Claude response (no external dependencies):
```bash
npm run test:mock
```

## What Gets Mocked

In direct mode, the following services are mocked:
- **Database**: In-memory implementation storing project versions
- **Cloudflare KV**: Mock key-value store for latest version tracking
- **Cloudflare R2**: Mock object storage returning fake URLs
- **Cloudflare Pages**: Mock deployment returning preview URLs
- **Claude CLI** (optional): Can return mock generated code

## Architecture

Key files:
- `/src/config/directMode.ts` - Central configuration check
- `/src/services/directBuildService.ts` - Direct execution logic
- `/src/services/mockDatabase.ts` - In-memory database
- `/src/services/directModeMocks.ts` - Mock Cloudflare services
- `/scripts/testDirect.ts` - Test script for direct mode
- `/scripts/testDirectMock.ts` - Test script with full mocking

## Example Output

```json
{
  "success": true,
  "jobId": "direct-1753015406162",
  "versionId": "01K0KXRH9QS01ASTV20Y4NZW05",
  "status": "completed",
  "deploymentUrl": "https://mock-deployment-1753015406079.mock-project.pages.dev",
  "message": "Build executed directly (no queue)"
}
```

## Notes

- Direct mode is for local testing only
- Redis connection errors in logs are expected and can be ignored
- Mock deployments don't actually deploy anything
- Generated project files are still created in `~/projects/`