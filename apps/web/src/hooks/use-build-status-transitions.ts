/**
 * Build Status Transition Tracker
 * Tracks changes in build status and triggers appropriate UI feedback
 * Handles celebratory animations, failure notifications, and state transitions
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStatus } from '@/hooks/use-project-status';
import { logger } from '@/utils/logger';

export type BuildStatusTransition = {
  from: string | null;
  to: string;
  timestamp: number;
};

export type TransitionEvent = 
  | 'rollback_started'      // * → rollingBack
  | 'rollback_succeeded'     // rollingBack → deployed
  | 'rollback_failed'        // rollingBack → rollbackFailed
  | 'quick_success'          // * → deployed (too quick to catch rollingBack)
  | 'build_started'          // * → building
  | 'build_succeeded'        // building → deployed
  | 'build_failed'           // building → failed
  | null;

interface UseBuildStatusTransitionsOptions {
  projectId: string;
  enabled?: boolean;
  onTransition?: (event: TransitionEvent, transition: BuildStatusTransition) => void;
}

/**
 * Hook to track build status transitions and detect important state changes
 */
export function useBuildStatusTransitions({
  projectId,
  enabled = true,
  onTransition
}: UseBuildStatusTransitionsOptions) {
  const { data: status, isLoading } = useProjectStatus(projectId);
  const previousStatusRef = useRef<string | null>(null);
  const [lastTransition, setLastTransition] = useState<BuildStatusTransition | null>(null);
  const [lastEvent, setLastEvent] = useState<TransitionEvent>(null);
  
  // Track if we've seen a rollingBack status to detect quick transitions
  const hasSeenRollingBackRef = useRef(false);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect transition events based on status changes
  const detectTransitionEvent = useCallback((from: string | null, to: string): TransitionEvent => {
    // Rollback transitions
    if (to === 'rollingBack') {
      hasSeenRollingBackRef.current = true;
      return 'rollback_started';
    }
    
    if (from === 'rollingBack' && to === 'deployed') {
      return 'rollback_succeeded';
    }
    
    if (from === 'rollingBack' && to === 'rollbackFailed') {
      return 'rollback_failed';
    }
    
    // Quick success - went straight to deployed without catching rollingBack
    // This happens when the rollback is very fast
    if (to === 'deployed' && from !== 'rollingBack' && from !== 'building') {
      // Check if we recently started a rollback operation
      // We'll consider it a quick success if it happens within 5 seconds
      if (hasSeenRollingBackRef.current) {
        hasSeenRollingBackRef.current = false;
        return 'quick_success';
      }
    }
    
    // Build transitions
    if (to === 'building') {
      return 'build_started';
    }
    
    if (from === 'building' && to === 'deployed') {
      return 'build_succeeded';
    }
    
    if (from === 'building' && to === 'failed') {
      return 'build_failed';
    }
    
    return null;
  }, []);

  // Main effect to track status changes
  useEffect(() => {
    if (!enabled || isLoading || !status?.buildStatus) {
      return;
    }

    const currentStatus = status.buildStatus;
    const previousStatus = previousStatusRef.current;

    // Only process if status actually changed
    if (previousStatus !== currentStatus) {
      logger.info(`🔄 Build status transition: ${previousStatus} → ${currentStatus}`);
      
      const transition: BuildStatusTransition = {
        from: previousStatus,
        to: currentStatus,
        timestamp: Date.now()
      };
      
      const event = detectTransitionEvent(previousStatus, currentStatus);
      
      setLastTransition(transition);
      setLastEvent(event);
      
      // Call the callback if provided
      if (event && onTransition) {
        onTransition(event, transition);
      }
      
      // Update the previous status
      previousStatusRef.current = currentStatus;
      
      // Clear the "hasSeenRollingBack" flag after a timeout
      // This prevents false positives for quick success detection
      if (currentStatus === 'rollingBack') {
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }
        
        transitionTimeoutRef.current = setTimeout(() => {
          hasSeenRollingBackRef.current = false;
        }, 10000); // 10 seconds timeout
      }
    }
  }, [status?.buildStatus, enabled, isLoading, onTransition, detectTransitionEvent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  return {
    currentStatus: status?.buildStatus || null,
    lastTransition,
    lastEvent,
    isRollingBack: status?.buildStatus === 'rollingBack',
    isDeployed: status?.buildStatus === 'deployed',
    isFailed: status?.buildStatus === 'failed' || status?.buildStatus === 'rollbackFailed',
    isBuilding: status?.buildStatus === 'building',
    isLoading
  };
}

/**
 * Hook to trigger UI feedback based on transition events
 */
export function useTransitionFeedback(projectId: string) {
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showFailureAnimation, setShowFailureAnimation] = useState(false);
  const [animationMessage, setAnimationMessage] = useState<string>('');

  const handleTransition = useCallback((event: TransitionEvent, transition: BuildStatusTransition) => {
    switch (event) {
      case 'rollback_succeeded':
      case 'quick_success':
        setAnimationMessage('Version restored successfully! 🎉');
        setShowSuccessAnimation(true);
        setTimeout(() => setShowSuccessAnimation(false), 4000);
        break;
        
      case 'rollback_failed':
        setAnimationMessage('Rollback failed. Please try again.');
        setShowFailureAnimation(true);
        setTimeout(() => setShowFailureAnimation(false), 4000);
        break;
        
      case 'build_succeeded':
        setAnimationMessage('Build completed successfully! ✨');
        setShowSuccessAnimation(true);
        setTimeout(() => setShowSuccessAnimation(false), 4000);
        break;
        
      case 'build_failed':
        setAnimationMessage('Build failed. Check the logs for details.');
        setShowFailureAnimation(true);
        setTimeout(() => setShowFailureAnimation(false), 4000);
        break;
    }
  }, []);

  const statusData = useBuildStatusTransitions({
    projectId,
    onTransition: handleTransition
  });

  return {
    ...statusData,
    showSuccessAnimation,
    showFailureAnimation,
    animationMessage,
    dismissAnimation: () => {
      setShowSuccessAnimation(false);
      setShowFailureAnimation(false);
    }
  };
}