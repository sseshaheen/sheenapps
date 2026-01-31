import fetch from 'node-fetch';
import fs from 'fs';
import archiver from 'archiver';
import path from 'path';
import { WranglerDeployService } from './wranglerDeploy';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!;
const CF_PAGES_PROJECT_NAME = process.env.CF_PAGES_PROJECT_NAME || 'sheenapps-preview';
const CF_API_TOKEN = process.env.CF_API_TOKEN_WORKERS!;

// Validate required environment variables
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('Missing required Cloudflare environment variables');
  console.error('CF_ACCOUNT_ID:', !!CF_ACCOUNT_ID);
  console.error('CF_API_TOKEN_WORKERS:', !!CF_API_TOKEN);
}

const PAGES_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`;

export interface DeploymentResult {
  deploymentId: string;
  url: string;
  environment: string;
}

// Detect build output directory
export function detectBuildOutput(projectPath: string): string | null {
  const buildOutputPaths = [
    'dist',
    '.next',
    'out', 
    'build',
    '.svelte-kit/cloudflare',
  ];

  for (const dir of buildOutputPaths) {
    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      return fullPath;
    }
  }

  return null;
}

// Create a tar.gz file from directory (GZIP compressed for consistency with R2 storage)
export async function createTarGzFromDirectory(
  sourceDir: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      console.log(`Created tar.gz: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add directory contents, excluding .git* and pnpm-cache
    console.log('Creating tar.gz from directory:', sourceDir);
    
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['.git*', '**/pnpm-cache/**', '**/.pnpm-store/**'],
    });

    archive.finalize();
  });
}

// Create a zip file from directory (still needed for R2 storage)
export async function createZipFromDirectory(
  sourceDir: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      console.log(`Created zip: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add directory contents, excluding .git* and pnpm-cache
    console.log('Creating zip from directory:', sourceDir);
    
    // List files that will be included
    const files = archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['.git*', '**/pnpm-cache/**', '**/.pnpm-store/**'],
      dot: true, // Include dotfiles
    });

    archive.on('entry', (entryData) => {
      console.log('Adding to zip:', entryData.name);
    });

    archive.finalize();
  });
}

// Deploy to Cloudflare Pages using Wrangler CLI
export async function deployToCloudflarePages(
  buildDir: string,
  projectName: string = CF_PAGES_PROJECT_NAME,
  branch?: string
): Promise<DeploymentResult> {
  // Wrangler requires a directory, not a zip
  if (!fs.statSync(buildDir).isDirectory()) {
    throw new Error('Wrangler deployment requires a directory. Please provide the build directory directly.');
  }
  
  const wranglerService = new WranglerDeployService();
  
  // Check if Wrangler is available
  const isAvailable = await wranglerService.checkWranglerAvailable();
  if (!isAvailable) {
    throw new Error('Wrangler CLI is not available. Please ensure it is installed.');
  }
  
  try {
    console.log('Deploying with Wrangler CLI...');
    const result = await wranglerService.deploy({
      buildDir,
      projectName,
      branch: branch || 'main',
      commitMessage: `Deployment ${new Date().toISOString()}`
    });
    
    console.log('Wrangler deployment successful:', {
      deploymentId: result.deploymentId,
      url: result.url,
      environment: result.environment
    });
    
    return {
      deploymentId: result.deploymentId,
      url: result.url,
      environment: result.environment
    };
  } catch (error) {
    console.error('Wrangler deployment failed:', error);
    throw error;
  }
}

// Get deployment status using Cloudflare API
export async function getDeploymentStatus(
  deploymentId: string,
  projectName: string = CF_PAGES_PROJECT_NAME
): Promise<any> {
  try {
    const response = await fetch(
      `${PAGES_API_BASE}/${projectName}/deployments/${deploymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get deployment status: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.result;
  } catch (error) {
    console.error('Error getting deployment status:', error);
    throw error;
  }
}

// Delete old deployments (for quota management)
export async function deleteOldDeployments(
  projectName: string = CF_PAGES_PROJECT_NAME,
  keepCount: number = 200
): Promise<number> {
  try {
    // Validate required variables before making API call
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
      console.warn('Cloudflare credentials not configured, skipping deployment cleanup');
      return 0;
    }

    if (!projectName) {
      console.warn('Cloudflare project name not configured, skipping deployment cleanup');
      return 0;
    }

    // List all deployments
    const apiUrl = `${PAGES_API_BASE}/${projectName}/deployments?per_page=1000`;
    console.log(`Fetching deployments from: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Cloudflare API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        url: apiUrl
      });
      throw new Error(`Failed to list deployments: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json() as any;
    const deployments = data.result || [];

    // Sort by created_on descending (newest first)
    deployments.sort((a: any, b: any) => 
      new Date(b.created_on).getTime() - new Date(a.created_on).getTime()
    );

    // Delete deployments beyond keepCount
    const toDelete = deployments.slice(keepCount);
    let deletedCount = 0;

    for (const deployment of toDelete) {
      try {
        const deleteResponse = await fetch(
          `${PAGES_API_BASE}/${projectName}/deployments/${deployment.id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${CF_API_TOKEN}`,
            },
          }
        );

        if (deleteResponse.ok) {
          deletedCount++;
        }
      } catch (err) {
        console.error(`Failed to delete deployment ${deployment.id}:`, err);
      }
    }

    console.log(`Deleted ${deletedCount} old deployments`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up deployments:', error);
    return 0;
  }
}

// Initialize Pages project using Wrangler
export async function createPagesProject(
  projectName: string = CF_PAGES_PROJECT_NAME
): Promise<boolean> {
  const wranglerService = new WranglerDeployService();
  const isAvailable = await wranglerService.checkWranglerAvailable();
  
  if (!isAvailable) {
    throw new Error('Wrangler CLI is not available. Please ensure it is installed.');
  }
  
  console.log('Creating project with Wrangler...');
  return wranglerService.createProject(projectName);
}