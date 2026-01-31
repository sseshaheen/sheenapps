export interface TaskPlan {
  id: string;
  projectId: string;
  userId: string;
  buildId: string;
  originalPrompt: string;
  estimatedDuration: number; // seconds
  tasks: Task[];
  dependencies: TaskDependency[];
  metadata: {
    framework: string;
    projectType: string;
    complexity: 'simple' | 'moderate' | 'complex';
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    cycleRecovery?: string | undefined;
    isSequential?: boolean | undefined;
  };
  usage?: TokenUsage | undefined; // Token usage for plan generation
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  planId: string; // Reference to parent plan
  type: 'create_file' | 'modify_file' | 'create_component' | 'setup_config' | 'install_deps';
  name: string;
  description: string;
  estimatedDuration: number;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  input: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    prompt?: string | undefined;
    context?: string | undefined;
    targetPath?: string | undefined;
    dependencies?: string[] | undefined;
  };
  output?: {
    files?: Array<{path: string; content: string}> | undefined;
    logs?: string[] | undefined;
    error?: string | undefined;
  } | undefined;
  startedAt?: Date | undefined;
  finishedAt?: Date | undefined;
  fingerprint?: string | undefined; // For idempotency
}

export interface TaskDependency {
  taskId: string;
  dependsOn: string[]; // task IDs that must complete first
}

export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'timeout';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  files?: Array<{path: string; content: string}> | undefined;
  logs?: string[] | undefined;
  error?: string | undefined;
  duration?: number | undefined;
  tokenUsage?: TokenUsage | undefined;
}

export interface WebhookPayload {
  type: 'build_started' | 'plan_generated' | 'plan_partial' | 'task_started' |
        'task_completed' | 'task_failed' | 'task_timeout' | 'build_completed' |
        'plan_warning' | 'plan_blocked' | 'build_failed' |
        // New progress tracking event types
        'plan_started' | 'deploy_started' | 'deploy_progress' | 
        'deploy_completed' | 'deploy_failed' | 'build_progress' |
        // Error recovery event types
        'security_alert' | 'error_escalated' | 'error_recovery_completed' |
        'error_recovery_failed' | 'error_recovery_progress' | 'error_recovered' |
        // R2 artifact event types
        'artifact_size_warning' | 'artifact_size_large' | 'artifact_uploaded';
  buildId: string;
  timestamp: number;
  data: any;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
}

export interface PlanContext {
  framework: string;
  existingFiles: string[];
  projectPath: string;
}

export interface TransformInput {
  type: 'code_gen' | 'refactor' | 'test_gen' | 'lint_fix' | 'heal_json';
  input: string;
  context?: any;
}

export interface ProjectContext {
  projectPath: string;
  framework: string;
  existingFiles: string[];
  userId: string;
  projectId: string;
}