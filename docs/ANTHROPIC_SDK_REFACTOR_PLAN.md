# Anthropic SDK to CLI Refactoring Plan

**Date**: 2026-01-23
**Status**: Phase 1-2 Complete, Phase 3-5 Pending
**Goal**: Replace all direct Anthropic SDK API calls with CLI-based execution for consistency

---

## Implementation Progress

### Completed (2026-01-23)

| Phase | Task | Status |
|-------|------|--------|
| Phase 1 | Created `unifiedClaudeService.ts` | ✅ Complete |
| Phase 2 | Refactored `migrationPlanningService.ts` | ✅ Complete |
| Phase 2 | Refactored `enhancedCodeGenerationService.ts` | ✅ Complete |
| Phase 2 | Removed `claudeProvider.ts` (unified with `ClaudeCLIProvider`) | ✅ Complete |
| Phase 2 | Updated `providerFactory.ts` (both `claude` and `claude-cli` use CLI) | ✅ Complete |
| Phase 2 | Updated test files (`testClaudeProvider.ts`, `testProviderFactory.ts`) | ✅ Complete |

### Remaining Work

| Phase | Task | Status |
|-------|------|--------|
| Phase 3 | Create API endpoints for frontend services | ⏳ Pending |
| Phase 4 | Refactor frontend services to call worker API | ⏳ Pending |
| Phase 5 | Remove `@anthropic-ai/sdk` from package.json | ⏳ Pending |

---

## Executive Summary

The codebase currently has **two approaches** for AI calls:
1. **CLI Spawning** (Primary) - Via `ClaudeExecutorFactory` → Redis → `claudeCLIMainProcess`
2. **Direct SDK** (Inconsistent) - Via `@anthropic-ai/sdk` import

This refactor consolidates all AI calls to use the CLI approach.

---

## Current State Analysis

### Files Using Direct Anthropic SDK

| File | Location | Purpose | Complexity |
|------|----------|---------|------------|
| `enhancedCodeGenerationService.ts` | Worker | Website migration code gen | High |
| `migrationPlanningService.ts` | Worker | Website migration planning | Medium |
| `claudeProvider.ts` | Worker | Alt AI provider | Low (may be unused) |
| `anthropic-service.ts` | Frontend | Business idea analysis | Medium |
| `llm-prompt-classifier.ts` | Frontend | Prompt classification | Medium |

### Existing CLI Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                      ClaudeCLIProvider                          │
│   Uses: ClaudeExecutorFactory.create().execute(prompt, args)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ClaudeExecutorFactory                        │
│   Returns: IClaudeExecutor (currently RedisClaudeExecutor)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RedisClaudeExecutor                          │
│   Calls: claudeCLIMainProcess.request(prompt, args, cwd)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   claudeCLIMainProcess                           │
│   Spawns: claude CLI via child_process                          │
│   Parses: JSON output                                           │
│   Returns: { success, result, error, usage, sessionId }         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Refactoring Strategy

### Worker Services (Direct Refactor)

Files in the worker can directly use the existing CLI infrastructure:

```typescript
// Before (Direct SDK)
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey });
const response = await client.messages.create({ ... });

// After (CLI)
import { ClaudeExecutorFactory } from '../providers/executors/claudeExecutorFactory';
const executor = ClaudeExecutorFactory.create();
const result = await executor.execute(prompt, ['--output-format', 'json']);
```

### Frontend Services (API Proxy)

Frontend services cannot spawn CLI processes. They need to call worker API endpoints:

```
Frontend Service → Worker API Endpoint → CLI Executor
```

**New endpoints needed:**
- `POST /v1/ai/analyze-business` - Business idea analysis
- `POST /v1/ai/classify-prompt` - Prompt classification

---

## Implementation Plan

### Phase 1: Create Unified CLI Service (Worker)

**New File**: `sheenapps-claude-worker/src/services/unifiedClaudeService.ts`

Purpose: Wrapper around CLI executor with common patterns (JSON parsing, error handling, retries).

```typescript
interface UnifiedClaudeOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  outputFormat?: 'json' | 'text';
}

interface UnifiedClaudeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number; };
}

class UnifiedClaudeService {
  async execute<T>(options: UnifiedClaudeOptions): Promise<UnifiedClaudeResult<T>>;
}
```

### Phase 2: Refactor Worker Services

#### 2.1 `migrationPlanningService.ts`

**Current**: Direct SDK call for migration plan generation
**Change**: Use `UnifiedClaudeService`

```typescript
// Before
const response = await this.client.messages.create({
  model: this.model,
  max_tokens: 8000,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }]
});

// After
const result = await this.claudeService.execute<MigrationPlan>({
  systemPrompt,
  userPrompt,
  maxTokens: 8000,
  outputFormat: 'json'
});
```

#### 2.2 `enhancedCodeGenerationService.ts`

**Current**: Direct SDK call for component generation
**Change**: Use `UnifiedClaudeService`

Same pattern as above.

#### 2.3 `claudeProvider.ts`

**Assessment**: Check if this is actively used. If not, remove. If yes, refactor.

### Phase 3: Create API Endpoints for Frontend

#### 3.1 New Route: `/v1/ai/analyze-business`

**File**: `sheenapps-claude-worker/src/routes/aiServices.ts`

```typescript
// POST /v1/ai/analyze-business
interface AnalyzeBusinessRequest {
  idea: string;
  locale?: string;
}

interface AnalyzeBusinessResponse {
  ok: boolean;
  data?: BusinessAnalysis;
  error?: { code: string; message: string };
}
```

#### 3.2 New Route: `/v1/ai/classify-prompt`

```typescript
// POST /v1/ai/classify-prompt
interface ClassifyPromptRequest {
  prompt: string;
  locale?: string;
}

interface ClassifyPromptResponse {
  ok: boolean;
  data?: BusinessPromptAnalysis;
  error?: { code: string; message: string };
}
```

### Phase 4: Refactor Frontend Services

#### 4.1 `anthropic-service.ts`

**Current**: Direct SDK call
**Change**: Call worker API endpoint

```typescript
// Before
const response = await this.client.messages.create({ ... });

// After
const response = await fetch(`${WORKER_URL}/v1/ai/analyze-business`, {
  method: 'POST',
  headers: { ...createWorkerAuthHeaders() },
  body: JSON.stringify({ idea, locale })
});
```

#### 4.2 `llm-prompt-classifier.ts`

Same pattern - call `/v1/ai/classify-prompt` endpoint.

### Phase 5: Cleanup

1. Remove `@anthropic-ai/sdk` from `package.json` (both projects)
2. Remove unused `claudeProvider.ts` if confirmed unused
3. Update environment variables documentation
4. Add tests for new endpoints

---

## File Changes Summary

### Files to Create

```
sheenapps-claude-worker/
└── src/
    ├── services/
    │   └── unifiedClaudeService.ts       # Unified CLI wrapper
    └── routes/
        └── aiServices.ts                  # New API endpoints
```

### Files to Modify

```
sheenapps-claude-worker/
└── src/
    ├── services/
    │   ├── migrationPlanningService.ts   # Use UnifiedClaudeService
    │   └── enhancedCodeGenerationService.ts  # Use UnifiedClaudeService
    ├── providers/
    │   └── claudeProvider.ts             # Remove or refactor
    └── server.ts                         # Register new routes

sheenappsai/
└── src/
    └── services/
        └── ai/
            ├── anthropic-service.ts      # Call worker API
            └── llm-prompt-classifier.ts  # Call worker API
```

### Files Deleted

```
sheenapps-claude-worker/src/providers/claudeProvider.ts  # ✅ Deleted 2026-01-23 (unified with ClaudeCLIProvider)
```

### Package.json Changes

```json
// Remove from both projects:
"@anthropic-ai/sdk": "x.x.x"
```

---

## Detailed Specifications

### UnifiedClaudeService

```typescript
// sheenapps-claude-worker/src/services/unifiedClaudeService.ts

import { ClaudeExecutorFactory } from '../providers/executors/claudeExecutorFactory';
import type { IClaudeExecutor, ClaudeExecutorResult } from '../providers/IClaudeExecutor';

export interface UnifiedClaudeOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  outputFormat?: 'json' | 'text';
  cwd?: string;
}

export interface UnifiedClaudeResult<T = string> {
  success: boolean;
  data?: T;
  rawOutput?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  duration?: number;
}

export class UnifiedClaudeService {
  private executor: IClaudeExecutor;

  constructor() {
    this.executor = ClaudeExecutorFactory.create();
  }

  async execute<T = string>(options: UnifiedClaudeOptions): Promise<UnifiedClaudeResult<T>> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 4000,
      outputFormat = 'text',
      cwd
    } = options;

    // Build CLI args
    const args = ['--output-format', 'json'];
    if (maxTokens) {
      args.push('--max-tokens', String(maxTokens));
    }

    // Combine prompts (CLI doesn't have separate system/user)
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    try {
      const result = await this.executor.execute(fullPrompt, args, cwd);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'CLI execution failed',
          rawOutput: result.output
        };
      }

      // Parse JSON if requested
      if (outputFormat === 'json') {
        try {
          const parsed = JSON.parse(result.output);
          return {
            success: true,
            data: parsed as T,
            rawOutput: result.output,
            usage: result.usage,
            duration: result.duration
          };
        } catch (parseError) {
          return {
            success: false,
            error: `JSON parse error: ${parseError}`,
            rawOutput: result.output
          };
        }
      }

      return {
        success: true,
        data: result.output as unknown as T,
        rawOutput: result.output,
        usage: result.usage,
        duration: result.duration
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.executor.healthCheck();
  }
}

// Singleton
let instance: UnifiedClaudeService | null = null;

export function getUnifiedClaudeService(): UnifiedClaudeService {
  if (!instance) {
    instance = new UnifiedClaudeService();
  }
  return instance;
}
```

### API Routes

```typescript
// sheenapps-claude-worker/src/routes/aiServices.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUnifiedClaudeService } from '../services/unifiedClaudeService';
import { requireHmacSignature } from '../middleware/hmacValidation';

export async function registerAIServiceRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();
  const claudeService = getUnifiedClaudeService();

  // POST /v1/ai/analyze-business
  fastify.post<{
    Body: { idea: string; locale?: string };
  }>('/v1/ai/analyze-business', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { idea, locale } = request.body;

    if (!idea || typeof idea !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'idea is required' }
      });
    }

    const systemPrompt = buildBusinessAnalysisSystemPrompt(locale);
    const userPrompt = buildBusinessAnalysisUserPrompt(idea);

    const result = await claudeService.execute({
      systemPrompt,
      userPrompt,
      maxTokens: 2000,
      outputFormat: 'json'
    });

    if (!result.success) {
      return reply.code(500).send({
        ok: false,
        error: { code: 'AI_ERROR', message: result.error }
      });
    }

    return reply.send({
      ok: true,
      data: result.data,
      usage: result.usage
    });
  });

  // POST /v1/ai/classify-prompt
  fastify.post<{
    Body: { prompt: string; locale?: string };
  }>('/v1/ai/classify-prompt', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { prompt, locale } = request.body;

    if (!prompt || typeof prompt !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'prompt is required' }
      });
    }

    const systemPrompt = buildClassificationSystemPrompt();
    const userPrompt = buildClassificationUserPrompt(prompt, locale);

    const result = await claudeService.execute({
      systemPrompt,
      userPrompt,
      maxTokens: 500,
      outputFormat: 'json'
    });

    if (!result.success) {
      return reply.code(500).send({
        ok: false,
        error: { code: 'AI_ERROR', message: result.error }
      });
    }

    return reply.send({
      ok: true,
      data: result.data
    });
  });
}
```

---

## Migration Checklist

### Phase 1: Unified Service
- [x] Create `unifiedClaudeService.ts` ✅ 2026-01-23
- [ ] Add unit tests
- [ ] Verify CLI execution works

### Phase 2: Worker Services
- [x] Refactor `migrationPlanningService.ts` ✅ 2026-01-23
- [x] Refactor `enhancedCodeGenerationService.ts` ✅ 2026-01-23
- [x] Check and handle `claudeProvider.ts` ✅ 2026-01-23 (removed, unified with ClaudeCLIProvider)
- [x] Update `providerFactory.ts` ✅ 2026-01-23 (both 'claude' and 'claude-cli' use CLI)
- [x] Update test files ✅ 2026-01-23
- [ ] Test migration tool end-to-end

### Phase 3: API Endpoints
- [ ] Create `aiServices.ts` routes
- [ ] Register in `server.ts`
- [ ] Add HMAC authentication
- [ ] Test endpoints manually

### Phase 4: Frontend Services
- [ ] Refactor `anthropic-service.ts` to call API
- [ ] Refactor `llm-prompt-classifier.ts` to call API
- [ ] Update frontend API helpers
- [ ] Test business analysis flow
- [ ] Test prompt classification flow

### Phase 5: Cleanup
- [ ] Remove `@anthropic-ai/sdk` from worker `package.json`
- [ ] Remove `@anthropic-ai/sdk` from frontend `package.json`
- [x] Delete unused `claudeProvider.ts` ✅ 2026-01-23
- [ ] Update documentation
- [ ] Final integration test

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI performance differs from SDK | Medium | Medium | Benchmark before/after |
| CLI doesn't support all SDK features | Low | High | Check feature parity first |
| Breaking existing migration tool | Medium | High | Thorough testing |
| Frontend latency increase (extra hop) | Low | Low | Acceptable tradeoff |

---

## Rollback Plan

If issues arise:
1. Keep SDK code in separate branch
2. Feature flag new endpoints
3. A/B test before full rollout

---

## Environment Variables

**No new env vars needed** - uses existing:
- `CLAUDE_EXECUTOR_MODE` (default: 'redis')
- `REDIS_HOST`, `REDIS_PORT`
- `CLAUDE_MAX_CONCURRENT`

**Remove after migration**:
- `CLAUDE_API_KEY` (if only used by SDK)
- `ANTHROPIC_API_KEY` (frontend)

---

*Plan created: 2026-01-23*
*Ready for implementation*
