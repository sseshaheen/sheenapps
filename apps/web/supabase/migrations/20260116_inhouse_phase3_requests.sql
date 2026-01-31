-- =============================================================================
-- In-House Mode Phase 3: Custom Domains + Eject Requests
-- =============================================================================

-- 1) Custom domains tracking
CREATE TABLE IF NOT EXISTS public.inhouse_custom_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed')),
    ssl_status TEXT NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
    verification_method TEXT NOT NULL DEFAULT 'cname' CHECK (verification_method IN ('cname', 'txt')),
    verification_token TEXT,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.inhouse_custom_domains IS
'Custom domain requests for Easy Mode projects (Phase 3 placeholders).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_inhouse_custom_domains_domain
ON public.inhouse_custom_domains (domain);

CREATE INDEX IF NOT EXISTS idx_inhouse_custom_domains_project
ON public.inhouse_custom_domains (project_id);

CREATE TRIGGER inhouse_custom_domains_set_updated_at
  BEFORE UPDATE ON public.inhouse_custom_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Eject requests tracking
CREATE TABLE IF NOT EXISTS public.inhouse_eject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'reviewing', 'approved', 'rejected', 'completed', 'failed')),
    reason TEXT,
    details JSONB,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.inhouse_eject_requests IS
'Tracks Easy Mode eject requests for admin visibility (Phase 3 placeholders).';

CREATE INDEX IF NOT EXISTS idx_inhouse_eject_requests_project
ON public.inhouse_eject_requests (project_id);

CREATE INDEX IF NOT EXISTS idx_inhouse_eject_requests_status
ON public.inhouse_eject_requests (status);

CREATE TRIGGER inhouse_eject_requests_set_updated_at
  BEFORE UPDATE ON public.inhouse_eject_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) RLS policies
ALTER TABLE public.inhouse_custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_custom_domains FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_eject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_eject_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY inhouse_custom_domains_service_role
  ON public.inhouse_custom_domains
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY inhouse_eject_requests_service_role
  ON public.inhouse_eject_requests
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
