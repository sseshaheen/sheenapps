-- Migration: Drop FK constraints to auth.users on admin/audit tables
-- Reason: Preserves audit history when admin users are deleted
-- Date: 2026-01-28

-- Drop FK constraints (constraint names are auto-generated, find and drop them)

-- inhouse_admin_audit.admin_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'inhouse_admin_audit'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'inhouse_admin_audit'::regclass AND attname = 'admin_id')];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inhouse_admin_audit DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint % on inhouse_admin_audit.admin_id', fk_name;
  END IF;
END $$;

-- inhouse_quota_overrides.created_by
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'inhouse_quota_overrides'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'inhouse_quota_overrides'::regclass AND attname = 'created_by')];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inhouse_quota_overrides DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint % on inhouse_quota_overrides.created_by', fk_name;
  END IF;
END $$;

-- inhouse_quota_overrides.revoked_by
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'inhouse_quota_overrides'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'inhouse_quota_overrides'::regclass AND attname = 'revoked_by')];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inhouse_quota_overrides DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint % on inhouse_quota_overrides.revoked_by', fk_name;
  END IF;
END $$;

-- inhouse_alert_rules.created_by
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'inhouse_alert_rules'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'inhouse_alert_rules'::regclass AND attname = 'created_by')];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inhouse_alert_rules DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint % on inhouse_alert_rules.created_by', fk_name;
  END IF;
END $$;

-- inhouse_alerts.acknowledged_by
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'inhouse_alerts'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'inhouse_alerts'::regclass AND attname = 'acknowledged_by')];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inhouse_alerts DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint % on inhouse_alerts.acknowledged_by', fk_name;
  END IF;
END $$;

-- Add comments explaining why no FK
COMMENT ON COLUMN inhouse_admin_audit.admin_id IS 'No FK to auth.users - preserves audit history if admin deleted';
COMMENT ON COLUMN inhouse_quota_overrides.created_by IS 'No FK to auth.users - preserves audit trail if admin deleted';
COMMENT ON COLUMN inhouse_quota_overrides.revoked_by IS 'No FK to auth.users - preserves audit trail if admin deleted';
COMMENT ON COLUMN inhouse_alert_rules.created_by IS 'No FK to auth.users - preserves config if admin deleted';
COMMENT ON COLUMN inhouse_alerts.acknowledged_by IS 'No FK to auth.users - preserves alert history if admin deleted';
