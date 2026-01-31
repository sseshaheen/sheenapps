'use client'

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

interface AdvisorConsultationsConsoleProps {
  translations: {
    admin: {
      consultations: {
        title: string;
        subtitle: string;
        filters: {
          status: string;
          advisor: string;
          dateRange: string;
          search: string;
        };
        table: {
          consultation: string;
          advisor: string;
          client: string;
          date: string;
          duration: string;
          status: string;
          revenue: string;
          actions: string;
        };
        actions: {
          refund: string;
          markNoShow: string;
          viewDetails: string;
          contactClient: string;
          contactAdvisor: string;
        };
        stats: {
          total: string;
          completed: string;
          cancelled: string;
          revenue: string;
          refunded: string;
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

interface Consultation {
  id: string;
  advisor: {
    id: string;
    name: string;
    avatar?: string;
  };
  client: {
    id: string;
    name: string;
    avatar?: string;
  };
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  price_cents: number;
  platform_fee_cents: number;
  advisor_earnings_cents: number;
  notes?: string;
  refunded: boolean;
  refund_amount_cents?: number;
}

// Mock data for development
const mockConsultations: Consultation[] = [
  {
    id: '1',
    advisor: { id: 'adv1', name: 'Sarah Johnson', avatar: '' },
    client: { id: 'cli1', name: 'John D.', avatar: '' },
    scheduled_at: '2025-08-25T14:00:00Z',
    duration_minutes: 60,
    status: 'completed',
    price_cents: 3500,
    platform_fee_cents: 1050,
    advisor_earnings_cents: 2450,
    refunded: false
  },
  {
    id: '2',
    advisor: { id: 'adv2', name: 'Mike Chen', avatar: '' },
    client: { id: 'cli2', name: 'Emma S.', avatar: '' },
    scheduled_at: '2025-08-26T10:30:00Z',
    duration_minutes: 30,
    status: 'no_show',
    price_cents: 1900,
    platform_fee_cents: 570,
    advisor_earnings_cents: 1330,
    refunded: false
  },
  {
    id: '3',
    advisor: { id: 'adv1', name: 'Sarah Johnson', avatar: '' },
    client: { id: 'cli3', name: 'Alex R.', avatar: '' },
    scheduled_at: '2025-08-24T16:00:00Z',
    duration_minutes: 15,
    status: 'cancelled',
    price_cents: 900,
    platform_fee_cents: 270,
    advisor_earnings_cents: 630,
    refunded: true,
    refund_amount_cents: 900
  }
];

export function AdvisorConsultationsConsole({ translations, locale }: AdvisorConsultationsConsoleProps) {
  const { user, isAuthenticated } = useAuthStore();
  
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [advisorFilter, setAdvisorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: 'refund' | 'no-show' | 'details' | null;
    consultation: Consultation | null;
    processing: boolean;
  }>({
    open: false,
    type: null,
    consultation: null,
    processing: false
  });

  // Load consultations (mock for now)
  useEffect(() => {
    async function loadConsultations() {
      if (!isAuthenticated || !user) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('📊 Loading consultations for admin review', { userId: user.id.slice(0, 8) });
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        setConsultations(mockConsultations);
        
        logger.info('✅ Consultations loaded', { count: mockConsultations.length });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load consultations';
        setError(errorMessage);
        logger.error('❌ Failed to load consultations:', error);
      } finally {
        setLoading(false);
      }
    }

    loadConsultations();
  }, [isAuthenticated, user]);

  // Filter consultations
  const filteredConsultations = consultations.filter(consultation => {
    const matchesStatus = statusFilter === 'all' || consultation.status === statusFilter;
    const matchesAdvisor = advisorFilter === 'all' || consultation.advisor.id === advisorFilter;
    const matchesSearch = !searchQuery || 
      consultation.advisor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      consultation.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      consultation.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesAdvisor && matchesSearch;
  });

  // Calculate statistics
  const stats = {
    total: consultations.length,
    completed: consultations.filter(c => c.status === 'completed').length,
    cancelled: consultations.filter(c => c.status === 'cancelled').length,
    revenue: consultations.reduce((sum, c) => sum + c.price_cents, 0),
    refunded: consultations.filter(c => c.refunded).reduce((sum, c) => sum + (c.refund_amount_cents || 0), 0)
  };

  // Handle action
  const handleAction = async (type: 'refund' | 'no-show', consultation: Consultation) => {
    setActionDialog({ open: true, type, consultation, processing: false });
  };

  const executeAction = async () => {
    if (!actionDialog.consultation || !actionDialog.type) return;

    setActionDialog(prev => ({ ...prev, processing: true }));

    try {
      logger.info('🔄 Executing consultation action', { 
        action: actionDialog.type,
        consultationId: actionDialog.consultation?.id
      });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (actionDialog.type === 'refund') {
        // Update consultation as refunded
        setConsultations(prev => prev.map(c => 
          c.id === actionDialog.consultation?.id 
            ? { ...c, refunded: true, refund_amount_cents: c.price_cents }
            : c
        ));
      } else if (actionDialog.type === 'no-show') {
        // Update consultation status
        setConsultations(prev => prev.map(c => 
          c.id === actionDialog.consultation?.id 
            ? { ...c, status: 'no_show' as const }
            : c
        ));
      }

      setActionDialog({ open: false, type: null, consultation: null, processing: false });
      logger.info('✅ Consultation action completed');

    } catch (error) {
      logger.error('❌ Failed to execute consultation action:', error);
      setError(error instanceof Error ? error.message : 'Action failed');
      setActionDialog(prev => ({ ...prev, processing: false }));
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();
  const getStatusColor = (status: Consultation['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      case 'no_show': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{translations.admin.consultations.title}</h1>
        <p className="text-muted-foreground">{translations.admin.consultations.subtitle}</p>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.consultations.stats.total}
            </CardTitle>
            <Icon name="calendar" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.consultations.stats.completed}
            </CardTitle>
            <Icon name="check-circle" className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.consultations.stats.cancelled}
            </CardTitle>
            <Icon name="x-circle" className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.consultations.stats.revenue}
            </CardTitle>
            <Icon name="dollar-sign" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.revenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.consultations.stats.refunded}
            </CardTitle>
            <Icon name="undo" className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.refunded)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <Input
                placeholder={translations.admin.consultations.filters.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={translations.admin.consultations.filters.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>

            <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={translations.admin.consultations.filters.advisor} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Advisors</SelectItem>
                {Array.from(new Set(consultations.map(c => c.advisor.id))).map(advisorId => {
                  const advisor = consultations.find(c => c.advisor.id === advisorId)?.advisor;
                  return advisor ? (
                    <SelectItem key={advisorId} value={advisorId}>{advisor.name}</SelectItem>
                  ) : null;
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Consultations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Consultations ({filteredConsultations.length})</CardTitle>
          <CardDescription>Manage all advisor consultations and resolve issues</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredConsultations.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translations.admin.consultations.table.consultation}</TableHead>
                    <TableHead>{translations.admin.consultations.table.advisor}</TableHead>
                    <TableHead>{translations.admin.consultations.table.client}</TableHead>
                    <TableHead>{translations.admin.consultations.table.date}</TableHead>
                    <TableHead>{translations.admin.consultations.table.duration}</TableHead>
                    <TableHead>{translations.admin.consultations.table.status}</TableHead>
                    <TableHead>{translations.admin.consultations.table.revenue}</TableHead>
                    <TableHead className="text-right">{translations.admin.consultations.table.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConsultations.map((consultation) => (
                    <TableRow key={consultation.id}>
                      <TableCell className="font-mono text-sm">
                        {consultation.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={consultation.advisor.avatar} alt={consultation.advisor.name} />
                            <AvatarFallback className="text-xs">
                              {consultation.advisor.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{consultation.advisor.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={consultation.client.avatar} alt={consultation.client.name} />
                            <AvatarFallback className="text-xs">
                              {consultation.client.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{consultation.client.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(consultation.scheduled_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {consultation.duration_minutes}min
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('capitalize', getStatusColor(consultation.status))}>
                          {consultation.status.replace('_', ' ')}
                        </Badge>
                        {consultation.refunded && (
                          <Badge variant="outline" className="ml-2 text-orange-600 border-orange-200">
                            Refunded
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{formatCurrency(consultation.price_cents)}</div>
                          <div className="text-xs text-muted-foreground">
                            Platform: {formatCurrency(consultation.platform_fee_cents)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!consultation.refunded && consultation.status !== 'no_show' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction('refund', consultation)}
                              className="text-orange-600 hover:text-orange-700"
                            >
                              <Icon name="undo" className="h-4 w-4" />
                            </Button>
                          )}
                          {consultation.status === 'scheduled' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction('no-show', consultation)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Icon name="user-x" className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionDialog({ 
                              open: true, 
                              type: 'details', 
                              consultation, 
                              processing: false 
                            })}
                          >
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
              <Icon name="calendar-off" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{translations.admin.consultations.empty.title}</h3>
              <p className="text-muted-foreground">{translations.admin.consultations.empty.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => !actionDialog.processing && setActionDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.type === 'refund' && 'Issue Refund'}
              {actionDialog.type === 'no-show' && 'Mark as No-Show'}
              {actionDialog.type === 'details' && 'Consultation Details'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.type === 'refund' && 'Issue a full refund for this consultation?'}
              {actionDialog.type === 'no-show' && 'Mark this consultation as a no-show?'}
              {actionDialog.type === 'details' && 'View detailed consultation information'}
            </DialogDescription>
          </DialogHeader>

          {actionDialog.consultation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Consultation ID:</span>
                  <p className="font-mono">{actionDialog.consultation.id}</p>
                </div>
                <div>
                  <span className="font-medium">Total Amount:</span>
                  <p>{formatCurrency(actionDialog.consultation.price_cents)}</p>
                </div>
                <div>
                  <span className="font-medium">Advisor:</span>
                  <p>{actionDialog.consultation.advisor.name}</p>
                </div>
                <div>
                  <span className="font-medium">Client:</span>
                  <p>{actionDialog.consultation.client.name}</p>
                </div>
              </div>
              
              {actionDialog.consultation.notes && (
                <div>
                  <span className="font-medium text-sm">Notes:</span>
                  <p className="text-sm text-muted-foreground">{actionDialog.consultation.notes}</p>
                </div>
              )}
            </div>
          )}

          {actionDialog.type !== 'details' && (
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setActionDialog(prev => ({ ...prev, open: false }))}
                disabled={actionDialog.processing}
              >
                {translations.common.cancel}
              </Button>
              <Button
                onClick={executeAction}
                disabled={actionDialog.processing}
                className={cn(
                  actionDialog.type === 'refund' && 'bg-orange-600 hover:bg-orange-700',
                  actionDialog.type === 'no-show' && 'bg-red-600 hover:bg-red-700'
                )}
              >
                {actionDialog.processing ? (
                  <>
                    <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  translations.common.confirm
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}