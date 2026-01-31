/**
 * Export Modal Component
 * Full-featured modal dialog for project export functionality
 */

'use client';

import { useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportButton } from './ExportButton';
import { ExportList } from './ExportList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, History, Info, Zap, Download, FileText } from 'lucide-react';
import { useFeedbackOrchestrator } from '@/hooks/useFeedbackOrchestrator';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  userId?: string;
  versionId?: string;
}

export function ExportModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  userId,
  versionId
}: ExportModalProps) {
  const { emitEvent } = useFeedbackOrchestrator();

  // Track export jobs to prevent duplicate feedback
  const exportedJobsRef = useRef<Set<string>>(new Set());

  const handleExportComplete = (downloadUrl: string) => {
    // Emit export success event for feedback integration
    // Use downloadUrl as unique key for idempotency
    const exportKey = downloadUrl;
    if (!exportedJobsRef.current.has(exportKey)) {
      exportedJobsRef.current.add(exportKey);

      // Small delay to let user enjoy the success moment
      setTimeout(() => {
        emitEvent({
          type: 'export_success',
          projectId,
          exportId: exportKey,
        });
      }, 1500);
    }

    // Optional: Auto-close modal after successful export
    // onClose();
  };

  const handleExportError = (error: string) => {
    console.error('Export error:', error);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-blue-500" />
            <span>Export Project</span>
            <Badge variant="outline" className="ml-2">
              {projectName}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Download your project source code as a ZIP file with all assets and dependencies.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <Tabs defaultValue="export" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3 mb-4 flex-shrink-0">
              <TabsTrigger value="export" className="flex items-center space-x-2">
                <Download className="w-4 h-4" />
                <span>New Export</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center space-x-2">
                <History className="w-4 h-4" />
                <span>Export History</span>
              </TabsTrigger>
              <TabsTrigger value="info" className="flex items-center space-x-2">
                <Info className="w-4 h-4" />
                <span>About Exports</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0">
              <TabsContent value="export" className="h-full m-0">
                <div className="space-y-6 h-full">
                  <div className="flex justify-center">
                    <ExportButton
                      projectId={projectId}
                      userId={userId}
                      versionId={versionId}
                      projectName={projectName}
                      onExportComplete={handleExportComplete}
                      onExportError={handleExportError}
                      className="max-w-md"
                    />
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Export Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <h4 className="font-medium flex items-center">
                            <FileText className="w-4 h-4 mr-2 text-blue-500" />
                            What's Included
                          </h4>
                          <ul className="text-muted-foreground space-y-1">
                            <li>• Complete source code</li>
                            <li>• All assets and images</li>
                            <li>• Configuration files</li>
                            <li>• Component structure</li>
                            <li>• Styling and themes</li>
                          </ul>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-medium flex items-center">
                            <Zap className="w-4 h-4 mr-2 text-green-500" />
                            Features
                          </h4>
                          <ul className="text-muted-foreground space-y-1">
                            <li>• Real-time progress tracking</li>
                            <li>• ZIP compression optimization</li>
                            <li>• Secure cloud download</li>
                            <li>• 24-hour availability</li>
                            <li>• Version-specific exports</li>
                          </ul>
                        </div>
                      </div>

                      {versionId && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>Version:</strong> {versionId}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">
                            This export will contain the code from this specific version.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="history" className="h-full m-0">
                <div className="space-y-4 h-full">
                  <div className="text-center text-sm text-muted-foreground">
                    <p>Your recent exports for this project</p>
                  </div>
                  
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <ExportList
                      projectId={projectId}
                      userId={userId}
                      limit={20}
                      onExportSelect={(exportJob) => {
                        console.log('Selected export:', exportJob);
                      }}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="info" className="h-full m-0">
                <div className="space-y-6 h-full overflow-y-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Export Process</CardTitle>
                      <CardDescription>
                        How project exports work and what to expect
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                            1
                          </div>
                          <div>
                            <h4 className="font-medium">File Scanning</h4>
                            <p className="text-sm text-muted-foreground">
                              We scan your project for all source files, assets, and dependencies.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                            2
                          </div>
                          <div>
                            <h4 className="font-medium">ZIP Creation</h4>
                            <p className="text-sm text-muted-foreground">
                              Files are compressed into a ZIP archive with optimized compression.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                            3
                          </div>
                          <div>
                            <h4 className="font-medium">Secure Upload</h4>
                            <p className="text-sm text-muted-foreground">
                              The ZIP file is uploaded to secure cloud storage with a signed URL.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                            ✓
                          </div>
                          <div>
                            <h4 className="font-medium">Ready to Download</h4>
                            <p className="text-sm text-muted-foreground">
                              You'll receive a download link that's valid for 24 hours.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Rate Limits & Quotas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h4 className="font-medium mb-2">Export Limits</h4>
                          <ul className="text-muted-foreground space-y-1">
                            <li>• 10 exports per hour</li>
                            <li>• 50 exports per day</li>
                            <li>• Files expire after 24 hours</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">File Size</h4>
                          <ul className="text-muted-foreground space-y-1">
                            <li>• Typically 1-5 MB compressed</li>
                            <li>• Includes all project assets</li>
                            <li>• Optimized compression ratio</li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}