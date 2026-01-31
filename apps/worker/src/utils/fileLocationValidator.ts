import * as path from 'path';
import * as fs from 'fs/promises';
import { SecurePathValidator } from './securePathValidator';
import { SecureFileOperations } from './secureFileOperations';

export class FileLocationValidator {
  /**
   * Validate that a file was created in the expected project directory
   */
  static async validateFileLocation(
    filePath: string, 
    expectedProjectPath: string,
    fileName: string
  ): Promise<{ valid: boolean; actualPath?: string; expectedPath?: string; error?: string }> {
    try {
      // Normalize paths for comparison
      const normalizedFilePath = path.normalize(filePath);
      const normalizedProjectPath = path.normalize(expectedProjectPath);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return {
          valid: false,
          error: `File not found: ${filePath}`
        };
      }
      
      // Check if file is within project directory
      const relativePath = path.relative(normalizedProjectPath, normalizedFilePath);
      const isInProjectDir = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
      
      if (!isInProjectDir) {
        return {
          valid: false,
          actualPath: normalizedFilePath,
          expectedPath: path.join(normalizedProjectPath, fileName),
          error: `File created outside project directory`
        };
      }
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 🔒 SECURITY ENHANCED: Check if critical project files are in the correct location
   * Now prevents moving worker/system files and validates all paths securely
   */
  static async validateProjectStructure(projectPath: string, userId?: string, projectId?: string): Promise<{
    valid: boolean;
    misplacedFiles: Array<{ file: string; actualPath: string; expectedPath: string }>;
    errors: string[];
  }> {
    // 🚨 SECURITY: Validate project path first
    const projectValidation = SecurePathValidator.validateProjectPath(projectPath, projectPath);
    if (!projectValidation.valid) {
      SecurePathValidator.logSecurityEvent({
        type: 'violation',
        operation: 'VALIDATE_PROJECT_STRUCTURE',
        path: projectPath,
        reason: projectValidation.reason,
        userId,
        projectId
      });
      return {
        valid: false,
        misplacedFiles: [],
        errors: [`SECURITY VIOLATION: Invalid project path - ${projectValidation.reason}`]
      };
    }
    
    // Files that might legitimately be created by AI in project directory
    const projectFiles = [
      'index.html',
      'sheenapps-project-info.md',
      '.sheenapps/recommendations.json',
      'style.css',
      'script.js',
      'README.md'
    ];
    
    const misplacedFiles: Array<{ file: string; actualPath: string; expectedPath: string }> = [];
    const errors: string[] = [];
    
    // 🔍 Check for files that might have been created in wrong locations
    const potentialLocations = [
      // Check worker root (but don't move worker files!)
      process.cwd(),
      // Check temp directories
      '/tmp',
      // Check parent directories (traversal attempts)
      path.dirname(projectPath)
    ];
    
    for (const file of projectFiles) {
      const expectedPath = path.join(projectPath, file);
      
      try {
        // Check if file exists in expected location
        await fs.access(expectedPath);
        // File is in correct location - good!
      } catch {
        // File not in expected location, check other locations
        for (const checkLocation of potentialLocations) {
          const checkPath = path.join(checkLocation, path.basename(file));
          
          try {
            await fs.access(checkPath);
            
            // 🚨 SECURITY CHECK: Only move files that are actually project files
            if (SecurePathValidator.isProjectFile(checkPath)) {
              misplacedFiles.push({
                file,
                actualPath: checkPath,
                expectedPath
              });
              
              SecurePathValidator.logSecurityEvent({
                type: 'warning',
                operation: 'MISPLACED_FILE_DETECTED',
                path: checkPath,
                reason: `Project file found outside project directory`,
                userId,
                projectId
              });
            } else {
              // 🚨 SECURITY: This is a system file - do NOT move it!
              SecurePathValidator.logSecurityEvent({
                type: 'violation',
                operation: 'SYSTEM_FILE_PROTECTION',
                path: checkPath,
                reason: `Prevented moving system file: ${file}`,
                userId,
                projectId
              });
              errors.push(`SECURITY: Blocked attempt to move system file: ${file}`);
            }
            break; // Found file, stop checking other locations
          } catch {
            // File doesn't exist in this location
          }
        }
      }
    }
    
    // Log findings
    if (misplacedFiles.length > 0) {
      console.log(`[FileLocationValidator] Found ${misplacedFiles.length} project files in wrong location`);
    }
    
    return {
      valid: misplacedFiles.length === 0 && errors.length === 0,
      misplacedFiles,
      errors
    };
  }

  /**
   * 🔒 SECURITY ENHANCED: Move misplaced files to correct location using secure operations
   */
  static async moveMisplacedFiles(
    misplacedFiles: Array<{ file: string; actualPath: string; expectedPath: string }>,
    projectRoot: string,
    userId?: string,
    projectId?: string
  ): Promise<{ moved: number; errors: string[] }> {
    let moved = 0;
    const errors: string[] = [];
    
    for (const { file, actualPath, expectedPath } of misplacedFiles) {
      try {
        // 🚨 SECURITY: Use secure file operations for move
        await SecureFileOperations.secureMove(actualPath, expectedPath, projectRoot, userId, projectId);
        
        console.log(`[FileLocationValidator] Securely moved ${file} from ${actualPath} to ${expectedPath}`);
        moved++;
      } catch (error) {
        const errorMsg = `Failed to move ${file}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[FileLocationValidator] ${errorMsg}`);
        errors.push(errorMsg);
        
        // Log security-related move failures
        SecurePathValidator.logSecurityEvent({
          type: 'violation',
          operation: 'SECURE_MOVE_FAILED',
          path: `${actualPath} -> ${expectedPath}`,
          reason: errorMsg,
          userId,
          projectId
        });
      }
    }
    
    return { moved, errors };
  }
}