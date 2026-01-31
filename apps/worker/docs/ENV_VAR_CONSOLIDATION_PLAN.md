# Environment Variable Consolidation Plan

## Executive Summary
Consolidate Cloudflare environment variables to use `CF_*` pattern internally while maintaining `CLOUDFLARE_*` compatibility for Wrangler CLI.

## Current State Analysis

### Usage Statistics
- **CF_* pattern**: 276 occurrences across 50 files (preferred)
- **CLOUDFLARE_* pattern**: 121 occurrences across 36 files (legacy/Wrangler)

### Key Finding
**Wrangler CLI requires** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` - we cannot eliminate these entirely.

## Consolidation Strategy

### Principle: Internal Consistency, External Compatibility

1. **Use `CF_*` variables as the single source of truth**
2. **Set `CLOUDFLARE_*` variables only when needed for Wrangler**
3. **Remove direct usage of `CLOUDFLARE_*` from application code**

## Implementation Plan

### Phase 1: Update Core Services (Quick Wins)

#### 1.1 Update `r2GarbageCollector.ts`
**Current:**
```typescript
endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
```
**Change to:**
```typescript
endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
```

#### 1.2 Update `server.ts` 
**Current:**
```typescript
const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN_WORKERS;
const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
```
**Change to:**
```typescript
const cfToken = process.env.CF_API_TOKEN_WORKERS;
const cfAccountId = process.env.CF_ACCOUNT_ID;
```

### Phase 2: Centralize Wrangler Compatibility

#### 2.1 Update `wranglerDeploy.ts`
Keep the compatibility layer but make it explicit:

```typescript
// At the top of wranglerDeploy.ts
function getWranglerEnvironment() {
  // Wrangler CLI specifically requires CLOUDFLARE_* variables
  return {
    CLOUDFLARE_API_TOKEN: process.env.CF_API_TOKEN_WORKERS,
    CLOUDFLARE_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    // ... other env vars
  };
}

// Use in spawn commands
const wranglerEnv = getWranglerEnvironment();
const deployProcess = spawn('npx', ['wrangler', ...], {
  env: { ...process.env, ...wranglerEnv }
});
```

### Phase 3: Update Environment Validation

#### 3.1 Simplify `envValidation.ts`
Remove the fallback logic since we'll only use CF_* internally:

```typescript
// Remove deprecated variable handling
const required = [
  'CF_ACCOUNT_ID',
  'CF_API_TOKEN_WORKERS',
  'CF_API_TOKEN_R2',
  // ... other CF_* variables
];

// Remove the deprecated variable fallback logic
```

### Phase 4: Clean Up .env Files

#### 4.1 Update `.env.example`
Remove CLOUDFLARE_* variables entirely:
```bash
# --- Cloudflare Configuration ---
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN_WORKERS=your-workers-token
CF_API_TOKEN_R2=your-r2-token
# Remove: CLOUDFLARE_API_TOKEN (deprecated)
# Remove: CLOUDFLARE_ACCOUNT_ID (deprecated)
```

#### 4.2 Migration for Existing .env Files
Create a one-time migration to remove duplicates:
```bash
# Keep only CF_* variables
CF_ACCOUNT_ID='9a81e730a78395926ac4a371c6028a4d'
CF_API_TOKEN_WORKERS='T01Go052Hdljsgm_BaVa9g8Ypmxr_QNTMcUWZ_nR'
# Delete CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
```

## Files to Update

### High Priority (Direct Usage)
1. `src/services/r2GarbageCollector.ts` - Line 37
2. `src/server.ts` - Lines 169-170, 177-178, 460-461

### Medium Priority (Wrangler Integration)
3. `src/services/wranglerDeploy.ts` - Centralize Wrangler env setup

### Low Priority (Already Using Fallback)
4. Various test files and scripts

## Migration Script

Create `scripts/consolidate-env-vars.js`:
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Update code files to use CF_* pattern
const updates = [
  {
    file: 'src/services/r2GarbageCollector.ts',
    replacements: [
      ['process.env.CLOUDFLARE_ACCOUNT_ID', 'process.env.CF_ACCOUNT_ID']
    ]
  },
  {
    file: 'src/server.ts',
    replacements: [
      ['process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN_WORKERS', 
       'process.env.CF_API_TOKEN_WORKERS'],
      ['process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID', 
       'process.env.CF_ACCOUNT_ID']
    ]
  }
];

// Apply updates...
```

## Testing Plan

1. **Before Changes:**
   - Run `npm run validate:env` - should pass
   - Run `npm run check:conflicts` - note current state

2. **After Each Phase:**
   - Run build: `npm run build`
   - Run validation: `npm run validate:env`
   - Test Wrangler deployment in dev

3. **Final Validation:**
   - All tests pass
   - Wrangler deployment works
   - No CLOUDFLARE_* variables in application code (except wranglerDeploy.ts)

## Rollback Plan

If issues occur:
1. Git revert the consolidation commit
2. Restore .env from backup
3. Restart services

## Benefits

1. **Clarity**: Single source of truth (CF_* variables)
2. **Maintainability**: No confusion about which variable to use
3. **Compatibility**: Wrangler still works via explicit mapping
4. **Cleaner Code**: Remove 121 occurrences of deprecated pattern

## Timeline

- **Phase 1**: 30 minutes (simple replacements)
- **Phase 2**: 1 hour (refactor Wrangler integration)
- **Phase 3**: 30 minutes (update validation)
- **Phase 4**: 15 minutes (cleanup)
- **Testing**: 1 hour

**Total**: ~3 hours

## Success Criteria

✅ All application code uses CF_* variables exclusively
✅ Wrangler deployments still work
✅ No duplicate environment variables in .env
✅ Clear separation: CF_* for app, CLOUDFLARE_* only for Wrangler
✅ All tests pass