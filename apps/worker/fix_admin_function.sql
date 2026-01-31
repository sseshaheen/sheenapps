-- Create the missing rpc_log_admin_action function
CREATE OR REPLACE FUNCTION public.rpc_log_admin_action(
  p_admin_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_reason text,
  p_correlation_id uuid,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $rpc_log$
  INSERT INTO public.admin_action_log_app(
    admin_user_id, action, resource_type, resource_id, reason, correlation_id, extra
  )
  VALUES (
    p_admin_user_id, p_action, p_resource_type, p_resource_id, p_reason, p_correlation_id, 
    coalesce(p_extra, '{}'::jsonb)
  );
$rpc_log$;