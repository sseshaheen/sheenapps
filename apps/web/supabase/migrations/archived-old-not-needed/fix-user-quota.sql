-- Script to fix quota for users who have deleted projects but still have inflated usage counts
-- This will recalculate the projects_created count based on actual existing projects

-- First, let's see the current state
WITH user_quota_check AS (
  SELECT 
    u.id as user_id,
    u.email,
    ut.projects_created as tracked_count,
    COUNT(p.id) as actual_count,
    ut.period_start,
    (ut.projects_created - COUNT(p.id)) as difference
  FROM users u
  LEFT JOIN usage_tracking ut ON u.id = ut.user_id 
    AND ut.period_start = date_trunc('month', NOW())
  LEFT JOIN projects p ON u.id = p.owner_id
  WHERE ut.projects_created > 0
  GROUP BY u.id, u.email, ut.projects_created, ut.period_start
  HAVING ut.projects_created > COUNT(p.id)
)
SELECT * FROM user_quota_check;

-- Fix the discrepancy by updating usage_tracking to match actual project count
UPDATE usage_tracking ut
SET 
  projects_created = actual_counts.actual_count,
  updated_at = NOW()
FROM (
  SELECT 
    u.id as user_id,
    COUNT(p.id) as actual_count
  FROM users u
  LEFT JOIN projects p ON u.id = p.owner_id
  GROUP BY u.id
) actual_counts
WHERE ut.user_id = actual_counts.user_id
  AND ut.period_start = date_trunc('month', NOW())
  AND ut.projects_created > actual_counts.actual_count;

-- Log the fix in audit log
INSERT INTO quota_audit_log (
  user_id,
  metric,
  success,
  reason,
  context,
  requested_amount,
  current_usage,
  limit_amount,
  created_at
)
SELECT 
  ut.user_id,
  'projects_created',
  TRUE,
  'manual_quota_correction',
  jsonb_build_object(
    'operation', 'fix_deleted_projects_quota',
    'previous_usage', ut.projects_created,
    'new_usage', actual_counts.actual_count,
    'adjustment', (actual_counts.actual_count - ut.projects_created),
    'period_start', ut.period_start
  ),
  (actual_counts.actual_count - ut.projects_created),
  actual_counts.actual_count,
  3, -- Assuming free tier limit of 3 projects
  NOW()
FROM usage_tracking ut
JOIN (
  SELECT 
    u.id as user_id,
    COUNT(p.id) as actual_count
  FROM users u
  LEFT JOIN projects p ON u.id = p.owner_id
  GROUP BY u.id
) actual_counts ON ut.user_id = actual_counts.user_id
WHERE ut.period_start = date_trunc('month', NOW())
  AND ut.projects_created > actual_counts.actual_count;

-- Verify the fix
WITH verification AS (
  SELECT 
    u.id as user_id,
    u.email,
    ut.projects_created as tracked_count,
    COUNT(p.id) as actual_count,
    ut.period_start,
    CASE 
      WHEN ut.projects_created = COUNT(p.id) THEN 'FIXED'
      ELSE 'STILL_MISMATCHED'
    END as status
  FROM users u
  LEFT JOIN usage_tracking ut ON u.id = ut.user_id 
    AND ut.period_start = date_trunc('month', NOW())
  LEFT JOIN projects p ON u.id = p.owner_id
  WHERE ut.projects_created IS NOT NULL
  GROUP BY u.id, u.email, ut.projects_created, ut.period_start
)
SELECT * FROM verification
ORDER BY status DESC, email;