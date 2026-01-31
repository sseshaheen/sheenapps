# Admin Billing Frontend Integration Guide

**Date**: September 2, 2025  
**Status**: Production Ready  
**Base URL**: `/admin/billing`  
**Authentication**: `x-admin-key` header required  

## 🚀 **Quick Start**

### Authentication
All endpoints require admin authentication:
```typescript
const headers = {
  'x-admin-key': process.env.ADMIN_API_KEY,
  'Content-Type': 'application/json'
};
```

### Basic Usage Example
```typescript
// Get executive dashboard overview
const response = await fetch('/admin/billing/overview', { headers });
const { data } = await response.json();

console.log(`Current MRR: $${data.revenue.mrr_current_usd_cents / 100}`);
console.log(`At-risk customers: ${data.customers.at_risk_count}`);
```

---

## 📊 **Core Dashboard Components**

### 1. Executive Overview Widget
**Endpoint**: `GET /admin/billing/overview`

```typescript
interface AdminBillingOverview {
  revenue: {
    mrr_current_usd_cents: number;    // $45,600 = 4560000 cents
    arr_current_usd_cents: number;    // $547,200 = 54720000 cents  
    growth_mom: number;               // 0.12 = 12% growth
    churn_rate: number;               // 0.05 = 5% churn
  };
  customers: {
    total_paying: number;             // 234 active subscribers
    new_this_month: number;           // 28 new customers
    churned_this_month: number;       // 12 churned customers
    at_risk_count: number;            // 15 high-risk customers
  };
  health: {
    avg_health_score: number;         // 0-100 average score
    payment_failures_30d: number;    // 8 failed payments
    low_balance_customers: number;    // 25 customers with low balance
  };
  providers: {
    total_active: number;             // 5 payment providers
    avg_success_rate: number;         // 0.96 = 96% success rate
    top_error_category: string;       // "insufficient_funds"
  };
}
```

**React Component Example**:
```typescript
function ExecutiveDashboard() {
  const [overview, setOverview] = useState<AdminBillingOverview>();
  
  useEffect(() => {
    fetch('/admin/billing/overview', { headers })
      .then(res => res.json())
      .then(({ data }) => setOverview(data));
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard 
        title="MRR" 
        value={`$${(overview?.revenue.mrr_current_usd_cents || 0) / 100}`}
        trend={overview?.revenue.growth_mom}
      />
      <MetricCard 
        title="Paying Customers" 
        value={overview?.customers.total_paying}
      />
      <MetricCard 
        title="At Risk" 
        value={overview?.customers.at_risk_count}
        color="red"
      />
      <MetricCard 
        title="Success Rate" 
        value={`${((overview?.providers.avg_success_rate || 0) * 100).toFixed(1)}%`}
      />
    </div>
  );
}
```

---

### 2. Customer 360 Profile Modal
**Endpoint**: `GET /admin/billing/customers/:userId/financial-profile`

```typescript
interface CustomerFinancialProfile {
  customer: {
    customer_id: string;
    stripe_customer_id: string | null;
    email: string;
    created_at: string;
    customer_since: string;
  };
  subscription: {
    subscription_id: string | null;
    plan_name: string | null;          // "Pro Plan"
    subscription_status: string | null; // "active", "past_due", "canceled"
    amount_cents: number;              // 2000 = $20.00
    currency: string | null;           // "USD", "EUR", "GBP", "EGP", "SAR"
    payment_provider: string | null;   // "stripe", "fawry", "paymob"
    next_billing_date: string | null;
  };
  balance: {
    remaining_time_seconds: number;    // 3600 = 1 hour remaining
    total_time_consumed: number;       // 7200 = 2 hours used
    minutes_runway_days: number;       // 15 days at current usage
  };
  payments: {
    total_payments: number;            // 24 total payment attempts
    successful_payments: number;       // 22 successful
    failed_payments: number;           // 2 failed
    last_payment_attempt: string | null;
    total_paid_cents: number;          // 48000 = $480.00 lifetime
  };
  health: {
    health_score: number;              // 85 (0-100 scale)
    risk_level: 'low' | 'medium' | 'high';
    breakdown: {
      score: number;
      factors: {
        usage_trend: number;           // 35 points (35% weight)
        payment_risk: number;          // 20 points (25% weight)
        minutes_runway: number;        // 15 points (20% weight)
        last_activity: number;         // 8 points (10% weight)
        support_friction: number;      // 7 points (10% weight)
      };
    };
    risk_flags: string[];              // ["payment_failure", "low_balance"]
  };
  activity: {
    last_activity: string | null;
    is_inactive: boolean;
  };
}
```

**React Component Example**:
```typescript
function Customer360Modal({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<CustomerFinancialProfile>();
  
  useEffect(() => {
    fetch(`/admin/billing/customers/${userId}/financial-profile`, { headers })
      .then(res => res.json())
      .then(({ data }) => setProfile(data));
  }, [userId]);

  return (
    <div className="space-y-6">
      {/* Health Score Section */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="flex items-center justify-between">
          <h3>Health Score</h3>
          <HealthScoreBadge score={profile?.health.health_score} />
        </div>
        
        {/* Health Score Breakdown */}
        <div className="mt-4 space-y-2">
          <ProgressBar 
            label="Usage Trend (35%)" 
            value={profile?.health.breakdown.factors.usage_trend}
            max={35}
          />
          <ProgressBar 
            label="Payment Risk (25%)" 
            value={profile?.health.breakdown.factors.payment_risk}
            max={25}
          />
          <ProgressBar 
            label="Minutes Runway (20%)" 
            value={profile?.health.breakdown.factors.minutes_runway}
            max={20}
          />
        </div>
      </div>

      {/* Subscription Details */}
      <div className="bg-white p-4 rounded-lg border">
        <h3>Subscription</h3>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <p className="text-sm text-gray-600">Plan</p>
            <p className="font-medium">{profile?.subscription.plan_name || 'None'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Amount</p>
            <p className="font-medium">
              {profile?.subscription.currency} {(profile?.subscription.amount_cents || 0) / 100}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Provider</p>
            <ProviderBadge provider={profile?.subscription.payment_provider} />
          </div>
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <StatusBadge status={profile?.subscription.subscription_status} />
          </div>
        </div>
      </div>

      {/* Balance & Usage */}
      <div className="bg-white p-4 rounded-lg border">
        <h3>AI Time Balance</h3>
        <div className="mt-2">
          <p className="text-sm text-gray-600">Remaining Time</p>
          <p className="text-lg font-medium">
            {Math.floor((profile?.balance.remaining_time_seconds || 0) / 60)} minutes
          </p>
          <p className="text-xs text-gray-500 mt-1">
            ~{profile?.balance.minutes_runway_days} days at current usage
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

### 3. Revenue Analytics Dashboard
**Endpoint**: `GET /admin/billing/analytics/revenue`

**Query Parameters**:
- `currency?: string` - Filter by currency (USD, EUR, GBP, EGP, SAR)
- `provider?: string` - Filter by provider (stripe, fawry, paymob, stcpay, paytabs)

```typescript
interface RevenueAnalytics {
  mrr_current_usd_cents: number;
  arr_current_usd_cents: number;
  growth_mom: number;
  by_currency: Record<string, {
    mrr_cents: number;
    active_subscribers: number;
    providers: Record<string, {
      mrr_cents: number;
      subscribers: number;
    }>;
  }>;
  by_provider: Record<string, {
    mrr_usd_cents: number;
    currencies: string[];
    success_rate_pct: number;
  }>;
  exchange_rates_used: Record<string, number>;
}
```

**Chart Component Example**:
```typescript
function RevenueChart() {
  const [analytics, setAnalytics] = useState<RevenueAnalytics>();
  
  // Currency breakdown for pie chart
  const currencyData = Object.entries(analytics?.by_currency || {}).map(([currency, data]) => ({
    name: currency,
    value: data.mrr_cents,
    subscribers: data.active_subscribers
  }));

  // Provider performance for bar chart  
  const providerData = Object.entries(analytics?.by_provider || {}).map(([provider, data]) => ({
    name: provider,
    mrr: data.mrr_usd_cents,
    success_rate: data.success_rate_pct
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Currency Distribution */}
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">MRR by Currency</h3>
          <PieChart width={300} height={200} data={currencyData}>
            <Pie dataKey="value" cx="50%" cy="50%" outerRadius={60} />
            <Tooltip formatter={(value) => `$${value / 100}`} />
            <Legend />
          </PieChart>
        </div>

        {/* Provider Performance */}
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">Provider Performance</h3>
          <BarChart width={300} height={200} data={providerData}>
            <XAxis dataKey="name" />
            <YAxis />
            <Bar dataKey="success_rate" fill="#3B82F6" />
            <Tooltip formatter={(value) => `${value}%`} />
          </BarChart>
        </div>
      </div>
    </div>
  );
}
```

---

### 4. At-Risk Customers List
**Endpoint**: `GET /admin/billing/customers/at-risk`

**Query Parameters**:
- `limit?: string` - Max customers to return (default: 50, max: 100)
- `risk_level?: 'high' | 'medium'` - Filter by risk level

```typescript
interface AtRiskCustomersResponse {
  customers: CustomerFinancialProfile[];
  total_count: number;
  risk_distribution: {
    high: number;    // Count of high-risk customers
    medium: number;  // Count of medium-risk customers
  };
}
```

**Table Component Example**:
```typescript
function AtRiskCustomersTable() {
  const [data, setData] = useState<AtRiskCustomersResponse>();
  
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h3 className="text-lg font-medium">At-Risk Customers</h3>
        <p className="text-sm text-gray-600 mt-1">
          {data?.risk_distribution.high} high-risk, {data?.risk_distribution.medium} medium-risk
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Health Score</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk Factors</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MRR</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.customers.map((customer) => (
              <tr key={customer.customer.customer_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{customer.customer.email}</p>
                    <p className="text-sm text-gray-500">
                      Customer since {new Date(customer.customer.customer_since).toLocaleDateString()}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <HealthScoreBadge score={customer.health.health_score} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {customer.health.risk_flags.map(flag => (
                      <span key={flag} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                        {flag.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {customer.subscription.currency} {(customer.subscription.amount_cents || 0) / 100}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <button 
                    onClick={() => openCustomer360(customer.customer.customer_id)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### 5. Provider Performance Monitor
**Endpoint**: `GET /admin/billing/providers/performance`

**Query Parameters**:
- `provider?: string` - Filter by provider
- `currency?: string` - Filter by currency  
- `days?: string` - Look back period (default: 30, max: 90)

```typescript
interface ProviderPerformanceResponse {
  providers: Array<{
    payment_provider: string;         // "stripe", "fawry", etc.
    currency: string;                 // "USD", "EGP", etc.
    total_attempts: number;           // 156 payment attempts
    successful_payments: number;      // 145 successful
    failed_payments: number;          // 11 failed
    success_rate_pct: number;         // 92.95% success rate
    successful_amount_cents: number;  // 487500 cents processed
    avg_successful_amount_cents: number; // 3362 average transaction
    top_error_category: string;       // "insufficient_funds"
    top_error_count: number;          // 6 occurrences
  }>;
  overall_metrics: {
    total_attempts: number;
    total_successful: number;
    overall_success_rate_pct: number;
  };
  period_days: number;
}
```

**Monitoring Component Example**:
```typescript
function ProviderHealthDashboard() {
  const [performance, setPerformance] = useState<ProviderPerformanceResponse>();
  
  const getHealthColor = (successRate: number) => {
    if (successRate >= 95) return 'text-green-600 bg-green-100';
    if (successRate >= 90) return 'text-yellow-600 bg-yellow-100'; 
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="space-y-4">
      {/* Overall Metrics */}
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="text-lg font-medium mb-4">Overall Performance (Last {performance?.period_days} days)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Success Rate</p>
            <p className="text-2xl font-bold text-green-600">
              {performance?.overall_metrics.overall_success_rate_pct.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Attempts</p>
            <p className="text-2xl font-bold">{performance?.overall_metrics.total_attempts}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Successful</p>
            <p className="text-2xl font-bold text-green-600">{performance?.overall_metrics.total_successful}</p>
          </div>
        </div>
      </div>

      {/* Provider Breakdown */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-lg font-medium">Provider Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Currency</th>
                <th className="px-4 py-3 text-left">Success Rate</th>
                <th className="px-4 py-3 text-left">Volume</th>
                <th className="px-4 py-3 text-left">Top Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {performance?.providers.map((provider, index) => (
                <tr key={`${provider.payment_provider}-${provider.currency}-${index}`}>
                  <td className="px-4 py-3">
                    <ProviderBadge provider={provider.payment_provider} />
                  </td>
                  <td className="px-4 py-3">{provider.currency}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getHealthColor(provider.success_rate_pct)}`}>
                      {provider.success_rate_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">${(provider.successful_amount_cents / 100).toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{provider.successful_payments} payments</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm">{provider.top_error_category}</p>
                      <p className="text-xs text-gray-500">{provider.top_error_count} occurrences</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

---

## 🛠️ **Utility Components**

### Health Score Badge
```typescript
function HealthScoreBadge({ score }: { score?: number }) {
  if (!score) return null;
  
  const getScoreColor = (score: number) => {
    if (score >= 71) return 'bg-green-100 text-green-800';
    if (score >= 41) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 71) return 'Low Risk';
    if (score >= 41) return 'Medium Risk'; 
    return 'High Risk';
  };

  return (
    <div className="text-center">
      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(score)}`}>
        {score}/100
      </div>
      <p className="text-xs text-gray-500 mt-1">{getRiskLevel(score)}</p>
    </div>
  );
}
```

### Provider Badge
```typescript
function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider) return <span className="text-gray-400">None</span>;
  
  const getProviderDisplay = (provider: string) => {
    const displays = {
      stripe: { name: 'Stripe', color: 'bg-purple-100 text-purple-800' },
      fawry: { name: 'Fawry', color: 'bg-orange-100 text-orange-800' },
      paymob: { name: 'Paymob', color: 'bg-blue-100 text-blue-800' },
      stcpay: { name: 'STC Pay', color: 'bg-green-100 text-green-800' },
      paytabs: { name: 'PayTabs', color: 'bg-indigo-100 text-indigo-800' }
    };
    return displays[provider] || { name: provider, color: 'bg-gray-100 text-gray-800' };
  };

  const display = getProviderDisplay(provider);
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${display.color}`}>
      {display.name}
    </span>
  );
}
```

---

## 🔄 **Additional Endpoints**

### Currency Breakdown
**Endpoint**: `GET /admin/billing/analytics/revenue/currency-breakdown`
Returns detailed currency analysis with provider attribution.

### Health Distribution  
**Endpoint**: `GET /admin/billing/health/distribution`
Returns customer health score distribution and averages.

### Package Analytics
**Endpoint**: `GET /admin/billing/analytics/packages`
**Query**: `?days=30&currency=USD&provider=stripe`
Returns one-time package purchase analytics (separate from MRR).

### Maintenance
**Endpoint**: `POST /admin/billing/maintenance/refresh-views`
Manually refresh all materialized views for updated data.

---

## ⚡ **Performance Notes**

- **Query Performance**: All endpoints target p95 < 500ms
- **Data Freshness**: Materialized views refresh every 15 minutes  
- **Caching**: Consider caching overview data for 5-10 minutes
- **Pagination**: At-risk customers limited to 100 per request
- **Rate Limiting**: 60 requests/minute per admin key

---

## 🎯 **Integration Checklist**

- [ ] Set up admin authentication with `x-admin-key` header
- [ ] Implement executive dashboard with overview metrics
- [ ] Create Customer 360 modal with health score breakdown  
- [ ] Build revenue analytics charts (currency + provider)
- [ ] Add at-risk customers table with filtering
- [ ] Set up provider performance monitoring
- [ ] Add utility components (badges, progress bars)
- [ ] Implement error handling and loading states
- [ ] Test with sample data and edge cases

**Result**: Complete admin billing intelligence system with real-time multi-currency revenue tracking and customer health monitoring! 🚀