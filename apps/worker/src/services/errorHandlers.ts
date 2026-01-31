import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CLAUDE_TIMEOUTS } from '../config/timeouts.env';
import { healJSON } from '../utils/jsonHealer';
import { fixDependencyConflicts } from './dependencyFixer';
import { ErrorContext } from './errorInterceptor';
import { emitBuildEvent } from './eventService';
import { autoFixTypeScriptErrors } from './typeScriptFixer';

interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  lastResponse: any;
}

// Store Claude sessions for resume capability
const claudeSessions = new Map<string, ClaudeSession>();

/**
 * Handler for removing unused TypeScript variables
 */
export async function removeUnusedVariables(context: ErrorContext): Promise<boolean> {
  if (!context.projectContext?.projectPath || !context.errorMessage) return false;

  try {
    return await autoFixTypeScriptErrors(context.projectContext.projectPath, context.errorMessage);
  } catch (error) {
    console.error('Failed to remove unused variables:', error);
    return false;
  }
}

/**
 * Handler for fixing TypeScript export/import mismatches
 */
export async function fixExportMismatch(context: ErrorContext): Promise<boolean> {
  if (!context.projectContext?.projectPath || !context.errorMessage) return false;

  try {
    return await autoFixTypeScriptErrors(context.projectContext.projectPath, context.errorMessage);
  } catch (error) {
    console.error('Failed to fix export mismatch:', error);
    return false;
  }
}

/**
 * Handler for removing duplicate JSX attributes
 */
export async function removeDuplicateJSXAttributes(context: ErrorContext): Promise<boolean> {
  if (!context.projectContext?.projectPath || !context.errorMessage) return false;

  try {
    return await autoFixTypeScriptErrors(context.projectContext.projectPath, context.errorMessage);
  } catch (error) {
    console.error('Failed to remove duplicate JSX attributes:', error);
    return false;
  }
}

/**
 * Handler for Claude-based TypeScript fixes using resume
 */
export async function claudeFixTypeScript(context: ErrorContext): Promise<boolean> {
  if (!context.projectContext?.projectPath || !context.projectContext?.buildId) return false;

  try {
    // Get the session ID from the last Claude response
    const session = claudeSessions.get(context.projectContext.buildId);
    if (!session) {
      console.error('No Claude session found for build:', context.projectContext.buildId);
      return false;
    }

    console.log('[Error Handler] Resuming Claude session to fix TypeScript errors...');

    // Emit event
    await emitBuildEvent(context.projectContext.buildId, 'ai_resume_started', {
      message: 'Resuming Claude session to fix TypeScript errors',
      sessionId: session.sessionId,
      error: context.errorMessage,
      userId: context.projectContext.userId
    });

    // Create a prompt for Claude to fix the TypeScript errors
    const fixPrompt = `The TypeScript build failed with the following errors:

${context.errorMessage}

Please fix these TypeScript compilation errors in the project. Focus on:
1. Fixing any export/import mismatches (use consistent export patterns)
2. Removing unused variables and imports
3. Fixing duplicate JSX attributes
4. Ensuring all components are properly exported

Remember to maintain TypeScript best practices and ensure the code compiles successfully.`;

    // Resume Claude session with the fix prompt
    const claudeProcess = spawn('claude', [
      '--output-format', 'stream-json',
      '--session', session.sessionId,
      '--resume',
      '--yes'
    ], {
      cwd: context.projectContext.projectPath,
      env: process.env
    });

    return new Promise((resolve) => {
      let hasErrors = false;
      const timeout = setTimeout(() => {
        claudeProcess.kill();
        resolve(false);
      }, CLAUDE_TIMEOUTS.errorFix);

      // Send the fix prompt
      claudeProcess.stdin.write(fixPrompt + '\n');
      claudeProcess.stdin.end();

      claudeProcess.stdout.on('data', (data) => {
        const output = data.toString();
        try {
          const lines = output.trim().split('\n');
          for (const line of lines) {
            if (line) {
              const event = JSON.parse(line);
              if (event.type === 'file_content') {
                console.log(`[Claude] Fixing file: ${event.path}`);
              } else if (event.type === 'completion') {
                console.log('[Claude] TypeScript fixes completed');
              }
            }
          }
        } catch (error) {
          console.error('[Claude] Parse error:', error);
        }
      });

      claudeProcess.stderr.on('data', (data) => {
        console.error('[Claude Error]:', data.toString());
        hasErrors = true;
      });

      claudeProcess.on('close', async (code) => {
        clearTimeout(timeout);

        if (code === 0 && !hasErrors) {
          console.log('[Claude] TypeScript fixes applied successfully');

          await emitBuildEvent(context.projectContext!.buildId!, 'ai_resume_completed', {
            message: 'Claude successfully fixed TypeScript errors',
            sessionId: session.sessionId,
            userId: context.projectContext!.userId
          });

          resolve(true);
        } else {
          console.error('[Claude] Failed to fix TypeScript errors, exit code:', code);
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error('Failed to use Claude for TypeScript fixes:', error);
    return false;
  }
}

/**
 * Store Claude session info for later resume
 */
export function storeClaudeSession(buildId: string, sessionId: string, projectPath: string, lastResponse: any): void {
  claudeSessions.set(buildId, {
    sessionId,
    projectPath,
    lastResponse
  });
}

/**
 * Get Claude session info
 */
export function getClaudeSession(buildId: string): ClaudeSession | undefined {
  return claudeSessions.get(buildId);
}

/**
 * Clear Claude session
 */
export function clearClaudeSession(buildId: string): void {
  claudeSessions.delete(buildId);
}

/**
 * Handler for healing JSON files
 */
export async function healJSONHandler(context: ErrorContext): Promise<boolean> {
  if (!context.affectedFiles || context.affectedFiles.length === 0) return false;

  try {
    for (const file of context.affectedFiles) {
      const content = await fs.readFile(file.path, 'utf8');
      const result = healJSON(content, file.path);

      if (result.healed) {
        await fs.writeFile(file.path, result.content);
        console.log(`Healed JSON file: ${file.path}`);
      }
    }
    return true;
  } catch (error) {
    console.error('Failed to heal JSON:', error);
    return false;
  }
}

/**
 * Handler for fixing dependency conflicts
 */
export async function fixDependencyConflictsHandler(context: ErrorContext): Promise<boolean> {
  if (!context.projectContext?.projectPath) return false;

  try {
    const packageJsonPath = path.join(context.projectContext.projectPath, 'package.json');
    const result = await fixDependencyConflicts(packageJsonPath);
    return result.modified;
  } catch (error) {
    console.error('Failed to fix dependency conflicts:', error);
    return false;
  }
}

/**
 * Handler for retrying deployment
 */
export async function retryDeployment(context: ErrorContext): Promise<boolean> {
  // This is handled by the deploy worker itself with retry logic
  // Return true to indicate the error is recoverable
  return true;
}

/**
 * Handler for retrying npm install with backoff
 */
export async function retryNpmInstall(context: ErrorContext): Promise<boolean> {
  // This is handled by the deploy worker itself with retry logic
  // Return true to indicate the error is recoverable
  return true;
}

/**
 * Handler for retrying with exponential backoff
 */
export async function retryWithBackoff(context: ErrorContext): Promise<boolean> {
  // This is handled by the deploy worker itself with retry logic
  // Return true to indicate the error is recoverable
  return true;
}

/**
 * Handler for blocking and reporting security risks
 */
export async function blockAndReport(context: ErrorContext): Promise<boolean> {
  console.error('SECURITY RISK DETECTED:', context.errorMessage);

  if (context.projectContext?.buildId) {
    await emitBuildEvent(context.projectContext.buildId, 'security_risk_blocked', {
      message: 'Security risk detected and blocked',
      error: context.errorMessage,
      severity: 'critical',
      userId: context.projectContext.userId
    });
  }

  // Always return false for security risks - they should not be recovered
  return false;
}

/**
 * Get error handler by name
 */
export function getErrorHandler(handlerName: string): ((context: ErrorContext) => Promise<boolean>) | undefined {
  const handlers: Record<string, (context: ErrorContext) => Promise<boolean>> = {
    removeUnusedVariables,
    fixExportMismatch,
    removeDuplicateJSXAttributes,
    claudeFixTypeScript,
    healJSON: healJSONHandler,
    fixDependencyConflicts: fixDependencyConflictsHandler,
    retryDeployment,
    retryNpmInstall,
    retryWithBackoff,
    blockAndReport
  };

  return handlers[handlerName];
}
