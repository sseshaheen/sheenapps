# NPM Dependency Recovery Strategy

## Problem Analysis

The deployment fails when AI generates incompatible package versions, causing `npm install` to fail with `ERESOLVE` errors. This completely halts the deployment with no recovery path.

### Common Scenarios:
1. **Version Conflicts**: react-scripts@5 requires TypeScript 4.x, but AI generates TypeScript 5.x
2. **Non-existent Packages**: AI hallucinates package names or versions
3. **Peer Dependency Issues**: Incompatible peer dependencies between packages

## Proposed Solutions

### Solution 1: Automatic Fallback with --legacy-peer-deps (Immediate Fix)

Update `deployWorker.ts` to retry with fallback options:

```typescript
// In deployWorker.ts, update the npm install logic:
async function installDependencies(projectPath: string, buildId: string): Promise<void> {
  const strategies = [
    { command: 'npm install', description: 'Standard install' },
    { command: 'npm install --legacy-peer-deps', description: 'Legacy peer deps mode' },
    { command: 'npm install --force', description: 'Force install (ignore conflicts)' }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`[Deploy Worker] Trying: ${strategy.description}`);
      await execCommand(strategy.command, projectPath);
      
      await emitBuildEvent(buildId, 'build_progress', {
        stage: 'install',
        message: `Dependencies installed using: ${strategy.description}`
      });
      
      return; // Success!
    } catch (error: any) {
      console.error(`[Deploy Worker] ${strategy.description} failed:`, error.message);
      
      if (strategy === strategies[strategies.length - 1]) {
        // Last strategy failed
        throw new Error(`All install strategies failed. Last error: ${error.message}`);
      }
    }
  }
}
```

### Solution 2: Package Version Validation (Preventive)

Add validation in the AI task generation to check package compatibility:

```typescript
// In claudeCLIProvider.ts system prompt:
const systemPrompt = `
...
For React projects:
- Use create-react-app with TypeScript 4.x (not 5.x) for compatibility
- Or use Vite with React for modern setup
- Always specify exact versions for major packages

Common compatible combinations:
- react-scripts@5.0.1 + typescript@^4.9.5
- vite@^5.0.0 + typescript@^5.0.0
...
`;
```

### Solution 3: Dependency Resolution Helper (Recovery)

Create a dependency fixer that can patch package.json before install:

```typescript
// New file: src/services/dependencyFixer.ts
export async function fixDependencyConflicts(packageJsonPath: string): Promise<boolean> {
  const content = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(content);
  
  let modified = false;
  
  // Fix known conflicts
  if (pkg.devDependencies?.['react-scripts'] && 
      pkg.devDependencies?.['typescript']?.startsWith('^5')) {
    console.log('[Dependency Fixer] Downgrading TypeScript for react-scripts compatibility');
    pkg.devDependencies['typescript'] = '^4.9.5';
    modified = true;
  }
  
  if (modified) {
    await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
    return true;
  }
  
  return false;
}
```

### Solution 4: Build Without Dependencies (Last Resort)

For simple static sites, skip dependency installation if it fails:

```typescript
// In deployWorker.ts
if (hasPackageJson && packageContent.dependencies) {
  try {
    await installDependencies(projectPath, buildId);
  } catch (error) {
    console.warn('[Deploy Worker] Dependency installation failed, attempting build without dependencies');
    
    // Check if it's a simple static site
    const hasHtml = await fs.access(path.join(projectPath, 'index.html')).then(() => true).catch(() => false);
    if (hasHtml) {
      console.log('[Deploy Worker] Static site detected, proceeding without npm install');
      // Continue with build/deploy
    } else {
      throw error; // Re-throw for complex apps
    }
  }
}
```

## Implementation Priority

1. **Immediate**: Implement Solution 1 (fallback strategies)
2. **Next Sprint**: Add Solution 3 (dependency fixer) 
3. **Ongoing**: Improve AI prompts (Solution 2)
4. **Optional**: Solution 4 for static sites

## Monitoring

Add metrics to track:
- Frequency of npm install failures
- Success rate of each fallback strategy
- Most common dependency conflicts

This will help refine the AI prompts over time.