'use client'

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { getAdvisorApplicationsAction, reviewAdvisorApplicationAction } from '@/lib/actions/advisor-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Advisor } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

interface AdvisorApplicationsConsoleProps {
  translations: {
    admin: {
      advisors: {
        title: string;
        subtitle: string;
        tabs: {
          pending: string;
          approved: string;
          rejected: string;
          all: string;
        };
        table: {
          applicant: string;
          appliedDate: string;
          experience: string;
          skills: string;
          status: string;
          actions: string;
        };
        actions: {
          approve: string;
          reject: string;
          viewProfile: string;
          addNotes: string;
        };
        stats: {
          total: string;
          pending: string;
          approved: string;
          rejected: string;
        };
        review: {
          title: string;
          approveConfirm: string;
          rejectConfirm: string;
          adminNotes: string;
          adminNotesPlaceholder: string;
        };
        empty: {
          title: string;
          description: string;
        };
      };
    };
    common: {
      loading: string;
      error: string;
      success: string;
      confirm: string;
      cancel: string;
    };
  };
  locale: string;
}

interface AdvisorApplication extends Advisor {
  applied_date: string;
  admin_notes?: string;
}

type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export function AdvisorApplicationsConsole({ translations, locale }: AdvisorApplicationsConsoleProps) {
  const { user, isAuthenticated } = useAuthStore();
  
  const [applications, setApplications] = useState<AdvisorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicationStatus | 'all'>('pending');
  
  // Review dialog state
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    application: AdvisorApplication | null;
    action: 'approve' | 'reject' | null;
    adminNotes: string;
    submitting: boolean;
  }>({
    open: false,
    application: null,
    action: null,
    adminNotes: '',
    submitting: false
  });

  // Load applications
  useEffect(() => {
    async function loadApplications() {
      if (!isAuthenticated || !user) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('📋 Loading advisor applications for admin review', { userId: user.id.slice(0, 8) });
        
        const result = await getAdvisorApplicationsAction();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load applications');
        }

        if (!result.data) {
          throw new Error('No application data received');
        }

        // Mock data transformation since we don't have the full backend
        const mockApplications: AdvisorApplication[] = result.data.map((app: any) => ({
          ...app,
          applied_date: app.applied_date || new Date().toISOString(),
          admin_notes: app.admin_notes || ''
        }));

        setApplications(mockApplications);
        logger.info('✅ Advisor applications loaded', { count: mockApplications.length });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load applications';
        setError(errorMessage);
        logger.error('❌ Failed to load advisor applications:', error);
      } finally {
        setLoading(false);
      }
    }

    if (!loading) {
      loadApplications();
    }
  }, [isAuthenticated, user]);

  // Handle application review
  const handleReviewSubmit = async () => {
    if (!reviewDialog.application || !reviewDialog.action) return;

    setReviewDialog(prev => ({ ...prev, submitting: true }));

    try {
      logger.info('📝 Reviewing advisor application', { 
        advisorId: reviewDialog.application?.id,
        action: reviewDialog.action
      });
      
      const result = await reviewAdvisorApplicationAction(
        reviewDialog.application.id,
        reviewDialog.action,
        reviewDialog.adminNotes.trim() || undefined
      );
      
      if (!result.success) {
        throw new Error(result.error || `Failed to ${reviewDialog.action} application`);
      }

      // Update local state
      setApplications(prev => 
        prev.map(app => 
          app.id === reviewDialog.application?.id 
            ? { 
                ...app, 
                approval_status: reviewDialog.action === 'approve' ? 'approved' : 'rejected',
                admin_notes: reviewDialog.adminNotes.trim()
              }
            : app
        )
      );

      // Close dialog
      setReviewDialog({
        open: false,
        application: null,
        action: null,
        adminNotes: '',
        submitting: false
      });

      logger.info('✅ Advisor application reviewed successfully');

    } catch (error) {
      logger.error('❌ Failed to review advisor application:', error);
      setError(error instanceof Error ? error.message : 'Failed to review application');
      setReviewDialog(prev => ({ ...prev, submitting: false }));
    }
  };

  // Open review dialog
  const openReviewDialog = (application: AdvisorApplication, action: 'approve' | 'reject') => {
    setReviewDialog({
      open: true,
      application,
      action,
      adminNotes: application.admin_notes || '',
      submitting: false
    });
  };

  // Filter applications by status
  const filteredApplications = applications.filter(app => {
    if (activeTab === 'all') return true;
    return app.approval_status === activeTab;
  });

  // Calculate statistics
  const stats = {
    total: applications.length,
    pending: applications.filter(app => app.approval_status === 'pending').length,
    approved: applications.filter(app => app.approval_status === 'approved').length,
    rejected: applications.filter(app => app.approval_status === 'rejected').length
  };

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="flex flex-col items-center gap-4">
            <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{translations.common.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && applications.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="alert-circle" className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load applications</h2>
            <p className="text-muted-foreground mb-6 text-center">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();
  const getAvatarFallback = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{translations.admin.advisors.title}</h1>
        <p className="text-muted-foreground">{translations.admin.advisors.subtitle}</p>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <Icon name="alert-circle" className="h-5 w-5 text-destructive" />
            <p className="text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.advisors.stats.total}
            </CardTitle>
            <Icon name="users" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.advisors.stats.pending}
            </CardTitle>
            <Icon name="clock" className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.advisors.stats.approved}
            </CardTitle>
            <Icon name="check-circle" className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.advisors.stats.rejected}
            </CardTitle>
            <Icon name="x" className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Applications</CardTitle>
          <CardDescription>Review and manage advisor applications</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pending">{translations.admin.advisors.tabs.pending} ({stats.pending})</TabsTrigger>
              <TabsTrigger value="approved">{translations.admin.advisors.tabs.approved} ({stats.approved})</TabsTrigger>
              <TabsTrigger value="rejected">{translations.admin.advisors.tabs.rejected} ({stats.rejected})</TabsTrigger>
              <TabsTrigger value="all">{translations.admin.advisors.tabs.all} ({stats.total})</TabsTrigger>
            </TabsList>

            {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
              <TabsContent key={status} value={status} className="mt-6">
                {filteredApplications.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{translations.admin.advisors.table.applicant}</TableHead>
                          <TableHead>{translations.admin.advisors.table.appliedDate}</TableHead>
                          <TableHead>{translations.admin.advisors.table.experience}</TableHead>
                          <TableHead>{translations.admin.advisors.table.skills}</TableHead>
                          <TableHead>{translations.admin.advisors.table.status}</TableHead>
                          <TableHead className="text-right">{translations.admin.advisors.table.actions}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApplications.map((application) => (
                          <TableRow key={application.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={application.avatar_url} alt={application.display_name} />
                                  <AvatarFallback className="text-xs">
                                    {getAvatarFallback(application.display_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{application.display_name}</p>
                                  <p className="text-xs text-muted-foreground">{application.country_code}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDate(application.applied_date)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(application.years_experience || (application as any).experience_years) ? `${application.years_experience || (application as any).experience_years} years` : 'Not specified'}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-48">
                                {application.skills.slice(0, 3).map((skill, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                                {application.skills.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{application.skills.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  application.approval_status === 'approved' ? 'default' :
                                  application.approval_status === 'rejected' ? 'destructive' :
                                  'secondary'
                                }
                                className="capitalize"
                              >
                                {application.approval_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {application.approval_status === 'pending' && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openReviewDialog(application, 'approve')}
                                      className="text-green-600 border-green-200 hover:bg-green-50"
                                    >
                                      <Icon name="check" className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openReviewDialog(application, 'reject')}
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                    >
                                      <Icon name="x" className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="sm">
                                  <Icon name="eye" className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Icon name="mail" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{translations.admin.advisors.empty.title}</h3>
                    <p className="text-muted-foreground">{translations.admin.advisors.empty.description}</p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialog.open} onOpenChange={(open) => !reviewDialog.submitting && setReviewDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translations.admin.advisors.review.title}</DialogTitle>
            <DialogDescription>
              {reviewDialog.action === 'approve' 
                ? translations.admin.advisors.review.approveConfirm
                : translations.admin.advisors.review.rejectConfirm
              }
            </DialogDescription>
          </DialogHeader>

          {reviewDialog.application && (
            <div className="space-y-4">
              {/* Application Summary */}
              <div className="flex items-center gap-3 p-4 rounded-lg border">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={reviewDialog.application.avatar_url} alt={reviewDialog.application.display_name} />
                  <AvatarFallback>
                    {getAvatarFallback(reviewDialog.application.display_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-medium">{reviewDialog.application.display_name}</h3>
                  <p className="text-sm text-muted-foreground">{reviewDialog.application.country_code}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {reviewDialog.application.skills.slice(0, 5).map((skill, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Admin Notes */}
              <div>
                <Label htmlFor="admin-notes">{translations.admin.advisors.review.adminNotes}</Label>
                <Textarea
                  id="admin-notes"
                  value={reviewDialog.adminNotes}
                  onChange={(e) => setReviewDialog(prev => ({ ...prev, adminNotes: e.target.value }))}
                  placeholder={translations.admin.advisors.review.adminNotesPlaceholder}
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setReviewDialog(prev => ({ ...prev, open: false }))}
              disabled={reviewDialog.submitting}
            >
              {translations.common.cancel}
            </Button>
            <Button
              onClick={handleReviewSubmit}
              disabled={reviewDialog.submitting}
              className={cn(
                reviewDialog.action === 'approve' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
              )}
            >
              {reviewDialog.submitting ? (
                <>
                  <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                  Processing...
                </>
              ) : (
                translations.common.confirm
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}