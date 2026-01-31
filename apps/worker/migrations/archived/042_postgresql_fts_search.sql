-- Migration: 042_postgresql_fts_search.sql
-- Description: Add PostgreSQL FTS search capabilities and performance indexes
-- Date: 2025-08-24

-- PostgreSQL FTS with international text support (no storage overhead)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Functional GIN index (no extra column, lower write cost) - can migrate to stored tsvector later
-- Note: Using 'simple' dictionary without unaccent for index compatibility
CREATE INDEX IF NOT EXISTS idx_chat_tsv_func
  ON project_chat_log_minimal
  USING GIN (to_tsvector('simple', coalesce(message_text, '')));

-- Fuzzy search fallback for typos and partial matches
CREATE INDEX IF NOT EXISTS idx_chat_trgm
  ON project_chat_log_minimal USING GIN (message_text gin_trgm_ops);

-- Core performance indexes (consistent naming with seq)
CREATE INDEX IF NOT EXISTS idx_chat_proj_seq
  ON project_chat_log_minimal(project_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_chat_actor_type
  ON project_chat_log_minimal(project_id, actor_type, seq DESC);

-- Additional performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_chat_mode_seq
  ON project_chat_log_minimal(project_id, mode, seq DESC)
  WHERE mode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_visibility_seq
  ON project_chat_log_minimal(project_id, visibility, seq DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_created_seq
  ON project_chat_log_minimal(project_id, created_at DESC, seq DESC);

-- Index for thread/parent relationships
CREATE INDEX IF NOT EXISTS idx_chat_parent_seq
  ON project_chat_log_minimal(project_id, parent_message_id, seq DESC)
  WHERE parent_message_id IS NOT NULL;

-- Helper function for advanced search with highlighting
CREATE OR REPLACE FUNCTION search_chat_messages(
  p_project_id UUID,
  p_user_id UUID,
  p_query TEXT,
  p_from_seq BIGINT DEFAULT NULL,
  p_to_seq BIGINT DEFAULT NULL,
  p_actor_types TEXT[] DEFAULT NULL,
  p_mode TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  id BIGINT,
  seq BIGINT,
  message_text TEXT,
  highlighted_text TEXT,
  actor_type TEXT,
  mode TEXT,
  created_at TIMESTAMPTZ,
  rank REAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pcl.id,
    pcl.seq,
    pcl.message_text,
    ts_headline('simple', pcl.message_text, plainto_tsquery('simple', p_query)) as highlighted_text,
    pcl.actor_type,
    pcl.mode,
    pcl.created_at,
    ts_rank(to_tsvector('simple', COALESCE(pcl.message_text, '')), plainto_tsquery('simple', p_query)) as rank
  FROM project_chat_log_minimal pcl
  WHERE pcl.project_id = p_project_id
    AND pcl.is_deleted = FALSE
    AND pcl.visibility = 'public'
    AND to_tsvector('simple', COALESCE(pcl.message_text, '')) @@ plainto_tsquery('simple', p_query)
    AND (p_from_seq IS NULL OR pcl.seq >= p_from_seq)
    AND (p_to_seq IS NULL OR pcl.seq <= p_to_seq)
    AND (p_actor_types IS NULL OR pcl.actor_type = ANY(p_actor_types))
    AND (p_mode IS NULL OR pcl.mode = p_mode)
    AND (
      -- User can see their own messages
      pcl.user_id = p_user_id
      -- OR user has project access
      OR EXISTS (
        SELECT 1 FROM projects p 
        WHERE p.id = pcl.project_id 
          AND (p.owner_id = p_user_id OR EXISTS (
            SELECT 1 FROM project_collaborators pc 
            WHERE pc.project_id = p.id 
              AND pc.user_id = p_user_id
              AND pc.role IN ('owner', 'admin', 'editor')
          ))
      )
    )
  ORDER BY rank DESC, pcl.seq DESC
  LIMIT p_limit;
END$$;

-- Helper function for fuzzy search fallback
CREATE OR REPLACE FUNCTION fuzzy_search_chat_messages(
  p_project_id UUID,
  p_user_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  id BIGINT,
  seq BIGINT,
  message_text TEXT,
  similarity REAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pcl.id,
    pcl.seq,
    pcl.message_text,
    similarity(pcl.message_text, p_query) as similarity
  FROM project_chat_log_minimal pcl
  WHERE pcl.project_id = p_project_id
    AND pcl.is_deleted = FALSE
    AND pcl.visibility = 'public'
    AND pcl.message_text % p_query  -- Trigram similarity operator
    AND (
      pcl.user_id = p_user_id
      OR EXISTS (
        SELECT 1 FROM projects p 
        WHERE p.id = pcl.project_id 
          AND (p.owner_id = p_user_id OR EXISTS (
            SELECT 1 FROM project_collaborators pc 
            WHERE pc.project_id = p.id 
              AND pc.user_id = p_user_id
              AND pc.role IN ('owner', 'admin', 'editor')
          ))
      )
    )
  ORDER BY similarity DESC, pcl.seq DESC
  LIMIT p_limit;
END$$;

-- Utility function to get search suggestions based on common terms
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_project_id UUID,
  p_prefix TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  term TEXT,
  frequency BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH words AS (
    SELECT unnest(string_to_array(lower(message_text), ' ')) as word
    FROM project_chat_log_minimal
    WHERE project_id = p_project_id
      AND is_deleted = FALSE
      AND message_text IS NOT NULL
      AND char_length(message_text) > 0
  ),
  filtered_words AS (
    SELECT word
    FROM words
    WHERE word LIKE p_prefix || '%'
      AND char_length(word) > 2
      AND word NOT IN ('the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'had', 'have', 'what', 'were', 'they', 'there', 'been', 'said', 'each', 'which', 'their', 'time', 'will', 'about', 'would', 'these', 'some', 'could', 'other', 'after', 'first', 'well', 'many', 'into', 'than', 'then', 'them', 'only', 'come', 'work', 'like', 'just', 'over', 'also', 'back', 'call', 'find', 'get', 'give', 'good', 'great', 'hand', 'here', 'keep', 'know', 'last', 'left', 'life', 'live', 'look', 'made', 'make', 'most', 'move', 'must', 'name', 'need', 'new', 'now', 'old', 'part', 'place', 'put', 'right', 'same', 'see', 'seem', 'show', 'small', 'such', 'take', 'tell', 'try', 'turn', 'use', 'want', 'way', 'when', 'where', 'while', 'who', 'why', 'work', 'world', 'year', 'years', 'young')
  )
  SELECT 
    fw.word as term,
    COUNT(*) as frequency
  FROM filtered_words fw
  GROUP BY fw.word
  ORDER BY frequency DESC, fw.word
  LIMIT p_limit;
END$$;

-- Create a view for common search analytics
CREATE OR REPLACE VIEW chat_search_analytics AS
SELECT 
  project_id,
  DATE_TRUNC('day', created_at) as date,
  actor_type,
  mode,
  COUNT(*) as message_count,
  AVG(char_length(message_text)) as avg_message_length,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions
FROM project_chat_log_minimal
WHERE is_deleted = FALSE 
  AND message_text IS NOT NULL 
  AND char_length(message_text) > 0
GROUP BY project_id, DATE_TRUNC('day', created_at), actor_type, mode
ORDER BY project_id, date DESC;

-- Update table statistics for query planner optimization
ANALYZE project_chat_log_minimal;