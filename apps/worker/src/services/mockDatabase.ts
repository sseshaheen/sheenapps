/**
 * Mock Database Service for Direct Mode Testing
 * Provides in-memory implementations of database operations
 */

import type { ProjectVersion } from '../types/build';

// In-memory storage
const mockVersions = new Map<string, ProjectVersion>();

export async function testConnection(): Promise<boolean> {
  console.log('📝 Using mock database (no real DB connection)');
  return true;
}

export async function createProjectVersion(
  version: Omit<ProjectVersion, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProjectVersion> {
  const newVersion: ProjectVersion = {
    ...version,
    id: `mock-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  mockVersions.set(newVersion.versionId, newVersion);
  console.log(`📝 Mock: Created version ${newVersion.versionId}`);
  
  return newVersion;
}

export async function updateProjectVersion(
  versionId: string,
  updates: Partial<ProjectVersion>
): Promise<ProjectVersion | null> {
  const existing = mockVersions.get(versionId);
  if (!existing) {
    console.log(`📝 Mock: Version ${versionId} not found`);
    return null;
  }
  
  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date(),
  };
  
  mockVersions.set(versionId, updated);
  console.log(`📝 Mock: Updated version ${versionId}`);
  
  return updated;
}

export async function getProjectVersion(versionId: string): Promise<ProjectVersion | null> {
  const version = mockVersions.get(versionId);
  console.log(`📝 Mock: Getting version ${versionId} - ${version ? 'found' : 'not found'}`);
  return version || null;
}

export async function getLatestProjectVersion(
  userId: string,
  projectId: string
): Promise<ProjectVersion | null> {
  const versions = Array.from(mockVersions.values())
    .filter(v => v.userId === userId && v.projectId === projectId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  const latest = versions[0] || null;
  console.log(`📝 Mock: Latest version for ${userId}/${projectId} - ${latest ? latest.versionId : 'none'}`);
  
  return latest;
}

export async function listProjectVersions(
  userId: string,
  projectId: string,
  limit: number = 10,
  offset: number = 0
): Promise<ProjectVersion[]> {
  const versions = Array.from(mockVersions.values())
    .filter(v => v.userId === userId && v.projectId === projectId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(offset, offset + limit);
  
  console.log(`📝 Mock: Listed ${versions.length} versions for ${userId}/${projectId}`);
  
  return versions;
}

export async function cleanupOldVersions(
  retentionDays: number = 365
): Promise<number> {
  let deleted = 0;
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - retentionDays);
  
  for (const [versionId, version] of mockVersions.entries()) {
    if (version.createdAt < beforeDate) {
      mockVersions.delete(versionId);
      deleted++;
    }
  }
  
  console.log(`📝 Mock: Cleaned up ${deleted} old versions`);
  
  return deleted;
}