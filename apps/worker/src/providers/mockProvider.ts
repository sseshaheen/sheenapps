import type { AIProvider } from './aiProvider';
import type { PlanContext, TokenUsage, TransformInput } from '../types/modular';
import { ulid } from 'ulid';

export class MockAIProvider implements AIProvider {
  name = 'mock';

  async plan(prompt: string, context: PlanContext, sessionId?: string): Promise<{
    tasks: any[];
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    // Generate mock tasks based on the prompt
    const tasks = this.generateMockTasks(prompt, context);
    
    return {
      tasks,
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalCost: 0.003
      },
      claudeSessionId: sessionId || `mock-session-${ulid()}`
    };
  }

  async *planStream(prompt: string, context: PlanContext): AsyncIterableIterator<{
    tasks: any[];
    usage: TokenUsage;
  }> {
    // Generate tasks in batches to simulate streaming
    const allTasks = this.generateMockTasks(prompt, context);
    const batchSize = 2;

    for (let i = 0; i < allTasks.length; i += batchSize) {
      const batch = allTasks.slice(i, i + batchSize);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      yield {
        tasks: batch,
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalCost: 0.0015
        }
      };
    }
  }

  async transform(input: TransformInput, sessionId?: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    // Mock different transform types
    let output: any;

    switch (input.type) {
      case 'code_gen':
        // Generate more realistic content based on the context
        if (input.context?.targetPath?.includes('.tsx') || input.context?.targetPath?.includes('.jsx')) {
          output = `import React from 'react';\n\n// ${input.input}\nexport default function Component() {\n  return (\n    <div>\n      <h1>Hello World</h1>\n      <button onClick={() => alert('Clicked!')}>Click me</button>\n    </div>\n  );\n}`;
        } else if (input.context?.targetPath?.includes('package.json')) {
          output = `{\n  "name": "mock-app",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build"\n  },\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "devDependencies": {\n    "vite": "^5.0.0",\n    "@vitejs/plugin-react": "^4.0.0"\n  }\n}`;
        } else {
          output = `// Generated code for: ${input.input}\nexport function generated() {\n  return "Hello World";\n}`;
        }
        break;
      
      case 'refactor':
        output = `// Refactored code for: ${input.input}\nexport function refactored() {\n  return "Hello Refactored World";\n}`;
        break;
      
      case 'heal_json':
        // Try to fix common JSON issues
        try {
          // Attempt to parse and return valid JSON
          output = JSON.parse(input.input);
        } catch {
          // Return a mock valid task if parsing fails
          output = {
            id: ulid(),
            type: 'create_file',
            name: 'Mock Task',
            description: 'Mock task description',
            estimatedDuration: 30,
            priority: 1,
            input: {
              prompt: 'Create a mock file'
            }
          };
        }
        break;
      
      default:
        output = `Mock transform output for ${input.type}`;
    }

    return {
      output,
      usage: {
        promptTokens: 50,
        completionTokens: 100,
        totalCost: 0.0015
      },
      claudeSessionId: sessionId || `mock-session-${ulid()}`
    };
  }

  private generateMockTasks(prompt: string, context: PlanContext): any[] {
    const tasks = [];

    // Always start with setup tasks
    if (context.framework) {
      tasks.push({
        id: ulid(),
        type: 'setup_config',
        name: `Setup ${context.framework} configuration`,
        description: `Configure ${context.framework} project settings`,
        estimatedDuration: 10,
        priority: 1,
        input: {
          prompt: `Setup ${context.framework} config`
        }
      });
    }

    // Add some file creation tasks based on prompt keywords
    if (prompt.toLowerCase().includes('component')) {
      tasks.push({
        id: ulid(),
        type: 'create_component',
        name: 'Create main component',
        description: 'Creating the main React component',
        estimatedDuration: 30,
        priority: 2,
        input: {
          prompt: 'Create a React component',
          targetPath: 'src/components/Main.tsx'
        }
      });
    }

    if (prompt.toLowerCase().includes('landing') || prompt.toLowerCase().includes('page')) {
      tasks.push({
        id: ulid(),
        type: 'create_file',
        name: 'Create landing page',
        description: 'Creating the landing page',
        estimatedDuration: 45,
        priority: 2,
        input: {
          prompt: 'Create landing page',
          targetPath: 'src/pages/index.tsx'
        }
      });
    }

    // Add a modify task if we have multiple files
    if (tasks.length > 2) {
      tasks.push({
        id: ulid(),
        type: 'modify_file',
        name: 'Update imports',
        description: 'Updating import statements',
        estimatedDuration: 15,
        priority: 3,
        input: {
          prompt: 'Update imports to include new components',
          targetPath: 'src/App.tsx'
        }
      });
    }

    // Add install deps if needed
    tasks.push({
      id: ulid(),
      type: 'install_deps',
      name: 'Install dependencies',
      description: 'Installing required npm packages',
      estimatedDuration: 20,
      priority: 1,
      input: {
        prompt: 'Install required dependencies'
      }
    });

    return tasks;
  }
}