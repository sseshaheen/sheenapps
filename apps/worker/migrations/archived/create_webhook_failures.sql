-- Create webhook failures tracking table
CREATE TABLE IF NOT EXISTS worker_webhook_failures (
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(26) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER DEFAULT 0,
  retry_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_error TEXT,
  webhook_url TEXT NOT NULL
);

-- Index for efficient retry processing
CREATE INDEX IF NOT EXISTS idx_webhook_failures_retry ON worker_webhook_failures(retry_at) WHERE attempts < 5;

-- Index for build_id lookups
CREATE INDEX IF NOT EXISTS idx_webhook_failures_build_id ON worker_webhook_failures(build_id);
