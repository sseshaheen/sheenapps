# ChartMogul Revenue Analytics Integration

## Overview
ChartMogul integration provides unified revenue analytics across multiple payment gateways using a custom data source approach, enabling comprehensive MRR tracking, cohort analysis, and revenue insights.

## Architecture

### Why Custom Data Source?
Instead of connecting gateways directly to ChartMogul, we use a custom data source to:
- Unify data from multiple payment providers (Stripe, Cashier, PayPal)
- Maintain consistent customer IDs across gateways
- Add custom attributes and metadata
- Control data synchronization timing
- Handle complex business logic

## Setup & Configuration

### 1. ChartMogul Account Setup
```bash
# 1. Create ChartMogul account at chartmogul.com
# 2. Create Custom Data Source:
#    - Go to Data Sources → Add Data Source → Custom
#    - Name: "SheenApps Unified Payments"
#    - Copy the data_source_uuid

# 3. Get API Credentials:
#    - Go to Profile → API Keys
#    - Create new key: "Production Sync"
#    - Copy Account Token and Secret Key
```

### 2. Environment Configuration
```env
# ChartMogul API
CHARTMOGUL_ACCOUNT_TOKEN=xxx
CHARTMOGUL_SECRET_KEY=xxx
CHARTMOGUL_DATA_SOURCE_ID=ds_xxx

# Sync Configuration
CHARTMOGUL_SYNC_ENABLED=true
CHARTMOGUL_SYNC_BATCH_SIZE=100
CHARTMOGUL_SYNC_INTERVAL_MINUTES=5
```

### 3. Database Schema Updates
```sql
-- Add ChartMogul tracking to transactions
ALTER TABLE transactions
  ADD COLUMN chartmogul_synced_at TIMESTAMP,
  ADD COLUMN chartmogul_customer_uuid VARCHAR(255),
  ADD COLUMN chartmogul_invoice_uuid VARCHAR(255),
  ADD COLUMN chartmogul_sync_error TEXT,
  ADD COLUMN chartmogul_sync_attempts INTEGER DEFAULT 0;

CREATE INDEX idx_transactions_chartmogul_sync 
  ON transactions(chartmogul_synced_at) 
  WHERE chartmogul_synced_at IS NULL;

-- Add to subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN chartmogul_subscription_uuid VARCHAR(255),
  ADD COLUMN chartmogul_plan_uuid VARCHAR(255),
  ADD COLUMN chartmogul_cancelled_at TIMESTAMP;

-- Sync status tracking
CREATE TABLE chartmogul_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50), -- 'customers', 'subscriptions', 'invoices'
  last_sync_at TIMESTAMP,
  records_synced INTEGER,
  records_failed INTEGER,
  error_details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## ChartMogul Service Implementation

### Core Service
```typescript
// src/services/analytics/chartmogul-service.ts
import ChartMogul from 'chartmogul-node';

export class ChartMogulService {
  private config: ChartMogul.Config;
  private dataSourceUuid: string;
  
  constructor() {
    this.config = new ChartMogul.Config(
      process.env.CHARTMOGUL_ACCOUNT_TOKEN!,
      process.env.CHARTMOGUL_SECRET_KEY!
    );
    this.dataSourceUuid = process.env.CHARTMOGUL_DATA_SOURCE_ID!;
  }
  
  /**
   * Create or update customer
   */
  async upsertCustomer(params: {
    externalId: string;
    email: string;
    name?: string;
    country?: string;
    currency?: string;
    metadata?: Record<string, any>;
  }): Promise<ChartMogul.Customer> {
    try {
      // Search for existing customer
      const existingCustomers = await ChartMogul.Customer.search(this.config, {
        email: params.email,
      });
      
      if (existingCustomers.entries?.length > 0) {
        const customer = existingCustomers.entries[0];
        
        // Update existing customer
        return await ChartMogul.Customer.modify(this.config, customer.uuid, {
          name: params.name,
          country: params.country,
          currency: params.currency,
          attributes: {
            custom: params.metadata,
          },
        });
      }
      
      // Create new customer
      return await ChartMogul.Customer.create(this.config, {
        data_source_uuid: this.dataSourceUuid,
        external_id: params.externalId,
        email: params.email,
        name: params.name || params.email,
        country: params.country,
        currency: params.currency || 'USD',
        attributes: {
          custom: params.metadata,
        },
      });
    } catch (error) {
      logger.error('ChartMogul customer upsert failed:', error);
      throw error;
    }
  }
  
  /**
   * Create or update plan
   */
  async upsertPlan(params: {
    name: string;
    interval: 'month' | 'year';
    intervalCount: number;
    currency: string;
  }): Promise<ChartMogul.Plan> {
    const externalId = `${params.name}_${params.currency}`.toLowerCase();
    
    try {
      // Get existing plans
      const plans = await ChartMogul.Plan.all(this.config, {
        data_source_uuid: this.dataSourceUuid,
      });
      
      const existingPlan = plans.plans?.find(
        p => p.external_id === externalId
      );
      
      if (existingPlan) {
        return existingPlan;
      }
      
      // Create new plan
      return await ChartMogul.Plan.create(this.config, {
        data_source_uuid: this.dataSourceUuid,
        name: `${params.name} (${params.currency})`,
        interval_unit: params.interval,
        interval_count: params.intervalCount,
        external_id: externalId,
      });
    } catch (error) {
      logger.error('ChartMogul plan upsert failed:', error);
      throw error;
    }
  }
}
```

## Sync Worker Implementation

### Transaction Sync Worker
```typescript
// src/services/analytics/chartmogul-sync-worker.ts
export class ChartMogulSyncWorker {
  private chartmogul: ChartMogulService;
  private batchSize: number;
  
  constructor() {
    this.chartmogul = new ChartMogulService();
    this.batchSize = parseInt(process.env.CHARTMOGUL_SYNC_BATCH_SIZE || '100');
  }
  
  /**
   * Main sync process
   */
  async syncTransactions(): Promise<SyncResult> {
    const startTime = Date.now();
    const results: SyncResult = {
      synced: 0,
      failed: 0,
      errors: [],
      duration: 0,
    };
    
    try {
      // Get unsynced transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select(`
          *,
          users!inner(email, name),
          subscriptions(plan_name, stripe_subscription_id)
        `)
        .is('chartmogul_synced_at', null)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .limit(this.batchSize);
      
      if (!transactions || transactions.length === 0) {
        return results;
      }
      
      // Process each transaction
      for (const transaction of transactions) {
        try {
          await this.syncSingleTransaction(transaction);
          results.synced++;
          
          // Mark as synced
          await supabase
            .from('transactions')
            .update({
              chartmogul_synced_at: new Date().toISOString(),
              chartmogul_sync_error: null,
            })
            .eq('id', transaction.id);
            
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            transactionId: transaction.id,
            error: error.message,
          });
          
          // Log sync failure
          await this.logSyncFailure(transaction.id, error);
        }
      }
      
      results.duration = Date.now() - startTime;
      
      // Log sync status
      await this.logSyncStatus(results);
      
      return results;
      
    } catch (error) {
      logger.error('ChartMogul sync worker error:', error);
      throw error;
    }
  }
  
  /**
   * Sync individual transaction
   */
  private async syncSingleTransaction(transaction: any): Promise<void> {
    // 1. Upsert customer
    const customer = await this.chartmogul.upsertCustomer({
      externalId: transaction.user_id,
      email: transaction.users.email,
      name: transaction.users.name,
      country: transaction.country,
      currency: transaction.currency,
      metadata: {
        gateway: transaction.gateway,
        utm_source: transaction.utm_source,
        utm_medium: transaction.utm_medium,
        utm_campaign: transaction.utm_campaign,
        referrer_id: transaction.metadata?.referrer_user_id,
      },
    });
    
    // 2. Upsert plan
    const plan = await this.chartmogul.upsertPlan({
      name: transaction.plan_name,
      interval: 'month', // TODO: Support yearly plans
      intervalCount: 1,
      currency: transaction.currency,
    });
    
    // 3. Handle subscription transactions
    if (transaction.product_type === 'subscription') {
      await this.syncSubscriptionTransaction(
        transaction,
        customer.uuid,
        plan.uuid
      );
    } else {
      // Handle one-time payments
      await this.syncOneTimePayment(
        transaction,
        customer.uuid
      );
    }
    
    // 4. Update customer UUID reference
    await supabase
      .from('transactions')
      .update({
        chartmogul_customer_uuid: customer.uuid,
      })
      .eq('id', transaction.id);
  }
  
  /**
   * Sync subscription transaction
   */
  private async syncSubscriptionTransaction(
    transaction: any,
    customerUuid: string,
    planUuid: string
  ): Promise<void> {
    // Create subscription if not exists
    let subscription = await this.findOrCreateSubscription(
      customerUuid,
      planUuid,
      transaction
    );
    
    // Create invoice
    const invoice = await ChartMogul.Invoice.create(this.config, customerUuid, {
      currency: transaction.currency,
      date: transaction.transaction_date,
      external_id: `${transaction.gateway}_${transaction.id}`,
      line_items: [{
        type: 'subscription',
        subscription_uuid: subscription.uuid,
        service_period_start: transaction.transaction_date,
        service_period_end: this.calculatePeriodEnd(
          new Date(transaction.transaction_date),
          'month'
        ).toISOString(),
        amount_in_cents: transaction.amount_cents,
        discount_amount_in_cents: transaction.discount_amount_cents || 0,
        tax_amount_in_cents: transaction.tax_amount_cents || 0,
      }],
    });
    
    // Record payment transaction
    await ChartMogul.Transaction.create(this.config, invoice.uuid, {
      type: 'payment',
      date: transaction.transaction_date,
      result: 'successful',
    });
    
    // Update invoice reference
    await supabase
      .from('transactions')
      .update({
        chartmogul_invoice_uuid: invoice.uuid,
      })
      .eq('id', transaction.id);
  }
}
```

## Data Mapping Strategy

### Customer Attributes
```typescript
// Map customer attributes for segmentation
const customerAttributes = {
  // Standard attributes
  country: user.country,
  currency: user.currency,
  
  // Custom attributes
  custom: {
    // Acquisition
    acquisition_channel: attribution.utm_source || 'direct',
    acquisition_date: user.created_at,
    referrer_id: attribution.referrer_user_id,
    
    // Engagement
    last_login: user.last_login_at,
    total_logins: user.login_count,
    
    // Product usage
    ai_generations_total: usage.ai_generations,
    projects_created: usage.projects,
    last_active: usage.last_event_at,
    
    // Gateway preference
    primary_gateway: user.preferred_gateway,
    
    // Support
    support_tickets: support.ticket_count,
    satisfaction_score: support.avg_rating,
  },
};
```

### Plan Mapping
```typescript
// Standardize plan names across gateways
const PLAN_MAPPING = {
  // Stripe plans
  'price_starter_usd': { name: 'Starter', currency: 'USD' },
  'price_growth_usd': { name: 'Growth', currency: 'USD' },
  'price_scale_usd': { name: 'Scale', currency: 'USD' },
  
  // Cashier plans
  'plan_starter_egp': { name: 'Starter', currency: 'EGP' },
  'plan_growth_egp': { name: 'Growth', currency: 'EGP' },
  'plan_scale_egp': { name: 'Scale', currency: 'EGP' },
};
```

## Cron Job Setup

### Sync Cron Endpoint
```typescript
// src/app/api/cron/chartmogul-sync/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  if (!process.env.CHARTMOGUL_SYNC_ENABLED) {
    return NextResponse.json({ 
      message: 'ChartMogul sync disabled' 
    });
  }
  
  const worker = new ChartMogulSyncWorker();
  
  try {
    // Sync transactions
    const transactionResults = await worker.syncTransactions();
    
    // Sync subscription cancellations
    await worker.syncCancellations();
    
    // Sync refunds
    await worker.syncRefunds();
    
    logger.info('ChartMogul sync completed:', transactionResults);
    
    return NextResponse.json({
      success: true,
      results: transactionResults,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('ChartMogul sync failed:', error);
    
    // Send alert
    await sendAdminAlert({
      type: 'chartmogul_sync_failure',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json({
      error: 'Sync failed',
      message: error.message,
    }, { status: 500 });
  }
}
```

### Cron Schedule Configuration
```bash
# Vercel cron configuration (vercel.json)
{
  "crons": [{
    "path": "/api/cron/chartmogul-sync",
    "schedule": "*/5 * * * *"  # Every 5 minutes
  }]
}

# Or use external cron service
*/5 * * * * curl -H "Authorization: Bearer $CRON_SECRET" https://app.sheenapps.com/api/cron/chartmogul-sync
```

## Dashboard Configuration

### Segmentation Setup
1. **By Gateway**
   - Create segments for each payment gateway
   - Compare performance across providers

2. **By Country**
   - Geographic revenue distribution
   - Currency impact analysis

3. **By Acquisition Channel**
   - UTM-based cohorts
   - Referral program effectiveness

4. **By Usage Level**
   - Power users vs casual users
   - Feature adoption impact on retention

### Key Reports

#### MRR Movement Report
```sql
-- SQL for validation against ChartMogul
SELECT 
  DATE_TRUNC('month', transaction_date) as month,
  SUM(CASE WHEN t.status = 'completed' THEN t.amount_cents END) / 100 as revenue,
  COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.user_id END) as customers,
  COUNT(CASE WHEN s.status = 'canceled' THEN 1 END) as churned
FROM transactions t
LEFT JOIN subscriptions s ON t.user_id = s.user_id
WHERE t.product_type = 'subscription'
GROUP BY month
ORDER BY month DESC;
```

#### Cohort Analysis
Configure ChartMogul cohorts:
- Monthly signup cohorts
- Plan-based cohorts  
- Gateway-based cohorts
- Referral vs organic cohorts

## Error Handling & Recovery

### Sync Failure Recovery
```typescript
// Retry failed syncs
export async function retryFailedSyncs(): Promise<void> {
  const { data: failed } = await supabase
    .from('transactions')
    .select('*')
    .not('chartmogul_sync_error', 'is', null)
    .lt('chartmogul_sync_attempts', 3)
    .order('created_at', { ascending: true })
    .limit(50);
  
  for (const transaction of failed || []) {
    try {
      await syncSingleTransaction(transaction);
      
      // Clear error
      await supabase
        .from('transactions')
        .update({
          chartmogul_sync_error: null,
          chartmogul_synced_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);
        
    } catch (error) {
      // Increment attempt count
      await supabase
        .from('transactions')
        .update({
          chartmogul_sync_attempts: transaction.chartmogul_sync_attempts + 1,
        })
        .eq('id', transaction.id);
    }
  }
}
```

### Data Validation
```typescript
// Validate sync accuracy
export async function validateSyncAccuracy(): Promise<ValidationResult> {
  // Compare local MRR with ChartMogul
  const localMRR = await calculateLocalMRR();
  const chartMogulMRR = await fetchChartMogulMRR();
  
  const variance = Math.abs(localMRR - chartMogulMRR) / localMRR;
  
  if (variance > 0.01) { // More than 1% variance
    await sendAdminAlert({
      type: 'mrr_variance_detected',
      localMRR,
      chartMogulMRR,
      variance: `${(variance * 100).toFixed(2)}%`,
    });
  }
  
  return {
    accurate: variance <= 0.01,
    localMRR,
    chartMogulMRR,
    variance,
  };
}
```

## Best Practices

### Do's
- Sync in small batches to avoid timeouts
- Map all custom attributes for segmentation
- Validate data accuracy regularly
- Handle currency conversions properly
- Use idempotent operations

### Don'ts
- Don't sync test/development data
- Don't expose API keys in client code
- Don't ignore sync failures
- Don't duplicate customers
- Don't mix currencies in calculations

## Monitoring & Alerts

### Key Metrics to Monitor
1. **Sync Health**
   - Success rate > 99%
   - Average sync duration < 30s
   - Failed transaction backlog < 100

2. **Data Quality**
   - MRR variance < 1%
   - Customer duplication rate < 0.1%
   - Missing attribute rate < 5%

3. **API Usage**
   - Rate limit utilization < 80%
   - API errors < 0.1%
   - Response time < 500ms

### Alert Configuration
```typescript
// Alert thresholds
const ALERT_THRESHOLDS = {
  sync_failure_rate: 0.05, // 5%
  sync_backlog: 1000, // transactions
  mrr_variance: 0.02, // 2%
  api_errors: 10, // per hour
};
```

## Troubleshooting

### Common Issues

1. **Duplicate Customers**
   - Cause: Email changes or multiple accounts
   - Solution: Use external_id as primary key
   - Prevention: Implement email merge logic

2. **Currency Mismatch**
   - Cause: Mixed currency transactions
   - Solution: Create separate plans per currency
   - Prevention: Validate currency consistency

3. **Sync Timeout**
   - Cause: Large batch size
   - Solution: Reduce batch size
   - Prevention: Implement pagination

4. **Missing Subscriptions**
   - Cause: Webhook failures
   - Solution: Backfill from gateway
   - Prevention: Implement webhook retry

---

*Last Updated: 27 June 2025*