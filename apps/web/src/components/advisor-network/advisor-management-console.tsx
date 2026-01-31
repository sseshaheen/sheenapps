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
import type { Advisor } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

interface AdvisorManagementConsoleProps {
  translations: {
    admin: {
      advisors: {
        title: string;
        subtitle: string;
        filters: {
          status: string;
          search: string;
        };
        table: {
          advisor: string;
          joinDate: string;
          consultations: string;
          rating: string;
          earnings: string;
          status: string;
          actions: string;
        };
        actions: {
          suspend: string;
          reactivate: string;
          viewProfile: string;
          editProfile: string;
          viewEarnings: string;
        };
        stats: {
          total: string;
          active: string;
          suspended: string;
          avgRating: string;
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

interface AdvisorWithMetrics extends Advisor {
  join_date: string;
  consultation_count: number;
  total_earnings_cents: number;
  is_suspended: boolean;
  last_active: string;
}

// Mock data for development
const mockAdvisors = [
  {
    id: '1',
    user_id: 'user1',
    display_name: 'Sarah Johnson',
    bio: 'Senior React developer with 8 years of experience...',
    avatar_url: '',
    skills: ['React', 'Next.js', 'TypeScript', 'Node.js'],
    specialties: ['Frontend Development', 'Full Stack Development'],
    languages: ['English', 'Spanish'],
    rating: 4.8,
    review_count: 24,
    approval_status: 'approved',
    is_accepting_bookings: true,
    country_code: 'US',
    cal_com_event_type_url: 'https://cal.com/sarah-johnson/consultation',
    stripe_account_id: 'acct_123',
    hourly_rate: 75,
    years_experience: 8,
    timezone: 'America/New_York',
    availability_schedule: 'Monday-Friday 9AM-5PM EST',
    join_date: '2025-01-15T00:00:00Z',
    consultation_count: 24,
    total_earnings_cents: 168000,
    is_suspended: false,
    last_active: '2025-08-25T10:00:00Z'
  },
  {
    id: '2',
    user_id: 'user2',
    display_name: 'Mike Chen',
    bio: 'Full-stack engineer specializing in Python and React...',
    avatar_url: '',
    skills: ['Python', 'Django', 'React', 'PostgreSQL'],
    specialties: ['Backend Development', 'Database Design'],
    languages: ['English', 'Chinese'],
    rating: 4.6,
    review_count: 18,
    approval_status: 'approved',
    is_accepting_bookings: false,
    country_code: 'CA',
    cal_com_event_type_url: 'https://cal.com/mike-chen/consultation',
    stripe_account_id: 'acct_456',
    hourly_rate: 80,
    years_experience: 6,
    timezone: 'America/Toronto',
    availability_schedule: 'Monday-Friday 10AM-6PM EST',
    join_date: '2025-02-01T00:00:00Z',
    consultation_count: 18,
    total_earnings_cents: 126000,
    is_suspended: false,
    last_active: '2025-08-20T14:00:00Z'
  },
  {
    id: '3',
    user_id: 'user3',
    display_name: 'Alex Rodriguez',
    bio: 'DevOps specialist with cloud architecture expertise...',
    avatar_url: '',
    skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform'],
    specialties: ['DevOps & Infrastructure', 'Cloud Architecture'],
    languages: ['English', 'Spanish'],
    rating: 4.2,
    review_count: 8,
    approval_status: 'approved',
    is_accepting_bookings: true,
    country_code: 'MX',
    cal_com_event_type_url: 'https://cal.com/alex-rodriguez/consultation',
    stripe_account_id: 'acct_789',
    hourly_rate: 90,
    years_experience: 10,
    timezone: 'America/Mexico_City',
    availability_schedule: 'Monday-Friday 8AM-4PM CST',
    join_date: '2025-03-10T00:00:00Z',
    consultation_count: 8,
    total_earnings_cents: 56000,
    is_suspended: true,
    last_active: '2025-08-15T09:00:00Z'
  }
];

export function AdvisorManagementConsole({ translations, locale }: AdvisorManagementConsoleProps) {
  const { user, isAuthenticated } = useAuthStore();
  
  const [advisors, setAdvisors] = useState<AdvisorWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: 'suspend' | 'reactivate' | null;
    advisor: AdvisorWithMetrics | null;
    processing: boolean;
  }>({
    open: false,
    type: null,
    advisor: null,
    processing: false
  });

  // Load advisors (mock for now)
  useEffect(() => {
    async function loadAdvisors() {
      if (!isAuthenticated || !user) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('👥 Loading advisors for management console', { userId: user.id.slice(0, 8) });
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        setAdvisors(mockAdvisors as unknown as AdvisorWithMetrics[]);
        
        logger.info('✅ Advisors loaded', { count: mockAdvisors.length });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load advisors';
        setError(errorMessage);
        logger.error('❌ Failed to load advisors:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAdvisors();
  }, [isAuthenticated, user]);

  // Filter advisors
  const filteredAdvisors = advisors.filter(advisor => {
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && !advisor.is_suspended) ||
      (statusFilter === 'suspended' && advisor.is_suspended);
    
    const matchesSearch = !searchQuery || 
      advisor.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      advisor.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase())) ||
      advisor.specialties?.some(spec => spec.label.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesStatus && matchesSearch;
  });

  // Calculate statistics
  const stats = {
    total: advisors.length,
    active: advisors.filter(a => !a.is_suspended).length,
    suspended: advisors.filter(a => a.is_suspended).length,
    avgRating: advisors.length > 0 ? advisors.reduce((sum, a) => sum + a.rating, 0) / advisors.length : 0
  };

  // Handle advisor status change
  const handleStatusChange = async (type: 'suspend' | 'reactivate', advisor: AdvisorWithMetrics) => {
    setActionDialog({ open: true, type, advisor, processing: false });
  };

  const executeStatusChange = async () => {
    if (!actionDialog.advisor || !actionDialog.type) return;

    setActionDialog(prev => ({ ...prev, processing: true }));

    try {
      logger.info('🔄 Changing advisor status', { 
        action: actionDialog.type,
        advisorId: actionDialog.advisor?.id
      });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update advisor status
      setAdvisors(prev => prev.map(a => 
        a.id === actionDialog.advisor?.id 
          ? { ...a, is_suspended: actionDialog.type === 'suspend' }
          : a
      ));

      setActionDialog({ open: false, type: null, advisor: null, processing: false });
      logger.info('✅ Advisor status changed');

    } catch (error) {
      logger.error('❌ Failed to change advisor status:', error);
      setError(error instanceof Error ? error.message : 'Status change failed');
      setActionDialog(prev => ({ ...prev, processing: false }));
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString()}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();
  
  const getAvatarFallback = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

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
              {translations.admin.advisors.stats.active}
            </CardTitle>
            <Icon name="user-check" className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.advisors.stats.suspended}
            </CardTitle>
            <Icon name="user-x" className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.suspended}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.admin.advisors.stats.avgRating}
            </CardTitle>
            <Icon name="star" className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.avgRating.toFixed(1)}</div>
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
                placeholder={translations.admin.advisors.filters.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={translations.admin.advisors.filters.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Advisors</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Advisors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Advisors ({filteredAdvisors.length})</CardTitle>
          <CardDescription>Manage advisor accounts and performance</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAdvisors.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translations.admin.advisors.table.advisor}</TableHead>
                    <TableHead>{translations.admin.advisors.table.joinDate}</TableHead>
                    <TableHead>{translations.admin.advisors.table.consultations}</TableHead>
                    <TableHead>{translations.admin.advisors.table.rating}</TableHead>
                    <TableHead>{translations.admin.advisors.table.earnings}</TableHead>
                    <TableHead>{translations.admin.advisors.table.status}</TableHead>
                    <TableHead className="text-right">{translations.admin.advisors.table.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdvisors.map((advisor) => (
                    <TableRow key={advisor.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                            <AvatarFallback>
                              {getAvatarFallback(advisor.display_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{advisor.display_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {advisor.skills.slice(0, 2).join(', ')}
                              {advisor.skills.length > 2 && ` +${advisor.skills.length - 2}`}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(advisor.join_date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Icon name="calendar" className="h-3 w-3 text-muted-foreground" />
                          {advisor.consultation_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Icon name="star" className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm">{(Number(advisor.rating) || 0).toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({Number(advisor.review_count) || 0})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatCurrency(advisor.total_earnings_cents)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={advisor.is_suspended ? 'destructive' : 'default'}
                            className="capitalize"
                          >
                            {advisor.is_suspended ? 'Suspended' : 'Active'}
                          </Badge>
                          {!advisor.is_accepting_bookings && !advisor.is_suspended && (
                            <Badge variant="secondary" className="text-xs">
                              Not Accepting
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {advisor.is_suspended ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusChange('reactivate', advisor)}
                              className="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <Icon name="user-check" className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusChange('suspend', advisor)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <Icon name="user-x" className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`/advisors/${advisor.user_id}`} target="_blank">
                              <Icon name="eye" className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Icon name="edit" className="h-4 w-4" />
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
              <Icon name="users" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{translations.admin.advisors.empty.title}</h3>
              <p className="text-muted-foreground">{translations.admin.advisors.empty.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Change Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => !actionDialog.processing && setActionDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.type === 'suspend' ? 'Suspend Advisor' : 'Reactivate Advisor'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.type === 'suspend' 
                ? 'This will prevent the advisor from receiving new bookings and make them invisible in search results.'
                : 'This will allow the advisor to receive bookings again and make them visible in search results.'
              }
            </DialogDescription>
          </DialogHeader>

          {actionDialog.advisor && (
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <Avatar className="h-12 w-12">
                <AvatarImage src={actionDialog.advisor.avatar_url} alt={actionDialog.advisor.display_name} />
                <AvatarFallback>
                  {getAvatarFallback(actionDialog.advisor.display_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium">{actionDialog.advisor.display_name}</h3>
                <div className="text-sm text-muted-foreground">
                  {actionDialog.advisor.consultation_count} consultations • {(Number(actionDialog.advisor.rating) || 0).toFixed(1)} rating
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setActionDialog(prev => ({ ...prev, open: false }))}
              disabled={actionDialog.processing}
            >
              {translations.common.cancel}
            </Button>
            <Button
              onClick={executeStatusChange}
              disabled={actionDialog.processing}
              className={cn(
                actionDialog.type === 'suspend' && 'bg-red-600 hover:bg-red-700',
                actionDialog.type === 'reactivate' && 'bg-green-600 hover:bg-green-700'
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
        </DialogContent>
      </Dialog>
    </div>
  );
}