
/*
Show only items needing action:

SELECT * FROM public.security_rls_audit
WHERE verdict LIKE 'NEEDS_ACTION:%'
ORDER BY object_kind, schema_name, object_name;

See which views depend on unsafe tables:

SELECT * FROM public.security_rls_audit
WHERE object_kind IN ('VIEW','MATVIEW')
  AND (COALESCE(view_base_without_rls,0) > 0 OR COALESCE(view_base_without_policy,0) > 0);



 📈 Security Summary Query

  -- High-level security metrics
  SELECT
    'TABLES' as object_type,
    COUNT(*) as total_objects,
    COUNT(*) FILTER (WHERE relrowsecurity) as rls_enabled,
    COUNT(*) FILTER (WHERE relforcerowsecurity) as force_rls_enabled,
    COUNT(*) FILTER (WHERE NOT relrowsecurity) as needs_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'

  UNION ALL

  SELECT
    'POLICIES' as object_type,
    COUNT(*) as total_objects,
    COUNT(DISTINCT schemaname || '.' || tablename) as tables_with_policies,
    COUNT(*) FILTER (WHERE cmd = 'ALL') as all_command_policies,
    0 as needs_rls
  FROM pg_policies
  WHERE schemaname = 'public';

  🔧 Using the Existing Audit View

  -- Use the audit view you already have (shows tables needing action)
  SELECT * FROM public.security_rls_audit
  WHERE verdict LIKE 'NEEDS_ACTION:%'
  ORDER BY object_kind, schema_name, object_name;

  -- Or get a full overview
  SELECT
    verdict,
    COUNT(*) as table_count
  FROM public.security_rls_audit
  WHERE object_kind = 'TABLE'
  GROUP BY verdict
  ORDER BY verdict;

  💡 Recommended Quick Check

  For daily monitoring, use this simple query:
  -- Quick security health check
  SELECT
    COUNT(*) FILTER (WHERE NOT relrowsecurity) as tables_without_rls,
    COUNT(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) as tables_with_force_rls,
    COUNT(*) as total_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';


  */



DROP VIEW IF EXISTS public.security_rls_audit;

CREATE VIEW public.security_rls_audit AS
WITH t_all AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS object_name,
    c.relkind,
    CASE c.relkind
      WHEN 'r' THEN 'TABLE'
      WHEN 'v' THEN 'VIEW'
      WHEN 'm' THEN 'MATVIEW'
      ELSE c.relkind::text
    END AS object_kind,
    c.relrowsecurity      AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
),
t_tables AS (
  SELECT * FROM t_all WHERE relkind = 'r'
),
pol AS (
  SELECT
    schemaname AS schema_name,
    tablename  AS object_name,
    COUNT(*)                                     AS policy_count,
    BOOL_OR(UPPER(cmd) IN ('ALL','SELECT'))      AS has_select_policy,
    BOOL_OR(UPPER(cmd) IN ('ALL','INSERT'))      AS has_insert_policy,
    BOOL_OR(UPPER(cmd) IN ('ALL','UPDATE'))      AS has_update_policy,
    BOOL_OR(UPPER(cmd) IN ('ALL','DELETE'))      AS has_delete_policy,
    BOOL_OR(policyname ILIKE 'deny_all_temp%')   AS has_temp_deny_all
  FROM pg_policies
  GROUP BY schemaname, tablename
),
gr AS (
  SELECT
    table_schema AS schema_name,
    table_name   AS object_name,
    BOOL_OR(privilege_type = 'SELECT') AS grant_select,
    BOOL_OR(privilege_type = 'INSERT') AS grant_insert,
    BOOL_OR(privilege_type = 'UPDATE') AS grant_update,
    BOOL_OR(privilege_type = 'DELETE') AS grant_delete
  FROM information_schema.role_table_grants
  WHERE grantee = 'authenticated' AND table_schema = 'public'
  GROUP BY table_schema, table_name
),
-- ✅ FIXED: use has_schema_privilege() to detect USAGE on the 'public' schema
sch AS (
  SELECT
    n.nspname AS schema_name,
    has_schema_privilege('authenticated', n.oid, 'USAGE') AS schema_usage_granted
  FROM pg_namespace n
  WHERE n.nspname = 'public'
),
-- View/matview → base tables via pg_depend/pg_rewrite
vdeps AS (
  SELECT DISTINCT
    n_view.nspname  AS view_schema_name,
    c_view.relname  AS view_name,
    n_base.nspname  AS base_table_schema,
    c_base.relname  AS base_table_name
  FROM pg_depend d
  JOIN pg_rewrite r        ON r.oid = d.objid
  JOIN pg_class   c_view   ON c_view.oid = r.ev_class
  JOIN pg_namespace n_view ON n_view.oid = c_view.relnamespace
  JOIN pg_class   c_base   ON c_base.oid = d.refobjid
  JOIN pg_namespace n_base ON n_base.oid = c_base.relnamespace
  WHERE n_view.nspname = 'public'
    AND c_view.relkind IN ('v','m')
    AND c_base.relkind = 'r'
),
vagg AS (
  SELECT
    d.view_schema_name AS schema_name,
    d.view_name        AS object_name,
    COUNT(*) AS view_base_tables,
    COUNT(*) FILTER (WHERE tb.rls_enabled IS FALSE)                        AS view_base_without_rls,
    COUNT(*) FILTER (WHERE COALESCE(pl.policy_count,0) = 0)                 AS view_base_without_policy,
    COUNT(*) FILTER (WHERE tb.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND NOT tb.rls_forced)
           AS view_base_rls_not_forced
  FROM vdeps d
  LEFT JOIN t_tables tb ON tb.schema_name = d.base_table_schema AND tb.object_name = d.base_table_name
  LEFT JOIN pol pl      ON pl.schema_name = d.base_table_schema AND pl.object_name = d.base_table_name
  GROUP BY d.view_schema_name, d.view_name
),
srv AS (
  SELECT COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'), FALSE)
         AS service_role_bypassrls
)
SELECT
  a.schema_name,
  a.object_name,
  a.object_kind,

  COALESCE(a.rls_enabled, FALSE) AS rls_enabled,
  COALESCE(a.rls_forced,  FALSE) AS rls_forced,
  COALESCE(pl.policy_count, 0) > 0 AS has_any_policy,
  COALESCE(pl.policy_count, 0)     AS policy_count,
  COALESCE(pl.has_select_policy, FALSE) AS has_select_policy,
  COALESCE(pl.has_insert_policy, FALSE) AS has_insert_policy,
  COALESCE(pl.has_update_policy, FALSE) AS has_update_policy,
  COALESCE(pl.has_delete_policy, FALSE) AS has_delete_policy,
  COALESCE(pl.has_temp_deny_all, FALSE) AS has_temp_deny_all,

  COALESCE(gr.grant_select, FALSE) AS grant_select,
  COALESCE(gr.grant_insert, FALSE) AS grant_insert,
  COALESCE(gr.grant_update, FALSE) AS grant_update,
  COALESCE(gr.grant_delete, FALSE) AS grant_delete,
  COALESCE(sch.schema_usage_granted, FALSE) AS schema_usage_granted,

  v.view_base_tables,
  v.view_base_without_rls,
  v.view_base_without_policy,
  v.view_base_rls_not_forced,

  CONCAT_WS(', ',
    CASE WHEN a.object_kind = 'TABLE' AND NOT COALESCE(pl.has_select_policy, FALSE) THEN 'SELECT' END,
    CASE WHEN a.object_kind = 'TABLE' AND NOT COALESCE(pl.has_insert_policy, FALSE) THEN 'INSERT' END,
    CASE WHEN a.object_kind = 'TABLE' AND NOT COALESCE(pl.has_update_policy, FALSE) THEN 'UPDATE' END,
    CASE WHEN a.object_kind = 'TABLE' AND NOT COALESCE(pl.has_delete_policy, FALSE) THEN 'DELETE' END
  ) AS missing_policy_cmds,
  CONCAT_WS(', ',
    CASE WHEN a.object_kind = 'TABLE' AND COALESCE(pl.has_select_policy, FALSE) AND NOT COALESCE(gr.grant_select, FALSE) THEN 'SELECT' END,
    CASE WHEN a.object_kind = 'TABLE' AND COALESCE(pl.has_insert_policy, FALSE) AND NOT COALESCE(gr.grant_insert, FALSE) THEN 'INSERT' END,
    CASE WHEN a.object_kind = 'TABLE' AND COALESCE(pl.has_update_policy, FALSE) AND NOT COALESCE(gr.grant_update, FALSE) THEN 'UPDATE' END,
    CASE WHEN a.object_kind = 'TABLE' AND COALESCE(pl.has_delete_policy, FALSE) AND NOT COALESCE(gr.grant_delete, FALSE) THEN 'DELETE' END
  ) AS missing_grants_for_authenticated,

  CASE
    WHEN a.object_kind = 'TABLE' THEN
      CASE
        WHEN NOT COALESCE(a.rls_enabled, FALSE)
          THEN 'NEEDS_ACTION: ENABLE_RLS'
        WHEN a.rls_enabled AND COALESCE(pl.policy_count,0) = 0
          THEN 'NEEDS_ACTION: ADD_POLICIES (deny-by-default now)'
        WHEN a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND (
             NOT COALESCE(pl.has_select_policy,FALSE) OR
             NOT COALESCE(pl.has_insert_policy,FALSE) OR
             NOT COALESCE(pl.has_update_policy,FALSE) OR
             NOT COALESCE(pl.has_delete_policy,FALSE)
          )
          THEN 'NEEDS_ACTION: ADD_MISSING_POLICY_CMDS'
        WHEN a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND (
             (pl.has_select_policy AND NOT COALESCE(gr.grant_select,FALSE)) OR
             (pl.has_insert_policy AND NOT COALESCE(gr.grant_insert,FALSE)) OR
             (pl.has_update_policy AND NOT COALESCE(gr.grant_update,FALSE)) OR
             (pl.has_delete_policy AND NOT COALESCE(gr.grant_delete,FALSE))
          )
          THEN 'NEEDS_ACTION: GRANT_BASE_PRIVILEGES'
        WHEN a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND NOT a.rls_forced
          THEN 'OK (Consider FORCE_RLS)'
        ELSE 'OK'
      END
    WHEN a.object_kind IN ('VIEW','MATVIEW') THEN
      CASE
        WHEN COALESCE(v.view_base_tables, 0) = 0
          THEN 'VIEW_REVIEW: NO_DEPENDENCY_INFO'
        WHEN COALESCE(v.view_base_without_rls, 0) > 0 OR COALESCE(v.view_base_without_policy, 0) > 0
          THEN 'NEEDS_ACTION: VIEW_BASE_TABLE_GAPS'
        WHEN COALESCE(v.view_base_rls_not_forced, 0) > 0
          THEN 'OK (View; some base tables not FORCE RLS)'
        ELSE 'OK (View; base tables RLS enforced)'
      END
    ELSE 'OK'
  END AS verdict,

  CONCAT_WS(' | ',
    CASE WHEN a.object_kind = 'TABLE' AND NOT COALESCE(a.rls_enabled, FALSE) THEN 'ENABLE_RLS' END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) = 0 THEN 'ADD_POLICIES (deny-by-default)' END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND (
           NOT COALESCE(pl.has_select_policy,FALSE) OR
           NOT COALESCE(pl.has_insert_policy,FALSE) OR
           NOT COALESCE(pl.has_update_policy,FALSE) OR
           NOT COALESCE(pl.has_delete_policy,FALSE)
         )
         THEN 'ADD_POLICIES_FOR: ' ||
              CONCAT_WS('/',
                CASE WHEN NOT COALESCE(pl.has_select_policy,FALSE) THEN 'SELECT' END,
                CASE WHEN NOT COALESCE(pl.has_insert_policy,FALSE) THEN 'INSERT' END,
                CASE WHEN NOT COALESCE(pl.has_update_policy,FALSE) THEN 'UPDATE' END,
                CASE WHEN NOT COALESCE(pl.has_delete_policy,FALSE) THEN 'DELETE' END
              )
    END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND (
           (pl.has_select_policy AND NOT COALESCE(gr.grant_select,FALSE)) OR
           (pl.has_insert_policy AND NOT COALESCE(gr.grant_insert,FALSE)) OR
           (pl.has_update_policy AND NOT COALESCE(gr.grant_update,FALSE)) OR
           (pl.has_delete_policy AND NOT COALESCE(gr.grant_delete,FALSE))
         )
         THEN 'GRANT_PRIVILEGES_FOR: ' ||
              CONCAT_WS('/',
                CASE WHEN pl.has_select_policy AND NOT COALESCE(gr.grant_select,FALSE) THEN 'SELECT' END,
                CASE WHEN pl.has_insert_policy AND NOT COALESCE(gr.grant_insert,FALSE) THEN 'INSERT' END,
                CASE WHEN pl.has_update_policy AND NOT COALESCE(gr.grant_update,FALSE) THEN 'UPDATE' END,
                CASE WHEN pl.has_delete_policy AND NOT COALESCE(gr.grant_delete,FALSE) THEN 'DELETE' END
              )
    END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND NOT a.rls_forced
         THEN 'CONSIDER_FORCE_RLS' END,
    CASE WHEN a.object_kind IN ('VIEW','MATVIEW') AND (COALESCE(v.view_base_without_rls,0) > 0 OR COALESCE(v.view_base_without_policy,0) > 0)
         THEN 'HARDEN_BASE_TABLES (ENABLE_RLS/ADD_POLICIES)' END,
    CASE WHEN NOT COALESCE(sch.schema_usage_granted, FALSE)
         THEN 'GRANT_SCHEMA_USAGE(public)' END
  ) AS actions,

  CONCAT_WS(' | ',
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) = 0
         THEN 'RLS ON with zero policies: deny-all for non-bypass roles; service role still bypasses RLS.' END,
    CASE WHEN a.object_kind = 'TABLE' AND COALESCE(pl.has_temp_deny_all, FALSE)
         THEN 'Temporary deny-all policy active: table locked until allow-policies exist.' END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND (
           NOT COALESCE(pl.has_select_policy,FALSE) OR
           NOT COALESCE(pl.has_insert_policy,FALSE) OR
           NOT COALESCE(pl.has_update_policy,FALSE) OR
           NOT COALESCE(pl.has_delete_policy,FALSE)
         )
         THEN 'Some commands lack policies; those commands are denied by default.' END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND COALESCE(pl.policy_count,0) > 0 AND (
           (pl.has_select_policy AND NOT COALESCE(gr.grant_select,FALSE)) OR
           (pl.has_insert_policy AND NOT COALESCE(gr.grant_insert,FALSE)) OR
           (pl.has_update_policy AND NOT COALESCE(gr.grant_update,FALSE)) OR
           (pl.has_delete_policy AND NOT COALESCE(gr.grant_delete,FALSE))
         )
         THEN 'Policies OK; authenticated lacks base GRANTs—grant listed privileges; RLS still enforces per-row access.' END,
    CASE WHEN a.object_kind = 'TABLE' AND a.rls_enabled AND NOT a.rls_forced
         THEN 'FORCE RLS is OFF: table owners can bypass RLS; consider enabling.' END,
    CASE WHEN a.object_kind IN ('VIEW','MATVIEW')
         THEN 'Views don’t have RLS; access governed by base tables—ensure they’re hardened.' END,
    CASE WHEN a.object_kind IN ('VIEW','MATVIEW') AND COALESCE(v.view_base_rls_not_forced, 0) > 0
         THEN 'Some underlying tables have RLS but not FORCE RLS.' END,
    CASE WHEN (SELECT service_role_bypassrls FROM srv)
         THEN 'Note: service_role has BYPASSRLS—do not use in user-facing routes.' END
  ) AS notes
FROM t_all a
LEFT JOIN pol  pl ON pl.schema_name = a.schema_name AND pl.object_name = a.object_name
LEFT JOIN gr   gr ON gr.schema_name = a.schema_name AND gr.object_name = a.object_name
LEFT JOIN sch  sch ON sch.schema_name = a.schema_name
LEFT JOIN vagg v  ON v.schema_name = a.schema_name AND v.object_name = a.object_name
ORDER BY a.object_kind, a.schema_name, a.object_name;
