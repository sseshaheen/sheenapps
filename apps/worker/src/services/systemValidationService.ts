import { spawn } from 'child_process';
import Redis from 'ioredis';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

export interface SystemValidationResult {
  isValid: boolean;
  errors: SystemValidationError[];
  warnings: string[];
}

export interface SystemValidationError {
  type: 'claude_cli_missing' | 'claude_cli_permissions' | 'path_mismatch' | 'environment';
  message: string;
  resolution: string;
}

// =====================================================
// SYSTEM VALIDATION SERVICE
// =====================================================

export class SystemValidationService {
  private static instance: SystemValidationService;
  private redis: Redis;
  private readonly VALIDATION_CACHE_KEY = 'system:validation_status';
  private readonly CACHE_TTL = 300; // 5 minutes
  
  constructor() {
    // Use same Redis instance as BullMQ
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  
  static getInstance(): SystemValidationService {
    if (!SystemValidationService.instance) {
      SystemValidationService.instance = new SystemValidationService();
    }
    return SystemValidationService.instance;
  }
  
  /**
   * Validate Claude CLI accessibility from target directory
   */
  async validateClaudeAccess(workingDirectory: string): Promise<SystemValidationResult> {
    // Check cache first
    const cacheKey = `${this.VALIDATION_CACHE_KEY}:${Buffer.from(workingDirectory).toString('base64')}`;
    const cachedResult = await this.redis.get(cacheKey);
    
    if (cachedResult) {
      console.log(`[SystemValidation] Using cached result for ${workingDirectory}`);
      return JSON.parse(cachedResult);
    }
    
    const errors: SystemValidationError[] = [];
    const warnings: string[] = [];
    
    console.log(`[SystemValidation] Testing Claude CLI access from ${workingDirectory}`);
    
    // Step 1: Check if working directory exists, create if needed
    let isTemporaryDir = false;
    try {
      const fs = require('fs');
      if (!fs.existsSync(workingDirectory)) {
        // Only create directory if it's a validation temp directory
        if (workingDirectory.includes('.claude-validation-temp')) {
          console.log(`[SystemValidation] Creating temporary validation directory: ${workingDirectory}`);
          await require('fs').promises.mkdir(workingDirectory, { recursive: true });
          isTemporaryDir = true;
        } else {
          // For actual project directories, don't create during validation
          console.log(`[SystemValidation] Working directory doesn't exist (will be created later): ${workingDirectory}`);
          // Use parent directory for validation
          const parentDir = require('path').dirname(workingDirectory);
          if (fs.existsSync(parentDir)) {
            workingDirectory = parentDir;
          } else {
            // Fall back to user directory
            const userDir = require('path').dirname(parentDir);
            if (!fs.existsSync(userDir)) {
              await require('fs').promises.mkdir(userDir, { recursive: true });
            }
            workingDirectory = userDir;
          }
        }
      }
    } catch (error: any) {
      errors.push({
        type: 'path_mismatch',
        message: `Cannot create or access working directory: ${error.message}`,
        resolution: 'Check directory permissions and path validity'
      });
      
      const result: SystemValidationResult = {
        isValid: false,
        errors,
        warnings
      };
      
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    }
    
    // Step 2: Find Claude binary (same method as ClaudeStreamProcess)
    let claudeBinary: string;
    try {
      claudeBinary = await this.findClaudeBinary();
    } catch (error: any) {
      errors.push({
        type: 'claude_cli_missing',
        message: 'Claude CLI not found in common installation paths',
        resolution: 'Install Claude CLI or ensure it is in PATH'
      });
      
      const result: SystemValidationResult = {
        isValid: false,
        errors,
        warnings
      };
      
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    }
    
    // Step 3: Test actual spawn with same method as ClaudeStreamProcess
    try {
      const testResult = await this.testClaudeSpawn(workingDirectory, claudeBinary);
      
      if (testResult.exitCode === 127) { // Command not found
        errors.push({
          type: 'claude_cli_missing',
          message: 'Claude CLI not found in PATH when spawning from target directory',
          resolution: 'Ensure Claude CLI is in PATH or update spawn to use absolute path'
        });
      } else if (testResult.exitCode === 124) { // Timeout
        warnings.push('Claude CLI spawn timed out during validation - may indicate slow system');
      } else if (testResult.exitCode !== 0 && testResult.stderr) {
        // Check for permission or other issues
        if (testResult.stderr.includes('permission')) {
          errors.push({
            type: 'claude_cli_permissions',
            message: `Claude CLI permission error: ${testResult.stderr.trim()}`,
            resolution: 'Check Claude CLI permissions and installation'
          });
        } else {
          warnings.push(`Claude CLI returned non-zero exit code ${testResult.exitCode}: ${testResult.stderr.trim()}`);
        }
      }
      
    } catch (error: any) {
      errors.push({
        type: 'claude_cli_permissions',
        message: `Claude CLI spawn failed: ${error.message}`,
        resolution: 'Check Claude CLI installation and permissions'
      });
    }
    
    const result: SystemValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };
    
    // Clean up temporary validation directory if we created it
    if (isTemporaryDir && workingDirectory.includes('.claude-validation-temp')) {
      try {
        const fs = require('fs');
        await fs.promises.rmdir(workingDirectory, { recursive: true });
        console.log(`[SystemValidation] Cleaned up temporary validation directory: ${workingDirectory}`);
      } catch (cleanupError: any) {
        console.log(`[SystemValidation] Warning: Could not clean up temp directory ${workingDirectory}: ${cleanupError.message}`);
      }
    }
    
    // Cache result for 5 minutes
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    
    console.log(`[SystemValidation] Validation result for ${workingDirectory}:`, {
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length
    });
    
    return result;
  }
  
  /**
   * Find Claude binary (same method as ClaudeStreamProcess)
   */
  private async findClaudeBinary(): Promise<string> {
    const fs = require('fs').promises;
    const path = require('path');

    // Common locations where claude might be installed
    const possiblePaths = [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      '/usr/bin/claude',
      path.join(process.env.HOME || '', '.local', 'bin', 'claude'),
      'claude' // Try PATH
    ];

    for (const claudePath of possiblePaths) {
      try {
        if (claudePath === 'claude') {
          // Just return it and let spawn handle PATH resolution
          return claudePath;
        }
        await fs.access(claudePath, fs.constants.X_OK);
        console.log(`[SystemValidation] Found claude at: ${claudePath}`);
        return claudePath;
      } catch {
        // Continue searching
      }
    }

    throw new Error('Claude CLI not found. Please ensure claude is installed and in PATH');
  }

  /**
   * Test Claude CLI spawn with same method as ClaudeStreamProcess
   */
  private async testClaudeSpawn(workingDirectory: string, claudeBinary: string): Promise<{exitCode: number, stderr: string, stdout: string}> {
    return new Promise((resolve) => {
      console.log(`[SystemValidation] Spawning '${claudeBinary} --version' from ${workingDirectory}`);
      
      // Use same shell command approach as ClaudeStreamProcess
      const shellCommand = `cd "${workingDirectory}" && "${claudeBinary}" --version`;
      console.log(`[SystemValidation] Shell command: ${shellCommand}`);
      
      const childProcess = spawn('sh', ['-c', shellCommand], {
        cwd: workingDirectory,
        env: {
          ...process.env,
          // Ensure HOME is set for claude auth (same as ClaudeStreamProcess)
          HOME: process.env.HOME || '/home/user'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false  // We're already using sh -c
      });
      
      let stderr = '';
      let stdout = '';
      
      childProcess.stderr?.on('data', (data: any) => {
        stderr += data.toString();
      });
      
      childProcess.stdout?.on('data', (data: any) => {
        stdout += data.toString();
      });
      
      // 5 second timeout for validation
      const timeout = setTimeout(() => {
        console.log(`[SystemValidation] Claude CLI validation timed out, killing process`);
        childProcess.kill('SIGKILL');
        resolve({ exitCode: 124, stderr: 'Validation timeout', stdout: '' }); // Timeout exit code
      }, 5000);
      
      childProcess.on('exit', (code: number | null, signal: string | null) => {
        clearTimeout(timeout);
        const exitCode = code !== null ? code : (signal === 'SIGKILL' ? 124 : 1);
        
        console.log(`[SystemValidation] Claude CLI validation completed: exit code ${exitCode}, signal ${signal}`);
        if (stderr) console.log(`[SystemValidation] stderr: ${stderr.trim()}`);
        if (stdout) console.log(`[SystemValidation] stdout: ${stdout.trim()}`);
        
        resolve({ exitCode, stderr: stderr.trim(), stdout: stdout.trim() });
      });
      
      childProcess.on('error', (error: any) => {
        clearTimeout(timeout);
        console.log(`[SystemValidation] Claude CLI validation error: ${error.message}`);
        resolve({ exitCode: 127, stderr: error.message, stdout: '' });
      });
    });
  }
  
  /**
   * Clear validation cache for a specific directory (for testing/debugging)
   */
  async clearValidationCache(workingDirectory?: string): Promise<void> {
    if (workingDirectory) {
      const cacheKey = `${this.VALIDATION_CACHE_KEY}:${Buffer.from(workingDirectory).toString('base64')}`;
      await this.redis.del(cacheKey);
    } else {
      // Clear all validation cache
      const keys = await this.redis.keys(`${this.VALIDATION_CACHE_KEY}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
  
  /**
   * Get validation cache statistics
   */
  async getValidationStats(): Promise<{cacheEntries: number, cacheKeys: string[]}> {
    const keys = await this.redis.keys(`${this.VALIDATION_CACHE_KEY}:*`);
    return {
      cacheEntries: keys.length,
      cacheKeys: keys
    };
  }
}