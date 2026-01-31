
'use client';

import { ConnectSupabase } from '@/components/integrations/connect-supabase';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getSupabaseConnectionStatus } from '@/lib/actions/supabase-oauth-actions';
import { logger } from '@/utils/logger';
import { useEffect, useState } from 'react';

// Feature flag for Supabase OAuth integration
// eslint-disable-next-line no-restricted-globals
const ENABLE_SUPABASE_OAUTH = process.env.NEXT_PUBLIC_ENABLE_SUPABASE_OAUTH === 'true';

interface SupabaseDatabaseButtonProps {
  projectId: string;
  projectName: string;
  className?: string;
  compact?: boolean; // For mobile header
}

type ConnectionState = 'unknown' | 'not-connected' | 'connecting' | 'connected' | 'error' | 'expired';

interface ConnectionStatus {
  connected: boolean;
  status: string;
  connectionId?: string;
  expiresAt?: string;
  isExpired: boolean;
  error?: string;
}

export function SupabaseDatabaseButton({
  projectId,
  projectName,
  className,
  compact = false
}: SupabaseDatabaseButtonProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('unknown');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Check connection status on mount and periodically
  useEffect(() => {
    if (!ENABLE_SUPABASE_OAUTH) {
      setConnectionState('not-connected');
      return;
    }

    checkConnectionStatus();

    // Poll every 30 seconds when modal is closed
    const interval = setInterval(() => {
      if (!isModalOpen) {
        checkConnectionStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [projectId, isModalOpen]);

  const checkConnectionStatus = async () => {
    if (isChecking) return;

    try {
      setIsChecking(true);
      const status = await getSupabaseConnectionStatus(projectId);

      // ✅ CRITICAL FIX: Check if status exists before using 'in' operator
      if (!status) {
        logger.error('getSupabaseConnectionStatus returned undefined/null', { projectId });
        setConnectionState('error');
        setConnectionStatus({ connected: false, status: 'error', isExpired: false, error: 'No response from connection status check' });
        return;
      }

      if ('error' in status) {
        setConnectionState('error');
        setConnectionStatus({ connected: false, status: 'error', isExpired: false, error: status.error });
        return;
      }

      if (status) {
        setConnectionStatus(status);

        // Determine connection state based on status
        if (!status.connected) {
          setConnectionState('not-connected');
        } else if (status.isExpired) {
          setConnectionState('expired');
        } else {
          setConnectionState('connected');
        }
      } else {
        // Handle case where status is undefined
        setConnectionState('error');
        setConnectionStatus({ connected: false, status: 'error', isExpired: false, error: 'No status returned' });
      }

    } catch (error) {
      logger.error('Failed to check Supabase connection status:', error);
      setConnectionState('error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleButtonClick = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    // Refresh status when modal closes in case connection changed
    setTimeout(() => checkConnectionStatus(), 1000);
  };

  // Return null if feature is disabled
  if (!ENABLE_SUPABASE_OAUTH) {
    return null;
  }

  // Get button configuration based on connection state
  const getButtonConfig = () => {
    switch (connectionState) {
      case 'unknown':
        return {
          icon: 'database',
          iconColor: 'text-muted-foreground',
          tooltip: 'Checking database connection...',
          badge: null,
          disabled: true
        };

      case 'not-connected':
        return {
          icon: 'database',
          iconColor: 'text-muted-foreground',
          tooltip: 'Connect Database - Click to connect your Supabase database',
          badge: null,
          disabled: false
        };

      case 'connecting':
        return {
          icon: 'loader-2',
          iconColor: 'text-blue-600 animate-spin',
          tooltip: 'Connecting to database...',
          badge: null,
          disabled: true
        };

      case 'connected':
        return {
          icon: 'database',
          iconColor: 'text-green-600',
          tooltip: `Database Connected - ${connectionStatus?.connectionId ? 'Active' : 'Ready'} • Click to manage`,
          badge: { text: '●', color: 'bg-green-500' },
          disabled: false
        };

      case 'error':
        return {
          icon: 'database',
          iconColor: 'text-red-600',
          tooltip: 'Database Connection Issue - Click to reconnect',
          badge: { text: '!', color: 'bg-red-500' },
          disabled: false
        };

      case 'expired':
        return {
          icon: 'database',
          iconColor: 'text-yellow-600',
          tooltip: 'Database Connection Expired - Click to renew',
          badge: { text: '⏰', color: 'bg-yellow-500' },
          disabled: false
        };

      default:
        return {
          icon: 'database',
          iconColor: 'text-muted-foreground',
          tooltip: 'Database',
          badge: null,
          disabled: false
        };
    }
  };

  const config = getButtonConfig();

  return (
    <>
      <div className={`relative ${className}`}>
        <Button
          variant="workspace"
          size="sm"
          onClick={handleButtonClick}
          disabled={config.disabled}
          className={`group relative transition-all duration-200 ease-out ${
            config.disabled
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:bg-gray-800 hover:scale-105 hover:shadow-lg hover:shadow-gray-900/20 hover:border-gray-600/50'
          }`}
          title={config.tooltip}
        >
          <Icon
            name={config.icon as any}
            className={cn(
              "w-4 h-4 transition-colors duration-200 group-hover:text-white",
              config.iconColor,
              !compact && "me-2" // spacing only when label exists
            )}
          />
          {compact ? null : (
            <span className="hidden lg:inline whitespace-nowrap transition-colors duration-200 group-hover:text-white">
              Database
            </span>
          )}
        </Button>

        {/* Status Badge */}
        {config.badge && (
          <div className={`absolute -top-1 -right-1 ${config.badge.color} text-white text-[10px] min-w-[16px] h-4 rounded-full flex items-center justify-center font-medium`}>
            {config.badge.text}
          </div>
        )}
      </div>

      {/* Database Management Modal */}
      <Sheet open={isModalOpen} onOpenChange={setIsModalOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon name="database" className="h-5 w-5 text-green-600" />
              Database Integration
            </SheetTitle>
            <SheetDescription>
              Configure database connection for <strong>{projectName}</strong>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            <ConnectSupabase
              projectId={projectId}
              className="border-0 shadow-none bg-transparent p-0"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Hook for managing Supabase connection status
 * Can be used by other components that need connection state
 */
export function useSupabaseConnectionStatus(projectId: string) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('unknown');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkStatus = async () => {
    if (!ENABLE_SUPABASE_OAUTH || isLoading) return;

    try {
      setIsLoading(true);
      const status = await getSupabaseConnectionStatus(projectId);

      // Null-guard: check if status exists before using 'in' operator
      if (!status) {
        setConnectionState('error');
        setConnectionStatus({ connected: false, status: 'error', isExpired: false, error: 'No response from connection status check' });
        return;
      }

      if ('error' in status) {
        setConnectionState('error');
        setConnectionStatus({ connected: false, status: 'error', isExpired: false, error: status.error });
        return;
      }

      setConnectionStatus(status);

      if (!status.connected) {
        setConnectionState('not-connected');
      } else if (status.isExpired) {
        setConnectionState('expired');
      } else {
        setConnectionState('connected');
      }

    } catch (error) {
      logger.error('Failed to check Supabase connection status:', error);
      setConnectionState('error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [projectId]);

  return {
    connectionState,
    connectionStatus,
    isLoading,
    refresh: checkStatus
  };
}
