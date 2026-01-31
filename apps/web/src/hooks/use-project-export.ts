/**
 * Project Export Hooks
 * React hooks for project export and download functionality
 * Works with ProjectExportService for caching and optimization
 */

import { useState, useCallback } from 'react';
// Use API routes instead of direct service imports (security fix)
import { logger } from '@/utils/logger';

// Types moved inline to avoid server service imports
interface ExportOptions {
  format: 'zip' | 'tar' | 'folder';
  includeAssets?: boolean;
  includeDependencies?: boolean;
  minifyCode?: boolean;
}

interface ExportResponse {
  success: boolean;
  downloadUrl?: string;
  exportId?: string;
  expiresAt?: string;
  size?: number;
  error?: string;
  details?: string;
}

interface ExportState {
  isExporting: boolean;
  isDownloading: boolean;
  error: string | null;
  progress: number;
  exportId: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
}

/**
 * Hook for exporting and downloading projects
 */
export function useProjectExport() {
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    isDownloading: false,
    error: null,
    progress: 0,
    exportId: null,
    downloadUrl: null,
    expiresAt: null
  });

  const exportProject = useCallback(async (
    projectId: string,
    options: ExportOptions = { format: 'zip' },
    userId?: string
  ): Promise<ExportResponse> => {
    setState(prev => ({
      ...prev,
      isExporting: true,
      error: null,
      progress: 0,
      exportId: null,
      downloadUrl: null
    }));

    try {
      logger.info(`📦 Starting export for project: ${projectId}`, { options });

      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options, userId })
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      const result: ExportResponse = await response.json();

      if (result.success) {
        setState(prev => ({
          ...prev,
          isExporting: false,
          exportId: result.exportId || null,
          downloadUrl: result.downloadUrl || null,
          expiresAt: result.expiresAt || null,
          progress: 100
        }));

        logger.info(`✅ Export completed for project: ${projectId}`, {
          exportId: result.exportId,
          hasDownloadUrl: !!result.downloadUrl
        });
      } else {
        setState(prev => ({
          ...prev,
          isExporting: false,
          error: result.error || 'Export failed'
        }));

        logger.error(`❌ Export failed for project ${projectId}:`, result.error);
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      setState(prev => ({
        ...prev,
        isExporting: false,
        error: errorMessage
      }));

      logger.error(`❌ Export error for project ${projectId}:`, error);
      throw error;
    }
  }, []);

  const downloadProject = useCallback(async (
    projectId: string,
    options: ExportOptions = { format: 'zip' },
    userId?: string
  ): Promise<void> => {
    setState(prev => ({
      ...prev,
      isDownloading: true,
      error: null
    }));

    try {
      logger.info(`⬇️ Starting download for project: ${projectId}`, { options });

      // Use API route instead of direct service import (security fix)
      const response = await fetch(`/api/projects/${projectId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options, userId })
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const filename = response.headers.get('content-disposition')
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || `${projectId}-export.zip`;

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setState(prev => ({
        ...prev,
        isDownloading: false
      }));

      logger.info(`✅ Download completed for project: ${projectId}`, { filename });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      setState(prev => ({
        ...prev,
        isDownloading: false,
        error: errorMessage
      }));

      logger.error(`❌ Download error for project ${projectId}:`, error);
      throw error;
    }
  }, []);

  const checkExportStatus = useCallback(async (exportId: string, userId?: string) => {
    if (!exportId) return;

    try {
      // Use API route instead of direct service import (security fix)
      const response = await fetch(`/api/exports/${exportId}/status?userId=${userId}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
      }
      
      const status = await response.json();
      
      setState(prev => ({
        ...prev,
        progress: status.progress || prev.progress,
        downloadUrl: status.downloadUrl || prev.downloadUrl,
        expiresAt: status.expiresAt || prev.expiresAt,
        error: status.status === 'failed' ? (status.error || 'Export failed') : null
      }));

      return status;

    } catch (error) {
      logger.error(`❌ Failed to check export status for ${exportId}:`, error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Status check failed'
      }));
    }
  }, []);

  const resetState = useCallback(() => {
    setState({
      isExporting: false,
      isDownloading: false,
      error: null,
      progress: 0,
      exportId: null,
      downloadUrl: null,
      expiresAt: null
    });
  }, []);

  return {
    // State
    isExporting: state.isExporting,
    isDownloading: state.isDownloading,
    error: state.error,
    progress: state.progress,
    exportId: state.exportId,
    downloadUrl: state.downloadUrl,
    expiresAt: state.expiresAt,
    
    // Actions
    exportProject,
    downloadProject,
    checkExportStatus,
    resetState,
    
    // Computed state
    isProcessing: state.isExporting || state.isDownloading,
    hasDownloadUrl: !!state.downloadUrl,
    isExpired: state.expiresAt ? new Date(state.expiresAt) <= new Date() : false
  };
}

/**
 * Hook for managing user's export history
 */
export function useUserExports(userId?: string) {
  const [exports, setExports] = useState<Array<{
    exportId: string;
    projectId: string;
    createdAt: string;
    status: string;
    format: string;
    size?: number;
    downloadUrl?: string;
    expiresAt?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExports = useCallback(async (limit: number = 10) => {
    setIsLoading(true);
    setError(null);

    try {
      logger.info('📋 Fetching user exports', { userId, limit });

      // Use API route instead of direct service import (security fix)
      const response = await fetch(`/api/exports/user?userId=${userId}&limit=${limit}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch exports: ${response.statusText}`);
      }
      
      const data = await response.json();
      setExports(data.exports);

      logger.info(`✅ Loaded ${data.exports.length} exports for user`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch exports';
      setError(errorMessage);
      logger.error('❌ Failed to fetch user exports:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const refreshExports = useCallback(() => {
    return fetchExports();
  }, [fetchExports]);

  return {
    exports,
    isLoading,
    error,
    fetchExports,
    refreshExports,
    
    // Computed state
    totalExports: exports.length,
    activeExports: exports.filter(exp => exp.status === 'ready' && exp.downloadUrl),
    processingExports: exports.filter(exp => exp.status === 'processing'),
    expiredExports: exports.filter(exp => 
      exp.expiresAt && new Date(exp.expiresAt) <= new Date()
    )
  };
}

/**
 * Hook for export format options and validation
 */
export function useExportOptions() {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'zip',
    includeAssets: true,
    includeDependencies: false,
    minifyCode: false
  });

  const updateOption = useCallback(<K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K]
  ) => {
    setOptions(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const resetOptions = useCallback(() => {
    setOptions({
      format: 'zip',
      includeAssets: true,
      includeDependencies: false,
      minifyCode: false
    });
  }, []);

  const getEstimatedSize = useCallback((projectSize?: number): string => {
    if (!projectSize) return 'Unknown';
    
    let multiplier = 1;
    
    // Adjust based on options
    if (options.includeAssets) multiplier += 0.5;
    if (options.includeDependencies) multiplier += 2;
    if (options.minifyCode) multiplier *= 0.7;
    
    const estimatedBytes = projectSize * multiplier;
    
    if (estimatedBytes < 1024 * 1024) {
      return `${Math.round(estimatedBytes / 1024)}KB`;
    } else {
      return `${Math.round(estimatedBytes / (1024 * 1024))}MB`;
    }
  }, [options]);

  const validateOptions = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!['zip', 'tar', 'folder'].includes(options.format)) {
      errors.push('Invalid export format');
    }
    
    if (options.format === 'folder' && (options.includeAssets || options.includeDependencies)) {
      errors.push('Folder format does not support asset or dependency bundling');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }, [options]);

  return {
    options,
    updateOption,
    resetOptions,
    getEstimatedSize,
    validateOptions,
    
    // Format-specific helpers
    supportsAssets: options.format !== 'folder',
    supportsDependencies: options.format !== 'folder',
    supportsMinification: true,
    
    // Quick presets
    setQuickPreset: useCallback((preset: 'minimal' | 'standard' | 'complete') => {
      switch (preset) {
        case 'minimal':
          setOptions({
            format: 'zip',
            includeAssets: false,
            includeDependencies: false,
            minifyCode: true
          });
          break;
        case 'standard':
          setOptions({
            format: 'zip',
            includeAssets: true,
            includeDependencies: false,
            minifyCode: false
          });
          break;
        case 'complete':
          setOptions({
            format: 'zip',
            includeAssets: true,
            includeDependencies: true,
            minifyCode: false
          });
          break;
      }
    }, [])
  };
}