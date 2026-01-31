import { Worker, Job } from 'bullmq';
import type { TaskPlan, Task, TaskDependency, TaskResult } from '../types/modular';
import { WebhookService } from './webhookService';
import type { AIProvider } from '../providers/aiProvider';
import { TaskDatabase } from './taskDatabase';
import { taskQueue, taskQueueEvents, requireQueue, requireQueueEvents } from '../queue/modularQueues';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
// import { SessionManager } from './sessionManager';

export interface ProjectContext {
  projectPath: string;
  framework: string;
  existingFiles: string[];
  userId: string;
  projectId: string;
}

export class TaskExecutorService {
  private taskWorker?: Worker;
  private taskTimeout = 60_000; // 60 seconds per task
  private globalTimeout = 15 * 60 * 1000; // 15 minutes total
  // private sessionManager?: SessionManager;

  /**
   * Safely resolve a path within a project root, preventing directory traversal attacks.
   * Throws if the resolved path escapes the project root.
   */
  private safeResolve(projectRoot: string, relativePath: string): string {
    const root = path.resolve(projectRoot);
    const full = path.resolve(root, relativePath);
    // Ensure the resolved path starts with the root + separator (or equals root)
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new Error(`Unsafe path traversal attempt: ${relativePath}`);
    }
    return full;
  }
  
  constructor(
    private webhookService: WebhookService,
    private aiProvider: AIProvider,
    private db: TaskDatabase
    // sessionManager?: SessionManager
  ) {
    // this.sessionManager = sessionManager;
    this.initializeWorker();
  }

  private initializeWorker() {
    // Only create worker in production mode AND when not in modular architecture
    if (process.env.NODE_ENV === 'test' || process.env.ARCH_MODE === 'modular') {
      return;
    }

    // Create worker to process tasks with global concurrency control
    this.taskWorker = new Worker(
      'ai-tasks',
      async (job: Job) => this.processTask(job),
      {
        connection: {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: null,
        },
        concurrency: 3, // Process up to 3 AI tasks per worker instance
      }
    );

    this.taskWorker.on('completed', (job) => {
      console.log(`Task ${job.id} completed successfully`);
    });

    this.taskWorker.on('failed', (job, err) => {
      console.error(`Task ${job?.id} failed:`, err);
    });

    this.taskWorker.on('error', (err) => {
      console.error('[TaskExecutor] Worker error:', err);
    });
  }

  async executePlan(plan: TaskPlan, context: ProjectContext): Promise<TaskResult[]> {
    // Create session for this plan execution
    let sessionId: string | undefined;
    // if (this.sessionManager) {
    //   const session = await this.sessionManager.createSession(
    //     plan.id,
    //     context.projectPath,
    //     context.framework
    //   );
    //   sessionId = session.id;
    //   console.log(`[TaskExecutor] Created session ${sessionId} for plan ${plan.id}`);
    // }

    try {
      // For test mode or when queue is not available, execute tasks directly
      if (process.env.NODE_ENV === 'test' || !taskQueue) {
        return this.executeDirectly(plan, context, sessionId);
      }

      // Add all tasks to BullMQ with dependencies
      const jobPromises = new Map<string, Promise<Job>>();

      for (const task of plan.tasks) {
        const dependencies = this.getTaskDependencies(task.id, plan.dependencies);

        // Add job to queue with dependency handling
        // Namespace jobId by planId to prevent collisions across plans
        const queue = requireQueue(taskQueue, 'ai-tasks');
        const jobPromise = queue.add(
          `execute-${task.type}`,
          {
            task,
            context,
            planId: plan.id,
            buildId: plan.buildId,
            dependencies: dependencies.map(depId => `task:${plan.id}:${depId}`), // Namespace dependency IDs too
            sessionId
          },
          {
            jobId: `task:${plan.id}:${task.id}`,
          }
        );

        jobPromises.set(task.id, jobPromise);
      }

      // Wait for all jobs to complete using per-job waitUntilFinished
      // This avoids listener leaks and cross-plan contamination
      const jobs = await Promise.all(
        Array.from(jobPromises.values())
      );

      const queueEvents = requireQueueEvents(taskQueueEvents, 'ai-tasks');
      const results = await Promise.all(
        jobs.map(job => job.waitUntilFinished(queueEvents, this.globalTimeout))
      );

      return results as TaskResult[];
    } catch (error) {
      console.error('Error executing plan:', error);
      throw error;
    }
  }

  // Direct execution for testing or when queue is not available
  private async executeDirectly(plan: TaskPlan, context: ProjectContext, sessionId?: string): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const completed = new Map<string, TaskResult>();

    // Build dependency graph
    const taskMap = new Map(plan.tasks.map(t => [t.id, t]));
    
    // Execute tasks in dependency order
    while (completed.size < plan.tasks.length) {
      const readyTasks = plan.tasks.filter(task => {
        if (completed.has(task.id)) return false;
        
        const taskDeps = this.getTaskDependencies(task.id, plan.dependencies);
        return taskDeps.every(depId => completed.has(depId));
      });

      if (readyTasks.length === 0) {
        throw new Error('Circular dependency detected or no tasks ready');
      }

      // Execute ready tasks in parallel
      const taskResults = await Promise.all(
        readyTasks.map(task => this.executeTaskWithTimeout(task, context, sessionId))
      );

      taskResults.forEach((result, index) => {
        const task = readyTasks[index];
        if (task) {
          completed.set(task.id, result);
        }
        results.push(result);
      });
    }

    return results;
  }

  private async executeTaskWithTimeout(task: Task, context: ProjectContext, sessionId?: string, buildId?: string): Promise<TaskResult> {
    // Use provided buildId, fallback to task.planId for backwards compatibility
    const effectiveBuildId = buildId || task.planId;

    // Check idempotency - include projectId in fingerprint for safety
    const taskFingerprint = this.getTaskFingerprint(task, context.projectId);

    // Check if task was already completed (in real implementation, check Redis cache)
    const cachedResult = await this.getCachedResult(taskFingerprint);
    if (cachedResult) {
      console.log(`Task ${task.id} already completed (idempotent check)`);
      return cachedResult;
    }

    // Track start time locally for accurate duration measurement
    const startedAt = Date.now();

    // Timeout guard flag - prevents post-timeout DB/webhook updates
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
    }, this.taskTimeout);

    try {
      // Send webhook: task started
      await this.webhookService.send({
        type: 'task_started',
        buildId: effectiveBuildId,
        data: {
          taskId: task.id,
          taskName: task.name,
          description: task.description
        }
      });

      // Store in database
      await this.db.updateTask(task.id, {
        status: 'in_progress',
        startedAt: new Date(startedAt)
      });

      // Execute task
      const result = await this.executeByType(task, context, sessionId);

      // Clear timeout since we completed in time
      clearTimeout(timeoutId);

      // Check if we timed out while executing
      if (timedOut) {
        throw new Error(`Task timeout: ${task.name}`);
      }

      // Cache result
      await this.cacheResult(taskFingerprint, result);

      // Update database with accurate duration
      await this.db.updateTask(task.id, {
        status: 'completed',
        finishedAt: new Date(),
        output: result,
        duration: Date.now() - startedAt
      });

      // Send webhook: task completed
      await this.webhookService.send({
        type: 'task_completed',
        buildId: effectiveBuildId,
        data: {
          taskId: task.id,
          taskName: task.name,
          filesCreated: result.files?.length || 0
        }
      });

      return result;

    } catch (error: any) {
      clearTimeout(timeoutId);

      const isTimeout = error.message.startsWith('Task timeout:');

      // Update database (skip if already timed out to avoid duplicate updates)
      if (!timedOut || isTimeout) {
        await this.db.updateTask(task.id, {
          status: 'failed',
          finishedAt: new Date(),
          error: error.message,
          duration: Date.now() - startedAt
        });
      }

      // Send appropriate webhook - only ONE signal per failure
      // task_timeout for timeouts, task_failed for other errors
      if (isTimeout) {
        await this.webhookService.send({
          type: 'task_timeout',
          buildId: effectiveBuildId,
          data: {
            taskId: task.id,
            taskName: task.name,
            suggestion: 'Retry or skip this task'
          }
        });
      } else {
        await this.webhookService.send({
          type: 'task_failed',
          buildId: effectiveBuildId,
          data: {
            taskId: task.id,
            taskName: task.name,
            error: error.message
          }
        });
      }

      throw error;
    }
  }

  private async executeByType(task: Task, context: ProjectContext, sessionId?: string): Promise<TaskResult> {
    console.log(`Executing task: ${task.name} (${task.type})`);

    switch (task.type) {
      case 'create_file':
        return this.executeCreateFile(task, context, sessionId);
      
      case 'modify_file':
        return this.executeModifyFile(task, context, sessionId);
      
      case 'create_component':
        return this.executeCreateComponent(task, context, sessionId);
      
      case 'setup_config':
        return this.executeSetupConfig(task, context, sessionId);
      
      case 'install_deps':
        return this.executeInstallDeps(task, context, sessionId);
      
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  // Task type implementations
  private async executeCreateFile(task: Task, context: ProjectContext, sessionId?: string): Promise<TaskResult> {
    const targetPath = task.input.targetPath || 'generated-file.ts';
    const prompt = task.input.prompt || 'Create a file';

    // Get session and build context if available
    let claudeSessionId = sessionId;
    let contextPrompt = '';
    
    // if (this.sessionManager && sessionId) {
    //   const session = await this.sessionManager.getSession(sessionId);
    //   if (session) {
    //     claudeSessionId = session.claudeSessionId;
    //     contextPrompt = this.sessionManager.buildContextPrompt(session);
    //   }
    // }

    // Call AI provider to generate content with session
    const result = this.aiProvider.transformWithSession && claudeSessionId
      ? await this.aiProvider.transformWithSession(
          {
            type: 'code_gen',
            input: prompt,
            context: {
              targetPath,
              framework: context.framework
            }
          },
          claudeSessionId,
          contextPrompt
        )
      : await this.aiProvider.transform({
          type: 'code_gen',
          input: prompt,
          context: {
            targetPath,
            framework: context.framework
          }
        }, claudeSessionId);

    // Update session with Claude session ID if returned
    // if (this.sessionManager && sessionId && result.claudeSessionId && !claudeSessionId) {
    //   await this.sessionManager.setClaudeSessionId(sessionId, result.claudeSessionId);
    // }

    // Write file to project (with path traversal protection)
    const fullPath = this.safeResolve(context.projectPath, targetPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, result.output, 'utf8');

    // Update session with file info
    // if (this.sessionManager && sessionId) {
    //   await this.sessionManager.addFile(sessionId, targetPath);
    //   
    //   // Extract imports/exports from the generated code
    //   const imports = this.extractImports(result.output);
    //   const exports = this.extractExports(result.output);
    //   
    //   if (imports.length > 0) {
    //     await this.sessionManager.addImports(sessionId, targetPath, imports);
    //   }
    //   if (exports.length > 0) {
    //     await this.sessionManager.addExports(sessionId, targetPath, exports);
    //   }
    // }

    return {
      taskId: task.id,
      status: 'completed',
      files: [{
        path: targetPath,
        content: result.output
      }],
      tokenUsage: result.usage
    };
  }

  private async executeModifyFile(task: Task, context: ProjectContext, sessionId?: string): Promise<TaskResult> {
    const targetPath = task.input.targetPath;
    if (!targetPath) {
      throw new Error('targetPath is required for modify_file task');
    }
    const prompt = task.input.prompt || 'Modify file';

    // Read existing file (with path traversal protection)
    const fullPath = this.safeResolve(context.projectPath, targetPath);
    let existingContent = '';
    
    try {
      existingContent = await fs.readFile(fullPath, 'utf8');
    } catch (error) {
      console.warn(`File not found: ${targetPath}, will create new file`);
    }

    // Call AI provider to modify content
    const result = await this.aiProvider.transform({
      type: 'refactor',
      input: `${prompt}\n\nExisting content:\n${existingContent}`,
      context: {
        targetPath,
        framework: context.framework
      }
    });

    // Write modified file
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, result.output, 'utf8');

    return {
      taskId: task.id,
      status: 'completed',
      files: [{
        path: targetPath,
        content: result.output
      }],
      tokenUsage: result.usage
    };
  }

  private async executeCreateComponent(task: Task, context: ProjectContext, sessionId?: string): Promise<TaskResult> {
    const componentName = task.input.prompt?.match(/(\w+)\s*component/i)?.[1] || 'Component';
    const targetPath = task.input.targetPath || `src/components/${componentName}.tsx`;

    // Generate component code
    const result = await this.aiProvider.transform({
      type: 'code_gen',
      input: task.input.prompt || `Create a ${componentName} component`,
      context: {
        framework: context.framework,
        componentType: 'functional',
        targetPath
      }
    });

    // Write component file (with path traversal protection)
    const fullPath = this.safeResolve(context.projectPath, targetPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, result.output, 'utf8');

    return {
      taskId: task.id,
      status: 'completed',
      files: [{
        path: targetPath,
        content: result.output
      }],
      tokenUsage: result.usage
    };
  }

  private async executeSetupConfig(task: Task, context: ProjectContext, _sessionId?: string): Promise<TaskResult> {
    // Generate configuration files based on framework
    const configFiles: Array<{path: string; content: string}> = [];

    if (context.framework === 'react') {
      // Generate tsconfig.json
      configFiles.push({
        path: 'tsconfig.json',
        content: JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: "react-jsx",
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true
          },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }]
        }, null, 2)
      });
    }

    // Write all config files (with path traversal protection)
    for (const file of configFiles) {
      const fullPath = this.safeResolve(context.projectPath, file.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, 'utf8');
    }

    return {
      taskId: task.id,
      status: 'completed',
      files: configFiles,
      logs: [`Setup ${context.framework} configuration`]
    };
  }

  private async executeInstallDeps(task: Task, context: ProjectContext, _sessionId?: string): Promise<TaskResult> {
    // Generate package.json if needed (with path traversal protection)
    const packageJsonPath = this.safeResolve(context.projectPath, 'package.json');
    
    let packageJson: any = {
      name: "generated-app",
      version: "0.1.0",
      private: true,
      dependencies: {},
      devDependencies: {}
    };

    // Add framework-specific dependencies
    if (context.framework === 'react') {
      packageJson.dependencies = {
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      };
      packageJson.devDependencies = {
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        "typescript": "^5.0.0",
        "vite": "^4.4.0",
        "@vitejs/plugin-react": "^4.0.0"
      };
    }

    // Write package.json
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

    return {
      taskId: task.id,
      status: 'completed',
      files: [{
        path: 'package.json',
        content: JSON.stringify(packageJson, null, 2)
      }],
      logs: ['Dependencies configured']
    };
  }

  private getTaskFingerprint(task: Task, projectId?: string): string {
    const data = {
      projectId, // Include projectId to prevent cross-project cache hits
      type: task.type,
      input: task.input,
      targetPath: task.input.targetPath
    };
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private async getCachedResult(fingerprint: string): Promise<TaskResult | null> {
    // In real implementation, check Redis cache
    // For now, return null (no cache)
    return null;
  }

  private async cacheResult(fingerprint: string, result: TaskResult): Promise<void> {
    // In real implementation, store in Redis with TTL
    // For now, do nothing
  }

  // Get task dependencies
  private getTaskDependencies(taskId: string, dependencies: TaskDependency[]): string[] {
    const dep = dependencies.find(d => d.taskId === taskId);
    return dep?.dependsOn || [];
  }

  // Process individual task from queue
  private async processTask(job: Job): Promise<TaskResult> {
    const { task, context, dependencies, sessionId, buildId } = job.data;

    // Wait for dependencies to complete
    if (dependencies && dependencies.length > 0) {
      await this.waitForDependencies(dependencies);
    }

    // Execute the task with timeout, passing sessionId and buildId
    return this.executeTaskWithTimeout(task, context, sessionId, buildId);
  }

  // Wait for dependency tasks to complete
  // Note: dependencyIds are already namespaced (e.g., "task:planId:taskId")
  private async waitForDependencies(dependencyIds: string[]): Promise<void> {
    if (!taskQueue) return;

    const queue = requireQueue(taskQueue, 'ai-tasks');
    const jobs = await Promise.all(
      dependencyIds.map(id => queue.getJob(id))
    );

    // Check for missing dependencies (could happen if removeOnComplete is enabled)
    const missingDeps = dependencyIds.filter((id, index) => !jobs[index]);
    if (missingDeps.length > 0) {
      // Log warning but don't fail - dependency might have completed and been removed
      console.warn(`[TaskExecutor] Missing dependency jobs (may have completed): ${missingDeps.join(', ')}`);
    }

    // Wait for all existing dependency jobs to finish (with timeout)
    const queueEvents = requireQueueEvents(taskQueueEvents, 'ai-tasks');
    const existingJobs = jobs.filter((job): job is Job => job !== null && job !== undefined);

    if (existingJobs.length > 0) {
      await Promise.all(
        existingJobs.map(job => job.waitUntilFinished(queueEvents, this.globalTimeout))
      );
    }
  }

  // Clean up
  async close() {
    if (this.taskWorker) {
      await this.taskWorker.close();
    }
  }

  // Helper methods for extracting imports and exports
  private extractImports(code: string): string[] {
    const imports: string[] = [];
    
    // Match ES6 imports
    const importRegex = /import\s+(?:{([^}]+)}|([^,\s]+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      if (match[1]) {
        // Named imports: import { Component, useState } from 'react'
        const names = match[1].split(',').map(s => s.trim());
        imports.push(...names);
      } else if (match[2]) {
        // Default import: import React from 'react'
        imports.push(match[2].trim());
      }
    }
    
    return imports;
  }

  private extractExports(code: string): string[] {
    const exports: string[] = [];
    
    // Match default exports
    const defaultExportRegex = /export\s+default\s+(?:class|function|const|let|var)?\s*(\w+)/g;
    let match;
    
    while ((match = defaultExportRegex.exec(code)) !== null) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }
    
    // Match named exports
    const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
    while ((match = namedExportRegex.exec(code)) !== null) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }
    
    return exports;
  }
}