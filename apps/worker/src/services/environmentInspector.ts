import * as fs from 'fs/promises';
import * as path from 'path';

export interface EnvironmentStatus {
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  packageManager: string;
}

export class EnvironmentInspector {
  static async getEnvironmentStatus(projectPath: string, packageManager: string): Promise<EnvironmentStatus> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    
    return {
      hasPackageJson: await this.fileExists(packageJsonPath),
      hasNodeModules: await this.fileExists(nodeModulesPath),
      packageManager
    };
  }
  
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}