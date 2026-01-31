# Claude CLI Integration Improvements

Based on Claude's official documentation for headless mode, here are recommended improvements to our implementation:

## 1. Simplify JSON Output Flag

**Current Implementation:**
```typescript
const args = ["-p", prompt, "--print", "--output-format", "json", "--dangerously-skip-permissions"];
```

**Improved Implementation:**
```typescript
const args = ["-p", prompt, "--json", "--dangerously-skip-permissions"];
```

The `--json` flag is simpler and purpose-built for programmatic integration.

## 2. Add Tool Restrictions for Safety

**Current Implementation:**
All tasks have access to all tools.

**Improved Implementation:**
```typescript
private getToolsForTaskType(taskType: string): string[] {
  const toolMap = {
    'create_file': ['Write'],
    'modify_file': ['Read', 'Edit'],
    'create_component': ['Write', 'Read'],
    'setup_config': ['Write', 'Read'],
    'install_deps': ['Read', 'Edit'],
    'heal_json': [] // No tools needed, just text processing
  };
  
  return toolMap[taskType] || [];
}

private async runClaudeCLI(prompt: string, taskType?: string, cwd?: string): Promise<string> {
  const args = ["-p", prompt, "--json"];
  
  // Add tool restrictions if task type is provided
  if (taskType) {
    const allowedTools = this.getToolsForTaskType(taskType);
    if (allowedTools.length > 0) {
      args.push('--allowedTools', ...allowedTools);
    }
  }
  
  // Skip permissions for development (remove in production)
  if (process.env.NODE_ENV !== 'production') {
    args.push('--dangerously-skip-permissions');
  }
  
  // ... rest of implementation
}
```

## 3. Implement Success/Failure Pattern

**Current Implementation:**
We parse arbitrary JSON responses and hope for the best.

**Improved Implementation:**
```typescript
private buildSystemPrompt(): string {
  return `You are an AI assistant that generates structured task plans for software development projects.

Your response must be a valid JSON array of tasks. Each task must have these fields:
- id: unique identifier (string)
- type: one of "create_file", "modify_file", "create_component", "setup_config", "install_deps"
- name: short descriptive name (string)
- description: detailed description (string)
- estimatedDuration: time in seconds (number)
- priority: 1-10 where 1 is highest (number)
- input: object with prompt, context, targetPath, and dependencies

IMPORTANT:
- Return ONLY the JSON array, no markdown formatting or explanation
- Tasks should be in logical order
- Include all necessary dependencies between tasks
- Use realistic time estimates for agentic tasks
- After the JSON, on a new line, return "OK" if the plan was generated successfully`;
}

private parsePlanResponse(text: string): any[] {
  try {
    // Split response to separate JSON from status
    const lines = text.trim().split('\n');
    const statusLine = lines[lines.length - 1];
    
    // Check for explicit failure
    if (statusLine === 'FAIL') {
      throw new Error('Claude explicitly reported failure');
    }
    
    // Remove status line and parse JSON
    const jsonText = lines.slice(0, -1).join('\n');
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    
    const tasks = JSON.parse(jsonMatch[0]);
    
    // Validate it's an array
    if (!Array.isArray(tasks)) {
      throw new Error('Response is not an array');
    }
    
    // Log success if Claude reported it
    if (statusLine === 'OK') {
      console.log('[Claude CLI] Task generation confirmed successful by Claude');
    }
    
    return tasks;
  } catch (error) {
    console.error('Failed to parse plan response:', error);
    console.error('Response text:', text);
    // Fallback logic...
  }
}
```

## 4. Add Verbose Mode for Debugging

**Current Implementation:**
Limited debug output.

**Improved Implementation:**
```typescript
private async runClaudeCLI(prompt: string, taskType?: string, cwd?: string): Promise<string> {
  const args = ["-p", prompt, "--json"];
  
  // Add verbose flag in development or when DEBUG is set
  if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
    args.push('--verbose');
    console.log('[Claude CLI] Running in verbose mode for debugging');
  }
  
  // ... rest of implementation
}
```

## 5. Pipeline Integration Pattern

For task execution, we can use the pipeline pattern:

```typescript
// Example: Chain Claude with other tools
async executeTaskWithPipeline(task: Task): Promise<TaskResult> {
  // Use Claude to generate initial output
  const claudeResult = await this.runClaudeCLI(task.input.prompt, task.type);
  
  // Pipe to validation
  const validated = await this.validateOutput(claudeResult, task.type);
  
  // Pipe to formatter if needed
  if (task.type === 'create_component') {
    const formatted = await this.formatComponent(validated);
    return formatted;
  }
  
  return validated;
}
```

## 6. Batch Processing Pattern

For multiple similar tasks, we can use the fanning pattern:

```typescript
async processBatchTasks(tasks: Task[]): Promise<TaskResult[]> {
  // Group similar tasks
  const taskGroups = this.groupTasksByType(tasks);
  
  // Process each group with appropriate concurrency
  const results = await Promise.all(
    Object.entries(taskGroups).map(async ([type, group]) => {
      // Limit concurrency based on task type
      const concurrency = this.getConcurrencyLimit(type);
      
      return this.processTaskGroup(group, concurrency);
    })
  );
  
  return results.flat();
}

private getConcurrencyLimit(taskType: string): number {
  // Heavy tasks get less concurrency
  const limits = {
    'create_file': 5,
    'modify_file': 3,
    'create_component': 5,
    'setup_config': 2,
    'install_deps': 1
  };
  
  return limits[taskType] || 3;
}
```

## Implementation Priority

1. **High Priority**: Switch to `--json` flag (5 minutes)
2. **High Priority**: Add tool restrictions for safety (15 minutes)
3. **Medium Priority**: Implement OK/FAIL pattern (20 minutes)
4. **Low Priority**: Add verbose debugging (10 minutes)
5. **Future**: Pipeline and batch patterns (as needed)

## Testing the Improvements

```bash
# Test JSON output
claude -p "Say hello" --json

# Test with tool restrictions
claude -p "Create a file test.txt with 'Hello'" --json --allowedTools Write

# Test verbose mode
claude -p "Generate a React component" --json --verbose

# Test success pattern
claude -p "Generate a task plan for a landing page. End with OK or FAIL." --json
```

## Benefits

1. **Simpler**: `--json` flag is cleaner than `--output-format json`
2. **Safer**: Tool restrictions prevent unintended operations
3. **More Reliable**: OK/FAIL pattern provides explicit success signals
4. **Better Debugging**: Verbose mode helps troubleshoot issues
5. **Production Ready**: Follows Claude's recommended patterns