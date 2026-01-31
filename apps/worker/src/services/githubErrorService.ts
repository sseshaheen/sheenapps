import { ServerLoggingService } from './serverLoggingService';

// Standard error codes for consistent frontend handling
export const GitHubErrorCodes = {
  APP_NOT_INSTALLED: 'APP_NOT_INSTALLED',
  BRANCH_PROTECTED: 'BRANCH_PROTECTED', 
  NOT_FAST_FORWARD: 'NOT_FAST_FORWARD',
  REPO_ARCHIVED: 'REPO_ARCHIVED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  APP_UNINSTALLED: 'APP_UNINSTALLED',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_INSTALLATION: 'INVALID_INSTALLATION',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS'
} as const;

export interface StandardGitHubError {
  error: string;
  error_code: keyof typeof GitHubErrorCodes;
  recovery_url?: string;
  retryable: boolean;        // Expert requirement
  retryAfter?: number;       // Expert requirement (seconds)
  details?: any;
}

export function createStandardGitHubError(
  message: string, 
  code: keyof typeof GitHubErrorCodes, 
  retryable: boolean = false,
  recoveryUrl?: string, 
  retryAfter?: number,
  details?: any
): StandardGitHubError {
  return {
    error: message,
    error_code: code,
    retryable,
    ...(recoveryUrl && { recovery_url: recoveryUrl }),
    ...(retryAfter && { retryAfter }),
    ...(details && { details })
  };
}

// Central error mapping function (expert requirement)
export function mapErrorToGitHubCode(error: any): StandardGitHubError {
  const loggingService = ServerLoggingService.getInstance();
  
  // GitHub API specific errors
  if (error.status === 404) {
    return createStandardGitHubError(
      'GitHub installation or repository not found',
      'APP_NOT_INSTALLED',
      false,
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://github.com'}/apps/${process.env.GITHUB_APP_SLUG || 'your-app'}/installations/select_target`
    );
  }
  
  if (error.status === 403) {
    // Check if it's branch protection
    if (error.message?.includes('branch') || error.message?.includes('protected')) {
      return createStandardGitHubError(
        'Branch is protected and requires pull request',
        'BRANCH_PROTECTED',
        false,
        undefined,
        undefined,
        { 
          suggestion: 'Use protected_pr sync mode',
          originalError: error.message 
        }
      );
    }
    
    // Check if it's permissions issue
    return createStandardGitHubError(
      'Insufficient permissions for GitHub repository',
      'INSUFFICIENT_PERMISSIONS',
      false,
      undefined,
      undefined,
      { originalError: error.message }
    );
  }
  
  if (error.status === 429) {
    // Extract retry-after from headers if available
    const retryAfter = error.headers?.['retry-after'] 
      ? parseInt(error.headers['retry-after'])
      : 60;
      
    return createStandardGitHubError(
      'GitHub API rate limit exceeded',
      'RATE_LIMIT', 
      true,
      undefined,
      retryAfter
    );
  }
  
  if (error.status === 409) {
    // Check if it's not fast-forward
    if (error.message?.includes('fast-forward') || error.message?.includes('conflict')) {
      return createStandardGitHubError(
        'Cannot fast-forward, manual conflict resolution required',
        'NOT_FAST_FORWARD',
        false,
        undefined,
        undefined,
        { originalError: error.message }
      );
    }
  }
  
  if (error.status === 422) {
    // Check if repository is archived
    if (error.message?.includes('archived')) {
      return createStandardGitHubError(
        'Repository is archived and cannot be modified',
        'REPO_ARCHIVED',
        false
      );
    }
    
    // Check if file is too large
    if (error.message?.includes('too large') || error.message?.includes('size')) {
      return createStandardGitHubError(
        'File size exceeds GitHub limits',
        'FILE_TOO_LARGE',
        false,
        undefined,
        undefined,
        { 
          maxSize: '100MB',
          originalError: error.message 
        }
      );
    }
  }
  
  // Network or timeout errors (retryable)
  if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    return createStandardGitHubError(
      'Network connection to GitHub failed',
      'RATE_LIMIT', // Use RATE_LIMIT as generic retryable error
      true,
      undefined,
      30 // Retry after 30 seconds
    );
  }
  
  // App uninstalled (detected from error message patterns)
  if (error.message?.includes('installation') && error.message?.includes('suspended')) {
    return createStandardGitHubError(
      'GitHub App installation has been suspended or uninstalled',
      'APP_UNINSTALLED',
      false,
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://github.com'}/apps/${process.env.GITHUB_APP_SLUG || 'your-app'}/installations/select_target`
    );
  }
  
  // Log unhandled error for improvement
  loggingService.logCriticalError(
    'unhandled_github_error',
    error,
    { 
      status: error.status,
      code: error.code,
      message: error.message
    }
  );
  
  // Default fallback
  return createStandardGitHubError(
    error.message || 'Unknown GitHub error occurred',
    'APP_NOT_INSTALLED', // Safe fallback that suggests re-authentication
    false,
    `${process.env.NEXT_PUBLIC_BASE_URL || 'https://github.com'}/apps/${process.env.GITHUB_APP_SLUG || 'your-app'}/installations/select_target`,
    undefined,
    { 
      originalError: error.message,
      originalStatus: error.status,
      originalCode: error.code 
    }
  );
}

// Convenience function for backward compatibility with existing routes
export function createStandardError(
  message: string, 
  code: keyof typeof GitHubErrorCodes, 
  recoveryUrl?: string, 
  details?: any
): Pick<StandardGitHubError, 'error' | 'error_code' | 'recovery_url' | 'details'> {
  return {
    error: message,
    error_code: code,
    ...(recoveryUrl && { recovery_url: recoveryUrl }),
    ...(details && { details })
  };
}