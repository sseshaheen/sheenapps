/**
 * Enhanced Project Status Bar with Transition Animations
 * Shows live status updates with celebratory animations and failure feedback
 */

'use client';

import React from 'react';
import { ProjectStatusBar } from './project-status-bar';
import { StatusTransitionFeedback } from './status-transition-feedback';
import { useTransitionFeedback } from '@/hooks/use-build-status-transitions';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/utils/logger';

interface EnhancedProjectStatusBarProps {
  projectId: string;
  className?: string;
  onPublishClick?: () => void;
  onVersionHistoryClick?: () => void;
  showActions?: boolean;
}

/**
 * Enhanced status bar that includes transition animations and feedback
 */
export function EnhancedProjectStatusBar({
  projectId,
  className,
  onPublishClick,
  onVersionHistoryClick,
  showActions = true
}: EnhancedProjectStatusBarProps) {
  const queryClient = useQueryClient();
  
  // Use the transition feedback hook to track status changes
  const {
    currentStatus,
    showSuccessAnimation,
    showFailureAnimation,
    animationMessage,
    dismissAnimation,
    isRollingBack,
    lastEvent
  } = useTransitionFeedback(projectId);

  // Force refetch when we detect certain transitions
  React.useEffect(() => {
    if (lastEvent === 'rollback_started') {
      // Start polling more frequently during rollback
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['project-status', projectId] });
        queryClient.invalidateQueries({ queryKey: ['version-history', projectId] });
        queryClient.invalidateQueries({ queryKey: ['current-version', projectId] });
      }, 2000); // Poll every 2 seconds during rollback
      
      return () => clearInterval(interval);
    }
    
    // Force complete refresh when rollback succeeds or fails
    if (lastEvent === 'rollback_succeeded' || lastEvent === 'quick_success' || lastEvent === 'rollback_failed') {
      logger.info(`✨ Rollback completed with event: ${lastEvent}, forcing data refresh`);
      // Invalidate all related queries to force fresh data
      queryClient.invalidateQueries({ queryKey: ['project-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['version-history', projectId] });
      queryClient.invalidateQueries({ queryKey: ['current-version', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Also refetch immediately
      queryClient.refetchQueries({ queryKey: ['project-status', projectId] });
      queryClient.refetchQueries({ queryKey: ['projects'] });
    }
  }, [lastEvent, projectId, queryClient]);

  // Log status changes for debugging
  React.useEffect(() => {
    if (currentStatus) {
      logger.info(`📊 Status bar detected status: ${currentStatus}`, {
        isRollingBack,
        lastEvent,
        showSuccessAnimation,
        showFailureAnimation
      });
    }
  }, [currentStatus, isRollingBack, lastEvent, showSuccessAnimation, showFailureAnimation]);

  return (
    <>
      {/* Status Transition Feedback Animations */}
      <StatusTransitionFeedback
        show={showSuccessAnimation}
        type="success"
        message={animationMessage}
        onDismiss={dismissAnimation}
      />
      
      <StatusTransitionFeedback
        show={showFailureAnimation}
        type="failure"
        message={animationMessage}
        onDismiss={dismissAnimation}
      />
      
      {/* Original Project Status Bar with enhanced styling during transitions */}
      <div className={isRollingBack ? 'animate-pulse' : ''}>
        <ProjectStatusBar
          projectId={projectId}
          className={className}
          onPublishClick={onPublishClick}
          onVersionHistoryClick={onVersionHistoryClick}
          showActions={showActions}
        />
      </div>
    </>
  );
}

/**
 * Standalone version box component with transition animations
 * Can be used separately from the status bar
 */
export function AnimatedVersionBox({ 
  projectId, 
  className 
}: { 
  projectId: string;
  className?: string;
}) {
  const {
    currentStatus,
    isRollingBack,
    lastTransition
  } = useTransitionFeedback(projectId);
  
  return (
    <div className={className}>
      {/* Version display with special styling during rollback */}
      <div className={`
        relative px-4 py-2 rounded-lg border transition-all duration-300
        ${isRollingBack 
          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 animate-pulse' 
          : currentStatus === 'deployed'
            ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
            : currentStatus === 'rollbackFailed'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
              : 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
        }
      `}>
        <div className="flex items-center gap-2">
          {isRollingBack && (
            <span className="animate-spin">🔄</span>
          )}
          {currentStatus === 'deployed' && lastTransition?.from === 'rollingBack' && (
            <span className="animate-bounce">✅</span>
          )}
          {currentStatus === 'rollbackFailed' && (
            <span>❌</span>
          )}
          
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {isRollingBack 
                ? 'Rolling back version...' 
                : currentStatus === 'deployed' && lastTransition?.from === 'rollingBack'
                  ? 'Version restored!'
                  : currentStatus === 'rollbackFailed'
                    ? 'Rollback failed'
                    : 'Current version'
              }
            </span>
            {/* Version info would go here */}
          </div>
        </div>
        
        {/* Pulse effect during rollback */}
        {isRollingBack && (
          <div className="absolute inset-0 rounded-lg bg-yellow-400/20 dark:bg-yellow-400/10 animate-ping" />
        )}
      </div>
    </div>
  );
}