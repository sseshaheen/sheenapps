-- Storage Security Enhancement: Prevent UPDATE operations on critical buckets
-- This prevents blob overwrites which could be a security vulnerability

-- Deny UPDATE operations on assets bucket (prevent accidental overwrites)
CREATE POLICY "Deny update assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'assets' AND false);

-- Deny UPDATE operations on builds bucket (prevent deployment tampering)
CREATE POLICY "Deny update builds" ON storage.objects
  FOR UPDATE USING (bucket_id = 'builds' AND false);

-- Note: DELETE operations are already denied in 0003_storage_setup.sql
-- This migration adds UPDATE denial for complete immutability

-- Optional: Add audit logging for storage operations (uncomment if needed)
CREATE TABLE IF NOT EXISTS storage_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL,
  object_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- INSERT, DELETE, UPDATE
  user_id UUID REFERENCES auth.users,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX idx_storage_audit_created_at ON storage_audit_log(created_at);
CREATE INDEX idx_storage_audit_user_id ON storage_audit_log(user_id);
