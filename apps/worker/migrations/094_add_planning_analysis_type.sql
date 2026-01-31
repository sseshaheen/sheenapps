BEGIN;

-- Add 'planning' to allowed analysis types in migration_analysis table
-- This stores the AI-generated migration plan with component mappings
ALTER TABLE migration_analysis
  DROP CONSTRAINT IF EXISTS ck_migration_analysis_type;

ALTER TABLE migration_analysis
  ADD CONSTRAINT ck_migration_analysis_type CHECK (
    analysis_type IN (
      'preliminary',
      'detailed',
      'planning',
      'technology_scan',
      'content_structure',
      'asset_inventory',
      'quality_gates'
    )
  );

COMMIT;
