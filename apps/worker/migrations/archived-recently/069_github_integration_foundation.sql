-- Migration: GitHub Integration Foundation
-- GitHub App integration with enhanced SHA tracking and sync operations
-- Based on expert architectural review recommendations

BEGIN;

-- Add GitHub integration columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_owner VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_branch VARCHAR(255) DEFAULT 'main';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_installation_id BIGINT; -- GitHub App installation ID
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_sync_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_sync_mode VARCHAR(20) DEFAULT 'protected_pr'; -- direct_commit, protected_pr, hybrid
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_webhook_secret VARCHAR(255);

-- Enhanced SHA tracking for conflict detection and debugging (Expert recommendation)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_remote_main_sha VARCHAR(40); -- Latest seen on GitHub main
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_synced_main_sha VARCHAR(40); -- Last commit we mirrored locally  
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_outbound_base_sha VARCHAR(40); -- What our PR was based on
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_github_sync_at TIMESTAMPTZ;

-- Track all sync operations for debugging and monitoring
CREATE TABLE IF NOT EXISTS github_sync_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL, -- 'push', 'pull', 'conflict', 'webhook'
    status VARCHAR(50) NOT NULL, -- 'pending', 'processing', 'success', 'failed', 'cancelled'
    direction VARCHAR(10) NOT NULL, -- 'to_github', 'from_github'
    
    -- GitHub data
    github_commit_sha VARCHAR(40),
    github_commit_message TEXT,
    github_author_name VARCHAR(255),
    github_author_email VARCHAR(255),
    
    -- Local data  
    local_version_id VARCHAR(255),
    local_commit_sha VARCHAR(40),
    
    -- Operation details
    files_changed INTEGER DEFAULT 0,
    insertions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    conflicts_detected INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata (for delivery IDs, webhook payloads, etc.)
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_github_sync_project_status ON github_sync_operations(project_id, status);
CREATE INDEX IF NOT EXISTS idx_github_sync_created_at ON github_sync_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_sync_operation_type ON github_sync_operations(operation_type, created_at DESC);

-- Index on projects for GitHub sync queries
CREATE INDEX IF NOT EXISTS idx_projects_github_sync_enabled ON projects(github_sync_enabled) WHERE github_sync_enabled = true;

COMMIT;