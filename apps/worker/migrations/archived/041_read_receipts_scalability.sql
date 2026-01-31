-- Migration: 041_read_receipts_scalability.sql
-- Description: Add scalable read receipts and advisor network future-proofing tables
-- Date: 2025-08-24

-- Scalable read receipts without JSONB bloat
CREATE TABLE IF NOT EXISTS project_chat_read_receipts (
  project_id UUID NOT NULL,
  message_id BIGINT NOT NULL,
  user_id    UUID NOT NULL,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES project_chat_log_minimal(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Fast "mark up to" + unread counts optimization (consistent naming)
CREATE TABLE IF NOT EXISTS project_chat_last_read (
  project_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  last_seq   BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Project memberships for role-based features (with attribution tracking)  
CREATE TABLE IF NOT EXISTS project_memberships (
  project_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner','member','advisor','assistant')),
  source     TEXT, -- Future: 'manual', 'referral_link', 'system_recommendation'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Advisor assignments for one-click chat integration (with metadata for matching)
CREATE TABLE IF NOT EXISTS project_advisors (
  project_id UUID NOT NULL,
  advisor_id UUID NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('invited','active','removed')),
  added_by   UUID NOT NULL,
  metadata   JSONB DEFAULT '{}', -- Future: skills, languages, matching hints
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, advisor_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (advisor_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for read receipts performance (using regular indexes to avoid transaction block issues)
CREATE INDEX IF NOT EXISTS idx_read_receipts_user 
  ON project_chat_read_receipts(user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_last_read_project 
  ON project_chat_last_read(project_id, last_seq DESC);

-- Indexes for project memberships and advisor queries
CREATE INDEX IF NOT EXISTS idx_memberships_user_role 
  ON project_memberships(user_id, role);

CREATE INDEX IF NOT EXISTS idx_advisors_status 
  ON project_advisors(status, created_at DESC) 
  WHERE status IN ('invited', 'active');

-- Row Level Security for new tables
ALTER TABLE project_chat_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_chat_last_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_advisors ENABLE ROW LEVEL SECURITY;

-- Policies for read receipts (users can read/write their own receipts)
CREATE POLICY read_receipts_user_access ON project_chat_read_receipts
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

CREATE POLICY last_read_user_access ON project_chat_last_read
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- Policies for project memberships (project owners and members can read)
CREATE POLICY memberships_project_access ON project_memberships
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM projects p 
      WHERE p.id = project_id 
        AND (p.owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM project_collaborators pc 
          WHERE pc.project_id = p.id 
            AND pc.user_id = auth.uid() 
            AND pc.role IN ('owner', 'admin', 'editor')
        ))
    )
  );

-- Policies for project advisors (project owners can manage, advisors can see their assignments)
CREATE POLICY advisors_project_access ON project_advisors
  USING (
    advisor_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM projects p 
      WHERE p.id = project_id 
        AND (p.owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM project_collaborators pc 
          WHERE pc.project_id = p.id 
            AND pc.user_id = auth.uid() 
            AND pc.role IN ('owner', 'admin')
        ))
    )
  );

-- Function to update last_read with monotonic guarantees
CREATE OR REPLACE FUNCTION update_last_read_seq(
  p_project_id UUID,
  p_user_id UUID,
  p_seq BIGINT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO project_chat_last_read (project_id, user_id, last_seq, updated_at)
  VALUES (p_project_id, p_user_id, p_seq, NOW())
  ON CONFLICT (project_id, user_id) 
  DO UPDATE SET 
    last_seq = GREATEST(project_chat_last_read.last_seq, p_seq),
    updated_at = NOW();
END$$;

-- Helper function to get unread count for a user
CREATE OR REPLACE FUNCTION get_unread_count(
  p_project_id UUID,
  p_user_id UUID
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  max_seq BIGINT;
  last_read_seq BIGINT;
BEGIN
  -- Get the highest sequence number for this project
  SELECT COALESCE(MAX(seq), 0) INTO max_seq
  FROM project_chat_log_minimal 
  WHERE project_id = p_project_id;
  
  -- Get user's last read sequence
  SELECT COALESCE(last_seq, 0) INTO last_read_seq
  FROM project_chat_last_read 
  WHERE project_id = p_project_id AND user_id = p_user_id;
  
  -- Return unread count (bounded at 0)
  RETURN GREATEST(0, max_seq - last_read_seq);
END$$;