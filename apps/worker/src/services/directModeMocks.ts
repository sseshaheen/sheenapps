/**
 * Direct Mode Mocks - Simple mocks for all external services
 */

import { isDirectModeEnabled } from '../config/directMode';

// Mock Cloudflare KV
export async function mockSetLatestVersion(userId: string, projectId: string, versionId: string, previewUrl: string): Promise<void> {
  if (isDirectModeEnabled()) {
    console.log(`📝 Mock KV: Set latest version for ${userId}/${projectId} = ${versionId}`);
  }
}

export async function mockGetLatestVersion(userId: string, projectId: string): Promise<any> {
  if (isDirectModeEnabled()) {
    console.log(`📝 Mock KV: Get latest version for ${userId}/${projectId}`);
    return null;
  }
}

// Mock Cloudflare R2
export async function mockUploadToR2(filePath: string, key: string): Promise<any> {
  if (isDirectModeEnabled()) {
    console.log(`📝 Mock R2: Upload ${filePath} to ${key}`);
    return {
      url: `https://mock-r2.example.com/${key}`,
      key: key
    };
  }
  throw new Error('Not in direct mode');
}

// Mock Cloudflare Pages
export async function mockDeployToCloudflarePages(zipPath: string, projectName: string, branch: string): Promise<any> {
  if (isDirectModeEnabled()) {
    console.log(`📝 Mock Pages: Deploy ${zipPath} to ${projectName}/${branch}`);
    const mockDeploymentId = `mock-deployment-${Date.now()}`;
    return {
      id: mockDeploymentId,
      deploymentId: mockDeploymentId,
      url: `https://${mockDeploymentId}.${projectName}.pages.dev`,
      environment: 'preview',
      project_name: projectName,
      deployment_trigger: {
        metadata: {
          branch: branch
        }
      },
      latest_stage: {
        name: 'deploy',
        status: 'success'
      }
    };
  }
  throw new Error('Not in direct mode');
}