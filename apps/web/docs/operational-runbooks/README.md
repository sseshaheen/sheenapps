# Operational Runbooks

This directory contains operational procedures and runbooks for the SheenApps payment system.

## Quick Links

### 🚨 Emergency Procedures
- [Incident Response Playbook](./incident-response.md) - What to do when things go wrong
- [Payment Operations → Emergency Procedures](./payment-operations.md#emergency-procedures)

### 📊 Daily Operations
- [Payment Operations → Daily Operations](./payment-operations.md#daily-operations)
- [System Health Monitoring](./system-health-monitoring.md)

### 🛠️ Common Tasks
- [Payment Failure Handling](./payment-operations.md#payment-failure-handling)
- [Webhook Troubleshooting](./payment-operations.md#webhook-troubleshooting)
- [Subscription Management](./payment-operations.md#subscription-management)
- [Deployment Procedures](./deployment-procedures.md)

## Runbook Structure

### 1. [Payment Operations](./payment-operations.md)
Comprehensive guide for payment system operations including:
- Daily operational checklists
- Payment failure handling procedures
- Webhook troubleshooting
- Subscription management
- Emergency contacts and procedures

### 2. [Incident Response](./incident-response.md)
Step-by-step playbook for handling incidents:
- Severity level definitions
- Response procedures by incident type
- Communication templates
- Post-incident procedures
- Quick diagnostic commands

### 3. [System Health Monitoring](./system-health-monitoring.md)
Monitoring setup and procedures:
- Key Performance Indicators (KPIs)
- Monitoring stack configuration
- Alert thresholds and responses
- Performance optimization
- Maintenance schedules

### 4. [Deployment Procedures](./deployment-procedures.md)
Safe deployment practices:
- Pre-deployment checklists
- Deployment strategies (blue-green, feature flags)
- Rollback procedures
- Monitoring during deployment
- Communication plans

## Quick Reference Card

### On-Call Contacts
- **Primary**: oncall@sheenapps.com
- **Escalation**: cto@sheenapps.com
- **Stripe Support**: Enterprise Dashboard

### Severity Levels
- **SEV-1**: Service down, immediate response
- **SEV-2**: Degraded service, 30 min response
- **SEV-3**: Minor issues, 2 hour response

### Common Commands
```bash
# Check payment health
curl https://app.sheenapps.com/api/health/payment

# Trigger webhook retry
curl -X GET https://app.sheenapps.com/api/cron/webhook-retry \
  -H "Authorization: Bearer $CRON_SECRET"

# Recent failures
psql $DATABASE_URL -c "
SELECT COUNT(*) as failures 
FROM transactions 
WHERE status = 'failed' 
  AND created_at > NOW() - INTERVAL '1 hour'"
```

### Critical Metrics to Watch
1. Payment success rate < 95%
2. MRR drop > 5% daily
3. Webhook queue > 100
4. API response time > 1s
5. Database connections > 80%

## Training & Onboarding

### For New Team Members
1. Read through all runbooks
2. Shadow on-call rotation
3. Practice incident response scenarios
4. Review recent incident reports
5. Set up monitoring access

### Quarterly Reviews
- Update runbooks with new procedures
- Review and update thresholds
- Conduct incident response drills
- Update contact information
- Archive outdated procedures

## Contributing to Runbooks

### When to Update
- After any incident
- When adding new features
- When changing procedures
- After system architecture changes
- Based on team feedback

### Update Process
1. Create branch: `docs/update-runbook-[topic]`
2. Make changes with clear explanations
3. Get review from on-call team
4. Test any new procedures
5. Merge and announce to team

### Style Guide
- Use clear, concise language
- Include specific commands and queries
- Provide examples where possible
- Keep emergency procedures at the top
- Update version and date

---

*Last Updated: 27 June 2025*
*Version: 1.0*