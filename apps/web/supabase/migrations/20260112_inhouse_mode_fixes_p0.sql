-- =============================================================================
-- In-House Mode P0 Fixes
-- Addresses critical issues from expert review (deployment ID type, etc.)
-- =============================================================================

-- =============================================================================
-- P0 FIX 1: Change deployment ID from UUID to VARCHAR
-- Service generates readable IDs like "dpl_xxx" which don't fit UUID type
-- =============================================================================

-- First drop the existing primary key constraint
ALTER TABLE public.inhouse_deployments
DROP CONSTRAINT IF EXISTS inhouse_deployments_pkey;

-- Change the column type
ALTER TABLE public.inhouse_deployments
ALTER COLUMN id TYPE VARCHAR(64);

-- Re-add primary key
ALTER TABLE public.inhouse_deployments
ADD CONSTRAINT inhouse_deployments_pkey PRIMARY KEY (id);

-- Update default to remove UUID generation (will be set by service)
ALTER TABLE public.inhouse_deployments
ALTER COLUMN id DROP DEFAULT;

COMMENT ON COLUMN public.inhouse_deployments.id IS
'Deployment ID in format dpl_{timestamp}_{random} - readable and sortable';

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- This migration fixes:
-- 1. Deployment ID type mismatch - changed from UUID to VARCHAR(64)
--    The service generates readable IDs like "dpl_xxx" which are more
--    debuggable than UUIDs.
--
-- =============================================================================
