import * as path from 'path';
import * as os from 'os';

/**
 * Centralized project path helper
 * Expert feedback: Avoid fat-finger divergences by centralizing path construction
 */
export class ProjectPaths {
  /**
   * Get the base projects directory
   */
  static getProjectsRoot(): string {
    return path.join(os.homedir(), 'projects');
  }

  /**
   * Get the full path to a user's project directory
   */
  static getProjectPath(userId: string, projectId: string): string {
    return path.join(os.homedir(), 'projects', userId, projectId);
  }

  /**
   * Get the path to a user's projects directory (all projects for a user)
   */
  static getUserProjectsPath(userId: string): string {
    return path.join(os.homedir(), 'projects', userId);
  }

  /**
   * Validate that a project path is within the expected project root
   * Security: Ensure no path traversal outside projects directory
   */
  static validateProjectPath(fullPath: string): boolean {
    const projectsRoot = this.getProjectsRoot();
    const resolvedPath = path.resolve(fullPath);
    const resolvedRoot = path.resolve(projectsRoot);
    
    return resolvedPath.startsWith(resolvedRoot);
  }

  /**
   * Extract userId and projectId from a project path
   * Returns null if path doesn't match expected pattern
   */
  static parseProjectPath(fullPath: string): { userId: string; projectId: string } | null {
    const projectsRoot = this.getProjectsRoot();
    const relativePath = path.relative(projectsRoot, fullPath);
    const parts = relativePath.split(path.sep);
    
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return {
        userId: parts[0],
        projectId: parts[1]
      };
    }
    
    return null;
  }
}