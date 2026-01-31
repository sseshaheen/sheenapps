import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Enhanced package manager detection with race condition protection
 * Extracted from streamWorker.ts to eliminate duplication with deployWorker.ts
 */
export async function detectPackageManager(projectPath: string): Promise<string> {
  const lockFiles = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' }
  ];

  for (const { file, manager } of lockFiles) {
    const lockFilePath = path.join(projectPath, file);
    
    // Wait for FS flush with short retry loop (mitigate lockfile creation race)
    let attempts = 0;
    while (attempts < 3) {
      try {
        await fs.access(lockFilePath);
        // Verify file is not empty (avoid catching mid-write)
        const stats = await fs.stat(lockFilePath);
        if (stats.size > 0) {
          console.log(`[Package Manager] Detected ${manager} from ${file}`);
          return manager;
        }
      } catch {
        // File doesn't exist or is still being written
      }
      
      attempts++;
      if (attempts < 3) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms wait
      }
    }
  }

  // Check packageManager field in package.json (existing logic)
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageContent = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    if (packageContent.packageManager) {
      const manager = packageContent.packageManager.split('@')[0];
      console.log(`[Package Manager] Detected ${manager} from packageManager field`);
      return manager;
    }
  } catch {
    // Ignore errors
  }

  // Default to pnpm
  console.log('[Package Manager] No package manager detected, defaulting to pnpm');
  return 'pnpm';
}