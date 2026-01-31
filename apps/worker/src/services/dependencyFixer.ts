import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DependencyFixResult {
  modified: boolean;
  fixes: string[];
}

/**
 * Fix known dependency conflicts before installation
 */
export async function fixDependencyConflicts(packageJsonPath: string): Promise<DependencyFixResult> {
  const content = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(content);
  
  const fixes: string[] = [];
  let modified = false;
  
  // Fix 1: react-scripts with TypeScript 5
  if (pkg.devDependencies?.['react-scripts'] && 
      pkg.devDependencies?.['typescript']?.startsWith('^5')) {
    console.log('[Dependency Fixer] Downgrading TypeScript for react-scripts compatibility');
    pkg.devDependencies['typescript'] = '^4.9.5';
    fixes.push('Downgraded TypeScript to 4.9.5 for react-scripts');
    modified = true;
  }
  
  // Fix 2: React 18+ with outdated react-scripts
  if (pkg.dependencies?.['react']?.includes('18') && 
      pkg.devDependencies?.['react-scripts']?.startsWith('4.')) {
    console.log('[Dependency Fixer] Upgrading react-scripts for React 18');
    pkg.devDependencies['react-scripts'] = '5.0.1';
    fixes.push('Upgraded react-scripts to 5.0.1 for React 18');
    modified = true;
  }
  
  // Fix 3: ESLint 9+ with react-scripts
  if (pkg.devDependencies?.['eslint']?.startsWith('^9') && 
      pkg.devDependencies?.['react-scripts']) {
    console.log('[Dependency Fixer] Downgrading ESLint for react-scripts compatibility');
    pkg.devDependencies['eslint'] = '^8.57.0';
    fixes.push('Downgraded ESLint to 8.57.0 for react-scripts');
    modified = true;
  }
  
  // Fix 4: Vite 5.x requires terser for minification
  if (pkg.devDependencies?.vite || pkg.dependencies?.vite) {
    const viteVersion = pkg.devDependencies?.vite || pkg.dependencies?.vite;
    
    // Vite 5.x requires terser as an optional dependency for minification
    if (viteVersion && (viteVersion.includes('5.') || viteVersion.startsWith('^5.'))) {
      if (!pkg.devDependencies?.terser && !pkg.dependencies?.terser) {
        console.log('[Dependency Fixer] Adding terser dependency required by Vite 5.x');
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies.terser = '^5.24.0';
        fixes.push('Added terser dependency required by Vite 5.x for minification');
        modified = true;
      }
    }
  }
  
  if (modified) {
    await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
  }
  
  return { modified, fixes };
}

/**
 * Verify packages exist in npm registry before installation
 */
export async function verifyPackagesExist(packageJsonPath: string): Promise<{
  valid: boolean;
  nonExistent: string[];
}> {
  const content = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(content);
  
  const nonExistent: string[] = [];
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies
  };
  
  // Check each dependency
  for (const [name, version] of Object.entries(allDeps)) {
    if (!version || typeof version !== 'string') continue;
    
    try {
      // Clean version string (remove ^, ~, etc)
      const cleanVersion = version.replace(/^[\^~>=<]/, '');
      
      // Skip git/file/url dependencies
      if (version.includes('git') || version.includes('file:') || version.includes('://')) {
        continue;
      }
      
      console.log(`[Package Verifier] Checking ${name}@${cleanVersion}...`);
      await execAsync(`npm view ${name}@${cleanVersion} version --json`, {
        timeout: 5000
      });
    } catch (error) {
      console.error(`[Package Verifier] Package not found: ${name}@${version}`);
      nonExistent.push(`${name}@${version}`);
    }
  }
  
  return {
    valid: nonExistent.length === 0,
    nonExistent
  };
}

/**
 * Check for static site (no imports/requires in HTML)
 */
export async function isStaticSite(projectPath: string): Promise<boolean> {
  try {
    const indexPath = `${projectPath}/index.html`;
    const content = await fs.readFile(indexPath, 'utf8');
    
    // Check for module scripts or bundler entry points
    const hasModuleScripts = content.includes('type="module"');
    const hasImports = content.includes('import ');
    const hasRequires = content.includes('require(');
    const hasBundlerEntry = content.includes('src="/src/') || content.includes('src="./src/');
    
    return !hasModuleScripts && !hasImports && !hasRequires && !hasBundlerEntry;
  } catch {
    return false;
  }
}

/**
 * Verify installation health after npm/pnpm install
 */
export async function verifyInstallationHealth(projectPath: string, installMode: string): Promise<{
  healthy: boolean;
  warnings: string[];
}> {
  const warnings: string[] = [];
  
  try {
    const { stdout } = await execAsync('npm ls --depth=0 --json', {
      cwd: projectPath,
      timeout: 10000
    });
    
    const tree = JSON.parse(stdout);
    
    // Check for unmet peer deps
    if (tree.problems && tree.problems.length > 0) {
      const peerDepProblems = tree.problems.filter((p: string) => 
        p.includes('peer dep') || p.includes('UNMET PEER')
      );
      
      if (peerDepProblems.length > 0 && installMode === 'npm-force') {
        warnings.push(`${peerDepProblems.length} unmet peer dependencies after forced install`);
      }
    }
    
    // Check for missing dependencies
    const missingDeps = Object.entries(tree.dependencies || {})
      .filter(([_, info]: [string, any]) => info.missing)
      .map(([name]) => name);
      
    if (missingDeps.length > 0) {
      warnings.push(`Missing dependencies: ${missingDeps.join(', ')}`);
    }
    
    return {
      healthy: warnings.length === 0,
      warnings
    };
  } catch (error: any) {
    console.error('[Install Verifier] Failed to verify installation:', error.message);
    return {
      healthy: false,
      warnings: ['Failed to verify installation health']
    };
  }
}