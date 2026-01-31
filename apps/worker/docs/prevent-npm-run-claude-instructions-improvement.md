# Claude Instructions Improvement Proposal

## Issue
Claude currently runs `npm run dev` to test changes, which:
- Starts an indefinite dev server that times out
- Blocks the build process
- Is unnecessary since we deploy anyway

## Proposed Solution

### 1. Update Stream Worker Prompts
Add to `constructPrompt()` in `streamWorker.ts`:

```typescript
const validationInstructions = `
VALIDATION GUIDELINES:
- To verify your changes compile correctly, use one of these commands:
  - 'npx tsc --noEmit' - Check TypeScript types
  - 'npm run build' - Test production build
  - 'npm run lint' - Check code style (if available)
- DO NOT run 'npm run dev' or any command that starts a development server
- DO NOT run commands that require user interaction or run indefinitely
`;
```

### 2. Add Validation Script
Encourage projects to include a validation script in package.json:

```json
{
  "scripts": {
    "validate": "tsc --noEmit",
    "validate:full": "tsc --noEmit && npm run lint && npm run test:ci"
  }
}
```

### 3. Update CLAUDE.md Template
Add a section about validation:

```markdown
## Validation Commands

When making changes, use these commands to verify your work:
- `npm run validate` - Quick type checking
- `npm run build` - Full production build test
- `npm run lint` - Code style check

**Never use `npm run dev` during automated updates** as it starts an interactive server.
```

### 4. Benefits
- Faster validation (no server startup)
- No timeout issues
- Better resource usage
- More appropriate for CI/CD environment

## Implementation Steps

1. Update `constructPrompt()` function to include validation guidelines
2. Add validation detection in `detectAvailableScripts()` 
3. Prefer validation commands over dev server
4. Document best practices in user guides