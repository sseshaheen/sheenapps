import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EnvironmentInspector, EnvironmentStatus } from './environmentInspector';
import { ErrorContextService } from './errorContextService';

const execAsync = promisify(exec);

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
  enhancedContext?: string;
}

export class RuntimeValidationService {
  static async validateCommand(
    projectPath: string,
    packageManager: string,
    command: string
  ): Promise<ValidationResult> {
    const env = await EnvironmentInspector.getEnvironmentStatus(projectPath, packageManager);
    
    // TypeScript validation requires local installation
    if (command.includes('tsc') && !env.hasNodeModules) {
      return {
        isValid: false,
        error: 'TypeScript validation requires dependencies',
        suggestion: `Install dependencies first with ${packageManager} install`
      };
    }
    
    // Use best available validation approach
    const validationCommand = this.getBestValidationCommand(command, env, packageManager);
    
    try {
      await this.executeCommand(validationCommand, projectPath);
      return { isValid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        error: errorMessage,
        enhancedContext: ErrorContextService.getEnhancedErrorContext(errorMessage)
      };
    }
  }
  
  private static getBestValidationCommand(
    originalCommand: string, 
    env: EnvironmentStatus, 
    packageManager: string
  ): string {
    // Use local binary if available
    if (originalCommand.includes('tsc') && env.hasNodeModules) {
      const tscPath = path.join('node_modules', '.bin', 'tsc');
      return `${tscPath} --noEmit`;
    }
    
    // Fall back to package manager exec
    return `${packageManager} exec tsc -- --noEmit`;
  }
  
  private static async executeCommand(command: string, cwd: string): Promise<void> {
    try {
      await execAsync(command, { cwd, timeout: 30000 }); // 30 second timeout
    } catch (error) {
      throw error;
    }
  }
}