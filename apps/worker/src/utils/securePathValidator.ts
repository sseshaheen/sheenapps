import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 🔒 CRITICAL SECURITY: Path validation and file system containment
 * 
 * This utility ensures ALL file operations are constrained within designated project boundaries.
 * NO operations are allowed outside of approved project directories.
 */
export class SecurePathValidator {
  
  // 🚨 FORBIDDEN ZONES - Absolutely no operations allowed
  private static readonly FORBIDDEN_PATHS = [
    // Worker root directory - never touch worker files
    process.cwd(),
    '/Users/sh/Sites/sheenapps-claude-worker',
    
    // System directories
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/tmp',
    '/root',
    '/home',
    
    // macOS system directories  
    '/System',
    '/Library',
    '/Applications',
    '/private',
    
    // User critical directories
    '/Users/sh/.ssh',
    '/Users/sh/Library',
    '/Users/sh/Desktop',
    '/Users/sh/Documents'
  ];
  
  // ✅ ALLOWED PROJECT ROOTS - Only places operations are permitted
  private static readonly PROJECTS_ROOTS = process.platform === 'darwin' 
    ? ['/Users/sh/projects']
    : ['/home/worker/projects'];
  
  /**
   * 🔒 Validate that a path is within project boundaries
   * @param filePath - Path to validate
   * @param projectRoot - Expected project root directory
   * @returns Validation result with security details
   */
  static validateProjectPath(filePath: string, projectRoot: string): {
    valid: boolean;
    reason?: string;
    normalizedPath?: string;
    securityLevel: 'safe' | 'forbidden' | 'suspicious';
  } {
    try {
      // Normalize and resolve paths to prevent traversal attacks
      const normalizedPath = path.resolve(path.normalize(filePath));
      const normalizedProjectRoot = path.resolve(path.normalize(projectRoot));
      
      // 🚨 SECURITY CHECK 1: Must be within allowed projects root first
      const isInAllowedRoot = this.PROJECTS_ROOTS.some(root => 
        normalizedPath.startsWith(path.resolve(root))
      );
      
      if (!isInAllowedRoot) {
        // Only check forbidden paths if not in allowed root
        for (const forbiddenPath of this.FORBIDDEN_PATHS) {
          const normalizedForbidden = path.resolve(forbiddenPath);
          if (normalizedPath.startsWith(normalizedForbidden)) {
            return {
              valid: false,
              reason: `SECURITY VIOLATION: Path is in forbidden zone: ${forbiddenPath}`,
              normalizedPath,
              securityLevel: 'forbidden'
            };
          }
        }
        
        // Not in allowed root and not explicitly forbidden
        return {
          valid: false,
          reason: `SECURITY VIOLATION: Path is outside allowed projects roots: ${this.PROJECTS_ROOTS.join(', ')}`,
          normalizedPath,
          securityLevel: 'forbidden'
        };
      }
      
      // 🚨 SECURITY CHECK 3: Must be within specific project directory
      if (!normalizedPath.startsWith(normalizedProjectRoot)) {
        return {
          valid: false,
          reason: `SECURITY VIOLATION: Path is outside project boundary: ${normalizedProjectRoot}`,
          normalizedPath,
          securityLevel: 'suspicious'
        };
      }
      
      // 🚨 SECURITY CHECK 4: Block path traversal attempts
      const relativePath = path.relative(normalizedProjectRoot, normalizedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return {
          valid: false,
          reason: `SECURITY VIOLATION: Path traversal attempt detected`,
          normalizedPath,
          securityLevel: 'suspicious'
        };
      }
      
      // ✅ Path is safe
      return {
        valid: true,
        normalizedPath,
        securityLevel: 'safe'
      };
      
    } catch (error) {
      return {
        valid: false,
        reason: `Path validation error: ${error instanceof Error ? error.message : String(error)}`,
        securityLevel: 'suspicious'
      };
    }
  }
  
  /**
   * 🔒 Sanitize a file path to prevent injection attacks
   * @param filePath - Path to sanitize
   * @returns Sanitized path
   */
  static sanitizePath(filePath: string): string {
    // Remove null bytes (null byte injection attack)
    let sanitized = filePath.replace(/\0/g, '');
    
    // Remove dangerous sequences
    sanitized = sanitized.replace(/\.\.\//g, ''); // Path traversal
    sanitized = sanitized.replace(/\.\.\\/g, ''); // Windows path traversal
    
    // Normalize path separators
    sanitized = path.normalize(sanitized);
    
    return sanitized;
  }
  
  /**
   * 🔒 Check if a path represents a project file vs system file
   * @param filePath - Path to check
   * @returns true if this is a project-specific file
   */
  static isProjectFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    
    // System/worker files that should NEVER be moved
    const systemFiles = [
      'package.json',      // Could be worker's package.json!
      'node_modules',
      '.git',
      '.env',
      'tsconfig.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json'
    ];
    
    const normalizedPath = path.resolve(filePath);
    
    // If file is in worker root, it's definitely NOT a project file
    if (normalizedPath.startsWith(process.cwd())) {
      return false;
    }
    
    // If it's a system file and NOT in projects directory, it's not a project file
    const isInProjectsRoot = this.PROJECTS_ROOTS.some(root => 
      normalizedPath.startsWith(path.resolve(root))
    );
    if (systemFiles.includes(basename) && !isInProjectsRoot) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 🔒 Get the expected project root for a user/project combination
   * @param userId - User ID
   * @param projectId - Project ID  
   * @returns Secure project root path
   */
  static getProjectRoot(userId: string, projectId: string): string {
    // Sanitize inputs to prevent injection
    const cleanUserId = this.sanitizePath(userId).replace(/[^a-zA-Z0-9-]/g, '');
    const cleanProjectId = this.sanitizePath(projectId).replace(/[^a-zA-Z0-9-]/g, '');
    
    // Use appropriate root based on platform
    const projectRoot = process.platform === 'darwin' 
      ? '/Users/sh/projects'
      : '/home/worker/projects';
    
    return path.join(projectRoot, cleanUserId, cleanProjectId);
  }
  
  /**
   * 🔒 Log security events for audit trail
   * @param event - Security event details
   */
  static logSecurityEvent(event: {
    type: 'violation' | 'warning' | 'allowed';
    operation: string;
    path: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    reason?: string | undefined;
    userId?: string | undefined;
    projectId?: string | undefined;
  }): void {
    const timestamp = new Date().toISOString();
    const logLevel = event.type === 'violation' ? 'ERROR' : 
                    event.type === 'warning' ? 'WARN' : 'INFO';
    
    console.log(`[${timestamp}] [SECURITY-${logLevel}] ${event.type.toUpperCase()}: ${event.operation}`);
    console.log(`  Path: ${event.path}`);
    if (event.reason) console.log(`  Reason: ${event.reason}`);
    if (event.userId) console.log(`  User: ${event.userId}`);
    if (event.projectId) console.log(`  Project: ${event.projectId}`);
    
    // In production, this should also write to a dedicated security audit log
  }
}