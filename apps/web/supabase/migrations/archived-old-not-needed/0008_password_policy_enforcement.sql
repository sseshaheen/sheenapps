-- posponted for now

-- -- Server-Side Password Policy Enforcement
-- -- Implements comprehensive password validation at the database level

-- -- Create password validation function
-- CREATE OR REPLACE FUNCTION validate_password_strength(password text)
-- RETURNS json AS $$
-- DECLARE
--   min_length integer := 8;
--   has_uppercase boolean := false;
--   has_lowercase boolean := false;
--   has_number boolean := false;
--   has_special boolean := false;
--   strength_score integer := 0;
--   validation_result json;
-- BEGIN
--   -- Check minimum length
--   IF length(password) < min_length THEN
--     RETURN json_build_object(
--       'valid', false,
--       'score', 0,
--       'message', format('Password must be at least %s characters long', min_length),
--       'requirements', json_build_object(
--         'min_length', false,
--         'uppercase', false,
--         'lowercase', false,
--         'number', false,
--         'special', false
--       )
--     );
--   END IF;

--   -- Check character requirements
--   has_uppercase := password ~ '[A-Z]';
--   has_lowercase := password ~ '[a-z]';
--   has_number := password ~ '[0-9]';
--   has_special := password ~ '[^A-Za-z0-9]';

--   -- Calculate strength score
--   strength_score := length(password) / 2; -- Base score from length

--   IF has_uppercase THEN strength_score := strength_score + 10; END IF;
--   IF has_lowercase THEN strength_score := strength_score + 10; END IF;
--   IF has_number THEN strength_score := strength_score + 10; END IF;
--   IF has_special THEN strength_score := strength_score + 15; END IF;

--   -- Bonus for longer passwords
--   IF length(password) >= 12 THEN strength_score := strength_score + 10; END IF;
--   IF length(password) >= 16 THEN strength_score := strength_score + 10; END IF;

--   -- Check if all requirements are met
--   IF has_uppercase AND has_lowercase AND has_number AND has_special THEN
--     RETURN json_build_object(
--       'valid', true,
--       'score', LEAST(strength_score, 100),
--       'message', 'Strong password',
--       'requirements', json_build_object(
--         'min_length', true,
--         'uppercase', true,
--         'lowercase', true,
--         'number', true,
--         'special', true
--       )
--     );
--   ELSE
--     -- Build specific error message
--     DECLARE
--       missing_requirements text[] := ARRAY[]::text[];
--     BEGIN
--       IF NOT has_uppercase THEN missing_requirements := array_append(missing_requirements, 'uppercase letter'); END IF;
--       IF NOT has_lowercase THEN missing_requirements := array_append(missing_requirements, 'lowercase letter'); END IF;
--       IF NOT has_number THEN missing_requirements := array_append(missing_requirements, 'number'); END IF;
--       IF NOT has_special THEN missing_requirements := array_append(missing_requirements, 'special character'); END IF;

--       RETURN json_build_object(
--         'valid', false,
--         'score', LEAST(strength_score, 99),
--         'message', format('Password must include: %s', array_to_string(missing_requirements, ', ')),
--         'requirements', json_build_object(
--           'min_length', true,
--           'uppercase', has_uppercase,
--           'lowercase', has_lowercase,
--           'number', has_number,
--           'special', has_special
--         )
--       );
--     END;
--   END IF;
-- END;
-- $$ LANGUAGE plpgsql IMMUTABLE;

-- -- Create password history table to prevent reuse
-- CREATE TABLE user_password_history (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id uuid NOT NULL,
--   password_hash text NOT NULL,
--   created_at timestamptz DEFAULT now(),

--   -- Index for efficient lookups
--   CONSTRAINT user_password_history_user_id_idx UNIQUE (user_id, password_hash)
-- );

-- -- Create index for cleanup queries
-- CREATE INDEX idx_user_password_history_created_at ON user_password_history(created_at);

-- -- Enable RLS on password history
-- ALTER TABLE user_password_history ENABLE ROW LEVEL SECURITY;

-- -- Users can only see their own password history
-- CREATE POLICY "user_password_history_access" ON user_password_history
--   FOR ALL USING (user_id = auth.uid());

-- -- Function to check password reuse
-- CREATE OR REPLACE FUNCTION check_password_reuse(user_id uuid, new_password_hash text, limit_count integer DEFAULT 5)
-- RETURNS boolean AS $$
-- BEGIN
--   RETURN NOT EXISTS (
--     SELECT 1 FROM user_password_history
--     WHERE user_password_history.user_id = check_password_reuse.user_id
--     AND password_hash = new_password_hash
--     ORDER BY created_at DESC
--     LIMIT limit_count
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- -- Function to add password to history
-- CREATE OR REPLACE FUNCTION add_password_to_history(user_id uuid, password_hash text)
-- RETURNS void AS $$
-- BEGIN
--   -- Insert new password hash
--   INSERT INTO user_password_history (user_id, password_hash)
--   VALUES (user_id, password_hash)
--   ON CONFLICT (user_id, password_hash) DO NOTHING;

--   -- Clean up old entries (keep only last 10)
--   DELETE FROM user_password_history
--   WHERE user_password_history.user_id = add_password_to_history.user_id
--   AND id NOT IN (
--     SELECT id FROM user_password_history
--     WHERE user_password_history.user_id = add_password_to_history.user_id
--     ORDER BY created_at DESC
--     LIMIT 10
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- -- Create comprehensive password validation function for API endpoints
-- CREATE OR REPLACE FUNCTION validate_password_for_user(
--   user_id uuid,
--   password text,
--   check_history boolean DEFAULT true
-- )
-- RETURNS json AS $$
-- DECLARE
--   strength_result json;
--   password_hash text;
--   can_reuse boolean := true;
-- BEGIN
--   -- First validate password strength
--   strength_result := validate_password_strength(password);

--   IF NOT (strength_result->>'valid')::boolean THEN
--     RETURN strength_result;
--   END IF;

--   -- Check password history if requested
--   IF check_history AND user_id IS NOT NULL THEN
--     -- Generate hash for comparison (simple approach - in production use proper hashing)
--     password_hash := encode(digest(password || user_id::text, 'sha256'), 'hex');
--     can_reuse := check_password_reuse(user_id, password_hash);

--     IF NOT can_reuse THEN
--       RETURN json_build_object(
--         'valid', false,
--         'score', (strength_result->>'score')::integer,
--         'message', 'Password was recently used. Please choose a different password.',
--         'requirements', strength_result->'requirements'
--       );
--     END IF;
--   END IF;

--   RETURN json_build_object(
--     'valid', true,
--     'score', (strength_result->>'score')::integer,
--     'message', 'Password meets all requirements',
--     'requirements', strength_result->'requirements'
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- -- Function to record password change (called from application)
-- CREATE OR REPLACE FUNCTION record_password_change(user_id uuid, password text)
-- RETURNS json AS $$
-- DECLARE
--   password_hash text;
-- BEGIN
--   -- Generate hash for storage
--   password_hash := encode(digest(password || user_id::text, 'sha256'), 'hex');

--   -- Add to history
--   PERFORM add_password_to_history(user_id, password_hash);

--   RETURN json_build_object('success', true, 'message', 'Password change recorded');
-- EXCEPTION WHEN OTHERS THEN
--   RETURN json_build_object('success', false, 'error', SQLERRM);
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- -- Create password policy configuration table
-- CREATE TABLE password_policy_config (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   name text NOT NULL UNIQUE,
--   value jsonb NOT NULL,
--   description text,
--   created_at timestamptz DEFAULT now(),
--   updated_at timestamptz DEFAULT now()
-- );

-- -- Insert default password policy configuration
-- INSERT INTO password_policy_config (name, value, description) VALUES
-- ('min_length', '8', 'Minimum password length'),
-- ('require_uppercase', 'true', 'Require at least one uppercase letter'),
-- ('require_lowercase', 'true', 'Require at least one lowercase letter'),
-- ('require_number', 'true', 'Require at least one number'),
-- ('require_special', 'true', 'Require at least one special character'),
-- ('history_limit', '5', 'Number of previous passwords to check against'),
-- ('max_age_days', '90', 'Maximum password age in days (0 = no expiration)'),
-- ('account_lockout_attempts', '5', 'Number of failed attempts before lockout'),
-- ('lockout_duration_minutes', '15', 'Lockout duration in minutes')
-- ON CONFLICT (name) DO NOTHING;

-- -- Enable RLS on password policy config
-- ALTER TABLE password_policy_config ENABLE ROW LEVEL SECURITY;

-- -- Allow authenticated users to read password policy
-- CREATE POLICY "password_policy_read" ON password_policy_config
--   FOR SELECT USING (auth.uid() IS NOT NULL);

-- -- Function to get current password policy
-- CREATE OR REPLACE FUNCTION get_password_policy()
-- RETURNS json AS $$
-- DECLARE
--   policy_json json;
-- BEGIN
--   SELECT json_object_agg(name, value) INTO policy_json
--   FROM password_policy_config;

--   RETURN COALESCE(policy_json, '{}'::json);
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- -- Trigger function to update password policy timestamp
-- CREATE OR REPLACE FUNCTION update_password_policy_timestamp()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = now();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE TRIGGER trigger_update_password_policy_timestamp
--   BEFORE UPDATE ON password_policy_config
--   FOR EACH ROW
--   EXECUTE FUNCTION update_password_policy_timestamp();

-- -- Create audit log for password policy changes
-- CREATE TABLE password_policy_audit (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   policy_name text NOT NULL,
--   old_value jsonb,
--   new_value jsonb,
--   changed_by uuid REFERENCES auth.users(id),
--   changed_at timestamptz DEFAULT now(),
--   ip_address inet,
--   user_agent text
-- );

-- -- Enable RLS on audit log
-- ALTER TABLE password_policy_audit ENABLE ROW LEVEL SECURITY;

-- -- Only admins can view audit logs
-- CREATE POLICY "password_policy_audit_admin_only" ON password_policy_audit
--   FOR SELECT USING (
--     auth.uid() IN (
--       SELECT user_id FROM project_collaborators
--       WHERE role = 'owner'
--       GROUP BY user_id
--       HAVING COUNT(*) > 0
--     )
--   );

-- -- Function to validate password with current policy
-- CREATE OR REPLACE FUNCTION validate_password_with_policy(
--   user_id uuid,
--   password text,
--   check_history boolean DEFAULT true
-- )
-- RETURNS json AS $$
-- DECLARE
--   policy json;
--   min_length integer;
--   require_uppercase boolean;
--   require_lowercase boolean;
--   require_number boolean;
--   require_special boolean;
--   history_limit integer;

--   has_uppercase boolean := false;
--   has_lowercase boolean := false;
--   has_number boolean := false;
--   has_special boolean := false;

--   password_hash text;
--   can_reuse boolean := true;
--   missing_requirements text[] := ARRAY[]::text[];
-- BEGIN
--   -- Get current policy
--   policy := get_password_policy();

--   -- Extract policy values
--   min_length := COALESCE((policy->>'min_length')::integer, 8);
--   require_uppercase := COALESCE((policy->>'require_uppercase')::boolean, true);
--   require_lowercase := COALESCE((policy->>'require_lowercase')::boolean, true);
--   require_number := COALESCE((policy->>'require_number')::boolean, true);
--   require_special := COALESCE((policy->>'require_special')::boolean, true);
--   history_limit := COALESCE((policy->>'history_limit')::integer, 5);

--   -- Check minimum length
--   IF length(password) < min_length THEN
--     RETURN json_build_object(
--       'valid', false,
--       'message', format('Password must be at least %s characters long', min_length)
--     );
--   END IF;

--   -- Check character requirements
--   has_uppercase := password ~ '[A-Z]';
--   has_lowercase := password ~ '[a-z]';
--   has_number := password ~ '[0-9]';
--   has_special := password ~ '[^A-Za-z0-9]';

--   -- Build list of missing requirements
--   IF require_uppercase AND NOT has_uppercase THEN
--     missing_requirements := array_append(missing_requirements, 'uppercase letter');
--   END IF;
--   IF require_lowercase AND NOT has_lowercase THEN
--     missing_requirements := array_append(missing_requirements, 'lowercase letter');
--   END IF;
--   IF require_number AND NOT has_number THEN
--     missing_requirements := array_append(missing_requirements, 'number');
--   END IF;
--   IF require_special AND NOT has_special THEN
--     missing_requirements := array_append(missing_requirements, 'special character');
--   END IF;

--   -- Return error if requirements not met
--   IF array_length(missing_requirements, 1) > 0 THEN
--     RETURN json_build_object(
--       'valid', false,
--       'message', format('Password must include: %s', array_to_string(missing_requirements, ', '))
--     );
--   END IF;

--   -- Check password history if requested
--   IF check_history AND user_id IS NOT NULL THEN
--     password_hash := encode(digest(password || user_id::text, 'sha256'), 'hex');
--     can_reuse := check_password_reuse(user_id, password_hash, history_limit);

--     IF NOT can_reuse THEN
--       RETURN json_build_object(
--         'valid', false,
--         'message', format('Password was recently used. Please choose a different password. (Last %s passwords checked)', history_limit)
--       );
--     END IF;
--   END IF;

--   RETURN json_build_object(
--     'valid', true,
--     'message', 'Password meets all policy requirements'
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
