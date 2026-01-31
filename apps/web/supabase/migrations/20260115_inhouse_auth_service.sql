-- In-House Mode Auth Service (Phase 2)
-- Email/password + magic link authentication for Easy Mode projects

BEGIN;

-- -----------------------------------------------------------------------------
-- USERS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inhouse_auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash TEXT,
    provider TEXT DEFAULT 'email',
    provider_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sign_in TIMESTAMPTZ,
    CONSTRAINT inhouse_auth_users_email_unique UNIQUE(project_id, email)
);

COMMENT ON TABLE public.inhouse_auth_users IS
'In-house auth users for Easy Mode projects (email/password + magic link).';

CREATE INDEX IF NOT EXISTS idx_inhouse_auth_users_project
  ON public.inhouse_auth_users(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_auth_users_email
  ON public.inhouse_auth_users(email);

-- -----------------------------------------------------------------------------
-- SESSIONS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inhouse_auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.inhouse_auth_users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT inhouse_auth_sessions_token_unique UNIQUE(token_hash)
);

COMMENT ON TABLE public.inhouse_auth_sessions IS
'Session tokens for Easy Mode auth users (hashed).';

CREATE INDEX IF NOT EXISTS idx_inhouse_auth_sessions_user
  ON public.inhouse_auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_auth_sessions_project
  ON public.inhouse_auth_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_auth_sessions_expires
  ON public.inhouse_auth_sessions(expires_at);

-- -----------------------------------------------------------------------------
-- MAGIC LINKS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inhouse_auth_magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.inhouse_auth_users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    CONSTRAINT inhouse_auth_magic_links_token_unique UNIQUE(token_hash)
);

COMMENT ON TABLE public.inhouse_auth_magic_links IS
'Magic link tokens for Easy Mode auth (hashed, single-use).';

CREATE INDEX IF NOT EXISTS idx_inhouse_auth_magic_links_project
  ON public.inhouse_auth_magic_links(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_auth_magic_links_email
  ON public.inhouse_auth_magic_links(email);
CREATE INDEX IF NOT EXISTS idx_inhouse_auth_magic_links_expires
  ON public.inhouse_auth_magic_links(expires_at);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.inhouse_auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_auth_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_auth_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_auth_magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_auth_magic_links FORCE ROW LEVEL SECURITY;

-- Service role only (system-managed)
CREATE POLICY inhouse_auth_users_service_role
  ON public.inhouse_auth_users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY inhouse_auth_sessions_service_role
  ON public.inhouse_auth_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY inhouse_auth_magic_links_service_role
  ON public.inhouse_auth_magic_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
