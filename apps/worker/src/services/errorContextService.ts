export class ErrorContextService {
  static getEnhancedErrorContext(error: string): string {
    if (error.includes('This is not the tsc command you are looking for')) {
      return `PREVIOUS ERROR CONTEXT: TypeScript not installed locally.
SOLUTION: Install TypeScript in package.json devDependencies first, then retry validation.`;
    }
    
    if (error.includes('Cannot find package') && error.includes('imported from')) {
      const packageMatch = error.match(/Cannot find package '(.+)'/);
      const packageName = packageMatch ? packageMatch[1] : 'unknown';
      
      return `PREVIOUS ERROR CONTEXT: Config file imports '${packageName}' before installation.
SOLUTION: Create package.json → install dependencies → create config files.`;
    }
    
    if (error.includes('command not found')) {
      const commandMatch = error.match(/(\w+): command not found/);
      const command = commandMatch ? commandMatch[1] : 'unknown';
      
      return `PREVIOUS ERROR CONTEXT: '${command}' not available.
SOLUTION: Install ${command} as project dependency, use 'npx ${command}'.`;
    }
    
    if (error.includes('Module not found') || error.includes('Cannot resolve module')) {
      const moduleMatch = error.match(/Module not found: Error: Can't resolve '(.+?)'/i) || 
                         error.match(/Cannot resolve module '(.+?)'/i);
      const moduleName = moduleMatch ? moduleMatch[1] : 'unknown';
      
      return `PREVIOUS ERROR CONTEXT: Module '${moduleName}' not found.
SOLUTION: Install missing dependency with package manager, check import paths.`;
    }
    
    if (error.includes('ENOENT') && error.includes('package.json')) {
      return `PREVIOUS ERROR CONTEXT: package.json file missing.
SOLUTION: Create package.json with project dependencies first.`;
    }
    
    if (error.includes('npm ERR!') || error.includes('pnpm ERR!') || error.includes('yarn ERR!')) {
      return `PREVIOUS ERROR CONTEXT: Package manager installation failed.
SOLUTION: Check package.json syntax, verify dependency names and versions.`;
    }
    
    return `PREVIOUS ERROR: ${error}`; // Fallback for other errors
  }
}