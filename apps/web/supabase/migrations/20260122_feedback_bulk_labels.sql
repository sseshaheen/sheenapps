-- Migration: Bulk Labels Atomic Function
-- Date: 2026-01-22
-- Purpose: Atomic bulk label operations for feedback triage (performance + consistency)
--
-- This function handles label add/remove in a single atomic operation,
-- replacing the per-item loop pattern which was slow and non-atomic.
--
-- v2: Fixed audit logging bug - now only logs actually modified rows using RETURNING CTE
--     Added search_path hardening for SECURITY DEFINER
--     Added early guard for empty input
--     Added label normalization (btrim)

-- ============================================================================
-- Bulk Update Feedback Labels Function
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_update_feedback_labels(
  p_ids UUID[],
  p_action TEXT,            -- 'label_add' | 'label_remove'
  p_label TEXT,
  p_admin_id UUID,
  p_admin_email TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count INT := 0;
  v_label TEXT;
BEGIN
  -- Guard: empty input - return early
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Validate action
  IF p_action NOT IN ('label_add', 'label_remove') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be label_add or label_remove', p_action;
  END IF;

  -- Validate + normalize label (trim whitespace)
  v_label := btrim(p_label);
  IF v_label IS NULL OR v_label = '' THEN
    RAISE EXCEPTION 'Label cannot be empty';
  END IF;

  -- Use CTE with RETURNING to capture exactly which rows were updated
  -- Then insert audit logs only for those rows (fixes bug where unmodified rows were logged)
  WITH updated AS (
    UPDATE feedback_submissions fs
    SET labels =
      CASE
        WHEN p_action = 'label_add' THEN (
          SELECT ARRAY_AGG(DISTINCT x ORDER BY x)
          FROM UNNEST(COALESCE(fs.labels, '{}'::TEXT[]) || ARRAY[v_label]) AS x
        )
        WHEN p_action = 'label_remove' THEN (
          SELECT COALESCE(ARRAY_AGG(x ORDER BY x), '{}'::TEXT[])
          FROM UNNEST(COALESCE(fs.labels, '{}'::TEXT[])) AS x
          WHERE x <> v_label
        )
      END
    WHERE fs.id = ANY(p_ids)
      AND (
        -- Only update rows that actually need changing
        (p_action = 'label_add' AND NOT (COALESCE(fs.labels, '{}'::TEXT[]) @> ARRAY[v_label]))
        OR
        (p_action = 'label_remove' AND (COALESCE(fs.labels, '{}'::TEXT[]) @> ARRAY[v_label]))
      )
    RETURNING fs.id
  ),
  audit_insert AS (
    -- Insert audit logs only for rows that were actually updated (from RETURNING)
    INSERT INTO feedback_audit_log (feedback_id, action, admin_id, admin_email, old_value, new_value, comment)
    SELECT
      u.id,
      p_action,
      p_admin_id,
      p_admin_email,
      NULL,
      jsonb_build_object('label', v_label),
      FORMAT('Bulk %s operation', p_action)
    FROM updated u
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION bulk_update_feedback_labels IS 'Atomic bulk add/remove labels. Returns count of actually modified items.';
