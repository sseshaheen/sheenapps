-- Create build events table for progress tracking
CREATE TABLE IF NOT EXISTS project_build_events (
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(26) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_build_events_build_id ON project_build_events(build_id);
CREATE INDEX IF NOT EXISTS idx_build_events_composite ON project_build_events(build_id, id);

-- Create webhook failures table for retry logic
CREATE TABLE IF NOT EXISTS worker_webhook_failures (
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(26) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER DEFAULT 0,
  retry_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for retry queries
CREATE INDEX IF NOT EXISTS idx_webhook_failures_retry ON worker_webhook_failures(retry_at);

-- Add comment explaining the tables
COMMENT ON TABLE project_build_events IS 'Stores all build progress events for polling and real-time updates';
COMMENT ON TABLE worker_webhook_failures IS 'Stores failed webhook deliveries for retry with exponential backoff';
