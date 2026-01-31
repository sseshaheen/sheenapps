import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { uploadToR2, downloadFromR2, getDiffKey } from './cloudflareR2';

const MAX_FULL_DIST_VERSIONS = 3;

export interface DiffResult {
  patch: string;
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

// Initialize git repo for a project if not exists
export async function initGitRepo(projectDir: string): Promise<void> {
  const gitDir = path.join(projectDir, '.git');
  
  try {
    await fs.access(gitDir);
    // Git repo already exists
  } catch {
    // Initialize new git repo
    await execGit(['init'], projectDir);
    await execGit(['config', 'user.email', 'builder@claude.ai'], projectDir);
    await execGit(['config', 'user.name', 'Claude Builder'], projectDir);
    
    // Create .gitignore
    const gitignore = `
node_modules/
.pnpm-store/
pnpm-cache/
.env
.env.local
*.log
`;
    await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore.trim());
    
    await execGit(['add', '.'], projectDir);
    await execGit(['commit', '-m', 'Initial commit'], projectDir);
  }
}

// Execute git command
function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Git command failed: ${stderr}`));
      }
    });
  });
}

// Commit version to git
export async function commitVersion(
  projectDir: string,
  versionId: string,
  message: string,
  includeDist: boolean = true
): Promise<void> {
  // Stage all changes
  await execGit(['add', '.'], projectDir);
  
  // If not including dist, unstage it
  if (!includeDist) {
    const distDirs = ['dist', '.next', 'out', 'build', '.svelte-kit'];
    for (const dir of distDirs) {
      try {
        await execGit(['reset', 'HEAD', dir], projectDir);
      } catch {
        // Directory doesn't exist, ignore
      }
    }
  }
  
  // Commit with tag
  await execGit(['commit', '-m', message, '--allow-empty'], projectDir);
  await execGit(['tag', versionId], projectDir);
}

// Get diff between two versions
export async function getDiff(
  projectDir: string,
  fromVersion: string,
  toVersion: string
): Promise<DiffResult> {
  // Get the patch
  const patch = await execGit(['diff', fromVersion, toVersion], projectDir);
  
  // Get stats
  const stats = await execGit(['diff', '--stat', fromVersion, toVersion], projectDir);
  
  // Parse stats
  const statsMatch = stats.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
  
  return {
    patch,
    stats: {
      filesChanged: parseInt(statsMatch?.[1] || '0'),
      insertions: parseInt(statsMatch?.[2] || '0'),
      deletions: parseInt(statsMatch?.[3] || '0'),
    },
  };
}

// Manage sliding window of full dist versions
export async function manageSlidingWindow(
  projectDir: string,
  currentVersionId: string,
  allVersionIds: string[]
): Promise<void> {
  // Get the index of current version
  const currentIndex = allVersionIds.indexOf(currentVersionId);
  if (currentIndex === -1) return;
  
  // Versions that should have full dist
  // const fullDistVersions = allVersionIds.slice(
  //   Math.max(0, currentIndex - MAX_FULL_DIST_VERSIONS + 1),
  //   currentIndex + 1
  // );
  
  // Strip dist from older versions
  for (let i = 0; i < currentIndex - MAX_FULL_DIST_VERSIONS + 1; i++) {
    const oldVersion = allVersionIds[i];
    if (!oldVersion) continue;
    try {
      // Checkout the old version
      await execGit(['checkout', oldVersion], projectDir);
      
      // Remove dist directories
      const distDirs = ['dist', '.next', 'out', 'build', '.svelte-kit'];
      for (const dir of distDirs) {
        try {
          await fs.rm(path.join(projectDir, dir), { recursive: true, force: true });
        } catch {
          // Directory doesn't exist, ignore
        }
      }
      
      // Amend the commit
      await execGit(['add', '.'], projectDir);
      await execGit(['commit', '--amend', '-m', `Version ${oldVersion} (dist stripped)`, '--allow-empty'], projectDir);
      await execGit(['tag', '-f', oldVersion], projectDir);
    } catch (error) {
      console.error(`Error stripping dist from ${oldVersion}:`, error);
    }
  }

  // Return to current version
  if (currentVersionId) {
    await execGit(['checkout', currentVersionId], projectDir);
  }
  
  // Run git gc to optimize repo
  await execGit(['gc', '--aggressive'], projectDir);
}

// Create and upload diff pack
export async function createDiffPack(
  projectDir: string,
  userId: string,
  projectId: string,
  fromVersion: string,
  toVersion: string
): Promise<string> {
  const tempDir = path.join(projectDir, '.git-diffs');
  await fs.mkdir(tempDir, { recursive: true });
  
  // Create bundle
  const bundlePath = path.join(tempDir, `${fromVersion}_to_${toVersion}.bundle`);
  await execGit(['bundle', 'create', bundlePath, toVersion, `^${fromVersion}`], projectDir);
  
  // Create patch file
  const patchPath = path.join(tempDir, `${fromVersion}_to_${toVersion}.patch`);
  const patch = await execGit(['diff', fromVersion, toVersion], projectDir);
  await fs.writeFile(patchPath, patch);
  
  // Zip them together
  const zipPath = path.join(tempDir, `${fromVersion}_to_${toVersion}.zip`);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(bundlePath, { name: 'changes.bundle' });
    archive.file(patchPath, { name: 'changes.patch' });
    archive.finalize();
  });
  
  // Upload to R2 (diff packs use standard retention automatically via prefix)
  const diffKey = getDiffKey(userId, projectId, fromVersion, toVersion);
  await uploadToR2(zipPath, diffKey);
  
  // Clean up
  await fs.rm(tempDir, { recursive: true, force: true });
  
  return diffKey;
}

// Apply diff pack to restore a version
export async function applyDiffPack(
  projectDir: string,
  userId: string,
  projectId: string,
  fromVersion: string,
  toVersion: string
): Promise<void> {
  const tempDir = path.join(projectDir, '.git-diffs');
  await fs.mkdir(tempDir, { recursive: true });

  // Download diff pack
  const diffKey = getDiffKey(userId, projectId, fromVersion, toVersion);
  const zipPath = path.join(tempDir, `${fromVersion}_to_${toVersion}.zip`);
  await downloadFromR2(diffKey, zipPath);

  // Extract the ZIP file to get changes.bundle and changes.patch
  const extractDir = path.join(tempDir, 'extracted');
  await fs.mkdir(extractDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  // Checkout the base version
  await execGit(['checkout', fromVersion], projectDir);

  // Apply bundle
  const bundlePath = path.join(extractDir, 'changes.bundle');
  await execGit(['bundle', 'unbundle', bundlePath], projectDir);
  await execGit(['checkout', toVersion], projectDir);

  // Clean up
  await fs.rm(tempDir, { recursive: true, force: true });
}