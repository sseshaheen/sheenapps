-- =============================================================================
-- In-House Secrets Service
-- Secure storage for third-party API keys (Stripe, OpenAI, Resend, etc.)
-- Part of Easy Mode SDK Plan - Phase 1a (Prerequisite for payments/email/AI)
-- =============================================================================

-- =============================================================================
-- 1. SECRETS TABLE
-- =============================================================================

-- Encrypted secrets storage for Easy Mode projects
-- Uses envelope encryption: each secret has its own data key, encrypted by master key
CREATE TABLE IF NOT EXISTS public.inhouse_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Secret identification
    name VARCHAR(100) NOT NULL,                    -- e.g., "STRIPE_SECRET_KEY", "OPENAI_API_KEY"
    description TEXT,                              -- Optional description

    -- Encrypted value (envelope encryption)
    -- encrypted_value = AES-256-GCM(plaintext, data_key)
    -- encrypted_data_key = AES-256-GCM(data_key, master_key)
    encrypted_value BYTEA NOT NULL,               -- Encrypted secret value
    encrypted_data_key BYTEA NOT NULL,            -- Data key encrypted with master key
    encryption_iv BYTEA NOT NULL,                 -- IV used for value encryption
    data_key_iv BYTEA NOT NULL,                   -- IV used for data key encryption
    key_version INT NOT NULL DEFAULT 1,           -- Master key version (for rotation)

    -- Metadata (NOT encrypted - for filtering/search)
    -- NEVER store sensitive data here
    category VARCHAR(50),                          -- 'payment', 'email', 'ai', 'webhook', 'other'
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],          -- User-defined tags

    -- Access control
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Usage tracking
    last_accessed_at TIMESTAMPTZ,
    access_count BIGINT DEFAULT 0,

    -- Constraints
    CONSTRAINT inhouse_secrets_name_unique UNIQUE(project_id, name),
    CONSTRAINT inhouse_secrets_status_valid CHECK (status IN ('active', 'rotated', 'deleted')),
    CONSTRAINT inhouse_secrets_category_valid CHECK (
        category IS NULL OR category IN ('payment', 'email', 'ai', 'webhook', 'storage', 'other')
    ),
    CONSTRAINT inhouse_secrets_name_valid CHECK (
        name ~ '^[A-Z][A-Z0-9_]{0,99}$'  -- Env var style: UPPER_SNAKE_CASE
    )
);

COMMENT ON TABLE public.inhouse_secrets IS
'Encrypted secrets storage for Easy Mode projects. Uses envelope encryption for key rotation support.';

COMMENT ON COLUMN public.inhouse_secrets.encrypted_value IS
'Secret value encrypted with per-secret data key using AES-256-GCM';

COMMENT ON COLUMN public.inhouse_secrets.encrypted_data_key IS
'Data key encrypted with master key - allows key rotation without re-encrypting all secrets';

COMMENT ON COLUMN public.inhouse_secrets.key_version IS
'Master key version used for encryption - increment on key rotation';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_project ON public.inhouse_secrets(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_category ON public.inhouse_secrets(project_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_status ON public.inhouse_secrets(project_id, status);

-- =============================================================================
-- 2. SECRETS AUDIT LOG
-- =============================================================================

-- Comprehensive audit log for all secret operations
-- Required for security compliance and debugging
CREATE TABLE IF NOT EXISTS public.inhouse_secrets_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- What was accessed
    secret_id UUID REFERENCES public.inhouse_secrets(id) ON DELETE SET NULL,
    project_id UUID NOT NULL,                      -- Keep even if secret deleted
    secret_name VARCHAR(100) NOT NULL,             -- Keep even if secret deleted

    -- Who accessed
    actor_type VARCHAR(20) NOT NULL,               -- 'user', 'system', 'sdk'
    actor_id TEXT,                                 -- User ID or system identifier

    -- What happened
    action VARCHAR(30) NOT NULL,                   -- 'create', 'read', 'update', 'delete', 'rotate', 'list'

    -- Context
    source_ip INET,
    user_agent TEXT,
    sdk_version VARCHAR(50),                       -- @sheenapps/secrets version
    request_id TEXT,                               -- For correlation

    -- Result
    success BOOLEAN NOT NULL DEFAULT true,
    error_code VARCHAR(50),
    error_message TEXT,

    CONSTRAINT inhouse_secrets_audit_action_valid CHECK (
        action IN ('create', 'read', 'update', 'delete', 'rotate', 'list', 'bulk_read')
    ),
    CONSTRAINT inhouse_secrets_audit_actor_valid CHECK (
        actor_type IN ('user', 'system', 'sdk', 'worker')
    )
);

COMMENT ON TABLE public.inhouse_secrets_audit IS
'Audit log for all secret operations. Retained for 90 days for compliance.';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_audit_project_time
ON public.inhouse_secrets_audit(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_audit_secret
ON public.inhouse_secrets_audit(secret_id, created_at DESC)
WHERE secret_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_audit_actor
ON public.inhouse_secrets_audit(actor_id, created_at DESC)
WHERE actor_id IS NOT NULL;

-- Index for cleanup queries (retain 90 days)
-- Cleanup logic runs via pg_cron or scheduled job with:
-- DELETE FROM inhouse_secrets_audit WHERE created_at < NOW() - INTERVAL '90 days'
CREATE INDEX IF NOT EXISTS idx_inhouse_secrets_audit_cleanup
ON public.inhouse_secrets_audit(created_at);

-- =============================================================================
-- 3. KEY ROTATION TRACKING
-- =============================================================================

-- Track master key versions for rotation
CREATE TABLE IF NOT EXISTS public.inhouse_secrets_key_versions (
    version INT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,

    -- Key metadata (NOT the actual key)
    -- Actual master keys are stored in external KMS/Vault
    key_id_reference VARCHAR(255) NOT NULL,        -- Reference to key in KMS/Vault
    algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT inhouse_secrets_key_versions_status_valid CHECK (
        status IN ('pending', 'active', 'deprecated', 'retired')
    )
);

COMMENT ON TABLE public.inhouse_secrets_key_versions IS
'Tracks master key versions for key rotation. Actual keys stored in external KMS.';

-- Insert initial key version (idempotent)
INSERT INTO public.inhouse_secrets_key_versions (version, activated_at, key_id_reference, status)
VALUES (1, NOW(), 'sheenapps-secrets-master-v1', 'active')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- 4. RLS POLICIES
-- =============================================================================

ALTER TABLE public.inhouse_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_secrets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_secrets_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_secrets_audit FORCE ROW LEVEL SECURITY;

-- Secrets: Users can only access their project's secrets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their project secrets' AND tablename = 'inhouse_secrets'
    ) THEN
        CREATE POLICY "Users can view their project secrets"
        ON public.inhouse_secrets FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.projects p
                WHERE p.id = project_id AND p.owner_id = auth.uid()
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their project secrets' AND tablename = 'inhouse_secrets'
    ) THEN
        CREATE POLICY "Users can manage their project secrets"
        ON public.inhouse_secrets FOR ALL
        USING (
            EXISTS (
                SELECT 1 FROM public.projects p
                WHERE p.id = project_id AND p.owner_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Audit: Users can view audit logs for their projects
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their project audit logs' AND tablename = 'inhouse_secrets_audit'
    ) THEN
        CREATE POLICY "Users can view their project audit logs"
        ON public.inhouse_secrets_audit FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.projects p
                WHERE p.id = project_id AND p.owner_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Audit: Insert-only for system (users can't modify audit logs)
-- Note: Audit writes happen via service role, not user context

-- =============================================================================
-- 5. HELPER FUNCTIONS
-- =============================================================================

-- Function to record audit entries (called from API layer)
CREATE OR REPLACE FUNCTION public.record_secret_audit(
    p_secret_id UUID,
    p_project_id UUID,
    p_secret_name VARCHAR(100),
    p_actor_type VARCHAR(20),
    p_actor_id TEXT,
    p_action VARCHAR(30),
    p_source_ip INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_sdk_version VARCHAR(50) DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_code VARCHAR(50) DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO public.inhouse_secrets_audit (
        secret_id, project_id, secret_name,
        actor_type, actor_id, action,
        source_ip, user_agent, sdk_version, request_id,
        success, error_code, error_message
    )
    VALUES (
        p_secret_id, p_project_id, p_secret_name,
        p_actor_type, p_actor_id, p_action,
        p_source_ip, p_user_agent, p_sdk_version, p_request_id,
        p_success, p_error_code, p_error_message
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_secret_audit IS
'Records an audit entry for secret operations. Called by API layer after each operation.';

-- Function to update secret access tracking
CREATE OR REPLACE FUNCTION public.record_secret_access(p_secret_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.inhouse_secrets
    SET
        last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE id = p_secret_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_secret_access IS
'Updates access tracking for a secret. Called after successful read operations.';

-- =============================================================================
-- 6. TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_inhouse_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inhouse_secrets_updated_at ON public.inhouse_secrets;
CREATE TRIGGER trigger_inhouse_secrets_updated_at
BEFORE UPDATE ON public.inhouse_secrets
FOR EACH ROW
EXECUTE FUNCTION public.update_inhouse_secrets_updated_at();

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- This migration adds:
-- 1. inhouse_secrets table with envelope encryption support
-- 2. inhouse_secrets_audit table for comprehensive audit logging
-- 3. inhouse_secrets_key_versions table for master key rotation tracking
-- 4. RLS policies for project-scoped access
-- 5. Helper functions for audit logging and access tracking
--
-- Encryption design:
-- - Each secret has its own data key (DEK)
-- - Data keys are encrypted with master key (KEK)
-- - Master key stored in external KMS (referenced by key_id_reference)
-- - Key rotation: new secrets use new master key, old secrets re-encrypted on access
--
-- Security guarantees:
-- - Secrets never leave server (sheen_sk_* only)
-- - All operations logged to audit table
-- - Plaintext never stored in database
-- - Key rotation without downtime
-- =============================================================================
