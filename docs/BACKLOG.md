# Development Backlog

Technical debt, architectural improvements, and future enhancements.

---

## Architectural Improvements

### 1. Simplify UnifiedClaudeService to Utility Functions

**Added**: 2026-01-23
**Priority**: Low
**Effort**: ~30 min

**Current state**: `UnifiedClaudeService` is a class wrapper around `ClaudeExecutorFactory` that provides prompt combining, CLI arg building, and JSON parsing.

**Issue**: Adds a layer that could be simpler. We now have two similar wrappers:
- `ClaudeCLIProvider` (for AIProvider interface)
- `UnifiedClaudeService` (for generic execute)

**Proposed change**: Replace with utility functions in `utils/claudeHelpers.ts`:
```typescript
export function buildCliArgs(options: { maxTokens?: number }): string[];
export function parseJsonResponse<T>(output: string): T;
export function combinePrompts(system: string, user: string): string;
```

**Affected files**:
- `services/unifiedClaudeService.ts` → delete
- `services/migrationPlanningService.ts` → use utilities directly
- `services/enhancedCodeGenerationService.ts` → use utilities directly

**Why deferred**: Current implementation works fine, minimal overhead. Address during larger refactor.

---

## Pending Refactors

### 2. Frontend Anthropic SDK Migration (Phases 3-5)

**Added**: 2026-01-23
**Priority**: Medium
**Reference**: `/docs/ANTHROPIC_SDK_REFACTOR_PLAN.md`

**Remaining work**:
- Create API endpoints (`/v1/ai/analyze-business`, `/v1/ai/classify-prompt`)
- Refactor `sheenappsai/src/services/ai/anthropic-service.ts` to call worker API
- Refactor `sheenappsai/src/services/ai/llm-prompt-classifier.ts` to call worker API
- Remove `@anthropic-ai/sdk` from both package.json files

---

## Future Enhancements

*(Add items here as they come up)*

---

## Completed

*(Move items here when done)*

| Item | Completed | Notes |
|------|-----------|-------|
| Worker Anthropic SDK Migration (Phases 1-2) | 2026-01-23 | See ANTHROPIC_SDK_REFACTOR_PLAN.md |
