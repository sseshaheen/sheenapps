# SheenApps Billing Metrics Contract

**Date**: September 2, 2025  
**Status**: Expert-Validated Definition Standard  
**Purpose**: Single source of truth for billing metrics to prevent team confusion

## 🎯 **Why This Document Exists**

**Expert Recommendation**: *"Create /docs/METRICS_CONTRACT.md with exact formulas (MRR, ARR, NRR, GRR, churn, ARPU), inclusion/exclusion rules (e.g., trials, paused), and data sources. Link it from the admin UI tooltips."*

This document ensures everyone (Engineering, Customer Success, Finance, Executive team) uses the same definitions for billing metrics.

---

## 💰 **Revenue Metrics**

### **Monthly Recurring Revenue (MRR) - Multi-Currency**
- **Definition**: Normalized monthly value of active subscriptions across USD, EUR, GBP, EGP, SAR
- **Formula**: `SUM(subscription_amount / billing_interval_months)` per currency, with USD normalization
- **Query Source**: 
  ```sql
  -- By Currency (Corrected Schema)
  SELECT 
    bs.currency,
    bs.payment_provider,
    SUM(
      CASE 
        WHEN pi.billing_interval = 'month' THEN bs.amount_cents
        WHEN pi.billing_interval = 'year' THEN bs.amount_cents / 12
        ELSE bs.amount_cents
      END
    ) AS mrr_cents
  FROM billing_subscriptions bs
  JOIN pricing_items pi ON pi.id = bs.pricing_item_id
  WHERE bs.status IN ('active', 'trialing', 'past_due')
  GROUP BY bs.currency, bs.payment_provider;
  
  -- USD Normalized (for executive reporting)
  SELECT SUM(mrr_usd_normalized) FROM mv_mrr_usd_normalized;
  ```
- **Multi-Currency Handling**:
  - **Native Currency MRR**: Track USD, EUR, GBP, EGP, SAR separately
  - **USD Normalization**: Use daily exchange rates for consolidated reporting
  - **Exchange Rate Source**: Provider rates + manual overrides for regional currencies
  - **Provider Attribution**: Track which payment provider processed each subscription
- **Inclusions**: Active subscriptions, trialing users, past_due accounts (still trying to collect)
- **Data Source**: `billing_subscriptions` + `pricing_items` + `exchange_rates`
- **Refresh**: Materialized view updated every 15 minutes, exchange rates daily

### **Annual Recurring Revenue (ARR)**
- **Definition**: Annualized version of MRR
- **Formula**: `MRR × 12`
- **Purpose**: Executive reporting, investor metrics, forecasting
- **Note**: ARR is always derived from MRR, never calculated independently

### **Gross Revenue Retention (GRR)**
- **Definition**: Percentage of revenue retained from existing customers (excludes expansion)
- **Formula**: `(Start MRR + Downgrades - Churn) / Start MRR`
- **Purpose**: Measures base business health without growth effects
- **Calculation Period**: Monthly cohorts

### **Net Revenue Retention (NRR)**
- **Definition**: Percentage of revenue retained including expansion/upsells
- **Formula**: `(Start MRR + Expansion + Downgrades - Churn) / Start MRR`
- **Purpose**: Measures growth from existing customer base
- **Target**: >100% indicates expansion exceeds churn

---

## 👥 **Customer Metrics**

### **Customer Health Score (0-100)**
- **Definition**: Predictive score indicating likelihood to remain a paying customer
- **Formula**: Weighted sum of 5 factors totaling 100 points
- **Components**:
  1. **Usage Trend (35% weight)**: 30-day vs 60-day AI consumption
     - 35 points: Usage increasing or stable
     - 20 points: Slight decline (10-25%)
     - 10 points: Moderate decline (25-50%)
     - 0 points: Severe decline (>50%)
  
  2. **Payment Risk (25% weight)**: Failed payments in last 90 days
     - 25 points: No payment failures
     - 15 points: 1 failure, resolved
     - 5 points: 2-3 failures
     - 0 points: 4+ failures or current failure
  
  3. **Minutes Runway (20% weight)**: Available time vs consumption rate
     - 20 points: >30 days runway
     - 15 points: 14-30 days runway  
     - 10 points: 7-14 days runway
     - 0 points: <7 days runway
  
  4. **Last Activity (10% weight)**: Days since last login
     - 10 points: Active within 7 days
     - 7 points: Active within 14 days
     - 3 points: Active within 30 days
     - 0 points: Inactive >30 days
  
  5. **Support Friction (10% weight)**: Support tickets in last 30 days
     - 10 points: 0 tickets
     - 7 points: 1 ticket, resolved
     - 3 points: 2-3 tickets
     - 0 points: 4+ tickets or unresolved issues

- **Risk Levels**:
  - **High Risk**: Score 0-40 (immediate intervention needed)
  - **Medium Risk**: Score 41-70 (monitor closely)
  - **Low Risk**: Score 71-100 (healthy customer)

- **Data Sources**: `ai_time_ledger`, `billing_payments`, `auth.users`, `support_tickets`

### **Churn Rate**
- **Definition**: Percentage of customers who canceled in a given period
- **Formula**: `(Customers Canceled in Month) / (Total Customers at Start of Month)`
- **Calculation**: Monthly cohort-based
- **Inclusions**: Voluntary cancellations, involuntary cancellations (failed payments)
- **Exclusions**: Pauses (temporary), downgrades (still paying)

---

## 💳 **Multi-Provider Metrics (SheenApps Specific)**

### **Provider Success Rate**
- **Definition**: Percentage of successful payment attempts per provider
- **Formula**: `(Successful Payments / Total Payment Attempts) × 100`
- **Query Source**:
  ```sql
  SELECT 
    payment_provider,
    currency,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful,
    ROUND(
      (SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END)::float / COUNT(*)) * 100, 2
    ) as success_rate_pct
  FROM billing_payments 
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY payment_provider, currency
  ORDER BY payment_provider, currency;
  ```
- **Target Success Rates**:
  - **Stripe**: >97% (global baseline)
  - **Regional Providers**: >93% (Egypt/Saudi markets)
  - **Cash/Voucher Providers (Fawry)**: >85% (completion dependent)

### **Regional Revenue Distribution**
- **Definition**: MRR breakdown by region and payment method
- **Purpose**: Track market penetration and payment preference patterns
- **Query Source**:
  ```sql
  SELECT 
    bs.currency,
    bs.payment_provider,
    COUNT(DISTINCT bs.customer_id) as active_customers,
    SUM(bs.amount_cents) as total_mrr_cents,
    ROUND(AVG(bs.amount_cents), 0) as avg_subscription_cents
  FROM billing_subscriptions bs
  WHERE bs.status IN ('active', 'trialing', 'past_due')
  GROUP BY bs.currency, bs.payment_provider
  ORDER BY total_mrr_cents DESC;
  ```

### **Provider Cost Analysis**
- **Definition**: Transaction fee comparison across payment providers
- **Formula**: `Total Fees / Total Volume` per provider
- **Purpose**: Optimize provider routing for cost efficiency
- **Data Source**: `billing_payments.provider_metadata` (fees) + `billing_payments.amount_cents`

---

## ⏱️ **Time-Based Metrics (SheenApps Specific)**

### **Minutes Liability**
- **Definition**: Total AI time owed to customers (paid + bonus)
- **Components**:
  - Paid seconds from active subscriptions
  - Purchased package seconds (unexpired)
  - Bonus daily seconds for free tier
  - Rollover seconds from previous periods
- **Breakdown by Expiry**:
  - Next 30 days
  - 31-60 days  
  - 61-90 days
  - Beyond 90 days

### **Average Revenue Per User (ARPU)**
- **Definition**: Average monthly revenue per paying customer
- **Formula**: `MRR / Active Paying Customers`
- **Excludes**: Free tier users (no revenue)
- **Purpose**: Pricing strategy, market positioning

---

## 🔄 **Operational Metrics**

### **Dunning Recovery Rate**
- **Definition**: Percentage of failed payments successfully recovered
- **Formula**: `Recovered Payments / Total Failed Payments`
- **Industry Benchmark**: 25-38% (Stripe/Chargebee standard)
- **Tracking Window**: 30 days from initial failure

### **Payment Failure Rate**
- **Definition**: Percentage of payment attempts that fail
- **Formula**: `Failed Payments / Total Payment Attempts`
- **Target**: <2% monthly failure rate
- **Breakdown**: By failure reason (insufficient_funds, expired_card, etc.)

---

## 📊 **Data Sources & Refresh**

| Metric | Primary Table | Refresh Frequency | Query Performance Target |
|--------|---------------|-------------------|-------------------------|
| MRR | `mv_mrr_by_currency` | 15 minutes | p95 < 300ms |
| Health Score | `billing_customers` | Daily | p95 < 500ms |
| Churn Rate | `mv_churn_monthly` | Daily | p95 < 200ms |
| Minutes Liability | `ai_time_ledger` | Real-time | p95 < 100ms |
| Provider Performance | `billing_payments` | Hourly | p95 < 250ms |

---

## 🚨 **Data Quality Rules**

### **Critical Validations**
1. **Multi-Provider MRR Reconciliation**: Must match primary provider (Stripe) dashboard within 1-2%, regional providers within 3-5%
2. **Cross-Currency Churn Math**: `Start MRR + New + Expansion - Contraction - Churn = End MRR` per currency
3. **Health Score Integrity**: All factors must sum to exactly 100 points
4. **Minutes Conservation**: Minutes added must equal minutes consumed + remaining (tracked in ai_time_ledger)
5. **Provider Attribution**: All payments must map to valid payment_provider_key enum

### **Automated Alerts**
- MRR variance >3% from primary providers → Alert Finance team
- Provider-specific failure rate >5% → Alert DevOps team
- Health score calculation errors → Alert Engineering
- Dunning recovery rate <20% → Alert Customer Success
- Cross-currency exchange rate gaps >24h → Alert Finance team

---

## 🔗 **UI Integration**

All metrics in the admin dashboard must:
1. **Link to this document**: Tooltip icon links to relevant section
2. **Show data freshness**: "Last updated 5 minutes ago"
3. **Display confidence**: "±1.2% margin vs Stripe"
4. **Provide breakdown**: Click to see component parts

---

## 📋 **Approval & Updates**

- **Document Owner**: Engineering Lead
- **Review Frequency**: Monthly
- **Change Approval**: Finance + Engineering sign-off required
- **Version History**: Track all formula changes with business justification

---

**Expert Quote**: *"Ship it with the tweaks above, and you'll be within striking distance of Stripe/Chargebee-class admin in a quarter."*