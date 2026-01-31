-- Migration: 125_inhouse_search.sql
-- Description: Schema for @sheenapps/search SDK - full-text search with PostgreSQL FTS

BEGIN;

-- ============================================================================
-- Search Indexes Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_search_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  searchable_fields TEXT[] NOT NULL DEFAULT '{}',
  field_weights JSONB NOT NULL DEFAULT '{}',
  language VARCHAR(50) NOT NULL DEFAULT 'english',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique index name per project
  CONSTRAINT uq_inhouse_search_indexes_project_name UNIQUE (project_id, name),

  -- Validate language is a supported PostgreSQL text search config
  CONSTRAINT chk_inhouse_search_indexes_language CHECK (
    language IN ('simple', 'arabic', 'armenian', 'basque', 'catalan', 'danish',
    'dutch', 'english', 'finnish', 'french', 'german', 'greek', 'hindi',
    'hungarian', 'indonesian', 'irish', 'italian', 'lithuanian', 'nepali',
    'norwegian', 'portuguese', 'romanian', 'russian', 'serbian', 'spanish',
    'swedish', 'tamil', 'turkish', 'yiddish')
  )
);

-- Index for listing indexes by project
CREATE INDEX IF NOT EXISTS idx_inhouse_search_indexes_project
  ON inhouse_search_indexes(project_id);

-- ============================================================================
-- Search Documents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  index_id UUID NOT NULL REFERENCES inhouse_search_indexes(id) ON DELETE CASCADE,
  doc_id VARCHAR(255) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique doc_id per index
  CONSTRAINT uq_inhouse_search_documents_index_docid UNIQUE (index_id, doc_id)
);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_inhouse_search_documents_vector
  ON inhouse_search_documents USING GIN (search_vector);

-- Index for listing documents by index
CREATE INDEX IF NOT EXISTS idx_inhouse_search_documents_index
  ON inhouse_search_documents(index_id);

-- Index for listing documents by project
CREATE INDEX IF NOT EXISTS idx_inhouse_search_documents_project
  ON inhouse_search_documents(project_id);

-- Index for document lookup by doc_id
CREATE INDEX IF NOT EXISTS idx_inhouse_search_documents_docid
  ON inhouse_search_documents(index_id, doc_id);

-- GIN index on content for filter queries
CREATE INDEX IF NOT EXISTS idx_inhouse_search_documents_content_gin
  ON inhouse_search_documents USING GIN (content jsonb_path_ops);

-- ============================================================================
-- Search Queries Table (for analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  index_id UUID NOT NULL REFERENCES inhouse_search_indexes(id) ON DELETE CASCADE,
  query VARCHAR(500) NOT NULL,
  result_count INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for query analytics by index
CREATE INDEX IF NOT EXISTS idx_inhouse_search_queries_index
  ON inhouse_search_queries(index_id, created_at DESC);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_inhouse_search_queries_created
  ON inhouse_search_queries(index_id, created_at);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

-- Function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_inhouse_search_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for search indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_inhouse_search_indexes_updated_at'
    AND tgrelid = 'inhouse_search_indexes'::regclass
  ) THEN
    CREATE TRIGGER trg_inhouse_search_indexes_updated_at
      BEFORE UPDATE ON inhouse_search_indexes
      FOR EACH ROW
      EXECUTE FUNCTION update_inhouse_search_updated_at();
  END IF;
END $$;

-- Trigger for search documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_inhouse_search_documents_updated_at'
    AND tgrelid = 'inhouse_search_documents'::regclass
  ) THEN
    CREATE TRIGGER trg_inhouse_search_documents_updated_at
      BEFORE UPDATE ON inhouse_search_documents
      FOR EACH ROW
      EXECUTE FUNCTION update_inhouse_search_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Cleanup Function for Old Query Logs
-- ============================================================================

-- Function to clean up old query logs (call periodically via cron job)
CREATE OR REPLACE FUNCTION cleanup_inhouse_search_queries(days_to_keep INT DEFAULT 30)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM inhouse_search_queries
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE inhouse_search_indexes IS 'Search index definitions for @sheenapps/search SDK';
COMMENT ON TABLE inhouse_search_documents IS 'Indexed documents with tsvector for full-text search';
COMMENT ON TABLE inhouse_search_queries IS 'Query log for search analytics';

COMMENT ON COLUMN inhouse_search_indexes.searchable_fields IS 'Array of field names to index for search';
COMMENT ON COLUMN inhouse_search_indexes.field_weights IS 'Field weight mapping: {fieldName: "A"|"B"|"C"|"D"}';
COMMENT ON COLUMN inhouse_search_indexes.language IS 'PostgreSQL text search configuration name';
COMMENT ON COLUMN inhouse_search_indexes.settings IS 'Index settings: {maxDocumentSize, stopWords, synonyms}';
COMMENT ON COLUMN inhouse_search_documents.doc_id IS 'User-provided document identifier (unique per index)';
COMMENT ON COLUMN inhouse_search_documents.search_vector IS 'Pre-computed tsvector for fast full-text search';
COMMENT ON COLUMN inhouse_search_queries.latency_ms IS 'Query execution time in milliseconds';

COMMENT ON FUNCTION cleanup_inhouse_search_queries IS 'Cleanup old search query logs. Call via scheduled job.';

COMMIT;
