export interface BuildJobData {
  userId: string;
  projectId: string;
  prompt: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  versionId?: string | undefined;
  baseVersionId?: string | undefined;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte' | undefined;
  isInitialBuild: boolean;
  previousSessionId?: string | undefined;
  // Rollback-specific fields
  type?: 'build' | 'rollback' | undefined;
  rollbackVersionId?: string | undefined;
  targetVersionId?: string | undefined;
  preRollbackState?: any | undefined;
  selectiveFiles?: string[] | undefined;
  delayUntilRollbackComplete?: boolean | undefined;
  queuedDuringRollback?: boolean | undefined;
  // OpenTelemetry trace context for distributed tracing
  _traceContext?: Record<string, string> | undefined;
}

export interface BuildJobResult {
  success: boolean;
  versionId: string;
  previewUrl?: string;
  buildTime?: number;
  error?: string;
  claudeResponse?: string;
  metrics?: {
    installDuration: number;
    buildDuration: number;
    deployDuration: number;
    outputSize: number;
  };
}

export interface ProjectVersion {
  id: string;
  userId: string;
  projectId: string;
  versionId: string;
  prompt: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  enhancedPrompt?: string | undefined;
  promptMetadata?: {
    type: string;
    isUpdate: boolean;
    isRetry: boolean;
    attemptNumber: number;
    existingFilesCount: number;
    promptLength: number;
    timestamp: string;
    recommendationsPrompt?: string;
    recommendationsPromptLength?: number;
    documentationPrompt?: string;
    documentationPromptLength?: number;
    [key: string]: any; // Allow additional properties
  } | undefined;
  parentVersionId?: string | undefined;
  previewUrl?: string | undefined;
  artifactUrl?: string | undefined;
  artifactSize?: number | undefined;
  artifactChecksum?: string | undefined;
  framework?: string | undefined;
  buildDurationMs?: number | undefined;
  installDurationMs?: number | undefined;
  deployDurationMs?: number | undefined;
  outputSizeBytes?: number | undefined;
  claudeJson?: any | undefined;
  status: 'building' | 'deployed' | 'failed';
  needsRebuild: boolean;
  baseSnapshotId?: string | undefined;
  cfDeploymentId?: string | undefined;
  nodeVersion?: string | undefined;
  pnpmVersion?: string | undefined;
  aiSessionId?: string | undefined;
  aiSessionCreatedAt?: Date | undefined;
  aiSessionLastUsedAt?: Date | undefined;

  // Version metadata fields (consolidated table)
  versionName?: string | undefined;
  versionDescription?: string | undefined;
  changeType?: string | undefined;
  majorVersion?: number | undefined;
  minorVersion?: number | undefined;
  patchVersion?: number | undefined;
  prerelease?: string | undefined;
  breakingRisk?: string | undefined;
  autoClassified?: boolean | undefined;
  classificationConfidence?: number | undefined;
  classificationReasoning?: string | undefined;
  isPublished?: boolean | undefined;
  publishedAt?: Date | undefined;
  publishedByUserId?: string | undefined;
  userComment?: string | undefined;
  displayVersionNumber?: string | undefined;

  // Three-lane deployment tracking fields
  deployment_lane?: string | undefined;
  deployment_lane_detected_at?: Date | undefined;
  deployment_lane_detection_origin?: string | undefined;
  deployment_lane_reasons?: string[] | undefined;
  deployment_lane_switched?: boolean | undefined;
  deployment_lane_switch_reason?: string | undefined;
  final_deployment_url?: string | undefined;
  deployment_lane_manifest?: any | undefined;

  createdAt: Date;
  updatedAt: Date;
}

export interface ClaudeGenerateResponse {
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  repository: string;
  license: string;
  tech_stack: string[];
  metadata: {
    tags: string[];
    industry_tags: string[];
    style_tags: string[];
    core_pages: Record<string, any>;
    components: string[];
    design_tokens: Record<string, any>;
    rsc_path: string;
  };
  templateFiles: Array<{
    path: string;
    content: string;
  }>;
  files: Array<{
    path: string;
    content: string;
  }>;
}