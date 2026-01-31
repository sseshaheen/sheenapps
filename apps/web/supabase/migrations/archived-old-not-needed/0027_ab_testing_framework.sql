-- A/B Testing Framework for Component Mappings
-- This migration creates the tables needed for A/B testing different component mappings

-- Create A/B Tests table
CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'paused')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  traffic_percentage INTEGER NOT NULL DEFAULT 100 CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create A/B Test Variants table
CREATE TABLE ab_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_control BOOLEAN NOT NULL DEFAULT FALSE,
  traffic_percentage INTEGER NOT NULL DEFAULT 50 CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100),
  component_mappings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create A/B Test Assignments table
CREATE TABLE ab_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure each user/session is only assigned once per test
  CONSTRAINT unique_assignment_per_test UNIQUE (test_id, session_id)
);

-- Create A/B Test Results table
CREATE TABLE ab_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('conversion', 'error', 'engagement')),
  event_data JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_ab_tests_status ON ab_tests(status);
CREATE INDEX idx_ab_tests_dates ON ab_tests(start_date, end_date);
CREATE INDEX idx_ab_test_variants_test_id ON ab_test_variants(test_id);
CREATE INDEX idx_ab_test_assignments_test_session ON ab_test_assignments(test_id, session_id);
CREATE INDEX idx_ab_test_assignments_user ON ab_test_assignments(user_id);
CREATE INDEX idx_ab_test_results_test_variant ON ab_test_results(test_id, variant_id);
CREATE INDEX idx_ab_test_results_timestamp ON ab_test_results(timestamp);

-- Create updated_at trigger for ab_tests
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ab_tests_updated_at
  BEFORE UPDATE ON ab_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create partial unique index to ensure only one control variant per test
CREATE UNIQUE INDEX unique_control_per_test 
  ON ab_test_variants (test_id) 
  WHERE is_control = TRUE;

-- Insert sample A/B test for component mappings
INSERT INTO ab_tests (name, description, status, start_date, traffic_percentage) VALUES
('hero_component_mapping', 'Test different mappings for Hero components', 'draft', NOW(), 50);

-- Get the test ID for variants
DO $$
DECLARE
  test_id UUID;
BEGIN
  SELECT id INTO test_id FROM ab_tests WHERE name = 'hero_component_mapping';
  
  -- Insert control variant (current mapping)
  INSERT INTO ab_test_variants (test_id, name, description, is_control, traffic_percentage, component_mappings) VALUES
  (test_id, 'control', 'Current Hero → hero mapping', TRUE, 50, '[
    {"ai_component_name": "Hero", "builder_section_type": "hero", "priority": 100},
    {"ai_component_name": "ServicesMenu", "builder_section_type": "features", "priority": 200},
    {"ai_component_name": "BookingCalendar", "builder_section_type": "cta", "priority": 300}
  ]');
  
  -- Insert test variant (alternative mapping)
  INSERT INTO ab_test_variants (test_id, name, description, is_control, traffic_percentage, component_mappings) VALUES
  (test_id, 'hero_as_cta', 'Test Hero → cta mapping for higher conversion', FALSE, 50, '[
    {"ai_component_name": "Hero", "builder_section_type": "cta", "priority": 100},
    {"ai_component_name": "ServicesMenu", "builder_section_type": "features", "priority": 200},
    {"ai_component_name": "BookingCalendar", "builder_section_type": "hero", "priority": 300}
  ]');
END $$;

-- Add RLS policies for security
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_results ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active tests
CREATE POLICY "Users can view active tests" ON ab_tests
  FOR SELECT TO authenticated
  USING (status = 'active');

-- Allow authenticated users to read variants for active tests
CREATE POLICY "Users can view variants for active tests" ON ab_test_variants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ab_tests 
    WHERE ab_tests.id = ab_test_variants.test_id 
    AND ab_tests.status = 'active'
  ));

-- Allow users to read their own assignments
CREATE POLICY "Users can view their assignments" ON ab_test_assignments
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR 
    session_id = current_setting('app.session_id', true)
  );

-- Allow users to create assignments
CREATE POLICY "Users can create assignments" ON ab_test_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR 
    session_id = current_setting('app.session_id', true)
  );

-- Allow users to create results
CREATE POLICY "Users can create results" ON ab_test_results
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR 
    session_id = current_setting('app.session_id', true)
  );

-- Allow authenticated users to manage everything (TODO: Restrict to admins once role system is implemented)
CREATE POLICY "Authenticated users can manage all tests" ON ab_tests
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage all variants" ON ab_test_variants
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view all assignments" ON ab_test_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view all results" ON ab_test_results
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Add helpful comments
COMMENT ON TABLE ab_tests IS 'A/B tests for component mappings and other features';
COMMENT ON TABLE ab_test_variants IS 'Variants within each A/B test with different configurations';
COMMENT ON TABLE ab_test_assignments IS 'User assignments to specific test variants';
COMMENT ON TABLE ab_test_results IS 'Results and events tracked for each test variant';
COMMENT ON COLUMN ab_test_variants.component_mappings IS 'JSON array of component mapping overrides for this variant';
COMMENT ON COLUMN ab_test_results.event_data IS 'Additional data associated with the tracked event';