/**
 * Status Transition Feedback Component
 * Shows celebratory animations for successful operations and error feedback for failures
 * Includes confetti for success and shake animation for failures
 */

'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, m } from '@/components/ui/motion-provider';
import Icon from '@/components/ui/icon';
import { cn } from '@/lib/utils';

interface StatusTransitionFeedbackProps {
  show: boolean;
  type: 'success' | 'failure';
  message: string;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Main feedback component with animations
 */
export function StatusTransitionFeedback({
  show,
  type,
  message,
  onDismiss,
  className
}: StatusTransitionFeedbackProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (show && type === 'success') {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [show, type]);

  return (
    <>
      {/* Confetti Animation for Success */}
      {showConfetti && <ConfettiAnimation />}
      
      {/* Main Notification */}
      <AnimatePresence>
        {show && (
          <m.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              transition: {
                type: "spring",
                stiffness: 300,
                damping: 20
              }
            }}
            exit={{ 
              opacity: 0, 
              y: -20, 
              scale: 0.95,
              transition: { duration: 0.2 }
            }}
            className={cn(
              "fixed top-20 left-1/2 -translate-x-1/2 z-50",
              "px-6 py-4 rounded-xl shadow-lg",
              "backdrop-blur-md border",
              "max-w-md",
              type === 'success' 
                ? "bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
                : "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
              className
            )}
          >
            <div className="flex items-center gap-3">
              {type === 'success' ? (
                <m.div
                  animate={{
                    rotate: [0, 10, -10, 10, -10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: 2,
                    repeatDelay: 0.5
                  }}
                >
                  <Icon name="check-circle" className="w-6 h-6" />
                </m.div>
              ) : (
                <m.div
                  animate={{
                    x: [0, -10, 10, -10, 10, 0]
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: 2
                  }}
                >
                  <Icon name="alert-circle" className="w-6 h-6" />
                </m.div>
              )}
              
              <div className="flex-1">
                <m.p 
                  className="font-semibold text-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  {message}
                </m.p>
              </div>
              
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="ml-2 p-1 rounded-lg hover:bg-white/20 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Confetti animation component
 */
function ConfettiAnimation() {
  const colors = ['#10b981', '#22c55e', '#34d399', '#6ee7b7', '#86efac'];
  const confettiCount = 50;
  
  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {Array.from({ length: confettiCount }).map((_, i) => (
        <m.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            left: '50%',
            top: '20%'
          }}
          initial={{
            x: 0,
            y: 0,
            opacity: 1,
            scale: 0
          }}
          animate={{
            x: (Math.random() - 0.5) * 600,
            y: Math.random() * 500 + 100,
            opacity: [1, 1, 0],
            scale: [0, 1, 1],
            rotate: Math.random() * 720
          }}
          transition={{
            duration: 2 + Math.random(),
            ease: "easeOut",
            delay: Math.random() * 0.2
          }}
        />
      ))}
    </div>
  );
}

/**
 * Inline status indicator for build status changes
 */
interface StatusIndicatorProps {
  status: 'rollingBack' | 'deployed' | 'rollbackFailed' | 'building' | 'failed' | null;
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  if (!status) return null;

  const config = {
    rollingBack: {
      icon: 'rotate-ccw',
      text: 'Rolling back...',
      className: 'text-yellow-600 dark:text-yellow-400',
      animate: true
    },
    deployed: {
      icon: 'check-circle',
      text: 'Deployed',
      className: 'text-green-600 dark:text-green-400',
      animate: false
    },
    rollbackFailed: {
      icon: 'alert-triangle',
      text: 'Rollback failed',
      className: 'text-red-600 dark:text-red-400',
      animate: false
    },
    building: {
      icon: 'loader-2',
      text: 'Building...',
      className: 'text-blue-600 dark:text-blue-400',
      animate: true
    },
    failed: {
      icon: 'x-circle',
      text: 'Failed',
      className: 'text-red-600 dark:text-red-400',
      animate: false
    }
  };

  const statusConfig = config[status];
  if (!statusConfig) return null;

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
        className
      )}
    >
      <Icon 
        name={statusConfig.icon as any}
        className={cn(
          "w-4 h-4",
          statusConfig.className,
          statusConfig.animate && "animate-spin"
        )}
      />
      <span className={cn("text-sm font-medium", statusConfig.className)}>
        {statusConfig.text}
      </span>
    </m.div>
  );
}

/**
 * Pulse animation for version box during operations
 */
export function VersionBoxPulse({ active }: { active: boolean }) {
  if (!active) return null;
  
  return (
    <m.div
      className="absolute inset-0 rounded-lg pointer-events-none"
      animate={{
        boxShadow: [
          "0 0 0 0 rgba(59, 130, 246, 0)",
          "0 0 0 4px rgba(59, 130, 246, 0.3)",
          "0 0 0 8px rgba(59, 130, 246, 0)",
        ]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
}