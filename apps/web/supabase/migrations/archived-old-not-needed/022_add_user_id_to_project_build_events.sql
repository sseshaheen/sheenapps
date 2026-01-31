-- Migration: Add user_id column to project_build_events table
-- Required for real-time subscriptions and RLS policies
-- Part of Worker API Migration Plan - Phase 4

-- Add user_id column to project_build_events table
ALTER TABLE public.project_build_events 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for efficient user-based queries
CREATE INDEX idx_build_events_user_id ON public.project_build_events USING btree (user_id);

-- Create composite index for user + build_id queries
CREATE INDEX idx_build_events_user_build ON public.project_build_events USING btree (user_id, build_id);

-- Add RLS policy for user access control
ALTER TABLE public.project_build_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own build events
CREATE POLICY "Users can view own build events" 
ON public.project_build_events 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Service role can insert build events (for webhooks)
CREATE POLICY "Service role can insert build events" 
ON public.project_build_events 
FOR INSERT 
WITH CHECK (true);

-- Policy: Service role can update build events (for webhooks)
CREATE POLICY "Service role can update build events" 
ON public.project_build_events 
FOR UPDATE 
USING (true);

-- Add comment for documentation
COMMENT ON COLUMN public.project_build_events.user_id IS 
'User ID who owns this build - required for RLS policies and user-specific real-time subscriptions';

-- Update the table comment
COMMENT ON TABLE public.project_build_events IS 
'Stores all build progress events for polling and real-time updates. Events are user-scoped for security.';

-- Create a function to get build events for a user
CREATE OR REPLACE FUNCTION get_user_build_events(target_user_id UUID, build_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id INTEGER,
  build_id VARCHAR(64),
  event_type VARCHAR(50),
  event_data JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE,
  user_id UUID
) 
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Verify the requesting user can access these events
  IF auth.uid() != target_user_id AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: Cannot access build events for other users';
  END IF;

  RETURN QUERY
  SELECT 
    pbe.id,
    pbe.build_id,
    pbe.event_type,
    pbe.event_data,
    pbe.created_at,
    pbe.user_id
  FROM public.project_build_events pbe
  WHERE pbe.user_id = target_user_id
  ORDER BY pbe.created_at DESC
  LIMIT build_limit;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_build_events(UUID, INTEGER) TO authenticated;

-- Create a function to publish build events (for Worker API webhooks)
CREATE OR REPLACE FUNCTION publish_build_event(
  p_build_id VARCHAR(64),
  p_event_type VARCHAR(50),
  p_event_data JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  event_id INTEGER;
BEGIN
  -- Insert the build event
  INSERT INTO public.project_build_events (
    build_id,
    event_type,
    event_data,
    user_id
  ) VALUES (
    p_build_id,
    p_event_type,
    p_event_data,
    p_user_id
  )
  RETURNING id INTO event_id;

  -- Return the event ID
  RETURN event_id;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION publish_build_event(VARCHAR, VARCHAR, JSONB, UUID) TO service_role;