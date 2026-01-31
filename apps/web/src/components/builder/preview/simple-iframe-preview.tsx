'use client';

import { useCleanBuildEvents } from '@/hooks/use-clean-build-events';
import { useAuthStore } from '@/store';
import { useBuildStateStore } from '@/store/build-state-store';
import { logger } from '@/utils/logger';
import { useEffect, useMemo, useRef, useState } from 'react';

interface SimpleIframePreviewProps {
  projectId: string;
  buildId?: string;
  className?: string;
  subdomain?: string;
  projectPreviewUrl?: string;
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed';
}

type PreviewStatus = 'checking' | 'building' | 'ready' | 'error';

export function SimpleIframePreview({
  projectId,
  buildId,
  className = '',
  subdomain,
  projectPreviewUrl,
  projectBuildStatus
}: SimpleIframePreviewProps) {
  // Debug what props we received - use console.log to bypass any logger issues
  console.log('🎬 SimpleIframePreview mounted/updated with props:', {
    projectId,
    buildId: buildId || 'null',
    projectPreviewUrl: projectPreviewUrl || 'null',
    projectBuildStatus: projectBuildStatus || 'null',
    subdomain: subdomain || 'null',
    timestamp: new Date().toISOString()
  });

  // 🚀 FIX: Initialize states properly based on what we receive
  // Check if this is a new build that was just started
  const isNewBuildStarting = useBuildStateStore(state => state.isStartingNewBuild());
  const clearNewBuildFlag = useBuildStateStore(state => state.clearNewBuildFlag);

  // Determine initial state based on build status
  const hasPreviewUrl = !!projectPreviewUrl;
  const isActiveBuildStatus = projectBuildStatus && ['queued', 'building', 'rollingBack'].includes(projectBuildStatus);
  const shouldShowInitialLoading = isNewBuildStarting || (!!buildId && isActiveBuildStatus);

  const [isLoading, setIsLoading] = useState(false); // Start not loading - we'll set it if needed
  const [error, setError] = useState<string | null>(null);
  // Track the preview URL and its source
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewUrlSource, setPreviewUrlSource] = useState<string>(''); // Track where the URL came from
  const [environment, setEnvironment] = useState<'development' | 'production'>('production');
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>(
    shouldShowInitialLoading ? 'checking' : (hasPreviewUrl ? 'ready' : 'checking')
  );
  const [buildProgress, setBuildProgress] = useState(0);

  // Track rollback state more reliably
  const [rollbackState, setRollbackState] = useState<{
    isActive: boolean;
    startTime: number | null;
    previousUrl: string | null;
  }>({
    isActive: false,
    startTime: null,
    previousUrl: null
  });

  // 🚀 ULTIMATE SOLUTION: Fixed refs in exact same order every render
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mountedRef = useRef(true);
  const lastPropsRef = useRef({
    buildId,
    projectId,
    subdomain,
    projectPreviewUrl,
    projectBuildStatus
  });
  const lastBuildDataRef = useRef({
    events: [] as any[],
    isComplete: false,
    currentProgress: 0,
    previewUrl: null as string | null,
    error: null as Error | null,
    isLoading: false
  });

  // 🚀 ULTIMATE SOLUTION: Direct store access with no dependencies
  const user = useAuthStore(state => state.user);
  const userId = user?.id || '';

  // 🚀 ULTIMATE SOLUTION: Stable options object to prevent Hook violations
  const cleanEventsOptions = useMemo(() => ({
    autoPolling: true,
    projectBuildStatus: projectBuildStatus || null
  }), [projectBuildStatus]);

  // Determine if we should poll for build events
  // Poll only for active builds (queued, building)
  // Don't poll for rollback - it doesn't create a new buildId immediately
  // Don't poll for completed builds (deployed, failed, rollbackFailed)
  const isStatusActive = projectBuildStatus &&
    ['queued', 'building'].includes(projectBuildStatus);

  // Poll if we have a buildId AND the status indicates it's active
  // If no status, assume it's completed (safer default)
  // IMPORTANT: Don't poll during rollback as the buildId is stale
  const shouldPollForEvents = !!(buildId && isStatusActive && projectBuildStatus !== 'rollingBack');

  // 🚀 ULTIMATE SOLUTION: Single data source call - poll if we have an active build
  const buildData = useCleanBuildEvents(
    shouldPollForEvents ? buildId : null,
    userId,
    cleanEventsOptions
  );

  // Enhanced sandbox logic with safe origin check (consistent with responsive-preview-container)
  const getSandboxAttributes = () => {
    const baseAttributes = "allow-scripts allow-forms allow-popups allow-modals"

    // Safe same-origin check using URL parsing (prevents URL spoofing)
    const isSameOrigin = (() => {
      try {
        if (!previewUrl) return false
        return new URL(previewUrl).origin === window.location.origin
      } catch {
        return false
      }
    })()

    // Only add allow-same-origin for same-origin URLs (development)
    // Cross-origin URLs should NOT have allow-same-origin for security
    return isSameOrigin
      ? `allow-same-origin ${baseAttributes}`
      : baseAttributes
  }

  // 🚀 ULTIMATE SOLUTION: Pure functions with no React Hooks
  const updatePreviewUrl = (newUrl: string, source: string) => {
    if (!mountedRef.current || !newUrl) return;

    // Log comparison for debugging
    logger.info(`🔄 Preview URL update check:`, {
      source,
      currentUrl: previewUrl?.slice(0, 50),
      newUrl: newUrl.slice(0, 50),
      isNewUrl: newUrl !== previewUrl
    }, 'preview');

    // Always update if URL is different
    if (newUrl === previewUrl) {
      logger.debug('preview', `URL unchanged, skipping update`);
      return;
    }

    // Update environment based on URL type
    if (newUrl.startsWith('/api/local-preview/')) {
      setEnvironment('development');
    } else if (newUrl.startsWith('https://')) {
      setEnvironment('production');
    }

    logger.info('preview', `✅ URL updated from ${source}: ${newUrl.slice(0, 50)}...`);
    console.log(`🌐 PREVIEW URL UPDATED from ${source}:`, {
      oldUrl: previewUrl?.slice(0, 50) || 'null',
      newUrl: newUrl.slice(0, 50),
      timestamp: new Date().toISOString()
    });
    setPreviewUrl(newUrl);
    setPreviewUrlSource(source); // Track the source
    // Note: Removed setIframeKey - iframe now uses stable key to preserve state
  };

  const generateFallbackUrl = (projectIdParam: string, subdomainParam?: string) => {
    if (subdomainParam) {
      return `https://${subdomainParam}.sheenapps.com`;
    }

    // eslint-disable-next-line no-restricted-globals
    const isDevelopment = process.env.NODE_ENV === 'development';
    setEnvironment(isDevelopment ? 'development' : 'production');

    if (isDevelopment) {
      return `/api/local-preview/${projectIdParam}`;
    } else {
      return `https://preview--${projectIdParam}.sheenapps.com`;
    }
  };

  const handleIframeLoad = () => {
    if (mountedRef.current) {
      logger.debug('preview', 'Iframe loaded successfully');
      setIsLoading(false);
    }
  };

  const handleIframeError = () => {
    if (mountedRef.current) {
      logger.debug('preview', 'Iframe load error');
      setIsLoading(false);
      setError('Failed to load preview. The site might still be building.');
    }
  };

  // Set initial state on mount and handle URL changes from props
  useEffect(() => {
    console.log('🔄 SimpleIframePreview effect - projectPreviewUrl changed:', {
      projectPreviewUrl,
      buildId,
      currentPreviewUrl: previewUrl,
      currentStatus: previewStatus,
      currentSource: previewUrlSource
    });

    // Update preview URL from props if:
    // 1. We don't have a URL yet
    // 2. The URL from props is different and we don't have a build-events URL
    // 3. The URL from props is newer (for completed builds)
    if (projectPreviewUrl) {
      // If we don't have a URL or the source isn't from build-events, update
      if (!previewUrl || (previewUrlSource !== 'build-events' && projectPreviewUrl !== previewUrl)) {
        console.log('📝 Updating preview URL from props:', projectPreviewUrl);
        setPreviewUrl(projectPreviewUrl);
        setPreviewUrlSource('props');

        // Determine environment based on URL
        if (projectPreviewUrl.startsWith('/api/local-preview/')) {
          setEnvironment('development');
        } else if (projectPreviewUrl.startsWith('https://')) {
          setEnvironment('production');
        }
      }
    }

    if (projectPreviewUrl && !buildId) {
      // For deployed projects with preview URL, immediately set to ready
      console.log('✅ Setting preview to ready state');
      setPreviewStatus('ready');
      setIsLoading(false);
      setError(null);
    } else if (!projectPreviewUrl && !buildId && !previewUrl) {
      // No preview URL and no active build
      console.log('⚠️ No preview URL or build ID available');
      setPreviewStatus('error');
      setError('No preview available. Project may not have been built yet.');
      setIsLoading(false);
    }
  }, [projectPreviewUrl]); // Re-run when projectPreviewUrl changes

  // Timeout safety check for stuck rollback state
  useEffect(() => {
    if (rollbackState.isActive && rollbackState.startTime) {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - rollbackState.startTime!;
        if (elapsed > 360000) { // 6 minutes
          console.log('⚠️ Rollback timeout - clearing stuck state after 6 minutes');
          setRollbackState({
            isActive: false,
            startTime: null,
            previousUrl: null
          });
        }
      }, 30000); // Check every 30 seconds

      return () => clearInterval(checkInterval);
    }
  }, [rollbackState.isActive, rollbackState.startTime]);

  // Handle preview status and URL updates
  useEffect(() => {
    // Detect rollback state changes
    const wasRollingBack = lastPropsRef.current.projectBuildStatus === 'rollingBack';
    const isCurrentlyRollingBack = projectBuildStatus === 'rollingBack';
    const isNowDeployed = projectBuildStatus === 'deployed';
    const urlChanged = projectPreviewUrl !== lastPropsRef.current.projectPreviewUrl;

    // Rollback just started
    if (!wasRollingBack && isCurrentlyRollingBack) {
      console.log('🔄 Rollback started - tracking state');
      setRollbackState({
        isActive: true,
        startTime: Date.now(),
        previousUrl: lastPropsRef.current.projectPreviewUrl
      });
      logger.info('🔄 Rollback started - this may take up to 5.5 minutes');
    }

    // Rollback completed (status changed OR URL changed while in rollback state)
    const rollbackJustCompleted = rollbackState.isActive && (
      (wasRollingBack && isNowDeployed) ||
      (rollbackState.isActive && urlChanged && projectPreviewUrl !== rollbackState.previousUrl)
    );

    if (rollbackJustCompleted) {
      const duration = rollbackState.startTime ? Math.round((Date.now() - rollbackState.startTime) / 1000) : 0;
      console.log(`✅ Rollback completed in ${duration} seconds - clearing state`);
      logger.info(`✅ Rollback completed in ${duration} seconds`);
      setRollbackState({
        isActive: false,
        startTime: null,
        previousUrl: null
      });
    }

    // Timeout safety: Clear rollback state after 6 minutes if still stuck
    if (rollbackState.isActive && rollbackState.startTime) {
      const elapsed = Date.now() - rollbackState.startTime;
      if (elapsed > 360000) { // 6 minutes
        console.log('⚠️ Rollback timeout - clearing stuck state after 6 minutes');
        setRollbackState({
          isActive: false,
          startTime: null,
          previousUrl: null
        });
      }
    }

    // Store current props in ref
    lastPropsRef.current = {
      buildId,
      projectId,
      subdomain,
      projectPreviewUrl,
      projectBuildStatus
    };

    // Store current build data in ref
    lastBuildDataRef.current = {
      events: buildData.events || [],
      isComplete: buildData.isComplete || false,
      currentProgress: buildData.currentProgress || 0,
      previewUrl: buildData.previewUrl || null,
      error: buildData.error || null,
      isLoading: buildData.isLoading || false
    };

    // Force reload on rollback completion
    if (rollbackJustCompleted) {
      console.log('🎉 Rollback completed! Force reloading preview with new URL:', projectPreviewUrl);
      // Update preview URL after rollback completion (no iframe reload needed)
      if (projectPreviewUrl) {
        setPreviewUrl(projectPreviewUrl);
        setPreviewUrlSource('rollback-complete');
        setPreviewStatus('ready');
        setIsLoading(false);
        setError(null);
      }
    }

    // Determine preview status based on current state
    if (rollbackState.isActive && projectBuildStatus === 'rollingBack') {
      // During rollback, keep showing the current preview (don't show building state)
      // The preview URL will update when rollback completes
      if (previewStatus !== 'ready') {
        setPreviewStatus('ready');
        setError(null);
        setIsLoading(false);
      }
    } else if (!shouldPollForEvents && projectPreviewUrl) {
      // For projects without active builds but with a preview URL, go straight to ready
      if (previewStatus !== 'ready') {
        setPreviewStatus('ready');
        setError(null);
        setIsLoading(false);
      }
    } else if (!buildId && !projectPreviewUrl && !previewUrl) {
      // Only show error if we have no URLs at all
      if (previewStatus !== 'error') {
        setPreviewStatus('error');
        setError('No preview available. Project may not have been built yet.');
        setIsLoading(false);
      }
    } else if (shouldPollForEvents && previewStatus !== 'building' && previewStatus !== 'ready') {
      // Only set to checking if we're not already building or ready
      setPreviewStatus('checking');
      setError(null);
    }

    // Handle project preview URL updates (skip if we just handled rollback)
    // This handles the case where the project data is updated with a new URL
    if (!rollbackJustCompleted && projectPreviewUrl && projectPreviewUrl !== previewUrl) {
      // Update if we don't have a URL from build events, or if this is a newer URL
      if (previewUrlSource !== 'build-events' || !buildData.isLoading) {
        logger.info('preview', `📦 Updating preview URL from project: ${projectPreviewUrl.slice(0, 50)}...`);
        updatePreviewUrl(projectPreviewUrl, 'project-config-update');
      }
    }

    // Handle build status updates (for active builds or new builds)
    if (shouldPollForEvents || isNewBuildStarting) {
      if (buildData.error) {
        setPreviewStatus('error');
        setError(buildData.error.message || 'Build failed');
        setIsLoading(false);
        setBuildProgress(0);
        clearNewBuildFlag(); // Clear the flag on error
      } else if (buildData.isComplete) {
        setPreviewStatus('ready');
        setError(null);
        setIsLoading(false);
        setBuildProgress(100);
        clearNewBuildFlag(); // Clear the flag on completion
      } else if (buildData.isLoading || isNewBuildStarting) {
        setPreviewStatus('building');
        setError(null);
        setIsLoading(true);
        setBuildProgress(Math.round(buildData.currentProgress * 100));
      }
    }

    // Handle preview URL from build events (takes priority over project URL)
    if (buildData.previewUrl) {
      // Always prefer the build events URL as it's the most up-to-date
      if (buildData.previewUrl !== previewUrl) {
        logger.info(`🎆 Build events preview URL available (updating):`, {
          eventUrl: buildData.previewUrl.slice(0, 50),
          currentUrl: previewUrl?.slice(0, 50),
          isComplete: buildData.isComplete
        }, 'preview');

        updatePreviewUrl(buildData.previewUrl, 'build-events');
      }
    }

    // Fallback URL generation (only if no URL exists)
    if (!previewUrl && !projectPreviewUrl && !buildData.previewUrl && projectId) {
      const fallbackUrl = generateFallbackUrl(projectId, subdomain);
      if (fallbackUrl) {
        logger.info('preview', `🔄 Using fallback URL: ${fallbackUrl.slice(0, 50)}...`);
        updatePreviewUrl(fallbackUrl, 'fallback');
      }
    }

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
    };
  }, [
    buildId,
    projectId,
    subdomain,
    projectPreviewUrl,
    projectBuildStatus,
    shouldPollForEvents,
    buildData.events,
    buildData.isComplete,
    buildData.currentProgress,
    buildData.previewUrl,
    buildData.error,
    buildData.isLoading,
    previewUrl,
    previewUrlSource,
    previewStatus,
    updatePreviewUrl,
    rollbackState
  ]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Loading/Building overlay - show when building or starting new build */}
      {(previewStatus === 'building' ||
        (previewStatus === 'checking' && (shouldPollForEvents || isNewBuildStarting) && !previewUrl)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center max-w-md">
            {previewStatus === 'checking' && buildId && (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading your new version...</p>
              </>
            )}
            {previewStatus === 'building' && (
              <>
                <div className="w-64 mx-auto mb-4">
                  <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-500 ease-out"
                      style={{ width: `${buildProgress}%` }}
                    />
                  </div>
                </div>
                <p className="text-gray-800 font-medium">Building your preview...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center p-8">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Preview Unavailable</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Open in new tab →
            </a>
          </div>
        </div>
      )}

      {/* Iframe - render when we have a preview URL */}
      {previewUrl ? (
        <iframe
          ref={iframeRef}
          key={`preview-${projectId}`}
          src={previewUrl}
          className="w-full h-full border-0"
          title={`Preview for ${projectId}`}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox={getSandboxAttributes()}
          allow="fullscreen"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <p className="text-gray-600">No preview URL available</p>
          </div>
        </div>
      )}

      {/* Debug: Clear old URL button */}
      {/* eslint-disable-next-line no-restricted-globals */}
      {process.env.NODE_ENV === 'development' && previewUrl?.includes('8d12fbcd') && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => {
              logger.debug('preview', 'Clearing URL and browser storage');
              setPreviewUrl('');
              // Note: Removed setIframeKey - iframe preserves state with stable key
              try {
                localStorage.clear();
                sessionStorage.clear();
                logger.debug('preview', 'Browser storage cleared');
              } catch (e) {
                logger.warn('preview', 'Could not clear storage:', e);
              }
            }}
            className="bg-red-600 text-white px-2 py-1 text-xs rounded"
          >
            Clear Old URL + Storage
          </button>
        </div>
      )}

      {/* Rollback indicator overlay - only show during actual rollback */}
      {rollbackState.isActive && projectBuildStatus === 'rollingBack' && previewStatus !== 'error' && (
        <div className="absolute top-4 left-4 right-4 z-10">
          <div className="bg-yellow-100 border border-yellow-300 rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-600 border-t-transparent"></div>
              <div className="flex-1">
                <span className="text-sm font-medium text-yellow-800 block">
                  Rolling back to previous version...
                </span>
                {rollbackState.startTime && (
                  <span className="text-xs text-yellow-700">
                    This is usually quick but could take a few minutes for large projects.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview URL indicator */}
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-75 text-white text-xs py-1 px-3 flex justify-between items-center">
        <span className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            environment === 'development'
              ? 'bg-green-600 text-white'
              : rollbackState.isActive && projectBuildStatus === 'rollingBack'
              ? 'bg-yellow-600 text-white animate-pulse'
              : 'bg-blue-600 text-white'
          }`}>
            {rollbackState.isActive && projectBuildStatus === 'rollingBack'
              ? 'ROLLING BACK'
              : environment === 'development'
              ? 'LOCAL'
              : 'HOSTED'}
          </span>
          <span className="truncate">
            Preview: <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-blue-200 hover:underline transition-colors duration-200"
              title="Click to open preview in new tab"
            >
              {previewUrl.length > 60 ? previewUrl.slice(0, 60) + '...' : previewUrl}
            </a>
          </span>
        </span>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="preview-link"
            className="hover:underline text-blue-300 hover:text-blue-200 transition-colors duration-200 font-medium"
            title="Open preview in new tab"
          >
            Open ↗
          </a>
        )}
      </div>
    </div>
  );
}
