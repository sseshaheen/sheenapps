-- 129_business_events_and_rollups.sql
-- Purpose: Create business_events and daily KPI rollups for Run Hub

-- Ensure crypto extension for gen_random_uuid if not already available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================
-- business_events (append-only)
-- =========================================
CREATE TABLE IF NOT EXISTS business_events (
  id               BIGSERIAL PRIMARY KEY,
  public_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL,
  event_type       TEXT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source           TEXT NOT NULL, -- sdk | webhook | server | manual

  actor_type       TEXT NULL,
  actor_id         TEXT NULL,
  entity_type      TEXT NULL,
  entity_id        TEXT NULL,

  session_id       TEXT NULL,
  anonymous_id     TEXT NULL,
  correlation_id   TEXT NULL,
  idempotency_key  TEXT NOT NULL,
  schema_version   SMALLINT NOT NULL DEFAULT 1,

  payload          JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Idempotency (unique forever per rule)
CREATE UNIQUE INDEX IF NOT EXISTS business_events_idem
  ON business_events (project_id, source, event_type, idempotency_key);

-- Query indexes
CREATE INDEX IF NOT EXISTS business_events_project_time
  ON business_events (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_events_project_type_time
  ON business_events (project_id, event_type, occurred_at DESC);

-- =========================================
-- business_kpi_daily (rollups)
-- =========================================
CREATE TABLE IF NOT EXISTS business_kpi_daily (
  project_id          UUID NOT NULL,
  date               DATE NOT NULL,
  currency_code      CHAR(3) NOT NULL,

  sessions            INTEGER NOT NULL DEFAULT 0,
  leads               INTEGER NOT NULL DEFAULT 0,
  signups             INTEGER NOT NULL DEFAULT 0,
  payments            INTEGER NOT NULL DEFAULT 0,
  refunds             INTEGER NOT NULL DEFAULT 0,

  revenue_cents       BIGINT NOT NULL DEFAULT 0,
  refunds_cents       BIGINT NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, date)
);
