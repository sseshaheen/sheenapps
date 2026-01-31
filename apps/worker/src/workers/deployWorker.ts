import { Job, Worker, QueueEvents, Processor } from 'bullmq';
import IORedis from 'ioredis';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as tar from 'tar';
import { unlink } from 'fs/promises';
import { isDirectModeEnabled } from '../config/directMode';
import { getBuildCache } from '../services/buildCache';
import { setLatestVersion } from '../services/cloudflareKV';
import { deployToCloudflarePages } from '../services/cloudflarePages';
import { CloudflareThreeLaneDeployment } from '../services/cloudflareThreeLaneDeployment';
import { getArtifactKey, getRetentionPolicy, uploadToR2 } from '../services/cloudflareR2';
import { updateProjectVersion } from '../services/databaseWrapper';
import { assignDisplayVersion } from '../services/versioningService';
import {
  fixDependencyConflicts,
  isStaticSite,
  verifyInstallationHealth,
  verifyPackagesExist
} from '../services/dependencyFixer';
import { mockUploadToR2 } from '../services/directModeMocks';
import { getErrorInterceptor } from '../services/errorInterceptor';
import { CleanEventEmitter } from '../services/eventService';
import { metricsService } from '../services/metricsService';
import { getProjectConfig, updateProjectConfig } from '../services/projectConfigService';
import { getWebhookService } from '../services/webhookService';
import { calculateOverallProgress } from '../types/cleanEvents';
import { POSSIBLE_BUILD_DIRS } from '../utils/buildDirectories';
import { calculateSHA256, formatFileSize, getFileSize } from '../utils/checksums';
import { healJSON } from '../utils/jsonHealer';
import { createLogSafe, logSafe } from '../utils/logSafe';
import { detectPackageManager } from '../utils/packageManager';
import { SecureFileOperations } from '../utils/secureFileOperations';
import { SecurePathValidator } from '../utils/securePathValidator';

// Temporary stub for legacy events during migration (internal events only)
async function emitBuildEvent(buildId: string, type: string, data: any) {
  // Internal events are logged but not sent to frontend
  console.log(`[Deploy Worker] Internal event: ${type}`, data);
}

// Expert fix: Hardened Redis connection using IORedis
const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// Artifact size limits
const MAX_ARTIFACT_SIZE = 1024 * 1024 * 1024; // 1 GB
const WARN_ARTIFACT_SIZE = 100 * 1024 * 1024; // 100 MB warning threshold

// Get error interceptor instance (only if error recovery is enabled)
const errorInterceptor = process.env.ERROR_RECOVERY_ENABLED !== 'false' ? getErrorInterceptor() : null;

// Expert fix: Type definitions for BullMQ Worker (matching actual return)
type DeployJobResult = {
  success: boolean;
  previewUrl: string;
  deploymentId: string | undefined;
  buildId: string;
  versionId: string;
};

// Expert fix: Assert processor function is correct type
function assertProcessor(p: unknown): asserts p is Processor<DeployJobData, DeployJobResult> {
  if (typeof p !== 'function') {
    throw new Error(
      `Deploy Worker init error: processor must be a function, got ${typeof p} (${JSON.stringify(p)})`
    );
  }
}


// Create deploy worker specific logger with consistent prefix
const deployLog = createLogSafe({ prefix: '[Deploy Worker] ' });

/**
 * Determine if TypeScript validation should be skipped because the build process will handle it
 * @param packageContent Parsed package.json content
 * @returns true if TypeScript validation is redundant
 */
function shouldSkipTypeScriptValidation(packageContent: any): boolean {
  const buildScript = packageContent.scripts?.build || '';

  // These build tools already perform comprehensive TypeScript validation
  const typeCheckingBuilders = [
    'vite build',        // Vite performs type checking during build
    'next build',        // Next.js performs type checking
    'svelte-kit build',  // SvelteKit performs type checking
    'nuxt build',        // Nuxt performs type checking
    'tsc &&',            // Build script already includes tsc
    'tsc;'               // Build script already includes tsc
  ];

  const hasTypeCheckingBuilder = typeCheckingBuilders.some(builder =>
    buildScript.includes(builder)
  );

  if (hasTypeCheckingBuilder) {
    deployLog(`Skipping standalone TypeScript validation - build script handles it: ${buildScript}`);
    return true;
  }

  return false;
}

/**
 * Create a streamed tar.gz archive instead of loading everything into memory
 * This prevents OOM errors for large projects and is more efficient
 * @param sourceDir Directory to archive
 * @param outputPath Path for the output tar.gz file
 */
async function createStreamedArtifact(sourceDir: string, outputPath: string): Promise<void> {
  deployLog(`Creating streamed tar.gz archive: ${path.basename(outputPath)}`);

  try {
    await tar.create(
      {
        file: outputPath,
        gzip: true,
        // Archive from INSIDE the source directory to create flat paths
        // This creates files like "index.html" instead of "dist/index.html"
        cwd: sourceDir,
        // Exclude common files that shouldn't be in artifacts
        filter: (filePath: string) => {
          const excludePatterns = [
            '.git/',
            'node_modules/',
            '.env',
            '.env.local',
            '.DS_Store',
            'Thumbs.db',
            // Also exclude any artifact files that might be present from failed cleanups
            '-artifact.tar.gz'
          ];
          return !excludePatterns.some(pattern => filePath.includes(pattern));
        }
      },
      ['.']  // Archive all files in sourceDir
    );

    deployLog(`Streamed tar.gz archive created successfully`);
  } catch (error) {
    throw new Error(`Failed to create tar archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper to check if dependencies have changed
async function needsDependencyInstall(projectPath: string, previousVersionId?: string): Promise<boolean> {
  if (!previousVersionId) {
    console.log('[Deploy Worker] No previous version, dependencies need install');
    return true; // First build always needs install
  }

  // Check if node_modules exists
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  try {
    await SecureFileOperations.secureAccess(nodeModulesPath, projectPath);
    const stat = await SecureFileOperations.secureStat(nodeModulesPath, projectPath);
    if (!stat.isDirectory()) {
      console.log('[Deploy Worker] node_modules is not a directory, needs install');
      return true;
    }
  } catch {
    console.log('[Deploy Worker] node_modules does not exist, needs install');
    return true;
  }

  // For now, we'll always return false if node_modules exists
  // In a full implementation, we'd compare package.json and lock files with the previous version
  console.log('[Deploy Worker] node_modules exists, skipping install to save time');
  return false;
}

interface DeployJobData {
  buildId: string;
  planId: string;
  projectPath: string;
  userId: string;
  projectId: string;
  versionId: string;
  prompt: string;
  baseVersionId?: string; // Previous version ID for incremental builds
  claudeStats?: {
    sessionId?: string;
    cost?: number;
    tokens?: {
      input: number;
      output: number;
    };
    duration?: number;
  };
}

// Helper to report error and throw
async function reportAndThrow(
  error: Error | string,
  context: {
    source: 'deploy';
    stage: string;
    projectId: string;
    userId: string;
    buildId: string;
    projectPath?: string;
  }
): Promise<never> {
  const err = error instanceof Error ? error : new Error(error);

  // Report to error interceptor for potential recovery
  if (errorInterceptor) {
    await errorInterceptor.reportError(err, context);
  }

  // Re-throw the error
  throw err;
}

// Helper to execute shell commands
function execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    console.log(`[Deploy] Executing: ${command} in ${cwd}`);

    const child = spawn('sh', ['-c', command], {
      cwd,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[Deploy stdout]: ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`[Deploy stderr]: ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Auto-heal Next.js config compatibility for Next 14.x
async function ensureNextConfigCompatibility(
  projectPath: string,
  userId: string,
  projectId: string
): Promise<void> {
  try {
    const pkgPath = path.join(projectPath, 'package.json');
    const tsPath = path.join(projectPath, 'next.config.ts');
    const mjsPath = path.join(projectPath, 'next.config.mjs');
    const jsPath = path.join(projectPath, 'next.config.js');

    // Only act if a TS config exists
    let hasTs = false;
    try {
      await SecureFileOperations.secureAccess(tsPath, projectPath, userId, projectId);
      hasTs = true;
    } catch {
      return; // No TS config found
    }

    // Don't convert if JS or MJS config already exists
    let hasJsOrMjs = false;
    try {
      await SecureFileOperations.secureAccess(mjsPath, projectPath, userId, projectId);
      hasJsOrMjs = true;
    } catch {}
    try {
      await SecureFileOperations.secureAccess(jsPath, projectPath, userId, projectId);
      hasJsOrMjs = true;
    } catch {}
    if (hasJsOrMjs) return;

    // Check Next.js version - only convert for < 15
    let needsConversion = true;
    try {
      const pkg = JSON.parse(await SecureFileOperations.secureRead(pkgPath, projectPath, userId, projectId));
      const ver = pkg.dependencies?.next || pkg.devDependencies?.next || '';
      // Simple check for >= 15.x (anything else gets converted)
      needsConversion = !/^\s*(\^|~)?1[5-9]\./.test(ver);
    } catch {
      // If we can't read package.json, assume conversion needed
    }

    if (!needsConversion) return;

    // Our generated configs are already plain JS - just copy content
    const tsContent = await SecureFileOperations.secureRead(tsPath, projectPath, userId, projectId);
    await SecureFileOperations.secureWrite(mjsPath, tsContent, projectPath, userId, projectId);
    await SecureFileOperations.secureUnlink(tsPath, projectPath, userId, projectId);

    console.log('[Deploy Worker] ✅ Converted next.config.ts → next.config.mjs for Next 14.x compatibility');
  } catch (error) {
    console.warn('[Deploy Worker] ⚠️ Auto-heal config conversion failed:', (error as Error).message);
    // Don't throw - let the build proceed and fail normally if needed
  }
}

// Helper functions for build caching
async function detectFramework(packageContent: any, projectPath: string, userId?: string, projectId?: string): Promise<string> {
  // Check for specific framework combinations first
  if (packageContent.dependencies?.next || packageContent.devDependencies?.next) {
    return 'nextjs';
  }

  // Check for Vite-based projects (both package.json and config files)
  const hasViteDependency = packageContent.devDependencies?.vite || packageContent.dependencies?.vite;

  // 🔒 SECURITY: Use secure file operations for vite config checks
  let viteConfigExists = false;
  const viteConfigFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mts'];
  for (const configFile of viteConfigFiles) {
    try {
      await SecureFileOperations.secureAccess(path.join(projectPath, configFile), projectPath, userId, projectId);
      viteConfigExists = true;
      break;
    } catch {
      // File doesn't exist, continue checking
    }
  }

  if (hasViteDependency || viteConfigExists) {
    // Check if it's a React+Vite project
    if (packageContent.dependencies?.react || packageContent.devDependencies?.react) {
      return 'react+vite';
    }
    // Check if it's a Vue+Vite project
    if (packageContent.dependencies?.vue || packageContent.devDependencies?.vue) {
      return 'vue+vite';
    }
    // Check if it's a Svelte+Vite project
    if (packageContent.dependencies?.svelte || packageContent.devDependencies?.svelte) {
      return 'svelte+vite';
    }
    return 'vite';
  }

  // Check for standalone frameworks
  if (packageContent.dependencies?.react || packageContent.devDependencies?.react) {
    return 'react';
  }
  if (packageContent.dependencies?.vue || packageContent.devDependencies?.vue) {
    return 'vue';
  }
  if (packageContent.dependencies?.angular || packageContent.devDependencies?.angular) {
    return 'angular';
  }
  if (packageContent.dependencies?.svelte || packageContent.devDependencies?.svelte) {
    return 'svelte';
  }

  return 'unknown';
}

async function performBuild(
  projectPath: string,
  buildCommand: string,
  buildCache: any,
  framework: string,
  buildId: string,
  projectId: string,
  userId: string
): Promise<void> {
  try {
    await execCommand('npm run build', projectPath);

    // Cache the build output using centralized build directory detection
    let buildOutputPath: string | null = null;

    for (const dir of POSSIBLE_BUILD_DIRS) {
      const fullPath = path.join(projectPath, dir);
      try {
        await SecureFileOperations.secureAccess(fullPath, projectPath, userId, projectId);
        const stat = await SecureFileOperations.secureStat(fullPath, projectPath, userId, projectId);
        if (stat.isDirectory()) {
          buildOutputPath = fullPath;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (buildOutputPath) {
      console.log('[Deploy Worker] Caching build output...');
      const cached = await buildCache.set(projectPath, buildOutputPath, framework, buildCommand);
      if (cached) {
        console.log('[Deploy Worker] Build output cached successfully');
      }
    }
  } catch (buildError) {
    // Report build error to recovery system
    if (buildError instanceof Error && process.env.ERROR_RECOVERY_ENABLED !== 'false') {
      const errorInterceptor = getErrorInterceptor();
      await errorInterceptor.reportError(buildError, {
        source: 'deploy',
        stage: 'build',
        projectId,
        userId,
        buildId
      });
    }
    throw buildError;
  }
}

// Deploy Worker - Handles build and deployment after tasks complete
// Simple edge runtime detection for safety net
async function detectEdgeRuntimeMarkers(projectPath: string, userId: string, projectId: string): Promise<{detected: boolean, files: string[]}> {
  try {
    const apiDir = path.join(projectPath, 'app', 'api');
    await SecureFileOperations.secureAccess(apiDir, projectPath, userId, projectId);
    
    // Simple check for edge runtime exports in API routes
    const routePattern = /route\.(ts|tsx|js|jsx|mjs)$/;
    const edgePattern = /export\s+const\s+runtime\s*=\s*['"]edge['"]/;
    const edgeFiles: string[] = [];
    
    const apiContents = await SecureFileOperations.secureReaddir(apiDir, projectPath, userId, projectId);
    for (const item of apiContents) {
      const itemPath = path.join(apiDir, item);
      try {
        const stat = await SecureFileOperations.secureStat(itemPath, projectPath, userId, projectId);
        if (stat.isDirectory()) {
          // Check for route files in subdirectories
          const subContents = await SecureFileOperations.secureReaddir(itemPath, projectPath, userId, projectId);
          for (const subItem of subContents) {
            if (routePattern.test(subItem)) {
              const routeFile = path.join(itemPath, subItem);
              const content = await SecureFileOperations.secureRead(routeFile, projectPath, userId, projectId);
              if (edgePattern.test(content)) {
                edgeFiles.push(path.relative(projectPath, routeFile));
              }
            }
          }
        }
      } catch {
        // Skip unreadable items
      }
    }
    
    return { detected: edgeFiles.length > 0, files: edgeFiles };
  } catch {
    return { detected: false, files: [] };
  }
}

// Expert fix: Define processor function separately for type checking
const processor: Processor<DeployJobData, DeployJobResult> = async (job: Job<DeployJobData>) => {
  console.log('[Deploy Worker] Picked job', { id: job.id, name: job.name, dataKeys: Object.keys(job.data || {}) });
    const { buildId, planId, projectPath, userId, projectId, versionId, prompt, baseVersionId, claudeStats } = job.data;

    console.log(`[Deploy Worker] Starting deployment for ${userId}/${projectId}`);
    console.log(`[Deploy Worker] Project path: ${projectPath}`);
    
    // Make three-lane feature flag explicit in logs
    const threeLaneEnabled = process.env.ENABLE_THREE_LANE_DEPLOYMENT !== 'false';
    console.log(`[Deploy Worker] Three-lane deployment: ${threeLaneEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (!threeLaneEnabled) {
      console.warn('[Deploy Worker] ⚠️ Three-lane deployment is DISABLED - will use legacy static hosting');
    }

    // Initialize clean event emitter for user-facing events
    const cleanEmitter = new CleanEventEmitter(buildId, userId);

    // Emit deployment start event with structured i18n code
    await cleanEmitter.phaseStartedWithCode(
      'dependencies',
      'BUILD_DEPENDENCIES_INSTALLING',
      {
        timestamp: Date.now(),
        projectId,
        versionId,
        packageManager: 'detecting', // Will be detected below
        nodeVersion: process.version
      },
      calculateOverallProgress('dependencies', 0.0)
    );

    // Get webhook service
    const webhookService = getWebhookService();

    // Track timing
    const deploymentStartTime = Date.now();
    let installStartTime: number | null = null;
    let installEndTime: number | null = null;
    let buildStartTime: number | null = null;
    let buildEndTime: number | null = null;
    let uploadStartTime: number | null = null;
    let uploadEndTime: number | null = null;
    let installStrategy: string | null = null;
    let buildCacheHit = false;
    let packageManager = 'pnpm';
    let packageContent: any = {};
    let dependenciesCount = 0;
    let devDependenciesCount = 0;


    try {
      // 🔒 SECURITY: Validate project path first
      const projectValidation = SecurePathValidator.validateProjectPath(projectPath, projectPath);
      if (!projectValidation.valid) {
        await reportAndThrow(
          `SECURITY VIOLATION: Invalid project path - ${projectValidation.reason}`,
          {
            source: 'deploy',
            stage: 'path-validation',
            projectId,
            userId,
            buildId,
            projectPath
          }
        );
      }

      // 1. Check if package.json exists
      const packageJsonPath = path.join(projectPath, 'package.json');
      let hasPackageJson = false;

      try {
        await SecureFileOperations.secureAccess(packageJsonPath, projectPath, userId, projectId);
        hasPackageJson = true;
      } catch {
        console.log('[Deploy Worker] No package.json found, creating minimal one');

        // Create minimal package.json for static sites
        const minimalPackageJson = {
          name: projectId,
          version: "1.0.0",
          scripts: {
            build: "mkdir -p dist && cp -r *.html *.css *.js dist/ 2>/dev/null || echo 'Copied static files'"
          }
        };

        await SecureFileOperations.secureWrite(packageJsonPath, JSON.stringify(minimalPackageJson, null, 2), projectPath, userId, projectId);
      }

      // EARLY DETECTION: TEMPORARILY COMMENTED OUT FOR TESTING
      // Detection only reads files, no npm install needed, allows testing edge detection fixes
      /*
      try {
        console.log('[Deploy Worker] Running early edge detection (pre-package-verification)...');
        const threeLaneService = CloudflareThreeLaneDeployment.getInstance();
        const earlyDetection = await threeLaneService.detectTarget(projectPath, userId, projectId);
        console.log('[Deploy Worker] Early detection result:', {
          target: earlyDetection.target,
          origin: earlyDetection.origin,
          reasons: earlyDetection.reasons,
          evidence: earlyDetection.notes || []
        });
        // Save early manifest for analysis (doesn't affect deployment)
        await threeLaneService.saveManifest(projectPath, earlyDetection);
      } catch (earlyDetectionError) {
        console.warn('[Deploy Worker] Early detection failed (non-blocking):', earlyDetectionError instanceof Error ? earlyDetectionError.message : String(earlyDetectionError));
        // Continue with deployment - early detection is for testing only
      }
      */

      // 2. Install dependencies (if package.json exists and has dependencies)
      if (hasPackageJson) {
        try {
          const packageJsonText = await SecureFileOperations.secureRead(packageJsonPath, projectPath, userId, projectId);
          deployLog(`package.json content (${packageJsonText.length} chars):`);
          logSafe(packageJsonText, { maxLength: 500, prefix: '[Deploy Worker] ' });

          // Try to parse JSON
          try {
            packageContent = JSON.parse(packageJsonText);
          } catch (initialParseError: any) {
            console.warn('[Deploy Worker] Initial parse failed, attempting to heal JSON...');

            // Try to heal the JSON
            const healResult = healJSON(packageJsonText, packageJsonPath);

            if (healResult.healed) {
              console.log('[Deploy Worker] JSON healed successfully!');
              console.log('[Deploy Worker] Fixes applied:', healResult.fixes);

              // Write the healed content back
              await SecureFileOperations.secureWrite(packageJsonPath, healResult.content, projectPath, userId, projectId);
              console.log('[Deploy Worker] Healed package.json written back to file');

              packageContent = JSON.parse(healResult.content);

              // JSON healed (internal only)
            } else {
              throw initialParseError;
            }
          }
        } catch (error: any) {
          console.error('[Deploy Worker] Failed to read/parse package.json:', error.message);
          console.error('[Deploy Worker] File path:', packageJsonPath);

          // Check if file is empty
          const stats = await SecureFileOperations.secureStat(packageJsonPath, projectPath, userId, projectId);
          console.error('[Deploy Worker] File size:', stats.size, 'bytes');

          // Try to read raw content for debugging
          const rawContent = await SecureFileOperations.secureRead(packageJsonPath, projectPath, userId, projectId);
          console.error('[Deploy Worker] Raw content preview:', rawContent.substring(0, 500));

          throw new Error(`Invalid package.json: ${error.message}`);
        }

        // Step 1: Fix known dependency conflicts BEFORE install
        const fixResult = await fixDependencyConflicts(packageJsonPath);
        if (fixResult.modified) {
          console.log('[Deploy Worker] Applied dependency fixes:', fixResult.fixes);
          // Dependency fixes applied (internal only)
        }

        // Re-read package.json after fixes
        packageContent = JSON.parse(await SecureFileOperations.secureRead(packageJsonPath, projectPath, userId, projectId));

        if ((packageContent.dependencies && Object.keys(packageContent.dependencies).length > 0) ||
            (packageContent.devDependencies && Object.keys(packageContent.devDependencies).length > 0)) {

          // Check if we need to install dependencies
          const shouldInstall = await needsDependencyInstall(projectPath, baseVersionId);

          if (!shouldInstall) {
            console.log('[Deploy Worker] Skipping dependency install - no changes detected');
            // Install skipped - no changes detected (internal only)
          } else {
            // Step 2: Verify packages exist in registry (skip if node_modules exists)
            const nodeModulesPath = path.join(projectPath, 'node_modules');
            let nodeModulesExists = false;
            try {
              await SecureFileOperations.secureAccess(nodeModulesPath, projectPath, userId, projectId);
              const stat = await SecureFileOperations.secureStat(nodeModulesPath, projectPath, userId, projectId);
              nodeModulesExists = stat.isDirectory();
            } catch {
              nodeModulesExists = false;
            }

          if (nodeModulesExists) {
            console.log('[Deploy Worker] Skipping package verification - node_modules already exists');
          } else {
            console.log('[Deploy Worker] Verifying package availability...');
            const verification = await verifyPackagesExist(packageJsonPath);

              if (!verification.valid) {
                // Check if it's a static site that can work without deps
                const isStatic = await isStaticSite(projectPath);
                if (isStatic) {
                  console.warn('[Deploy Worker] Non-existent packages found, but proceeding as static site');
                  await emitBuildEvent(buildId, 'build_warning', {
                    message: 'Skipping dependency install for static site',
                    nonExistentPackages: verification.nonExistent
                  });
                } else {
                  await reportAndThrow(
                    `Non-existent packages: ${verification.nonExistent.join(', ')}`,
                    {
                      source: 'deploy',
                      stage: 'package-verification',
                      projectId,
                      userId,
                      buildId,
                      projectPath
                    }
                  );
                }
              } else {
                // Step 3: Try installation strategies
                console.log('[Deploy Worker] Installing dependencies...');
                await job.updateProgress({ stage: 'install', message: 'Installing dependencies...' });

                // Emit clean progress event for dependency installation with structured i18n code
                await cleanEmitter.phaseProgressWithCode(
                  'dependencies',
                  'BUILD_DEPENDENCIES_INSTALLING',
                  calculateOverallProgress('dependencies', 0.3),
                  {
                    timestamp: Date.now(),
                    projectId,
                    packageManager: 'detecting', // Will be updated after detection
                    step: 1,
                    totalSteps: 3
                  }
                );

                // Detect package manager using centralized utility
                packageManager = await detectPackageManager(projectPath);
                deployLog(`Using package manager: ${packageManager}`);

                // Start install timing
                installStartTime = Date.now();

                // Build install strategies based on detected package manager
                const installStrategies = [];

                if (packageManager === 'pnpm') {
                  installStrategies.push(
                    { command: 'pnpm install --no-frozen-lockfile', tag: 'pnpm' },
                    { command: 'pnpm install --force', tag: 'pnpm-force' }
                  );
                } else if (packageManager === 'yarn') {
                  installStrategies.push(
                    { command: 'yarn install', tag: 'yarn' },
                    { command: 'yarn install --force', tag: 'yarn-force' }
                  );
                }

                // Always include npm as fallback
                installStrategies.push(
                  { command: 'npm install', tag: 'npm' },
                  { command: 'npm install --legacy-peer-deps', tag: 'npm-legacy' },
                  { command: 'npm install --force', tag: 'npm-force' }
                );

                let installSucceeded = false;
                let lastError: Error | null = null;
                let successfulStrategy: string | null = null;

                for (const strategy of installStrategies) {
                  try {
                    console.log(`[Deploy Worker] Trying install with ${strategy.tag}...`);
                    await execCommand(strategy.command, projectPath);
                    console.log(`[Deploy Worker] Success with ${strategy.tag}`);
                    installSucceeded = true;
                    successfulStrategy = strategy.tag;
                    break;
                  } catch (error: any) {
                    console.error(`[Deploy Worker] Failed with ${strategy.tag}: ${error.message}`);
                    lastError = error;

                    if (error.message.includes('ERESOLVE')) {
                      console.error('[Deploy Worker] Dependency resolution conflict detected');
                    }

                    // Skip remaining pnpm strategies if pnpm is not available
                    if (strategy.tag === 'pnpm' && error.message.includes('command not found')) {
                      console.log('[Deploy Worker] pnpm not available, skipping to npm');
                      continue;
                    }
                  }
                }

                if (!installSucceeded && lastError && errorInterceptor) {
                  // Report installation failure to recovery system
                  await errorInterceptor.reportError(lastError, {
                    source: 'deploy',
                    stage: 'install',
                    projectId,
                    userId,
                    buildId
                  });

                  throw new Error(`All install strategies failed. Last error: ${lastError.message}`);
                }

                // End install timing
                installEndTime = Date.now();
                installStrategy = successfulStrategy;

                // Step 4: Verify installation health
                if (installSucceeded && successfulStrategy) {
                  const health = await verifyInstallationHealth(projectPath, successfulStrategy);

                  // Emit clean event for dependency installation completion with structured i18n code
                  await cleanEmitter.phaseCompletedWithCode(
                    'dependencies',
                    'BUILD_DEPENDENCIES_COMPLETE',
                    calculateOverallProgress('dependencies', 1.0),
                    {
                      timestamp: Date.now(),
                      projectId,
                      packageManager: successfulStrategy,
                      packagesInstalled: 0, // Will be filled by health check
                      duration: installStartTime ? Math.round((Date.now() - installStartTime) / 1000) : 0
                    }
                  );

                  if (!health.healthy && successfulStrategy === 'npm-force') {
                    console.warn('[Deploy Worker] Installation completed with warnings:', health.warnings);
                    // Store warnings in the build event system instead of project version
                    await emitBuildEvent(buildId, 'install_warning', {
                      install_partial: true,
                      install_warnings: health.warnings,
                      message: 'Installation completed with unmet peer dependencies'
                    });
                  }
                }
              }
            }
          }
        }
      }

      // 3. Pre-deployment TypeScript validation
      const tsConfigPath = path.join(projectPath, 'tsconfig.json');
      let hasTypeScript = false;
      try {
        await SecureFileOperations.secureAccess(tsConfigPath, projectPath, userId, projectId);
        hasTypeScript = true;
      } catch {
        // No TypeScript config
      }

      if (hasTypeScript) {
        // Check if we should skip TypeScript validation due to build process handling it
        if (shouldSkipTypeScriptValidation(packageContent)) {
          deployLog('Skipping TypeScript validation - build process will handle type checking');
          await emitBuildEvent(buildId, 'validation_skipped', {
            message: 'TypeScript validation skipped (build handles type checking)',
            reason: 'redundant_with_build',
            buildScript: packageContent.scripts?.build || 'none'
          });
        } else {
          deployLog('Running standalone TypeScript validation...');
          await emitBuildEvent(buildId, 'validation_started', {
            message: 'Validating TypeScript code...'
          });

          try {
            // Run TypeScript compiler in no-emit mode to check for errors
            await execCommand('npx tsc --noEmit', projectPath);
            deployLog('TypeScript validation passed');
            await emitBuildEvent(buildId, 'validation_passed', {
              message: 'TypeScript validation successful'
            });
          } catch (tsError: any) {
            console.error('[Deploy Worker] TypeScript validation failed:', tsError.message);

            // Check if it's a recoverable TypeScript error
            const errorMessage = tsError.message || '';
            const errorPatterns = [
              { pattern: /error TS6133:.*is declared but its value is never read/, fixable: true },
              { pattern: /error TS1192:.*has no default export/, fixable: true },
              { pattern: /error TS17001:.*JSX elements cannot have multiple attributes/, fixable: true }
            ];

            const hasFixableErrors = errorPatterns.some(p => p.pattern.test(errorMessage));

            if (hasFixableErrors) {
              console.log('[Deploy Worker] Attempting to auto-fix TypeScript errors...');
              await emitBuildEvent(buildId, 'validation_fixing', {
                message: 'Attempting to fix TypeScript errors automatically...'
              });

              // Import the fix function (we'll create this next)
              const { autoFixTypeScriptErrors } = await import('../services/typeScriptFixer');

              try {
                const fixed = await autoFixTypeScriptErrors(projectPath, errorMessage);
                if (fixed) {
                  console.log('[Deploy Worker] TypeScript errors fixed, re-validating...');
                  await execCommand('npx tsc --noEmit', projectPath);
                  console.log('[Deploy Worker] TypeScript validation passed after fixes');
                  await emitBuildEvent(buildId, 'validation_fixed', {
                    message: 'TypeScript errors fixed successfully'
                  });
                }
              } catch (fixError: any) {
                console.error('[Deploy Worker] Auto-fix failed:', fixError.message);

                // If auto-fix fails, try Claude resume
                await emitBuildEvent(buildId, 'ai_needed', {
                  message: 'TypeScript errors require Claude assistance',
                  error: errorMessage
                });

                // Report to error interceptor for Claude fix
                await reportAndThrow(
                  tsError,
                  {
                    source: 'deploy',
                    stage: 'typescript-validation',
                    projectId,
                    userId,
                    buildId,
                    projectPath
                  }
                );
              }
            } else {
              // Non-fixable errors, report to error interceptor
              await reportAndThrow(
                tsError,
                {
                  source: 'deploy',
                  stage: 'typescript-validation',
                  projectId,
                  userId,
                  buildId,
                  projectPath
                }
              );
            }
          } // end catch(tsError)
        }   // end else (run TS validation)
      }     // end if(hasTypeScript)

      // 4. Prebuild Guard - Prevent App Router next/document violations
      console.log('[Deploy Worker] Running prebuild guard...');
      await job.updateProgress({ stage: 'build', message: 'Validating project structure...' });
      
      try {
        const scriptPath = path.resolve(__dirname, '../..', 'scripts/prebuild-guard.mjs');
        // Set PROJECT_PATH for the prebuild guard
        const originalEnv = process.env.PROJECT_PATH;
        process.env.PROJECT_PATH = projectPath;
        
        await execCommand(`node ${scriptPath}`, projectPath);
        console.log('[Deploy Worker] ✅ Prebuild guard passed');
        
        // Restore original environment
        if (originalEnv) {
          process.env.PROJECT_PATH = originalEnv;
        } else {
          delete process.env.PROJECT_PATH;
        }
      } catch (guardError) {
        console.error('[Deploy Worker] ❌ Prebuild guard failed:', (guardError as Error).message);
        throw new Error(`Prebuild validation failed: ${(guardError as Error).message}`);
      }

      // 4b. Auto-heal Next.js config compatibility (convert .ts to .mjs for Next 14.x)
      await ensureNextConfigCompatibility(projectPath, userId, projectId);

      // 5. Build the project
      console.log('[Deploy Worker] Building project...');
      await job.updateProgress({ stage: 'build', message: 'Building application...' });

      // Start build timing
      buildStartTime = Date.now();

      // Emit clean event for build phase start with structured i18n code (framework detected below)
      await cleanEmitter.phaseStartedWithCode(
        'build',
        'BUILD_COMPILING',
        {
          timestamp: Date.now(),
          projectId,
          versionId,
          framework: 'detecting', // Will be determined after package.json analysis
          packageManager
        },
        calculateOverallProgress('build', 0.0)
      );

      // Check if build script exists
      try {
        const rawContent = await SecureFileOperations.secureRead(packageJsonPath, projectPath, userId, projectId);
        try {
          packageContent = JSON.parse(rawContent);
        } catch (parseErr: any) {
          // Try to heal if parse fails
          const healResult = healJSON(rawContent, packageJsonPath);
          if (healResult.healed) {
            packageContent = JSON.parse(healResult.content);
          } else {
            throw parseErr;
          }
        }
      } catch (error: any) {
        console.error('[Deploy Worker] Failed to parse package.json for build check:', error.message);
        // Default to empty package.json
        packageContent = {};
      }

      // 3b. Early Three-Lane Detection + Edge Runtime Safety Check
      let edgeRuntimeDetected = { detected: false, files: [] as string[] };
      
      if (threeLaneEnabled) {
        try {
          console.log('[Deploy Worker] Running early three-lane detection (pre-build)...');
          const threeLaneService = CloudflareThreeLaneDeployment.getInstance();
          const earlyDetection = await threeLaneService.detectTarget(projectPath, userId, projectId);
          console.log('[Deploy Worker] Early detection result:', {
            target: earlyDetection.target,
            origin: earlyDetection.origin,
            reasons: earlyDetection.reasons,
            evidence: earlyDetection.notes || []
          });
          await threeLaneService.saveManifest(projectPath, earlyDetection);
        } catch (earlyError) {
          console.warn('[Deploy Worker] Early three-lane detection failed (non-blocking):', 
            earlyError instanceof Error ? earlyError.message : String(earlyError));
        }
      }
      
      // Edge runtime safety check (independent of three-lane service)
      try {
        edgeRuntimeDetected = await detectEdgeRuntimeMarkers(projectPath, userId, projectId);
        if (edgeRuntimeDetected.detected) {
          console.log('[Deploy Worker] ⚡ Edge runtime markers detected in:', edgeRuntimeDetected.files);
        } else {
          console.log('[Deploy Worker] No edge runtime markers found');
        }
      } catch (edgeError) {
        console.warn('[Deploy Worker] Edge runtime detection failed (non-blocking):', 
          edgeError instanceof Error ? edgeError.message : String(edgeError));
      }

      // 4. Build the project (with caching)
      let buildDir = projectPath; // Default to project root

      // Determine framework for caching
      const framework = await detectFramework(packageContent, projectPath, userId, projectId);
      const buildCommand = packageContent.scripts?.build || 'none';

      if (packageContent.scripts?.build) {
        // Check build cache first
        const buildCache = getBuildCache();
        console.log('[Deploy Worker] Checking build cache...');

        const cacheResult = await buildCache.get(projectPath, framework, buildCommand);

        if (cacheResult.hit && cacheResult.cachePath) {
          console.log('[Deploy Worker] Using cached build output');
          buildCacheHit = true;

          // Restore from cache to a temporary build directory
          const cachedBuildDir = path.join(projectPath, 'dist-cached');
          const restored = await buildCache.restore(cacheResult.cachePath, cachedBuildDir);

          if (restored) {
            await emitBuildEvent(buildId, 'build_cached', {
              message: 'Using cached build output',
              cacheAge: Date.now() - (cacheResult.metadata?.created || 0)
            });

            // Use cached build directory
            buildDir = cachedBuildDir;
          } else {
            console.warn('[Deploy Worker] Cache restore failed, building fresh');
            await performBuild(projectPath, buildCommand, buildCache, framework, buildId, projectId, userId);
          }
        } else {
          console.log('[Deploy Worker] Cache miss, building fresh');
          await performBuild(projectPath, buildCommand, buildCache, framework, buildId, projectId, userId);
        }
      } else {
        console.log('[Deploy Worker] No build script found, using project root as dist');
      }

      // Determine build output directory if not set by cache
      if (buildDir === projectPath) {
        for (const dir of POSSIBLE_BUILD_DIRS) {
          const fullPath = path.join(projectPath, dir);
          try {
            await SecureFileOperations.secureAccess(fullPath, projectPath, userId, projectId);
            const stat = await SecureFileOperations.secureStat(fullPath, projectPath, userId, projectId);
            if (stat.isDirectory()) {
              buildDir = fullPath;
              console.log(`[Deploy Worker] Using build directory: ${dir}`);
              break;
            }
          } catch {
            // Directory doesn't exist, continue
          }
        }
      }

      // End build timing
      buildEndTime = Date.now();

      // 5. Intelligent Three-Lane Deployment
      console.log('[Deploy Worker] Analyzing deployment requirements...');
      await job.updateProgress({ stage: 'deploy', message: 'Analyzing deployment requirements...' });

      // Emit clean event for deployment phase start with structured i18n code
      await cleanEmitter.phaseStartedWithCode(
        'deploy',
        'BUILD_PREVIEW_PREPARING',
        {
          timestamp: Date.now(),
          projectId,
          versionId,
          buildCompleted: true,
          framework: framework || 'detected'
        },
        calculateOverallProgress('deploy', 0.0)
      );

      // Start upload timing
      uploadStartTime = Date.now();

      let deploymentResult;
      let detectionResult;

      try {
        // Try three-lane deployment with feature flag check
        const threeLaneService = CloudflareThreeLaneDeployment.getInstance();
        
        // Detect optimal deployment target first (EXPERT FIX: use projectPath not buildDir)
        console.log('[Deploy Worker] Detecting optimal deployment target (project root)...');
        detectionResult = await threeLaneService.detectTarget(projectPath, userId, projectId);
        console.log('[Deploy Worker] Three-lane target detected:', detectionResult.target);
        
        // Enhanced detection logging (expert recommendation)
        const { target, reasons, origin, supabaseIntegration, notes } = detectionResult;
        console.log('[ThreeLane] target=%s origin=%s reasons=%j notes=%j supabase=%j',
          target, origin, reasons, notes || [], supabaseIntegration && {
            type: supabaseIntegration.connectionType,
            needsServiceRole: supabaseIntegration.needsServiceRole
          });
        
        // Save manifest for deployment phase (EXPERT FIX: use projectPath not buildDir)
        console.log('[Deploy Worker] Saving deployment manifest at project root...');
        await threeLaneService.saveManifest(projectPath, detectionResult);
        
        // Update progress with detected target
        await job.updateProgress({ 
          stage: 'deploy', 
          message: `Deploying to ${detectionResult.target} (detected)...` 
        });
        
        // Deploy using the detected target (EXPERT FIX: expects project root)
        deploymentResult = await threeLaneService.deploy(projectPath, buildId, userId, projectId);
        
        console.log('[Deploy Worker] Three-lane deployment successful:', {
          target: deploymentResult.target,
          switched: deploymentResult.switched,
          url: deploymentResult.deployedUrl
        });
        
        // Update projects table with deployment lane information
        try {
          await threeLaneService.updateProjectDeploymentLane(projectId, detectionResult);
          console.log(`[Deploy Worker] ✅ Projects table updated with deployment lane: ${detectionResult.target}`);
        } catch (projectUpdateError) {
          console.warn('[Deploy Worker] ⚠️ Failed to update projects table with deployment lane:', projectUpdateError);
        }
        
      } catch (threeLaneError) {
        console.warn('[Deploy Worker] Three-lane deployment failed:', threeLaneError);
        
        // Fail-fast for edge runtime: Prevent deploying edge code to static hosting
        if (edgeRuntimeDetected.detected) {
          const files = edgeRuntimeDetected.files.join(', ');
          const errorMsg = `Edge runtime markers detected (${files}) but three-lane deployment failed. ` +
            `Aborting static fallback to prevent 404s on edge API routes.`;
          console.error('[Deploy Worker] ⚡ Unsafe edge fallback prevented:', errorMsg);
          throw new Error(`${errorMsg}\n\nOriginal error: ${threeLaneError instanceof Error ? threeLaneError.message : String(threeLaneError)}`);
        }
        
        // Hardened fallback guard (expert recommendation):
        // If detection chose workers-node, NEVER fallback to pages-static - fail loudly instead
        if (detectionResult?.target === 'workers-node') {
          const errorMsg = `Workers Node.js deployment required (${detectionResult.reasons.join(', ')}) but three-lane deployment failed. ` +
            'Aborting fallback to Pages Static to prevent broken server behavior and 404s.';
          console.error('[Deploy Worker] 🚫 Unsafe workers-node fallback prevented:', errorMsg);
          
          // Fail the deployment rather than deploy broken server code to static hosting
          const error = threeLaneError as Error;
          throw new Error(`${errorMsg}\n\nOriginal three-lane error: ${error.message || error}`);
        }
        
        // Legacy safety logic for other targets
        if (detectionResult) {
          const hasApiRoutes = detectionResult.reasons.some((reason: string) => 
            reason.includes('API') || reason.includes('SSR'));
          const hasNodeBuiltins = detectionResult.reasons.some((reason: string) => 
            reason.includes('Node built-ins'));
          
          if (hasApiRoutes || hasNodeBuiltins) {
            const errorMsg = `Server features detected (${detectionResult.reasons.join(', ')}) but deployment failed. ` +
              'Aborting fallback to avoid broken deployment on Pages Static.';
            console.error('[Deploy Worker] Unsafe fallback prevented:', errorMsg);
            
            const error = threeLaneError as Error;
            throw new Error(`${errorMsg}\n\nOriginal error: ${error.message || error}`);
          }
        }
        
        console.log('[Deploy Worker] Safe fallback to legacy Pages Static (no API routes detected)');
        
        // Update progress to indicate fallback
        await job.updateProgress({ 
          stage: 'deploy', 
          message: 'Using legacy deployment method...' 
        });
        
        // Fallback to current method (safe - no API routes detected)
        const projectName = 'sheenapps-preview';
        const branchName = `build-${buildId}`;
        const legacyResult = await deployToCloudflarePages(buildDir, projectName, branchName);
        
        // Wrap legacy result to match three-lane interface (CRITICAL FIX: Use valid DB constraint value)
        deploymentResult = {
          deployedUrl: legacyResult.url,
          target: 'pages-static', // Fixed: Use valid constraint value instead of 'pages-static-legacy'
          switched: false,
          deploymentId: legacyResult.deploymentId,
          origin: 'fallback',
          reasons: ['Three-lane deployment failed, used legacy method (safe fallback)']
        };
      }

      console.log('[Deploy Worker] Final deployment result:', deploymentResult);

      // End upload timing
      uploadEndTime = Date.now();

      // Calculate durations
      const totalDuration = Date.now() - deploymentStartTime;
      const installDuration = installEndTime && installStartTime ? installEndTime - installStartTime : 0;
      const buildDuration = buildEndTime && buildStartTime ? buildEndTime - buildStartTime : 0;
      const deployDuration = uploadEndTime && uploadStartTime ? uploadEndTime - uploadStartTime : 0;

      // 6. Upload artifact to R2 for long-term storage and rollbacks
      let artifactUrl: string | undefined;
      let artifactSize: number | undefined;
      let artifactChecksum: string | undefined;

      try {
        deployLog('Creating artifact for R2 storage...');
        // IMPORTANT: Create artifact in temp directory, NOT inside buildDir
        // Creating it inside buildDir would cause the artifact to be included in itself!
        const artifactTarPath = path.join(os.tmpdir(), `${versionId}-artifact.tar.gz`);
        await createStreamedArtifact(buildDir, artifactTarPath);

        // Check artifact size before upload
        artifactSize = await getFileSize(artifactTarPath);
        deployLog(`Artifact size: ${formatFileSize(artifactSize)}`);

        if (artifactSize > MAX_ARTIFACT_SIZE) {
          console.warn(`[Deploy Worker] Artifact too large: ${formatFileSize(artifactSize)} > ${formatFileSize(MAX_ARTIFACT_SIZE)}`);

          // Emit warning event but don't fail the deployment
          await emitBuildEvent(buildId, 'artifact_size_warning', {
            size: artifactSize,
            limit: MAX_ARTIFACT_SIZE,
            suggestion: 'Consider adding .gitignore patterns to reduce project size',
            sizeFormatted: formatFileSize(artifactSize),
            limitFormatted: formatFileSize(MAX_ARTIFACT_SIZE)
          });

          // Send webhook notification for size limit exceeded
          await webhookService.send({
            type: 'artifact_size_warning',
            buildId,
            data: {
              userId,
              projectId,
              versionId,
              artifactSize,
              artifactSizeFormatted: formatFileSize(artifactSize),
              limit: MAX_ARTIFACT_SIZE,
              limitFormatted: formatFileSize(MAX_ARTIFACT_SIZE),
              suggestion: 'Consider adding .gitignore patterns to reduce project size',
              severity: 'warning'
            }
          });

          // Skip R2 upload but continue with deployment
          deployLog('Skipping R2 upload due to size limit');
          // Artifact is in temp directory, use regular unlink
          await unlink(artifactTarPath).catch(() => {});
        } else {
          // Check for size warning threshold
          if (artifactSize > WARN_ARTIFACT_SIZE) {
            console.warn(`[Deploy Worker] Large artifact warning: ${formatFileSize(artifactSize)}`);
            await emitBuildEvent(buildId, 'artifact_size_large', {
              size: artifactSize,
              threshold: WARN_ARTIFACT_SIZE,
              sizeFormatted: formatFileSize(artifactSize),
              thresholdFormatted: formatFileSize(WARN_ARTIFACT_SIZE)
            });

            // Send webhook notification for large artifact warning
            await webhookService.send({
              type: 'artifact_size_large',
              buildId,
              data: {
                userId,
                projectId,
                versionId,
                artifactSize,
                artifactSizeFormatted: formatFileSize(artifactSize),
                threshold: WARN_ARTIFACT_SIZE,
                thresholdFormatted: formatFileSize(WARN_ARTIFACT_SIZE),
                suggestion: 'Consider optimizing assets or using .gitignore to reduce project size',
                severity: 'info'
              }
            });
          }

          // Calculate checksum for integrity verification
          deployLog('Calculating artifact checksum...');
          artifactChecksum = await calculateSHA256(artifactTarPath);
          deployLog(`Artifact SHA256: ${artifactChecksum.substring(0, 16)}...`);

          const retentionPolicy = getRetentionPolicy(userId, projectId);
          deployLog(`Using retention policy: ${retentionPolicy}`);

          const artifactKey = getArtifactKey(userId, projectId, versionId, retentionPolicy);
          deployLog(`Uploading artifact to R2: ${artifactKey}`);

          const r2Result = (isDirectModeEnabled() && process.env.USE_REAL_SERVICES !== 'true')
            ? await mockUploadToR2(artifactTarPath, artifactKey)
            : await uploadToR2(artifactTarPath, artifactKey, { retention: retentionPolicy });
          artifactUrl = r2Result.url;

          // Verify upload integrity (for real uploads)
          if (!isDirectModeEnabled() || process.env.USE_REAL_SERVICES === 'true') {
            if (r2Result.size !== artifactSize) {
              throw new Error(`Upload size mismatch: expected ${artifactSize}, got ${r2Result.size}`);
            }
          }

          // Cleanup temp tar.gz file (in temp directory, use regular unlink)
          await unlink(artifactTarPath).catch(() => {});

          deployLog(`✅ Artifact uploaded: ${formatFileSize(r2Result.size)}`);

          // Emit event for UI integration
          await emitBuildEvent(buildId, 'artifact_uploaded', {
            artifactUrl: r2Result.url,
            size: r2Result.size,
            checksum: artifactChecksum,
            downloadReady: true,
            filename: `${projectId}-${versionId}.tar.gz`
          });
        }

      } catch (error) {
        console.error('[Deploy Worker] R2 artifact upload failed:', error);
        // Don't fail the deployment for R2 issues
      }

      // 7. Update database with preview URL, timing data, artifact info, and three-lane deployment tracking
      if (deploymentResult.deployedUrl) {
        await updateProjectVersion(versionId, {
          status: 'deployed',
          previewUrl: deploymentResult.deployedUrl,
          cfDeploymentId: deploymentResult.deploymentId,
          installDurationMs: installEndTime && installStartTime ? installEndTime - installStartTime : 0,
          buildDurationMs: buildEndTime && buildStartTime ? buildEndTime - buildStartTime : 0,
          deployDurationMs: uploadEndTime && uploadStartTime ? uploadEndTime - uploadStartTime : 0,
          artifactUrl,
          artifactSize,
          artifactChecksum,
          
          // 🆕 Three-lane deployment tracking
          deployment_lane: deploymentResult.target,
          deployment_lane_detected_at: new Date(),
          deployment_lane_detection_origin: deploymentResult.origin || 'detection',
          deployment_lane_reasons: deploymentResult.reasons || [],
          deployment_lane_switched: deploymentResult.switched || false,
          deployment_lane_switch_reason: deploymentResult.switchReason,
          final_deployment_url: deploymentResult.deployedUrl,
          deployment_lane_manifest: deploymentResult.manifest
        });

        // Assign display version IMMEDIATELY after deployment succeeds
        // This happens BEFORE metadata generation for instant user feedback
        const displayVersion = await assignDisplayVersion(projectId, versionId);
        if (displayVersion > 0) {
          const displayVersionName = `v${displayVersion}`;
          deployLog(`✅ Assigned display version: ${displayVersionName} to ${versionId}`);
          
          // Update project's current_version_name immediately for consistency
          try {
            await updateProjectConfig(projectId, {
              versionName: displayVersionName
            });
            deployLog(`✅ Updated project's current_version_name to: ${displayVersionName}`);
          } catch (error) {
            console.error('[Deploy Worker] Failed to update current_version_name:', error);
            // Don't fail deployment for this, but log it
          }
          
          // Emit version assigned event for frontend
          await emitBuildEvent(buildId, 'version_assigned', {
            versionId,
            displayVersion: displayVersionName,
            displayVersionNumber: displayVersion
          });
        }

        // Update latest version in KV
        await setLatestVersion(userId, projectId, {
          latestVersionId: versionId,
          previewUrl: deploymentResult.deployedUrl,
          timestamp: Date.now()
        });
      }

      console.log(`[Deploy Worker] Successfully deployed ${userId}/${projectId} to ${deploymentResult.deployedUrl}`);

      // Emit deployment completion event for version classification with three-lane info
      try {
        const { emitBuildEvent } = await import('../services/eventService');
        await emitBuildEvent(buildId, 'deploy_completed', {
          buildId,
          projectPath,
          versionId,
          projectId,
          userId,
          deploymentUrl: deploymentResult.deployedUrl,
          
          // 🆕 Three-lane deployment information
          deploymentLane: deploymentResult.target,
          deploymentSwitched: deploymentResult.switched || false,
          switchReason: deploymentResult.switchReason,
          detectionReasons: deploymentResult.reasons || [],
          detectionConfidence: deploymentResult.confidence,
          supabaseIntegration: deploymentResult.supabaseIntegration
        });
        console.log(`[Deploy Worker] Emitted deploy_completed event for ${buildId}`);
      } catch (error) {
        console.error('[Deploy Worker] Failed to emit deploy_completed event:', error);
      }

      // Update project config with deployment success and three-lane tracking
      try {
        await updateProjectConfig(projectId, {
          status: 'deployed',
          lastBuildCompleted: new Date(),
          previewUrl: deploymentResult.deployedUrl,
          // Note: Don't set buildId here - it should already be set by StreamWorker
          // Setting it here can cause FK violations if metrics record is missing
          
          // 🆕 Current deployment lane tracking  
          deployment_lane: deploymentResult.target,
          deployment_lane_detected_at: new Date(),
          deployment_lane_detection_origin: deploymentResult.origin || 'detection',
          deployment_lane_reasons: deploymentResult.reasons || [],
          deployment_lane_switched: deploymentResult.switched || false,
          deployment_lane_switch_reason: deploymentResult.switchReason
        });
      } catch (error) {
        console.error('[Deploy Worker] Failed to update project config (deployed):', error);
      }

      // Display deployment stats with three-lane information
      console.log('\n📊 Deployment Stats Summary:');
      console.log('================================');
      console.log(`🎯 Project: ${userId}/${projectId}`);
      console.log(`🔗 Preview URL: ${deploymentResult.deployedUrl}`);
      console.log(`🚀 Deployment Lane: ${deploymentResult.target}`);
      if (deploymentResult.switched) {
        console.log(`🔄 Target Switched: ${deploymentResult.switchReason}`);
      }
      console.log(`⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);

      // Claude session stats
      if (claudeStats) {
        console.log('\n🤖 Claude Session:');
        if (claudeStats.duration) {
          console.log(`  ⏱️  Duration: ${(claudeStats.duration / 1000).toFixed(1)}s`);
        }
        if (claudeStats.tokens) {
          console.log(`  📝 Tokens: ${claudeStats.tokens.input.toLocaleString()} in / ${claudeStats.tokens.output.toLocaleString()} out`);
        }
        if (claudeStats.cost !== undefined) {
          console.log(`  💰 Cost: $${claudeStats.cost.toFixed(4)}`);
        }
      }

      console.log('\n📈 Deployment Phases:');
      if (installDuration > 0) {
        console.log(`  📦 Install: ${(installDuration / 1000).toFixed(1)}s (${packageManager}${installStrategy ? `, ${installStrategy}` : ''})`);
      } else {
        console.log(`  📦 Install: Skipped (no changes)`);
      }
      console.log(`  🔨 Build: ${(buildDuration / 1000).toFixed(1)}s${buildCacheHit ? ' (cached)' : ''}`);
      console.log(`  ☁️  Deploy: ${(deployDuration / 1000).toFixed(1)}s`);
      console.log('================================\n');

      // Count dependencies (already calculated once)
      dependenciesCount = packageContent?.dependencies ? Object.keys(packageContent.dependencies).length : 0;
      devDependenciesCount = packageContent?.devDependencies ? Object.keys(packageContent.devDependencies).length : 0;

      // Record deployment metrics
      await metricsService.recordDeployment({
        buildId,
        deploymentId: deploymentResult.deploymentId,
        installStartedAt: installStartTime ? new Date(installStartTime) : undefined,
        installCompletedAt: installEndTime ? new Date(installEndTime) : undefined,
        installDurationMs: installDuration,
        installStrategy: installStrategy || undefined,
        installCacheHit: false, // We'll track this properly later
        dependenciesCount,
        devDependenciesCount,
        buildStartedAt: buildStartTime ? new Date(buildStartTime) : undefined,
        buildCompletedAt: buildEndTime ? new Date(buildEndTime) : undefined,
        buildDurationMs: buildDuration,
        buildCacheHit,
        buildCommand: packageContent?.scripts?.build || 'none',
        buildOutputSizeBytes: undefined, // Skipping - too expensive
        deployStartedAt: uploadStartTime ? new Date(uploadStartTime) : undefined,
        deployCompletedAt: uploadEndTime ? new Date(uploadEndTime) : undefined,
        deployDurationMs: deployDuration,
        deploymentSizeBytes: undefined, // We'll track this later
        previewUrl: deploymentResult.deployedUrl,
        success: true
      });

      // Update build metrics to deployed status
      await metricsService.recordBuildComplete(buildId, 'deployed');

      // Update project summary metrics
      await metricsService.updateProjectSummary(buildId);

      // Get version info from project config (populated by stream worker background task)
      const projectConfig = await getProjectConfig(projectId);
      const versionInfo = projectConfig?.versionId === versionId && projectConfig?.versionName
        ? { versionId, versionName: projectConfig.versionName }
        : null;

      // Emit clean deployment completed event with version information
      await cleanEmitter.buildCompleted(
        deploymentResult.deployedUrl,
        Math.round(totalDuration / 1000), // Convert to seconds
        versionInfo || undefined
      );

      return {
        success: true,
        previewUrl: deploymentResult.deployedUrl,
        deploymentId: deploymentResult.deploymentId,
        buildId,
        versionId
      };

    } catch (error) {
      console.error('[Deploy Worker] Deployment failed:', error);

      // Calculate how far we got
      const totalDuration = Date.now() - deploymentStartTime;
      const installDuration = installEndTime && installStartTime ? installEndTime - installStartTime :
                             (installStartTime ? Date.now() - installStartTime : 0);
      const buildDuration = buildEndTime && buildStartTime ? buildEndTime - buildStartTime :
                           (buildStartTime ? Date.now() - buildStartTime : 0);
      const deployDuration = uploadEndTime && uploadStartTime ? uploadEndTime - uploadStartTime :
                            (uploadStartTime ? Date.now() - uploadStartTime : 0);

      // Determine failure stage
      let failureStage = 'unknown';
      if (uploadStartTime) {
        failureStage = 'deploy';
      } else if (buildStartTime) {
        failureStage = 'build';
      } else if (installStartTime) {
        failureStage = 'install';
      } else {
        failureStage = 'pre-install';
      }

      // Display failure stats
      console.log('\n❌ Deployment Failed:');
      console.log('================================');
      console.log(`🎯 Project: ${userId}/${projectId}`);
      console.log(`⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);
      console.log(`🚫 Failed Stage: ${failureStage}`);
      console.log(`❗ Error: ${error instanceof Error ? error.message : String(error)}`);

      // Claude session stats
      if (claudeStats) {
        console.log('\n🤖 Claude Session:');
        if (claudeStats.duration) {
          console.log(`  ⏱️  Duration: ${(claudeStats.duration / 1000).toFixed(1)}s`);
        }
        if (claudeStats.tokens) {
          console.log(`  📝 Tokens: ${claudeStats.tokens.input.toLocaleString()} in / ${claudeStats.tokens.output.toLocaleString()} out`);
        }
        if (claudeStats.cost !== undefined) {
          console.log(`  💰 Cost: $${claudeStats.cost.toFixed(4)}`);
        }
      }

      console.log('\n📈 Completed Phases:');
      if (installDuration > 0) {
        console.log(`  ✅ Install: ${(installDuration / 1000).toFixed(1)}s (${packageManager}${installStrategy ? `, ${installStrategy}` : ''})`);
      } else if (installStartTime) {
        console.log(`  ⏳ Install: In progress when failed`);
      }

      if (buildDuration > 0 && buildEndTime) {
        console.log(`  ✅ Build: ${(buildDuration / 1000).toFixed(1)}s${buildCacheHit ? ' (cached)' : ''}`);
      } else if (buildStartTime) {
        console.log(`  ⏳ Build: In progress when failed`);
      }

      if (deployDuration > 0 && uploadEndTime) {
        console.log(`  ✅ Deploy: ${(deployDuration / 1000).toFixed(1)}s`);
      } else if (uploadStartTime) {
        console.log(`  ⏳ Deploy: In progress when failed`);
      }

      console.log('\n💡 Suggestions:');
      if (failureStage === 'install') {
        console.log('  - Check package.json for invalid dependencies');
        console.log('  - Try running npm install locally to reproduce');
      } else if (failureStage === 'build') {
        console.log('  - Check for TypeScript/build errors');
        console.log('  - Verify build script in package.json');
      } else if (failureStage === 'deploy') {
        console.log('  - Check build output directory exists');
        console.log('  - Verify Cloudflare credentials');
      }
      console.log('================================\n');

      // Report error to recovery system
      if (error instanceof Error && errorInterceptor) {
        await errorInterceptor.reportError(error, {
          source: 'deploy',
          stage: failureStage,
          projectId,
          userId,
          buildId
        });
      }

      // Emit clean deployment failed event
      await cleanEmitter.buildFailed(
        'deploy', // Failed during deploy phase
        error instanceof Error ? error.message : String(error),
        {
          totalDuration,
          installDuration,
          buildDuration,
          deployDuration,
          packageManager,
          installStrategy: installStrategy || undefined,
          buildCacheHit,
          stage: failureStage
        }
      );

      // Count dependencies (for failed deployments too)
      dependenciesCount = packageContent?.dependencies ? Object.keys(packageContent.dependencies).length : 0;
      devDependenciesCount = packageContent?.devDependencies ? Object.keys(packageContent.devDependencies).length : 0;

      // Record deployment metrics for failed deployment
      await metricsService.recordDeployment({
        buildId,
        deploymentId: undefined,
        installStartedAt: installStartTime ? new Date(installStartTime) : undefined,
        installCompletedAt: installEndTime ? new Date(installEndTime) : undefined,
        installDurationMs: installDuration,
        installStrategy: installStrategy || undefined,
        installCacheHit: false,
        dependenciesCount,
        devDependenciesCount,
        buildStartedAt: buildStartTime ? new Date(buildStartTime) : undefined,
        buildCompletedAt: buildEndTime ? new Date(buildEndTime) : undefined,
        buildDurationMs: buildDuration,
        buildCacheHit,
        buildCommand: packageContent?.scripts?.build || 'none',
        deployStartedAt: uploadStartTime ? new Date(uploadStartTime) : undefined,
        deployCompletedAt: uploadEndTime ? new Date(uploadEndTime) : undefined,
        deployDurationMs: deployDuration,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      // Update build metrics to failed status
      await metricsService.recordBuildComplete(buildId, 'failed', failureStage);

      // Update project summary metrics even for failures
      await metricsService.updateProjectSummary(buildId);

      // No version record cleanup needed - we never create version records for failed builds
      console.log(`[Deploy Worker] Build ${buildId} failed - no version record was created (following principle: only successful deployments get version records)`);

      throw error;
    }
};

// Expert fix: Assert processor is valid before creating Worker
assertProcessor(processor);

// Expert fix: Optional queue events for visibility
const events = new QueueEvents('deployments', { connection });
events.on('failed', ({ jobId, failedReason }) => {
  console.error('[Deploy Worker][QueueEvents] job failed', { jobId, failedReason });
});
events.on('completed', ({ jobId }) => {
  console.log('[Deploy Worker][QueueEvents] job completed', { jobId });
});

// Expert fix: Hardened Worker constructor with proper typing
export const deployWorker = new Worker<DeployJobData, DeployJobResult>('deployments', processor, {
  connection,
  concurrency: Number(process.env.DEPLOY_WORKER_CONCURRENCY || 2),
});

// Expert fix: Enhanced event handlers and crash guards
deployWorker.on('ready', () => console.log('[Deploy Worker] ready'));
deployWorker.on('active', (job) => console.log('[Deploy Worker] active', { id: job.id, name: job.name }));
deployWorker.on('completed', (job, result) => console.log('[Deploy Worker] completed', { id: job?.id, result }));
deployWorker.on('failed', (job, err) => console.error('[Deploy Worker] failed', { id: job?.id, err: err?.stack || String(err) }));
deployWorker.on('error', (err) => console.error('[Deploy Worker] error', err));

// Expert fix: Global crash guards
process.on('unhandledRejection', (e) => console.error('[Deploy Worker] unhandledRejection', e));
process.on('uncaughtException', (e) => {
  console.error('[Deploy Worker] uncaughtException', e);
  // don't exit immediately; BullMQ can recover depending on the error
});

// Start deploy worker (event handlers already set up in expert pattern above)
export async function startDeployWorker() {
  console.log('Starting deploy worker...');
  
  // Add progress handler (the only one not in expert pattern)
  deployWorker.on('progress', (job, progress) => {
    console.log(`[Deploy] Progress ${job.id}:`, progress);
  });

  console.log('✅ Deploy worker started');
}

// Graceful shutdown
export async function shutdownDeployWorker() {
  console.log('Shutting down deploy worker...');
  await deployWorker.close();
  await events.close();
  await connection.quit();
  console.log('✅ Deploy worker shut down');
}
