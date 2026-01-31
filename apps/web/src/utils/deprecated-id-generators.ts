/**
 * DEPRECATED: Client-Side ID Generation Utilities
 * 
 * ⚠️ These utilities are deprecated as of the Worker Project ID Hardening migration.
 * All project IDs should now be generated server-side by the worker service for security.
 * 
 * @deprecated Use worker-generated IDs via /v1/create-preview-for-new-project endpoint
 * @see Worker API: /v1/create-preview-for-new-project returns server-generated projectId
 * @see docs/WORKER_PROJECT_ID_HARDENING_INTEGRATION_PLAN.md
 */

/**
 * @deprecated Generate project IDs server-side via worker API instead
 * Use PreviewDeploymentService.deployPreview(null, templateData, true) for new projects
 */
export function generateClientProjectId(): string {
  console.warn('⚠️ DEPRECATED: generateClientProjectId() - Use worker-generated IDs instead');
  return crypto.randomUUID();
}

/**
 * @deprecated Use worker service for secure ID generation
 * Worker service provides atomic project creation with proper security
 */
export function createProjectId(): string {
  console.warn('⚠️ DEPRECATED: createProjectId() - Use worker API /v1/create-preview-for-new-project instead');
  return crypto.randomUUID();
}

/**
 * @deprecated Build IDs are now generated atomically with projects by worker service
 * Use worker API response.buildId instead
 */
export function generateBuildId(): string {
  console.warn('⚠️ DEPRECATED: generateBuildId() - Worker service generates build IDs atomically');
  return crypto.randomUUID();
}

/**
 * Migration guide for developers
 */
export const MIGRATION_GUIDE = {
  oldPattern: `
    // OLD (deprecated)
    const projectId = crypto.randomUUID()
    const deployResult = await PreviewDeploymentService.deployPreview(projectId, templateData, true)
  `,
  newPattern: `
    // NEW (secure server-generated)
    const deployResult = await PreviewDeploymentService.deployPreview(null, templateData, true)
    const projectId = deployResult.projectId // Use server-generated ID
  `,
  benefits: [
    'Server-side security (eliminates client-side manipulation)',
    'Atomic operations (prevents race conditions)',
    'Data integrity (no orphaned records)',
    'Audit trail (full traceability)',
    'Advisory locking (prevents double-click issues)'
  ]
};

// Comment out to prevent accidental usage
// export { generateClientProjectId, createProjectId, generateBuildId };