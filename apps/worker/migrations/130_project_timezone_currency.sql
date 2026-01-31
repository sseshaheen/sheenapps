-- 130_project_timezone_currency.sql
-- Purpose: Store project timezone and default currency for Run rollups

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'USD';
