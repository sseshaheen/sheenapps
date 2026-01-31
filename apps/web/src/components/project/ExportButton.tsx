/**
 * Project Export Button Component
 * Handles project source code export with real-time progress tracking
 * Integrates with the backend worker export API
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Download, Package, X, RefreshCw, FileText, Clock, HardDrive } from 'lucide-react';
import { useAuthStore } from '@/store';
import { 
  createExport, 
  getExportStatus, 
  downloadExport, 
  cancelExport,
  pollExportStatus,
  handleExportError 
} from '@/services/project-export-api';
import type { 
  CreateExportResponse, 
  GetExportStatusResponse, 
  ExportButtonProps 
} from '@/types/export';

type ExportUIStatus = 'idle' | 'creating' | 'polling' | 'ready' | 'error';

export function ExportButton({ 
  projectId, 
  userId, 
  versionId, 
  projectName = 'project',
  onExportStart,
  onExportComplete,
  onExportError,
  className 
}: ExportButtonProps) {
  const [status, setStatus] = useState<ExportUIStatus>('idle');
  const [exportJob, setExportJob] = useState<CreateExportResponse | null>(null);
  const [exportStatus, setExportStatus] = useState<GetExportStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [pollCleanup, setPollCleanup] = useState<(() => void) | null>(null);

  // Get user from auth store if not provided
  const { user } = useAuthStore();
  const currentUserId = userId || user?.id;

  const resetState = useCallback(() => {
    setStatus('idle');
    setExportJob(null);
    setExportStatus(null);
    setError(null);
    setProgress(0);
    
    // Clean up polling
    if (pollCleanup) {
      pollCleanup();
      setPollCleanup(null);
    }
  }, [pollCleanup]);

  const startExport = async () => {
    if (!currentUserId) return;
    
    setStatus('creating');
    setError(null);
    onExportStart?.();

    try {
      const exportJob = await createExport(projectId, currentUserId, {
        versionId,
        clientRequestId: crypto.randomUUID(),
      });

      setExportJob(exportJob);
      setStatus('polling');
      
      // Start polling for status
      const cleanup = pollExportStatus(projectId, exportJob.jobId, currentUserId, {
        onProgress: (statusData) => {
          setExportStatus(statusData);
          
          // Calculate progress percentage
          if (statusData.progress.estimatedTotalFiles && statusData.progress.estimatedTotalFiles > 0) {
            const progressPercent = Math.round(
              (statusData.progress.filesScanned / statusData.progress.estimatedTotalFiles) * 100
            );
            setProgress(Math.min(progressPercent, 95)); // Cap at 95% until completed
          }
        },
        onComplete: (downloadUrl) => {
          setStatus('ready');
          setProgress(100);
          setPollCleanup(null);
          onExportComplete?.(downloadUrl);
        },
        onError: (error) => {
          const errorMessage = error.message;
          setError(errorMessage);
          setStatus('error');
          setPollCleanup(null);
          onExportError?.(errorMessage);
        }
      });
      
      setPollCleanup(() => cleanup);
      
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown error';
      setError(errorMessage);
      setStatus('error');
      onExportError?.(errorMessage);
    }
  };

  const downloadFile = async () => {
    if (!exportJob || !currentUserId) return;

    try {
      await downloadExport(projectId, exportJob.jobId, currentUserId);
    } catch (err: any) {
      setError('Download failed: ' + err.message);
    }
  };

  const cancelExportJob = async () => {
    if (!exportJob || !currentUserId) return;

    try {
      await cancelExport(projectId, exportJob.jobId, currentUserId);
      resetState();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const getStatusMessage = (): string => {
    if (!exportStatus) return '';
    
    switch (exportStatus.progress.phase) {
      case 'queued':
        return 'Export queued for processing...';
      case 'scanning':
        return `Scanning files... (${exportStatus.progress.filesScanned} found)`;
      case 'compressing':
        return `Creating ZIP... (${exportStatus.progress.filesScanned}/${exportStatus.progress.estimatedTotalFiles || '?'} files)`;
      case 'uploading':
        return 'Uploading to cloud storage...';
      case 'completed':
        return 'Export ready for download!';
      default:
        return exportStatus.progress.message || 'Processing...';
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
  };

  const formatTimeRemaining = (expiresAt?: string): string => {
    if (!expiresAt) return '';
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollCleanup) {
        pollCleanup();
      }
    };
  }, [pollCleanup]);

  if (!currentUserId) {
    return null; // Don't render if no user
  }

  if (status === 'idle') {
    return (
      <Button 
        onClick={startExport}
        variant="outline"
        className={className}
        disabled={!currentUserId}
      >
        <Package className="w-4 h-4 mr-2" />
        Export Source Code
      </Button>
    );
  }

  if (status === 'creating') {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Creating export job...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'polling' && exportStatus) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Exporting {projectName}</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={cancelExportJob}
              className="text-red-500 hover:text-red-700 h-auto p-1"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription className="text-xs">
            {getStatusMessage()}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {progress > 0 && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {progress}% complete
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {exportStatus.fileCount && (
              <div className="flex items-center space-x-1">
                <FileText className="w-3 h-3" />
                <span>{exportStatus.fileCount} files</span>
              </div>
            )}
            
            {exportStatus.zipSize && (
              <div className="flex items-center space-x-1">
                <HardDrive className="w-3 h-3" />
                <span>{formatFileSize(exportStatus.zipSize)}</span>
              </div>
            )}
            
            {exportStatus.compressionRatio && (
              <Badge variant="secondary" className="text-xs">
                {Math.round(exportStatus.compressionRatio * 100)}% compressed
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'ready' && exportStatus) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-green-600">
            Export Complete!
          </CardTitle>
          <CardDescription className="text-xs">
            {projectName} is ready for download
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-3">
          <Button 
            onClick={downloadFile}
            className="w-full bg-green-500 hover:bg-green-600"
          >
            <Download className="w-4 h-4 mr-2" />
            Download ZIP ({formatFileSize(exportStatus.zipSize)})
          </Button>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center space-x-1">
              <FileText className="w-3 h-3" />
              <span>{exportStatus.fileCount} files</span>
            </div>
            
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Expires in {formatTimeRemaining(exportStatus.expiresAt)}</span>
            </div>
          </div>
          
          <Button 
            variant="ghost"
            size="sm"
            onClick={resetState}
            className="w-full text-xs"
          >
            Create New Export
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card className="w-full max-w-md border-red-200">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <CardTitle className="text-sm font-medium text-red-600">
              Export Failed
            </CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          
          <div className="flex space-x-2">
            <Button 
              onClick={resetState}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
