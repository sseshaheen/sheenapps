-- Create storage buckets with idempotency guard for CI replays
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public) VALUES 
    ('objects', 'objects', true),
    ('assets', 'assets', false),  
    ('builds', 'builds', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Objects bucket: public read for CDN
CREATE POLICY "Public read objects" ON storage.objects
  FOR SELECT USING (bucket_id = 'objects');

-- Assets bucket: private with signed URLs
CREATE POLICY "Authenticated read assets" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'assets' AND 
    auth.role() = 'authenticated'
  );

CREATE POLICY "Project members upload assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'assets' AND
    auth.role() = 'authenticated' AND
    -- Check project access via hardened path pattern: assets/{project_id}/{hash}
    -- Sanitize path to prevent traversal attacks
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id::text = regexp_replace(split_part(name, '/', 1), '[^a-f0-9-]', '', 'g')
      AND (
        projects.owner_id = auth.uid() OR 
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Deny all delete/update operations on assets & builds (prevent accidental deletion/overwrite)
CREATE POLICY "Deny delete assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'assets' AND false);

CREATE POLICY "Deny update assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'assets' AND false);

CREATE POLICY "Deny delete builds" ON storage.objects  
  FOR DELETE USING (bucket_id = 'builds' AND false);

CREATE POLICY "Deny update builds" ON storage.objects  
  FOR UPDATE USING (bucket_id = 'builds' AND false);

-- Builds bucket: service role only
CREATE POLICY "Service role builds" ON storage.objects
  FOR ALL USING (
    bucket_id = 'builds' AND 
    auth.role() = 'service_role'
  );