-- Audit Trail System for Security and Compliance
-- Tracks all changes to critical data

-- 📊 Audit log table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  
  -- Performance indexes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_operation ON audit_logs(operation);

-- RLS for audit logs (admins and data owners only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_read" ON audit_logs
  FOR SELECT USING (
    -- Users can see audits of their own data
    changed_by = auth.uid() OR
    -- Or if they have access to the related project
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = audit_logs.record_id::uuid
      AND (
        projects.owner_id = auth.uid() OR 
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  audit_user_id UUID;
  client_ip TEXT;
  client_agent TEXT;
BEGIN
  -- Get current user ID (may be NULL for system operations)
  audit_user_id := auth.uid();
  
  -- Try to get client info from current session
  client_ip := current_setting('app.client_ip', TRUE);
  client_agent := current_setting('app.client_user_agent', TRUE);
  
  -- Insert audit record
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      operation,
      old_values,
      new_values,
      changed_by,
      ip_address,
      user_agent
    ) VALUES (
      TG_TABLE_NAME,
      OLD.id,
      TG_OP,
      row_to_json(OLD),
      NULL,
      audit_user_id,
      client_ip,
      client_agent
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      operation,
      old_values,
      new_values,
      changed_by,
      ip_address,
      user_agent
    ) VALUES (
      TG_TABLE_NAME,
      NEW.id,
      TG_OP,
      row_to_json(OLD),
      row_to_json(NEW),
      audit_user_id,
      client_ip,
      client_agent
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      operation,
      old_values,
      new_values,
      changed_by,
      ip_address,
      user_agent
    ) VALUES (
      TG_TABLE_NAME,
      NEW.id,
      TG_OP,
      NULL,
      row_to_json(NEW),
      audit_user_id,
      client_ip,
      client_agent
    );
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for critical tables
CREATE TRIGGER audit_projects 
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_commits 
  AFTER INSERT OR UPDATE OR DELETE ON commits
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_branches 
  AFTER INSERT OR UPDATE OR DELETE ON branches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_assets 
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Audit retention policy (keep 2 years, then archive)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs 
  WHERE created_at < NOW() - INTERVAL '2 years';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  INSERT INTO audit_logs (
    table_name,
    record_id,
    operation,
    new_values,
    changed_by
  ) VALUES (
    'audit_logs',
    gen_random_uuid(),
    'CLEANUP',
    jsonb_build_object('deleted_count', deleted_count),
    NULL
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;