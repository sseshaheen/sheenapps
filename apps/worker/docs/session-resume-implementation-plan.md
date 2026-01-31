# Claude Session Resume Implementation Plan

## Current Findings

### Test Results
1. **Session Resume Syntax Works**: `claude -r <session-id> "prompt"` is the correct syntax
2. **Session Context is Preserved**: Claude remembers the slogan from the previous session
3. **Issue**: Claude loses write permissions when resuming sessions (output: "I don't have write permissions")

### Root Cause
The current implementation creates NEW Claude sessions for documentation generation instead of resuming the build session. This causes:
- Loss of project context
- Loss of file write permissions
- Redundant analysis of the codebase
- 5+ minute execution times

## Implementation Plan

### Option 1: Fix Session Resume (Recommended)
Update `streamWorker.ts` to properly resume sessions:

```typescript
// Store session ID after build
const buildSessionId = result.sessionId;

// Resume session for documentation
const docSession = new ClaudeSession();
const docResult = await docSession.resume(
  buildSessionId,
  documentationPrompt,
  projectPath,
  CLAUDE_TIMEOUTS.documentation
);
```

This requires adding a `resume()` method to `ClaudeSession` that uses `claude -r`:

```typescript
async resume(sessionId: string, prompt: string, workDir: string, timeout: number) {
  // Use: claude -r <sessionId> "prompt"
  const args = ['-r', sessionId];
  // ... spawn process with prompt as argument
}
```

### Option 2: Smart Context System (Alternative)
If session resume has permission issues, implement context-based approach:

1. **During Build**: Add to prompt to create `.sheenapps/context.json`
2. **For Documentation**: Read context file instead of re-analyzing code
3. **Benefits**: 30-second execution vs 5 minutes

### Option 3: Inline Documentation (Simplest)
Generate documentation during the build itself:

```typescript
const enhancedPrompt = `${userPrompt}

At the end, also create:
1. .sheenapps/recommendations.json with 5-7 next steps
2. sheenapps-project-info.md with project documentation`;
```

## Recommended Approach

**Phase 1**: Implement Option 3 (inline documentation) for immediate improvement
- No session resume complexity
- Single Claude session
- Faster overall build time

**Phase 2**: Test and implement Option 1 (proper session resume) if needed
- Better separation of concerns
- Can run in parallel with npm install

## Next Steps

1. Update build prompts to include documentation generation
2. Remove separate metadata generation job
3. Test the new approach
4. Monitor build times and quality