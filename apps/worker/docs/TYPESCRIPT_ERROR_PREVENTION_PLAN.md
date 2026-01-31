# TypeScript Strict Mode Migration Plan

> **Goal**: Fix ~454 latent type issues and enable stricter TypeScript options without a "big bang" PR.

---

## Current State

| Config | Errors | Status |
|--------|--------|--------|
| Current tsconfig | 0 | ✅ Build passes |
| With strict options | 21 | 🔄 In progress (was 454, 95% reduction) |

### Progress Log

| Date | Action | Errors Before | Errors After |
|------|--------|---------------|--------------|
| 2026-01-08 | Initial assessment | - | 454 |
| 2026-01-08 | Updated ProjectVersion, BuildMetrics, ClaudeSessionMetrics | 454 | 444 |
| 2026-01-08 | Updated CleanEventData, IntegrationStatus, CircuitBreakerMetrics | 444 | 426 |
| 2026-01-08 | Updated SecurePathValidator.logSecurityEvent | 426 | 404 |
| 2026-01-08 | Updated SessionCheckpoint, RecommendationsPromptOpts | 404 | 402 |
| 2026-01-08 | Fixed RecentActivity, ClaudeExecutorResult, StripeEnvironmentConfig | 402 | 389 |
| 2026-01-08 | Fixed SanityIntegrationData, RecaptchaVerifyResult, BuildInitiationOptions | 389 | 380 |
| 2026-01-08 | Fixed SignatureHeaders, StatusRequestOptions, AnalyticsEvent + index access fixes | 380 | 376 |
| 2026-01-08 | Fixed projectExport types (18 interfaces) | 376 | 371 |
| 2026-01-08 | Fixed HistoricalLogQuery, R2UploadOptions, projectFiles types, referrals types | 371 | 368 |
| 2026-01-08 | Fixed NotificationContext, SanityPreview, GuardrailContext, FileAccess, Presence, LogStreaming | 368 | 356 |
| 2026-01-08 | Fixed metricsService, aiTimeBillingService, integrations types, enhancedChatService | 356 | 352 |
| 2026-01-08 | Fixed service method params: advisorMatching, sseConnection, exportJobs, sanityPreview, breakglass | 352 | 347 |
| 2026-01-08 | Fixed 30+ interfaces: unifiedLogger, workingDirectoryAudit, vercelAPI, aiTimeBilling, promoCore, etc. | 347 | 316 |
| 2026-01-08 | Fixed ProjectVersion, AuditQuery, VercelTokens, JobContext, DeploymentMetrics, PatternSearchOptions | 316 | 302 |
| 2026-01-08 | Fixed findProjectBy, updateProjectStatus, ErrorMetric | 302 | 301 |
| 2026-01-08 | Fixed r2ExportUpload, modularQueues, sanityBreakglassService, r2GarbageCollector | 301 | 295 |
| 2026-01-08 | Fixed AdminRoleInfo, DraftResult, status adapters, advisorNotification, DeployOptions | 295 | 283 |
| 2026-01-08 | Fixed SSEChatEvent, ChatMessage, AuditEntry interfaces | 283 | 265 |
| 2026-01-08 | Fixed ClaudeResolution, ClaudeContext, DetectionResult, DeploymentManifest, BaseSSEEvent | 265 | 259 |
| 2026-01-08 | Fixed ErrorContext, ErrorClassification, BulkMigrationStatus, BuildStatusEvent, ConnectionEvent | 259 | 255 |
| 2026-01-08 | Fixed UserBuildEvent, RecommendationsResponse, ValidationResult, Fix, FixApplication | 255 | 246 |
| 2026-01-08 | Fixed PatternMatchResult, ActionRequest, ActionResult, ActionRecord, SignatureValidationResult | 246 | 235 |
| 2026-01-08 | Fixed IntegrationStatusEvent, AdapterContext, MFAComplianceCheck, BudgetCheckResult, MigrationSSE events | 235 | 226 |
| 2026-01-08 | Fixed VerificationStatus, PlanChangeResult, MultiProviderValidationResult, ReservationResult, TaskPlan | 226 | 217 |
| 2026-01-08 | Fixed SSEConnectionInfo, SanityBreakglassCredentials, ScenarioResult | 217 | 213 |
| 2026-01-10 | Linter changes added ~120 new errors; Fixed Customer360 interfaces, UnifiedChatResponse | 333 | 321 |
| 2026-01-10 | Fixed WorkingDirectorySyncResult, WorkingDirectoryStatus, FrameworkConfig, SessionResult | 321 | 307 |
| 2026-01-10 | Fixed Vercel OAuth/API return types, RecoveryResult, WranglerDeployResult, zipExportService | 307 | 302 |
| 2026-01-10 | Fixed TS2375 errors in fixValidator, fixSandbox, claudeCLIMainProcess, wranglerDeploy | 302 | 292 |
| 2026-01-10 | Fixed TS18048 errors: claudeProvider, createPreview, advisorWorkspace, builderCompatibility, streamWorker | 292 | 263 |
| 2026-01-10 | Fixed typeScriptFixer, claudeErrorResolver, migrationOrchestratorService, modularQueues | 263 | 236 |
| 2026-01-10 | Fixed progress.ts, careers.ts, internalEvents.ts array access patterns | 236 | 231 |
| 2026-01-10 | Fixed cluster.ts, enhancedChatService, enhancedWebhookProcessor, chatStreamProcessor | 231 | 219 |
| 2026-01-10 | Fixed migrationAITimeService, StripeProvider, promotionValidationService, promotionAdapters | 219 | 210 |
| 2026-01-10 | Fixed aiPromptService, builderCompatibilityService, cloudflareThreeLaneDeployment, sseConnectionManager | 210 | 203 |
| 2026-01-10 | Fixed AlertService, Customer360Service, CustomerHealthService, FeatureFlagService, IncidentManagementService interfaces | 203 | 194 |
| 2026-01-10 | Fixed localeUtils, sanitizeHtml, adminPromotionsMultiProvider, adminCustomerHealth implicit any types | 194 | 181 |
| 2026-01-10 | Fixed careers.ts, aiTimeBillingService, fixValidator, gitDiff, eventStream, integrationEventService | 181 | 165 |
| 2026-01-10 | Fixed enhancedChatService, chatStreamProcessor, aiToolboxService, errorMessageRenderer | 165 | 161 |
| 2026-01-10 | Fixed migrationAITimeService, migrationRecoveryService, migrationVerificationService, serverRegistryService, promotionValidationService | 161 | 156 |
| 2026-01-10 | Fixed AtRiskCustomer interface, buildInitiationService type cast | 156 | 154 |
| 2026-01-10 | Fixed Redis config in chatBroadcastService, presenceService, sseConnectionManager | 154 | 148 |
| 2026-01-10 | Fixed taskExecutor, IncidentManagementService, errorPatternDatabase, migrationAnalyticsService | 148 | 141 |
| 2026-01-10 | Fixed AdminMetricsService implicit any types (slo, reduce callbacks) | 141 | 135 |
| 2026-01-10 | Fixed workingDirectoryService, wranglerDeploy, workspaceHistoricalLogService, zipExportService | 135 | 128 |
| 2026-01-10 | Fixed workingDirectorySecurityService, workspaceFileAccessService, smokeTestModular | 128 | 123 |
| 2026-01-10 | Major fixes: ServerLoggingService convenience methods, alertEvaluatorWorker, streamWorker null checks | 123 | 57 |
| 2026-01-10 | Fixed recommendationsWorker, modularWorkers, integrations exports, jsonHealer, r2SignedUrls, sanitizeHtml | 57 | 42 |
| 2026-01-10 | Fixed serverTiming, cleanEvents, errorResponse, workingDirectoryAudit, testClaudeCLI, testModularIntegration | 42 | 26 |
| 2026-01-10 | Fixed stripeWebhookWorker, errorRecoveryWorker, healthScoreWorker import casing | 26 | 21 |

### Error Breakdown (Updated)

| Category | Count | Root Cause |
|----------|-------|------------|
| Optional property issues (TS2375/2379/2412) | 180 | Assigning `undefined` to optional props |
| Index access issues (TS18048/2532) | 93 | Array/object access without null check |
| Argument mismatches (TS2345/2322) | 68 | Passing `T \| undefined` to `T` param |
| Other (TS2769/2538/2339) | 15 | Various |

### Top Hotspot Files

| File | Errors |
|------|--------|
| `src/workers/streamWorker.ts` | 24 |
| `src/utils/secureFileOperations.ts` | 18 |
| `src/services/typeScriptFixer.ts` | 14 |
| `src/services/fixValidator.ts` | 10 |

---

## The Undefined Policy (Critical Decision)

With `exactOptionalPropertyTypes`, you must be explicit about meaning:

### Policy

| Pattern | Meaning | When to Use |
|---------|---------|-------------|
| `prop?: T` | Key may not exist | Most cases. **Never write `prop: undefined`** - omit the key instead |
| `prop: T \| undefined` | Key exists, value unknown | Internal state where keys exist but values load later |
| `prop: T \| null` | Explicit empty value | API payloads, DB records (JSON-friendly) |

### Decision Shortcut

- **Serialized objects** (API payload, DB, logs) → omit undefined keys
- **Internal state** where keys exist but values load later → use `T | undefined` (non-optional)

This policy eliminates most of the 268 optional property errors.

---

## Phase 0: Ratcheting Setup (Do First)

Create a strict config that runs alongside the main one:

### tsconfig.strict.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src"]
}
```

### package.json scripts

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:strict": "tsc -p tsconfig.strict.json --noEmit",
    "typecheck:strict:count": "tsc -p tsconfig.strict.json --noEmit 2>&1 | grep -c 'error TS' || echo 0"
  }
}
```

### CI Strategy

1. **Week 1**: Run `typecheck:strict` in CI but don't fail (just report count)
2. **During fixes**: Track error count going down
3. **After fixes**: Make it blocking
4. **Bonus**: Only fail if error count increases (prevents regression while paying down debt)

This avoids the "can't merge anything until cleanup is done" freeze.

---

## Phase 1: Add Helpers + Fix Payload Builders

### Helper 1: assertDefined

```typescript
// src/utils/typeHelpers.ts

export function assertDefined<T>(
  value: T,
  message = 'Expected value to be defined'
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}
```

Usage:
```typescript
const item = items[idx];
assertDefined(item, `Missing item at index ${idx}`);
item.doSomething(); // Now typed as non-null
```

### Helper 2: omitUndefined

```typescript
// src/utils/typeHelpers.ts

export function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as T;
}
```

Usage:
```typescript
// Instead of conditional spreads everywhere
const payload = omitUndefined({
  name: user.name,
  reason: maybeReason,      // Will be omitted if undefined
  details: maybeDetails,    // Will be omitted if undefined
});
```

### Fix Pattern: Conditional Spread (when needed)

```typescript
// ❌ Buggy: drops empty string, 0, false
...(maybeReason && { reason: maybeReason })

// ✅ Correct: only omits undefined
...(maybeReason !== undefined ? { reason: maybeReason } : {})
```

### Focus: Top Hotspot Files First

Fix these files first (highest error count):
1. `src/workers/streamWorker.ts` (24 errors)
2. `src/utils/secureFileOperations.ts` (18 errors)
3. `src/services/typeScriptFixer.ts` (14 errors)

These are likely payload builders or DTO mappers - fixing them has non-linear impact.

---

## Phase 2: Index Access Fixes

`noUncheckedIndexedAccess` makes `arr[i]` return `T | undefined`. This is TS telling you: "you're guessing."

### Pattern A: Guard on length first

```typescript
if (items.length === 0) return;
const first = items[0]; // TS can narrow in context
```

### Pattern B: Use assertDefined

```typescript
const item = items[idx];
assertDefined(item, `Missing item at ${idx}`);
item.doSomething();
```

### Pattern C: For objects, stop indexing loose strings

Most TS18048/2532 pain comes from `obj[key]` where `key: string`.

```typescript
// ❌ Loose
const value = obj[key]; // string index = T | undefined

// ✅ Better: guard existence
if (!(key in obj)) return;
const value = obj[key as keyof typeof obj];

// ✅ Best: use Map for dynamic keys
const map = new Map<string, T>();
const value = map.get(key); // Already returns T | undefined, forces handling
```

---

## Phase 3: Argument Mismatches

After Phase 1-2, most TS2345/2322 errors will be gone. For remaining:

```typescript
// ❌ Before
function process(name: string) { ... }
const maybeName: string | undefined = getData();
process(maybeName); // Error

// ✅ Fix A: Guard at call site
if (maybeName !== undefined) {
  process(maybeName);
}

// ✅ Fix B: Default value
process(maybeName ?? 'default');

// ✅ Fix C: Widen function signature (if undefined is valid)
function process(name: string | undefined) { ... }
```

---

## Phase 4: Enable Strict Flags

Once error count is 0:

1. Move strict options into main `tsconfig.json`
2. Delete `tsconfig.strict.json`
3. Update CI to just run `typecheck`

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

## Prevention: ESLint Rules

Add these rules to catch issues before they become type errors:

```javascript
// eslint.config.mjs
rules: {
  // Catches pointless guards, helps narrowing
  '@typescript-eslint/no-unnecessary-condition': 'warn',

  // Reduces "as any" creep
  '@typescript-eslint/consistent-type-assertions': ['error', {
    assertionStyle: 'as',
    objectLiteralTypeAssertions: 'never'
  }],

  // Warns on floating promises
  '@typescript-eslint/no-floating-promises': 'error',
}
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npx tsc --noEmit
```

---

## Summary

| Phase | What | Impact |
|-------|------|--------|
| 0 | Add `tsconfig.strict.json` + ratchet in CI | Enables incremental fixes |
| 1 | Add helpers + fix hotspot files | Knocks out 50%+ of errors |
| 2 | Fix index access patterns | Handles TS18048/2532 |
| 3 | Clean up remaining call sites | Mop up TS2345/2322 |
| 4 | Enable strict flags in main config | Done |

**Key insight**: The undefined policy + `omitUndefined` helper will eliminate most of the 268 optional property errors without turning the codebase into a shrine of `!` operators.

---

## References

- [The Strictest TypeScript Config](https://whatislove.dev/articles/the-strictest-typescript-config/)
- [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/)
- [exactOptionalPropertyTypes explained](https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes)
