# Integration Platform Migrations

## Current Migration Structure

### Main Migration File
- **074_unified_integration_platform_mena.sql** - Complete MENA-first integration platform schema

## Migration Overview

This migration creates a comprehensive integration platform with MENA-first prioritization:

### Key Features
1. **MENA-First Provider Ordering** - All enums and seed data prioritize Middle East providers
2. **Complete Idempotency** - Safe to run multiple times with DROP IF EXISTS and CREATE IF NOT EXISTS
3. **Enhanced Security** - Webhook bodies stored in R2/S3, not database
4. **Multi-Connection Support** - No unique constraints on provider per project
5. **Environment Separation** - Built-in dev/staging/prod environment support

### MENA Providers Included

#### Payment Providers
- Tap Payments (SA, AE, KW, BH, QA, OM, EG, JO, LB)
- Paymob (EG, SA, AE, PK, OM, PS)
- Tabby (BNPL - SA, AE, KW, BH, QA, EG)
- Tamara (BNPL - SA, AE, KW)
- Moyasar (SA only)
- PayTabs (Regional coverage)

#### Communication Providers
- Unifonic (WhatsApp Business API, SMS, Voice)
- Infobip (Omnichannel - WhatsApp, SMS, RCS, Viber)

#### Logistics Providers
- Aramex (Regional leader)
- SMSA Express (Saudi Arabia)
- Fetchr (UAE, SA, EG, JO, BH)

#### Cloud Providers
- AWS Middle East (me-south-1 - Bahrain)
- Azure Middle East (UAE regions)

### Tables Created
1. `integration_providers` - Provider registry with MENA metadata
2. `integration_connections` - Multi-connection support per provider
3. `integration_events` - Webhook event processing
4. `webhook_access_logs` - Audit trail for webhook body access
5. `integration_webhook_configs` - Webhook endpoint configuration
6. `integration_oauth_states` - OAuth state management
7. `integration_api_logs` - API call logging for debugging
8. `integration_metrics_hourly` - Performance metrics

### MENA-Specific Fields
- `is_mena_provider` - Boolean flag for MENA providers
- `supported_countries` - ISO country codes
- `supported_currencies` - ISO currency codes
- `primary_locale` - 'ar' for MENA, 'en' for international
- `payment_capabilities` - Array for capability-based selection

### Helper Functions
- `get_payment_providers_by_capability()` - Find providers by payment capability and country
- `update_integration_health()` - Health check updates
- `record_integration_metric()` - Metrics recording
- `cleanup_expired_oauth_states()` - OAuth cleanup

## Running the Migration

```bash
# Run the migration
psql -d your_database -f migrations/074_unified_integration_platform_mena.sql

# Verify the migration
psql -d your_database -c "SELECT provider, name, is_mena_provider FROM integration_providers ORDER BY is_mena_provider DESC, provider;"
```

## Rollback

The migration includes a rollback script at the bottom (commented out) that removes all created objects in the correct order.

## Important Notes

1. **Idempotent Design** - Can be run multiple times safely
2. **No Breaking Changes** - Preserves existing GitHub and Supabase integrations
3. **MENA Payment Methods** - Supports Mada, KNET, Benefit, OmanNet, Fawry, ValU
4. **Arabic First** - MENA providers default to Arabic locale
5. **Data Residency** - Regional cloud options for compliance

## Future Migrations

When adding new providers:
1. Add to the `integration_provider_type` enum
2. Insert provider configuration with full metadata
3. Consider MENA-first ordering
4. Include payment capabilities for payment providers
5. Specify supported countries and currencies