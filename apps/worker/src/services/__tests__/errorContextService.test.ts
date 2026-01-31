import { ErrorContextService } from '../errorContextService';

describe('ErrorContextService', () => {
  describe('getEnhancedErrorContext', () => {
    it('should handle TypeScript CLI not found errors', () => {
      const error = 'This is not the tsc command you are looking for';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: TypeScript not installed locally');
      expect(result).toContain('SOLUTION: Install TypeScript in package.json devDependencies');
    });

    it('should handle package import before installation errors', () => {
      const error = "Cannot find package 'vite' imported from /path/to/config";
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: Config file imports \'vite\' before installation');
      expect(result).toContain('SOLUTION: Create package.json → install dependencies → create config files');
    });

    it('should handle command not found errors', () => {
      const error = 'tsc: command not found';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: \'tsc\' not available');
      expect(result).toContain('SOLUTION: Install tsc as project dependency, use \'npx tsc\'');
    });

    it('should handle module not found errors', () => {
      const error = "Module not found: Error: Can't resolve 'react'";
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: Module \'react\' not found');
      expect(result).toContain('SOLUTION: Install missing dependency with package manager');
    });

    it('should handle alternative module resolution errors', () => {
      const error = "Cannot resolve module 'vue'";
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: Module \'vue\' not found');
      expect(result).toContain('SOLUTION: Install missing dependency with package manager');
    });

    it('should handle package.json missing errors', () => {
      const error = 'ENOENT: no such file or directory, open \'package.json\'';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: package.json file missing');
      expect(result).toContain('SOLUTION: Create package.json with project dependencies first');
    });

    it('should handle npm installation errors', () => {
      const error = 'npm ERR! code ERESOLVE npm ERR! ERESOLVE unable to resolve dependency tree';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: Package manager installation failed');
      expect(result).toContain('SOLUTION: Check package.json syntax, verify dependency names');
    });

    it('should handle pnpm installation errors', () => {
      const error = 'pnpm ERR! Unable to resolve dependencies';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: Package manager installation failed');
      expect(result).toContain('SOLUTION: Check package.json syntax, verify dependency names');
    });

    it('should handle yarn installation errors', () => {
      const error = 'yarn ERR! An unexpected error occurred';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('PREVIOUS ERROR CONTEXT: Package manager installation failed');
      expect(result).toContain('SOLUTION: Check package.json syntax, verify dependency names');
    });

    it('should provide fallback for unknown errors', () => {
      const error = 'Some unknown error occurred';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toBe('PREVIOUS ERROR: Some unknown error occurred');
    });

    it('should handle empty error strings', () => {
      const error = '';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toBe('PREVIOUS ERROR: ');
    });

    it('should extract package names correctly from complex error messages', () => {
      const error = "Error: Cannot find package '@types/node' imported from /complex/path/to/file.ts";
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('Config file imports \'@types/node\' before installation');
    });

    it('should extract command names correctly from complex error messages', () => {
      const error = 'bash: typescript-compiler: command not found in /usr/local/bin';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      expect(result).toContain('\'typescript\' not available'); // Should extract first word
    });

    it('should handle multiple pattern matches and use the first one', () => {
      const error = 'npm ERR! Cannot find package \'react\' imported from config';
      const result = ErrorContextService.getEnhancedErrorContext(error);
      
      // Should match the "Cannot find package" pattern before the "npm ERR!" pattern
      expect(result).toContain('Config file imports \'react\' before installation');
    });
  });
});