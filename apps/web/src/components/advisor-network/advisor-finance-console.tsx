'use client'

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

interface AdvisorFinanceConsoleProps {
  translations: {
    admin: {
      finance: {
        title: string;
        subtitle: string;
        revenue: {
          title: string;
          thisMonth: string;
          lastMonth: string;
          growth: string;
          total: string;
        };
        payouts: {
          title: string;
          pending: string;
          processed: string;
          export: string;
          process: string;
          table: {
            advisor: string;
            amount: string;
            period: string;
            consultations: string;
            status: string;
            actions: string;
          };
        };
        metrics: {
          avgConsultationValue: string;
          platformFeeRate: string;
          totalAdvisors: string;
          conversionRate: string;
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

interface RevenueData {
  thisMonth: number;
  lastMonth: number;
  totalRevenue: number;
  growth: number;
}

interface PayoutData {
  id: string;
  advisor: {
    id: string;
    name: string;
    avatar?: string;
  };
  amount_cents: number;
  period: string;
  consultation_count: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  payout_date?: string;
}

interface FinanceMetrics {
  avgConsultationValue: number;
  platformFeeRate: number;
  totalEarningAdvisors: number;
  conversionRate: number;
}

// Mock data for development
const mockRevenue: RevenueData = {
  thisMonth: 89500,
  lastMonth: 76300,
  totalRevenue: 542800,
  growth: 17.3
};

const mockPayouts: PayoutData[] = [
  {
    id: '1',
    advisor: { id: 'adv1', name: 'Sarah Johnson', avatar: '' },
    amount_cents: 245000,
    period: 'August 2025',
    consultation_count: 24,
    status: 'pending'
  },
  {
    id: '2',
    advisor: { id: 'adv2', name: 'Mike Chen', avatar: '' },
    amount_cents: 133000,
    period: 'August 2025',
    consultation_count: 18,
    status: 'pending'
  },
  {
    id: '3',
    advisor: { id: 'adv3', name: 'Alex Rodriguez', avatar: '' },
    amount_cents: 56000,
    period: 'August 2025',
    consultation_count: 8,
    status: 'pending'
  },
  {
    id: '4',
    advisor: { id: 'adv1', name: 'Sarah Johnson', avatar: '' },
    amount_cents: 224000,
    period: 'July 2025',
    consultation_count: 22,
    status: 'paid',
    payout_date: '2025-08-01T00:00:00Z'
  }
];

const mockMetrics: FinanceMetrics = {
  avgConsultationValue: 28.50,
  platformFeeRate: 30,
  totalEarningAdvisors: 12,
  conversionRate: 23.4
};

export function AdvisorFinanceConsole({ translations, locale }: AdvisorFinanceConsoleProps) {
  const { user, isAuthenticated } = useAuthStore();
  
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [payouts, setPayouts] = useState<PayoutData[]>([]);
  const [metrics, setMetrics] = useState<FinanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPayouts, setProcessingPayouts] = useState(false);

  // Load finance data (mock for now)
  useEffect(() => {
    async function loadFinanceData() {
      if (!isAuthenticated || !user) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('💰 Loading finance data for admin console', { userId: user.id.slice(0, 8) });
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));
        
        setRevenue(mockRevenue);
        setPayouts(mockPayouts);
        setMetrics(mockMetrics);
        
        logger.info('✅ Finance data loaded');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load finance data';
        setError(errorMessage);
        logger.error('❌ Failed to load finance data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadFinanceData();
  }, [isAuthenticated, user]);

  // Handle payout processing
  const handleProcessPayouts = async () => {
    setProcessingPayouts(true);
    
    try {
      logger.info('🔄 Processing pending payouts');
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update pending payouts to processing
      setPayouts(prev => prev.map(payout => 
        payout.status === 'pending' 
          ? { ...payout, status: 'processing' as const }
          : payout
      ));
      
      logger.info('✅ Payouts processing initiated');
      
    } catch (error) {
      logger.error('❌ Failed to process payouts:', error);
      setError('Failed to process payouts. Please try again.');
    } finally {
      setProcessingPayouts(false);
    }
  };

  // Handle CSV export
  const handleExportCSV = () => {
    const csvData = payouts.map(payout => ({
      Advisor: payout.advisor.name,
      Amount: formatCurrency(payout.amount_cents),
      Period: payout.period,
      Consultations: payout.consultation_count,
      Status: payout.status,
      PayoutDate: payout.payout_date ? new Date(payout.payout_date).toLocaleDateString() : 'Pending'
    }));

    const headers = Object.keys(csvData[0] || {});
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => row[header as keyof typeof row]).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `advisor-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    logger.info('📄 Payout CSV exported');
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString()}`;
  const getStatusColor = (status: PayoutData['status']) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAvatarFallback = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Calculate pending payout totals
  const pendingPayouts = payouts.filter(p => p.status === 'pending');
  const totalPendingAmount = pendingPayouts.reduce((sum, p) => sum + p.amount_cents, 0);
  const processedThisMonth = payouts.filter(p => 
    p.status === 'paid' && 
    p.payout_date && 
    new Date(p.payout_date).getMonth() === new Date().getMonth()
  ).reduce((sum, p) => sum + p.amount_cents, 0);

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
        <h1 className="text-3xl font-bold tracking-tight">{translations.admin.finance.title}</h1>
        <p className="text-muted-foreground">{translations.admin.finance.subtitle}</p>
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

      {/* Revenue Overview */}
      {revenue && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {translations.admin.finance.revenue.thisMonth}
              </CardTitle>
              <Icon name="trending-up" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(revenue.thisMonth)}</div>
              <p className="text-xs text-muted-foreground">
                +{revenue.growth.toFixed(1)}% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {translations.admin.finance.revenue.lastMonth}
              </CardTitle>
              <Icon name="calendar" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(revenue.lastMonth)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {translations.admin.finance.revenue.total}
              </CardTitle>
              <Icon name="dollar-sign" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(revenue.totalRevenue)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {translations.admin.finance.revenue.growth}
              </CardTitle>
              <Icon name="bar-chart-3" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">+{revenue.growth.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Key Metrics */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Key Metrics</CardTitle>
            <CardDescription>Platform performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">{translations.admin.finance.metrics.avgConsultationValue}</div>
                <div className="text-2xl font-bold">{formatCurrency(metrics.avgConsultationValue * 100)}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{translations.admin.finance.metrics.platformFeeRate}</div>
                <div className="text-2xl font-bold">{metrics.platformFeeRate}%</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{translations.admin.finance.metrics.totalAdvisors}</div>
                <div className="text-2xl font-bold">{metrics.totalEarningAdvisors}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{translations.admin.finance.metrics.conversionRate}</div>
                <div className="text-2xl font-bold">{metrics.conversionRate.toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout Management */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Pending Payouts Summary */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="clock" className="h-5 w-5" />
              {translations.admin.finance.payouts.pending}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-bold">{formatCurrency(totalPendingAmount)}</div>
              <p className="text-sm text-muted-foreground">{pendingPayouts.length} advisors</p>
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={handleProcessPayouts} 
                disabled={processingPayouts || pendingPayouts.length === 0}
                className="w-full"
              >
                {processingPayouts ? (
                  <>
                    <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icon name="play" className="h-4 w-4 me-2" />
                    {translations.admin.finance.payouts.process}
                  </>
                )}
              </Button>
              
              <Button variant="outline" onClick={handleExportCSV} className="w-full">
                <Icon name="download" className="h-4 w-4 me-2" />
                {translations.admin.finance.payouts.export}
              </Button>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Processed this month:</span>
                <span>{formatCurrency(processedThisMonth)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payouts Table */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{translations.admin.finance.payouts.title}</CardTitle>
            <CardDescription>Advisor payout history and management</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translations.admin.finance.payouts.table.advisor}</TableHead>
                    <TableHead>{translations.admin.finance.payouts.table.period}</TableHead>
                    <TableHead>{translations.admin.finance.payouts.table.consultations}</TableHead>
                    <TableHead>{translations.admin.finance.payouts.table.amount}</TableHead>
                    <TableHead>{translations.admin.finance.payouts.table.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={payout.advisor.avatar} alt={payout.advisor.name} />
                            <AvatarFallback className="text-xs">
                              {getAvatarFallback(payout.advisor.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{payout.advisor.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{payout.period}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Icon name="calendar" className="h-3 w-3 text-muted-foreground" />
                          {payout.consultation_count}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payout.amount_cents)}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('capitalize', getStatusColor(payout.status))}>
                          {payout.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}