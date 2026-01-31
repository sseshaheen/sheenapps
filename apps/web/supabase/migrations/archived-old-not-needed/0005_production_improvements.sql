-- Production improvements based on feedback
-- 1. Add updated_at to commits for better archival management

ALTER TABLE commits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger for commits updated_at
CREATE TRIGGER update_commits_updated_at 
  BEFORE UPDATE ON commits 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Add DENY UPDATE policies for storage objects to prevent overwriting
DO $$
BEGIN
  -- Check if policies exist before creating them
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Deny update assets') THEN
    CREATE POLICY "Deny update assets" ON storage.objects
      FOR UPDATE USING (bucket_id = 'assets' AND false);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Deny update builds') THEN
    CREATE POLICY "Deny update builds" ON storage.objects
      FOR UPDATE USING (bucket_id = 'builds' AND false);
  END IF;
END $$;