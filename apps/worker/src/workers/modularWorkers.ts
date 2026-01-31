import { Worker } from 'bullmq';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ulid } from 'ulid';
import { Redis } from 'ioredis';
import { ProviderFactory } from '../providers/providerFactory';
import { deployQueue, taskQueue, requireQueue } from '../queue/modularQueues';
import { createProjectVersion } from '../services/databaseWrapper';
import { emitBuildEvent } from '../services/eventService';
import { PlanGeneratorService } from '../services/planGenerator';
import { TaskDatabase } from '../services/taskDatabase';
import { TaskExecutorService } from '../services/taskExecutor';
// import { SessionManager } from '../services/sessionManager';
import { WebhookService } from '../services/webhookService';
import { shutdownDeployWorker, startDeployWorker } from './deployWorker';

// Helper to sanitize file paths - removes absolute paths and ensures relative paths
// SECURITY: Prevents path traversal attacks (e.g., ../../../etc/passwd)
function sanitizePath(filePath: string, projectPath: string): string {
  // If the path contains the project path, extract only the relative part
  if (filePath.includes(projectPath)) {
    const relativePath = filePath.substring(filePath.lastIndexOf(projectPath) + projectPath.length);
    const cleaned = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    return validateAndNormalizePath(cleaned, projectPath);
  }

  // Remove leading slashes to ensure relative path
  if (filePath.startsWith('/')) {
    // Check if it's an absolute path that contains project structure
    const match = filePath.match(/\/projects\/[^/]+\/[^/]+\/(.*)/);
    if (match && match[1]) {
      return validateAndNormalizePath(match[1], projectPath);
    }
    // For other absolute paths, just remove the leading slash
    return validateAndNormalizePath(filePath.substring(1), projectPath);
  }

  return validateAndNormalizePath(filePath, projectPath);
}

// SECURITY: Validate that path doesn't escape project directory
function validateAndNormalizePath(relativePath: string, projectPath: string): string {
  // Normalize the path to resolve . and .. segments
  const normalized = path.posix.normalize(relativePath);

  // SECURITY: Block any path that starts with .. or contains /../
  if (normalized.startsWith('..') || normalized.includes('/../') || normalized === '..') {
    console.error(`[SECURITY] Blocked path traversal attempt: ${relativePath}`);
    throw new Error(`SECURITY: Path traversal blocked - invalid path: ${relativePath}`);
  }

  // Double-check: resolve full path and ensure it stays within project
  const fullPath = path.resolve(projectPath, normalized);
  const normalizedProjectPath = path.resolve(projectPath);

  if (!fullPath.startsWith(normalizedProjectPath + path.sep) && fullPath !== normalizedProjectPath) {
    console.error(`[SECURITY] Blocked path escape attempt: ${relativePath} -> ${fullPath}`);
    throw new Error(`SECURITY: Path would escape project directory: ${relativePath}`);
  }

  return normalized;
}

// Bootstrap Environment Setup with Wrapper Verification
function setupWorkerEnvironment() {
  // Centralize PATH fix at worker bootstrap
  const currentPath = process.env.PATH || '';
  const enhancedPath = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    `${process.cwd()}/node_modules/.bin`,
    currentPath
  ].filter(Boolean).join(':');

  process.env.PATH = enhancedPath;

  // Verify Claude wrapper exists and is executable
  const CLAUDE_WRAPPER_PATH = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');

  try {
    // Check if wrapper exists
    fs.accessSync(CLAUDE_WRAPPER_PATH, fs.constants.F_OK);
    console.log(`✅ Claude wrapper found at: ${CLAUDE_WRAPPER_PATH}`);

    // Test if it works
    const testResult = child_process.execSync(`node ${CLAUDE_WRAPPER_PATH} --version`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
    }).trim();
    console.log(`✅ Claude wrapper test successful: ${testResult}`);

  } catch (error) {
    console.error('❌ Claude wrapper verification failed');
    console.error(`   Expected at: ${CLAUDE_WRAPPER_PATH}`);
    console.error(`   Error: ${(error as Error).message}`);
    console.error('   Fix: Ensure scripts/claude-wrapper.js exists and Claude CLI is installed');
  }

  return CLAUDE_WRAPPER_PATH;
}

// Initialize environment and verify wrapper
export const CLAUDE_WRAPPER = setupWorkerEnvironment();

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// Initialize services
const webhookService = new WebhookService();
const taskDb = new TaskDatabase();

// Initialize Redis and SessionManager for session context
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});
// const sessionManager = new SessionManager(redis);

// Plan Worker - Generates task plans
export const planWorker = new Worker(
  'plans',
  async (job) => {
    const { prompt, framework, userId, projectId, projectPath } = job.data;
    const buildId = job.id!;

    // Emit plan started event
    await emitBuildEvent(buildId, 'plan_started', {
      message: 'Analyzing your requirements...',
      prompt: prompt.substring(0, 100) + '...'
    });

    // Diagnostic: Test if spawning works in worker
    try {
      const { execSync } = require('child_process');
      const nodeVersion = execSync('node -v').toString().trim();
      console.log(`[DIAGNOSTIC] Worker can spawn! Node version: ${nodeVersion}`);
      console.log(`[DIAGNOSTIC] Worker PATH: ${process.env.PATH}`);

      // Also test if we can find claude
      try {
        const claudeLocation = execSync('command -v claude').toString().trim();
        console.log(`[DIAGNOSTIC] Claude found at: ${claudeLocation}`);
      } catch (e) {
        console.log(`[DIAGNOSTIC] Claude not found in PATH`);
      }
    } catch (error) {
      console.error(`[DIAGNOSTIC] Worker cannot spawn processes:`, (error as Error).message);
    }

    const aiProvider = ProviderFactory.getProvider();
    const planGenerator = new PlanGeneratorService(webhookService, aiProvider);

    const plan = await planGenerator.generatePlan(prompt, {
      framework,
      existingFiles: [],
      projectPath,
      buildId: job.id!,
      userId,
      projectId
    });

    // Store plan in database
    await taskDb.createTaskPlan(plan);

    // Emit plan generated event
    await emitBuildEvent(buildId, 'plan_generated', {
      message: `Generated plan with ${plan.tasks.length} tasks`,
      taskCount: plan.tasks.length,
      tasks: plan.tasks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type
      }))
    });

    console.log('[Plan Worker] Generated plan with tasks:', plan.tasks.length);
    console.log('[Plan Worker] Plan structure:', {
      id: plan.id,
      taskCount: plan.tasks.length,
      hasTasksProperty: 'tasks' in plan,
      taskIds: plan.tasks.map(t => t.id)
    });

    // Enqueue the entire plan for execution
    await requireQueue(taskQueue, 'ai-tasks').add('execute-plan', {
      plan,
      projectPath,
      framework,
      userId,
      projectId
    });

    return plan;
  },
  { connection, concurrency: 2 }
);

// Task Worker - Handles both plan execution and individual task execution
export const taskWorker = new Worker(
  'ai-tasks',
  async (job) => {
    console.log('[Task Worker] Received job:', job.name);
    console.log('[Task Worker] Job data keys:', Object.keys(job.data));

    const aiProvider = ProviderFactory.getProvider();

    // Handle plan execution jobs
    if (job.name === 'execute-plan') {
      const { plan, projectPath, framework, userId, projectId } = job.data;

      // CRITICAL: Ensure project directory exists before any tasks run
      const fs = require('fs').promises;
      try {
        await fs.mkdir(projectPath, { recursive: true });
        console.log(`[Task Worker] Ensured project directory exists: ${projectPath}`);
      } catch (error: any) {
        console.error(`[Task Worker] Failed to create project directory: ${error.message}`);
        throw new Error(`Cannot create project directory: ${projectPath}`);
      }

      // Validate plan structure
      if (!plan || !plan.tasks) {
        console.error('[Task Worker] Invalid plan structure:', plan);
        throw new Error(`Invalid plan structure: missing tasks property`);
      }

      const taskExecutor = new TaskExecutorService(webhookService, aiProvider, taskDb/*, sessionManager*/);

      const results = await taskExecutor.executePlan(plan, {
        projectPath,
        framework,
        existingFiles: [],
        userId,
        projectId
      });

      // After all tasks complete, trigger deployment
      console.log('[Task Worker] All tasks completed, triggering deployment...');

      // Create version record if not exists
      const versionId = ulid();
      await createProjectVersion({
        versionId,
        userId,
        projectId,
        prompt: plan.originalPrompt,
        status: 'building',
        needsRebuild: false
      });

      // Add deployment job with deduplication
      await requireQueue(deployQueue, 'deployments').add('deploy-build', {
        buildId: plan.buildId,
        planId: plan.id,
        projectPath,
        userId,
        projectId,
        versionId,
        prompt: plan.originalPrompt
      }, {
        jobId: `deploy-${plan.buildId}`, // Unique job ID prevents duplicates
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      return results;
    }

    // Handle individual task execution jobs
    if (job.name.startsWith('execute-')) {
      const { task, context, planId, buildId, sessionId } = job.data;

      console.log(`[Task Worker] Executing individual task: ${task.name} (${task.type})`);

      // Send webhook: task started
      await webhookService.send({
        type: 'task_started',
        buildId: buildId,
        data: {
          taskId: task.id,
          taskName: task.name,
          description: task.description
        }
      });

      // Emit task started event
      await emitBuildEvent(buildId, 'task_started', {
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
        message: `Starting: ${task.name}`
      });

      try {
        // Update task status to in_progress
        await taskDb.updateTask(task.id, {
          status: 'in_progress',
          startedAt: new Date()
        });

        // Execute the task based on its type
        let result: any;
        console.log(`Executing task: ${task.name} (${task.type})`);

        switch (task.type) {
          case 'create_file': {
            const rawTargetPath = task.input.targetPath || 'generated-file.ts';
            const targetPath = sanitizePath(rawTargetPath, context.projectPath);
            const prompt = task.input.prompt || 'Create a file';
            
            console.log(`[create_file] Debug info:
              - Raw target path: ${rawTargetPath}
              - Sanitized path: ${targetPath}  
              - Project path: ${context.projectPath}
              - Current working dir: ${process.cwd()}`);

            // Get session context if available
            let contextPrompt = '';
            let claudeSessionId = sessionId;
            // if (sessionManager && sessionId) {
            //   const session = await sessionManager.getSession(sessionId);
            //   if (session) {
            //     claudeSessionId = session.claudeSessionId;
            //     contextPrompt = sessionManager.buildContextPrompt(session);
            //     console.log(`[create_file] Using session ${sessionId} with context`);
            //   }
            // }

            // Call AI provider to generate content with session context
            const aiResult = aiProvider.transformWithSession && sessionId
              ? await aiProvider.transformWithSession({
                  type: 'code_gen',
                  input: prompt,
                  context: {
                    targetPath,
                    framework: context.framework,
                    projectPath: context.projectPath
                  }
                }, claudeSessionId || sessionId, contextPrompt)
              : await aiProvider.transform({
                  type: 'code_gen',
                  input: prompt,
                  context: {
                    targetPath,
                    framework: context.framework,
                    projectPath: context.projectPath
                  }
                }, claudeSessionId);

            // Write file to project
            const fs = require('fs').promises;
            const path = require('path');
            const fullPath = path.join(context.projectPath, targetPath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, aiResult.output, 'utf8');

            // Update session with file info and Claude session ID
            // if (sessionManager && sessionId) {
            //   // Update Claude session ID if returned
            //   if (aiResult.claudeSessionId && !claudeSessionId) {
            //     await sessionManager.setClaudeSessionId(sessionId, aiResult.claudeSessionId);
            //   }
            //   
            //   // Add file to session
            //   await sessionManager.addFile(sessionId, targetPath);
            //   
            //   // Extract and store imports/exports
            //   const imports = extractImports(aiResult.output);
            //   const exports = extractExports(aiResult.output);
            //   
            //   if (imports.length > 0) {
            //     await sessionManager.addImports(sessionId, targetPath, imports);
            //   }
            //   if (exports.length > 0) {
            //     await sessionManager.addExports(sessionId, targetPath, exports);
            //   }
            // }

            result = {
              taskId: task.id,
              status: 'completed',
              files: [{
                path: targetPath,
                content: aiResult.output
              }],
              tokenUsage: aiResult.usage
            };
            break;
          }

          case 'modify_file': {
            const rawTargetPath = task.input.targetPath || '';
            const targetPath = sanitizePath(rawTargetPath, context.projectPath);
            const prompt = task.input.prompt || 'Modify file';

            // Read existing file
            const fs = require('fs').promises;
            const path = require('path');
            const fullPath = path.join(context.projectPath, targetPath);
            let existingContent = '';

            try {
              existingContent = await fs.readFile(fullPath, 'utf8');
            } catch (error) {
              console.warn(`File not found: ${targetPath}, will create new file`);
            }

            // Call AI provider to modify content
            const aiResult = await aiProvider.transform({
              type: 'refactor',
              input: `${prompt}\n\nExisting content:\n${existingContent}`,
              context: {
                targetPath,
                framework: context.framework,
                projectPath: context.projectPath
              }
            });

            // Write modified file
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, aiResult.output, 'utf8');

            result = {
              taskId: task.id,
              status: 'completed',
              files: [{
                path: targetPath,
                content: aiResult.output
              }],
              tokenUsage: aiResult.usage
            };
            break;
          }

          case 'install_deps': {
            const prompt = task.input.prompt || 'Install dependencies';

            // Use spawn with explicit shell for better cross-platform compatibility
            const { spawn } = require('child_process');
            
            try {
              console.log(`[install_deps] Running pnpm install in ${context.projectPath}`);
              
              // First check if package.json exists
              const fs = require('fs').promises;
              const path = require('path');
              const packageJsonPath = path.join(context.projectPath, 'package.json');
              
              try {
                await fs.access(packageJsonPath);
              } catch (e) {
                console.log(`[install_deps] No package.json found, skipping install`);
                result = {
                  taskId: task.id,
                  status: 'completed',
                  output: {
                    stdout: '',
                    stderr: '',
                    message: 'No package.json found, skipping dependency installation'
                  },
                  tokenUsage: { totalCost: 0, promptTokens: 0, completionTokens: 0 }
                };
                break;
              }

              // Use spawn instead of exec for better error handling
              const npmInstall = spawn('npm', ['install', '--production=false'], {
                cwd: context.projectPath,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                env: { ...process.env, NODE_ENV: 'development' }
              });

              let stdout = '';
              let stderr = '';

              npmInstall.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
              });

              npmInstall.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
              });

              await new Promise<void>((resolve, reject) => {
                // Store timeout so we can clear it on completion
                const timeoutId = setTimeout(() => {
                  npmInstall.kill();
                  reject(new Error('npm install timed out after 2 minutes'));
                }, 120000);

                npmInstall.on('close', (code: number | null) => {
                  clearTimeout(timeoutId); // Clear timeout on completion
                  if (code !== 0) {
                    reject(new Error(`npm install exited with code ${code}`));
                  } else {
                    resolve();
                  }
                });

                npmInstall.on('error', (err: Error) => {
                  clearTimeout(timeoutId); // Clear timeout on error
                  reject(err);
                });
              });

              result = {
                taskId: task.id,
                status: 'completed',
                output: {
                  stdout: stdout.trim(),
                  stderr: stderr.trim(),
                  message: 'Dependencies installed successfully'
                },
                tokenUsage: { totalCost: 0, promptTokens: 0, completionTokens: 0 }
              };

              console.log(`[install_deps] Success:`, stdout.trim().split('\n').slice(-5).join('\n'));

            } catch (error: any) {
              console.error(`[install_deps] Failed:`, error.message);
              // Try to provide more helpful error message
              if (error.code === 'ENOENT') {
                throw new Error(`Failed to install dependencies: npm not found. Make sure Node.js is installed.`);
              }
              throw new Error(`Failed to install dependencies: ${error.message}`);
            }
            break;
          }

          case 'create_component': {
            const rawTargetPath = task.input.targetPath || `src/components/${task.name.replace(/\s+/g, '')}.tsx`;
            const targetPath = sanitizePath(rawTargetPath, context.projectPath);
            const prompt = task.input.prompt || `Create ${task.name} component`;

            // Simple React component scaffold as suggested in feedback
            const componentName = task.name.replace(/\s+/g, '').replace(/^Create\s*/, '');
            const componentTemplate = `import React from 'react';

interface ${componentName}Props {
  // Add your props here
}

const ${componentName}: React.FC<${componentName}Props> = () => {
  return (
    <div className="${componentName.toLowerCase()}">
      <h2>${componentName}</h2>
      {/* Add your component content here */}
    </div>
  );
};

export default ${componentName};
`;

            // Write component file to project
            const fs = require('fs').promises;
            const path = require('path');
            const fullPath = path.join(context.projectPath, targetPath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, componentTemplate, 'utf8');

            result = {
              taskId: task.id,
              status: 'completed',
              files: [{
                path: targetPath,
                content: componentTemplate
              }],
              tokenUsage: { totalCost: 0, promptTokens: 0, completionTokens: 0 }
            };

            console.log(`[create_component] Created ${componentName} at ${targetPath}`);
            break;
          }

          case 'setup_config': {
            const rawTargetPath = task.input.targetPath || 'config.json';
            const targetPath = sanitizePath(rawTargetPath, context.projectPath);
            const prompt = task.input.prompt || 'Setup configuration';
            
            // Call AI provider to generate config content
            const aiResult = await aiProvider.transform({
              type: 'code_gen',
              input: prompt,
              context: {
                targetPath,
                framework: context.framework,
                projectPath: context.projectPath
              }
            });

            // Write config file to project
            const fs = require('fs').promises;
            const path = require('path');
            const fullPath = path.join(context.projectPath, targetPath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, aiResult.output, 'utf8');

            result = {
              taskId: task.id,
              status: 'completed',
              files: [{
                path: targetPath,
                content: aiResult.output
              }],
              tokenUsage: aiResult.usage
            };

            console.log(`[setup_config] Created config at ${targetPath}`);
            break;
          }

          default:
            // Log unknown task type for future implementation
            console.warn(`[UNKNOWN TASK TYPE] ${task.type} - treating as AI-generated file task`);
            
            // Fallback: treat unknown types as generic file creation tasks
            const rawTargetPath = task.input.targetPath || `generated-${task.type}.txt`;
            const targetPath = sanitizePath(rawTargetPath, context.projectPath);
            const prompt = task.input.prompt || task.description || `Execute ${task.type} task`;
            
            // Let AI handle it as a generic code generation task
            const aiResult = await aiProvider.transform({
              type: 'code_gen',
              input: `Task type: ${task.type}\n${prompt}`,
              context: {
                targetPath,
                framework: context.framework,
                projectPath: context.projectPath
              }
            });

            // Write result to file
            const fs = require('fs').promises;
            const path = require('path');
            const fullPath = path.join(context.projectPath, targetPath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, aiResult.output, 'utf8');

            result = {
              taskId: task.id,
              status: 'completed',
              files: [{
                path: targetPath,
                content: aiResult.output
              }],
              tokenUsage: aiResult.usage
            };

            console.log(`[FALLBACK] Handled unknown task type '${task.type}' as file generation`);
            break;
        }

        // Update task status in database
        await taskDb.updateTask(task.id, {
          status: 'completed',
          output: result,
          finishedAt: new Date()
        });

        // Send webhook: task completed
        await webhookService.send({
          type: 'task_completed',
          buildId: buildId,
          data: {
            taskId: task.id,
            taskName: task.name,
            filesCreated: result.files?.length || 0
          }
        });

        // Emit task completed event
        await emitBuildEvent(buildId, 'task_completed', {
          taskId: task.id,
          taskName: task.name,
          filesCreated: result.files?.length || 0,
          message: `Completed: ${task.name}`
        });

        console.log(`Task ${task.id} completed successfully`);
        return result;
      } catch (error) {
        // Update task status in database
        await taskDb.updateTask(task.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date()
        });

        // Send webhook: task failed
        await webhookService.send({
          type: 'task_failed',
          buildId: buildId,
          data: {
            taskId: task.id,
            taskName: task.name,
            error: error instanceof Error ? error.message : String(error)
          }
        });

        // Emit task failed event
        await emitBuildEvent(buildId, 'task_failed', {
          taskId: task.id,
          taskName: task.name,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed: ${task.name}`
        });

        throw error;
      }
    }

    throw new Error(`Unknown job type: ${job.name}`);
  },
  { connection, concurrency: 5 }
);

// Note: Webhook worker is handled internally by WebhookService

// Start all modular workers
export async function startModularWorkers() {
  console.log('Starting plan worker...');
  planWorker.on('completed', (job) => {
    console.log(`[PLAN] Completed: ${job.id}`);
  });
  planWorker.on('failed', (job, err) => {
    console.error(`[PLAN] Failed ${job?.id}:`, err);
  });

  console.log('Starting task worker...');
  taskWorker.on('completed', (job) => {
    console.log(`[TASK] Completed: ${job.id}`);
  });
  taskWorker.on('failed', (job, err) => {
    console.error(`[TASK] Failed ${job?.id}:`, err);
  });

  console.log('Starting deploy worker...');
  await startDeployWorker();

  console.log('✅ Modular workers started');
}

// Graceful shutdown
export async function shutdownModularWorkers() {
  console.log('Shutting down modular workers...');
  await planWorker.close();
  await taskWorker.close();
  await shutdownDeployWorker();
  await webhookService.close();
  console.log('✅ Modular workers shut down');
}

// Helper functions for extracting imports and exports
function extractImports(code: string): string[] {
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

function extractExports(code: string): string[] {
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
