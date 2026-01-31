# Deployment Process

## Overview
This project uses Wrangler CLI to deploy to Cloudflare Pages. All deployments are handled through the Wrangler integration, which ensures content is immediately accessible.

## Prerequisites
- Wrangler CLI installed (`npm install -g wrangler` or via Homebrew)
- Cloudflare account with Pages enabled
- API token with proper permissions

## Environment Variables
The following environment variables are required:

```bash
# Cloudflare Authentication
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
CF_API_TOKEN_WORKERS=your-api-token  # Same as CLOUDFLARE_API_TOKEN
CF_ACCOUNT_ID=your-account-id        # Same as CLOUDFLARE_ACCOUNT_ID

# Cloudflare Pages Project
CF_PAGES_PROJECT_NAME=sheenapps-preview  # Or your project name
```

## How Deployment Works

1. **Build Phase**: Claude generates code and runs `pnpm build`
2. **Directory Detection**: System detects build output directory (dist, build, etc.)
3. **Wrangler Deployment**: Deploys directory contents to Cloudflare Pages
4. **R2 Storage**: Creates zip archive for permanent storage
5. **Status Tracking**: Monitors deployment status via Cloudflare API

## Deployment Flow

```
User Request
    ↓
Claude Generates Code
    ↓
Build Project (pnpm build)
    ↓
Detect Build Output Directory
    ↓
Deploy via Wrangler CLI ← This ensures no 404s!
    ↓
Create Zip for R2 Storage
    ↓
Return Deployment URL
```

## Key Features

- **Immediate Availability**: Deployed content is accessible immediately (no 404s)
- **Branch Deployments**: Supports branch-specific URLs
- **Automatic Cleanup**: Old deployments are deleted to manage quotas
- **Git Integration**: Tracks versions in local git repository

## Testing Deployments

To test the deployment system:

```bash
# Test Wrangler integration
npm run test:wrangler

# Test full integration
npm run test:worker
```

## Troubleshooting

### Wrangler Not Found
If you see "Wrangler CLI is not available", ensure:
1. Wrangler is installed globally
2. The path is correct in `wranglerDeploy.ts`
3. Environment variables are set

### Authentication Errors
Verify your API token has these permissions:
- Account: Workers Scripts (edit)
- Zone: Workers Routes (edit)

### Deployment Failures
Check:
1. Build output directory exists
2. Project name is correct
3. Account has Pages enabled
4. No quota limits reached