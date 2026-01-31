-- In-House Mode CMS Service (Phase 2)
-- Minimal collections + entries + media metadata

BEGIN;

-- -----------------------------------------------------------------------------
-- CONTENT TYPES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inhouse_content_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    schema JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inhouse_content_types_unique UNIQUE(project_id, slug)
);

COMMENT ON TABLE public.inhouse_content_types IS
'Content type definitions for in-house CMS (per project).';

CREATE INDEX IF NOT EXISTS idx_inhouse_content_types_project
  ON public.inhouse_content_types(project_id);

CREATE TRIGGER inhouse_content_types_set_updated_at
  BEFORE UPDATE ON public.inhouse_content_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- CONTENT ENTRIES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inhouse_content_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    content_type_id UUID NOT NULL REFERENCES public.inhouse_content_types(id) ON DELETE CASCADE,
    slug VARCHAR(255),
    data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inhouse_content_entries_status_valid
      CHECK (status IN ('draft', 'published', 'archived'))
);

COMMENT ON TABLE public.inhouse_content_entries IS
'Content entries for in-house CMS (per project + content type).';

CREATE INDEX IF NOT EXISTS idx_inhouse_content_entries_project
  ON public.inhouse_content_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_content_entries_type
  ON public.inhouse_content_entries(content_type_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_content_entries_status
  ON public.inhouse_content_entries(status);
CREATE INDEX IF NOT EXISTS idx_inhouse_content_entries_locale
  ON public.inhouse_content_entries(locale);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inhouse_content_entries_slug_unique
  ON public.inhouse_content_entries(content_type_id, slug, locale)
  WHERE slug IS NOT NULL;

CREATE TRIGGER inhouse_content_entries_set_updated_at
  BEFORE UPDATE ON public.inhouse_content_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- MEDIA METADATA
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inhouse_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes BIGINT,
    url TEXT NOT NULL,
    alt_text TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.inhouse_media IS
'Media metadata for in-house CMS; files stored in R2.';

CREATE INDEX IF NOT EXISTS idx_inhouse_media_project
  ON public.inhouse_media(project_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.inhouse_content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_content_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_content_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_content_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_media FORCE ROW LEVEL SECURITY;

CREATE POLICY inhouse_content_types_service_role
  ON public.inhouse_content_types
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY inhouse_content_entries_service_role
  ON public.inhouse_content_entries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY inhouse_media_service_role
  ON public.inhouse_media
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
