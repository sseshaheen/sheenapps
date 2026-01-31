-- Add i18n event code and params fields to project_build_events
-- Supporting structured internationalization for events

-- Add the new columns
ALTER TABLE project_build_events 
ADD COLUMN event_code VARCHAR(100),
ADD COLUMN event_params JSONB;

-- Add indexes for the new columns
CREATE INDEX idx_build_events_code ON project_build_events USING btree (event_code);
CREATE INDEX idx_build_events_code_params ON project_build_events USING gin (event_params);

-- Add comments for documentation
COMMENT ON COLUMN project_build_events.event_code IS 'Structured event code for i18n (BUILD_STARTED, BUILD_FAILED, etc.)';
COMMENT ON COLUMN project_build_events.event_params IS 'Raw primitive parameters for i18n message interpolation (JSON)';