import * as fs from 'fs/promises';
import * as path from 'path';
import { SecurePathValidator } from './securePathValidator';

/**
 * 🔒 CRITICAL SECURITY: Secure file operations wrapper
 * 
 * All file operations MUST go through this wrapper to ensure security containment.
 * Provides absolute guarantee that no operations occur outside project boundaries.
 */
export class SecureFileOperations {
  
  /**
   * 🔒 Secure file read with path validation
   * @param filePath - Path to read
   * @param projectRoot - Project root for validation
   * @returns File contents or throws security error
   */
  static async secureRead(filePath: string, projectRoot: string, userId?: string, projectId?: string): Promise<string> {
    const validation = SecurePathValidator.validateProjectPath(filePath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'READ',
        path: filePath,
        reason: validation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Read operation blocked - ${validation.reason}`);
    }
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'READ',
      path: validation.normalizedPath!,
      userId,
      projectId
    });
    
    return await fs.readFile(validation.normalizedPath!, 'utf-8');
  }
  
  /**
   * 🔒 Secure file write with path validation
   * @param filePath - Path to write
   * @param content - Content to write
   * @param projectRoot - Project root for validation
   */
  static async secureWrite(
    filePath: string, 
    content: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<void> {
    const validation = SecurePathValidator.validateProjectPath(filePath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'WRITE',
        path: filePath,
        reason: validation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Write operation blocked - ${validation.reason}`);
    }
    
    // Ensure directory exists (but only within project boundaries)
    const dir = path.dirname(validation.normalizedPath!);
    const dirValidation = SecurePathValidator.validateProjectPath(dir, projectRoot);
    
    if (!dirValidation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'MKDIR',
        path: dir,
        reason: dirValidation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Directory creation blocked - ${dirValidation.reason}`);
    }
    
    await fs.mkdir(dir, { recursive: true });
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'WRITE',
      path: validation.normalizedPath!,
      userId,
      projectId
    });
    
    await fs.writeFile(validation.normalizedPath!, content, 'utf-8');
  }
  
  /**
   * 🔒 Secure file move with dual path validation
   * @param fromPath - Source path
   * @param toPath - Destination path  
   * @param projectRoot - Project root for validation
   */
  static async secureMove(
    fromPath: string, 
    toPath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<void> {
    
    // 🚨 CRITICAL: Validate BOTH source and destination
    const fromValidation = SecurePathValidator.validateProjectPath(fromPath, projectRoot);
    const toValidation = SecurePathValidator.validateProjectPath(toPath, projectRoot);
    
    // Block if either path is invalid
    if (!fromValidation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'MOVE_FROM',
        path: fromPath,
        reason: fromValidation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Move source blocked - ${fromValidation.reason}`);
    }
    
    if (!toValidation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'MOVE_TO',
        path: toPath,
        reason: toValidation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Move destination blocked - ${toValidation.reason}`);
    }
    
    // 🚨 ADDITIONAL CHECK: Source must be a project file
    if (!SecurePathValidator.isProjectFile(fromPath)) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'MOVE_SYSTEM_FILE',
        path: fromPath,
        reason: 'Attempted to move system/worker file',
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Cannot move system file: ${fromPath}`);
    }
    
    // Ensure destination directory exists
    const toDir = path.dirname(toValidation.normalizedPath!);
    await fs.mkdir(toDir, { recursive: true });
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'MOVE',
      path: `${fromValidation.normalizedPath!} -> ${toValidation.normalizedPath!}`,
      userId,
      projectId
    });
    
    await fs.rename(fromValidation.normalizedPath!, toValidation.normalizedPath!);
  }
  
  /**
   * 🔒 Secure file deletion with path validation
   * @param filePath - Path to delete
   * @param projectRoot - Project root for validation
   */
  static async secureDelete(
    filePath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<void> {
    const validation = SecurePathValidator.validateProjectPath(filePath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'DELETE',
        path: filePath,
        reason: validation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Delete operation blocked - ${validation.reason}`);
    }
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'DELETE',
      path: validation.normalizedPath!,
      userId,
      projectId
    });
    
    await fs.unlink(validation.normalizedPath!);
  }
  
  /**
   * 🔒 Secure directory listing with path validation
   * @param dirPath - Directory to list
   * @param projectRoot - Project root for validation
   * @returns Array of filenames
   */
  static async secureReaddir(
    dirPath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<string[]> {
    const validation = SecurePathValidator.validateProjectPath(dirPath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'READDIR',
        path: dirPath,
        reason: validation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Directory listing blocked - ${validation.reason}`);
    }
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'READDIR',
      path: validation.normalizedPath!,
      userId,
      projectId
    });
    
    return await fs.readdir(validation.normalizedPath!);
  }
  
  /**
   * 🔒 Check if file exists with path validation
   * @param filePath - Path to check
   * @param projectRoot - Project root for validation
   * @returns true if file exists and is accessible
   */
  static async secureExists(
    filePath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<boolean> {
    const validation = SecurePathValidator.validateProjectPath(filePath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'EXISTS_CHECK',
        path: filePath,
        reason: validation.reason,
        userId,
        projectId
      });
      return false; // Don't reveal existence of files outside project
    }
    
    try {
      await fs.access(validation.normalizedPath!);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 🔒 Secure file access check with path validation (alias for secureExists but throws on access)
   * @param filePath - Path to check
   * @param projectRoot - Project root for validation
   */
  static async secureAccess(
    filePath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<void> {
    const validation = SecurePathValidator.validateProjectPath(filePath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'ACCESS',
        path: filePath,
        reason: validation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Access check blocked - ${validation.reason}`);
    }
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'ACCESS',
      path: validation.normalizedPath!,
      userId,
      projectId
    });
    
    await fs.access(validation.normalizedPath!);
  }

  /**
   * 🔒 Secure file stat with path validation
   * @param filePath - Path to stat
   * @param projectRoot - Project root for validation
   * @returns File stats
   */
  static async secureStat(
    filePath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<any> {
    const validation = SecurePathValidator.validateProjectPath(filePath, projectRoot);
    
    if (!validation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'STAT',
        path: filePath,
        reason: validation.reason,
        userId,
        projectId
      });
      throw new Error(`SECURITY VIOLATION: Stat operation blocked - ${validation.reason}`);
    }
    
    SecurePathValidator.logSecurityEvent({
      type: 'allowed',
      operation: 'STAT',
      path: validation.normalizedPath!,
      userId,
      projectId
    });
    
    return await fs.stat(validation.normalizedPath!);
  }

  /**
   * 🔒 Secure file unlink/delete (alias for secureDelete)
   * @param filePath - Path to delete
   * @param projectRoot - Project root for validation
   */
  static async secureUnlink(
    filePath: string, 
    projectRoot: string, 
    userId?: string, 
    projectId?: string
  ): Promise<void> {
    return await this.secureDelete(filePath, projectRoot, userId, projectId);
  }
}