/**
 * Export List Component
 * Shows user's export history with status, download options, and management
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Download, Clock, FileText, HardDrive, Trash2, RefreshCw, Package } from 'lucide-react';
import { useAuthStore } from '@/store';
import { 
  listExports, 
  getExportStatus, 
  downloadExport, 
  cancelExport 
} from '@/services/project-export-api';
import type { 
  ListExportsResponse, 
  GetExportStatusResponse, 
  ExportListProps 
} from '@/types/export';
import { toast } from 'sonner';

interface ExportItemProps {
  export: ListExportsResponse['exports'][0];
  onDownload: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onRefresh: (jobId: string) => void;
}

function ExportItem({ export: exportItem, onDownload, onCancel, onRefresh }: ExportItemProps) {
  const [detailedStatus, setDetailedStatus] = useState<GetExportStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { user } = useAuthStore();
  
  useEffect(() => {
    // Fetch detailed status for in-progress exports
    if (exportItem.status === 'processing' || exportItem.status === 'queued') {
      fetchDetailedStatus();
    }
  }, [exportItem.jobId, exportItem.status]);

  const fetchDetailedStatus = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const status = await getExportStatus(exportItem.projectId, exportItem.jobId, user.id);
      setDetailedStatus(status);
    } catch (error) {
      console.error('Failed to fetch detailed status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
  };

  const formatRelativeTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'processing': return 'bg-blue-500';
      case 'queued': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'expired': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getProgress = (): number => {
    if (!detailedStatus?.progress) return 0;
    if (detailedStatus.status === 'completed') return 100;
    
    const { filesScanned, estimatedTotalFiles } = detailedStatus.progress;
    if (estimatedTotalFiles && estimatedTotalFiles > 0) {
      return Math.round((filesScanned / estimatedTotalFiles) * 95); // Cap at 95% until completed
    }
    return 0;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Badge className={getStatusColor(exportItem.status)}>
              {exportItem.status}
            </Badge>
            <span className="text-sm font-mono">
              {exportItem.jobId.slice(0, 8)}
            </span>
            {exportItem.versionId && (
              <span className="text-xs text-muted-foreground">
                v{exportItem.versionId}
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-1">
            {(exportItem.status === 'processing' || exportItem.status === 'queued') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRefresh(exportItem.jobId)}
                disabled={isLoading}
                className="h-auto p-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(exportItem.createdAt)}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Progress bar for in-progress exports */}
        {detailedStatus && (exportItem.status === 'processing' || exportItem.status === 'queued') && (
          <div className="space-y-2">
            <Progress value={getProgress()} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {detailedStatus.progress.phase === 'scanning' && 
                `Scanning files... (${detailedStatus.progress.filesScanned} found)`}
              {detailedStatus.progress.phase === 'compressing' && 
                `Creating ZIP... (${detailedStatus.progress.filesScanned}/${detailedStatus.progress.estimatedTotalFiles || '?'} files)`}
              {detailedStatus.progress.phase === 'uploading' && 'Uploading to cloud storage...'}
              {detailedStatus.progress.phase === 'queued' && 'Queued for processing...'}
            </p>
          </div>
        )}

        {/* File info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {exportItem.fileCount && (
            <div className="flex items-center space-x-1">
              <FileText className="w-3 h-3" />
              <span>{exportItem.fileCount} files</span>
            </div>
          )}
          
          {exportItem.zipSize && (
            <div className="flex items-center space-x-1">
              <HardDrive className="w-3 h-3" />
              <span>{formatFileSize(exportItem.zipSize)}</span>
            </div>
          )}
          
          {exportItem.expiresAt && exportItem.status === 'completed' && (
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>
                Expires {formatRelativeTime(exportItem.expiresAt)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          {exportItem.status === 'completed' && (
            <Button
              size="sm"
              onClick={() => onDownload(exportItem.jobId)}
              className="flex-1"
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
          )}
          
          {(exportItem.status === 'processing' || exportItem.status === 'queued') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(exportItem.jobId)}
              className="flex-1"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          )}
          
          {exportItem.status === 'failed' && (
            <div className="flex items-center text-red-500 text-xs">
              <AlertCircle className="w-3 h-3 mr-1" />
              Export failed
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ExportList({ 
  projectId, 
  userId, 
  limit = 25,
  onExportSelect 
}: ExportListProps) {
  const [exports, setExports] = useState<ListExportsResponse['exports']>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuthStore();
  const currentUserId = userId || user?.id;

  useEffect(() => {
    if (currentUserId) {
      loadExports();
    }
  }, [currentUserId, projectId]);

  const loadExports = async (offset = 0, append = false) => {
    if (!currentUserId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await listExports(currentUserId, {
        projectId,
        limit,
        offset
      });
      
      setExports(prev => append ? [...prev, ...result.exports] : result.exports);
      setHasMore(result.hasMore);
    } catch (error: any) {
      console.error('Failed to load exports:', error);
      setError(error.message || 'Failed to load exports');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (jobId: string) => {
    if (!currentUserId) return;
    
    try {
      await downloadExport(projectId!, jobId, currentUserId);
      toast.success("Download started", {
        description: "Your export file is being downloaded.",
      });
    } catch (error: any) {
      toast.error("Download failed", {
        description: error.message,
      });
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!currentUserId) return;
    
    try {
      await cancelExport(projectId!, jobId, currentUserId);
      toast.success("Export cancelled", {
        description: "The export job has been cancelled.",
      });
      
      // Refresh the list
      loadExports();
    } catch (error: any) {
      toast.error("Cancel failed", {
        description: error.message,
      });
    }
  };

  const handleRefresh = async (jobId: string) => {
    // Refresh the list to get updated status
    loadExports();
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      loadExports(exports.length, true);
    }
  };

  if (!currentUserId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please log in to view exports
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 mb-3">{error}</p>
            <Button onClick={() => loadExports()} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && exports.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading exports...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (exports.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-1">No exports yet</p>
            <p className="text-xs text-muted-foreground">
              Create your first export to see it here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {exports.map((exportItem) => (
          <ExportItem
            key={exportItem.jobId}
            export={exportItem}
            onDownload={handleDownload}
            onCancel={handleCancel}
            onRefresh={handleRefresh}
          />
        ))}
      </div>
      
      {hasMore && (
        <div className="text-center">
          <Button
            onClick={loadMore}
            variant="outline"
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}