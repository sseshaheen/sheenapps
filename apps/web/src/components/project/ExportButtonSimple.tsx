/**
 * Simple Export Button Component
 * Minimal export button for toolbar/menu usage
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Package, Download, MoreVertical } from 'lucide-react';
import { useAuthStore } from '@/store';
import { createExport, downloadExport } from '@/services/project-export-api';
import { useToastWithUndo } from '@/components/ui/toast-with-undo';

interface ExportButtonSimpleProps {
  projectId: string;
  userId?: string;
  versionId?: string;
  variant?: 'button' | 'menu-item';
  size?: 'sm' | 'default';
  className?: string;
}

export function ExportButtonSimple({ 
  projectId, 
  userId, 
  versionId,
  variant = 'button',
  size = 'default',
  className 
}: ExportButtonSimpleProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { user } = useAuthStore();
  const { success: showSuccessToast, error: showErrorToast } = useToastWithUndo();
  const currentUserId = userId || user?.id;

  if (!currentUserId) return null;

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      showSuccessToast("Starting export...", "Your project export is being prepared.");

      // Create export job
      const exportJob = await createExport(projectId, currentUserId, {
        versionId,
        clientRequestId: crypto.randomUUID(),
      });

      showSuccessToast("Export created!", `Export job ${exportJob.jobId.slice(0, 8)} has been queued. You'll be notified when it's ready.`);

      // For simple version, we could either:
      // 1. Show a notification and let user check status elsewhere
      // 2. Poll once and show download link if ready quickly
      // For now, we'll just show the success message

    } catch (error: any) {
      console.error('Export failed:', error);
      
      showErrorToast("Export failed", error.message || "Unable to start export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (variant === 'menu-item') {
    return (
      <DropdownMenuItem
        onClick={handleExport}
        disabled={isExporting}
        className={className}
      >
        <Package className="w-4 h-4 mr-2" />
        {isExporting ? 'Exporting...' : 'Export Source Code'}
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant="outline"
      size={size}
      className={className}
      data-testid="export-button"
    >
      <Package className="w-4 h-4 mr-2" />
      {isExporting ? 'Exporting...' : 'Export'}
    </Button>
  );
}

/**
 * Export Menu with Recent Exports
 * Dropdown menu showing export options and recent exports
 */
interface ExportMenuProps {
  projectId: string;
  userId?: string;
  versionId?: string;
  className?: string;
}

export function ExportMenu({ 
  projectId, 
  userId, 
  versionId, 
  className 
}: ExportMenuProps) {
  const { user } = useAuthStore();
  const { success: showSuccessToast, error: showErrorToast } = useToastWithUndo();
  const currentUserId = userId || user?.id;

  if (!currentUserId) return null;

  const handleNewExport = async () => {
    try {
      const exportJob = await createExport(projectId, currentUserId, {
        versionId,
        clientRequestId: crypto.randomUUID(),
      });

      showSuccessToast("Export started", `Export job created: ${exportJob.jobId.slice(0, 8)}`);
    } catch (error: any) {
      showErrorToast("Export failed", error.message);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className} data-testid="export-menu-button">
          <Package className="w-4 h-4 mr-2" />
          Export
          <MoreVertical className="w-3 h-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleNewExport}>
          <Package className="w-4 h-4 mr-2" />
          New Export
        </DropdownMenuItem>
        
        <DropdownMenuItem disabled>
          <Download className="w-4 h-4 mr-2" />
          Recent Exports
          <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}