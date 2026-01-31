# Trust & Safety API Requirements

## ✅ Status: COMPLETED (September 2025)

This document specifies the required API structure for the Trust & Safety risk assessment feature. **The backend team has successfully implemented all requirements as of September 2025.**

## Implementation Status

The worker API at `/v1/admin/trust-safety/risk-scores` now returns:
- ✅ **Risk scores** (0-100 weighted calculation)
- ✅ **risk_factors object** with detailed breakdown (chargebacks, failed_payments, disputes, security_events, violations, suspicious_activity)
- ✅ **Actionable recommendations** based on risk level and specific factors
- ✅ **Comprehensive metrics** for dashboard display
- ✅ **Proper pagination** with total counts

## Required API Structure

### Endpoint: `GET /v1/admin/trust-safety/risk-scores`

#### Response Structure

```typescript
interface RiskScoresResponse {
  success: boolean
  risk_scores: UserRiskScore[]
  metrics: TrustSafetyMetrics
  correlation_id: string
  pagination?: {
    limit: number
    offset: number
    total: number
    returned: number
  }
}

interface UserRiskScore {
  user_id: string
  user_email: string
  risk_score: number  // 0-100
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  
  // ⚠️ REQUIRED: Currently missing from API response
  risk_factors: {
    chargebacks: number           // Count of chargebacks
    failed_payments: number       // Count of failed payment attempts
    disputes: number              // Count of disputes/complaints
    security_events: number       // Count of security incidents
    violations: number            // Count of policy violations
    suspicious_activity: number   // Count of suspicious activities
  }
  
  // Optional but recommended
  recommendations?: string[]      // Suggested actions for this user
  last_activity?: string         // ISO 8601 timestamp
  account_age_days?: number      // Days since account creation
  recent_actions?: {
    type: string
    timestamp: string
    details?: string
  }[]
}
```

### Example Response (What We Need)

```json
{
  "success": true,
  "risk_scores": [
    {
      "user_id": "user_123",
      "user_email": "user@example.com",
      "risk_score": 25,
      "risk_level": "medium",
      "risk_factors": {
        "chargebacks": 1,
        "failed_payments": 3,
        "disputes": 0,
        "security_events": 2,
        "violations": 0,
        "suspicious_activity": 1
      },
      "recommendations": [
        "Monitor payment activity",
        "Review recent security events",
        "Consider payment method verification"
      ],
      "last_activity": "2024-01-15T10:30:00Z",
      "account_age_days": 45
    },
    {
      "user_id": "user_456",
      "user_email": "normal@example.com",
      "risk_score": 5,
      "risk_level": "low",
      "risk_factors": {
        "chargebacks": 0,
        "failed_payments": 1,
        "disputes": 0,
        "security_events": 0,
        "violations": 0,
        "suspicious_activity": 0
      },
      "recommendations": [],
      "last_activity": "2024-01-15T09:15:00Z",
      "account_age_days": 120
    }
  ],
  "metrics": {
    "total_users": 1250,
    "high_risk_users": 12,
    "violations_today": 3,
    "security_events_today": 7,
    "pending_reviews": 5,
    "blocked_users": 2,
    "suspended_users": 8,
    "chargebacks": {
      "total": 15,
      "amount": 2500.00,
      "trend": "stable"
    },
    "fraud_detection": {
      "attempts_blocked": 23,
      "success_rate": 95.2
    }
  },
  "correlation_id": "abc-123-def",
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 2,
    "returned": 2
  }
}
```

## Risk Score Calculation Guidelines

### Scoring Formula

The risk score (0-100) should be calculated based on weighted factors:

| Factor | Weight | Points per Incident | Description |
|--------|--------|-------------------|-------------|
| Chargebacks | 30% | 15-20 points | Each chargeback significantly increases risk |
| Failed Payments | 20% | 3-5 points | Multiple failures indicate payment issues |
| Disputes | 20% | 8-12 points | Customer complaints and disputes |
| Security Events | 15% | 5-8 points | Login anomalies, suspicious IPs |
| Violations | 10% | 10-15 points | Policy violations, TOS breaches |
| Suspicious Activity | 5% | 2-4 points | Unusual patterns, rapid changes |

### Risk Level Thresholds

- **0-10**: Low risk (green) - Normal user behavior
- **11-30**: Medium risk (yellow) - Requires monitoring
- **31-60**: High risk (orange) - Immediate review needed
- **61-100**: Critical risk (red) - Consider suspension

### Example Calculation

User with:
- 1 chargeback = 15 points
- 3 failed payments = 9 points (3 × 3)
- 1 suspicious activity = 2 points
- **Total**: 26 points = Medium risk

## Individual User Risk Detail

### Endpoint: `GET /v1/admin/trust-safety/risk-score/{userId}`

#### Response Structure

```typescript
interface UserRiskDetailResponse {
  success: boolean
  user_risk: UserRiskScore  // Same structure as above
  
  // Additional detail for individual user view
  historical_scores?: {
    date: string
    score: number
    factors?: {
      chargebacks: number
      failed_payments: number
      disputes: number
      security_events: number
      violations: number
      suspicious_activity: number
    }
  }[]
  
  recent_events?: {
    type: 'chargeback' | 'failed_payment' | 'dispute' | 'security_event' | 'violation' | 'suspicious_activity'
    timestamp: string
    impact: number  // Impact on risk score (points added)
    description: string
  }[]
  
  correlation_id: string
}
```

## Implementation Priority

### Critical (Must Have)
1. **`risk_factors` object** - Without this, admins cannot understand risk scores
2. **Accurate calculations** - Scores should reflect actual user behavior
3. **Real-time data** - Use current database values, not hardcoded

### Important (Should Have)
1. **Recommendations** - Guide admin decisions with actionable suggestions
2. **Historical trends** - Show if risk is increasing/decreasing
3. **Recent events** - Provide context for score changes

### Nice to Have
1. **Event details** - Specific incidents that contributed to score
2. **Comparative analysis** - How user compares to average
3. **Predictive indicators** - Early warning signals

## Frontend Display Requirements

The admin panel needs the `risk_factors` data to display:

1. **Risk Score Badge** - Visual indicator with color coding
2. **Factor Breakdown** - Show each factor's contribution
3. **Details Dialog** - Comprehensive view when "Details" is clicked
4. **Recommendations** - Actionable steps for administrators
5. **Historical Trends** - Graph showing score changes over time

## Testing Checklist

- [ ] API returns `risk_factors` object for all users
- [ ] Risk scores match the factor calculations
- [ ] Recommendations are relevant to the risk factors
- [ ] Details dialog shows complete breakdown
- [ ] Pagination works correctly with total count
- [ ] Individual user endpoint provides additional detail

## Contact

For questions about this specification:
- Frontend Implementation: Admin Panel Team
- Backend Integration: Worker API Team
- Document Version: 1.0.0
- Last Updated: 2025-09-07