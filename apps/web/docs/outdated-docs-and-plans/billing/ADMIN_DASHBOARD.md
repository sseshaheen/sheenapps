# Admin Dashboard

## Overview
The admin dashboard provides comprehensive insights into revenue metrics, usage analytics, payment health, and system operations for internal team monitoring and decision-making.

## Authentication & Authorization

### Admin Authentication
```typescript
// src/lib/admin-auth.ts
import { createClient } from '@/utils/supabase/server';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());

export async function requireAdmin(request: Request): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Authentication required');
  }

  if (!ADMIN_EMAILS.includes(user.email)) {
    throw new Error('Admin access required');
  }

  // Log admin access
  await supabase.from('admin_access_logs').insert({
    admin_email: user.email,
    path: new URL(request.url).pathname,
    ip_address: request.headers.get('x-forwarded-for'),
    user_agent: request.headers.get('user-agent'),
    accessed_at: new Date().toISOString()
  });

  return user.id;
}

// Admin route middleware
export function withAdminAuth(handler: Function) {
  return async (request: Request, ...args: any[]) => {
    try {
      await requireAdmin(request);
      return handler(request, ...args);
    } catch (error) {
      return new Response('Unauthorized', { status: 401 });
    }
  };
}
```

## Dashboard Layout

### Admin Layout Component
```typescript
// src/app/admin/layout.tsx
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6">
          <AdminBreadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}

function AdminSidebar() {
  const pathname = usePathname();
  
  const links = [
    { href: '/admin', label: 'Overview', icon: Dashboard },
    { href: '/admin/revenue', label: 'Revenue', icon: DollarSign },
    { href: '/admin/usage', label: 'Usage Analytics', icon: BarChart },
    { href: '/admin/payments', label: 'Failed Payments', icon: AlertCircle },
    { href: '/admin/webhooks', label: 'Webhook Logs', icon: Activity },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/support', label: 'Support Queue', icon: HelpCircle },
  ];
  
  return (
    <aside className="w-64 bg-white shadow-md">
      <nav className="p-4 space-y-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md transition",
              pathname === link.href
                ? "bg-blue-50 text-blue-600"
                : "hover:bg-gray-100"
            )}
          >
            <link.icon className="w-5 h-5" />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

## Revenue Metrics

### Metrics Service
```typescript
// src/services/payment/metrics-service.ts
export class MetricsService {
  /**
   * Calculate MRR (Monthly Recurring Revenue)
   */
  async calculateMRR(date: Date = new Date()): Promise<{
    total: number;
    byPlan: Record<string, number>;
    byGateway: Record<string, number>;
    growth: number;
    newBusiness: number;
    expansion: number;
    contraction: number;
    churn: number;
  }> {
    const startOfCurrentMonth = startOfMonth(date);
    const startOfLastMonth = startOfMonth(subMonths(date, 1));
    
    // Current MRR
    const currentMRR = await supabase.rpc('calculate_mrr', {
      target_date: startOfCurrentMonth.toISOString()
    });
    
    // Previous month MRR
    const previousMRR = await supabase.rpc('calculate_mrr', {
      target_date: startOfLastMonth.toISOString()
    });
    
    // MRR movements
    const movements = await this.calculateMRRMovements(
      startOfLastMonth,
      startOfCurrentMonth
    );
    
    return {
      total: currentMRR.data.total,
      byPlan: currentMRR.data.by_plan,
      byGateway: currentMRR.data.by_gateway,
      growth: currentMRR.data.total - previousMRR.data.total,
      ...movements
    };
  }
  
  /**
   * Calculate churn metrics
   */
  async calculateChurn(period: 'monthly' | 'quarterly' | 'yearly'): Promise<{
    customerChurn: number;
    revenueChurn: number;
    logoChurn: number;
    netRevenueRetention: number;
  }> {
    // Implementation details...
  }
  
  /**
   * Calculate LTV (Lifetime Value)
   */
  async calculateLTV(cohort?: string): Promise<{
    overall: number;
    byPlan: Record<string, number>;
    byCohort: Record<string, number>;
  }> {
    // Implementation details...
  }
  
  /**
   * Calculate ARPU (Average Revenue Per User)
   */
  async calculateARPU(): Promise<{
    overall: number;
    byPlan: Record<string, number>;
    byCountry: Record<string, number>;
  }> {
    // Implementation details...
  }
}
```

### Revenue Dashboard Page
```typescript
// src/app/admin/revenue/page.tsx
export default function RevenueDashboard() {
  const [dateRange, setDateRange] = useState({ 
    start: startOfMonth(new Date()), 
    end: endOfMonth(new Date()) 
  });
  
  const { data: metrics, loading } = useQuery({
    queryKey: ['revenue-metrics', dateRange],
    queryFn: () => fetchRevenueMetrics(dateRange)
  });
  
  if (loading) return <DashboardSkeleton />;
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Revenue Metrics</h1>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>
      
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="MRR"
          value={formatCurrency(metrics.mrr.total)}
          change={metrics.mrr.growth}
          changeType={metrics.mrr.growth > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          title="Customer Churn"
          value={`${metrics.churn.customerChurn}%`}
          change={metrics.churn.change}
          changeType={metrics.churn.change < 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          title="LTV"
          value={formatCurrency(metrics.ltv.overall)}
          subtitle="3-month average"
        />
        <MetricCard
          title="ARPU"
          value={formatCurrency(metrics.arpu.overall)}
          change={metrics.arpu.change}
        />
      </div>
      
      {/* MRR Movement Chart */}
      <Card>
        <CardHeader>
          <CardTitle>MRR Movement</CardTitle>
        </CardHeader>
        <CardContent>
          <MRRWaterfallChart data={metrics.mrrMovement} />
        </CardContent>
      </Card>
      
      {/* Revenue by Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChart data={metrics.revenueByPlan} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={metrics.revenueByGateway} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

## Usage Analytics

### Usage Analytics Service
```typescript
// src/services/analytics/usage-analytics-service.ts
export class UsageAnalyticsService {
  /**
   * Get power users
   */
  async getPowerUsers(limit: number = 100): Promise<PowerUser[]> {
    const { data } = await supabase.rpc('get_power_users', {
      p_limit: limit,
      p_days: 30
    });
    
    return data.map(user => ({
      userId: user.user_id,
      email: user.email,
      plan: user.plan_name,
      totalUsage: user.total_usage,
      aiGenerations: user.ai_generations,
      exports: user.exports,
      lastActive: new Date(user.last_active),
      usageGrowth: user.usage_growth,
      riskScore: this.calculateRiskScore(user)
    }));
  }
  
  /**
   * Get feature adoption metrics
   */
  async getFeatureAdoption(): Promise<{
    features: FeatureAdoption[];
    trends: AdoptionTrend[];
  }> {
    // Implementation details...
  }
  
  /**
   * Calculate usage patterns
   */
  async getUsagePatterns(): Promise<{
    peakHours: number[];
    peakDays: string[];
    averageSessionLength: number;
    featuresPerSession: number;
  }> {
    // Implementation details...
  }
}
```

### Usage Dashboard Page
```typescript
// src/app/admin/usage/page.tsx
export default function UsageDashboard() {
  const { data: analytics, loading } = useQuery({
    queryKey: ['usage-analytics'],
    queryFn: fetchUsageAnalytics
  });
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usage Analytics</h1>
      
      {/* Power Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Power Users</CardTitle>
          <CardDescription>
            Top users by activity in the last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={powerUserColumns}
            data={analytics.powerUsers}
            searchKey="email"
          />
        </CardContent>
      </Card>
      
      {/* Usage Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageHeatmap data={analytics.usagePatterns} />
        </CardContent>
      </Card>
      
      {/* Feature Adoption */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Adoption</CardTitle>
        </CardHeader>
        <CardContent>
          <FeatureAdoptionChart data={analytics.featureAdoption} />
        </CardContent>
      </Card>
    </div>
  );
}
```

## Failed Payments Monitoring

### Failed Payments Page
```typescript
// src/app/admin/payments/page.tsx
export default function FailedPaymentsPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  
  const { data: payments, loading } = useQuery({
    queryKey: ['failed-payments', filter],
    queryFn: () => fetchFailedPayments(filter)
  });
  
  const handleRetry = async (paymentId: string) => {
    await retryPayment(paymentId);
    queryClient.invalidateQueries(['failed-payments']);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Failed Payments</h1>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Failed"
          value={payments.summary.total}
          icon={AlertCircle}
        />
        <MetricCard
          title="Amount at Risk"
          value={formatCurrency(payments.summary.amountAtRisk)}
          variant="warning"
        />
        <MetricCard
          title="Recovery Rate"
          value={`${payments.summary.recoveryRate}%`}
          variant="success"
        />
        <MetricCard
          title="Avg Resolution Time"
          value={`${payments.summary.avgResolutionHours}h`}
        />
      </div>
      
      {/* Failed Payments Table */}
      <Card>
        <CardContent>
          <DataTable
            columns={[
              {
                header: 'Customer',
                accessorKey: 'customer_email',
                cell: ({ row }) => (
                  <div>
                    <div>{row.original.customer_email}</div>
                    <div className="text-sm text-gray-500">
                      {row.original.plan_name} - {row.original.gateway}
                    </div>
                  </div>
                )
              },
              {
                header: 'Amount',
                accessorKey: 'amount',
                cell: ({ getValue }) => formatCurrency(getValue())
              },
              {
                header: 'Error',
                accessorKey: 'error_code',
                cell: ({ row }) => (
                  <Badge variant={getErrorVariant(row.original.error_code)}>
                    {row.original.error_message}
                  </Badge>
                )
              },
              {
                header: 'Failed At',
                accessorKey: 'failed_at',
                cell: ({ getValue }) => formatRelative(getValue(), new Date())
              },
              {
                header: 'Actions',
                cell: ({ row }) => (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRetry(row.original.id)}
                      disabled={row.original.retry_count >= 3}
                    >
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCustomerDetails(row.original.user_id)}
                    >
                      View Customer
                    </Button>
                  </div>
                )
              }
            ]}
            data={payments.data}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

## Webhook Event Logs

### Webhook Monitoring Page
```typescript
// src/app/admin/webhooks/page.tsx
export default function WebhookLogsPage() {
  const [gateway, setGateway] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  
  const { data: events, loading } = useQuery({
    queryKey: ['webhook-events', gateway, status],
    queryFn: () => fetchWebhookEvents({ gateway, status })
  });
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Webhook Event Logs</h1>
      
      {/* Filters */}
      <div className="flex gap-4">
        <Select value={gateway} onValueChange={setGateway}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Gateways" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Gateways</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="cashier">Cashier</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="retrying">Retrying</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Event Timeline */}
      <Card>
        <CardContent>
          <WebhookTimeline events={events.data} />
        </CardContent>
      </Card>
      
      {/* Event Details Modal */}
      <WebhookDetailsModal />
    </div>
  );
}
```

## API Endpoints

### Revenue Metrics API
```typescript
// /api/admin/metrics/revenue
export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  
  const metricsService = new MetricsService();
  
  const [mrr, churn, ltv, arpu] = await Promise.all([
    metricsService.calculateMRR(new Date(end || Date.now())),
    metricsService.calculateChurn('monthly'),
    metricsService.calculateLTV(),
    metricsService.calculateARPU()
  ]);
  
  return NextResponse.json({
    mrr,
    churn,
    ltv,
    arpu,
    period: { start, end }
  });
});
```

### Usage Analytics API
```typescript
// /api/admin/metrics/usage
export const GET = withAdminAuth(async (request: NextRequest) => {
  const analyticsService = new UsageAnalyticsService();
  
  const [powerUsers, featureAdoption, usagePatterns] = await Promise.all([
    analyticsService.getPowerUsers(100),
    analyticsService.getFeatureAdoption(),
    analyticsService.getUsagePatterns()
  ]);
  
  return NextResponse.json({
    powerUsers,
    featureAdoption,
    usagePatterns
  });
});
```

## Analytics Queries

### MRR Calculation
```sql
-- Function to calculate MRR at a point in time
CREATE OR REPLACE FUNCTION calculate_mrr(target_date TIMESTAMP)
RETURNS TABLE (
  total DECIMAL,
  by_plan JSONB,
  by_gateway JSONB,
  by_country JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH active_subscriptions AS (
    SELECT 
      s.plan_name,
      t.gateway,
      t.country,
      t.amount_cents / 100.0 as amount,
      t.currency
    FROM subscriptions s
    JOIN transactions t ON s.last_transaction_id = t.id
    WHERE s.status IN ('active', 'trialing')
      AND s.current_period_start <= target_date
      AND s.current_period_end >= target_date
  )
  SELECT 
    SUM(amount) as total,
    jsonb_object_agg(plan_name, plan_total) as by_plan,
    jsonb_object_agg(gateway, gateway_total) as by_gateway,
    jsonb_object_agg(country, country_total) as by_country
  FROM (
    SELECT 
      plan_name, 
      SUM(amount) as plan_total,
      gateway,
      SUM(amount) as gateway_total,
      country,
      SUM(amount) as country_total
    FROM active_subscriptions
    GROUP BY GROUPING SETS ((plan_name), (gateway), (country))
  ) grouped;
END;
$$ LANGUAGE plpgsql;
```

### Power Users Query
```sql
-- Get power users with risk scoring
CREATE OR REPLACE FUNCTION get_power_users(
  p_limit INTEGER DEFAULT 100,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  user_id UUID,
  email VARCHAR,
  plan_name VARCHAR,
  total_usage BIGINT,
  ai_generations BIGINT,
  exports BIGINT,
  last_active TIMESTAMP,
  usage_growth DECIMAL,
  days_since_signup INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH usage_stats AS (
    SELECT 
      ue.user_id,
      COUNT(*) FILTER (WHERE ue.event_type = 'ai_generation') as ai_generations,
      COUNT(*) FILTER (WHERE ue.event_type = 'export') as exports,
      COUNT(*) as total_usage,
      MAX(ue.created_at) as last_active
    FROM usage_events ue
    WHERE ue.created_at >= NOW() - INTERVAL '1 day' * p_days
    GROUP BY ue.user_id
  ),
  previous_usage AS (
    SELECT 
      ue.user_id,
      COUNT(*) as prev_total
    FROM usage_events ue
    WHERE ue.created_at >= NOW() - INTERVAL '1 day' * (p_days * 2)
      AND ue.created_at < NOW() - INTERVAL '1 day' * p_days
    GROUP BY ue.user_id
  )
  SELECT 
    us.user_id,
    u.email,
    s.plan_name,
    us.total_usage,
    us.ai_generations,
    us.exports,
    us.last_active,
    COALESCE(
      (us.total_usage - pu.prev_total)::DECIMAL / NULLIF(pu.prev_total, 0) * 100,
      100
    ) as usage_growth,
    EXTRACT(DAY FROM NOW() - u.created_at)::INTEGER as days_since_signup
  FROM usage_stats us
  JOIN auth.users u ON us.user_id = u.id
  LEFT JOIN subscriptions s ON us.user_id = s.user_id AND s.status = 'active'
  LEFT JOIN previous_usage pu ON us.user_id = pu.user_id
  ORDER BY us.total_usage DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

## Security & Compliance

### Admin Access Logging
```sql
CREATE TABLE admin_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  accessed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_access_email ON admin_access_logs(admin_email);
CREATE INDEX idx_admin_access_date ON admin_access_logs(accessed_at DESC);
```

### Data Export Controls
```typescript
// Implement data export restrictions
export async function exportUserData(userId: string, adminId: string) {
  // Log export request
  await logDataExport(adminId, userId, 'user_data');
  
  // Implement rate limiting
  const recentExports = await getRecentExports(adminId, 24); // Last 24 hours
  if (recentExports > 100) {
    throw new Error('Export rate limit exceeded');
  }
  
  // Export data with PII handling
  return await exportWithPrivacyControls(userId);
}
```

## Best Practices

### Do's
- Always authenticate admin access
- Log all admin actions
- Use role-based permissions
- Implement data export controls
- Monitor admin usage patterns

### Don'ts
- Don't expose sensitive data
- Don't allow bulk operations without limits
- Don't forget audit trails
- Don't hardcode admin emails
- Don't cache sensitive metrics

---

*Last Updated: 27 June 2025*