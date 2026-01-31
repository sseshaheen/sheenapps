--
-- PostgreSQL database dump
--

\restrict u6VrPAuMM3WcU8lzzTVaLdoWwZIqnP8wBI8TuaInAeSiu8WedIrGKP1SzBbAur3

-- Dumped from database version 15.8
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-03 01:22:54 EEST

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE IF EXISTS postgres;
--
-- TOC entry 6640 (class 1262 OID 16978)
-- Name: postgres; Type: DATABASE; Schema: -; Owner: -
--

CREATE DATABASE postgres WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.UTF-8';


\unrestrict u6VrPAuMM3WcU8lzzTVaLdoWwZIqnP8wBI8TuaInAeSiu8WedIrGKP1SzBbAur3
\connect postgres
\restrict u6VrPAuMM3WcU8lzzTVaLdoWwZIqnP8wBI8TuaInAeSiu8WedIrGKP1SzBbAur3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 23 (class 2615 OID 16979)
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- TOC entry 31 (class 2615 OID 16980)
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- TOC entry 21 (class 2615 OID 16981)
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- TOC entry 20 (class 2615 OID 16982)
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- TOC entry 13 (class 2615 OID 16983)
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- TOC entry 16 (class 2615 OID 16984)
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- TOC entry 22 (class 2615 OID 16985)
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- TOC entry 14 (class 2615 OID 16986)
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- TOC entry 19 (class 2615 OID 16987)
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- TOC entry 3 (class 3079 OID 18430)
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- TOC entry 6641 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- TOC entry 8 (class 3079 OID 16998)
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- TOC entry 6642 (class 0 OID 0)
-- Dependencies: 8
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- TOC entry 4 (class 3079 OID 81283)
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- TOC entry 6643 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- TOC entry 7 (class 3079 OID 17029)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- TOC entry 6644 (class 0 OID 0)
-- Dependencies: 7
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 2 (class 3079 OID 17066)
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- TOC entry 6645 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- TOC entry 5 (class 3079 OID 81276)
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- TOC entry 6646 (class 0 OID 0)
-- Dependencies: 5
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- TOC entry 6 (class 3079 OID 17089)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- TOC entry 6647 (class 0 OID 0)
-- Dependencies: 6
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 1316 (class 1247 OID 17101)
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- TOC entry 1319 (class 1247 OID 17108)
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- TOC entry 1322 (class 1247 OID 17114)
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- TOC entry 1325 (class 1247 OID 17120)
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- TOC entry 1328 (class 1247 OID 17128)
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- TOC entry 1743 (class 1247 OID 84006)
-- Name: advisor_application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.advisor_application_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'returned_for_changes'
);


--
-- TOC entry 1746 (class 1247 OID 84020)
-- Name: advisor_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.advisor_event_type AS ENUM (
    'draft_created',
    'draft_updated',
    'profile_updated',
    'application_submitted',
    'review_started',
    'review_completed',
    'status_changed',
    'admin_note_added',
    'documents_uploaded',
    'interview_scheduled',
    'interview_completed'
);


--
-- TOC entry 1761 (class 1247 OID 85643)
-- Name: advisor_pricing_model; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.advisor_pricing_model AS ENUM (
    'platform_fixed',
    'free_only',
    'hybrid'
);


--
-- TOC entry 1650 (class 1247 OID 45034)
-- Name: build_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.build_status AS ENUM (
    'queued',
    'building',
    'deployed',
    'failed',
    'canceled',
    'superseded',
    'rollingBack',
    'rollbackFailed'
);


--
-- TOC entry 6648 (class 0 OID 0)
-- Dependencies: 1650
-- Name: TYPE build_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.build_status IS 'Build status enum including rollback states: rollingBack (transitional), rollbackFailed (final error state)';


--
-- TOC entry 1905 (class 1247 OID 93734)
-- Name: checkout_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.checkout_type AS ENUM (
    'redirect',
    'voucher'
);


--
-- TOC entry 1722 (class 1247 OID 81469)
-- Name: consultation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consultation_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled',
    'no_show'
);


--
-- TOC entry 1692 (class 1247 OID 69760)
-- Name: integration_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.integration_status AS ENUM (
    'connected',
    'pending',
    'disconnected',
    'error',
    'revoked'
);


--
-- TOC entry 1689 (class 1247 OID 69752)
-- Name: integration_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.integration_type AS ENUM (
    'supabase',
    'sanity',
    'stripe'
);


--
-- TOC entry 1848 (class 1247 OID 91840)
-- Name: payment_provider_key; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_provider_key AS ENUM (
    'stripe',
    'fawry',
    'paymob',
    'stcpay',
    'paytabs'
);


--
-- TOC entry 6649 (class 0 OID 0)
-- Dependencies: 1848
-- Name: TYPE payment_provider_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.payment_provider_key IS 'Supported payment providers with consistent enum usage across all tables';


--
-- TOC entry 1851 (class 1247 OID 91852)
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'created',
    'requires_action',
    'pending',
    'authorized',
    'captured',
    'succeeded',
    'failed',
    'canceled',
    'expired'
);


--
-- TOC entry 6650 (class 0 OID 0)
-- Dependencies: 1851
-- Name: TYPE payment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.payment_status IS 'Canonical payment status enum normalized across all providers';


--
-- TOC entry 1812 (class 1247 OID 91320)
-- Name: promotion_discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotion_discount_type AS ENUM (
    'percentage',
    'fixed_amount'
);


--
-- TOC entry 1815 (class 1247 OID 91326)
-- Name: promotion_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotion_status AS ENUM (
    'active',
    'paused',
    'expired',
    'disabled'
);


--
-- TOC entry 1818 (class 1247 OID 91340)
-- Name: reservation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reservation_status AS ENUM (
    'reserved',
    'committed',
    'released',
    'expired'
);


--
-- TOC entry 1854 (class 1247 OID 91872)
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'trialing',
    'past_due',
    'paused',
    'canceled',
    'incomplete',
    'incomplete_expired'
);


--
-- TOC entry 6651 (class 0 OID 0)
-- Dependencies: 1854
-- Name: TYPE subscription_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.subscription_status IS 'Canonical subscription status enum normalized across all providers';


--
-- TOC entry 1779 (class 1247 OID 89830)
-- Name: ticket_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_channel AS ENUM (
    'web',
    'email',
    'chat',
    'calcom',
    'stripe',
    'system',
    'other'
);


--
-- TOC entry 1782 (class 1247 OID 89846)
-- Name: ticket_message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_message_type AS ENUM (
    'text',
    'system_event',
    'status_change'
);


--
-- TOC entry 1776 (class 1247 OID 89820)
-- Name: ticket_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- TOC entry 1773 (class 1247 OID 89806)
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'in_progress',
    'waiting_user',
    'waiting_third_party',
    'resolved',
    'closed'
);


--
-- TOC entry 1331 (class 1247 OID 17172)
-- Name: usage_limit; Type: DOMAIN; Schema: public; Owner: -
--

CREATE DOMAIN public.usage_limit AS integer
	CONSTRAINT usage_limit_check CHECK ((VALUE >= '-1'::integer));


--
-- TOC entry 6652 (class 0 OID 0)
-- Dependencies: 1331
-- Name: DOMAIN usage_limit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON DOMAIN public.usage_limit IS '-1 represents unlimited usage';


--
-- TOC entry 1335 (class 1247 OID 17175)
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- TOC entry 1338 (class 1247 OID 17186)
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- TOC entry 1341 (class 1247 OID 17203)
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- TOC entry 1344 (class 1247 OID 17206)
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- TOC entry 1347 (class 1247 OID 17209)
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- TOC entry 1635 (class 1247 OID 80875)
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS'
);


--
-- TOC entry 492 (class 1255 OID 17210)
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- TOC entry 6653 (class 0 OID 0)
-- Dependencies: 492
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- TOC entry 493 (class 1255 OID 17211)
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- TOC entry 488 (class 1255 OID 17212)
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- TOC entry 6654 (class 0 OID 0)
-- Dependencies: 488
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- TOC entry 489 (class 1255 OID 17213)
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- TOC entry 6655 (class 0 OID 0)
-- Dependencies: 489
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- TOC entry 635 (class 1255 OID 17214)
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- TOC entry 6656 (class 0 OID 0)
-- Dependencies: 635
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- TOC entry 501 (class 1255 OID 17215)
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- TOC entry 6657 (class 0 OID 0)
-- Dependencies: 501
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- TOC entry 593 (class 1255 OID 17216)
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- TOC entry 6658 (class 0 OID 0)
-- Dependencies: 593
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- TOC entry 638 (class 1255 OID 17217)
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- TOC entry 500 (class 1255 OID 17218)
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- TOC entry 666 (class 1255 OID 17219)
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- TOC entry 6659 (class 0 OID 0)
-- Dependencies: 666
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- TOC entry 502 (class 1255 OID 17220)
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


--
-- TOC entry 482 (class 1255 OID 84106)
-- Name: add_advisor_event(uuid, uuid, public.advisor_event_type, jsonb, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_advisor_event(p_user_id uuid, p_advisor_id uuid, p_event_type public.advisor_event_type, p_event_data jsonb DEFAULT '{}'::jsonb, p_created_by uuid DEFAULT NULL::uuid, p_actor_type text DEFAULT 'system'::text, p_event_code text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO advisor_event_timeline (
    user_id, advisor_id, event_type, event_data, 
    created_by, actor_type, event_code
  )
  VALUES (
    p_user_id, p_advisor_id, p_event_type, p_event_data,
    p_created_by, p_actor_type, p_event_code
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;


--
-- TOC entry 687 (class 1255 OID 17221)
-- Name: add_owner_as_collaborator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_owner_as_collaborator() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO project_collaborators (project_id, user_id, role, accepted_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', now())
  ON CONFLICT (project_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


--
-- TOC entry 644 (class 1255 OID 81651)
-- Name: advisor_lock_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advisor_lock_user(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('advisor:user')
  );
$$;


--
-- TOC entry 621 (class 1255 OID 85654)
-- Name: advisor_offers_free_consultation(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advisor_offers_free_consultation(advisor_user_id uuid, duration_minutes integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  advisor_pricing advisor_pricing_model;
  free_durations JSONB;
BEGIN
  -- Get advisor's pricing model and free duration settings
  SELECT pricing_model, free_consultation_durations
  INTO advisor_pricing, free_durations
  FROM advisors
  WHERE user_id = advisor_user_id 
    AND approval_status = 'approved'
    AND is_accepting_bookings = true;
  
  -- Return false if advisor not found or not available
  IF advisor_pricing IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check pricing model and duration availability
  CASE advisor_pricing
    WHEN 'platform_fixed' THEN
      RETURN false; -- No free consultations in platform-fixed model
    WHEN 'free_only' THEN
      RETURN duration_minutes IN (15, 30, 60); -- All durations free
    WHEN 'hybrid' THEN
      -- Check specific duration in free_durations JSONB
      RETURN COALESCE((free_durations ->> duration_minutes::text)::boolean, false);
  END CASE;
  
  RETURN false;
END;
$$;


--
-- TOC entry 673 (class 1255 OID 53340)
-- Name: aggregate_build_events_stats(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aggregate_build_events_stats(target_date date) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Insert or update daily stats
    INSERT INTO public.build_events_daily_stats (
        date,
        total_events,
        total_builds,
        successful_builds,
        failed_builds,
        avg_duration_seconds,
        total_users,
        updated_at
    )
    SELECT
        target_date,
        COUNT(*) as total_events,
        COUNT(DISTINCT build_id) as total_builds,
        COUNT(DISTINCT CASE WHEN event_type = 'completed' AND finished = true THEN build_id END) as successful_builds,
        COUNT(DISTINCT CASE WHEN event_type = 'failed' AND finished = true THEN build_id END) as failed_builds,
        AVG(duration_seconds) as avg_duration_seconds,
        COUNT(DISTINCT user_id) as total_users,
        NOW()
    FROM public.project_build_events
    WHERE DATE(created_at) = target_date
    ON CONFLICT (date) DO UPDATE SET
        total_events = EXCLUDED.total_events,
        total_builds = EXCLUDED.total_builds,
        successful_builds = EXCLUDED.successful_builds,
        failed_builds = EXCLUDED.failed_builds,
        avg_duration_seconds = EXCLUDED.avg_duration_seconds,
        total_users = EXCLUDED.total_users,
        updated_at = NOW();
END;
$$;


--
-- TOC entry 562 (class 1255 OID 90145)
-- Name: approve_two_person(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_two_person(p_id uuid, p_approver uuid, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.admin_two_person_queue
     SET approved_by = p_approver,
         reason      = p_reason,
         state       = 'approved',
         approved_at = now()
   WHERE id = p_id
     AND state = 'pending'
     AND requested_by <> p_approver;
  RETURN FOUND;
END$$;


--
-- TOC entry 499 (class 1255 OID 87033)
-- Name: calculate_advisor_monthly_analytics(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_advisor_monthly_analytics(target_advisor_id uuid, target_month date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) RETURNS TABLE(consultations_total integer, consultations_free integer, consultations_paid integer, earnings_total_cents integer, conversion_rate numeric, average_rating numeric)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as consultations_total,
    COUNT(CASE WHEN ac.is_free_consultation THEN 1 END)::INTEGER as consultations_free,
    COUNT(CASE WHEN NOT ac.is_free_consultation THEN 1 END)::INTEGER as consultations_paid,
    COALESCE(SUM(CASE WHEN NOT ac.is_free_consultation THEN ac.advisor_earnings_cents END), 0)::INTEGER as earnings_total_cents,
    CASE 
      WHEN COUNT(CASE WHEN ac.is_free_consultation THEN 1 END) > 0 
      THEN (COUNT(CASE WHEN NOT ac.is_free_consultation THEN 1 END)::DECIMAL / COUNT(CASE WHEN ac.is_free_consultation THEN 1 END)::DECIMAL * 100)
      ELSE 0
    END as conversion_rate,
    (SELECT AVG(ar.rating)::DECIMAL(3,2) 
     FROM advisor_reviews ar 
     WHERE ar.advisor_id = target_advisor_id 
       AND ar.created_at >= target_month 
       AND ar.created_at < target_month + INTERVAL '1 month'
    ) as average_rating
  FROM advisor_consultations ac
  WHERE ac.advisor_id = target_advisor_id
    AND ac.status = 'completed'
    AND DATE_TRUNC('month', ac.start_time) = target_month;
END;
$$;


--
-- TOC entry 623 (class 1255 OID 85673)
-- Name: calculate_consultation_total(uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_consultation_total(advisor_user_id uuid, duration_minutes integer, force_free boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
  is_free BOOLEAN;
  base_rates JSONB;
  total_cents INTEGER;
BEGIN
  -- Check if this should be free
  is_free := force_free OR advisor_offers_free_consultation(advisor_user_id, duration_minutes);
  
  -- Base platform rates
  base_rates := '{
    "15": 900, "30": 1900, "60": 3500
  }'::jsonb;
  
  -- Calculate total
  IF is_free THEN
    total_cents := 0;
  ELSE
    total_cents := (base_rates ->> duration_minutes::text)::integer;
  END IF;
  
  RETURN jsonb_build_object(
    'total_cents', total_cents,
    'is_free', is_free,
    'duration_minutes', duration_minutes,
    'price_display', CASE 
      WHEN is_free THEN 'Free'
      ELSE '$' || (total_cents::float / 100)::text
    END
  );
END;
$_$;


--
-- TOC entry 508 (class 1255 OID 89937)
-- Name: calculate_sla_due_time(public.ticket_priority); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_sla_due_time(priority_level public.ticket_priority) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOW() + CASE priority_level
    WHEN 'urgent' THEN INTERVAL '2 hours'
    WHEN 'high' THEN INTERVAL '8 hours' 
    WHEN 'medium' THEN INTERVAL '24 hours'
    WHEN 'low' THEN INTERVAL '72 hours'
    ELSE INTERVAL '24 hours'
  END;
$$;


--
-- TOC entry 544 (class 1255 OID 17222)
-- Name: check_and_consume_quota(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_consume_quota(p_user_id uuid, p_metric text, p_amount integer DEFAULT 1, p_idempotency_key text DEFAULT NULL::text) RETURNS TABLE(allowed boolean, remaining integer, limit_amount integer, bonus_used integer, already_processed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_limit INTEGER;
  v_current_usage INTEGER;
  v_bonus_available INTEGER := 0;
  v_bonus_to_use INTEGER := 0;
  v_period_start DATE;
  v_metric_column TEXT;
  v_plan_name TEXT;
BEGIN
  -- Normalize metric name for the column
  v_metric_column := CASE 
    WHEN p_metric = 'projects' THEN 'projects_created'
    WHEN p_metric = 'ai_generations' THEN 'ai_generations'
    WHEN p_metric = 'exports' THEN 'exports'
    ELSE p_metric
  END;
  
  -- Check idempotency if key provided
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM usage_events 
      WHERE user_id = p_user_id 
      AND idempotency_key = p_idempotency_key
    ) THEN
      -- Already processed
      allowed := true;
      remaining := 0;
      limit_amount := 0;
      bonus_used := 0;
      already_processed := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Get current period (month)
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Get plan limit with proper fallbacks
  SELECT 
    COALESCE(
      CASE 
        WHEN p_metric = 'ai_generations' THEN 
          CASE 
            WHEN pl.max_ai_generations_per_month = -1 THEN 999999 
            ELSE pl.max_ai_generations_per_month 
          END
        WHEN p_metric = 'exports' THEN 
          CASE 
            WHEN pl.max_exports_per_month = -1 THEN 999999 
            ELSE pl.max_exports_per_month 
          END
        WHEN p_metric = 'projects' OR p_metric = 'projects_created' THEN 
          CASE 
            WHEN pl.max_projects = -1 THEN 999999 
            ELSE pl.max_projects 
          END
        ELSE 50 -- Default fallback
      END,
      50 -- Final fallback for free tier
    ),
    COALESCE(s.plan_name, 'free')
  INTO v_limit, v_plan_name
  FROM auth.users u
  LEFT JOIN customers c ON c.user_id = u.id
  LEFT JOIN subscriptions s ON s.customer_id::text = c.stripe_customer_id::text 
    AND s.status IN ('active', 'trialing')
  LEFT JOIN plan_limits pl ON pl.plan_name = COALESCE(s.plan_name, 'free')
  WHERE u.id = p_user_id;
  
  -- Default to free plan limits if not found
  IF v_limit IS NULL THEN
    v_limit := CASE v_metric_column
      WHEN 'ai_generations' THEN 50
      WHEN 'exports' THEN 10  
      WHEN 'projects_created' THEN 3
      ELSE 50
    END;
  END IF;
  
  -- Get or create usage tracking record with denormalized columns
  INSERT INTO usage_tracking (
    user_id, 
    period_start,
    ai_generations,
    projects_created,
    exports,
    storage_mb
  ) VALUES (
    p_user_id, 
    v_period_start,
    0,  -- ai_generations
    0,  -- projects_created
    0,  -- exports
    0   -- storage_mb
  )
  ON CONFLICT (user_id, period_start) 
  DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  RETURNING 
    CASE v_metric_column
      WHEN 'ai_generations' THEN ai_generations
      WHEN 'projects_created' THEN projects_created
      WHEN 'exports' THEN exports
      ELSE 0
    END INTO v_current_usage;
  
  -- Get available bonus quota
  SELECT COALESCE(SUM(amount - used_amount), 0)
  INTO v_bonus_available
  FROM user_bonuses
  WHERE user_id = p_user_id
    AND metric = p_metric
    AND expires_at > CURRENT_TIMESTAMP
    AND used_amount < amount;
  
  -- Check if allowed
  IF v_current_usage + p_amount <= v_limit THEN
    -- Within plan limits
    allowed := true;
    remaining := v_limit - (v_current_usage + p_amount);
    bonus_used := 0;
  ELSIF v_current_usage < v_limit AND (v_current_usage + p_amount) <= (v_limit + v_bonus_available) THEN
    -- Using bonus quota
    allowed := true;
    v_bonus_to_use := (v_current_usage + p_amount) - v_limit;
    remaining := 0;
    bonus_used := v_bonus_to_use;
  ELSE
    -- Quota exceeded
    allowed := false;
    remaining := GREATEST(0, v_limit - v_current_usage);
    bonus_used := 0;
    
    -- Log denial (simplified to only required columns)
    BEGIN
      INSERT INTO quota_audit_log (
        user_id, metric, requested_amount, limit_amount, 
        current_usage, success, reason, remaining_quota, bonus_used
      ) VALUES (
        p_user_id, p_metric, p_amount, v_limit,
        v_current_usage, false, 'quota_exceeded', remaining, 0
      );
    EXCEPTION WHEN others THEN
      -- If insert fails, just log and continue
      RAISE NOTICE 'Failed to log quota denial: %', SQLERRM;
    END;
    
    limit_amount := v_limit;
    already_processed := false;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Consume quota by updating the specific column
  UPDATE usage_tracking
  SET 
    ai_generations = CASE WHEN v_metric_column = 'ai_generations' THEN ai_generations + p_amount ELSE ai_generations END,
    projects_created = CASE WHEN v_metric_column = 'projects_created' THEN projects_created + p_amount ELSE projects_created END,
    exports = CASE WHEN v_metric_column = 'exports' THEN exports + p_amount ELSE exports END,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id AND period_start = v_period_start;
  
  -- Use bonus quota if needed
  IF v_bonus_to_use > 0 THEN
    -- Update bonus usage
    UPDATE user_bonuses
    SET used_amount = used_amount + v_bonus_to_use
    WHERE id = (
      SELECT id FROM user_bonuses
      WHERE user_id = p_user_id
        AND metric = p_metric
        AND expires_at > CURRENT_TIMESTAMP
        AND used_amount < amount
      ORDER BY expires_at ASC
      LIMIT 1
    );
  END IF;
  
  -- Record usage event (if this table exists)
  BEGIN
    INSERT INTO usage_events (
      user_id, metric, amount, idempotency_key
    ) VALUES (
      p_user_id, p_metric, p_amount, p_idempotency_key
    );
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
    NULL;
  END;
  
  -- Log success (simplified)
  BEGIN
    INSERT INTO quota_audit_log (
      user_id, metric, requested_amount, limit_amount,
      current_usage, success, reason, remaining_quota, bonus_used
    ) VALUES (
      p_user_id, p_metric, p_amount, v_limit,
      v_current_usage, true, 'success', remaining, v_bonus_to_use
    );
  EXCEPTION WHEN others THEN
    -- If insert fails, just log and continue
    RAISE NOTICE 'Failed to log quota success: %', SQLERRM;
  END;
  
  -- Return results
  limit_amount := v_limit;
  already_processed := false;
  RETURN NEXT;
END;
$$;


--
-- TOC entry 6660 (class 0 OID 0)
-- Dependencies: 544
-- Name: FUNCTION check_and_consume_quota(p_user_id uuid, p_metric text, p_amount integer, p_idempotency_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_and_consume_quota(p_user_id uuid, p_metric text, p_amount integer, p_idempotency_key text) IS 'Atomic quota consumption with error handling for audit logging';


--
-- TOC entry 505 (class 1255 OID 17225)
-- Name: check_and_consume_quota_v2(uuid, text, integer, text, inet); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_consume_quota_v2(p_user_id uuid, p_metric text, p_amount integer DEFAULT 1, p_idempotency_key text DEFAULT NULL::text, p_client_ip inet DEFAULT NULL::inet) RETURNS TABLE(allowed boolean, remaining integer, limit_amount integer, bonus_used integer, already_processed boolean, rate_limited boolean, plan_changed boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_plan_limit INTEGER;
  v_current_usage INTEGER;
  v_bonus_available INTEGER;
  v_total_available INTEGER;
  v_period_start TIMESTAMPTZ;
  v_base_remaining INTEGER;
  v_bonus_needed INTEGER;
  v_metric_name TEXT;
  v_rate_limit_exceeded BOOLEAN := FALSE;
  v_existing_event_id UUID;
  v_plan_changed BOOLEAN := FALSE;
  v_current_plan TEXT;
  v_last_plan_check TIMESTAMPTZ;
BEGIN
  -- Rate limiting check (IP-based)
  IF p_client_ip IS NOT NULL THEN
    -- Check requests in last minute
    WITH rate_check AS (
      INSERT INTO quota_rate_limits (identifier, identifier_type, window_start)
      VALUES (p_client_ip::text, 'ip', date_trunc('minute', CURRENT_TIMESTAMP))
      ON CONFLICT (identifier, identifier_type, window_start)
      DO UPDATE SET 
        request_count = quota_rate_limits.request_count + 1,
        created_at = CURRENT_TIMESTAMP
      RETURNING request_count
    )
    SELECT request_count > 20 INTO v_rate_limit_exceeded -- 20 req/minute limit
    FROM rate_check;
    
    IF v_rate_limit_exceeded THEN
      -- Log rate limit violation
      INSERT INTO quota_audit_log (
        user_id, metric, attempted_amount,
        success, reason, context
      ) VALUES (
        p_user_id, p_metric, p_amount,
        false, 'rate_limited', jsonb_build_object(
          'client_ip', p_client_ip,
          'timestamp', CURRENT_TIMESTAMP
        )
      );
      
      RETURN QUERY SELECT false, 0, 0, 0, false, true, false;
      RETURN;
    END IF;
  END IF;

  -- Map metric names for usage_tracking compatibility
  v_metric_name := CASE 
    WHEN p_metric = 'projects' THEN 'projects_created'
    ELSE p_metric
  END;

  -- Enhanced idempotency check with collision detection
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_event_id
    FROM usage_events 
    WHERE user_id = p_user_id 
    AND idempotency_key = p_idempotency_key;
    
    IF FOUND THEN
      -- Check if this is a potential collision (different request details)
      IF EXISTS (
        SELECT 1 FROM usage_events 
        WHERE id = v_existing_event_id
        AND (
          metric != p_metric OR 
          amount != p_amount OR
          ABS(EXTRACT(EPOCH FROM (created_at - CURRENT_TIMESTAMP))) > 300 -- More than 5 minutes apart
        )
      ) THEN
        -- Log potential collision
        INSERT INTO quota_audit_log (
          user_id, metric, attempted_amount,
          success, reason, context
        ) VALUES (
          p_user_id, p_metric, p_amount,
          false, 'idempotency_collision', jsonb_build_object(
            'idempotency_key', p_idempotency_key,
            'original_event_id', v_existing_event_id,
            'collision_details', 'Different request parameters with same key'
          )
        );
        
        -- Update original event to mark collision
        UPDATE usage_events 
        SET 
          collision_detected = true,
          collision_metadata = jsonb_build_object(
            'collision_time', CURRENT_TIMESTAMP,
            'collision_details', 'Key reused with different parameters'
          )
        WHERE id = v_existing_event_id;
      END IF;
      
      RETURN QUERY SELECT true, 0, 0, 0, true, false, false;
      RETURN;
    END IF;
  END IF;

  -- Start transaction with appropriate isolation
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Get current period
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Check for recent plan changes
  SELECT 
    new_plan,
    effective_date
  INTO v_current_plan, v_last_plan_check
  FROM plan_change_log
  WHERE user_id = p_user_id
  ORDER BY effective_date DESC
  LIMIT 1;
  
  -- If plan changed in current period, mark for special handling
  IF v_last_plan_check IS NOT NULL AND v_last_plan_check >= v_period_start THEN
    v_plan_changed := TRUE;
  END IF;
  
  -- Get plan limit with proper subscription lookup
  SELECT 
    COALESCE(
      CASE 
        WHEN p_metric = 'ai_generations' THEN 
          CASE 
            WHEN pl.max_ai_generations_per_month = -1 THEN 999999
            ELSE pl.max_ai_generations_per_month
          END
        WHEN p_metric = 'exports' THEN 
          CASE 
            WHEN pl.max_exports_per_month = -1 THEN 999999
            ELSE pl.max_exports_per_month
          END
        WHEN p_metric = 'projects' THEN 
          CASE 
            WHEN pl.max_projects = -1 THEN 999999
            ELSE pl.max_projects
          END
      END,
      -- Free plan defaults
      CASE p_metric
        WHEN 'ai_generations' THEN 10
        WHEN 'exports' THEN 1
        WHEN 'projects' THEN 3
        ELSE 0
      END
    ) INTO v_plan_limit
  FROM auth.users u
  LEFT JOIN customers c ON c.user_id = u.id
  LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
  LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
  WHERE u.id = p_user_id;
  
  -- Ensure usage_tracking record exists
  INSERT INTO usage_tracking (
    user_id, 
    metric_name, 
    metric_value,
    usage_amount, 
    period_start,
    period_end
  )
  VALUES (
    p_user_id, 
    v_metric_name, 
    0,
    0, 
    v_period_start,
    v_period_start + INTERVAL '1 month' - INTERVAL '1 second'
  )
  ON CONFLICT (user_id, period_start) 
  DO NOTHING;
  
  -- Get current usage and lock the row
  SELECT COALESCE(usage_amount, 0) INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id 
  AND metric_name = v_metric_name
  AND period_start = v_period_start
  FOR UPDATE;
  
  -- Get available bonus
  SELECT COALESCE(SUM(amount - used_amount), 0) INTO v_bonus_available
  FROM user_bonuses
  WHERE user_id = p_user_id
  AND metric = p_metric
  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
  
  -- Calculate what's available from base quota
  v_base_remaining := GREATEST(0, v_plan_limit - v_current_usage);
  
  -- Calculate total available
  v_total_available := v_base_remaining + v_bonus_available;
  
  -- Check if allowed
  IF v_total_available >= p_amount THEN
    -- Consume quota
    UPDATE usage_tracking 
    SET 
      usage_amount = usage_amount + p_amount,
      metric_value = usage_amount + p_amount,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id 
    AND metric_name = v_metric_name
    AND period_start = v_period_start;
    
    -- Track event with enhanced metadata
    INSERT INTO usage_events (
      user_id, metric, amount, 
      idempotency_key, metadata
    ) VALUES (
      p_user_id, p_metric, p_amount,
      p_idempotency_key, jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage,
        'base_remaining', v_base_remaining,
        'bonus_available', v_bonus_available,
        'plan_changed_in_period', v_plan_changed,
        'client_ip', p_client_ip
      )
    );
    
    -- Calculate and consume bonus if needed
    v_bonus_needed := GREATEST(0, p_amount - v_base_remaining);
    
    IF v_bonus_needed > 0 THEN
      WITH bonus_consumption AS (
        SELECT 
          id,
          amount - used_amount as available,
          SUM(amount - used_amount) OVER (ORDER BY expires_at NULLS LAST, created_at) as running_total
        FROM user_bonuses
        WHERE user_id = p_user_id 
        AND metric = p_metric
        AND used_amount < amount
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        FOR UPDATE
      )
      UPDATE user_bonuses b
      SET used_amount = used_amount + 
        CASE 
          WHEN bc.running_total - bc.available < v_bonus_needed 
          THEN LEAST(bc.available, v_bonus_needed - (bc.running_total - bc.available))
          ELSE 0
        END
      FROM bonus_consumption bc
      WHERE b.id = bc.id
      AND bc.running_total - bc.available < v_bonus_needed;
    END IF;
    
    -- Enhanced audit logging
    INSERT INTO quota_audit_log (
      user_id, metric, attempted_amount,
      success, reason, context
    ) VALUES (
      p_user_id, p_metric, p_amount,
      true, CASE 
        WHEN v_bonus_needed > 0 THEN 'bonus_consumed'
        WHEN v_plan_changed THEN 'success_plan_changed'
        ELSE 'success'
      END,
      jsonb_build_object(
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage,
        'usage_after', v_current_usage + p_amount,
        'bonus_used', v_bonus_needed,
        'plan_changed_in_period', v_plan_changed,
        'idempotency_key', p_idempotency_key,
        'client_ip', p_client_ip
      )
    );
    
    RETURN QUERY SELECT 
      true AS allowed,
      v_total_available - p_amount AS remaining,
      v_plan_limit AS limit_amount,
      v_bonus_needed AS bonus_used,
      false AS already_processed,
      false AS rate_limited,
      v_plan_changed AS plan_changed;
  ELSE
    -- Enhanced denial logging
    INSERT INTO quota_audit_log (
      user_id, metric, attempted_amount, 
      success, reason, context
    ) VALUES (
      p_user_id, p_metric, p_amount,
      false, 'quota_exceeded', jsonb_build_object(
        'plan_limit', v_plan_limit,
        'current_usage', v_current_usage,
        'bonus_available', v_bonus_available,
        'total_available', v_total_available,
        'requested', p_amount,
        'plan_changed_in_period', v_plan_changed,
        'client_ip', p_client_ip
      )
    );
    
    RETURN QUERY SELECT 
      false AS allowed,
      v_total_available AS remaining,
      v_plan_limit AS limit_amount,
      0 AS bonus_used,
      false AS already_processed,
      false AS rate_limited,
      v_plan_changed AS plan_changed;
  END IF;
END;
$$;


--
-- TOC entry 6661 (class 0 OID 0)
-- Dependencies: 505
-- Name: FUNCTION check_and_consume_quota_v2(p_user_id uuid, p_metric text, p_amount integer, p_idempotency_key text, p_client_ip inet); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_and_consume_quota_v2(p_user_id uuid, p_metric text, p_amount integer, p_idempotency_key text, p_client_ip inet) IS 'Enhanced quota function with DoS protection, collision detection, and plan change handling';


--
-- TOC entry 561 (class 1255 OID 90127)
-- Name: claim_idempotency(text, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_idempotency(p_key text, p_admin_user_id uuid, p_action text, p_resource_type text, p_resource_id text, p_request_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.idempotency_keys(
    key, admin_user_id, action, resource_type, resource_id, request_hash
  )
  VALUES (p_key, p_admin_user_id, p_action, p_resource_type, p_resource_id, p_request_hash);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END$$;


--
-- TOC entry 542 (class 1255 OID 90076)
-- Name: cleanup_expired_admin_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_admin_sessions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM admin_sessions 
  WHERE expires_at < NOW() - INTERVAL '7 days'; -- Keep expired sessions for 7 days for audit
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;


--
-- TOC entry 6662 (class 0 OID 0)
-- Dependencies: 542
-- Name: FUNCTION cleanup_expired_admin_sessions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_expired_admin_sessions() IS 'Cleans up expired admin sessions older than 7 days';


--
-- TOC entry 641 (class 1255 OID 69689)
-- Name: cleanup_expired_oauth_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_oauth_data() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER := 0;
  current_deleted INTEGER := 0;
BEGIN
  -- Clean up expired state nonces
  DELETE FROM oauth_state_nonces WHERE expires_at < NOW();
  GET DIAGNOSTICS current_deleted = ROW_COUNT;
  deleted_count := deleted_count + current_deleted;
  
  -- Clean up expired idempotency keys
  DELETE FROM oauth_exchange_idempotency WHERE expires_at < NOW();
  GET DIAGNOSTICS current_deleted = ROW_COUNT;
  deleted_count := deleted_count + current_deleted;
  
  -- Clean up expired breakglass entries
  DELETE FROM supabase_breakglass_recovery WHERE expires_at < NOW() OR is_active = FALSE;
  GET DIAGNOSTICS current_deleted = ROW_COUNT;
  deleted_count := deleted_count + current_deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- TOC entry 504 (class 1255 OID 17228)
-- Name: cleanup_old_quota_audit_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_quota_audit_logs() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM quota_audit_log 
  WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$;


--
-- TOC entry 509 (class 1255 OID 17229)
-- Name: cleanup_quota_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_quota_rate_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Remove rate limit records older than 1 hour
  DELETE FROM quota_rate_limits 
  WHERE window_start < CURRENT_TIMESTAMP - INTERVAL '1 hour';
  
  -- Remove old collision logs (keep 30 days)
  UPDATE usage_events 
  SET 
    collision_detected = NULL,
    collision_metadata = '{}'::jsonb
  WHERE collision_detected = true 
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$;


--
-- TOC entry 6663 (class 0 OID 0)
-- Dependencies: 509
-- Name: FUNCTION cleanup_quota_rate_limits(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_quota_rate_limits() IS 'Cleanup function for rate limit and collision data';


--
-- TOC entry 516 (class 1255 OID 91697)
-- Name: compute_bucket_totals(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_bucket_totals(buckets jsonb) RETURNS TABLE(paid_seconds bigint, bonus_seconds bigint, next_expiry timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
  bucket JSONB;
  paid_total BIGINT := 0;
  bonus_total BIGINT := 0;
  earliest_expiry TIMESTAMPTZ := NULL;
  bucket_expiry TIMESTAMPTZ;
  remaining_seconds INTEGER;
  is_expired BOOLEAN;
BEGIN
  FOR bucket IN SELECT jsonb_array_elements(buckets)
  LOOP
    remaining_seconds := (bucket->>'seconds')::INTEGER - (bucket->>'consumed')::INTEGER;

    -- Check if bucket has expired (treat null expires_at as non-expiring)
    is_expired := FALSE;
    IF bucket ? 'expires_at' AND bucket->>'expires_at' IS NOT NULL THEN
      bucket_expiry := (bucket->>'expires_at')::timestamptz;
      is_expired := (bucket_expiry <= now());
    END IF;

    -- Only count non-expired buckets with remaining seconds
    IF remaining_seconds > 0 AND NOT is_expired THEN
      -- Expert recommendation: welcome and gift are paid by policy (not bonus)
      -- Bonus = daily only; Paid = everything else (subs, packages, welcome grants, support gifts)
      IF bucket->>'source' IN ('subscription','rollover','package','welcome','gift') THEN
        paid_total := paid_total + remaining_seconds;
      ELSE
        bonus_total := bonus_total + remaining_seconds;
      END IF;

      -- Track earliest expiry among non-expired, expiring buckets only
      IF bucket ? 'expires_at' AND bucket->>'expires_at' IS NOT NULL THEN
        IF earliest_expiry IS NULL OR bucket_expiry < earliest_expiry THEN
          earliest_expiry := bucket_expiry;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT paid_total, bonus_total, earliest_expiry;
END;
$$;


--
-- TOC entry 6664 (class 0 OID 0)
-- Dependencies: 516
-- Name: FUNCTION compute_bucket_totals(buckets jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.compute_bucket_totals(buckets jsonb) IS 'Computes paid/bonus totals and next expiry from bucket JSONB. Policy: bonus = daily only; paid = subscription, rollover, package, welcome, gift';


--
-- TOC entry 565 (class 1255 OID 17230)
-- Name: create_commit_and_update_branch(uuid, uuid, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_commit_and_update_branch(p_project_id uuid, p_author_id uuid, p_tree_hash text, p_message text, p_payload_size integer, p_branch_name text DEFAULT 'main'::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_commit_id UUID;
  v_parent_ids UUID[];
  v_branch_updated_at TIMESTAMPTZ;
BEGIN
  -- Set serializable isolation for this transaction
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Get current head and updated_at for optimistic locking
  SELECT head_id, updated_at INTO v_parent_ids[1], v_branch_updated_at
  FROM branches 
  WHERE project_id = p_project_id AND name = p_branch_name;
  
  -- Create commit
  INSERT INTO commits (
    project_id, author_id, parent_ids, tree_hash, message, payload_size
  ) VALUES (
    p_project_id, p_author_id, COALESCE(v_parent_ids, '{}'), p_tree_hash, p_message, p_payload_size
  ) RETURNING id INTO v_commit_id;
  
  -- Update branch head atomically (prevents lost updates)
  UPDATE branches 
  SET head_id = v_commit_id, updated_at = NOW()
  WHERE project_id = p_project_id 
    AND name = p_branch_name
    AND updated_at = v_branch_updated_at;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch was updated by another process. Please retry.';
  END IF;
  
  RETURN v_commit_id;
END;
$$;


--
-- TOC entry 686 (class 1255 OID 48830)
-- Name: create_complete_project(uuid, character varying, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_complete_project(p_user_id uuid, p_framework character varying DEFAULT 'react'::character varying, p_prompt text DEFAULT NULL::text, p_name text DEFAULT 'Untitled Project'::text) RETURNS TABLE(project_id uuid, version_id text, build_id text, build_metrics_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_project_id UUID;
  new_version_id TEXT;
  new_build_id TEXT;
  new_metrics_id INTEGER;
BEGIN
  -- Advisory lock prevents accidental double-click project creation (automatic cleanup on transaction end)
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  
  -- Generate all IDs server-side
  new_project_id := gen_random_uuid();
  new_version_id := generate_ulid();
  new_build_id := generate_ulid();
  
  -- Create project with initial build state
  INSERT INTO projects (id, owner_id, name, framework, created_by_service,
                       build_status, current_build_id, current_version_id, 
                       last_build_started)
  VALUES (new_project_id, p_user_id, p_name, p_framework, 'worker-service',
          'building', new_build_id, new_version_id, NOW());
  
  -- Create initial version
  INSERT INTO project_versions (user_id, project_id, version_id, prompt, 
                               framework, status)
  VALUES (p_user_id, new_project_id, new_version_id, p_prompt, 
          p_framework, 'building');
  
  -- Create initial build metrics record
  INSERT INTO project_build_metrics (build_id, version_id, project_id, user_id,
                                   is_initial_build, status, started_at, framework)
  VALUES (new_build_id, new_version_id, new_project_id, p_user_id,
          true, 'started', NOW(), p_framework)
  RETURNING id INTO new_metrics_id;
  
  RETURN QUERY SELECT new_project_id, new_version_id, new_build_id, new_metrics_id;
END;
$$;


--
-- TOC entry 6665 (class 0 OID 0)
-- Dependencies: 686
-- Name: FUNCTION create_complete_project(p_user_id uuid, p_framework character varying, p_prompt text, p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_complete_project(p_user_id uuid, p_framework character varying, p_prompt text, p_name text) IS 'Atomically creates project with all required records and prevents race conditions via advisory locking';


--
-- TOC entry 639 (class 1255 OID 49960)
-- Name: create_project_for_build(uuid, character varying, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_project_for_build(p_user_id uuid, p_framework character varying DEFAULT 'react'::character varying, p_prompt text DEFAULT NULL::text, p_name text DEFAULT 'Untitled Project'::text) RETURNS TABLE(project_id uuid, version_id text, build_id text, build_metrics_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_project_id UUID;
  new_version_id TEXT;
  new_build_id TEXT;
  new_metrics_id INTEGER;
  existing_project_id UUID;
BEGIN
  -- Advisory lock prevents accidental double-click project creation
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || coalesce(p_prompt, 'default')));
  
  -- Check if a project with similar characteristics already exists for this user
  -- This helps detect race conditions between Worker and NextJS
  SELECT id INTO existing_project_id
  FROM projects 
  WHERE owner_id = p_user_id 
    AND name = p_name
    AND framework = p_framework
    AND created_at > NOW() - INTERVAL '10 seconds'  -- Recent creation indicates race condition
  LIMIT 1;
  
  IF existing_project_id IS NOT NULL THEN
    -- Race condition detected - return existing project info
    -- Get the associated build info
    SELECT p.id, pbm.version_id, pbm.build_id, pbm.id
    INTO new_project_id, new_version_id, new_build_id, new_metrics_id
    FROM projects p
    LEFT JOIN project_build_metrics pbm ON p.current_build_id = pbm.build_id
    WHERE p.id = existing_project_id;
    
    -- If no build metrics found, this might be from NextJS - create them
    IF new_build_id IS NULL THEN
      new_version_id := generate_ulid();
      new_build_id := generate_ulid();
      
      -- Create build metrics for existing project
      INSERT INTO project_build_metrics (build_id, version_id, project_id, user_id,
                                       is_initial_build, status, started_at, framework)
      VALUES (new_build_id, new_version_id, existing_project_id, p_user_id,
              true, 'started', NOW(), p_framework)
      RETURNING id INTO new_metrics_id;
      
      -- Update project with build info
      UPDATE projects 
      SET current_build_id = new_build_id, 
          build_status = 'building',
          last_build_started = NOW()
      WHERE id = existing_project_id;
    END IF;
    
    RETURN QUERY SELECT existing_project_id, new_version_id, new_build_id, new_metrics_id;
    RETURN;
  END IF;
  
  -- Generate all IDs server-side
  new_project_id := gen_random_uuid();
  new_version_id := generate_ulid();
  new_build_id := generate_ulid();
  
  -- Create project with initial build state (use INSERT ... ON CONFLICT for idempotency)
  INSERT INTO projects (id, owner_id, name, framework, created_by_service,
                       build_status, current_build_id, last_build_started)
  VALUES (new_project_id, p_user_id, p_name, p_framework, 'worker-service',
          'building', new_build_id, NOW())
  ON CONFLICT (id) DO NOTHING;
  
  -- IMPORTANT: Don't create project_versions record yet!
  -- StreamWorker will create it only when build succeeds to prevent ghost versions
  
  -- Create initial build metrics record
  INSERT INTO project_build_metrics (build_id, version_id, project_id, user_id,
                                   is_initial_build, status, started_at, framework)
  VALUES (new_build_id, new_version_id, new_project_id, p_user_id,
          true, 'started', NOW(), p_framework)
  RETURNING id INTO new_metrics_id;
  
  RETURN QUERY SELECT new_project_id, new_version_id, new_build_id, new_metrics_id;
END;
$$;


--
-- TOC entry 6666 (class 0 OID 0)
-- Dependencies: 639
-- Name: FUNCTION create_project_for_build(p_user_id uuid, p_framework character varying, p_prompt text, p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_project_for_build(p_user_id uuid, p_framework character varying, p_prompt text, p_name text) IS 'Creates project with build metrics (idempotent) - handles race conditions between Worker and NextJS services';


--
-- TOC entry 684 (class 1255 OID 48809)
-- Name: create_version_on_success(uuid, text, uuid, text, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_version_on_success(p_project_id uuid, p_version_id text, p_user_id uuid, p_prompt text, p_framework character varying, p_ai_session_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Use INSERT ... ON CONFLICT to handle duplicate version_id gracefully
  INSERT INTO project_versions (user_id, project_id, version_id, prompt, 
                               framework, status, ai_session_id, ai_session_created_at, ai_session_last_used_at)
  VALUES (p_user_id, p_project_id, p_version_id, p_prompt, 
          p_framework, 'deployed', p_ai_session_id, 
          CASE WHEN p_ai_session_id IS NOT NULL THEN NOW() ELSE NULL END,
          CASE WHEN p_ai_session_id IS NOT NULL THEN NOW() ELSE NULL END)
  ON CONFLICT (version_id) DO NOTHING;
          
  -- Update project to point to this successful version (idempotent)
  UPDATE projects 
  SET current_version_id = p_version_id,
      build_status = 'deployed',
      last_build_completed = NOW()
  WHERE id = p_project_id;
END;
$$;


--
-- TOC entry 6667 (class 0 OID 0)
-- Dependencies: 684
-- Name: FUNCTION create_version_on_success(p_project_id uuid, p_version_id text, p_user_id uuid, p_prompt text, p_framework character varying, p_ai_session_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_version_on_success(p_project_id uuid, p_version_id text, p_user_id uuid, p_prompt text, p_framework character varying, p_ai_session_id text) IS 'Creates version record with conflict handling and updates project only when build completes successfully';


--
-- TOC entry 625 (class 1255 OID 73325)
-- Name: debug_auth_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debug_auth_context() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'current_role', current_setting('role', true),
    'auth_uid', auth.uid(),
    'auth_role', auth.role(),
    'jwt_claims', auth.jwt(),
    'has_policies_check', (
      SELECT COUNT(*) FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'projects'
    ),
    'timestamp', now()
  ) INTO result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'error', 'Debug function failed',
    'message', SQLERRM,
    'current_user', current_user,
    'timestamp', now()
  );
END;
$$;


--
-- TOC entry 450 (class 1255 OID 91497)
-- Name: enforce_code_promo_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_code_promo_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE 
  pc_promo uuid;
BEGIN
  SELECT promotion_id INTO pc_promo 
  FROM promotion_codes 
  WHERE id = NEW.promotion_code_id;
  
  IF pc_promo IS NULL OR pc_promo <> NEW.promotion_id THEN
    RAISE EXCEPTION 'promotion_code_id (%) does not belong to promotion_id (%)', 
      NEW.promotion_code_id, NEW.promotion_id
      USING ERRCODE = 'foreign_key_violation',
            DETAIL = 'Promotion code must belong to the specified promotion';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- TOC entry 6668 (class 0 OID 0)
-- Dependencies: 450
-- Name: FUNCTION enforce_code_promo_match(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_code_promo_match() IS 'Ensures promotion_code_id belongs to the specified promotion_id. Maintains referential consistency.';


--
-- TOC entry 498 (class 1255 OID 91659)
-- Name: ensure_single_active_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_active_catalog() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If setting a catalog to active, deactivate all others
  IF NEW.is_active = true THEN
    UPDATE pricing_catalog_versions 
    SET is_active = false 
    WHERE id != NEW.id AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- TOC entry 449 (class 1255 OID 91495)
-- Name: forbid_updates_when_finalized(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forbid_updates_when_finalized() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Allow new records
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent ANY modifications to finalized states
  IF OLD.status IN ('committed', 'expired') THEN
    RAISE EXCEPTION 'Reservation is finalized (status: %)', OLD.status
      USING ERRCODE = 'check_violation',
            DETAIL = 'Finalized reservations cannot be modified',
            HINT = 'Create a new reservation instead';
  END IF;
  
  -- Validate state transitions for non-finalized reservations
  IF OLD.status = 'reserved' AND NEW.status NOT IN ('committed', 'released', 'expired') THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- TOC entry 6669 (class 0 OID 0)
-- Dependencies: 449
-- Name: FUNCTION forbid_updates_when_finalized(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.forbid_updates_when_finalized() IS 'Prevents ALL modifications to finalized reservations (committed/expired). Enforces state machine integrity.';


--
-- TOC entry 606 (class 1255 OID 81373)
-- Name: fuzzy_search_chat_messages(uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fuzzy_search_chat_messages(p_project_id uuid, p_user_id uuid, p_query text, p_limit integer DEFAULT 20) RETURNS TABLE(id bigint, seq bigint, message_text text, similarity real)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 564 (class 1255 OID 90147)
-- Name: gc_admin_tables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gc_admin_tables() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Clean up old idempotency keys (180 days)
  DELETE FROM public.idempotency_keys 
  WHERE created_at < now() - INTERVAL '180 days';
  
  -- Optional: archive old admin action logs (2 years) - uncomment if needed
  -- DELETE FROM public.admin_action_log_app 
  -- WHERE created_at < now() - INTERVAL '2 years';
  
  -- Note: Keep admin_two_person_queue records for audit purposes (no auto-cleanup)
END$$;


--
-- TOC entry 506 (class 1255 OID 89936)
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ticket_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 'ST-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
         LPAD(nextval('support_ticket_seq')::TEXT, 6, '0');
$$;


--
-- TOC entry 497 (class 1255 OID 48786)
-- Name: generate_ulid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ulid() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- ULID format: 10 bytes timestamp (base32) + 16 bytes randomness (base32) = 26 chars
    timestamp_part TEXT;
    random_part TEXT;
    ulid_alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford's Base32
    ts BIGINT;
    random_bytes BYTEA;
    i INT;
    result TEXT := '';
BEGIN
    -- Get current timestamp in milliseconds
    ts := EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC') * 1000;
    
    -- Convert timestamp to 10-character base32 string
    timestamp_part := '';
    FOR i IN 0..9 LOOP
        timestamp_part := SUBSTRING(ulid_alphabet FROM ((ts >> (5 * (9-i))) & 31)::INTEGER + 1 FOR 1) || timestamp_part;
    END LOOP;
    
    -- Generate 16 random bytes for the random part
    random_bytes := gen_random_bytes(10); -- 10 bytes = 16 base32 chars
    
    -- Convert random bytes to 16-character base32 string
    random_part := '';
    FOR i IN 0..9 LOOP
        random_part := random_part || SUBSTRING(ulid_alphabet FROM (GET_BYTE(random_bytes, i) >> 3) + 1 FOR 1);
        IF i < 9 THEN
            random_part := random_part || SUBSTRING(ulid_alphabet FROM ((GET_BYTE(random_bytes, i) & 7) << 2 | (GET_BYTE(random_bytes, i+1) >> 6)) + 1 FOR 1);
        END IF;
    END LOOP;
    
    -- Ensure we have exactly 16 characters for random part
    random_part := SUBSTRING(random_part FROM 1 FOR 16);
    
    RETURN timestamp_part || random_part;
END;
$$;


--
-- TOC entry 6670 (class 0 OID 0)
-- Dependencies: 497
-- Name: FUNCTION generate_ulid(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_ulid() IS 'PostgreSQL-native ULID generator compatible with TypeScript ulid() library';


--
-- TOC entry 534 (class 1255 OID 85533)
-- Name: get_advisor_available_languages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_advisor_available_languages(advisor_user_id uuid) RETURNS character varying[]
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  available_langs VARCHAR(5)[] := ARRAY[]::VARCHAR(5)[];
  lang VARCHAR(5);
BEGIN
  -- Check which languages have bio content
  FOR lang IN SELECT unnest(ARRAY['en', 'ar', 'fr', 'es', 'de']) LOOP
    IF (SELECT multilingual_bio ->> lang FROM advisors WHERE user_id = advisor_user_id) IS NOT NULL THEN
      available_langs := array_append(available_langs, lang);
    END IF;
  END LOOP;
  
  -- Include legacy bio as English if no multilingual content
  IF array_length(available_langs, 1) IS NULL OR array_length(available_langs, 1) = 0 THEN
    IF (SELECT bio FROM advisors WHERE user_id = advisor_user_id) IS NOT NULL THEN
      available_langs := ARRAY['en'];
    END IF;
  END IF;
  
  RETURN available_langs;
END;
$$;


--
-- TOC entry 522 (class 1255 OID 87085)
-- Name: get_advisor_available_languages_localized(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_advisor_available_languages_localized(advisor_user_id uuid, target_locale character varying DEFAULT 'en'::character varying) RETURNS TABLE(language_code character varying, language_name text)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  lang VARCHAR(5);
BEGIN
  -- Get available language codes first
  FOR lang IN 
    SELECT unnest(get_advisor_available_languages(advisor_user_id))
  LOOP
    RETURN QUERY SELECT 
      lang as language_code,
      get_localized_language_name(lang, target_locale) as language_name;
  END LOOP;
END;
$$;


--
-- TOC entry 532 (class 1255 OID 85511)
-- Name: get_advisor_bio_localized(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_advisor_bio_localized(advisor_user_id uuid, preferred_language character varying DEFAULT 'en'::character varying) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  bio_content TEXT;
BEGIN
  -- Try preferred language first
  SELECT multilingual_bio ->> preferred_language
  INTO bio_content
  FROM advisors
  WHERE user_id = advisor_user_id;
  
  -- Fallback to English if preferred language not available
  IF bio_content IS NULL THEN
    SELECT COALESCE(
      multilingual_bio ->> 'en',
      bio  -- Legacy fallback to original bio column
    )
    INTO bio_content
    FROM advisors
    WHERE user_id = advisor_user_id;
  END IF;
  
  RETURN bio_content;
END;
$$;


--
-- TOC entry 672 (class 1255 OID 85803)
-- Name: get_advisor_display_name_localized(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_advisor_display_name_localized(advisor_user_id uuid, target_language text DEFAULT 'en'::text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result_name TEXT;
  fallback_name TEXT;
BEGIN
  -- Get the advisor's multilingual display name and fallback
  SELECT 
    multilingual_display_name ->> target_language,
    display_name
  INTO result_name, fallback_name
  FROM advisors 
  WHERE user_id = advisor_user_id;

  -- Return localized name if available, otherwise fallback to default display_name
  RETURN COALESCE(result_name, fallback_name, 'Unknown Advisor');
END;
$$;


--
-- TOC entry 688 (class 1255 OID 53391)
-- Name: get_build_chat_context(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_build_chat_context(p_build_id text, p_context_minutes integer DEFAULT 185) RETURNS TABLE(id bigint, project_id uuid, user_id uuid, message_text text, message_type text, build_triggered boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
    build_time TIMESTAMPTZ;
BEGIN
    -- Find when the build was triggered
    SELECT MIN(created_at) INTO build_time
    FROM public.chat_log_minimal
    WHERE build_id = p_build_id AND build_triggered = true;

    -- Return messages around that time
    RETURN QUERY
    SELECT
        cl.id,
        cl.project_id,
        cl.user_id,
        cl.message_text,
        cl.message_type,
        cl.build_triggered,
        cl.created_at
    FROM public.chat_log_minimal cl
    WHERE (cl.build_id = p_build_id OR
           (build_time IS NOT NULL AND
            cl.created_at BETWEEN build_time - (p_context_minutes || ' minutes')::INTERVAL
                               AND build_time + (p_context_minutes || ' minutes')::INTERVAL))
    ORDER BY cl.created_at ASC;
END;
$$;


--
-- TOC entry 681 (class 1255 OID 17231)
-- Name: get_claude_usage_stats(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_claude_usage_stats(p_start_date timestamp with time zone DEFAULT (now() - '7 days'::interval), p_end_date timestamp with time zone DEFAULT now()) RETURNS TABLE(hour timestamp with time zone, total_calls integer, unique_users integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.window_start as hour,
        SUM(c.calls)::INTEGER as total_calls,
        COUNT(DISTINCT c.user_id)::INTEGER as unique_users
    FROM 
        claude_user_usage c
    WHERE 
        c.window_start >= p_start_date 
        AND c.window_start <= p_end_date
    GROUP BY 
        c.window_start
    ORDER BY 
        c.window_start DESC;
END;
$$;


--
-- TOC entry 622 (class 1255 OID 85655)
-- Name: get_consultation_pricing_with_free(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_consultation_pricing_with_free(advisor_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
  base_pricing JSONB;
  advisor_free_durations JSONB;
  advisor_pricing advisor_pricing_model;
  result JSONB;
BEGIN
  -- Base platform pricing
  base_pricing := '{
    "15": {"price_cents": 900, "price_display": "$9.00"},
    "30": {"price_cents": 1900, "price_display": "$19.00"}, 
    "60": {"price_cents": 3500, "price_display": "$35.00"}
  }'::jsonb;
  
  -- If no specific advisor, return base pricing only
  IF advisor_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'pricing', base_pricing,
      'platform_fee_percentage', 30,
      'currency', 'USD'
    );
  END IF;
  
  -- Get advisor's free consultation settings
  SELECT pricing_model, free_consultation_durations
  INTO advisor_pricing, advisor_free_durations
  FROM advisors
  WHERE user_id = advisor_user_id;
  
  -- Build result with free consultation info
  result := jsonb_build_object(
    'pricing', base_pricing,
    'platform_fee_percentage', 30,
    'currency', 'USD',
    'advisor_pricing_model', advisor_pricing
  );
  
  -- Add free consultation availability
  CASE advisor_pricing
    WHEN 'free_only' THEN
      result := result || jsonb_build_object(
        'free_consultations_available', jsonb_build_object(
          '15', true, '30', true, '60', true
        )
      );
    WHEN 'hybrid' THEN
      result := result || jsonb_build_object(
        'free_consultations_available', COALESCE(advisor_free_durations, '{}'::jsonb)
      );
    ELSE
      result := result || jsonb_build_object(
        'free_consultations_available', '{}'::jsonb
      );
  END CASE;
  
  RETURN result;
END;
$_$;


--
-- TOC entry 521 (class 1255 OID 87084)
-- Name: get_localized_language_name(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_localized_language_name(language_code character varying, target_locale character varying DEFAULT 'en'::character varying) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  -- Return localized language names based on target locale
  CASE target_locale
    WHEN 'ar' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'العربية'
        WHEN 'en' THEN 'الإنجليزية'  
        WHEN 'fr' THEN 'الفرنسية'
        WHEN 'es' THEN 'الإسبانية'
        WHEN 'de' THEN 'الألمانية'
        ELSE language_code
      END;
    WHEN 'fr' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'Arabe'
        WHEN 'en' THEN 'Anglais'
        WHEN 'fr' THEN 'Français'
        WHEN 'es' THEN 'Espagnol'
        WHEN 'de' THEN 'Allemand'
        ELSE language_code
      END;
    WHEN 'es' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'Árabe'
        WHEN 'en' THEN 'Inglés'
        WHEN 'fr' THEN 'Francés'
        WHEN 'es' THEN 'Español'
        WHEN 'de' THEN 'Alemán'
        ELSE language_code
      END;
    WHEN 'de' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'Arabisch'
        WHEN 'en' THEN 'Englisch'
        WHEN 'fr' THEN 'Französisch'
        WHEN 'es' THEN 'Spanisch'
        WHEN 'de' THEN 'Deutsch'
        ELSE language_code
      END;
    ELSE -- Default to English
      RETURN CASE language_code
        WHEN 'ar' THEN 'Arabic'
        WHEN 'en' THEN 'English'
        WHEN 'fr' THEN 'French'
        WHEN 'es' THEN 'Spanish'
        WHEN 'de' THEN 'German'
        ELSE language_code
      END;
  END CASE;
END;
$$;


--
-- TOC entry 535 (class 1255 OID 93839)
-- Name: get_preferred_provider_for_region(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_preferred_provider_for_region(p_promotion_id uuid, p_region_code text) RETURNS public.payment_provider_key[]
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_providers payment_provider_key[];
  v_supported payment_provider_key[];
BEGIN
  -- Get the promotion's supported providers
  SELECT supported_providers INTO v_supported
  FROM promotions
  WHERE id = p_promotion_id;
  
  -- Get regional preferences
  SELECT preferred_providers INTO v_providers
  FROM promotion_regional_config
  WHERE promotion_id = p_promotion_id 
    AND region_code = p_region_code;
  
  IF v_providers IS NULL THEN
    -- Return Stripe PLUS regional providers (Stripe first for familiarity)
    -- Handle both uppercase and lowercase for compatibility
    CASE UPPER(p_region_code)
      WHEN 'EG' THEN 
        v_providers := ARRAY['stripe', 'paymob', 'fawry']::payment_provider_key[];
      WHEN 'SA' THEN 
        v_providers := ARRAY['stripe', 'paytabs', 'stcpay']::payment_provider_key[];
      ELSE 
        v_providers := ARRAY['stripe']::payment_provider_key[];
    END CASE;
  END IF;
  
  -- Intersect with supported providers to ensure we only return valid options
  IF v_supported IS NOT NULL THEN
    RETURN (
      SELECT ARRAY(
        SELECT unnest(v_providers) 
        INTERSECT 
        SELECT unnest(v_supported)
      )
    );
  ELSE
    RETURN v_providers;
  END IF;
END;
$$;


--
-- TOC entry 6671 (class 0 OID 0)
-- Dependencies: 535
-- Name: FUNCTION get_preferred_provider_for_region(p_promotion_id uuid, p_region_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_preferred_provider_for_region(p_promotion_id uuid, p_region_code text) IS 'Returns preferred payment providers for a region. Always includes Stripe as a global option plus regional providers. Egypt gets Stripe+Fawry+Paymob, Saudi gets Stripe+STC+PayTabs, others get Stripe only.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 423 (class 1259 OID 91620)
-- Name: pricing_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    catalog_version_id uuid,
    item_key text NOT NULL,
    item_type text NOT NULL,
    seconds integer DEFAULT 0 NOT NULL,
    unit_amount_cents integer DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    tax_inclusive boolean DEFAULT false NOT NULL,
    bonus_daily_seconds integer DEFAULT 0,
    bonus_monthly_cap_seconds integer,
    rollover_cap_seconds integer DEFAULT 0,
    advisor_eligible boolean DEFAULT false NOT NULL,
    advisor_payout_cents integer DEFAULT 0,
    expires_days integer DEFAULT 90,
    display_name text NOT NULL,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT pricing_items_advisor_payout_cents_check CHECK ((advisor_payout_cents >= 0)),
    CONSTRAINT pricing_items_bonus_daily_seconds_check CHECK ((bonus_daily_seconds <= 900)),
    CONSTRAINT pricing_items_check CHECK (
CASE
    WHEN (item_key = 'free'::text) THEN (bonus_monthly_cap_seconds IS NOT NULL)
    ELSE true
END),
    CONSTRAINT pricing_items_check1 CHECK (
CASE
    WHEN (item_key = 'free'::text) THEN ((seconds = 0) AND (unit_amount_cents = 0) AND (advisor_payout_cents = 0))
    ELSE true
END),
    CONSTRAINT pricing_items_currency_check CHECK ((((currency)::text = upper((currency)::text)) AND (currency = ANY (ARRAY['USD'::bpchar, 'EUR'::bpchar, 'GBP'::bpchar, 'EGP'::bpchar, 'SAR'::bpchar, 'AED'::bpchar])))),
    CONSTRAINT pricing_items_item_type_check CHECK ((item_type = ANY (ARRAY['subscription'::text, 'package'::text]))),
    CONSTRAINT pricing_items_seconds_check CHECK ((seconds >= 0)),
    CONSTRAINT pricing_items_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);


--
-- TOC entry 6672 (class 0 OID 0)
-- Dependencies: 423
-- Name: TABLE pricing_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_items IS 'Product catalog with core product definitions. All provider-specific pricing (including Stripe) is now in pricing_item_prices table.';


--
-- TOC entry 6673 (class 0 OID 0)
-- Dependencies: 423
-- Name: COLUMN pricing_items.seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_items.seconds IS 'AI time included in seconds (subscriptions) or purchased (packages)';


--
-- TOC entry 6674 (class 0 OID 0)
-- Dependencies: 423
-- Name: COLUMN pricing_items.bonus_daily_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_items.bonus_daily_seconds IS 'Daily bonus seconds for free tier (max 900 = 15 minutes)';


--
-- TOC entry 6675 (class 0 OID 0)
-- Dependencies: 423
-- Name: COLUMN pricing_items.bonus_monthly_cap_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_items.bonus_monthly_cap_seconds IS 'Monthly bonus cap to prevent free tier abuse';


--
-- TOC entry 6676 (class 0 OID 0)
-- Dependencies: 423
-- Name: COLUMN pricing_items.rollover_cap_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_items.rollover_cap_seconds IS 'Maximum seconds that can rollover for paid plans';


--
-- TOC entry 6677 (class 0 OID 0)
-- Dependencies: 423
-- Name: COLUMN pricing_items.advisor_eligible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_items.advisor_eligible IS 'Whether this plan can access advisor features';


--
-- TOC entry 6678 (class 0 OID 0)
-- Dependencies: 423
-- Name: CONSTRAINT pricing_items_currency_check ON pricing_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT pricing_items_currency_check ON public.pricing_items IS 'Expert-enhanced: Supported ISO currencies with uppercase enforcement - USD, EUR, GBP, EGP, SAR, AED';


--
-- TOC entry 674 (class 1255 OID 92202)
-- Name: get_pricing_item_by_provider_price_id(public.payment_provider_key, text, character); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pricing_item_by_provider_price_id(p_provider public.payment_provider_key, p_provider_price_id text, p_currency character DEFAULT 'USD'::bpchar) RETURNS public.pricing_items
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result pricing_items%ROWTYPE;
BEGIN
  SELECT pi.* INTO result
  FROM pricing_catalog_versions cv
  JOIN pricing_items pi ON cv.id = pi.catalog_version_id
  JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
  WHERE cv.is_active = true 
    AND pip.payment_provider = p_provider
    AND pip.provider_price_external_id = p_provider_price_id
    AND pip.currency = p_currency
    AND pip.is_active = true
    AND pi.is_active = true
  LIMIT 1;
  
  RETURN result;
END;
$$;


--
-- TOC entry 6679 (class 0 OID 0)
-- Dependencies: 674
-- Name: FUNCTION get_pricing_item_by_provider_price_id(p_provider public.payment_provider_key, p_provider_price_id text, p_currency character); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_pricing_item_by_provider_price_id(p_provider public.payment_provider_key, p_provider_price_id text, p_currency character) IS 'Provider-agnostic replacement for stripe_price_id lookups';


--
-- TOC entry 611 (class 1255 OID 17232)
-- Name: get_project_collaborators(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_project_collaborators(p_project_id uuid) RETURNS TABLE(id uuid, user_id uuid, email text, role text, invited_at timestamp with time zone, accepted_at timestamp with time zone, invited_by_email text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.user_id,
    u.email,
    pc.role,
    pc.invited_at,
    pc.accepted_at,
    inviter.email as invited_by_email
  FROM project_collaborators pc
  JOIN auth.users u ON u.id = pc.user_id
  LEFT JOIN auth.users inviter ON inviter.id = pc.invited_by
  WHERE pc.project_id = p_project_id
  AND (
    -- Check RLS permissions
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM project_collaborators pc2
      WHERE pc2.project_id = p_project_id
      AND pc2.user_id = auth.uid()
      AND pc2.role IN ('owner', 'admin', 'editor', 'viewer')
    )
  )
  ORDER BY 
    CASE pc.role 
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2  
      WHEN 'editor' THEN 3
      WHEN 'viewer' THEN 4
    END,
    pc.created_at;
END;
$$;


--
-- TOC entry 478 (class 1255 OID 74011)
-- Name: get_project_deployment_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_project_deployment_history(project_uuid uuid) RETURNS TABLE(version_id text, deployment_lane character varying, detected_at timestamp with time zone, detection_origin character varying, reasons text[], switched boolean, switch_reason text, deployment_url text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.version_id,
        pv.deployment_lane,
        pv.deployment_lane_detected_at,
        pv.deployment_lane_detection_origin,
        pv.deployment_lane_reasons,
        pv.deployment_lane_switched,
        pv.deployment_lane_switch_reason,
        pv.final_deployment_url
    FROM public.project_versions pv
    WHERE pv.project_id = project_uuid::TEXT
      AND pv.deployment_lane IS NOT NULL
    ORDER BY pv.deployment_lane_detected_at DESC;
END;
$$;


--
-- TOC entry 424 (class 1259 OID 91887)
-- Name: pricing_item_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_item_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pricing_item_id uuid NOT NULL,
    payment_provider public.payment_provider_key NOT NULL,
    currency character(3) NOT NULL,
    provider_price_external_id text NOT NULL,
    supports_recurring boolean DEFAULT false NOT NULL,
    unit_amount_cents integer NOT NULL,
    tax_inclusive boolean DEFAULT false,
    billing_interval text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pricing_item_prices_billing_interval_check CHECK (((billing_interval = ANY (ARRAY['month'::text, 'year'::text])) OR (billing_interval IS NULL))),
    CONSTRAINT pricing_item_prices_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);


--
-- TOC entry 6680 (class 0 OID 0)
-- Dependencies: 424
-- Name: TABLE pricing_item_prices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_item_prices IS 'Provider-specific price mappings with expert-enhanced structure for multi-provider billing';


--
-- TOC entry 6681 (class 0 OID 0)
-- Dependencies: 424
-- Name: COLUMN pricing_item_prices.provider_price_external_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_item_prices.provider_price_external_id IS 'External price ID from payment provider (e.g., Stripe price_1ABC, Fawry item_123)';


--
-- TOC entry 6682 (class 0 OID 0)
-- Dependencies: 424
-- Name: COLUMN pricing_item_prices.supports_recurring; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_item_prices.supports_recurring IS 'Whether this provider/price combination supports recurring billing';


--
-- TOC entry 675 (class 1255 OID 92203)
-- Name: get_provider_price_mapping(text, public.payment_provider_key, character); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_provider_price_mapping(p_item_key text, p_provider public.payment_provider_key, p_currency character DEFAULT 'USD'::bpchar) RETURNS public.pricing_item_prices
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result pricing_item_prices%ROWTYPE;
BEGIN
  SELECT pip.* INTO result
  FROM pricing_catalog_versions cv
  JOIN pricing_items pi ON cv.id = pi.catalog_version_id
  JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
  WHERE cv.is_active = true 
    AND pi.item_key = p_item_key
    AND pip.payment_provider = p_provider
    AND pip.currency = p_currency
    AND pip.is_active = true
    AND pi.is_active = true
  LIMIT 1;
  
  RETURN result;
END;
$$;


--
-- TOC entry 6683 (class 0 OID 0)
-- Dependencies: 675
-- Name: FUNCTION get_provider_price_mapping(p_item_key text, p_provider public.payment_provider_key, p_currency character); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_provider_price_mapping(p_item_key text, p_provider public.payment_provider_key, p_currency character) IS 'Get provider-specific price mapping for a given item_key and provider';


--
-- TOC entry 612 (class 1255 OID 81374)
-- Name: get_search_suggestions(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_search_suggestions(p_project_id uuid, p_prefix text, p_limit integer DEFAULT 10) RETURNS TABLE(term text, frequency bigint)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 513 (class 1255 OID 81079)
-- Name: get_unread_count(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_count(p_project_id uuid, p_user_id uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  max_seq BIGINT;
  last_read_seq BIGINT;
BEGIN
  -- Get the highest sequence number for this project
  SELECT COALESCE(MAX(seq), 0) INTO max_seq
  FROM project_chat_log_minimal 
  WHERE project_id = p_project_id;
  
  -- Get user's last read sequence
  SELECT COALESCE(last_seq, 0) INTO last_read_seq
  FROM project_chat_last_read 
  WHERE project_id = p_project_id AND user_id = p_user_id;
  
  -- Return unread count (bounded at 0)
  RETURN GREATEST(0, max_seq - last_read_seq);
END$$;


--
-- TOC entry 668 (class 1255 OID 73879)
-- Name: get_user_accessible_projects(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_accessible_projects(p_user_id uuid) RETURNS TABLE(id uuid, name text, description text, owner_id uuid, org_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.description,
        p.owner_id,
        p.org_id,
        p.created_at,
        p.updated_at
    FROM public.projects p
    WHERE 
        -- Personal projects (existing behavior)
        p.owner_id = p_user_id
        OR 
        -- Organization projects where user is a member (new functionality)
        (p.org_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = p.org_id  -- Use organization_id
            AND om.user_id = p_user_id
            AND om.status = 'active'
        ))
    ORDER BY p.updated_at DESC;
END;
$$;


--
-- TOC entry 626 (class 1255 OID 38066)
-- Name: get_user_build_events(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_build_events(target_user_id uuid, build_limit integer DEFAULT 50) RETURNS TABLE(id integer, build_id character varying, event_type character varying, event_data jsonb, created_at timestamp without time zone, user_id uuid)
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


--
-- TOC entry 671 (class 1255 OID 53390)
-- Name: get_user_chat_activity(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_chat_activity(p_user_id uuid, p_days integer DEFAULT 7) RETURNS TABLE(project_id uuid, mode text, message_count bigint, build_count bigint, last_activity timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        cl.project_id,
        cl.mode,
        COUNT(*) as message_count,
        COUNT(*) FILTER (WHERE cl.build_triggered = true) as build_count,
        MAX(cl.created_at) as last_activity
    FROM public.chat_log_minimal cl
    WHERE cl.user_id = p_user_id
      AND cl.created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY cl.project_id, cl.mode
    ORDER BY last_activity DESC;
END;
$$;


--
-- TOC entry 524 (class 1255 OID 89938)
-- Name: get_user_effective_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_effective_status(user_uuid uuid) RETURNS TABLE(user_id uuid, email text, is_suspended boolean, suspended_until timestamp with time zone, is_banned boolean, effective_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_admin boolean := COALESCE((auth.jwt() ->> 'is_admin')::boolean, false)
                      OR public.has_admin_perm('users.read');
BEGIN
  -- EXPERT FIX: Authorization check to prevent PII leakage
  IF NOT (is_admin OR user_uuid = auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Return status from companion table only (avoiding auth schema access)
  SELECT 
    user_uuid as user_id,
    NULL::TEXT as email, -- Email access requires auth schema (not available)
    COALESCE(uas.is_suspended, FALSE) as is_suspended,
    uas.suspended_until,
    COALESCE(uas.is_banned, FALSE) as is_banned,
    CASE 
      WHEN COALESCE(uas.is_banned, FALSE) = TRUE THEN 'banned'
      WHEN COALESCE(uas.is_suspended, FALSE) = TRUE AND uas.suspended_until > NOW() THEN 'suspended'
      ELSE 'active'
    END as effective_status
  FROM user_admin_status uas
  WHERE uas.user_id = user_uuid;
END $$;


--
-- TOC entry 627 (class 1255 OID 17233)
-- Name: get_user_quota_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_quota_status(p_user_id uuid) RETURNS TABLE(metric text, plan_limit integer, current_usage integer, remaining integer, usage_percent numeric, bonus_available integer, last_reset timestamp with time zone, next_reset timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT 
      date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') as period_start,
      date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month' as period_end
  ),
  user_plan AS (
    SELECT 
      COALESCE(s.plan_name, 'free') as plan_name
    FROM customers c
    LEFT JOIN subscriptions s ON s.customer_id = c.id -- Fixed: customers relationship
    WHERE c.user_id = p_user_id
      AND (s.status IS NULL OR s.status IN ('active', 'trialing'))
    ORDER BY s.created_at DESC NULLS LAST
    LIMIT 1
  ),
  metrics AS (
    SELECT 
      'ai_generations' as metric_api,
      'ai_generations' as metric_db
    UNION ALL 
    SELECT 'exports', 'exports'
    UNION ALL 
    SELECT 'projects', 'projects_created' -- Map API name to DB name
  )
  SELECT 
    m.metric_api as metric, -- Return API-friendly names
    CASE m.metric_api
      WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
      WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
      WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
    END as plan_limit,
    COALESCE(ut.usage_amount, 0) as current_usage,
    GREATEST(0, 
      CASE m.metric_api
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END - COALESCE(ut.usage_amount, 0)
    ) + COALESCE(bonus.available, 0) as remaining,
    CASE 
      WHEN CASE m.metric_api
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END = 0 THEN 0
      ELSE ROUND(100.0 * COALESCE(ut.usage_amount, 0) / CASE m.metric_api
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END, 2)
    END as usage_percent,
    COALESCE(bonus.available, 0) as bonus_available,
    cp.period_start as last_reset,
    cp.period_end as next_reset
  FROM metrics m
  CROSS JOIN current_period cp
  LEFT JOIN user_plan up ON true
  LEFT JOIN plan_limits pl ON pl.plan_name = COALESCE(up.plan_name, 'free')
  LEFT JOIN usage_tracking ut ON ut.user_id = p_user_id 
    AND ut.metric_name = m.metric_db -- Use DB metric name for lookup
    AND ut.period_start = cp.period_start
  LEFT JOIN LATERAL (
    SELECT SUM(amount - used_amount)::INTEGER as available
    FROM user_bonuses
    WHERE user_id = p_user_id 
      AND metric = m.metric_api -- Use API metric name for bonuses
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  ) bonus ON true;
END;
$$;


--
-- TOC entry 6684 (class 0 OID 0)
-- Dependencies: 627
-- Name: FUNCTION get_user_quota_status(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_quota_status(p_user_id uuid) IS 'Fixed subscription lookup and metric name mapping for API compatibility';


--
-- TOC entry 518 (class 1255 OID 17235)
-- Name: get_user_usage(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_usage(p_user_id uuid, p_metric_name text, p_period_start timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    usage_count INTEGER;
BEGIN
    SELECT COALESCE(metric_value, 0) INTO usage_count
    FROM usage_tracking
    WHERE user_id = p_user_id 
    AND metric_name = p_metric_name
    AND period_start = p_period_start;
    
    RETURN COALESCE(usage_count, 0);
END;
$$;


--
-- TOC entry 6685 (class 0 OID 0)
-- Dependencies: 518
-- Name: FUNCTION get_user_usage(p_user_id uuid, p_metric_name text, p_period_start timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_usage(p_user_id uuid, p_metric_name text, p_period_start timestamp with time zone) IS 'Get usage count for user/metric/period';


--
-- TOC entry 682 (class 1255 OID 17236)
-- Name: get_users_near_quota_limit(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_users_near_quota_limit(p_threshold_percentage integer DEFAULT 80) RETURNS TABLE(user_id uuid, email text, metric text, usage_percent numeric, remaining integer, plan_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH user_quotas AS (
    SELECT 
      ut.user_id,
      ut.metric_name as metric,
      COALESCE(ut.usage_amount, 0) as current_usage,
      CASE 
        WHEN pl.plan_name IS NULL THEN 
          CASE ut.metric_name
            WHEN 'ai_generations' THEN 10
            WHEN 'exports' THEN 1
            WHEN 'projects_created' THEN 3 -- Fixed: handle projects_created
          END
        WHEN ut.metric_name = 'ai_generations' THEN pl.max_ai_generations_per_month
        WHEN ut.metric_name = 'exports' THEN pl.max_exports_per_month
        WHEN ut.metric_name = 'projects_created' THEN pl.max_projects -- Fixed
      END as limit_amount,
      COALESCE(pl.plan_name, 'free') as plan_name
    FROM usage_tracking ut
    LEFT JOIN customers c ON c.user_id = ut.user_id -- Fixed: proper join
    LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
    LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
    WHERE ut.period_start = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  )
  SELECT 
    uq.user_id,
    u.email,
    -- Map back from internal metric names to API metric names
    CASE uq.metric 
      WHEN 'projects_created' THEN 'projects'
      ELSE uq.metric
    END as metric,
    CASE 
      WHEN uq.limit_amount = -1 OR uq.limit_amount IS NULL THEN 0
      ELSE ROUND((uq.current_usage::NUMERIC / NULLIF(uq.limit_amount, 0) * 100)::NUMERIC, 2)
    END as usage_percent,
    CASE 
      WHEN uq.limit_amount = -1 THEN 999999
      ELSE GREATEST(0, COALESCE(uq.limit_amount, 0) - uq.current_usage)
    END as remaining,
    uq.plan_name
  FROM user_quotas uq
  JOIN auth.users u ON u.id = uq.user_id
  WHERE 
    uq.limit_amount IS NOT NULL AND
    uq.limit_amount != -1 AND
    uq.limit_amount > 0 AND
    (uq.current_usage::NUMERIC / NULLIF(uq.limit_amount, 0) * 100) >= p_threshold_percentage
  ORDER BY usage_percent DESC;
END;
$$;


--
-- TOC entry 6686 (class 0 OID 0)
-- Dependencies: 682
-- Name: FUNCTION get_users_near_quota_limit(p_threshold_percentage integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_users_near_quota_limit(p_threshold_percentage integer) IS 'Fixed subscription lookup and projects_created metric handling';


--
-- TOC entry 689 (class 1255 OID 17237)
-- Name: handle_plan_change(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_plan_change(p_user_id uuid, p_old_plan text, p_new_plan text, p_change_reason text DEFAULT 'upgrade'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_current_usage JSONB;
  v_period_start TIMESTAMPTZ;
BEGIN
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Capture current usage snapshot
  SELECT jsonb_object_agg(metric_name, usage_amount) INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id
  AND period_start = v_period_start;
  
  -- Log the plan change with usage preservation
  INSERT INTO plan_change_log (
    user_id,
    old_plan,
    new_plan,
    change_reason,
    usage_preserved
  ) VALUES (
    p_user_id,
    p_old_plan,
    p_new_plan,
    p_change_reason,
    COALESCE(v_current_usage, '{}'::jsonb)
  );
  
  -- Log audit event
  INSERT INTO quota_audit_log (
    user_id,
    metric,
    attempted_amount,
    success,
    reason,
    context
  ) VALUES (
    p_user_id,
    'plan_change',
    0,
    true,
    'plan_changed',
    jsonb_build_object(
      'old_plan', p_old_plan,
      'new_plan', p_new_plan,
      'change_reason', p_change_reason,
      'usage_at_change', v_current_usage,
      'timestamp', CURRENT_TIMESTAMP
    )
  );
  
  RETURN TRUE;
END;
$$;


--
-- TOC entry 6687 (class 0 OID 0)
-- Dependencies: 689
-- Name: FUNCTION handle_plan_change(p_user_id uuid, p_old_plan text, p_new_plan text, p_change_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_plan_change(p_user_id uuid, p_old_plan text, p_new_plan text, p_change_reason text) IS 'Handles plan upgrades/downgrades while preserving usage counters';


--
-- TOC entry 526 (class 1255 OID 17238)
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- TOC entry 503 (class 1255 OID 89935)
-- Name: has_admin_perm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_admin_perm(perm text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(auth.jwt() -> 'admin_permissions', '[]'::jsonb)
    ) p
    WHERE p = perm
  );
$$;


--
-- TOC entry 680 (class 1255 OID 17239)
-- Name: has_unlimited_access(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_unlimited_access(p_user_id uuid, p_resource text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  SELECT 
    CASE p_resource
      WHEN 'projects' THEN pl.max_projects
      WHEN 'ai_calls' THEN pl.max_ai_generations_per_month
      WHEN 'exports' THEN pl.max_exports_per_month
      WHEN 'storage' THEN pl.max_storage_mb
      ELSE 0
    END INTO v_limit
  FROM customers c
  JOIN subscriptions s ON c.id = s.customer_id
  JOIN plan_limits pl ON s.plan_name = pl.plan_name
  WHERE c.user_id = p_user_id
    AND s.status IN ('active'::subscription_status, 'trialing'::subscription_status)
  ORDER BY s.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_limit = -1, FALSE);
END;
$$;


--
-- TOC entry 523 (class 1255 OID 17240)
-- Name: increment_user_usage(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_user_usage(p_user_id uuid, p_metric_name text, p_increment integer DEFAULT 1) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
BEGIN
    -- Get current month period
    period_start := date_trunc('month', NOW());
    period_end := period_start + interval '1 month';
    
    INSERT INTO usage_tracking (user_id, metric_name, metric_value, period_start, period_end)
    VALUES (p_user_id, p_metric_name, p_increment, period_start, period_end)
    ON CONFLICT (user_id, metric_name, period_start)
    DO UPDATE SET 
        metric_value = usage_tracking.metric_value + p_increment,
        updated_at = NOW();
END;
$$;


--
-- TOC entry 6688 (class 0 OID 0)
-- Dependencies: 523
-- Name: FUNCTION increment_user_usage(p_user_id uuid, p_metric_name text, p_increment integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.increment_user_usage(p_user_id uuid, p_metric_name text, p_increment integer) IS 'Increment usage counter for user/metric';


--
-- TOC entry 690 (class 1255 OID 17241)
-- Name: invite_collaborator(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_collaborator(p_project_id uuid, p_email text, p_role text DEFAULT 'viewer'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid;
  v_project_owner uuid;
  v_collaborator_id uuid;
BEGIN
  -- Check if caller has permission (owner or admin)
  SELECT owner_id INTO v_project_owner
  FROM projects 
  WHERE id = p_project_id;
  
  IF v_project_owner != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM project_collaborators 
    WHERE project_id = p_project_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Find user by email
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Add collaborator
  INSERT INTO project_collaborators (project_id, user_id, role, invited_by)
  VALUES (p_project_id, v_user_id, p_role, auth.uid())
  ON CONFLICT (project_id, user_id) 
  DO UPDATE SET 
    role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by,
    updated_at = now()
  RETURNING id INTO v_collaborator_id;
  
  RETURN json_build_object(
    'success', true, 
    'collaborator_id', v_collaborator_id,
    'user_id', v_user_id
  );
END;
$$;


--
-- TOC entry 557 (class 1255 OID 90098)
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(p_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH claims AS (
    SELECT coalesce(auth.jwt(), '{}'::jsonb) AS c
  )
  SELECT (
    -- Primary: JWT-based admin claims
    ((c->>'is_admin')::boolean
     OR (c->>'role') IN ('admin','super_admin')
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(coalesce(c->'admin_permissions','[]'::jsonb)) p 
       WHERE p LIKE 'admin.%'
     ))
    -- Fallback: email allowlist (app.admin_emails database setting)
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p_uid
        AND u.email = ANY (string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ','))
    )
  )
  -- Hard stop: not banned/suspended
  AND NOT EXISTS (
    SELECT 1 FROM public.user_admin_status s
    WHERE s.user_id = p_uid
      AND (s.is_banned = true
           OR (s.is_suspended = true AND coalesce(s.suspended_until, now()) > now()))
  )
  FROM claims;
$$;


--
-- TOC entry 514 (class 1255 OID 89940)
-- Name: log_admin_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_admin_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  claims JSONB := COALESCE(auth.jwt(), '{}'::jsonb);
  admin_id UUID := (claims ->> 'sub')::uuid;
  correlation UUID := COALESCE(
    NULLIF(current_setting('request.header.x-correlation-id', true), '')::uuid, 
    gen_random_uuid()
  );
BEGIN
  -- Only log if admin claim is present
  IF COALESCE((claims ->> 'is_admin')::boolean, false) THEN
    BEGIN
      INSERT INTO admin_action_log (
        admin_user_id, action, resource_type, resource_id, reason, 
        old_values, new_values, correlation_id
      )
      VALUES (
        admin_id,
        TG_ARGV[0], -- Action like 'ticket.insert'
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        NULLIF(current_setting('request.header.x-admin-reason', true), ''),
        CASE WHEN OLD IS NULL THEN NULL ELSE to_jsonb(OLD) END,
        CASE WHEN NEW IS NULL THEN NULL ELSE to_jsonb(NEW) END,
        correlation
      );
    EXCEPTION WHEN OTHERS THEN
      -- Don't fail the original operation if logging fails
      NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;


--
-- TOC entry 670 (class 1255 OID 53389)
-- Name: log_chat_message(uuid, uuid, text, text, text, text, text, text, text, boolean, text, inet); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_chat_message(p_project_id uuid, p_user_id uuid, p_message_text text, p_mode text DEFAULT 'plan'::text, p_message_type text DEFAULT 'user'::text, p_request_id text DEFAULT NULL::text, p_correlation_id text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_build_id text DEFAULT NULL::text, p_build_triggered boolean DEFAULT false, p_user_agent text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    log_id BIGINT;
BEGIN
    INSERT INTO public.chat_log_minimal (
        project_id,
        user_id,
        message_text,
        mode,
        message_type,
        request_id,
        correlation_id,
        session_id,
        build_id,
        build_triggered,
        user_agent,
        ip_address
    ) VALUES (
        p_project_id,
        p_user_id,
        p_message_text,
        p_mode,
        p_message_type,
        p_request_id,
        p_correlation_id,
        p_session_id,
        p_build_id,
        p_build_triggered,
        p_user_agent,
        p_ip_address
    )
    RETURNING id INTO log_id;

    RETURN log_id;
END;
$$;


--
-- TOC entry 631 (class 1255 OID 94044)
-- Name: log_promotion_provider_change(uuid, uuid, text, jsonb, jsonb, text, inet, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_promotion_provider_change(p_promotion_id uuid, p_changed_by uuid, p_change_type text, p_old_value jsonb, p_new_value jsonb, p_reason text, p_ip inet, p_user_agent text, p_correlation_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO promotion_provider_changes(
    promotion_id, changed_by, change_type, 
    old_value, new_value, reason, 
    ip_address, user_agent, correlation_id
  ) VALUES (
    p_promotion_id, p_changed_by, p_change_type,
    p_old_value, p_new_value, p_reason,
    p_ip, p_user_agent, p_correlation_id
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;


--
-- TOC entry 483 (class 1255 OID 80921)
-- Name: next_project_chat_seq(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_project_chat_seq(p_project_id uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE v_next BIGINT;
BEGIN
  INSERT INTO project_chat_seq (project_id, last_seq)
  VALUES (p_project_id, 1)
  ON CONFLICT (project_id)
  DO UPDATE SET last_seq = project_chat_seq.last_seq + 1
  RETURNING last_seq INTO v_next;
  RETURN v_next;
END$$;


--
-- TOC entry 676 (class 1255 OID 94097)
-- Name: normalize_currency(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_currency(p_currency text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF p_currency IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Uppercase and validate
  p_currency := UPPER(TRIM(p_currency));
  
  IF p_currency NOT IN ('USD', 'EUR', 'GBP', 'EGP', 'SAR') THEN
    RAISE EXCEPTION 'Invalid currency: %', p_currency;
  END IF;
  
  RETURN p_currency;
END;
$$;


--
-- TOC entry 6689 (class 0 OID 0)
-- Dependencies: 676
-- Name: FUNCTION normalize_currency(p_currency text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.normalize_currency(p_currency text) IS 'Ensures currency codes are always uppercase and valid. Used at API boundaries.';


--
-- TOC entry 678 (class 1255 OID 94099)
-- Name: normalize_provider(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_provider(p_provider text) RETURNS public.payment_provider_key
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF p_provider IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Lowercase and validate against enum
  p_provider := LOWER(TRIM(p_provider));
  
  -- Will throw error if not valid enum value
  RETURN p_provider::payment_provider_key;
END;
$$;


--
-- TOC entry 677 (class 1255 OID 94098)
-- Name: normalize_region(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_region(p_region text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF p_region IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Lowercase and validate
  p_region := LOWER(TRIM(p_region));
  
  IF p_region NOT IN ('us', 'ca', 'gb', 'eu', 'eg', 'sa') THEN
    RAISE EXCEPTION 'Invalid region: %', p_region;
  END IF;
  
  RETURN p_region;
END;
$$;


--
-- TOC entry 6690 (class 0 OID 0)
-- Dependencies: 677
-- Name: FUNCTION normalize_region(p_region text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.normalize_region(p_region text) IS 'Ensures region codes are always lowercase and valid. Used at API boundaries.';


--
-- TOC entry 487 (class 1255 OID 84101)
-- Name: prevent_advisor_admin_field_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_advisor_admin_field_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Only authenticated users can update
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to update advisor profile';
  END IF;

  -- Users can only update their own profiles
  IF NEW.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Can only update your own advisor profile';
  END IF;

  -- Prevent users from modifying admin-controlled fields
  IF OLD.onboarding_steps IS DISTINCT FROM NEW.onboarding_steps THEN
    NEW.onboarding_steps = OLD.onboarding_steps;
  END IF;
  
  IF OLD.review_started_at IS DISTINCT FROM NEW.review_started_at THEN
    NEW.review_started_at = OLD.review_started_at;
  END IF;
  
  IF OLD.review_completed_at IS DISTINCT FROM NEW.review_completed_at THEN
    NEW.review_completed_at = OLD.review_completed_at;
  END IF;
  
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    NEW.approval_status = OLD.approval_status;
  END IF;

  RETURN NEW;
END;
$$;


--
-- TOC entry 691 (class 1255 OID 38067)
-- Name: publish_build_event(character varying, character varying, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_build_event(p_build_id character varying, p_event_type character varying, p_event_data jsonb, p_user_id uuid DEFAULT NULL::uuid) RETURNS integer
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


--
-- TOC entry 474 (class 1255 OID 53341)
-- Name: purge_old_build_events(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_build_events(retention_days integer DEFAULT 190) RETURNS TABLE(purged_date date, events_deleted bigint, stats_preserved boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    cutoff_date DATE;
    current_date_iter DATE;
    deleted_count BIGINT;
    total_deleted BIGINT := 0;
BEGIN
    cutoff_date := CURRENT_DATE - retention_days;

    -- Log retention operation start
    RAISE NOTICE 'Starting retention cleanup for events older than % days (before %)', retention_days, cutoff_date;

    -- Process each day individually to avoid long transactions
    FOR current_date_iter IN
        SELECT DISTINCT DATE(created_at) as event_date
        FROM public.project_build_events
        WHERE DATE(created_at) < cutoff_date
        ORDER BY event_date
    LOOP
        -- Aggregate stats for this date before deletion
        PERFORM aggregate_build_events_stats(current_date_iter);

        -- Delete events for this specific date
        DELETE FROM public.project_build_events
        WHERE DATE(created_at) = current_date_iter;

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        total_deleted := total_deleted + deleted_count;

        -- Return information about this date's cleanup
        RETURN QUERY SELECT current_date_iter, deleted_count, true;

        -- Log progress
        RAISE NOTICE 'Deleted % events from % (stats preserved)', deleted_count, current_date_iter;

        -- Commit batch to avoid long transactions
        -- Note: This function should be called from a context that handles commits

    END LOOP;

    -- Final summary
    RAISE NOTICE 'Retention cleanup completed: % total events deleted', total_deleted;
END;
$$;


--
-- TOC entry 669 (class 1255 OID 53388)
-- Name: purge_old_chat_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_chat_logs(retention_days integer DEFAULT 185) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSON;
    cutoff_timestamp TIMESTAMPTZ;
    logs_deleted BIGINT;
BEGIN
    cutoff_timestamp := NOW() - (retention_days || ' days')::INTERVAL;

    -- Delete old chat logs
    DELETE FROM public.chat_log_minimal
    WHERE created_at < cutoff_timestamp;

    GET DIAGNOSTICS logs_deleted = ROW_COUNT;

    result := json_build_object(
        'success', true,
        'logs_deleted', logs_deleted,
        'retention_days', retention_days,
        'cutoff_timestamp', cutoff_timestamp,
        'completed_at', NOW()
    );

    RETURN result;
END;
$$;


--
-- TOC entry 692 (class 1255 OID 18622)
-- Name: refund_project_quota(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_project_quota(p_user_id uuid, p_project_id uuid) RETURNS TABLE(success boolean, previous_usage integer, new_usage integer, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_current_usage INTEGER;
  v_project_exists BOOLEAN;
BEGIN
  -- Check if the project exists and belongs to the user
  SELECT EXISTS(
    SELECT 1 FROM projects 
    WHERE id = p_project_id AND user_id = p_user_id
  ) INTO v_project_exists;
  
  -- If project doesn't exist or doesn't belong to user, return early
  IF NOT v_project_exists THEN
    RETURN QUERY SELECT 
      FALSE AS success,
      0 AS previous_usage,
      0 AS new_usage,
      'Project not found or does not belong to user' AS message;
    RETURN;
  END IF;
  
  -- Get the current billing period start
  v_period_start := date_trunc('month', NOW());
  
  -- Get current usage
  SELECT projects_created INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id AND period_start = v_period_start;
  
  -- If no usage tracking record exists, nothing to refund
  IF v_current_usage IS NULL THEN
    RETURN QUERY SELECT 
      TRUE AS success,
      0 AS previous_usage,
      0 AS new_usage,
      'No usage to refund for current period' AS message;
    RETURN;
  END IF;
  
  -- If usage is already 0, nothing to refund
  IF v_current_usage <= 0 THEN
    RETURN QUERY SELECT 
      TRUE AS success,
      0 AS previous_usage,
      0 AS new_usage,
      'Usage already at zero' AS message;
    RETURN;
  END IF;
  
  -- Decrement the projects_created count
  UPDATE usage_tracking
  SET 
    projects_created = GREATEST(0, projects_created - 1),
    updated_at = NOW()
  WHERE user_id = p_user_id AND period_start = v_period_start
  RETURNING projects_created INTO v_current_usage;
  
  -- Log the refund in quota_audit_log
  INSERT INTO quota_audit_log (
    user_id,
    metric,
    success,
    reason,
    context,
    requested_amount,
    current_usage,
    created_at
  ) VALUES (
    p_user_id,
    'projects_created',
    TRUE,
    'project_deletion_refund',
    jsonb_build_object(
      'project_id', p_project_id,
      'operation', 'refund',
      'previous_usage', v_current_usage + 1,
      'new_usage', v_current_usage
    ),
    -1,
    v_current_usage,
    NOW()
  );
  
  RETURN QUERY SELECT 
    TRUE AS success,
    v_current_usage + 1 AS previous_usage,
    v_current_usage AS new_usage,
    'Quota refunded successfully' AS message;
END;
$$;


--
-- TOC entry 6691 (class 0 OID 0)
-- Dependencies: 692
-- Name: FUNCTION refund_project_quota(p_user_id uuid, p_project_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refund_project_quota(p_user_id uuid, p_project_id uuid) IS 'Refunds project creation quota when a project is deleted. Decrements the projects_created counter in usage_tracking for the current billing period.';


--
-- TOC entry 563 (class 1255 OID 90146)
-- Name: reject_two_person(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_two_person(p_id uuid, p_approver uuid, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.admin_two_person_queue
     SET approved_by = p_approver,
         reason      = p_reason,
         state       = 'rejected',
         approved_at = now()
   WHERE id = p_id
     AND state = 'pending'
     AND requested_by <> p_approver;
  RETURN FOUND;
END$$;


--
-- TOC entry 559 (class 1255 OID 90114)
-- Name: rpc_log_admin_action(uuid, text, text, text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_log_admin_action(p_admin_user_id uuid, p_action text, p_resource_type text, p_resource_id text, p_reason text, p_correlation_id uuid, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  INSERT INTO public.admin_action_log_app(
    admin_user_id, action, resource_type, resource_id, reason, correlation_id, extra
  )
  VALUES (
    p_admin_user_id, p_action, p_resource_type, p_resource_id, p_reason, p_correlation_id, 
    coalesce(p_extra, '{}'::jsonb)
  );
$$;


--
-- TOC entry 683 (class 1255 OID 53342)
-- Name: safe_purge_old_build_events(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.safe_purge_old_build_events(retention_days integer DEFAULT 190) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSON;
    cutoff_date DATE;
    events_to_delete BIGINT;
    oldest_event_date DATE;
    cleanup_results RECORD;
    total_deleted BIGINT := 0;
BEGIN
    cutoff_date := CURRENT_DATE - retention_days;

    -- Validation checks
    SELECT COUNT(*), MIN(DATE(created_at))
    INTO events_to_delete, oldest_event_date
    FROM public.project_build_events
    WHERE DATE(created_at) < cutoff_date;

    -- Safety check: Don't delete if it's more than 50% of total events
    IF events_to_delete > (SELECT COUNT(*) * 0.5 FROM public.project_build_events) THEN
        result := json_build_object(
            'success', false,
            'error', 'Safety check failed: Would delete more than 50% of events',
            'events_to_delete', events_to_delete,
            'retention_days', retention_days,
            'cutoff_date', cutoff_date
        );
        RETURN result;
    END IF;

    -- Proceed with cleanup if we have events to delete
    IF events_to_delete > 0 THEN
        -- Aggregate results
        SELECT COUNT(events_deleted) as dates_processed, SUM(events_deleted) as total_events_deleted
        INTO cleanup_results
        FROM purge_old_build_events(retention_days) as t(purged_date, events_deleted, stats_preserved);

        result := json_build_object(
            'success', true,
            'events_deleted', COALESCE(cleanup_results.total_events_deleted, 0),
            'dates_processed', COALESCE(cleanup_results.dates_processed, 0),
            'retention_days', retention_days,
            'cutoff_date', cutoff_date,
            'oldest_deleted_date', oldest_event_date,
            'stats_preserved', true,
            'completed_at', NOW()
        );
    ELSE
        result := json_build_object(
            'success', true,
            'events_deleted', 0,
            'message', 'No events older than retention period found',
            'retention_days', retention_days,
            'cutoff_date', cutoff_date
        );
    END IF;

    RETURN result;
END;
$$;


--
-- TOC entry 605 (class 1255 OID 81372)
-- Name: search_chat_messages(uuid, uuid, text, bigint, bigint, text[], text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_chat_messages(p_project_id uuid, p_user_id uuid, p_query text, p_from_seq bigint DEFAULT NULL::bigint, p_to_seq bigint DEFAULT NULL::bigint, p_actor_types text[] DEFAULT NULL::text[], p_mode text DEFAULT NULL::text, p_limit integer DEFAULT 20) RETURNS TABLE(id bigint, seq bigint, message_text text, highlighted_text text, actor_type text, mode text, created_at timestamp with time zone, rank real)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 484 (class 1255 OID 80927)
-- Name: set_chat_seq(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_chat_seq() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.seq := next_project_chat_seq(NEW.project_id);
  RETURN NEW;
END$$;


--
-- TOC entry 510 (class 1255 OID 89939)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;


--
-- TOC entry 632 (class 1255 OID 81444)
-- Name: stripe_lock_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stripe_lock_user(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('stripe:user')
  );
$$;


--
-- TOC entry 6692 (class 0 OID 0)
-- Dependencies: 632
-- Name: FUNCTION stripe_lock_user(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stripe_lock_user(p_user_id uuid) IS 'Advisory lock for user-based Stripe operations. SECURITY DEFINER ensures consistent execution regardless of caller permissions.';


--
-- TOC entry 607 (class 1255 OID 92068)
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN 
  NEW.updated_at = NOW(); 
  RETURN NEW; 
END; 
$$;


--
-- TOC entry 528 (class 1255 OID 17242)
-- Name: track_claude_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_claude_usage(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate current hour window
    v_window_start := date_trunc('hour', NOW());
    
    -- Insert or update usage count
    INSERT INTO claude_user_usage (user_id, window_start, calls)
    VALUES (p_user_id, v_window_start, 1)
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET 
        calls = claude_user_usage.calls + 1,
        updated_at = NOW();
END;
$$;


--
-- TOC entry 6693 (class 0 OID 0)
-- Dependencies: 528
-- Name: FUNCTION track_claude_usage(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.track_claude_usage(p_user_id uuid) IS 'Tracks Claude API usage for monitoring purposes. Does not enforce any quotas.';


--
-- TOC entry 531 (class 1255 OID 85510)
-- Name: update_advisor_bio_atomic(uuid, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_advisor_bio_atomic(advisor_user_id uuid, target_language character varying, new_bio_content text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Validate language code
  IF target_language NOT IN ('en', 'ar', 'fr', 'es', 'de') THEN
    RAISE EXCEPTION 'Invalid language code: %', target_language;
  END IF;
  
  -- Validate bio content (plain text security)
  IF new_bio_content ~ '<[^>]*>' THEN
    RAISE EXCEPTION 'HTML content not allowed in bio';
  END IF;
  
  -- Atomic update using jsonb_set()
  UPDATE advisors 
  SET 
    multilingual_bio = jsonb_set(
      COALESCE(multilingual_bio, '{}'::jsonb),
      ARRAY[target_language],
      to_jsonb(new_bio_content)
    ),
    updated_at = now()
  WHERE user_id = advisor_user_id;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  -- Log translation metrics
  IF rows_affected > 0 THEN
    INSERT INTO advisor_translation_metrics (
      advisor_user_id, 
      language_code, 
      action_type, 
      content_length,
      created_at
    ) VALUES (
      advisor_user_id,
      target_language,
      'bio_update',
      length(new_bio_content),
      now()
    );
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;


--
-- TOC entry 525 (class 1255 OID 53710)
-- Name: update_ai_session_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ai_session_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.last_ai_session_id IS DISTINCT FROM OLD.last_ai_session_id THEN
    NEW.last_ai_session_updated_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- TOC entry 530 (class 1255 OID 91698)
-- Name: update_computed_balance_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_computed_balance_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  computed_totals RECORD;
BEGIN
  -- Expert fix: Validate bucket structure with better error messages for debugging
  IF NOT validate_bucket_integrity(NEW.second_buckets) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Invalid bucket structure in second_buckets',
      DETAIL = NEW.second_buckets::text;
  END IF;
  
  -- Compute totals from buckets
  SELECT * INTO computed_totals 
  FROM compute_bucket_totals(NEW.second_buckets);
  
  -- Update computed fields
  NEW.total_paid_seconds := computed_totals.paid_seconds;
  NEW.total_bonus_seconds := computed_totals.bonus_seconds;
  NEW.next_expiry_at := computed_totals.next_expiry;
  
  -- Update timestamp (verified: updated_at column exists in our codebase)
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$;


--
-- TOC entry 512 (class 1255 OID 81078)
-- Name: update_last_read_seq(uuid, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_last_read_seq(p_project_id uuid, p_user_id uuid, p_seq bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO project_chat_last_read (project_id, user_id, last_seq, updated_at)
  VALUES (p_project_id, p_user_id, p_seq, NOW())
  ON CONFLICT (project_id, user_id) 
  DO UPDATE SET 
    last_seq = GREATEST(project_chat_last_read.last_seq, p_seq),
    updated_at = NOW();
END$$;


--
-- TOC entry 520 (class 1255 OID 17243)
-- Name: update_project_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_access(project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE projects 
    SET last_accessed_at = NOW() 
    WHERE id = project_id;
END;
$$;


--
-- TOC entry 645 (class 1255 OID 34236)
-- Name: update_project_metrics_summary(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_metrics_summary(v_build_id character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_project_id VARCHAR;
  v_user_id VARCHAR;
  v_date DATE;
  v_project_started DATE;
BEGIN
  -- Get project info from the build
  SELECT project_id, user_id, DATE(started_at)
  INTO v_project_id, v_user_id, v_date
  FROM project_build_metrics
  WHERE build_id = v_build_id;

  -- Get the earliest build date for this project as project_started
  SELECT MIN(DATE(started_at))
  INTO v_project_started
  FROM project_build_metrics
  WHERE project_id = v_project_id AND user_id = v_user_id;

  -- Update or insert project summary metrics
  INSERT INTO project_metrics_summary AS pms (
    project_id, user_id, date, project_started,
    total_builds, successful_builds, failed_builds, success_rate,
    avg_total_duration_sec, avg_ai_duration_sec, avg_install_duration_sec,
    avg_build_duration_sec, avg_deploy_duration_sec,
    total_cost_usd, avg_cost_per_build_usd, total_tokens_used,
    total_errors_encountered, total_errors_fixed, error_fix_rate,
    most_common_error_type, build_cache_hit_rate, install_skip_rate,
    total_files_created, total_files_modified, avg_output_size_mb
  )
  SELECT
    v_project_id,
    v_user_id,
    v_date,
    v_project_started,
    -- Build counts
    COUNT(DISTINCT pbm.build_id),
    COUNT(DISTINCT CASE WHEN pbm.status = 'deployed' THEN pbm.build_id END),
    COUNT(DISTINCT CASE WHEN pbm.status = 'failed' THEN pbm.build_id END),
    CASE
      WHEN COUNT(DISTINCT pbm.build_id) > 0
      THEN (COUNT(DISTINCT CASE WHEN pbm.status = 'deployed' THEN pbm.build_id END)::DECIMAL / COUNT(DISTINCT pbm.build_id)) * 100
      ELSE 0
    END,

    -- Duration averages (converted to seconds)
    COALESCE(AVG(pbm.total_duration_ms) / 1000, 0),
    COALESCE(AVG(csm.session_duration_ms) / 1000, 0),
    COALESCE(AVG(dm.install_duration_ms) / 1000, 0),
    COALESCE(AVG(dm.build_duration_ms) / 1000, 0),
    COALESCE(AVG(dm.deploy_duration_ms) / 1000, 0),

    -- Cost metrics
    COALESCE(SUM(csm.total_cost_usd), 0),
    CASE
      WHEN COUNT(DISTINCT pbm.build_id) > 0
      THEN COALESCE(SUM(csm.total_cost_usd), 0) / COUNT(DISTINCT pbm.build_id)
      ELSE 0
    END,
    COALESCE(SUM(csm.input_tokens) + SUM(csm.output_tokens), 0),

    -- Error metrics
    COALESCE(SUM(csm.errors_encountered), 0),
    COALESCE(SUM(csm.errors_fixed), 0),
    CASE
      WHEN SUM(csm.errors_encountered) > 0
      THEN (SUM(csm.errors_fixed)::DECIMAL / SUM(csm.errors_encountered)) * 100
      ELSE NULL
    END,
    -- Most common error type (from project_error_metrics table)
    (
      SELECT em.error_type
      FROM project_error_metrics em
      WHERE em.build_id IN (
        SELECT build_id FROM project_build_metrics
        WHERE project_id = v_project_id
          AND user_id = v_user_id
          AND DATE(started_at) = v_date
      )
      GROUP BY em.error_type
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),

    -- Cache performance
    CASE
      WHEN COUNT(dm.build_id) > 0
      THEN (COUNT(CASE WHEN dm.build_cache_hit = true THEN 1 END)::DECIMAL / COUNT(dm.build_id)) * 100
      ELSE 0
    END,
    CASE
      WHEN COUNT(dm.build_id) > 0
      THEN (COUNT(CASE WHEN dm.install_duration_ms IS NULL OR dm.install_duration_ms = 0 THEN 1 END)::DECIMAL / COUNT(dm.build_id)) * 100
      ELSE 0
    END,

    -- File activity
    COALESCE(SUM(csm.files_created), 0),
    COALESCE(SUM(csm.files_modified), 0),
    COALESCE(AVG(dm.build_output_size_bytes) / 1048576, 0) -- Convert bytes to MB

  FROM project_build_metrics pbm
  LEFT JOIN project_ai_session_metrics csm
    ON pbm.build_id = csm.build_id
    AND csm.prompt_type = 'build'
  LEFT JOIN project_deployment_metrics dm
    ON pbm.build_id = dm.build_id
  WHERE pbm.project_id = v_project_id
    AND pbm.user_id = v_user_id
    AND DATE(pbm.started_at) = v_date
  GROUP BY pbm.project_id, pbm.user_id

  -- FIX: Change ON CONFLICT to match the actual constraint
  -- Constraint: unique_project_date on (project_id, user_id, project_started)
  ON CONFLICT (project_id, user_id, project_started)
  DO UPDATE SET
    date = EXCLUDED.date, -- Update date in case it changes
    total_builds = EXCLUDED.total_builds,
    successful_builds = EXCLUDED.successful_builds,
    failed_builds = EXCLUDED.failed_builds,
    success_rate = EXCLUDED.success_rate,
    avg_total_duration_sec = EXCLUDED.avg_total_duration_sec,
    avg_ai_duration_sec = EXCLUDED.avg_ai_duration_sec,
    avg_install_duration_sec = EXCLUDED.avg_install_duration_sec,
    avg_build_duration_sec = EXCLUDED.avg_build_duration_sec,
    avg_deploy_duration_sec = EXCLUDED.avg_deploy_duration_sec,
    total_cost_usd = EXCLUDED.total_cost_usd,
    avg_cost_per_build_usd = EXCLUDED.avg_cost_per_build_usd,
    total_tokens_used = EXCLUDED.total_tokens_used,
    total_errors_encountered = EXCLUDED.total_errors_encountered,
    total_errors_fixed = EXCLUDED.total_errors_fixed,
    error_fix_rate = EXCLUDED.error_fix_rate,
    most_common_error_type = EXCLUDED.most_common_error_type,
    build_cache_hit_rate = EXCLUDED.build_cache_hit_rate,
    install_skip_rate = EXCLUDED.install_skip_rate,
    total_files_created = EXCLUDED.total_files_created,
    total_files_modified = EXCLUDED.total_files_modified,
    avg_output_size_mb = EXCLUDED.avg_output_size_mb,
    project_last_updated = CURRENT_TIMESTAMP;
END;
$$;


--
-- TOC entry 448 (class 1255 OID 93837)
-- Name: update_promotion_regional_config_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_promotion_regional_config_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- TOC entry 596 (class 1255 OID 34096)
-- Name: update_total_duration_min(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_total_duration_min() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.total_duration_sec IS NOT NULL THEN
    NEW.total_duration_min := ROUND(NEW.total_duration_sec / 60, 2);
  END IF;
  RETURN NEW;
END;
$$;


--
-- TOC entry 545 (class 1255 OID 65082)
-- Name: update_unified_session_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_unified_session_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.last_active = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


--
-- TOC entry 527 (class 1255 OID 17244)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- TOC entry 481 (class 1255 OID 84105)
-- Name: upsert_advisor_draft(uuid, jsonb, public.advisor_application_status); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_advisor_draft(p_user_id uuid, p_professional_data jsonb, p_status public.advisor_application_status DEFAULT 'draft'::public.advisor_application_status) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_draft_id uuid;
BEGIN
  -- Use INSERT with ON CONFLICT for user_id where is_active = true
  INSERT INTO advisor_application_drafts (user_id, professional_data, status, updated_at)
  VALUES (p_user_id, p_professional_data, p_status, now())
  ON CONFLICT (user_id) WHERE (is_active = true) DO UPDATE SET
    professional_data = EXCLUDED.professional_data,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING id INTO v_draft_id;
  
  RETURN v_draft_id;
END;
$$;


--
-- TOC entry 685 (class 1255 OID 73878)
-- Name: user_can_access_project(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_can_access_project(p_user_id uuid, p_project_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    project_record RECORD;
BEGIN
    SELECT owner_id, org_id INTO project_record
    FROM public.projects
    WHERE id = p_project_id;
    
    -- Project doesn't exist
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Personal project access (existing behavior)
    IF project_record.owner_id = p_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Organization project access (new functionality)
    IF project_record.org_id IS NOT NULL THEN
        RETURN user_has_org_access(p_user_id, project_record.org_id);
    END IF;
    
    RETURN FALSE;
END;
$$;


--
-- TOC entry 640 (class 1255 OID 73877)
-- Name: user_has_org_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_org_access(p_user_id uuid, p_org_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = p_user_id
        AND organization_id = p_org_id  -- Use organization_id to match existing schema
        AND status = 'active'
    );
END;
$$;


--
-- TOC entry 536 (class 1255 OID 85535)
-- Name: validate_bio_content(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_bio_content(content text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- Check for HTML tags
  IF content ~ '<[^>]*>' THEN
    RETURN FALSE;
  END IF;
  
  -- Check for script content
  IF content ~* '(javascript:|data:|vbscript:|onload|onerror)' THEN
    RETURN FALSE;
  END IF;
  
  -- Check reasonable length limits
  IF length(content) > 2000 THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;


--
-- TOC entry 515 (class 1255 OID 91696)
-- Name: validate_bucket_integrity(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_bucket_integrity(buckets jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  bucket JSONB;
  ts timestamptz;
  ids TEXT[];
BEGIN
  -- Validate each bucket in the array
  FOR bucket IN SELECT jsonb_array_elements(buckets)
  LOOP
    -- Check required fields
    IF NOT (bucket ? 'id' AND bucket ? 'source' AND bucket ? 'seconds' AND bucket ? 'consumed') THEN
      RETURN FALSE;
    END IF;
    
    -- Check data types and constraints
    IF NOT (
      jsonb_typeof(bucket->'seconds') = 'number' AND
      jsonb_typeof(bucket->'consumed') = 'number' AND
      (bucket->>'seconds')::INTEGER >= 0 AND
      (bucket->>'consumed')::INTEGER >= 0 AND
      (bucket->>'consumed')::INTEGER <= (bucket->>'seconds')::INTEGER
    ) THEN
      RETURN FALSE;
    END IF;
    
    -- Check source type
    IF NOT (bucket->>'source' IN ('daily', 'subscription', 'rollover', 'package', 'welcome', 'gift')) THEN
      RETURN FALSE;
    END IF;

    -- Expert fix: Validate expires_at is parseable (prevents hard crashes)
    IF bucket ? 'expires_at' AND bucket->>'expires_at' IS NOT NULL THEN
      BEGIN
        ts := (bucket->>'expires_at')::timestamptz;
      EXCEPTION WHEN others THEN
        RETURN FALSE;
      END;
    END IF;
  END LOOP;

  -- Expert fix: Enforce unique bucket IDs within the array
  SELECT array_agg((b->>'id')) INTO ids
  FROM jsonb_array_elements(buckets) b;

  IF ids IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check for duplicate IDs using array comparison
  IF cardinality(ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(ids))) THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;


--
-- TOC entry 6694 (class 0 OID 0)
-- Dependencies: 515
-- Name: FUNCTION validate_bucket_integrity(buckets jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_bucket_integrity(buckets jsonb) IS 'Validates JSONB bucket structure and integrity constraints';


--
-- TOC entry 633 (class 1255 OID 94054)
-- Name: validate_promotion_consistency(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_promotion_consistency(p_promotion_id uuid) RETURNS TABLE(check_name text, is_valid boolean, details text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Check currency consistency
  RETURN QUERY
  SELECT 
    'currency_consistency'::TEXT,
    CASE 
      WHEN p.discount_type = 'percentage' AND p.currency IS NULL THEN true
      WHEN p.discount_type = 'fixed_amount' AND p.currency IS NOT NULL THEN true
      ELSE false
    END,
    CASE 
      WHEN p.discount_type = 'percentage' AND p.currency IS NOT NULL 
        THEN 'Percentage discount should not have currency'
      WHEN p.discount_type = 'fixed_amount' AND p.currency IS NULL
        THEN 'Fixed amount discount requires currency'
      ELSE 'Valid'
    END
  FROM promotions p
  WHERE p.id = p_promotion_id;
  
  -- Check minimum order consistency
  RETURN QUERY
  SELECT 
    'minimum_order_consistency'::TEXT,
    CASE 
      WHEN (p.minimum_order_minor_units IS NULL) = (p.minimum_order_currency IS NULL) 
        THEN true
      ELSE false
    END,
    CASE 
      WHEN p.minimum_order_minor_units IS NOT NULL AND p.minimum_order_currency IS NULL
        THEN 'Minimum order amount requires currency'
      WHEN p.minimum_order_minor_units IS NULL AND p.minimum_order_currency IS NOT NULL
        THEN 'Minimum order currency requires amount'
      ELSE 'Valid'
    END
  FROM promotions p
  WHERE p.id = p_promotion_id;
  
  -- Check provider configuration
  RETURN QUERY
  SELECT 
    'provider_configuration'::TEXT,
    p.supported_providers IS NOT NULL AND cardinality(p.supported_providers) > 0,
    CASE 
      WHEN p.supported_providers IS NULL THEN 'No providers configured'
      WHEN cardinality(p.supported_providers) = 0 THEN 'Empty provider list'
      ELSE 'Valid - ' || cardinality(p.supported_providers)::TEXT || ' providers'
    END
  FROM promotions p
  WHERE p.id = p_promotion_id;
END;
$$;


--
-- TOC entry 679 (class 1255 OID 94108)
-- Name: verify_promotion_system_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_promotion_system_health() RETURNS TABLE(check_name text, check_passed boolean, issue_count integer, details text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Currency consistency per migration 073 rules
  RETURN QUERY
  SELECT 
    'currency_consistency'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' promotions violating currency consistency'
      ELSE 'All promotions have valid currency settings'
    END
  FROM promotions
  WHERE
    (discount_type = 'percentage' AND (currency IS NOT NULL OR supported_currencies IS NOT NULL))
    OR
    (discount_type = 'fixed_amount' AND (
      currency IS NULL
      OR currency NOT IN ('USD','EUR','GBP','EGP','SAR')
      OR (supported_currencies IS NOT NULL AND NOT (currency = ANY(supported_currencies)))
    ));
  
  -- Empty arrays guard (defensive)
  RETURN QUERY
  SELECT 
    'no_empty_arrays'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' rows with empty arrays'
      ELSE 'No empty arrays found'
    END
  FROM promotions
  WHERE (supported_providers IS NOT NULL AND cardinality(supported_providers) = 0)
     OR (supported_currencies IS NOT NULL AND cardinality(supported_currencies) = 0)
     OR (checkout_type_restrictions IS NOT NULL AND cardinality(checkout_type_restrictions) = 0);
  
  -- Region code casing
  RETURN QUERY
  SELECT 
    'region_code_lowercase'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' regional configs with uppercase regions'
      ELSE 'All region codes are lowercase'
    END
  FROM promotion_regional_config
  WHERE region_code != LOWER(region_code);
  
  -- Stale reservations (should not linger as reserved)
  RETURN QUERY
  SELECT 
    'no_orphaned_reservations'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' expired reservations still marked reserved'
      ELSE 'No orphaned reservations'
    END
  FROM promotion_reservations
  WHERE status = 'reserved' AND expires_at < NOW() - INTERVAL '1 day';
END;
$$;


--
-- TOC entry 6695 (class 0 OID 0)
-- Dependencies: 679
-- Name: FUNCTION verify_promotion_system_health(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.verify_promotion_system_health() IS 'Health check function to verify data integrity across promotion system with dual-currency model validation';


--
-- TOC entry 529 (class 1255 OID 17245)
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_;

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- TOC entry 636 (class 1255 OID 17247)
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- TOC entry 592 (class 1255 OID 17248)
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- TOC entry 533 (class 1255 OID 17249)
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- TOC entry 637 (class 1255 OID 17250)
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- TOC entry 613 (class 1255 OID 17251)
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- TOC entry 507 (class 1255 OID 17252)
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- TOC entry 511 (class 1255 OID 17253)
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- TOC entry 630 (class 1255 OID 17254)
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  BEGIN
    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (payload, event, topic, private, extension)
    VALUES (payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- TOC entry 619 (class 1255 OID 17255)
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- TOC entry 538 (class 1255 OID 17256)
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- TOC entry 539 (class 1255 OID 17257)
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- TOC entry 447 (class 1255 OID 80853)
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


--
-- TOC entry 537 (class 1255 OID 17258)
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- TOC entry 462 (class 1255 OID 80854)
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


--
-- TOC entry 465 (class 1255 OID 80857)
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


--
-- TOC entry 473 (class 1255 OID 80872)
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- TOC entry 541 (class 1255 OID 17259)
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- TOC entry 543 (class 1255 OID 17260)
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- TOC entry 540 (class 1255 OID 17261)
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- TOC entry 444 (class 1255 OID 80835)
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- TOC entry 445 (class 1255 OID 80851)
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- TOC entry 446 (class 1255 OID 80852)
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- TOC entry 471 (class 1255 OID 80870)
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- TOC entry 624 (class 1255 OID 17263)
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- TOC entry 548 (class 1255 OID 17264)
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- TOC entry 464 (class 1255 OID 80856)
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- TOC entry 472 (class 1255 OID 80871)
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- TOC entry 552 (class 1255 OID 17265)
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- TOC entry 463 (class 1255 OID 80855)
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


--
-- TOC entry 470 (class 1255 OID 17266)
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


--
-- TOC entry 469 (class 1255 OID 80868)
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- TOC entry 468 (class 1255 OID 80867)
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- TOC entry 467 (class 1255 OID 80862)
-- Name: search_v2(text, text, integer, integer, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    RETURN query EXECUTE
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name || '/' AS name,
                    NULL::uuid AS id,
                    NULL::timestamptz AS updated_at,
                    NULL::timestamptz AS created_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%'
                AND bucket_id = $2
                AND level = $4
                AND name COLLATE "C" > $5
                ORDER BY prefixes.name COLLATE "C" LIMIT $3
            )
            UNION ALL
            (SELECT split_part(name, '/', $4) AS key,
                name,
                id,
                updated_at,
                created_at,
                metadata
            FROM storage.objects
            WHERE name COLLATE "C" LIKE $1 || '%'
                AND bucket_id = $2
                AND level = $4
                AND name COLLATE "C" > $5
            ORDER BY name COLLATE "C" LIMIT $3)
        ) obj
        ORDER BY name COLLATE "C" LIMIT $3;
        $sql$
        USING prefix, bucket_name, limits, levels, start_after;
END;
$_$;


--
-- TOC entry 553 (class 1255 OID 17267)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- TOC entry 257 (class 1259 OID 17268)
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- TOC entry 6696 (class 0 OID 0)
-- Dependencies: 257
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- TOC entry 258 (class 1259 OID 17274)
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method auth.code_challenge_method NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone
);


--
-- TOC entry 6697 (class 0 OID 0)
-- Dependencies: 258
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'stores metadata for pkce logins';


--
-- TOC entry 259 (class 1259 OID 17279)
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 6698 (class 0 OID 0)
-- Dependencies: 259
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- TOC entry 6699 (class 0 OID 0)
-- Dependencies: 259
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- TOC entry 260 (class 1259 OID 17286)
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- TOC entry 6700 (class 0 OID 0)
-- Dependencies: 260
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- TOC entry 261 (class 1259 OID 17291)
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- TOC entry 6701 (class 0 OID 0)
-- Dependencies: 261
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- TOC entry 262 (class 1259 OID 17296)
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- TOC entry 6702 (class 0 OID 0)
-- Dependencies: 262
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- TOC entry 263 (class 1259 OID 17301)
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid
);


--
-- TOC entry 6703 (class 0 OID 0)
-- Dependencies: 263
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- TOC entry 264 (class 1259 OID 17306)
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- TOC entry 265 (class 1259 OID 17314)
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- TOC entry 6704 (class 0 OID 0)
-- Dependencies: 265
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- TOC entry 266 (class 1259 OID 17319)
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6705 (class 0 OID 0)
-- Dependencies: 266
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- TOC entry 267 (class 1259 OID 17320)
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- TOC entry 6706 (class 0 OID 0)
-- Dependencies: 267
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- TOC entry 268 (class 1259 OID 17328)
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- TOC entry 6707 (class 0 OID 0)
-- Dependencies: 268
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- TOC entry 269 (class 1259 OID 17334)
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- TOC entry 6708 (class 0 OID 0)
-- Dependencies: 269
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- TOC entry 270 (class 1259 OID 17337)
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text
);


--
-- TOC entry 6709 (class 0 OID 0)
-- Dependencies: 270
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- TOC entry 6710 (class 0 OID 0)
-- Dependencies: 270
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- TOC entry 271 (class 1259 OID 17342)
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- TOC entry 6711 (class 0 OID 0)
-- Dependencies: 271
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- TOC entry 272 (class 1259 OID 17348)
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- TOC entry 6712 (class 0 OID 0)
-- Dependencies: 272
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- TOC entry 6713 (class 0 OID 0)
-- Dependencies: 272
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- TOC entry 273 (class 1259 OID 17354)
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- TOC entry 6714 (class 0 OID 0)
-- Dependencies: 273
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- TOC entry 6715 (class 0 OID 0)
-- Dependencies: 273
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- TOC entry 318 (class 1259 OID 19781)
-- Name: ab_test_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_test_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    user_id uuid,
    session_id text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 6716 (class 0 OID 0)
-- Dependencies: 318
-- Name: TABLE ab_test_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ab_test_assignments IS 'User assignments to specific test variants';


--
-- TOC entry 319 (class 1259 OID 19807)
-- Name: ab_test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    user_id uuid,
    session_id text NOT NULL,
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT now(),
    CONSTRAINT ab_test_results_event_type_check CHECK ((event_type = ANY (ARRAY['conversion'::text, 'error'::text, 'engagement'::text])))
);


--
-- TOC entry 6717 (class 0 OID 0)
-- Dependencies: 319
-- Name: TABLE ab_test_results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ab_test_results IS 'Results and events tracked for each test variant';


--
-- TOC entry 6718 (class 0 OID 0)
-- Dependencies: 319
-- Name: COLUMN ab_test_results.event_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ab_test_results.event_data IS 'Additional data associated with the tracked event';


--
-- TOC entry 317 (class 1259 OID 19763)
-- Name: ab_test_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_test_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_control boolean DEFAULT false NOT NULL,
    traffic_percentage integer DEFAULT 50 NOT NULL,
    component_mappings jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ab_test_variants_traffic_percentage_check CHECK (((traffic_percentage >= 0) AND (traffic_percentage <= 100)))
);


--
-- TOC entry 6719 (class 0 OID 0)
-- Dependencies: 317
-- Name: TABLE ab_test_variants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ab_test_variants IS 'Variants within each A/B test with different configurations';


--
-- TOC entry 6720 (class 0 OID 0)
-- Dependencies: 317
-- Name: COLUMN ab_test_variants.component_mappings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ab_test_variants.component_mappings IS 'JSON array of component mapping overrides for this variant';


--
-- TOC entry 316 (class 1259 OID 19747)
-- Name: ab_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    traffic_percentage integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ab_tests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'paused'::text]))),
    CONSTRAINT ab_tests_traffic_percentage_check CHECK (((traffic_percentage >= 0) AND (traffic_percentage <= 100)))
);


--
-- TOC entry 6721 (class 0 OID 0)
-- Dependencies: 316
-- Name: TABLE ab_tests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ab_tests IS 'A/B tests for component mappings and other features';


--
-- TOC entry 406 (class 1259 OID 89887)
-- Name: admin_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_action_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    reason text,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    correlation_id uuid,
    session_info jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 411 (class 1259 OID 90099)
-- Name: admin_action_log_app; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_action_log_app (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    reason text,
    correlation_id uuid NOT NULL,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 274 (class 1259 OID 17369)
-- Name: admin_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    severity text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    acknowledged boolean DEFAULT false,
    acknowledged_by uuid,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT admin_alerts_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);

ALTER TABLE ONLY public.admin_alerts FORCE ROW LEVEL SECURITY;


--
-- TOC entry 410 (class 1259 OID 90047)
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id integer NOT NULL,
    session_id character varying(100) NOT NULL,
    user_id uuid NOT NULL,
    ip_address inet,
    user_agent text,
    permissions jsonb DEFAULT '[]'::jsonb,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoked_reason text
);


--
-- TOC entry 6722 (class 0 OID 0)
-- Dependencies: 410
-- Name: TABLE admin_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_sessions IS 'Tracks active admin JWT sessions for audit and revocation purposes';


--
-- TOC entry 6723 (class 0 OID 0)
-- Dependencies: 410
-- Name: COLUMN admin_sessions.session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_sessions.session_id IS 'Unique session identifier embedded in JWT claims';


--
-- TOC entry 6724 (class 0 OID 0)
-- Dependencies: 410
-- Name: COLUMN admin_sessions.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_sessions.permissions IS 'Snapshot of admin permissions at token issuance';


--
-- TOC entry 409 (class 1259 OID 90046)
-- Name: admin_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6725 (class 0 OID 0)
-- Dependencies: 409
-- Name: admin_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_sessions_id_seq OWNED BY public.admin_sessions.id;


--
-- TOC entry 413 (class 1259 OID 90128)
-- Name: admin_two_person_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_two_person_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    payload jsonb NOT NULL,
    threshold numeric NOT NULL,
    requested_by uuid NOT NULL,
    approved_by uuid,
    state text DEFAULT 'pending'::text NOT NULL,
    reason text,
    correlation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    CONSTRAINT admin_two_person_queue_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT two_person_different_admin CHECK (((approved_by IS NULL) OR (approved_by <> requested_by)))
);


--
-- TOC entry 393 (class 1259 OID 81560)
-- Name: advisor_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_id uuid NOT NULL,
    consultation_id uuid,
    amount_cents integer NOT NULL,
    reason text NOT NULL,
    created_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advisor_adjustments_reason_check CHECK ((reason = ANY (ARRAY['refund'::text, 'chargeback'::text, 'manual'::text])))
);


--
-- TOC entry 403 (class 1259 OID 87006)
-- Name: advisor_analytics_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_analytics_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_consultations integer DEFAULT 0,
    free_consultations integer DEFAULT 0,
    paid_consultations integer DEFAULT 0,
    average_rating numeric(3,2),
    total_earnings_cents integer DEFAULT 0,
    conversion_rate numeric(5,2),
    specialization_performance jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 397 (class 1259 OID 84043)
-- Name: advisor_application_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_application_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.advisor_application_status DEFAULT 'draft'::public.advisor_application_status,
    submitted_at timestamp with time zone,
    professional_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- TOC entry 402 (class 1259 OID 86927)
-- Name: advisor_availability_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_availability_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_id uuid NOT NULL,
    timezone character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    weekly_schedule jsonb DEFAULT '{}'::jsonb NOT NULL,
    blackout_dates jsonb DEFAULT '[]'::jsonb,
    special_availability jsonb DEFAULT '[]'::jsonb,
    min_notice_hours integer DEFAULT 24,
    max_advance_days integer DEFAULT 30,
    buffer_minutes integer DEFAULT 15,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_buffer_reasonable CHECK (((buffer_minutes >= 0) AND (buffer_minutes <= 120))),
    CONSTRAINT chk_max_advance_reasonable CHECK (((max_advance_days >= 1) AND (max_advance_days <= 365))),
    CONSTRAINT chk_min_notice_reasonable CHECK (((min_notice_hours >= 1) AND (min_notice_hours <= 168))),
    CONSTRAINT chk_timezone_valid CHECK (((timezone)::text ~ '^[A-Za-z_]+/[A-Za-z_]+$'::text))
);


--
-- TOC entry 392 (class 1259 OID 81540)
-- Name: advisor_consultation_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_consultation_charges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consultation_id uuid NOT NULL,
    stripe_payment_intent_id text,
    total_amount_cents integer NOT NULL,
    platform_fee_cents integer NOT NULL,
    advisor_earnings_cents integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advisor_consultation_charges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT chk_charge_split CHECK ((total_amount_cents = (platform_fee_cents + advisor_earnings_cents)))
);


--
-- TOC entry 391 (class 1259 OID 81509)
-- Name: advisor_consultations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_consultations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_id uuid NOT NULL,
    client_id uuid NOT NULL,
    project_id uuid,
    cal_booking_id text,
    start_time timestamp with time zone NOT NULL,
    duration_minutes integer NOT NULL,
    status public.consultation_status DEFAULT 'scheduled'::public.consultation_status,
    video_url text,
    notes text,
    price_cents integer NOT NULL,
    platform_fee_cents integer NOT NULL,
    advisor_earnings_cents integer NOT NULL,
    currency text DEFAULT 'USD'::text,
    locale text,
    client_timezone text,
    pricing_snapshot jsonb DEFAULT '{"sku": "30min", "currency": "USD", "rate_cents": 1900}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    is_free_consultation boolean DEFAULT false,
    pricing_context jsonb DEFAULT '{}'::jsonb,
    advisor_notes text,
    preparation_materials jsonb,
    consultation_outcome jsonb,
    CONSTRAINT advisor_consultations_duration_minutes_check CHECK ((duration_minutes = ANY (ARRAY[15, 30, 60]))),
    CONSTRAINT chk_consultation_split CHECK ((price_cents = (platform_fee_cents + advisor_earnings_cents))),
    CONSTRAINT chk_outcome_size CHECK (((consultation_outcome IS NULL) OR (pg_column_size(consultation_outcome) <= 16384))),
    CONSTRAINT chk_prep_size CHECK (((preparation_materials IS NULL) OR (pg_column_size(preparation_materials) <= 16384)))
);


--
-- TOC entry 398 (class 1259 OID 84062)
-- Name: advisor_event_timeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_event_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    advisor_id uuid,
    event_type public.advisor_event_type NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    actor_type text DEFAULT 'system'::text,
    event_code text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advisor_event_timeline_actor_type_check CHECK ((actor_type = ANY (ARRAY['system'::text, 'user'::text, 'admin'::text])))
);


--
-- TOC entry 401 (class 1259 OID 85656)
-- Name: advisor_free_consultation_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_free_consultation_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_user_id uuid NOT NULL,
    duration_minutes integer NOT NULL,
    conversion_to_paid boolean DEFAULT false,
    client_feedback_rating integer,
    created_at timestamp with time zone DEFAULT now(),
    converted_at timestamp with time zone,
    CONSTRAINT free_consultation_valid_duration CHECK ((duration_minutes = ANY (ARRAY[15, 30, 60]))),
    CONSTRAINT free_consultation_valid_rating CHECK (((client_feedback_rating IS NULL) OR ((client_feedback_rating >= 1) AND (client_feedback_rating <= 5))))
);


--
-- TOC entry 395 (class 1259 OID 81613)
-- Name: advisor_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_id uuid NOT NULL,
    payout_month date NOT NULL,
    total_earnings_cents integer NOT NULL,
    stripe_transfer_id text,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text,
    processed_at timestamp with time zone,
    processed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advisor_payouts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'on_hold'::text])))
);


--
-- TOC entry 396 (class 1259 OID 81635)
-- Name: advisor_processed_calcom_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_processed_calcom_events (
    id text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 394 (class 1259 OID 81585)
-- Name: advisor_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_id uuid NOT NULL,
    client_id uuid NOT NULL,
    consultation_id uuid,
    rating integer NOT NULL,
    review_text text,
    expertise_rating integer,
    communication_rating integer,
    helpfulness_rating integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advisor_reviews_communication_rating_check CHECK (((communication_rating >= 1) AND (communication_rating <= 5))),
    CONSTRAINT advisor_reviews_expertise_rating_check CHECK (((expertise_rating >= 1) AND (expertise_rating <= 5))),
    CONSTRAINT advisor_reviews_helpfulness_rating_check CHECK (((helpfulness_rating >= 1) AND (helpfulness_rating <= 5))),
    CONSTRAINT advisor_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- TOC entry 399 (class 1259 OID 85486)
-- Name: advisor_specialty_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_specialty_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    specialty_key character varying(50) NOT NULL,
    language_code character varying(5) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT specialty_translations_valid_key CHECK (((specialty_key)::text ~ '^[a-z][a-z0-9_-]*$'::text)),
    CONSTRAINT specialty_translations_valid_language CHECK (((language_code)::text = ANY ((ARRAY['en'::character varying, 'ar'::character varying, 'fr'::character varying, 'es'::character varying, 'de'::character varying])::text[])))
);


--
-- TOC entry 400 (class 1259 OID 85512)
-- Name: advisor_translation_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_translation_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advisor_user_id uuid NOT NULL,
    language_code character varying(5) NOT NULL,
    action_type character varying(20) NOT NULL,
    content_length integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT translation_metrics_valid_action CHECK (((action_type)::text = ANY ((ARRAY['bio_update'::character varying, 'specialty_view'::character varying, 'profile_view'::character varying, 'search_result'::character varying])::text[]))),
    CONSTRAINT translation_metrics_valid_language CHECK (((language_code)::text = ANY ((ARRAY['en'::character varying, 'ar'::character varying, 'fr'::character varying, 'es'::character varying, 'de'::character varying])::text[])))
);


--
-- TOC entry 390 (class 1259 OID 81479)
-- Name: advisors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    display_name text NOT NULL,
    bio text,
    avatar_url text,
    skills text[] DEFAULT '{}'::text[],
    specialties text[] DEFAULT '{}'::text[],
    languages text[] DEFAULT '{}'::text[],
    rating numeric DEFAULT 0,
    review_count integer DEFAULT 0,
    approval_status text DEFAULT 'pending'::text,
    stripe_connect_account_id text,
    cal_com_event_type_url text,
    is_accepting_bookings boolean DEFAULT true,
    country_code text,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    onboarding_steps jsonb DEFAULT '{"skills_added": false, "cal_connected": false, "admin_approved": false, "availability_set": false, "stripe_connected": false, "profile_completed": false}'::jsonb,
    review_started_at timestamp with time zone,
    review_completed_at timestamp with time zone,
    multilingual_bio jsonb DEFAULT '{}'::jsonb,
    pricing_model public.advisor_pricing_model DEFAULT 'platform_fixed'::public.advisor_pricing_model,
    free_consultation_durations jsonb DEFAULT '{}'::jsonb,
    multilingual_display_name jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT advisors_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT advisors_multilingual_bio_valid_languages CHECK (((multilingual_bio = '{}'::jsonb) OR ((multilingual_bio ?| ARRAY['en'::text, 'ar'::text, 'fr'::text, 'es'::text, 'de'::text]) AND (NOT ((multilingual_bio ?| ARRAY['en'::text, 'ar'::text, 'fr'::text, 'es'::text, 'de'::text]) = false))))),
    CONSTRAINT advisors_multilingual_display_name_valid_languages CHECK (((multilingual_display_name = '{}'::jsonb) OR ((multilingual_display_name ?| ARRAY['en'::text, 'ar'::text, 'fr'::text, 'es'::text, 'de'::text]) AND (NOT ((multilingual_display_name ?| ARRAY['en'::text, 'ar'::text, 'fr'::text, 'es'::text, 'de'::text]) = false))))),
    CONSTRAINT advisors_valid_free_durations CHECK (((free_consultation_durations = '{}'::jsonb) OR ((jsonb_typeof(free_consultation_durations) = 'object'::text) AND ((free_consultation_durations ? '15'::text) OR (free_consultation_durations ? '30'::text) OR (free_consultation_durations ? '60'::text)))))
);


--
-- TOC entry 430 (class 1259 OID 92030)
-- Name: ai_time_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_time_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    seconds_delta integer NOT NULL,
    reason text,
    created_by uuid,
    occurred_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_time_ledger_source_type_check CHECK ((source_type = ANY (ARRAY['payment'::text, 'subscription_credit'::text, 'voucher'::text, 'admin_adjustment'::text, 'rollback'::text])))
);


--
-- TOC entry 6726 (class 0 OID 0)
-- Dependencies: 430
-- Name: TABLE ai_time_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_time_ledger IS 'Complete audit trail for all AI time balance changes';


--
-- TOC entry 6727 (class 0 OID 0)
-- Dependencies: 430
-- Name: COLUMN ai_time_ledger.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_time_ledger.source_type IS 'Type of operation causing the change';


--
-- TOC entry 6728 (class 0 OID 0)
-- Dependencies: 430
-- Name: COLUMN ai_time_ledger.seconds_delta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_time_ledger.seconds_delta IS 'Change in AI seconds (positive for credits, negative for debits)';


--
-- TOC entry 275 (class 1259 OID 17379)
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    hash text NOT NULL,
    project_id uuid,
    mime_type text,
    size bigint,
    uploaded_at timestamp with time zone DEFAULT now(),
    uploader_id uuid
);


--
-- TOC entry 425 (class 1259 OID 91911)
-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payment_provider public.payment_provider_key NOT NULL,
    provider_customer_id character varying(255) NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    email text NOT NULL,
    phone_number text,
    phone_verified boolean DEFAULT false,
    preferred_locale character(2) DEFAULT 'en'::bpchar,
    preferred_currency character(3) DEFAULT 'USD'::bpchar,
    region_code character(2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    health_score integer DEFAULT 100,
    risk_level text DEFAULT 'low'::text,
    health_factors jsonb DEFAULT '{}'::jsonb,
    last_health_update timestamp without time zone DEFAULT now(),
    CONSTRAINT billing_customers_health_score_check CHECK (((health_score >= 0) AND (health_score <= 100))),
    CONSTRAINT billing_customers_preferred_locale_check CHECK ((preferred_locale = ANY (ARRAY['en'::bpchar, 'ar'::bpchar]))),
    CONSTRAINT billing_customers_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- TOC entry 6729 (class 0 OID 0)
-- Dependencies: 425
-- Name: TABLE billing_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_customers IS 'Provider-agnostic customer records with region and locale support';


--
-- TOC entry 6730 (class 0 OID 0)
-- Dependencies: 425
-- Name: COLUMN billing_customers.phone_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_customers.phone_number IS 'E.164 format phone number, validated in application layer';


--
-- TOC entry 6731 (class 0 OID 0)
-- Dependencies: 425
-- Name: COLUMN billing_customers.preferred_locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_customers.preferred_locale IS 'UI locale preference (en=English, ar=Arabic)';


--
-- TOC entry 426 (class 1259 OID 91935)
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    pricing_item_id uuid NOT NULL,
    order_id text NOT NULL,
    idempotency_key text NOT NULL,
    provider_invoice_id character varying(255),
    price_snapshot jsonb NOT NULL,
    amount_cents integer NOT NULL,
    currency character(3) NOT NULL,
    payment_flow text NOT NULL,
    status text NOT NULL,
    expires_at timestamp with time zone,
    payment_provider public.payment_provider_key NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    discount_source text,
    discount_minor_units integer DEFAULT 0,
    promotion_id uuid,
    original_amount_cents integer,
    total_after_discount_cents integer,
    CONSTRAINT billing_invoices_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT billing_invoices_payment_flow_check CHECK ((payment_flow = ANY (ARRAY['subscription_invoice'::text, 'one_time_package'::text, 'cash_voucher'::text, 'wallet_topup'::text]))),
    CONSTRAINT billing_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'expired'::text]))),
    CONSTRAINT invoice_amount_with_discount CHECK ((((discount_minor_units = 0) AND (amount_cents = ((price_snapshot ->> 'unit_amount_cents'::text))::integer)) OR ((discount_minor_units > 0) AND (original_amount_cents = ((price_snapshot ->> 'unit_amount_cents'::text))::integer) AND (total_after_discount_cents = GREATEST((original_amount_cents - discount_minor_units), 0)) AND (amount_cents = total_after_discount_cents))))
);


--
-- TOC entry 6732 (class 0 OID 0)
-- Dependencies: 426
-- Name: TABLE billing_invoices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_invoices IS 'Unified invoice object for subscriptions and packages with price snapshot immutability';


--
-- TOC entry 6733 (class 0 OID 0)
-- Dependencies: 426
-- Name: COLUMN billing_invoices.price_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_invoices.price_snapshot IS 'Immutable price data at order time to protect against catalog changes';


--
-- TOC entry 6734 (class 0 OID 0)
-- Dependencies: 426
-- Name: COLUMN billing_invoices.payment_flow; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_invoices.payment_flow IS 'Type of payment flow (subscription_invoice, one_time_package, cash_voucher, wallet_topup)';


--
-- TOC entry 6735 (class 0 OID 0)
-- Dependencies: 426
-- Name: COLUMN billing_invoices.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_invoices.expires_at IS 'Expiry timestamp for cash voucher flows';


--
-- TOC entry 428 (class 1259 OID 91989)
-- Name: billing_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    invoice_id uuid,
    idempotency_key text,
    provider_payment_id character varying(255) NOT NULL,
    provider_transaction_id character varying(255),
    amount_cents integer NOT NULL,
    currency character(3) NOT NULL,
    payment_provider public.payment_provider_key NOT NULL,
    status public.payment_status NOT NULL,
    payment_flow text NOT NULL,
    payment_method text,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    exchange_rate_used numeric(10,6) DEFAULT 1.0,
    amount_usd_cents integer GENERATED ALWAYS AS ((round(((amount_cents)::numeric * exchange_rate_used)))::integer) STORED,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    provider_error_code text,
    provider_error_category text,
    CONSTRAINT billing_payments_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT billing_payments_payment_flow_check CHECK ((payment_flow = ANY (ARRAY['one_time'::text, 'subscription_invoice'::text, 'cash_voucher'::text, 'wallet'::text]))),
    CONSTRAINT billing_payments_provider_error_category_check CHECK ((provider_error_category = ANY (ARRAY['insufficient_funds'::text, 'expired_card'::text, 'invalid_card'::text, 'declined'::text, 'processing_error'::text, 'network_error'::text, 'other'::text])))
);


--
-- TOC entry 6736 (class 0 OID 0)
-- Dependencies: 428
-- Name: TABLE billing_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_payments IS 'Provider-agnostic payment records with global idempotency and USD normalization';


--
-- TOC entry 6737 (class 0 OID 0)
-- Dependencies: 428
-- Name: COLUMN billing_payments.idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_payments.idempotency_key IS 'Global idempotency key to prevent double credits';


--
-- TOC entry 6738 (class 0 OID 0)
-- Dependencies: 428
-- Name: COLUMN billing_payments.amount_usd_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_payments.amount_usd_cents IS 'USD-normalized amount for cross-provider analytics';


--
-- TOC entry 427 (class 1259 OID 91964)
-- Name: billing_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    pricing_item_id uuid NOT NULL,
    provider_subscription_id character varying(255) NOT NULL,
    plan_key text NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    currency character(3) NOT NULL,
    amount_cents integer NOT NULL,
    payment_provider public.payment_provider_key NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    cancel_at_period_end boolean DEFAULT false,
    canceled_at timestamp with time zone,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    billing_interval text,
    CONSTRAINT billing_subscriptions_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT billing_subscriptions_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text])))
);


--
-- TOC entry 6739 (class 0 OID 0)
-- Dependencies: 427
-- Name: TABLE billing_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_subscriptions IS 'Provider-agnostic subscription records with canonical status handling';


--
-- TOC entry 6740 (class 0 OID 0)
-- Dependencies: 427
-- Name: COLUMN billing_subscriptions.provider_subscription_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_subscriptions.provider_subscription_id IS 'External subscription ID from payment provider';


--
-- TOC entry 276 (class 1259 OID 17385)
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    name text DEFAULT 'main'::text NOT NULL,
    head_id uuid,
    is_published boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 360 (class 1259 OID 53328)
-- Name: build_events_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.build_events_daily_stats (
    date date NOT NULL,
    total_events bigint DEFAULT 0 NOT NULL,
    total_builds bigint DEFAULT 0 NOT NULL,
    successful_builds bigint DEFAULT 0 NOT NULL,
    failed_builds bigint DEFAULT 0 NOT NULL,
    avg_duration_seconds numeric(10,2),
    total_users bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.build_events_daily_stats FORCE ROW LEVEL SECURITY;


--
-- TOC entry 363 (class 1259 OID 53624)
-- Name: project_timeline_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_timeline_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 362 (class 1259 OID 53365)
-- Name: project_chat_log_minimal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chat_log_minimal (
    id bigint NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    request_id text,
    correlation_id text,
    mode text NOT NULL,
    session_id text,
    message_text text NOT NULL,
    message_type text DEFAULT 'user'::text NOT NULL,
    build_id text,
    build_triggered boolean DEFAULT false,
    user_agent text,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now(),
    response_data jsonb,
    chat_mode character varying(50),
    parent_message_id bigint,
    version_id text,
    tokens_used integer,
    duration_ms integer,
    billable_seconds integer,
    ai_session_id text,
    ai_tracking_id text,
    converted_from_session_id text,
    timeline_seq bigint DEFAULT nextval('public.project_timeline_seq'::regclass),
    locale character varying(10),
    language character varying(5),
    is_visible boolean DEFAULT true,
    is_hidden boolean DEFAULT false,
    build_immediately boolean,
    mode_at_creation character varying(10),
    seq bigint NOT NULL,
    client_msg_id uuid,
    actor_type text DEFAULT 'client'::text,
    edited_at timestamp with time zone,
    is_deleted boolean DEFAULT false,
    visibility text DEFAULT 'public'::text,
    CONSTRAINT chat_log_message_type_check_v2 CHECK ((message_type = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'error'::text, 'build_reference'::text]))),
    CONSTRAINT chat_log_minimal_mode_check CHECK ((mode = ANY (ARRAY['plan'::text, 'build'::text]))),
    CONSTRAINT chk_seq_pos CHECK ((seq > 0)),
    CONSTRAINT project_chat_log_minimal_actor_type_check CHECK ((actor_type = ANY (ARRAY['client'::text, 'assistant'::text, 'advisor'::text]))),
    CONSTRAINT project_chat_log_minimal_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'internal'::text])))
);

ALTER TABLE ONLY public.project_chat_log_minimal FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6741 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.response_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.response_data IS 'Structured response data including templates and variables';


--
-- TOC entry 6742 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.chat_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.chat_mode IS 'Specific chat mode for plan sessions';


--
-- TOC entry 6743 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.tokens_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.tokens_used IS 'Internal token usage tracking - NOT exposed via API';


--
-- TOC entry 6744 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.duration_ms IS 'Internal performance metric - NOT exposed via API';


--
-- TOC entry 6745 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.billable_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.billable_seconds IS 'Internal billing calculation - NOT exposed via API';


--
-- TOC entry 6746 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.converted_from_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.converted_from_session_id IS 'Links build messages to their originating plan session';


--
-- TOC entry 6747 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.timeline_seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.timeline_seq IS 'Global sequence for unified timeline ordering';


--
-- TOC entry 6748 (class 0 OID 0)
-- Dependencies: 362
-- Name: COLUMN project_chat_log_minimal.is_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_log_minimal.is_visible IS 'Controls visibility in timeline views';


--
-- TOC entry 361 (class 1259 OID 53364)
-- Name: chat_log_minimal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_log_minimal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6749 (class 0 OID 0)
-- Dependencies: 361
-- Name: chat_log_minimal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_log_minimal_id_seq OWNED BY public.project_chat_log_minimal.id;


--
-- TOC entry 387 (class 1259 OID 81375)
-- Name: chat_search_analytics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.chat_search_analytics AS
 SELECT project_chat_log_minimal.project_id,
    date_trunc('day'::text, project_chat_log_minimal.created_at) AS date,
    project_chat_log_minimal.actor_type,
    project_chat_log_minimal.mode,
    count(*) AS message_count,
    avg(char_length(project_chat_log_minimal.message_text)) AS avg_message_length,
    count(DISTINCT project_chat_log_minimal.user_id) AS unique_users,
    count(DISTINCT project_chat_log_minimal.session_id) AS unique_sessions
   FROM public.project_chat_log_minimal
  WHERE ((project_chat_log_minimal.is_deleted = false) AND (project_chat_log_minimal.message_text IS NOT NULL) AND (char_length(project_chat_log_minimal.message_text) > 0))
  GROUP BY project_chat_log_minimal.project_id, (date_trunc('day'::text, project_chat_log_minimal.created_at)), project_chat_log_minimal.actor_type, project_chat_log_minimal.mode
  ORDER BY project_chat_log_minimal.project_id, (date_trunc('day'::text, project_chat_log_minimal.created_at)) DESC;


--
-- TOC entry 337 (class 1259 OID 33846)
-- Name: project_ai_session_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_ai_session_metrics (
    id integer NOT NULL,
    build_id character varying(64) NOT NULL,
    session_id character varying(100),
    prompt_type character varying(50) NOT NULL,
    original_prompt_length integer,
    enhanced_prompt_length integer,
    session_start_time timestamp with time zone NOT NULL,
    session_end_time timestamp with time zone,
    session_duration_ms integer,
    time_to_first_output_ms integer,
    input_tokens integer,
    output_tokens integer,
    cache_creation_tokens integer,
    cache_read_tokens integer,
    total_cost_usd numeric(10,6),
    files_created integer DEFAULT 0,
    files_modified integer DEFAULT 0,
    files_read integer DEFAULT 0,
    files_deleted integer DEFAULT 0,
    tool_calls_total integer DEFAULT 0,
    tool_calls_by_type jsonb,
    bash_commands_run integer DEFAULT 0,
    errors_encountered integer DEFAULT 0,
    errors_fixed integer DEFAULT 0,
    error_types jsonb,
    success boolean NOT NULL,
    timeout_occurred boolean DEFAULT false,
    session_timeout_ms integer,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    session_duration_min numeric(10,2) GENERATED ALWAYS AS (round(((session_duration_ms)::numeric / (60000)::numeric), 2)) STORED,
    is_resumable boolean DEFAULT true,
    resume_failure_count integer DEFAULT 0
);

ALTER TABLE ONLY public.project_ai_session_metrics FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6750 (class 0 OID 0)
-- Dependencies: 337
-- Name: TABLE project_ai_session_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_ai_session_metrics IS 'Detailed metrics for Claude AI sessions including token usage and tool calls';


--
-- TOC entry 336 (class 1259 OID 33845)
-- Name: claude_session_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.claude_session_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6751 (class 0 OID 0)
-- Dependencies: 336
-- Name: claude_session_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.claude_session_metrics_id_seq OWNED BY public.project_ai_session_metrics.id;


--
-- TOC entry 277 (class 1259 OID 17395)
-- Name: claude_user_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claude_user_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    calls integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 278 (class 1259 OID 17402)
-- Name: claude_usage_current; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.claude_usage_current AS
 SELECT u.id AS user_id,
    u.email,
    COALESCE(c.calls, 0) AS calls_this_hour,
    date_trunc('hour'::text, now()) AS current_window,
    (date_trunc('hour'::text, now()) + '01:00:00'::interval) AS window_reset_at
   FROM (auth.users u
     LEFT JOIN public.claude_user_usage c ON (((u.id = c.user_id) AND (c.window_start = date_trunc('hour'::text, now())))))
  WHERE (u.deleted_at IS NULL);


--
-- TOC entry 279 (class 1259 OID 17407)
-- Name: commits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    author_id uuid,
    parent_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    tree_hash text NOT NULL,
    message text,
    payload_size integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_payload_size CHECK ((payload_size <= 256000))
);


--
-- TOC entry 320 (class 1259 OID 19920)
-- Name: component_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ai_component_name text NOT NULL,
    builder_section_type text NOT NULL,
    industry text,
    priority integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT component_map_builder_section_type_check CHECK ((builder_section_type = ANY (ARRAY['hero'::text, 'features'::text, 'pricing'::text, 'testimonials'::text, 'cta'::text, 'footer'::text])))
);


--
-- TOC entry 6752 (class 0 OID 0)
-- Dependencies: 320
-- Name: TABLE component_map; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.component_map IS 'Maps AI-generated component names to builder section types';


--
-- TOC entry 6753 (class 0 OID 0)
-- Dependencies: 320
-- Name: COLUMN component_map.ai_component_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.component_map.ai_component_name IS 'The component name from AI-generated templates';


--
-- TOC entry 6754 (class 0 OID 0)
-- Dependencies: 320
-- Name: COLUMN component_map.builder_section_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.component_map.builder_section_type IS 'The builder section type (hero, features, pricing, testimonials, cta, footer)';


--
-- TOC entry 6755 (class 0 OID 0)
-- Dependencies: 320
-- Name: COLUMN component_map.industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.component_map.industry IS 'Industry context for mapping (null = applies to all)';


--
-- TOC entry 6756 (class 0 OID 0)
-- Dependencies: 320
-- Name: COLUMN component_map.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.component_map.priority IS 'Higher priority mappings are preferred when multiple matches exist';


--
-- TOC entry 280 (class 1259 OID 17418)
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    code character(3) NOT NULL,
    name text NOT NULL,
    stripe_enabled boolean DEFAULT true
);


--
-- TOC entry 321 (class 1259 OID 25563)
-- Name: project_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    project_id text NOT NULL,
    version_id text NOT NULL,
    prompt text NOT NULL,
    parent_version_id text,
    preview_url text,
    artifact_url text,
    framework text,
    build_duration_ms integer,
    install_duration_ms integer,
    deploy_duration_ms integer,
    output_size_bytes integer,
    ai_json jsonb,
    status text NOT NULL,
    needs_rebuild boolean DEFAULT false,
    base_snapshot_id text,
    cf_deployment_id text,
    node_version text,
    pnpm_version text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    version_metadata_id character(26),
    enhanced_prompt text,
    prompt_metadata jsonb,
    ai_session_id text,
    ai_session_created_at timestamp without time zone,
    ai_session_last_used_at timestamp without time zone,
    artifact_size bigint,
    artifact_checksum character varying(64),
    is_published boolean DEFAULT false,
    published_at timestamp with time zone,
    published_by_user_id text,
    user_comment text,
    version_name character varying(100),
    version_description text,
    change_type character varying(10),
    major_version integer,
    minor_version integer,
    patch_version integer,
    prerelease text,
    breaking_risk text,
    auto_classified boolean,
    classification_confidence numeric(3,2),
    classification_reasoning text,
    display_version_number integer,
    deployment_lane character varying(20),
    deployment_lane_detected_at timestamp with time zone,
    deployment_lane_detection_origin character varying(10),
    deployment_lane_reasons text[],
    deployment_lane_switched boolean DEFAULT false,
    deployment_lane_switch_reason text,
    final_deployment_url text,
    deployment_lane_manifest jsonb,
    CONSTRAINT chk_artifact_checksum_format CHECK (((artifact_checksum IS NULL) OR ((artifact_checksum)::text ~ '^[a-fA-F0-9]{64}$'::text))),
    CONSTRAINT chk_artifact_size_limit CHECK (((artifact_size IS NULL) OR ((artifact_size >= 0) AND (artifact_size <= '2147483648'::bigint)))),
    CONSTRAINT chk_project_versions_deployment_lane CHECK (((deployment_lane)::text = ANY ((ARRAY['pages-static'::character varying, 'pages-edge'::character varying, 'workers-node'::character varying])::text[]))),
    CONSTRAINT chk_project_versions_deployment_lane_origin CHECK (((deployment_lane_detection_origin)::text = ANY ((ARRAY['detection'::character varying, 'manual'::character varying, 'fallback'::character varying])::text[]))),
    CONSTRAINT project_versions_status_check CHECK ((status = ANY (ARRAY['building'::text, 'deployed'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.project_versions FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6757 (class 0 OID 0)
-- Dependencies: 321
-- Name: TABLE project_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_versions IS 'Stores all build versions for projects with their deployment metadata';


--
-- TOC entry 6758 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.version_id IS 'ULID/UUID to avoid race conditions';


--
-- TOC entry 6759 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.artifact_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.artifact_url IS 'R2/S3 URL for the zipped build output';


--
-- TOC entry 6760 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.needs_rebuild; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.needs_rebuild IS 'Flag for marking stale versions that need rebuilding';


--
-- TOC entry 6761 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.base_snapshot_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.base_snapshot_id IS 'Reference to base version for diff tracking';


--
-- TOC entry 6762 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.cf_deployment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.cf_deployment_id IS 'Cloudflare Pages deployment ID for webhook mapping';


--
-- TOC entry 6763 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.enhanced_prompt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.enhanced_prompt IS 'The full enhanced prompt sent to Claude (includes technical instructions)';


--
-- TOC entry 6764 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.prompt_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.prompt_metadata IS 'Metadata about the prompt (type, attempt number, is_update, etc.)';


--
-- TOC entry 6765 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.ai_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.ai_session_id IS 'Most recent Claude session ID for this version (changes with every Claude operation)';


--
-- TOC entry 6766 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.ai_session_created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.ai_session_created_at IS 'When the first session was created for this version';


--
-- TOC entry 6767 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.ai_session_last_used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.ai_session_last_used_at IS 'When the session was last used or updated';


--
-- TOC entry 6768 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.artifact_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.artifact_size IS 'Size of the R2 artifact in bytes';


--
-- TOC entry 6769 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.artifact_checksum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.artifact_checksum IS 'SHA256 checksum of the R2 artifact (hex-encoded)';


--
-- TOC entry 6770 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.display_version_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.display_version_number IS 'User-facing version number (v1, v2, v3...) assigned immediately on deployment for instant user feedback';


--
-- TOC entry 6771 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane IS 'Cloudflare deployment lane used for this version';


--
-- TOC entry 6772 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane_detected_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane_detected_at IS 'When the deployment lane was detected for this version';


--
-- TOC entry 6773 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane_detection_origin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane_detection_origin IS 'How the lane was selected: manual override, automatic detection, or fallback deployment';


--
-- TOC entry 6774 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane_reasons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane_reasons IS 'Array of reasons why this deployment lane was selected';


--
-- TOC entry 6775 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane_switched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane_switched IS 'Whether the deployment target was switched during deployment';


--
-- TOC entry 6776 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane_switch_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane_switch_reason IS 'Reason for deployment target switch';


--
-- TOC entry 6777 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.final_deployment_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.final_deployment_url IS 'Final deployment URL after successful deployment';


--
-- TOC entry 6778 (class 0 OID 0)
-- Dependencies: 321
-- Name: COLUMN project_versions.deployment_lane_manifest; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_versions.deployment_lane_manifest IS 'Complete deployment detection manifest as JSON';


--
-- TOC entry 379 (class 1259 OID 74006)
-- Name: deployment_lane_analytics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.deployment_lane_analytics AS
 SELECT project_versions.deployment_lane,
    count(*) AS total_deployments,
    count(*) FILTER (WHERE (project_versions.deployment_lane_switched = true)) AS switched_deployments,
    count(*) FILTER (WHERE ((project_versions.deployment_lane_detection_origin)::text = 'manual'::text)) AS manual_overrides,
    count(*) FILTER (WHERE ((project_versions.deployment_lane_detection_origin)::text = 'detection'::text)) AS auto_detected,
    round((((count(*) FILTER (WHERE (project_versions.deployment_lane_switched = true)))::numeric * 100.0) / (count(*))::numeric), 2) AS switch_rate_percentage,
    round((((count(*) FILTER (WHERE ((project_versions.deployment_lane_detection_origin)::text = 'manual'::text)))::numeric * 100.0) / (count(*))::numeric), 2) AS manual_override_percentage,
    min(project_versions.deployment_lane_detected_at) AS first_deployment,
    max(project_versions.deployment_lane_detected_at) AS latest_deployment
   FROM public.project_versions
  WHERE (project_versions.deployment_lane IS NOT NULL)
  GROUP BY project_versions.deployment_lane
UNION ALL
 SELECT 'TOTAL'::character varying AS deployment_lane,
    count(*) AS total_deployments,
    count(*) FILTER (WHERE (project_versions.deployment_lane_switched = true)) AS switched_deployments,
    count(*) FILTER (WHERE ((project_versions.deployment_lane_detection_origin)::text = 'manual'::text)) AS manual_overrides,
    count(*) FILTER (WHERE ((project_versions.deployment_lane_detection_origin)::text = 'detection'::text)) AS auto_detected,
    round((((count(*) FILTER (WHERE (project_versions.deployment_lane_switched = true)))::numeric * 100.0) / (count(*))::numeric), 2) AS switch_rate_percentage,
    round((((count(*) FILTER (WHERE ((project_versions.deployment_lane_detection_origin)::text = 'manual'::text)))::numeric * 100.0) / (count(*))::numeric), 2) AS manual_override_percentage,
    min(project_versions.deployment_lane_detected_at) AS first_deployment,
    max(project_versions.deployment_lane_detected_at) AS latest_deployment
   FROM public.project_versions
  WHERE (project_versions.deployment_lane IS NOT NULL);


--
-- TOC entry 339 (class 1259 OID 33865)
-- Name: project_deployment_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_deployment_metrics (
    id integer NOT NULL,
    build_id character varying(64) NOT NULL,
    deployment_id character varying(100),
    install_started_at timestamp with time zone,
    install_completed_at timestamp with time zone,
    install_duration_ms integer,
    install_strategy character varying(50),
    install_cache_hit boolean DEFAULT false,
    dependencies_count integer,
    dev_dependencies_count integer,
    build_started_at timestamp with time zone,
    build_completed_at timestamp with time zone,
    build_duration_ms integer,
    build_cache_hit boolean DEFAULT false,
    build_command character varying(255),
    build_output_size_bytes bigint,
    deploy_started_at timestamp with time zone,
    deploy_completed_at timestamp with time zone,
    deploy_duration_ms integer,
    deployment_size_bytes bigint,
    files_uploaded integer,
    preview_url text,
    success boolean NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    attempt_number integer DEFAULT 1,
    is_retry boolean DEFAULT false
);

ALTER TABLE ONLY public.project_deployment_metrics FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6779 (class 0 OID 0)
-- Dependencies: 339
-- Name: TABLE project_deployment_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_deployment_metrics IS 'Metrics specific to the install, build, and deployment phases';


--
-- TOC entry 6780 (class 0 OID 0)
-- Dependencies: 339
-- Name: COLUMN project_deployment_metrics.attempt_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_deployment_metrics.attempt_number IS 'Deployment attempt number for this build';


--
-- TOC entry 6781 (class 0 OID 0)
-- Dependencies: 339
-- Name: COLUMN project_deployment_metrics.is_retry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_deployment_metrics.is_retry IS 'Whether this is a retry deployment';


--
-- TOC entry 338 (class 1259 OID 33864)
-- Name: deployment_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deployment_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6782 (class 0 OID 0)
-- Dependencies: 338
-- Name: deployment_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deployment_metrics_id_seq OWNED BY public.project_deployment_metrics.id;


--
-- TOC entry 341 (class 1259 OID 33879)
-- Name: project_error_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_error_metrics (
    id integer NOT NULL,
    build_id character varying(64) NOT NULL,
    error_id character varying(100) NOT NULL,
    error_type character varying(50) NOT NULL,
    error_source character varying(50) NOT NULL,
    error_message text NOT NULL,
    error_file character varying(255),
    error_line integer,
    recovery_attempted boolean DEFAULT false,
    recovery_strategy character varying(100),
    recovery_success boolean,
    recovery_duration_ms integer,
    occurred_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ONLY public.project_error_metrics FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6783 (class 0 OID 0)
-- Dependencies: 341
-- Name: TABLE project_error_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_error_metrics IS 'Detailed error tracking and recovery attempts';


--
-- TOC entry 340 (class 1259 OID 33878)
-- Name: error_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.error_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6784 (class 0 OID 0)
-- Dependencies: 340
-- Name: error_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.error_metrics_id_seq OWNED BY public.project_error_metrics.id;


--
-- TOC entry 431 (class 1259 OID 92232)
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_currency character(3) NOT NULL,
    to_currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    rate numeric(10,6) NOT NULL,
    effective_date date NOT NULL,
    source text DEFAULT 'stripe'::text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- TOC entry 281 (class 1259 OID 17432)
-- Name: export_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    format text NOT NULL,
    exported_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ONLY public.export_logs FORCE ROW LEVEL SECURITY;


--
-- TOC entry 414 (class 1259 OID 90171)
-- Name: github_sync_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.github_sync_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    operation_type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    direction character varying(10) NOT NULL,
    github_commit_sha character varying(40),
    github_commit_message text,
    github_author_name character varying(255),
    github_author_email character varying(255),
    local_version_id character varying(255),
    local_commit_sha character varying(40),
    files_changed integer DEFAULT 0,
    insertions integer DEFAULT 0,
    deletions integer DEFAULT 0,
    conflicts_detected integer DEFAULT 0,
    error_message text,
    error_code character varying(50),
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- TOC entry 412 (class 1259 OID 90115)
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    key text NOT NULL,
    admin_user_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 367 (class 1259 OID 59271)
-- Name: internal_chat_usage_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.internal_chat_usage_summary AS
 SELECT project_chat_log_minimal.project_id,
    project_chat_log_minimal.user_id,
    date(project_chat_log_minimal.created_at) AS usage_date,
    count(*) AS total_messages,
    sum(COALESCE(project_chat_log_minimal.tokens_used, 0)) AS total_tokens,
    sum(COALESCE(project_chat_log_minimal.billable_seconds, 0)) AS total_billable_seconds,
    (avg(COALESCE(project_chat_log_minimal.duration_ms, 0)))::integer AS avg_duration_ms,
    max(project_chat_log_minimal.tokens_used) AS max_tokens_per_message,
    count(DISTINCT project_chat_log_minimal.session_id) AS unique_sessions
   FROM public.project_chat_log_minimal
  WHERE (project_chat_log_minimal.message_type = 'assistant'::text)
  GROUP BY project_chat_log_minimal.project_id, project_chat_log_minimal.user_id, (date(project_chat_log_minimal.created_at));


--
-- TOC entry 6785 (class 0 OID 0)
-- Dependencies: 367
-- Name: VIEW internal_chat_usage_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.internal_chat_usage_summary IS 'Internal usage tracking view - NOT for API exposure';


--
-- TOC entry 433 (class 1259 OID 92289)
-- Name: mv_customer_financial_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_customer_financial_summary AS
 WITH customer_subscriptions AS (
         SELECT bs.customer_id,
            bs.id AS subscription_id,
            pi.display_name AS plan_name,
            bs.status AS subscription_status,
            bs.amount_cents,
            bs.currency,
            bs.payment_provider,
            COALESCE(bs.billing_interval,
                CASE
                    WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                    ELSE NULL::text
                END) AS billing_interval,
            bs.created_at AS subscription_start,
                CASE
                    WHEN (COALESCE(bs.billing_interval,
                    CASE
                        WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                        ELSE NULL::text
                    END) = 'year'::text) THEN bs.current_period_end
                    WHEN (COALESCE(bs.billing_interval,
                    CASE
                        WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                        ELSE NULL::text
                    END) = 'month'::text) THEN bs.current_period_end
                    ELSE bs.current_period_end
                END AS next_billing_date
           FROM (public.billing_subscriptions bs
             JOIN public.pricing_items pi ON ((pi.id = bs.pricing_item_id)))
          WHERE (bs.status = ANY (ARRAY['active'::public.subscription_status, 'trialing'::public.subscription_status, 'past_due'::public.subscription_status]))
        ), customer_payments AS (
         SELECT bp.customer_id,
            count(*) AS total_payments,
            count(*) FILTER (WHERE (bp.status = 'succeeded'::public.payment_status)) AS successful_payments,
            count(*) FILTER (WHERE (bp.status = 'failed'::public.payment_status)) AS failed_payments,
            max(bp.created_at) AS last_payment_attempt,
            sum(bp.amount_cents) FILTER (WHERE (bp.status = 'succeeded'::public.payment_status)) AS total_paid_cents
           FROM public.billing_payments bp
          WHERE (bp.created_at >= (CURRENT_DATE - '1 year'::interval))
          GROUP BY bp.customer_id
        ), customer_usage AS (
         SELECT l.user_id AS customer_id,
            sum(
                CASE
                    WHEN (l.seconds_delta < 0) THEN (- l.seconds_delta)
                    ELSE 0
                END) AS total_time_consumed,
            sum(l.seconds_delta) AS net_seconds_remaining
           FROM public.ai_time_ledger l
          WHERE (l.occurred_at >= (CURRENT_DATE - '90 days'::interval))
          GROUP BY l.user_id
        ), recent_activity AS (
         SELECT u_1.id AS customer_id,
            COALESCE(u_1.last_sign_in_at, u_1.updated_at) AS last_activity
           FROM auth.users u_1
        )
 SELECT bc.id AS customer_id,
    bc.user_id,
    bc.payment_provider,
    bc.provider_customer_id,
    bc.email,
    u.created_at AS customer_since,
    cs.subscription_id,
    cs.plan_name,
    cs.subscription_status,
    cs.amount_cents AS subscription_amount_cents,
    cs.currency,
    cs.payment_provider AS subscription_provider,
    cs.next_billing_date,
    COALESCE(cp.total_payments, (0)::bigint) AS total_payments,
    COALESCE(cp.successful_payments, (0)::bigint) AS successful_payments,
    COALESCE(cp.failed_payments, (0)::bigint) AS failed_payments,
    cp.last_payment_attempt,
    COALESCE(cp.total_paid_cents, (0)::bigint) AS total_paid_cents,
    COALESCE(cu.total_time_consumed, (0)::bigint) AS total_time_consumed,
    COALESCE(cu.net_seconds_remaining, (0)::bigint) AS remaining_time_seconds,
    ra.last_activity,
    bc.health_score,
    bc.risk_level,
    bc.health_factors,
    ((COALESCE(cp.failed_payments, (0)::bigint) >= 3) OR ((COALESCE(cp.failed_payments, (0)::bigint) >= 2) AND (cp.last_payment_attempt > (CURRENT_DATE - '30 days'::interval)))) AS has_payment_risk,
    ((COALESCE(cu.net_seconds_remaining, (0)::bigint) <= 0) OR (COALESCE(cu.net_seconds_remaining, (0)::bigint) < 3600)) AS low_balance_risk,
    ((ra.last_activity IS NOT NULL) AND (ra.last_activity < (CURRENT_DATE - '30 days'::interval))) AS inactive_risk
   FROM (((((public.billing_customers bc
     JOIN auth.users u ON ((u.id = bc.user_id)))
     LEFT JOIN customer_subscriptions cs ON ((cs.customer_id = bc.id)))
     LEFT JOIN customer_payments cp ON ((cp.customer_id = bc.id)))
     LEFT JOIN customer_usage cu ON ((cu.customer_id = bc.user_id)))
     LEFT JOIN recent_activity ra ON ((ra.customer_id = bc.user_id)))
  WITH NO DATA;


--
-- TOC entry 439 (class 1259 OID 92359)
-- Name: mv_customer_ltv_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_customer_ltv_summary AS
 SELECT bc.id AS customer_id,
    bc.provider_customer_id,
    bc.payment_provider,
    bs.currency AS primary_currency,
    bs.payment_provider AS primary_subscription_provider,
    COALESCE(bs.amount_cents, 0) AS monthly_subscription_cents,
    sum(
        CASE
            WHEN (bp.status = 'succeeded'::public.payment_status) THEN bp.amount_cents
            ELSE 0
        END) AS total_spent_cents,
    count(*) FILTER (WHERE (bp.status = 'succeeded'::public.payment_status)) AS successful_transactions,
    min(bp.created_at) AS first_payment_date,
    max(bp.created_at) AS last_payment_date,
    (EXTRACT(epoch FROM (COALESCE(max(bp.created_at), now()) - min(bp.created_at))) / ((30.44 * (24)::numeric) * (3600)::numeric)) AS tenure_months,
    (
        CASE
            WHEN ((min(bp.created_at) IS NOT NULL) AND (max(bp.created_at) > min(bp.created_at))) THEN (((sum(
            CASE
                WHEN (bp.status = 'succeeded'::public.payment_status) THEN bp.amount_cents
                ELSE 0
            END))::numeric / GREATEST((EXTRACT(epoch FROM (max(bp.created_at) - min(bp.created_at))) / ((30.44 * (24)::numeric) * (3600)::numeric)), (1)::numeric)) * 12.0)
            ELSE ((COALESCE(bs.amount_cents, 0))::numeric * 12.0)
        END)::integer AS estimated_annual_ltv_cents
   FROM ((public.billing_customers bc
     LEFT JOIN public.billing_subscriptions bs ON (((bs.customer_id = bc.id) AND (bs.status = ANY (ARRAY['active'::public.subscription_status, 'trialing'::public.subscription_status, 'past_due'::public.subscription_status])))))
     LEFT JOIN public.billing_payments bp ON ((bp.customer_id = bc.id)))
  GROUP BY bc.id, bc.provider_customer_id, bc.payment_provider, bs.currency, bs.payment_provider, bs.amount_cents
  WITH NO DATA;


--
-- TOC entry 437 (class 1259 OID 92345)
-- Name: mv_monthly_revenue_history; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_monthly_revenue_history AS
 WITH monthly_cohorts AS (
         SELECT date_trunc('month'::text, bs.created_at) AS cohort_month,
            bs.currency,
            bs.payment_provider,
            count(DISTINCT bs.customer_id) AS new_subscribers,
            (sum(
                CASE
                    WHEN (COALESCE(bs.billing_interval,
                    CASE
                        WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                        ELSE NULL::text
                    END) = 'month'::text) THEN (bs.amount_cents)::numeric
                    WHEN (COALESCE(bs.billing_interval,
                    CASE
                        WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                        ELSE NULL::text
                    END) = 'year'::text) THEN ((bs.amount_cents)::numeric / 12.0)
                    ELSE (bs.amount_cents)::numeric
                END))::integer AS new_mrr_cents
           FROM (public.billing_subscriptions bs
             JOIN public.pricing_items pi ON ((pi.id = bs.pricing_item_id)))
          WHERE (bs.created_at >= (CURRENT_DATE - '2 years'::interval))
          GROUP BY (date_trunc('month'::text, bs.created_at)), bs.currency, bs.payment_provider
        ), monthly_churn AS (
         SELECT date_trunc('month'::text, bs.canceled_at) AS churn_month,
            bs.currency,
            bs.payment_provider,
            count(DISTINCT bs.customer_id) AS churned_subscribers,
            (sum(
                CASE
                    WHEN (COALESCE(bs.billing_interval,
                    CASE
                        WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                        ELSE NULL::text
                    END) = 'month'::text) THEN (bs.amount_cents)::numeric
                    WHEN (COALESCE(bs.billing_interval,
                    CASE
                        WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                        ELSE NULL::text
                    END) = 'year'::text) THEN ((bs.amount_cents)::numeric / 12.0)
                    ELSE (bs.amount_cents)::numeric
                END))::integer AS churned_mrr_cents
           FROM (public.billing_subscriptions bs
             JOIN public.pricing_items pi ON ((pi.id = bs.pricing_item_id)))
          WHERE ((bs.canceled_at IS NOT NULL) AND (bs.canceled_at >= (CURRENT_DATE - '2 years'::interval)))
          GROUP BY (date_trunc('month'::text, bs.canceled_at)), bs.currency, bs.payment_provider
        )
 SELECT mc.cohort_month AS month_date,
    mc.currency,
    mc.payment_provider,
    mc.new_subscribers,
    mc.new_mrr_cents,
    COALESCE(ch.churned_subscribers, (0)::bigint) AS churned_subscribers,
    COALESCE(ch.churned_mrr_cents, 0) AS churned_mrr_cents,
    (mc.new_mrr_cents - COALESCE(ch.churned_mrr_cents, 0)) AS net_mrr_change_cents
   FROM (monthly_cohorts mc
     LEFT JOIN monthly_churn ch ON (((ch.churn_month = mc.cohort_month) AND (ch.currency = mc.currency) AND (ch.payment_provider = mc.payment_provider))))
  ORDER BY mc.cohort_month DESC, mc.currency, mc.payment_provider
  WITH NO DATA;


--
-- TOC entry 434 (class 1259 OID 92325)
-- Name: mv_mrr_by_currency; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_mrr_by_currency AS
 SELECT CURRENT_DATE AS as_of_date,
    bs.currency,
    bs.payment_provider,
    (sum(
        CASE
            WHEN (COALESCE(bs.billing_interval,
            CASE
                WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                ELSE NULL::text
            END) = 'month'::text) THEN (bs.amount_cents)::numeric
            WHEN (COALESCE(bs.billing_interval,
            CASE
                WHEN (pi.item_type = 'subscription'::text) THEN 'month'::text
                ELSE NULL::text
            END) = 'year'::text) THEN ((bs.amount_cents)::numeric / 12.0)
            ELSE (bs.amount_cents)::numeric
        END))::integer AS mrr_cents,
    count(DISTINCT bs.customer_id) AS active_subscribers
   FROM (public.billing_subscriptions bs
     JOIN public.pricing_items pi ON ((pi.id = bs.pricing_item_id)))
  WHERE (bs.status = ANY (ARRAY['active'::public.subscription_status, 'trialing'::public.subscription_status, 'past_due'::public.subscription_status]))
  GROUP BY bs.currency, bs.payment_provider
  WITH NO DATA;


--
-- TOC entry 435 (class 1259 OID 92331)
-- Name: mv_mrr_usd_normalized; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_mrr_usd_normalized AS
 WITH base AS (
         SELECT mv_mrr_by_currency.as_of_date,
            mv_mrr_by_currency.currency,
            mv_mrr_by_currency.payment_provider,
            mv_mrr_by_currency.mrr_cents,
            mv_mrr_by_currency.active_subscribers
           FROM public.mv_mrr_by_currency
        ), rates AS (
         SELECT DISTINCT ON (exchange_rates.from_currency) exchange_rates.from_currency,
            exchange_rates.rate
           FROM public.exchange_rates
          WHERE ((exchange_rates.to_currency = 'USD'::bpchar) AND (exchange_rates.effective_date <= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))
          ORDER BY exchange_rates.from_currency, exchange_rates.effective_date DESC
        )
 SELECT CURRENT_DATE AS as_of_date,
    (sum(
        CASE b.currency
            WHEN 'USD'::bpchar THEN (b.mrr_cents)::numeric
            ELSE ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
        END))::integer AS total_mrr_usd_cents,
    sum(b.active_subscribers) AS total_subscribers,
    sum(
        CASE
            WHEN (b.currency = 'USD'::bpchar) THEN b.mrr_cents
            ELSE 0
        END) AS usd_mrr_cents,
    (sum(
        CASE
            WHEN (b.currency = 'EUR'::bpchar) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS eur_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.currency = 'GBP'::bpchar) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS gbp_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.currency = 'EGP'::bpchar) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS egp_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.currency = 'SAR'::bpchar) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS sar_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.payment_provider = 'stripe'::public.payment_provider_key) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS stripe_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.payment_provider = 'fawry'::public.payment_provider_key) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS fawry_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.payment_provider = 'paymob'::public.payment_provider_key) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS paymob_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.payment_provider = 'stcpay'::public.payment_provider_key) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS stcpay_mrr_usd_cents,
    (sum(
        CASE
            WHEN (b.payment_provider = 'paytabs'::public.payment_provider_key) THEN ((b.mrr_cents)::numeric * COALESCE(r.rate, 1.0))
            ELSE (0)::numeric
        END))::integer AS paytabs_mrr_usd_cents
   FROM (base b
     LEFT JOIN rates r ON ((r.from_currency = b.currency)))
  WITH NO DATA;


--
-- TOC entry 436 (class 1259 OID 92339)
-- Name: mv_package_revenue_daily; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_package_revenue_daily AS
 SELECT date(bp.created_at) AS revenue_date,
    bp.currency,
    bp.payment_provider,
    sum(bp.amount_cents) AS package_revenue_cents,
    count(*) AS package_purchases,
    count(DISTINCT bp.customer_id) AS unique_customers,
    (avg(bp.amount_cents))::integer AS avg_package_amount_cents
   FROM ((public.billing_payments bp
     JOIN public.billing_invoices bi ON ((bi.id = bp.invoice_id)))
     JOIN public.pricing_items pi ON ((pi.id = bi.pricing_item_id)))
  WHERE ((bp.status = 'succeeded'::public.payment_status) AND (pi.item_type = 'package'::text) AND (bp.created_at >= (CURRENT_DATE - '1 year 6 mons'::interval)))
  GROUP BY (date(bp.created_at)), bp.currency, bp.payment_provider
  WITH NO DATA;


--
-- TOC entry 438 (class 1259 OID 92351)
-- Name: mv_provider_performance; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_provider_performance AS
 WITH payment_stats AS (
         SELECT bp.payment_provider,
            bp.currency,
            count(*) AS total_attempts,
            sum(
                CASE
                    WHEN (bp.status = 'succeeded'::public.payment_status) THEN 1
                    ELSE 0
                END) AS successful_payments,
            sum(
                CASE
                    WHEN (bp.status = 'failed'::public.payment_status) THEN 1
                    ELSE 0
                END) AS failed_payments,
            sum(
                CASE
                    WHEN (bp.status = 'succeeded'::public.payment_status) THEN bp.amount_cents
                    ELSE 0
                END) AS successful_amount_cents,
            (avg(
                CASE
                    WHEN (bp.status = 'succeeded'::public.payment_status) THEN bp.amount_cents
                    ELSE NULL::integer
                END))::integer AS avg_successful_amount_cents
           FROM public.billing_payments bp
          WHERE (bp.created_at >= (CURRENT_DATE - '30 days'::interval))
          GROUP BY bp.payment_provider, bp.currency
        ), error_breakdown AS (
         SELECT bp.payment_provider,
            bp.currency,
            bp.provider_error_category,
            count(*) AS error_count
           FROM public.billing_payments bp
          WHERE ((bp.status = 'failed'::public.payment_status) AND (bp.created_at >= (CURRENT_DATE - '30 days'::interval)) AND (bp.provider_error_category IS NOT NULL))
          GROUP BY bp.payment_provider, bp.currency, bp.provider_error_category
        )
 SELECT ps.payment_provider,
    ps.currency,
    ps.total_attempts,
    ps.successful_payments,
    ps.failed_payments,
    round((((ps.successful_payments)::numeric / (NULLIF(ps.total_attempts, 0))::numeric) * (100)::numeric), 2) AS success_rate_pct,
    ps.successful_amount_cents,
    ps.avg_successful_amount_cents,
    ( SELECT eb.provider_error_category
           FROM error_breakdown eb
          WHERE ((eb.payment_provider = ps.payment_provider) AND (eb.currency = ps.currency))
          ORDER BY eb.error_count DESC
         LIMIT 1) AS top_error_category,
    ( SELECT eb.error_count
           FROM error_breakdown eb
          WHERE ((eb.payment_provider = ps.payment_provider) AND (eb.currency = ps.currency))
          ORDER BY eb.error_count DESC
         LIMIT 1) AS top_error_count
   FROM payment_stats ps
  WITH NO DATA;


--
-- TOC entry 372 (class 1259 OID 69653)
-- Name: oauth_exchange_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_exchange_idempotency (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    result jsonb NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval),
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.oauth_exchange_idempotency FORCE ROW LEVEL SECURITY;


--
-- TOC entry 371 (class 1259 OID 69640)
-- Name: oauth_state_nonces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_state_nonces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nonce character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    code_verifier character varying(255),
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
    consumed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.oauth_state_nonces FORCE ROW LEVEL SECURITY;


--
-- TOC entry 282 (class 1259 OID 17452)
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    user_id uuid,
    role character varying(50) DEFAULT 'member'::character varying,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone
);


--
-- TOC entry 6786 (class 0 OID 0)
-- Dependencies: 282
-- Name: TABLE organization_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_members IS 'Members of organizations with roles';


--
-- TOC entry 6787 (class 0 OID 0)
-- Dependencies: 282
-- Name: COLUMN organization_members.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_members.role IS 'Member role (owner, admin, member, viewer)';


--
-- TOC entry 283 (class 1259 OID 17458)
-- Name: organization_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_usage (
    organization_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    metric_name character varying(50) NOT NULL,
    metric_value integer
);


--
-- TOC entry 6788 (class 0 OID 0)
-- Dependencies: 283
-- Name: TABLE organization_usage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_usage IS 'Usage tracking at organization level';


--
-- TOC entry 284 (class 1259 OID 17461)
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255),
    owner_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subscription_tier text DEFAULT 'free'::text,
    subscription_status text DEFAULT 'active'::text,
    CONSTRAINT check_subscription_status CHECK ((subscription_status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'canceled'::text]))),
    CONSTRAINT check_subscription_tier CHECK ((subscription_tier = ANY (ARRAY['free'::text, 'starter'::text, 'growth'::text, 'scale'::text])))
);


--
-- TOC entry 6789 (class 0 OID 0)
-- Dependencies: 284
-- Name: TABLE organizations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organizations IS 'Team/organization accounts';


--
-- TOC entry 285 (class 1259 OID 17481)
-- Name: plan_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_change_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    old_plan text,
    new_plan text NOT NULL,
    change_reason text,
    effective_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    usage_preserved jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ONLY public.plan_change_log FORCE ROW LEVEL SECURITY;


--
-- TOC entry 286 (class 1259 OID 17490)
-- Name: plan_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_limits (
    plan_name text NOT NULL,
    max_projects public.usage_limit NOT NULL,
    max_ai_generations_per_month public.usage_limit NOT NULL,
    max_exports_per_month public.usage_limit NOT NULL,
    max_storage_mb public.usage_limit NOT NULL,
    features jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT plan_limits_plan_name_check CHECK ((plan_name = ANY (ARRAY['free'::text, 'starter'::text, 'growth'::text, 'scale'::text])))
);


--
-- TOC entry 6790 (class 0 OID 0)
-- Dependencies: 286
-- Name: TABLE plan_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.plan_limits IS 'Defines limits for each subscription plan. -1 = unlimited';


--
-- TOC entry 422 (class 1259 OID 91598)
-- Name: pricing_catalog_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_catalog_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_tag text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    rollover_days integer DEFAULT 90 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 6791 (class 0 OID 0)
-- Dependencies: 422
-- Name: TABLE pricing_catalog_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_catalog_versions IS 'Versioned pricing catalog with only one active version at a time';


--
-- TOC entry 6792 (class 0 OID 0)
-- Dependencies: 422
-- Name: COLUMN pricing_catalog_versions.version_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_catalog_versions.version_tag IS 'Human-readable version identifier (e.g. 2025-09-01)';


--
-- TOC entry 6793 (class 0 OID 0)
-- Dependencies: 422
-- Name: COLUMN pricing_catalog_versions.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_catalog_versions.is_active IS 'Only one version can be active at a time';


--
-- TOC entry 429 (class 1259 OID 92016)
-- Name: processed_payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_provider public.payment_provider_key NOT NULL,
    provider_event_id text NOT NULL,
    received_at timestamp with time zone DEFAULT now(),
    raw_payload jsonb NOT NULL,
    signature_headers jsonb NOT NULL,
    processed boolean DEFAULT false,
    processing_error text,
    replay_requested boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 6794 (class 0 OID 0)
-- Dependencies: 429
-- Name: TABLE processed_payment_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.processed_payment_events IS 'Multi-provider webhook event tracking with replay support';


--
-- TOC entry 6795 (class 0 OID 0)
-- Dependencies: 429
-- Name: COLUMN processed_payment_events.replay_requested; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.processed_payment_events.replay_requested IS 'Flag for manual webhook replays by admin';


--
-- TOC entry 388 (class 1259 OID 81424)
-- Name: processed_stripe_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_stripe_events (
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    user_id uuid,
    correlation_id text,
    processed_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 6796 (class 0 OID 0)
-- Dependencies: 388
-- Name: TABLE processed_stripe_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.processed_stripe_events IS 'Webhook deduplication table. Prevents duplicate processing of Stripe events using atomic insert operations.';


--
-- TOC entry 386 (class 1259 OID 81043)
-- Name: project_advisors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_advisors (
    project_id uuid NOT NULL,
    advisor_id uuid NOT NULL,
    status text NOT NULL,
    added_by uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_advisors_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'removed'::text])))
);


--
-- TOC entry 327 (class 1259 OID 27992)
-- Name: project_build_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_build_events (
    id integer NOT NULL,
    build_id character varying(64) NOT NULL,
    event_type character varying(50) NOT NULL,
    event_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    user_id uuid,
    user_visible boolean DEFAULT true,
    internal_data jsonb,
    event_phase character varying(20),
    event_title character varying(200),
    event_description text,
    overall_progress numeric(3,2),
    finished boolean DEFAULT false,
    preview_url text,
    error_message text,
    duration_seconds numeric(8,2),
    error_code text,
    error_params jsonb,
    user_error_message text,
    event_code character varying(100),
    event_params jsonb,
    CONSTRAINT project_build_events_overall_progress_check CHECK (((overall_progress >= 0.0) AND (overall_progress <= 1.0)))
);


--
-- TOC entry 6797 (class 0 OID 0)
-- Dependencies: 327
-- Name: TABLE project_build_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_build_events IS 'Stores all build progress events for polling and real-time updates. 
Events are user-scoped for security. Optimized indexes support:
- User dashboard queries (user_id, created_at DESC)
- Single build tracking (build_id)
- Real-time subscriptions (build_id, user_id, created_at DESC)
- Analytics queries (user_id, event_type, created_at DESC)';


--
-- TOC entry 6798 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.user_id IS 'User ID who owns this build - required for RLS policies and user-specific real-time subscriptions';


--
-- TOC entry 6799 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.user_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.user_visible IS 'Whether this event should be visible to end users (vs internal only)';


--
-- TOC entry 6800 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.internal_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.internal_data IS 'Sensitive internal data for debugging (file paths, system details, etc.)';


--
-- TOC entry 6801 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.event_phase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.event_phase IS 'Build phase: setup, development, dependencies, build, deploy';


--
-- TOC entry 6802 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.event_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.event_title IS 'Clean, user-friendly event title (no emojis or technical details)';


--
-- TOC entry 6803 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.event_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.event_description IS 'User-friendly description of what is happening';


--
-- TOC entry 6804 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.overall_progress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.overall_progress IS 'Overall build progress from 0.0 to 1.0 for progress bar';


--
-- TOC entry 6805 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.finished; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.finished IS 'Whether this event represents completion of the entire build';


--
-- TOC entry 6806 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.preview_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.preview_url IS 'Preview URL when build is completed';


--
-- TOC entry 6807 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.error_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.error_message IS 'Clean, user-friendly error message (no stack traces)';


--
-- TOC entry 6808 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.duration_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.duration_seconds IS 'How long this step took in seconds';


--
-- TOC entry 6809 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.error_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.error_code IS 'Structured error code for internationalization (e.g., AI_LIMIT_REACHED, NETWORK_TIMEOUT)';


--
-- TOC entry 6810 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.error_params; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.error_params IS 'JSON parameters for error context (e.g., {resetTime: 1754636400})';


--
-- TOC entry 6811 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.user_error_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.user_error_message IS 'User-friendly error message for legacy clients (will be deprecated in favor of error_code)';


--
-- TOC entry 6812 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.event_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.event_code IS 'Structured event code for i18n (BUILD_STARTED, BUILD_FAILED, etc.)';


--
-- TOC entry 6813 (class 0 OID 0)
-- Dependencies: 327
-- Name: COLUMN project_build_events.event_params; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_build_events.event_params IS 'Raw primitive parameters for i18n message interpolation (JSON)';


--
-- TOC entry 335 (class 1259 OID 33830)
-- Name: project_build_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_build_metrics (
    id integer NOT NULL,
    build_id character varying(64) NOT NULL,
    version_id character(26) NOT NULL,
    project_id character varying(255) NOT NULL,
    user_id character varying(255) NOT NULL,
    is_initial_build boolean DEFAULT true,
    is_update boolean DEFAULT false,
    is_retry boolean DEFAULT false,
    attempt_number integer DEFAULT 1,
    parent_build_id character varying(64),
    status character varying(20) NOT NULL,
    failure_stage character varying(50),
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    total_duration_ms integer,
    framework character varying(50),
    detected_framework character varying(50),
    node_version character varying(20),
    package_manager character varying(20),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    total_duration_min numeric(10,2) GENERATED ALWAYS AS (round(((total_duration_ms)::numeric / (60000)::numeric), 2)) STORED
);

ALTER TABLE ONLY public.project_build_metrics FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6814 (class 0 OID 0)
-- Dependencies: 335
-- Name: TABLE project_build_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_build_metrics IS 'Core metrics for each build attempt including timing and status';


--
-- TOC entry 334 (class 1259 OID 33829)
-- Name: project_build_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_build_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6815 (class 0 OID 0)
-- Dependencies: 334
-- Name: project_build_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_build_metrics_id_seq OWNED BY public.project_build_metrics.id;


--
-- TOC entry 325 (class 1259 OID 26811)
-- Name: project_build_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_build_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    build_id text NOT NULL,
    user_id text NOT NULL,
    project_id text NOT NULL,
    prompt text NOT NULL,
    status text NOT NULL,
    plan_id text,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    error text,
    metrics jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT worker_build_records_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'executing'::text, 'completed'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.project_build_records FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6816 (class 0 OID 0)
-- Dependencies: 325
-- Name: TABLE project_build_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_build_records IS 'Overall build tracking with metrics';


--
-- TOC entry 384 (class 1259 OID 81008)
-- Name: project_chat_last_read; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chat_last_read (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_seq bigint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 364 (class 1259 OID 53644)
-- Name: project_chat_plan_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chat_plan_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255) NOT NULL,
    project_id character varying(255) NOT NULL,
    session_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_active timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    message_count integer DEFAULT 0,
    total_tokens_used integer DEFAULT 0,
    total_ai_seconds_consumed integer DEFAULT 0,
    total_cost_usd numeric(10,6) DEFAULT 0,
    status character varying(50) DEFAULT 'active'::character varying,
    converted_to_build_id character varying(64),
    conversion_prompt text,
    metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.project_chat_plan_sessions FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6817 (class 0 OID 0)
-- Dependencies: 364
-- Name: TABLE project_chat_plan_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_chat_plan_sessions IS 'Tracks chat plan mode sessions for billing and conversion tracking';


--
-- TOC entry 6818 (class 0 OID 0)
-- Dependencies: 364
-- Name: COLUMN project_chat_plan_sessions.session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_plan_sessions.session_id IS 'Claude CLI session ID for resumption';


--
-- TOC entry 6819 (class 0 OID 0)
-- Dependencies: 364
-- Name: COLUMN project_chat_plan_sessions.total_ai_seconds_consumed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_plan_sessions.total_ai_seconds_consumed IS 'Total AI processing time for billing';


--
-- TOC entry 6820 (class 0 OID 0)
-- Dependencies: 364
-- Name: COLUMN project_chat_plan_sessions.converted_to_build_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_chat_plan_sessions.converted_to_build_id IS 'Links to build if session was converted';


--
-- TOC entry 383 (class 1259 OID 80992)
-- Name: project_chat_read_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chat_read_receipts (
    project_id uuid NOT NULL,
    message_id bigint NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 382 (class 1259 OID 80915)
-- Name: project_chat_seq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chat_seq (
    project_id uuid NOT NULL,
    last_seq bigint DEFAULT 0 NOT NULL
);


--
-- TOC entry 366 (class 1259 OID 53676)
-- Name: project_chat_with_builds; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.project_chat_with_builds AS
 SELECT pcl.id,
    pcl.project_id,
    pcl.user_id,
    pcl.request_id,
    pcl.correlation_id,
    pcl.mode,
    pcl.session_id,
    pcl.message_text,
    pcl.message_type,
    pcl.build_id,
    pcl.build_triggered,
    pcl.user_agent,
    pcl.ip_address,
    pcl.created_at,
    pcl.response_data,
    pcl.chat_mode,
    pcl.parent_message_id,
    pcl.version_id,
    pcl.tokens_used,
    pcl.duration_ms,
    pcl.billable_seconds,
    pcl.ai_session_id,
    pcl.ai_tracking_id,
    pcl.converted_from_session_id,
    pcl.timeline_seq,
    pcl.locale,
    pcl.language,
    pcl.is_visible,
        CASE
            WHEN ((pcl.response_data ->> 'type'::text) = 'build_reference'::text) THEN ( SELECT json_agg(pbe.* ORDER BY pbe.created_at) AS json_agg
               FROM public.project_build_events pbe
              WHERE (((pbe.build_id)::text = pcl.build_id) AND (pbe.user_visible = true)))
            ELSE NULL::json
        END AS build_events
   FROM public.project_chat_log_minimal pcl
  WHERE (pcl.is_visible = true)
  ORDER BY pcl.timeline_seq;


--
-- TOC entry 6821 (class 0 OID 0)
-- Dependencies: 366
-- Name: VIEW project_chat_with_builds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.project_chat_with_builds IS 'Chat messages enriched with build event data for build_reference rows';


--
-- TOC entry 287 (class 1259 OID 17499)
-- Name: project_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT project_collaborators_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))
);


--
-- TOC entry 374 (class 1259 OID 69771)
-- Name: project_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    type public.integration_type NOT NULL,
    status public.integration_status DEFAULT 'connected'::public.integration_status NOT NULL,
    connection_id uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone,
    error_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.project_integrations FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6822 (class 0 OID 0)
-- Dependencies: 374
-- Name: TABLE project_integrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_integrations IS 'Centralized registry for all project integrations (Supabase, Sanity, Stripe, etc.)';


--
-- TOC entry 6823 (class 0 OID 0)
-- Dependencies: 374
-- Name: COLUMN project_integrations.connection_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_integrations.connection_id IS 'Soft FK to integration-specific connection table (e.g., supabase_connections.id)';


--
-- TOC entry 6824 (class 0 OID 0)
-- Dependencies: 374
-- Name: COLUMN project_integrations.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_integrations.metadata IS 'Integration-specific data (project refs, dataset names, etc.)';


--
-- TOC entry 385 (class 1259 OID 81024)
-- Name: project_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_memberships (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text, 'advisor'::text, 'assistant'::text])))
);


--
-- TOC entry 342 (class 1259 OID 33889)
-- Name: project_metrics_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_metrics_summary (
    project_id character varying(255) NOT NULL,
    user_id character varying(255) NOT NULL,
    project_started date NOT NULL,
    total_builds integer DEFAULT 0,
    successful_builds integer DEFAULT 0,
    failed_builds integer DEFAULT 0,
    success_rate numeric(5,2),
    avg_total_duration_sec numeric(10,2),
    avg_ai_duration_sec numeric(10,2),
    avg_install_duration_sec numeric(10,2),
    avg_build_duration_sec numeric(10,2),
    avg_deploy_duration_sec numeric(10,2),
    total_cost_usd numeric(10,4),
    avg_cost_per_build_usd numeric(10,4),
    total_tokens_used bigint,
    total_errors_encountered integer DEFAULT 0,
    total_errors_fixed integer DEFAULT 0,
    error_fix_rate numeric(5,2),
    most_common_error_type character varying(50),
    build_cache_hit_rate numeric(5,2),
    install_skip_rate numeric(5,2),
    total_files_created integer DEFAULT 0,
    total_files_modified integer DEFAULT 0,
    avg_output_size_mb numeric(10,2),
    id integer NOT NULL,
    project_last_updated timestamp with time zone,
    total_duration_sec numeric(10,2),
    total_duration_min numeric(10,2),
    date date DEFAULT CURRENT_DATE NOT NULL
);

ALTER TABLE ONLY public.project_metrics_summary FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6825 (class 0 OID 0)
-- Dependencies: 342
-- Name: TABLE project_metrics_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_metrics_summary IS 'Daily aggregated metrics per project for quick analytics';


--
-- TOC entry 6826 (class 0 OID 0)
-- Dependencies: 342
-- Name: COLUMN project_metrics_summary.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_metrics_summary.id IS 'Primary key for row identification and management';


--
-- TOC entry 343 (class 1259 OID 33986)
-- Name: project_metrics_summary_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_metrics_summary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6827 (class 0 OID 0)
-- Dependencies: 343
-- Name: project_metrics_summary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_metrics_summary_id_seq OWNED BY public.project_metrics_summary.id;


--
-- TOC entry 355 (class 1259 OID 45146)
-- Name: project_published_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_published_domains (
    project_id uuid NOT NULL,
    domain_name character varying(255) NOT NULL,
    domain_type character varying(20) DEFAULT 'sheenapps'::character varying,
    is_primary boolean DEFAULT false,
    ssl_status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_ssl_checked_at timestamp with time zone,
    last_dns_checked_at timestamp with time zone,
    ssl_error_message text,
    dns_error_message text,
    CONSTRAINT check_ssl_status CHECK (((ssl_status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'failed'::character varying])::text[])))
);

ALTER TABLE ONLY public.project_published_domains FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6828 (class 0 OID 0)
-- Dependencies: 355
-- Name: TABLE project_published_domains; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_published_domains IS 'Manages custom domains and sheenapps.com subdomains for published projects';


--
-- TOC entry 332 (class 1259 OID 31442)
-- Name: project_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id character varying(255) NOT NULL,
    version_id character varying(32) NOT NULL,
    recommendations jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    build_id character varying(64),
    user_id character varying(255)
);

ALTER TABLE ONLY public.project_recommendations FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6829 (class 0 OID 0)
-- Dependencies: 332
-- Name: TABLE project_recommendations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_recommendations IS 'Stores AI-generated recommendations for next features to add to projects';


--
-- TOC entry 6830 (class 0 OID 0)
-- Dependencies: 332
-- Name: COLUMN project_recommendations.recommendations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_recommendations.recommendations IS 'Standardized array of recommendation objects with: id, title, description, category, priority, complexity, impact, versionHint, prompt, and optional legacy fields (files, steps, legacy_id)';


--
-- TOC entry 6831 (class 0 OID 0)
-- Dependencies: 332
-- Name: COLUMN project_recommendations.build_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_recommendations.build_id IS 'Build ID for direct lookup from frontend (temporary identifier during build process)';


--
-- TOC entry 6832 (class 0 OID 0)
-- Dependencies: 332
-- Name: COLUMN project_recommendations.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_recommendations.user_id IS 'User ID for direct user-based filtering and security isolation';


--
-- TOC entry 365 (class 1259 OID 53671)
-- Name: project_timeline; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.project_timeline AS
 SELECT pcl.id,
    pcl.project_id,
    pcl.user_id,
    pcl.created_at,
    pcl.timeline_seq,
    pcl.mode,
    pcl.chat_mode,
    pcl.message_text,
    pcl.message_type,
    pcl.response_data,
    pcl.build_id,
    pcl.version_id,
    pcl.session_id,
    pcl.locale,
    pcl.language,
    pv.preview_url,
    pv.status AS version_status,
    pv.artifact_url,
    pbm.status AS build_status,
    pbm.total_duration_ms AS build_duration,
        CASE
            WHEN ((pcl.mode = 'build'::text) AND (pv.id IS NOT NULL)) THEN 'deployed'::text
            WHEN ((pcl.mode = 'build'::text) AND ((pbm.status)::text = 'failed'::text)) THEN 'failed'::text
            WHEN ((pcl.mode = 'build'::text) AND ((pbm.status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying])::text[]))) THEN 'in_progress'::text
            WHEN (pcl.mode = 'plan'::text) THEN 'planning'::text
            ELSE 'unknown'::text
        END AS timeline_status
   FROM ((public.project_chat_log_minimal pcl
     LEFT JOIN public.project_versions pv ON ((pv.version_id = pcl.version_id)))
     LEFT JOIN public.project_build_metrics pbm ON (((pbm.build_id)::text = pcl.build_id)))
  WHERE (pcl.is_visible = true)
  ORDER BY pcl.timeline_seq DESC;


--
-- TOC entry 6833 (class 0 OID 0)
-- Dependencies: 365
-- Name: VIEW project_timeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.project_timeline IS 'Unified timeline view combining chat messages, builds, and deployments';


--
-- TOC entry 358 (class 1259 OID 47628)
-- Name: project_versions_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_versions_backup (
    id uuid,
    user_id text,
    project_id text,
    version_id text,
    prompt text,
    parent_version_id text,
    preview_url text,
    artifact_url text,
    framework text,
    build_duration_ms integer,
    install_duration_ms integer,
    deploy_duration_ms integer,
    output_size_bytes integer,
    ai_json jsonb,
    status text,
    needs_rebuild boolean,
    base_snapshot_id text,
    cf_deployment_id text,
    node_version text,
    pnpm_version text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    version_metadata_id character(26),
    enhanced_prompt text,
    prompt_metadata jsonb,
    ai_session_id text,
    ai_session_created_at timestamp without time zone,
    ai_session_last_used_at timestamp without time zone,
    artifact_size bigint,
    artifact_checksum character varying(64)
);

ALTER TABLE ONLY public.project_versions_backup FORCE ROW LEVEL SECURITY;


--
-- TOC entry 333 (class 1259 OID 33741)
-- Name: project_versions_metadata-delete; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."project_versions_metadata-delete" (
    version_id character(26) NOT NULL,
    project_id character varying(255) NOT NULL,
    user_id character varying(255) NOT NULL,
    major_version integer DEFAULT 1 NOT NULL,
    minor_version integer DEFAULT 0 NOT NULL,
    patch_version integer DEFAULT 0 NOT NULL,
    prerelease character varying(50),
    version_name character varying(100),
    version_description text,
    change_type character varying(10) NOT NULL,
    breaking_risk character varying(10),
    auto_classified boolean DEFAULT true,
    classification_confidence numeric(3,2),
    classification_reasoning text,
    parent_version_id character(26),
    base_version_id character(26),
    from_recommendation_id integer,
    files_changed integer DEFAULT 0,
    lines_added integer DEFAULT 0,
    lines_removed integer DEFAULT 0,
    build_duration_ms integer,
    total_files integer,
    git_commit_sha character varying(40),
    git_tag character varying(50),
    schema_version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deployed_at timestamp with time zone,
    is_published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    published_by_user_id uuid,
    soft_deleted_at timestamp with time zone,
    superseded_by_version_id character(26),
    rollback_source_version_id character(26),
    rollback_target_version_id character(26),
    user_comment text,
    artifact_sha256 character varying(64),
    CONSTRAINT check_semver_format CHECK (((version_name)::text ~ '^\\d+\\.\\d+\\.\\d+(-[A-Za-z0-9]+)?$'::text))
);


--
-- TOC entry 6834 (class 0 OID 0)
-- Dependencies: 333
-- Name: TABLE "project_versions_metadata-delete"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."project_versions_metadata-delete" IS 'Stores semantic versioning and classification data for project versions';


--
-- TOC entry 6835 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".version_id IS 'ULID checkpoint identifier for instant rollback';


--
-- TOC entry 6836 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".change_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".change_type IS 'Version bump type: patch (fixes), minor (features), major (breaking), rollback';


--
-- TOC entry 6837 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".breaking_risk; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".breaking_risk IS 'Risk assessment: none, low (config), medium (deps), high (API/schema)';


--
-- TOC entry 6838 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".auto_classified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".auto_classified IS 'True if Claude classified, false if user overrode';


--
-- TOC entry 6839 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".is_published; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".is_published IS 'True if this version is currently published and live';


--
-- TOC entry 6840 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".published_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".published_at IS 'Timestamp when version was published';


--
-- TOC entry 6841 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".published_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".published_by_user_id IS 'User who published this version';


--
-- TOC entry 6842 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".user_comment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".user_comment IS 'Optional user comment explaining the version changes';


--
-- TOC entry 6843 (class 0 OID 0)
-- Dependencies: 333
-- Name: COLUMN "project_versions_metadata-delete".artifact_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."project_versions_metadata-delete".artifact_sha256 IS 'SHA256 hash of the artifact ZIP file for integrity verification and drift detection. Used by .sheenapps-project/active-artifact marker system.';


--
-- TOC entry 359 (class 1259 OID 47633)
-- Name: project_versions_metadata_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_versions_metadata_backup (
    version_id character(26),
    project_id character varying(255),
    user_id character varying(255),
    major_version integer,
    minor_version integer,
    patch_version integer,
    prerelease character varying(50),
    version_name character varying(100),
    version_description text,
    change_type character varying(10),
    breaking_risk character varying(10),
    auto_classified boolean,
    classification_confidence numeric(3,2),
    classification_reasoning text,
    parent_version_id character(26),
    base_version_id character(26),
    from_recommendation_id integer,
    files_changed integer,
    lines_added integer,
    lines_removed integer,
    build_duration_ms integer,
    total_files integer,
    git_commit_sha character varying(40),
    git_tag character varying(50),
    schema_version integer,
    created_at timestamp with time zone,
    deployed_at timestamp with time zone,
    is_published boolean,
    published_at timestamp with time zone,
    published_by_user_id uuid,
    soft_deleted_at timestamp with time zone,
    superseded_by_version_id character(26),
    rollback_source_version_id character(26),
    rollback_target_version_id character(26),
    user_comment text,
    artifact_sha256 character varying(64)
);

ALTER TABLE ONLY public.project_versions_metadata_backup FORCE ROW LEVEL SECURITY;


--
-- TOC entry 288 (class 1259 OID 17510)
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    name text NOT NULL,
    subdomain text,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    last_accessed_at timestamp with time zone,
    thumbnail_url text,
    build_status public.build_status DEFAULT 'queued'::public.build_status NOT NULL,
    current_build_id character varying(64),
    current_version_id text,
    framework character varying(16) DEFAULT 'react'::character varying NOT NULL,
    preview_url text,
    last_build_started timestamp with time zone,
    last_build_completed timestamp with time zone,
    published_version_id character(26),
    current_version_name text,
    created_by_service character varying(50) DEFAULT 'worker-service'::character varying NOT NULL,
    last_ai_session_id character varying(255),
    last_ai_session_updated_at timestamp with time zone,
    chat_preferences jsonb DEFAULT '{"buildImmediately": true}'::jsonb,
    org_id uuid,
    deployment_lane character varying(20),
    deployment_lane_detected_at timestamp with time zone,
    deployment_lane_detection_origin character varying(10),
    deployment_lane_reasons text[],
    deployment_lane_switched boolean DEFAULT false,
    deployment_lane_switch_reason text,
    github_repo_owner character varying(255),
    github_repo_name character varying(255),
    github_default_branch character varying(255) DEFAULT 'main'::character varying,
    github_installation_id bigint,
    github_sync_enabled boolean DEFAULT false,
    github_sync_mode character varying(20) DEFAULT 'protected_pr'::character varying,
    github_webhook_secret character varying(255),
    last_remote_main_sha character varying(64),
    last_synced_main_sha character varying(64),
    last_outbound_base_sha character varying(64),
    last_github_sync_at timestamp with time zone,
    github_repo_id bigint,
    github_repo_full_name text GENERATED ALWAYS AS (
CASE
    WHEN ((github_repo_owner IS NOT NULL) AND (github_repo_name IS NOT NULL)) THEN (((github_repo_owner)::text || '/'::text) || (github_repo_name)::text)
    ELSE NULL::text
END) STORED,
    CONSTRAINT chk_projects_deployment_lane CHECK (((deployment_lane)::text = ANY ((ARRAY['pages-static'::character varying, 'pages-edge'::character varying, 'workers-node'::character varying])::text[]))),
    CONSTRAINT chk_projects_deployment_lane_origin CHECK (((deployment_lane_detection_origin)::text = ANY ((ARRAY['detection'::character varying, 'manual'::character varying, 'fallback'::character varying])::text[]))),
    CONSTRAINT projects_build_timing_logical CHECK (((last_build_completed IS NULL) OR (last_build_started IS NULL) OR (last_build_completed >= last_build_started))),
    CONSTRAINT projects_framework_valid CHECK (((framework)::text = ANY ((ARRAY['react'::character varying, 'nextjs'::character varying, 'vue'::character varying, 'svelte'::character varying])::text[]))),
    CONSTRAINT projects_github_sync_enabled_ck CHECK (((github_sync_enabled = false) OR ((github_repo_owner IS NOT NULL) AND (github_repo_name IS NOT NULL) AND (github_installation_id IS NOT NULL)))),
    CONSTRAINT projects_preview_url_format CHECK (((preview_url IS NULL) OR (preview_url ~* '^https?://'::text))),
    CONSTRAINT projects_sha_ck CHECK ((((last_remote_main_sha IS NULL) OR ((last_remote_main_sha)::text ~ '^[0-9a-f]{40,64}$'::text)) AND ((last_synced_main_sha IS NULL) OR ((last_synced_main_sha)::text ~ '^[0-9a-f]{40,64}$'::text)) AND ((last_outbound_base_sha IS NULL) OR ((last_outbound_base_sha)::text ~ '^[0-9a-f]{40,64}$'::text)))),
    CONSTRAINT projects_sync_mode_ck CHECK (((github_sync_mode)::text = ANY ((ARRAY['direct_commit'::character varying, 'protected_pr'::character varying, 'hybrid'::character varying])::text[])))
);


--
-- TOC entry 6844 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.config IS 'Remaining configuration data not promoted to dedicated columns';


--
-- TOC entry 6845 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.archived_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.archived_at IS 'Timestamp when project was archived (NULL = active)';


--
-- TOC entry 6846 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.last_accessed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.last_accessed_at IS 'Last time project was opened in builder';


--
-- TOC entry 6847 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.thumbnail_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.thumbnail_url IS 'URL to project thumbnail image for dashboard cards';


--
-- TOC entry 6848 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.build_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.build_status IS 'Current build status: queued, building, deployed, failed, canceled, superseded';


--
-- TOC entry 6849 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.current_build_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.current_build_id IS 'ID of the currently active build (FK to project_build_metrics.build_id)';


--
-- TOC entry 6850 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.current_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.current_version_id IS 'UUID of the current project version (FK to project_versions.version_id)';


--
-- TOC entry 6851 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.framework; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.framework IS 'Frontend framework: react, nextjs, vue, svelte';


--
-- TOC entry 6852 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.published_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.published_version_id IS 'Denormalized reference to currently published version for fast queries';


--
-- TOC entry 6853 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.current_version_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.current_version_name IS 'Human-readable name of the current version (e.g., "v1.2.3" or custom name)';


--
-- TOC entry 6854 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.last_ai_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.last_ai_session_id IS 'Last AI (Claude CLI) session ID for context continuity';


--
-- TOC entry 6855 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.last_ai_session_updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.last_ai_session_updated_at IS 'Timestamp when AI session was last updated';


--
-- TOC entry 6856 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.chat_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.chat_preferences IS 'User chat mode preferences including buildImmediately toggle';


--
-- TOC entry 6857 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.deployment_lane; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.deployment_lane IS 'Cloudflare deployment lane: pages-static, pages-edge, or workers-node';


--
-- TOC entry 6858 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.deployment_lane_detected_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.deployment_lane_detected_at IS 'When the deployment lane was last detected/selected';


--
-- TOC entry 6859 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.deployment_lane_detection_origin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.deployment_lane_detection_origin IS 'How the lane was selected: manual override, automatic detection, or fallback deployment';


--
-- TOC entry 6860 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.deployment_lane_reasons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.deployment_lane_reasons IS 'Array of reasons why this deployment lane was selected';


--
-- TOC entry 6861 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.deployment_lane_switched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.deployment_lane_switched IS 'Whether the deployment target was switched during deployment';


--
-- TOC entry 6862 (class 0 OID 0)
-- Dependencies: 288
-- Name: COLUMN projects.deployment_lane_switch_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.deployment_lane_switch_reason IS 'Reason for deployment target switch (e.g., build log analysis)';


--
-- TOC entry 419 (class 1259 OID 91457)
-- Name: promotion_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    promotion_code_id uuid NOT NULL,
    reservation_id uuid,
    user_id uuid NOT NULL,
    gateway public.payment_provider_key NOT NULL,
    event_id text,
    discount_applied_amount integer NOT NULL,
    original_amount integer NOT NULL,
    final_amount integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    stripe_payment_intent_id text,
    stripe_session_id text,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_transaction_id text,
    exchange_rate numeric(10,6),
    exchange_rate_date date,
    exchange_rate_source text,
    base_currency_amount_cents integer,
    committed_at timestamp with time zone,
    evaluated_threshold_minor integer,
    evaluated_exchange_rate numeric(10,6),
    CONSTRAINT promotion_redemptions_amounts_positive CHECK (((discount_applied_amount > 0) AND (original_amount > 0) AND (final_amount >= 0))),
    CONSTRAINT promotion_redemptions_discount_valid CHECK (((discount_applied_amount <= original_amount) AND (final_amount = (original_amount - discount_applied_amount))))
);


--
-- TOC entry 6863 (class 0 OID 0)
-- Dependencies: 419
-- Name: TABLE promotion_redemptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotion_redemptions IS 'Immutable audit trail of successful promotion usage. Complete payment integration tracking.';


--
-- TOC entry 6864 (class 0 OID 0)
-- Dependencies: 419
-- Name: COLUMN promotion_redemptions.exchange_rate_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotion_redemptions.exchange_rate_source IS 'Source of exchange rate (stripe, ecb, etc) for audit trail';


--
-- TOC entry 6865 (class 0 OID 0)
-- Dependencies: 419
-- Name: COLUMN promotion_redemptions.evaluated_threshold_minor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotion_redemptions.evaluated_threshold_minor IS 'Minimum order threshold at time of validation for audit';


--
-- TOC entry 418 (class 1259 OID 91423)
-- Name: promotion_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    promotion_code_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.reservation_status DEFAULT 'reserved'::public.reservation_status NOT NULL,
    cart_hash text NOT NULL,
    reserved_amount integer NOT NULL,
    currency text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    committed_at timestamp with time zone,
    stripe_payment_intent_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    evaluated_threshold_minor integer,
    evaluated_exchange_rate numeric(10,6),
    provider_context jsonb,
    CONSTRAINT promotion_reservations_amount_positive CHECK ((reserved_amount > 0)),
    CONSTRAINT promotion_reservations_commit_logic CHECK ((((status = 'committed'::public.reservation_status) AND (committed_at IS NOT NULL)) OR ((status <> 'committed'::public.reservation_status) AND (committed_at IS NULL)))),
    CONSTRAINT promotion_reservations_expires_future CHECK ((expires_at > created_at))
);


--
-- TOC entry 6866 (class 0 OID 0)
-- Dependencies: 418
-- Name: TABLE promotion_reservations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotion_reservations IS 'Reserve-commit pattern for atomic usage tracking. Prevents race conditions in high-traffic scenarios.';


--
-- TOC entry 415 (class 1259 OID 91349)
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    discount_type public.promotion_discount_type NOT NULL,
    discount_value integer NOT NULL,
    currency text,
    max_total_uses integer,
    max_uses_per_user integer DEFAULT 1,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    status public.promotion_status DEFAULT 'active'::public.promotion_status NOT NULL,
    created_by uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supported_providers public.payment_provider_key[],
    supported_currencies text[],
    regional_restrictions jsonb,
    checkout_type_restrictions public.checkout_type[],
    minimum_order_minor_units integer,
    minimum_order_currency character(3),
    CONSTRAINT promotions_checkout_types_not_empty CHECK (((checkout_type_restrictions IS NULL) OR (cardinality(checkout_type_restrictions) > 0))),
    CONSTRAINT promotions_currency_consistency CHECK ((((discount_type = 'percentage'::public.promotion_discount_type) AND (currency IS NULL) AND (supported_currencies IS NULL)) OR ((discount_type = 'fixed_amount'::public.promotion_discount_type) AND (currency IS NOT NULL) AND (currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'SAR'::text])) AND ((supported_currencies IS NULL) OR (currency = ANY (supported_currencies)))))),
    CONSTRAINT promotions_currency_upper_guard CHECK (((currency IS NULL) OR (currency = upper(currency)))),
    CONSTRAINT promotions_currency_uppercase CHECK (((currency IS NULL) OR (currency = upper(currency)))),
    CONSTRAINT promotions_discount_value_positive CHECK ((discount_value > 0)),
    CONSTRAINT promotions_min_order_consistency CHECK ((((minimum_order_minor_units IS NULL) AND (minimum_order_currency IS NULL)) OR ((minimum_order_minor_units IS NOT NULL) AND (minimum_order_minor_units >= 0) AND (minimum_order_currency = ANY (ARRAY['USD'::bpchar, 'EUR'::bpchar, 'GBP'::bpchar, 'EGP'::bpchar, 'SAR'::bpchar])) AND ((minimum_order_currency)::text = upper((minimum_order_currency)::text))))),
    CONSTRAINT promotions_no_empty_arrays CHECK ((((supported_providers IS NULL) OR (cardinality(supported_providers) > 0)) AND ((supported_currencies IS NULL) OR (cardinality(supported_currencies) > 0)) AND ((checkout_type_restrictions IS NULL) OR (cardinality(checkout_type_restrictions) > 0)))),
    CONSTRAINT promotions_percentage_valid CHECK (((discount_type <> 'percentage'::public.promotion_discount_type) OR (discount_value <= 100))),
    CONSTRAINT promotions_period_valid CHECK (((valid_until IS NULL) OR (valid_until > valid_from))),
    CONSTRAINT promotions_providers_not_empty CHECK (((supported_providers IS NULL) OR (cardinality(supported_providers) > 0))),
    CONSTRAINT promotions_usage_limits_valid CHECK (((max_total_uses IS NULL) OR (max_total_uses > 0))),
    CONSTRAINT promotions_user_limits_valid CHECK (((max_uses_per_user IS NULL) OR (max_uses_per_user > 0))),
    CONSTRAINT valid_currencies CHECK (((supported_currencies IS NULL) OR (supported_currencies <@ ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'SAR'::text]))),
    CONSTRAINT valid_min_order_currency CHECK (((minimum_order_currency IS NULL) OR (minimum_order_currency = ANY (ARRAY['USD'::bpchar, 'EUR'::bpchar, 'GBP'::bpchar, 'EGP'::bpchar, 'SAR'::bpchar]))))
);


--
-- TOC entry 6867 (class 0 OID 0)
-- Dependencies: 415
-- Name: TABLE promotions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotions IS 'Canonical promotion definitions with discount rules and usage limits. Source of truth for all promotion logic.';


--
-- TOC entry 6868 (class 0 OID 0)
-- Dependencies: 415
-- Name: COLUMN promotions.supported_providers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotions.supported_providers IS 'Array of payment providers that can process this promotion';


--
-- TOC entry 6869 (class 0 OID 0)
-- Dependencies: 415
-- Name: COLUMN promotions.supported_currencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotions.supported_currencies IS 'Array of currencies this promotion is valid for';


--
-- TOC entry 6870 (class 0 OID 0)
-- Dependencies: 415
-- Name: COLUMN promotions.checkout_type_restrictions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotions.checkout_type_restrictions IS 'NULL = no restriction (all types allowed). Empty [] would block all checkouts (avoid). Specify types to restrict.';


--
-- TOC entry 6871 (class 0 OID 0)
-- Dependencies: 415
-- Name: CONSTRAINT promotions_checkout_types_not_empty ON promotions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT promotions_checkout_types_not_empty ON public.promotions IS 'Prevents empty array for checkout restrictions - use NULL for unrestricted';


--
-- TOC entry 6872 (class 0 OID 0)
-- Dependencies: 415
-- Name: CONSTRAINT promotions_currency_consistency ON promotions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT promotions_currency_consistency ON public.promotions IS 'Ensures percentage discounts have NULL currency and fixed amounts have valid currency';


--
-- TOC entry 443 (class 1259 OID 94102)
-- Name: promotion_analytics_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.promotion_analytics_dashboard AS
 WITH promotion_stats AS (
         SELECT p.id,
            p.name,
            p.status,
            p.discount_type,
            p.discount_value,
            p.currency,
            p.supported_currencies,
            p.supported_providers,
            p.max_total_uses,
            p.created_at,
            p.valid_from,
            p.valid_until,
            ( SELECT count(DISTINCT r2.user_id) AS count
                   FROM public.promotion_redemptions r2
                  WHERE ((r2.promotion_id = p.id) AND (r2.committed_at IS NOT NULL))) AS unique_users,
            ( SELECT count(*) AS count
                   FROM public.promotion_redemptions r2
                  WHERE ((r2.promotion_id = p.id) AND (r2.committed_at IS NOT NULL))) AS total_redemptions,
            ( SELECT COALESCE(sum(r2.discount_applied_amount), (0)::bigint) AS "coalesce"
                   FROM public.promotion_redemptions r2
                  WHERE ((r2.promotion_id = p.id) AND (r2.committed_at IS NOT NULL))) AS total_discount_given,
            ( SELECT count(*) AS count
                   FROM public.promotion_reservations res
                  WHERE ((res.promotion_id = p.id) AND (res.status = 'reserved'::public.reservation_status) AND (res.expires_at > now()))) AS active_reservations
           FROM public.promotions p
        ), provider_breakdown AS (
         SELECT r.promotion_id,
            jsonb_object_agg((r.gateway)::text, r.redemption_count) AS provider_usage
           FROM ( SELECT promotion_redemptions.promotion_id,
                    promotion_redemptions.gateway,
                    count(*) AS redemption_count
                   FROM public.promotion_redemptions
                  WHERE ((promotion_redemptions.committed_at IS NOT NULL) AND (promotion_redemptions.gateway IS NOT NULL))
                  GROUP BY promotion_redemptions.promotion_id, promotion_redemptions.gateway) r
          GROUP BY r.promotion_id
        ), currency_breakdown AS (
         SELECT r.promotion_id,
            jsonb_object_agg(r.currency, r.redemption_count) AS currency_usage
           FROM ( SELECT promotion_redemptions.promotion_id,
                    promotion_redemptions.currency,
                    count(*) AS redemption_count
                   FROM public.promotion_redemptions
                  WHERE ((promotion_redemptions.committed_at IS NOT NULL) AND (promotion_redemptions.currency IS NOT NULL))
                  GROUP BY promotion_redemptions.promotion_id, promotion_redemptions.currency) r
          GROUP BY r.promotion_id
        )
 SELECT ps.id,
    ps.name,
    ps.status,
    ps.discount_type,
    ps.discount_value,
    ps.currency,
    ps.supported_currencies,
    ps.supported_providers,
    ps.max_total_uses,
    ps.created_at,
    ps.valid_from,
    ps.valid_until,
    ps.unique_users,
    ps.total_redemptions,
    ps.total_discount_given,
    ps.active_reservations,
    pb.provider_usage,
    cb.currency_usage,
        CASE
            WHEN (ps.valid_until < now()) THEN 'expired'::text
            WHEN (ps.valid_from > now()) THEN 'scheduled'::text
            WHEN (ps.status = 'active'::public.promotion_status) THEN 'active'::text
            ELSE (ps.status)::text
        END AS effective_status,
        CASE
            WHEN (ps.supported_currencies IS NOT NULL) THEN ps.supported_currencies
            WHEN (ps.currency IS NOT NULL) THEN ARRAY[ps.currency]
            ELSE NULL::text[]
        END AS effective_currencies,
        CASE
            WHEN (ps.max_total_uses > 0) THEN round(((100.0 * (ps.total_redemptions)::numeric) / (ps.max_total_uses)::numeric), 2)
            ELSE NULL::numeric
        END AS utilization_percentage
   FROM ((promotion_stats ps
     LEFT JOIN provider_breakdown pb ON ((pb.promotion_id = ps.id)))
     LEFT JOIN currency_breakdown cb ON ((cb.promotion_id = ps.id)));


--
-- TOC entry 6873 (class 0 OID 0)
-- Dependencies: 443
-- Name: VIEW promotion_analytics_dashboard; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.promotion_analytics_dashboard IS 'Analytics for promotions (dual-currency model): provider & currency breakdown, utilization, effective status.';


--
-- TOC entry 417 (class 1259 OID 91392)
-- Name: promotion_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    promotion_code_id uuid NOT NULL,
    reservation_id uuid,
    gateway public.payment_provider_key NOT NULL,
    external_coupon_id text,
    external_promotion_code_id text,
    expires_at timestamp with time zone NOT NULL,
    created_for_user uuid,
    created_for_session text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_metadata jsonb,
    checkout_type public.checkout_type,
    CONSTRAINT promotion_artifacts_expires_future CHECK ((expires_at > created_at))
);


--
-- TOC entry 6874 (class 0 OID 0)
-- Dependencies: 417
-- Name: TABLE promotion_artifacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotion_artifacts IS 'Ephemeral gateway artifacts (Stripe coupons/codes) with TTL cleanup. Not source of truth - only integration layer.';


--
-- TOC entry 416 (class 1259 OID 91371)
-- Name: promotion_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    code text NOT NULL,
    code_normalized text GENERATED ALWAYS AS (upper(TRIM(BOTH FROM code))) STORED,
    max_uses integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_codes_max_uses_valid CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT promotion_codes_no_whitespace CHECK ((code = TRIM(BOTH FROM code)))
);


--
-- TOC entry 6875 (class 0 OID 0)
-- Dependencies: 416
-- Name: TABLE promotion_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotion_codes IS 'Human-readable codes that reference promotions. Supports case-insensitive matching via generated column.';


--
-- TOC entry 6876 (class 0 OID 0)
-- Dependencies: 416
-- Name: COLUMN promotion_codes.code_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotion_codes.code_normalized IS 'Normalized using UPPER(TRIM(code)) for case-insensitive matching. Users enter \"Summer2025\", stored as \"SUMMER2025\"';


--
-- TOC entry 421 (class 1259 OID 91505)
-- Name: promotion_code_usage_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.promotion_code_usage_stats AS
 SELECT pc.id AS promotion_code_id,
    pc.code,
    pc.promotion_id,
    pc.max_uses,
    COALESCE(usage.redemption_count, (0)::bigint) AS current_uses,
    COALESCE(usage.unique_users, (0)::bigint) AS unique_users,
    usage.last_used_at
   FROM (public.promotion_codes pc
     LEFT JOIN ( SELECT promotion_redemptions.promotion_code_id,
            count(*) AS redemption_count,
            count(DISTINCT promotion_redemptions.user_id) AS unique_users,
            max(promotion_redemptions.redeemed_at) AS last_used_at
           FROM public.promotion_redemptions
          GROUP BY promotion_redemptions.promotion_code_id) usage ON ((pc.id = usage.promotion_code_id)));


--
-- TOC entry 441 (class 1259 OID 93825)
-- Name: promotion_multi_provider_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.promotion_multi_provider_stats AS
 SELECT p.id,
    p.name,
    p.status,
    p.supported_providers,
    p.supported_currencies,
    ( SELECT COALESCE(count(*), (0)::bigint) AS "coalesce"
           FROM public.promotion_redemptions r
          WHERE ((r.promotion_id = p.id) AND (r.committed_at IS NOT NULL))) AS total_redemptions,
    ( SELECT COALESCE(count(DISTINCT r.user_id), (0)::bigint) AS "coalesce"
           FROM public.promotion_redemptions r
          WHERE ((r.promotion_id = p.id) AND (r.committed_at IS NOT NULL))) AS total_unique_users,
    ( SELECT COALESCE(sum(r.discount_applied_amount), (0)::bigint) AS "coalesce"
           FROM public.promotion_redemptions r
          WHERE ((r.promotion_id = p.id) AND (r.committed_at IS NOT NULL))) AS total_discount_minor_units,
    ( SELECT jsonb_object_agg(x.gateway, x.val) AS jsonb_object_agg
           FROM ( SELECT (r.gateway)::text AS gateway,
                    jsonb_build_object('redemptions', count(*) FILTER (WHERE (r.committed_at IS NOT NULL)), 'unique_users', count(DISTINCT r.user_id) FILTER (WHERE (r.committed_at IS NOT NULL)), 'discount_amount', COALESCE(sum(r.discount_applied_amount) FILTER (WHERE (r.committed_at IS NOT NULL)), (0)::bigint), 'discount_usd', COALESCE(sum(r.base_currency_amount_cents) FILTER (WHERE (r.committed_at IS NOT NULL)), (0)::bigint)) AS val
                   FROM public.promotion_redemptions r
                  WHERE (r.promotion_id = p.id)
                  GROUP BY r.gateway) x) AS provider_breakdown,
    ( SELECT jsonb_object_agg(x.currency, x.val) AS jsonb_object_agg
           FROM ( SELECT r.currency,
                    jsonb_build_object('redemptions', count(*) FILTER (WHERE (r.committed_at IS NOT NULL)), 'discount_amount', COALESCE(sum(r.discount_applied_amount) FILTER (WHERE (r.committed_at IS NOT NULL)), (0)::bigint)) AS val
                   FROM public.promotion_redemptions r
                  WHERE (r.promotion_id = p.id)
                  GROUP BY r.currency) x) AS currency_breakdown
   FROM public.promotions p;


--
-- TOC entry 6877 (class 0 OID 0)
-- Dependencies: 441
-- Name: VIEW promotion_multi_provider_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.promotion_multi_provider_stats IS 'Production-hardened analytics view using scalar subqueries to prevent cartesian joins';


--
-- TOC entry 442 (class 1259 OID 93954)
-- Name: promotion_provider_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_provider_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    change_type text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    reason text,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    correlation_id text,
    CONSTRAINT promotion_provider_changes_change_type_check CHECK ((change_type = ANY (ARRAY['create'::text, 'update'::text, 'add_provider'::text, 'remove_provider'::text, 'update_currency'::text, 'update_config'::text, 'delete'::text])))
);


--
-- TOC entry 6878 (class 0 OID 0)
-- Dependencies: 442
-- Name: TABLE promotion_provider_changes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotion_provider_changes IS 'Complete audit trail for promotion provider configuration changes with IP/UA tracking';


--
-- TOC entry 6879 (class 0 OID 0)
-- Dependencies: 442
-- Name: COLUMN promotion_provider_changes.changed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotion_provider_changes.changed_by IS 'UUID of admin user from Supabase Auth (no FK constraint due to external auth)';


--
-- TOC entry 6880 (class 0 OID 0)
-- Dependencies: 442
-- Name: COLUMN promotion_provider_changes.correlation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.promotion_provider_changes.correlation_id IS 'Links audit entries to request correlation ID for tracing';


--
-- TOC entry 440 (class 1259 OID 93807)
-- Name: promotion_regional_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_regional_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    region_code text NOT NULL,
    preferred_providers public.payment_provider_key[] DEFAULT ARRAY[]::public.payment_provider_key[],
    localized_name jsonb,
    localized_description jsonb,
    min_order_amount_override integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT promotion_regional_config_region_code_check CHECK ((region_code = ANY (ARRAY['us'::text, 'ca'::text, 'gb'::text, 'eu'::text, 'eg'::text, 'sa'::text]))),
    CONSTRAINT regional_config_no_empty_arrays CHECK (((preferred_providers IS NULL) OR (cardinality(preferred_providers) > 0))),
    CONSTRAINT regional_config_providers_not_empty CHECK (((preferred_providers IS NULL) OR (cardinality(preferred_providers) > 0))),
    CONSTRAINT regional_config_region_lowercase CHECK ((region_code = lower(region_code)))
);


--
-- TOC entry 6881 (class 0 OID 0)
-- Dependencies: 440
-- Name: TABLE promotion_regional_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.promotion_regional_config IS 'Regional configuration for promotions including localized names and preferred providers';


--
-- TOC entry 420 (class 1259 OID 91500)
-- Name: promotion_usage_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.promotion_usage_stats AS
 SELECT p.id AS promotion_id,
    p.name,
    p.max_total_uses,
    COALESCE(usage.total_redemptions, (0)::bigint) AS current_uses,
    COALESCE(usage.unique_users, (0)::bigint) AS unique_users,
    COALESCE(usage.total_discount_given, (0)::bigint) AS total_discount_given
   FROM (public.promotions p
     LEFT JOIN ( SELECT promotion_redemptions.promotion_id,
            count(*) AS total_redemptions,
            count(DISTINCT promotion_redemptions.user_id) AS unique_users,
            sum(promotion_redemptions.discount_applied_amount) AS total_discount_given
           FROM public.promotion_redemptions
          GROUP BY promotion_redemptions.promotion_id) usage ON ((p.id = usage.promotion_id)));


--
-- TOC entry 357 (class 1259 OID 45290)
-- Name: publication_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_idempotency_keys (
    idempotency_key character varying(255) NOT NULL,
    response_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.publication_idempotency_keys FORCE ROW LEVEL SECURITY;


--
-- TOC entry 289 (class 1259 OID 17519)
-- Name: quota_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quota_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    metric text NOT NULL,
    success boolean NOT NULL,
    reason text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    requested_amount integer,
    limit_amount integer,
    current_usage integer,
    remaining_quota integer,
    bonus_used integer
);

ALTER TABLE ONLY public.quota_audit_log REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.quota_audit_log FORCE ROW LEVEL SECURITY;


--
-- TOC entry 290 (class 1259 OID 17527)
-- Name: quota_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quota_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    user_id uuid NOT NULL,
    metric text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ONLY public.quota_audit_logs REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.quota_audit_logs FORCE ROW LEVEL SECURITY;


--
-- TOC entry 291 (class 1259 OID 17535)
-- Name: usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    metric text NOT NULL,
    amount integer DEFAULT 1 NOT NULL,
    idempotency_key text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    collision_detected boolean DEFAULT false,
    collision_metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.usage_events FORCE ROW LEVEL SECURITY;


--
-- TOC entry 292 (class 1259 OID 17546)
-- Name: quota_collision_analysis; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.quota_collision_analysis AS
 SELECT usage_events.user_id,
    date_trunc('hour'::text, usage_events.created_at) AS hour,
    count(*) AS collision_count,
    array_agg(DISTINCT usage_events.idempotency_key) AS collision_keys,
    array_agg(DISTINCT (usage_events.metadata ->> 'client_ip'::text)) AS client_ips
   FROM public.usage_events
  WHERE ((usage_events.collision_detected = true) AND (usage_events.created_at > (CURRENT_TIMESTAMP - '24:00:00'::interval)))
  GROUP BY usage_events.user_id, (date_trunc('hour'::text, usage_events.created_at))
  ORDER BY (count(*)) DESC;


--
-- TOC entry 293 (class 1259 OID 17551)
-- Name: quota_concurrent_attempts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.quota_concurrent_attempts AS
 WITH numbered_events AS (
         SELECT usage_events.user_id,
            usage_events.metric,
            usage_events.created_at,
            lag(usage_events.created_at) OVER (PARTITION BY usage_events.user_id, usage_events.metric ORDER BY usage_events.created_at) AS prev_created_at
           FROM public.usage_events
          WHERE (usage_events.created_at > (CURRENT_TIMESTAMP - '01:00:00'::interval))
        )
 SELECT numbered_events.user_id,
    numbered_events.metric,
    count(*) AS concurrent_count,
    min(numbered_events.created_at) AS first_attempt,
    max(numbered_events.created_at) AS last_attempt
   FROM numbered_events
  WHERE (EXTRACT(epoch FROM (numbered_events.created_at - numbered_events.prev_created_at)) < (1)::numeric)
  GROUP BY numbered_events.user_id, numbered_events.metric
 HAVING (count(*) > 1);


--
-- TOC entry 294 (class 1259 OID 17556)
-- Name: quota_failures_realtime; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.quota_failures_realtime AS
 SELECT quota_audit_log.user_id,
    quota_audit_log.metric,
    quota_audit_log.reason,
    count(*) AS failure_count,
    max(quota_audit_log.created_at) AS last_failure
   FROM public.quota_audit_log
  WHERE ((quota_audit_log.success = false) AND (quota_audit_log.created_at > (CURRENT_TIMESTAMP - '01:00:00'::interval)))
  GROUP BY quota_audit_log.user_id, quota_audit_log.metric, quota_audit_log.reason;


--
-- TOC entry 295 (class 1259 OID 17560)
-- Name: quota_high_denial_users; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.quota_high_denial_users AS
 SELECT quota_audit_log.user_id,
    quota_audit_log.metric,
    count(*) FILTER (WHERE (NOT quota_audit_log.success)) AS denial_count,
    count(*) FILTER (WHERE quota_audit_log.success) AS success_count,
    count(*) AS total_attempts,
    round(((100.0 * (count(*) FILTER (WHERE (NOT quota_audit_log.success)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS denial_rate_percent,
    max(quota_audit_log.created_at) FILTER (WHERE (NOT quota_audit_log.success)) AS last_denial
   FROM public.quota_audit_log
  WHERE (quota_audit_log.created_at > (CURRENT_TIMESTAMP - '24:00:00'::interval))
  GROUP BY quota_audit_log.user_id, quota_audit_log.metric
 HAVING ((count(*) FILTER (WHERE (NOT quota_audit_log.success)) > 5) AND (count(*) > 10))
  ORDER BY (count(*) FILTER (WHERE (NOT quota_audit_log.success))) DESC;


--
-- TOC entry 296 (class 1259 OID 17565)
-- Name: quota_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quota_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    identifier_type text NOT NULL,
    request_count integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT quota_rate_limits_identifier_type_check CHECK ((identifier_type = ANY (ARRAY['ip'::text, 'user'::text])))
);

ALTER TABLE ONLY public.quota_rate_limits FORCE ROW LEVEL SECURITY;


--
-- TOC entry 297 (class 1259 OID 17575)
-- Name: quota_usage_spikes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.quota_usage_spikes AS
 WITH hourly_usage AS (
         SELECT usage_events.user_id,
            usage_events.metric,
            date_trunc('hour'::text, usage_events.created_at) AS hour,
            count(*) AS usage_count
           FROM public.usage_events
          WHERE (usage_events.created_at > (CURRENT_TIMESTAMP - '7 days'::interval))
          GROUP BY usage_events.user_id, usage_events.metric, (date_trunc('hour'::text, usage_events.created_at))
        ), usage_with_avg AS (
         SELECT hourly_usage.user_id,
            hourly_usage.metric,
            hourly_usage.hour,
            hourly_usage.usage_count,
            avg(hourly_usage.usage_count) OVER (PARTITION BY hourly_usage.user_id, hourly_usage.metric ORDER BY hourly_usage.hour ROWS BETWEEN 24 PRECEDING AND 1 PRECEDING) AS avg_hourly_usage
           FROM hourly_usage
        )
 SELECT usage_with_avg.user_id,
    usage_with_avg.metric,
    usage_with_avg.hour,
    usage_with_avg.usage_count,
    usage_with_avg.avg_hourly_usage
   FROM usage_with_avg
  WHERE (((usage_with_avg.usage_count)::numeric > ((2)::numeric * COALESCE(usage_with_avg.avg_hourly_usage, (0)::numeric))) AND (usage_with_avg.avg_hourly_usage IS NOT NULL));


--
-- TOC entry 349 (class 1259 OID 37829)
-- Name: r2_cleanup_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.r2_cleanup_logs (
    id integer NOT NULL,
    cleanup_date date NOT NULL,
    files_deleted integer DEFAULT 0 NOT NULL,
    errors_count integer DEFAULT 0 NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.r2_cleanup_logs FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6882 (class 0 OID 0)
-- Dependencies: 349
-- Name: TABLE r2_cleanup_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.r2_cleanup_logs IS 'Daily R2 cleanup job execution logs for monitoring storage cleanup operations';


--
-- TOC entry 6883 (class 0 OID 0)
-- Dependencies: 349
-- Name: COLUMN r2_cleanup_logs.cleanup_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.r2_cleanup_logs.cleanup_date IS 'Date of cleanup execution (YYYY-MM-DD)';


--
-- TOC entry 6884 (class 0 OID 0)
-- Dependencies: 349
-- Name: COLUMN r2_cleanup_logs.files_deleted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.r2_cleanup_logs.files_deleted IS 'Number of orphaned diff packs deleted';


--
-- TOC entry 6885 (class 0 OID 0)
-- Dependencies: 349
-- Name: COLUMN r2_cleanup_logs.errors_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.r2_cleanup_logs.errors_count IS 'Number of errors encountered during cleanup';


--
-- TOC entry 6886 (class 0 OID 0)
-- Dependencies: 349
-- Name: COLUMN r2_cleanup_logs.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.r2_cleanup_logs.duration_ms IS 'Cleanup execution time in milliseconds';


--
-- TOC entry 348 (class 1259 OID 37828)
-- Name: r2_cleanup_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.r2_cleanup_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6887 (class 0 OID 0)
-- Dependencies: 348
-- Name: r2_cleanup_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.r2_cleanup_logs_id_seq OWNED BY public.r2_cleanup_logs.id;


--
-- TOC entry 298 (class 1259 OID 17580)
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_user_id uuid NOT NULL,
    referred_user_id uuid,
    referral_code character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    converted_at timestamp with time zone,
    conversion_plan character varying(50),
    referrer_bonus_granted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval)
);


--
-- TOC entry 6888 (class 0 OID 0)
-- Dependencies: 298
-- Name: TABLE referrals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.referrals IS 'User referral tracking and attribution';


--
-- TOC entry 6889 (class 0 OID 0)
-- Dependencies: 298
-- Name: COLUMN referrals.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referrals.status IS 'Referral status (pending, converted, expired)';


--
-- TOC entry 432 (class 1259 OID 92245)
-- Name: regional_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regional_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region_code character(2) NOT NULL,
    date date NOT NULL,
    is_weekend boolean DEFAULT false,
    is_holiday boolean DEFAULT false,
    holiday_name text
);


--
-- TOC entry 376 (class 1259 OID 73212)
-- Name: security_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_audit_log (
    id bigint NOT NULL,
    event_type text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    migration_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.security_audit_log FORCE ROW LEVEL SECURITY;


--
-- TOC entry 375 (class 1259 OID 73211)
-- Name: security_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6890 (class 0 OID 0)
-- Dependencies: 375
-- Name: security_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_audit_log_id_seq OWNED BY public.security_audit_log.id;


--
-- TOC entry 378 (class 1259 OID 73780)
-- Name: security_implementation_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.security_implementation_summary AS
 SELECT 'TABLES'::text AS object_type,
    count(*) AS total_objects,
    count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
    count(*) FILTER (WHERE c.relforcerowsecurity) AS force_rls_enabled,
    count(*) FILTER (WHERE (NOT c.relrowsecurity)) AS needs_rls
   FROM (pg_class c
     JOIN pg_namespace n ON ((n.oid = c.relnamespace)))
  WHERE ((n.nspname = 'public'::name) AND (c.relkind = 'r'::"char"))
UNION ALL
 SELECT 'POLICIES'::text AS object_type,
    count(*) AS total_objects,
    count(DISTINCT (((pg_policies.schemaname)::text || '.'::text) || (pg_policies.tablename)::text)) AS rls_enabled,
    count(*) FILTER (WHERE (pg_policies.cmd = 'ALL'::text)) AS force_rls_enabled,
    0 AS needs_rls
   FROM pg_policies
  WHERE (pg_policies.schemaname = 'public'::name)
UNION ALL
 SELECT 'GRANTS'::text AS object_type,
    count(DISTINCT role_table_grants.table_name) AS total_objects,
    count(DISTINCT role_table_grants.table_name) FILTER (WHERE ((role_table_grants.privilege_type)::text = 'SELECT'::text)) AS rls_enabled,
    count(DISTINCT role_table_grants.table_name) FILTER (WHERE ((role_table_grants.privilege_type)::text = 'INSERT'::text)) AS force_rls_enabled,
    0 AS needs_rls
   FROM information_schema.role_table_grants
  WHERE (((role_table_grants.grantee)::name = 'authenticated'::name) AND ((role_table_grants.table_schema)::name = 'public'::name));


--
-- TOC entry 377 (class 1259 OID 73554)
-- Name: security_rls_audit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.security_rls_audit AS
 WITH t_all AS (
         SELECT n.nspname AS schema_name,
            c.relname AS object_name,
            c.relkind,
                CASE c.relkind
                    WHEN 'r'::"char" THEN 'TABLE'::text
                    WHEN 'v'::"char" THEN 'VIEW'::text
                    WHEN 'm'::"char" THEN 'MATVIEW'::text
                    ELSE (c.relkind)::text
                END AS object_kind,
            c.relrowsecurity AS rls_enabled,
            c.relforcerowsecurity AS rls_forced
           FROM (pg_class c
             JOIN pg_namespace n ON ((n.oid = c.relnamespace)))
          WHERE ((n.nspname = 'public'::name) AND (c.relkind = ANY (ARRAY['r'::"char", 'v'::"char", 'm'::"char"])))
        ), t_tables AS (
         SELECT t_all.schema_name,
            t_all.object_name,
            t_all.relkind,
            t_all.object_kind,
            t_all.rls_enabled,
            t_all.rls_forced
           FROM t_all
          WHERE (t_all.relkind = 'r'::"char")
        ), pol AS (
         SELECT pg_policies.schemaname AS schema_name,
            pg_policies.tablename AS object_name,
            count(*) AS policy_count,
            bool_or((upper(pg_policies.cmd) = ANY (ARRAY['ALL'::text, 'SELECT'::text]))) AS has_select_policy,
            bool_or((upper(pg_policies.cmd) = ANY (ARRAY['ALL'::text, 'INSERT'::text]))) AS has_insert_policy,
            bool_or((upper(pg_policies.cmd) = ANY (ARRAY['ALL'::text, 'UPDATE'::text]))) AS has_update_policy,
            bool_or((upper(pg_policies.cmd) = ANY (ARRAY['ALL'::text, 'DELETE'::text]))) AS has_delete_policy,
            bool_or((pg_policies.policyname ~~* 'deny_all_temp%'::text)) AS has_temp_deny_all
           FROM pg_policies
          GROUP BY pg_policies.schemaname, pg_policies.tablename
        ), gr AS (
         SELECT role_table_grants.table_schema AS schema_name,
            role_table_grants.table_name AS object_name,
            bool_or(((role_table_grants.privilege_type)::text = 'SELECT'::text)) AS grant_select,
            bool_or(((role_table_grants.privilege_type)::text = 'INSERT'::text)) AS grant_insert,
            bool_or(((role_table_grants.privilege_type)::text = 'UPDATE'::text)) AS grant_update,
            bool_or(((role_table_grants.privilege_type)::text = 'DELETE'::text)) AS grant_delete
           FROM information_schema.role_table_grants
          WHERE (((role_table_grants.grantee)::name = 'authenticated'::name) AND ((role_table_grants.table_schema)::name = 'public'::name))
          GROUP BY role_table_grants.table_schema, role_table_grants.table_name
        ), sch AS (
         SELECT n.nspname AS schema_name,
            has_schema_privilege('authenticated'::name, n.oid, 'USAGE'::text) AS schema_usage_granted
           FROM pg_namespace n
          WHERE (n.nspname = 'public'::name)
        ), vdeps AS (
         SELECT DISTINCT n_view.nspname AS view_schema_name,
            c_view.relname AS view_name,
            n_base.nspname AS base_table_schema,
            c_base.relname AS base_table_name
           FROM (((((pg_depend d
             JOIN pg_rewrite r ON ((r.oid = d.objid)))
             JOIN pg_class c_view ON ((c_view.oid = r.ev_class)))
             JOIN pg_namespace n_view ON ((n_view.oid = c_view.relnamespace)))
             JOIN pg_class c_base ON ((c_base.oid = d.refobjid)))
             JOIN pg_namespace n_base ON ((n_base.oid = c_base.relnamespace)))
          WHERE ((n_view.nspname = 'public'::name) AND (c_view.relkind = ANY (ARRAY['v'::"char", 'm'::"char"])) AND (c_base.relkind = 'r'::"char"))
        ), vagg AS (
         SELECT d.view_schema_name AS schema_name,
            d.view_name AS object_name,
            count(*) AS view_base_tables,
            count(*) FILTER (WHERE (tb.rls_enabled IS FALSE)) AS view_base_without_rls,
            count(*) FILTER (WHERE (COALESCE(pl_1.policy_count, (0)::bigint) = 0)) AS view_base_without_policy,
            count(*) FILTER (WHERE (tb.rls_enabled AND (COALESCE(pl_1.policy_count, (0)::bigint) > 0) AND (NOT tb.rls_forced))) AS view_base_rls_not_forced
           FROM ((vdeps d
             LEFT JOIN t_tables tb ON (((tb.schema_name = d.base_table_schema) AND (tb.object_name = d.base_table_name))))
             LEFT JOIN pol pl_1 ON (((pl_1.schema_name = d.base_table_schema) AND (pl_1.object_name = d.base_table_name))))
          GROUP BY d.view_schema_name, d.view_name
        ), srv AS (
         SELECT COALESCE(( SELECT pg_roles.rolbypassrls
                   FROM pg_roles
                  WHERE (pg_roles.rolname = 'service_role'::name)), false) AS service_role_bypassrls
        )
 SELECT a.schema_name,
    a.object_name,
    a.object_kind,
    COALESCE(a.rls_enabled, false) AS rls_enabled,
    COALESCE(a.rls_forced, false) AS rls_forced,
    (COALESCE(pl.policy_count, (0)::bigint) > 0) AS has_any_policy,
    COALESCE(pl.policy_count, (0)::bigint) AS policy_count,
    COALESCE(pl.has_select_policy, false) AS has_select_policy,
    COALESCE(pl.has_insert_policy, false) AS has_insert_policy,
    COALESCE(pl.has_update_policy, false) AS has_update_policy,
    COALESCE(pl.has_delete_policy, false) AS has_delete_policy,
    COALESCE(pl.has_temp_deny_all, false) AS has_temp_deny_all,
    COALESCE(gr.grant_select, false) AS grant_select,
    COALESCE(gr.grant_insert, false) AS grant_insert,
    COALESCE(gr.grant_update, false) AS grant_update,
    COALESCE(gr.grant_delete, false) AS grant_delete,
    COALESCE(sch.schema_usage_granted, false) AS schema_usage_granted,
    v.view_base_tables,
    v.view_base_without_rls,
    v.view_base_without_policy,
    v.view_base_rls_not_forced,
    concat_ws(', '::text,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND (NOT COALESCE(pl.has_select_policy, false))) THEN 'SELECT'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND (NOT COALESCE(pl.has_insert_policy, false))) THEN 'INSERT'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND (NOT COALESCE(pl.has_update_policy, false))) THEN 'UPDATE'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND (NOT COALESCE(pl.has_delete_policy, false))) THEN 'DELETE'::text
            ELSE NULL::text
        END) AS missing_policy_cmds,
    concat_ws(', '::text,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND COALESCE(pl.has_select_policy, false) AND (NOT COALESCE(gr.grant_select, false))) THEN 'SELECT'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND COALESCE(pl.has_insert_policy, false) AND (NOT COALESCE(gr.grant_insert, false))) THEN 'INSERT'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND COALESCE(pl.has_update_policy, false) AND (NOT COALESCE(gr.grant_update, false))) THEN 'UPDATE'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND COALESCE(pl.has_delete_policy, false) AND (NOT COALESCE(gr.grant_delete, false))) THEN 'DELETE'::text
            ELSE NULL::text
        END) AS missing_grants_for_authenticated,
        CASE
            WHEN (a.object_kind = 'TABLE'::text) THEN
            CASE
                WHEN (NOT COALESCE(a.rls_enabled, false)) THEN 'NEEDS_ACTION: ENABLE_RLS'::text
                WHEN (a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) = 0)) THEN 'NEEDS_ACTION: ADD_POLICIES (deny-by-default now)'::text
                WHEN (a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND ((NOT COALESCE(pl.has_select_policy, false)) OR (NOT COALESCE(pl.has_insert_policy, false)) OR (NOT COALESCE(pl.has_update_policy, false)) OR (NOT COALESCE(pl.has_delete_policy, false)))) THEN 'NEEDS_ACTION: ADD_MISSING_POLICY_CMDS'::text
                WHEN (a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND ((pl.has_select_policy AND (NOT COALESCE(gr.grant_select, false))) OR (pl.has_insert_policy AND (NOT COALESCE(gr.grant_insert, false))) OR (pl.has_update_policy AND (NOT COALESCE(gr.grant_update, false))) OR (pl.has_delete_policy AND (NOT COALESCE(gr.grant_delete, false))))) THEN 'NEEDS_ACTION: GRANT_BASE_PRIVILEGES'::text
                WHEN (a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND (NOT a.rls_forced)) THEN 'OK (Consider FORCE_RLS)'::text
                ELSE 'OK'::text
            END
            WHEN (a.object_kind = ANY (ARRAY['VIEW'::text, 'MATVIEW'::text])) THEN
            CASE
                WHEN (COALESCE(v.view_base_tables, (0)::bigint) = 0) THEN 'VIEW_REVIEW: NO_DEPENDENCY_INFO'::text
                WHEN ((COALESCE(v.view_base_without_rls, (0)::bigint) > 0) OR (COALESCE(v.view_base_without_policy, (0)::bigint) > 0)) THEN 'NEEDS_ACTION: VIEW_BASE_TABLE_GAPS'::text
                WHEN (COALESCE(v.view_base_rls_not_forced, (0)::bigint) > 0) THEN 'OK (View; some base tables not FORCE RLS)'::text
                ELSE 'OK (View; base tables RLS enforced)'::text
            END
            ELSE 'OK'::text
        END AS verdict,
    concat_ws(' | '::text,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND (NOT COALESCE(a.rls_enabled, false))) THEN 'ENABLE_RLS'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) = 0)) THEN 'ADD_POLICIES (deny-by-default)'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND ((NOT COALESCE(pl.has_select_policy, false)) OR (NOT COALESCE(pl.has_insert_policy, false)) OR (NOT COALESCE(pl.has_update_policy, false)) OR (NOT COALESCE(pl.has_delete_policy, false)))) THEN ('ADD_POLICIES_FOR: '::text || concat_ws('/'::text,
            CASE
                WHEN (NOT COALESCE(pl.has_select_policy, false)) THEN 'SELECT'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (NOT COALESCE(pl.has_insert_policy, false)) THEN 'INSERT'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (NOT COALESCE(pl.has_update_policy, false)) THEN 'UPDATE'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (NOT COALESCE(pl.has_delete_policy, false)) THEN 'DELETE'::text
                ELSE NULL::text
            END))
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND ((pl.has_select_policy AND (NOT COALESCE(gr.grant_select, false))) OR (pl.has_insert_policy AND (NOT COALESCE(gr.grant_insert, false))) OR (pl.has_update_policy AND (NOT COALESCE(gr.grant_update, false))) OR (pl.has_delete_policy AND (NOT COALESCE(gr.grant_delete, false))))) THEN ('GRANT_PRIVILEGES_FOR: '::text || concat_ws('/'::text,
            CASE
                WHEN (pl.has_select_policy AND (NOT COALESCE(gr.grant_select, false))) THEN 'SELECT'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (pl.has_insert_policy AND (NOT COALESCE(gr.grant_insert, false))) THEN 'INSERT'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (pl.has_update_policy AND (NOT COALESCE(gr.grant_update, false))) THEN 'UPDATE'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (pl.has_delete_policy AND (NOT COALESCE(gr.grant_delete, false))) THEN 'DELETE'::text
                ELSE NULL::text
            END))
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND (NOT a.rls_forced)) THEN 'CONSIDER_FORCE_RLS'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = ANY (ARRAY['VIEW'::text, 'MATVIEW'::text])) AND ((COALESCE(v.view_base_without_rls, (0)::bigint) > 0) OR (COALESCE(v.view_base_without_policy, (0)::bigint) > 0))) THEN 'HARDEN_BASE_TABLES (ENABLE_RLS/ADD_POLICIES)'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (NOT COALESCE(sch.schema_usage_granted, false)) THEN 'GRANT_SCHEMA_USAGE(public)'::text
            ELSE NULL::text
        END) AS actions,
    concat_ws(' | '::text,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) = 0)) THEN 'RLS ON with zero policies: deny-all for non-bypass roles; service role still bypasses RLS.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND COALESCE(pl.has_temp_deny_all, false)) THEN 'Temporary deny-all policy active: table locked until allow-policies exist.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND ((NOT COALESCE(pl.has_select_policy, false)) OR (NOT COALESCE(pl.has_insert_policy, false)) OR (NOT COALESCE(pl.has_update_policy, false)) OR (NOT COALESCE(pl.has_delete_policy, false)))) THEN 'Some commands lack policies; those commands are denied by default.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (COALESCE(pl.policy_count, (0)::bigint) > 0) AND ((pl.has_select_policy AND (NOT COALESCE(gr.grant_select, false))) OR (pl.has_insert_policy AND (NOT COALESCE(gr.grant_insert, false))) OR (pl.has_update_policy AND (NOT COALESCE(gr.grant_update, false))) OR (pl.has_delete_policy AND (NOT COALESCE(gr.grant_delete, false))))) THEN 'Policies OK; authenticated lacks base GRANTs—grant listed privileges; RLS still enforces per-row access.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = 'TABLE'::text) AND a.rls_enabled AND (NOT a.rls_forced)) THEN 'FORCE RLS is OFF: table owners can bypass RLS; consider enabling.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (a.object_kind = ANY (ARRAY['VIEW'::text, 'MATVIEW'::text])) THEN 'Views don’t have RLS; access governed by base tables—ensure they’re hardened.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((a.object_kind = ANY (ARRAY['VIEW'::text, 'MATVIEW'::text])) AND (COALESCE(v.view_base_rls_not_forced, (0)::bigint) > 0)) THEN 'Some underlying tables have RLS but not FORCE RLS.'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ( SELECT srv.service_role_bypassrls
               FROM srv) THEN 'Note: service_role has BYPASSRLS—do not use in user-facing routes.'::text
            ELSE NULL::text
        END) AS notes
   FROM ((((t_all a
     LEFT JOIN pol pl ON (((pl.schema_name = a.schema_name) AND (pl.object_name = a.object_name))))
     LEFT JOIN gr gr ON ((((gr.schema_name)::name = a.schema_name) AND ((gr.object_name)::name = a.object_name))))
     LEFT JOIN sch sch ON ((sch.schema_name = a.schema_name)))
     LEFT JOIN vagg v ON (((v.schema_name = a.schema_name) AND (v.object_name = a.object_name))))
  ORDER BY a.object_kind, a.schema_name, a.object_name;


--
-- TOC entry 299 (class 1259 OID 17588)
-- Name: storage_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    operation text NOT NULL,
    user_id uuid,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.storage_audit_log FORCE ROW LEVEL SECURITY;


--
-- TOC entry 389 (class 1259 OID 81434)
-- Name: stripe_raw_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_raw_events (
    id text NOT NULL,
    payload text NOT NULL,
    received_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 6891 (class 0 OID 0)
-- Dependencies: 389
-- Name: TABLE stripe_raw_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stripe_raw_events IS 'Raw Stripe webhook payloads for debugging and replay. Useful for troubleshooting payment issues in production.';


--
-- TOC entry 370 (class 1259 OID 69624)
-- Name: supabase_account_discovery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supabase_account_discovery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    discovery_data jsonb NOT NULL,
    discovered_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.supabase_account_discovery FORCE ROW LEVEL SECURITY;


--
-- TOC entry 373 (class 1259 OID 69665)
-- Name: supabase_breakglass_recovery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supabase_breakglass_recovery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    access_token_plaintext text NOT NULL,
    refresh_token_plaintext text NOT NULL,
    supabase_project_ref character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    accessed_at timestamp with time zone,
    access_count integer DEFAULT 0,
    created_by_admin_id uuid,
    reason text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
    is_active boolean DEFAULT true,
    access_restricted_until timestamp with time zone
);

ALTER TABLE ONLY public.supabase_breakglass_recovery FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6892 (class 0 OID 0)
-- Dependencies: 373
-- Name: TABLE supabase_breakglass_recovery; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.supabase_breakglass_recovery IS '🚨 SECURITY RISK: Stores plaintext tokens for emergency access';


--
-- TOC entry 6893 (class 0 OID 0)
-- Dependencies: 373
-- Name: COLUMN supabase_breakglass_recovery.access_token_plaintext; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supabase_breakglass_recovery.access_token_plaintext IS '🚨 PLAINTEXT STORAGE - extreme security risk';


--
-- TOC entry 6894 (class 0 OID 0)
-- Dependencies: 373
-- Name: COLUMN supabase_breakglass_recovery.refresh_token_plaintext; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supabase_breakglass_recovery.refresh_token_plaintext IS '🚨 PLAINTEXT STORAGE - extreme security risk';


--
-- TOC entry 369 (class 1259 OID 69610)
-- Name: supabase_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supabase_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    access_token_encrypted jsonb NOT NULL,
    refresh_token_encrypted jsonb NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    connection_status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supabase_connections_connection_status_check CHECK (((connection_status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'revoked'::character varying, 'disconnected'::character varying])::text[])))
);

ALTER TABLE ONLY public.supabase_connections FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6895 (class 0 OID 0)
-- Dependencies: 369
-- Name: TABLE supabase_connections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.supabase_connections IS 'OAuth connections to Supabase with encrypted token storage';


--
-- TOC entry 6896 (class 0 OID 0)
-- Dependencies: 369
-- Name: COLUMN supabase_connections.access_token_encrypted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supabase_connections.access_token_encrypted IS 'AES-GCM encrypted access token as JSONB {encrypted, iv, authTag}';


--
-- TOC entry 6897 (class 0 OID 0)
-- Dependencies: 369
-- Name: COLUMN supabase_connections.refresh_token_encrypted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supabase_connections.refresh_token_encrypted IS 'AES-GCM encrypted refresh token as JSONB {encrypted, iv, authTag}';


--
-- TOC entry 405 (class 1259 OID 89870)
-- Name: support_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    message_type public.ticket_message_type DEFAULT 'text'::public.ticket_message_type,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 408 (class 1259 OID 89934)
-- Name: support_ticket_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_ticket_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 404 (class 1259 OID 89853)
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number character varying(20) NOT NULL,
    user_id uuid,
    channel public.ticket_channel DEFAULT 'web'::public.ticket_channel NOT NULL,
    category text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    priority public.ticket_priority DEFAULT 'medium'::public.ticket_priority NOT NULL,
    status public.ticket_status DEFAULT 'open'::public.ticket_status NOT NULL,
    subject text NOT NULL,
    description text NOT NULL,
    assigned_to uuid,
    sla_due_at timestamp with time zone,
    escalated_to uuid,
    vendor_ticket_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone
);


--
-- TOC entry 368 (class 1259 OID 65058)
-- Name: unified_chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    session_id character varying(255) NOT NULL,
    mode_transitions integer DEFAULT 0,
    messages_in_plan_mode integer DEFAULT 0,
    messages_in_build_mode integer DEFAULT 0,
    plans_converted_to_builds integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_active timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb,
    preferred_locale text
);

ALTER TABLE ONLY public.unified_chat_sessions FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6898 (class 0 OID 0)
-- Dependencies: 368
-- Name: TABLE unified_chat_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.unified_chat_sessions IS 'Tracks unified chat sessions for analytics and mode usage patterns';


--
-- TOC entry 6899 (class 0 OID 0)
-- Dependencies: 368
-- Name: COLUMN unified_chat_sessions.mode_transitions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_chat_sessions.mode_transitions IS 'Number of times user switched between plan and build modes';


--
-- TOC entry 6900 (class 0 OID 0)
-- Dependencies: 368
-- Name: COLUMN unified_chat_sessions.messages_in_plan_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_chat_sessions.messages_in_plan_mode IS 'Count of messages sent while in plan mode';


--
-- TOC entry 6901 (class 0 OID 0)
-- Dependencies: 368
-- Name: COLUMN unified_chat_sessions.messages_in_build_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_chat_sessions.messages_in_build_mode IS 'Count of messages sent while in build mode';


--
-- TOC entry 6902 (class 0 OID 0)
-- Dependencies: 368
-- Name: COLUMN unified_chat_sessions.plans_converted_to_builds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_chat_sessions.plans_converted_to_builds IS 'Number of plans converted to actual builds';


--
-- TOC entry 6903 (class 0 OID 0)
-- Dependencies: 368
-- Name: COLUMN unified_chat_sessions.preferred_locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_chat_sessions.preferred_locale IS 'BCP-47 locale code (e.g., ar-EG, en-US, fr-FR) for user interface language preference';


--
-- TOC entry 300 (class 1259 OID 17626)
-- Name: usage_bonuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_bonuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    metric character varying(50) NOT NULL,
    amount integer NOT NULL,
    reason character varying(100) NOT NULL,
    expires_at timestamp with time zone,
    consumed integer DEFAULT 0,
    redeemed_at timestamp with time zone,
    expiry_notified boolean DEFAULT false,
    archived boolean DEFAULT false,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.usage_bonuses FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6904 (class 0 OID 0)
-- Dependencies: 300
-- Name: TABLE usage_bonuses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.usage_bonuses IS 'Bonus usage grants for users (signup, referral, etc)';


--
-- TOC entry 6905 (class 0 OID 0)
-- Dependencies: 300
-- Name: COLUMN usage_bonuses.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usage_bonuses.reason IS 'Reason for bonus grant (signup, referral, social_share, profile_complete)';


--
-- TOC entry 301 (class 1259 OID 17634)
-- Name: usage_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ai_generations integer DEFAULT 0,
    projects_created integer DEFAULT 0,
    exports integer DEFAULT 0,
    storage_mb integer DEFAULT 0
);

ALTER TABLE ONLY public.usage_tracking FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6906 (class 0 OID 0)
-- Dependencies: 301
-- Name: TABLE usage_tracking; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.usage_tracking IS 'Tracks usage metrics per user per billing period with denormalized columns for each metric type';


--
-- TOC entry 6907 (class 0 OID 0)
-- Dependencies: 301
-- Name: COLUMN usage_tracking.ai_generations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usage_tracking.ai_generations IS 'Number of AI generations used in the period';


--
-- TOC entry 6908 (class 0 OID 0)
-- Dependencies: 301
-- Name: COLUMN usage_tracking.projects_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usage_tracking.projects_created IS 'Number of projects created in the period';


--
-- TOC entry 6909 (class 0 OID 0)
-- Dependencies: 301
-- Name: COLUMN usage_tracking.exports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usage_tracking.exports IS 'Number of exports made in the period';


--
-- TOC entry 6910 (class 0 OID 0)
-- Dependencies: 301
-- Name: COLUMN usage_tracking.storage_mb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usage_tracking.storage_mb IS 'Storage used in MB in the period';


--
-- TOC entry 407 (class 1259 OID 89896)
-- Name: user_admin_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_admin_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL,
    suspended_until timestamp with time zone,
    suspension_reason text,
    is_banned boolean DEFAULT false NOT NULL,
    ban_reason text,
    admin_notes text,
    risk_score integer DEFAULT 0,
    risk_level text DEFAULT 'minimal'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 347 (class 1259 OID 37766)
-- Name: user_ai_consumption_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_consumption_metadata (
    consumption_id uuid NOT NULL,
    prompt_preview text,
    full_error_message text,
    ai_model_used text,
    features_used jsonb,
    time_to_first_output_ms integer,
    claude_processing_gaps integer,
    retry_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.user_ai_consumption_metadata FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6911 (class 0 OID 0)
-- Dependencies: 347
-- Name: TABLE user_ai_consumption_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_ai_consumption_metadata IS 'Extended metadata for consumption records, kept separate for performance';


--
-- TOC entry 6912 (class 0 OID 0)
-- Dependencies: 347
-- Name: COLUMN user_ai_consumption_metadata.prompt_preview; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_consumption_metadata.prompt_preview IS 'First 200 characters of user prompt for debugging';


--
-- TOC entry 344 (class 1259 OID 37678)
-- Name: user_ai_time_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_time_balance (
    user_id uuid NOT NULL,
    welcome_bonus_seconds integer DEFAULT 3000,
    welcome_bonus_granted_at timestamp without time zone DEFAULT now(),
    daily_gift_used_today integer DEFAULT 0,
    paid_seconds_remaining integer DEFAULT 0,
    subscription_tier text DEFAULT 'free'::text,
    subscription_seconds_remaining integer DEFAULT 0,
    subscription_seconds_rollover integer DEFAULT 0,
    subscription_rollover_cap_seconds integer DEFAULT 0,
    subscription_reset_at timestamp without time zone,
    total_seconds_used_today integer DEFAULT 0,
    total_seconds_used_lifetime integer DEFAULT 0,
    last_used_at timestamp without time zone,
    auto_topup_enabled boolean DEFAULT false,
    auto_topup_threshold_seconds integer DEFAULT 600,
    auto_topup_package text DEFAULT 'mini'::text,
    auto_topup_consent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    bonus_month_year text DEFAULT to_char(now(), 'YYYY-MM'::text),
    bonus_used_this_month integer DEFAULT 0,
    bonus_monthly_cap integer DEFAULT 18000,
    second_buckets jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_paid_seconds bigint DEFAULT 0 NOT NULL,
    total_bonus_seconds bigint DEFAULT 0 NOT NULL,
    next_expiry_at timestamp with time zone,
    pricing_catalog_version text DEFAULT '2025-09-01'::text,
    CONSTRAINT bonus_within_monthly_cap CHECK ((bonus_used_this_month <= bonus_monthly_cap)),
    CONSTRAINT computed_fields_non_negative CHECK (((total_paid_seconds >= 0) AND (total_bonus_seconds >= 0))),
    CONSTRAINT user_ai_time_balance_bonus_monthly_cap_check CHECK ((bonus_monthly_cap >= 0)),
    CONSTRAINT user_ai_time_balance_bonus_used_this_month_check CHECK ((bonus_used_this_month >= 0)),
    CONSTRAINT user_ai_time_balance_daily_gift_used_today_check CHECK (((daily_gift_used_today >= 0) AND (daily_gift_used_today <= 900))),
    CONSTRAINT user_ai_time_balance_paid_seconds_remaining_check CHECK ((paid_seconds_remaining >= 0)),
    CONSTRAINT user_ai_time_balance_subscription_seconds_remaining_check CHECK ((subscription_seconds_remaining >= 0)),
    CONSTRAINT user_ai_time_balance_subscription_seconds_rollover_check CHECK ((subscription_seconds_rollover >= 0)),
    CONSTRAINT user_ai_time_balance_total_bonus_seconds_check CHECK ((total_bonus_seconds >= 0)),
    CONSTRAINT user_ai_time_balance_total_paid_seconds_check CHECK ((total_paid_seconds >= 0)),
    CONSTRAINT user_ai_time_balance_total_seconds_used_lifetime_check CHECK ((total_seconds_used_lifetime >= 0)),
    CONSTRAINT user_ai_time_balance_total_seconds_used_today_check CHECK ((total_seconds_used_today >= 0)),
    CONSTRAINT user_ai_time_balance_welcome_bonus_seconds_check CHECK ((welcome_bonus_seconds >= 0)),
    CONSTRAINT valid_bucket_structure CHECK (public.validate_bucket_integrity(second_buckets))
);

ALTER TABLE ONLY public.user_ai_time_balance FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6913 (class 0 OID 0)
-- Dependencies: 344
-- Name: TABLE user_ai_time_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_ai_time_balance IS 'Tracks AI time balances including welcome bonuses, daily gifts, and subscription minutes';


--
-- TOC entry 6914 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.welcome_bonus_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.welcome_bonus_seconds IS 'One-time 50-minute welcome bonus (3000 seconds)';


--
-- TOC entry 6915 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.daily_gift_used_today; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.daily_gift_used_today IS 'Seconds of daily gift used today (resets at midnight UTC)';


--
-- TOC entry 6916 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.paid_seconds_remaining; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.paid_seconds_remaining IS 'Seconds purchased through packages or subscriptions';


--
-- TOC entry 6917 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.auto_topup_consent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.auto_topup_consent_at IS 'Timestamp when user consented to auto top-up for PCI/PSD2 compliance';


--
-- TOC entry 6918 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.bonus_month_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.bonus_month_year IS 'Track monthly bonus usage in YYYY-MM format for monthly cap enforcement';


--
-- TOC entry 6919 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.bonus_used_this_month; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.bonus_used_this_month IS 'Seconds of bonus time used this month (resets monthly)';


--
-- TOC entry 6920 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.bonus_monthly_cap; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.bonus_monthly_cap IS 'Maximum bonus seconds allowed per month (free tier abuse prevention)';


--
-- TOC entry 6921 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.second_buckets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.second_buckets IS 'JSONB array of time buckets with expert-recommended structure for consumption tracking';


--
-- TOC entry 6922 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.total_paid_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.total_paid_seconds IS 'Computed total of remaining paid seconds across all buckets';


--
-- TOC entry 6923 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.total_bonus_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.total_bonus_seconds IS 'Computed total of remaining bonus seconds across all buckets';


--
-- TOC entry 6924 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.next_expiry_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.next_expiry_at IS 'Computed timestamp of next bucket expiry for proactive notifications';


--
-- TOC entry 6925 (class 0 OID 0)
-- Dependencies: 344
-- Name: COLUMN user_ai_time_balance.pricing_catalog_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_balance.pricing_catalog_version IS 'Version tag of pricing catalog used for this user';


--
-- TOC entry 345 (class 1259 OID 37714)
-- Name: user_ai_time_consumption; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_time_consumption (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id text NOT NULL,
    build_id text NOT NULL,
    version_id text NOT NULL,
    session_id text,
    idempotency_key text NOT NULL,
    operation_type text NOT NULL,
    started_at timestamp without time zone NOT NULL,
    ended_at timestamp without time zone NOT NULL,
    duration_ms integer NOT NULL,
    duration_seconds integer NOT NULL,
    billable_seconds integer NOT NULL,
    welcome_bonus_used_seconds integer DEFAULT 0,
    daily_gift_used_seconds integer DEFAULT 0,
    paid_seconds_used integer DEFAULT 0,
    balance_before_seconds jsonb NOT NULL,
    balance_after_seconds jsonb NOT NULL,
    effective_rate_per_minute numeric(10,4),
    total_cost_usd numeric(10,2),
    success boolean DEFAULT true,
    error_type text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_ai_time_consumption_check CHECK ((billable_seconds >= duration_seconds)),
    CONSTRAINT user_ai_time_consumption_daily_gift_used_seconds_check CHECK ((daily_gift_used_seconds >= 0)),
    CONSTRAINT user_ai_time_consumption_duration_ms_check CHECK ((duration_ms > 0)),
    CONSTRAINT user_ai_time_consumption_duration_seconds_check CHECK ((duration_seconds > 0)),
    CONSTRAINT user_ai_time_consumption_operation_type_check_v2 CHECK ((operation_type = ANY (ARRAY['main_build'::text, 'metadata_generation'::text, 'update'::text, 'plan_consultation'::text, 'plan_question'::text, 'plan_feature'::text, 'plan_fix'::text, 'plan_analysis'::text]))),
    CONSTRAINT user_ai_time_consumption_paid_seconds_used_check CHECK ((paid_seconds_used >= 0)),
    CONSTRAINT user_ai_time_consumption_welcome_bonus_used_seconds_check CHECK ((welcome_bonus_used_seconds >= 0))
);

ALTER TABLE ONLY public.user_ai_time_consumption FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6926 (class 0 OID 0)
-- Dependencies: 345
-- Name: TABLE user_ai_time_consumption; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_ai_time_consumption IS 'Records all AI time consumption with billing breakdown and reconciliation data';


--
-- TOC entry 6927 (class 0 OID 0)
-- Dependencies: 345
-- Name: COLUMN user_ai_time_consumption.idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_consumption.idempotency_key IS 'Prevents duplicate billing for same operation';


--
-- TOC entry 6928 (class 0 OID 0)
-- Dependencies: 345
-- Name: COLUMN user_ai_time_consumption.billable_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_consumption.billable_seconds IS 'Actual seconds billed (rounded up to nearest 10-second increment)';


--
-- TOC entry 6929 (class 0 OID 0)
-- Dependencies: 345
-- Name: COLUMN user_ai_time_consumption.balance_before_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_consumption.balance_before_seconds IS 'Balance snapshot before consumption for audit trail';


--
-- TOC entry 346 (class 1259 OID 37745)
-- Name: user_ai_time_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_time_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    purchase_type text NOT NULL,
    package_name text,
    minutes_purchased numeric(10,2) NOT NULL,
    price numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text,
    payment_method text,
    payment_id text,
    payment_status text DEFAULT 'pending'::text,
    tax_rate numeric(5,4),
    tax_amount numeric(10,2),
    tax_jurisdiction text,
    purchased_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    retention_until timestamp without time zone DEFAULT (now() + '7 years'::interval),
    notes text,
    CONSTRAINT user_ai_time_purchases_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT user_ai_time_purchases_purchase_type_check CHECK ((purchase_type = ANY (ARRAY['package'::text, 'subscription'::text, 'bonus'::text])))
);

ALTER TABLE ONLY public.user_ai_time_purchases FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6930 (class 0 OID 0)
-- Dependencies: 346
-- Name: TABLE user_ai_time_purchases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_ai_time_purchases IS 'Records all AI time purchases with tax compliance and 7-year retention';


--
-- TOC entry 6931 (class 0 OID 0)
-- Dependencies: 346
-- Name: COLUMN user_ai_time_purchases.retention_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_time_purchases.retention_until IS '7-year retention for tax compliance requirements';


--
-- TOC entry 302 (class 1259 OID 17645)
-- Name: user_bonuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_bonuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    metric text NOT NULL,
    amount integer NOT NULL,
    used_amount integer DEFAULT 0 NOT NULL,
    reason text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ONLY public.user_bonuses FORCE ROW LEVEL SECURITY;


--
-- TOC entry 356 (class 1259 OID 45170)
-- Name: versioning_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.versioning_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id character varying(255) NOT NULL,
    metric_type character varying(50) NOT NULL,
    metric_value numeric NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.versioning_metrics FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6932 (class 0 OID 0)
-- Dependencies: 356
-- Name: TABLE versioning_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.versioning_metrics IS 'Operational metrics for publication system monitoring';


--
-- TOC entry 303 (class 1259 OID 17654)
-- Name: webhook_dead_letter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_dead_letter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gateway character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    error_message text,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    retry_history jsonb[] DEFAULT ARRAY[]::jsonb[],
    created_at timestamp with time zone DEFAULT now(),
    last_retry_at timestamp with time zone
);

ALTER TABLE ONLY public.webhook_dead_letter FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6933 (class 0 OID 0)
-- Dependencies: 303
-- Name: TABLE webhook_dead_letter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_dead_letter IS 'Failed webhook events for retry processing';


--
-- TOC entry 329 (class 1259 OID 28004)
-- Name: webhook_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_failures (
    id integer NOT NULL,
    build_id character varying(26) NOT NULL,
    event_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0,
    retry_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- TOC entry 6934 (class 0 OID 0)
-- Dependencies: 329
-- Name: TABLE webhook_failures; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_failures IS 'Stores failed webhook deliveries for retry with exponential backoff';


--
-- TOC entry 328 (class 1259 OID 28003)
-- Name: webhook_failures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_failures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6935 (class 0 OID 0)
-- Dependencies: 328
-- Name: webhook_failures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_failures_id_seq OWNED BY public.webhook_failures.id;


--
-- TOC entry 326 (class 1259 OID 27991)
-- Name: worker_build_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.worker_build_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6936 (class 0 OID 0)
-- Dependencies: 326
-- Name: worker_build_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.worker_build_events_id_seq OWNED BY public.project_build_events.id;


--
-- TOC entry 324 (class 1259 OID 26790)
-- Name: worker_task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_task_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id text NOT NULL,
    depends_on text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.worker_task_dependencies FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6937 (class 0 OID 0)
-- Dependencies: 324
-- Name: TABLE worker_task_dependencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_task_dependencies IS 'DAG dependencies between tasks';


--
-- TOC entry 322 (class 1259 OID 26759)
-- Name: worker_task_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_task_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id text NOT NULL,
    project_id text NOT NULL,
    user_id text NOT NULL,
    build_id text NOT NULL,
    original_prompt text NOT NULL,
    estimated_duration integer NOT NULL,
    metadata jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.worker_task_plans FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6938 (class 0 OID 0)
-- Dependencies: 322
-- Name: TABLE worker_task_plans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_task_plans IS 'Stores task execution plans for builds';


--
-- TOC entry 6939 (class 0 OID 0)
-- Dependencies: 322
-- Name: COLUMN worker_task_plans.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.worker_task_plans.metadata IS 'Contains framework, projectType, complexity, cycleRecovery flags';


--
-- TOC entry 323 (class 1259 OID 26771)
-- Name: worker_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id text NOT NULL,
    plan_id text NOT NULL,
    build_id text NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    estimated_duration integer NOT NULL,
    priority integer NOT NULL,
    status text NOT NULL,
    input jsonb NOT NULL,
    output jsonb,
    error text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_ms integer,
    token_usage jsonb,
    fingerprint text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT worker_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'timeout'::text]))),
    CONSTRAINT worker_tasks_type_check CHECK ((type = ANY (ARRAY['create_file'::text, 'modify_file'::text, 'create_component'::text, 'setup_config'::text, 'install_deps'::text])))
);

ALTER TABLE ONLY public.worker_tasks FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6940 (class 0 OID 0)
-- Dependencies: 323
-- Name: TABLE worker_tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_tasks IS 'Individual tasks within a plan';


--
-- TOC entry 6941 (class 0 OID 0)
-- Dependencies: 323
-- Name: COLUMN worker_tasks.fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.worker_tasks.fingerprint IS 'SHA256 hash for idempotent task execution';


--
-- TOC entry 331 (class 1259 OID 28017)
-- Name: worker_webhook_failures-depreciated; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."worker_webhook_failures-depreciated" (
    id integer NOT NULL,
    build_id character varying(26) NOT NULL,
    event_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0,
    retry_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public."worker_webhook_failures-depreciated" FORCE ROW LEVEL SECURITY;


--
-- TOC entry 6942 (class 0 OID 0)
-- Dependencies: 331
-- Name: TABLE "worker_webhook_failures-depreciated"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."worker_webhook_failures-depreciated" IS 'Stores failed webhook deliveries for retry with exponential backoff';


--
-- TOC entry 330 (class 1259 OID 28016)
-- Name: worker_webhook_failures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.worker_webhook_failures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 6943 (class 0 OID 0)
-- Dependencies: 330
-- Name: worker_webhook_failures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.worker_webhook_failures_id_seq OWNED BY public."worker_webhook_failures-depreciated".id;


--
-- TOC entry 304 (class 1259 OID 17664)
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- TOC entry 350 (class 1259 OID 38114)
-- Name: messages_2025_07_27; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_07_27 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 351 (class 1259 OID 38125)
-- Name: messages_2025_07_28; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_07_28 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 352 (class 1259 OID 38136)
-- Name: messages_2025_07_29; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_07_29 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 353 (class 1259 OID 38147)
-- Name: messages_2025_07_30; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_07_30 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 354 (class 1259 OID 38158)
-- Name: messages_2025_07_31; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_07_31 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 305 (class 1259 OID 17671)
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- TOC entry 306 (class 1259 OID 17674)
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- TOC entry 307 (class 1259 OID 17682)
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 308 (class 1259 OID 17683)
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- TOC entry 6944 (class 0 OID 0)
-- Dependencies: 308
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- TOC entry 381 (class 1259 OID 80880)
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 309 (class 1259 OID 17692)
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 310 (class 1259 OID 17696)
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer
);


--
-- TOC entry 6945 (class 0 OID 0)
-- Dependencies: 310
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- TOC entry 380 (class 1259 OID 80836)
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 311 (class 1259 OID 17706)
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- TOC entry 312 (class 1259 OID 17713)
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 313 (class 1259 OID 17721)
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- TOC entry 314 (class 1259 OID 17726)
-- Name: seed_files; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.seed_files (
    path text NOT NULL,
    hash text NOT NULL
);


--
-- TOC entry 4326 (class 0 OID 0)
-- Name: messages_2025_07_27; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_07_27 FOR VALUES FROM ('2025-07-27 00:00:00') TO ('2025-07-28 00:00:00');


--
-- TOC entry 4327 (class 0 OID 0)
-- Name: messages_2025_07_28; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_07_28 FOR VALUES FROM ('2025-07-28 00:00:00') TO ('2025-07-29 00:00:00');


--
-- TOC entry 4328 (class 0 OID 0)
-- Name: messages_2025_07_29; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_07_29 FOR VALUES FROM ('2025-07-29 00:00:00') TO ('2025-07-30 00:00:00');


--
-- TOC entry 4329 (class 0 OID 0)
-- Name: messages_2025_07_30; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_07_30 FOR VALUES FROM ('2025-07-30 00:00:00') TO ('2025-07-31 00:00:00');


--
-- TOC entry 4330 (class 0 OID 0)
-- Name: messages_2025_07_31; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_07_31 FOR VALUES FROM ('2025-07-31 00:00:00') TO ('2025-08-01 00:00:00');


--
-- TOC entry 4341 (class 2604 OID 17731)
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- TOC entry 4811 (class 2604 OID 90050)
-- Name: admin_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions ALTER COLUMN id SET DEFAULT nextval('public.admin_sessions_id_seq'::regclass);


--
-- TOC entry 4541 (class 2604 OID 33849)
-- Name: project_ai_session_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_ai_session_metrics ALTER COLUMN id SET DEFAULT nextval('public.claude_session_metrics_id_seq'::regclass);


--
-- TOC entry 4512 (class 2604 OID 27995)
-- Name: project_build_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_events ALTER COLUMN id SET DEFAULT nextval('public.worker_build_events_id_seq'::regclass);


--
-- TOC entry 4534 (class 2604 OID 33833)
-- Name: project_build_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_metrics ALTER COLUMN id SET DEFAULT nextval('public.project_build_metrics_id_seq'::regclass);


--
-- TOC entry 4648 (class 2604 OID 53368)
-- Name: project_chat_log_minimal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_log_minimal ALTER COLUMN id SET DEFAULT nextval('public.chat_log_minimal_id_seq'::regclass);


--
-- TOC entry 4555 (class 2604 OID 33868)
-- Name: project_deployment_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_deployment_metrics ALTER COLUMN id SET DEFAULT nextval('public.deployment_metrics_id_seq'::regclass);


--
-- TOC entry 4561 (class 2604 OID 33882)
-- Name: project_error_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_error_metrics ALTER COLUMN id SET DEFAULT nextval('public.error_metrics_id_seq'::regclass);


--
-- TOC entry 4571 (class 2604 OID 33987)
-- Name: project_metrics_summary id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_metrics_summary ALTER COLUMN id SET DEFAULT nextval('public.project_metrics_summary_id_seq'::regclass);


--
-- TOC entry 4608 (class 2604 OID 37832)
-- Name: r2_cleanup_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.r2_cleanup_logs ALTER COLUMN id SET DEFAULT nextval('public.r2_cleanup_logs_id_seq'::regclass);


--
-- TOC entry 4699 (class 2604 OID 73215)
-- Name: security_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_audit_log ALTER COLUMN id SET DEFAULT nextval('public.security_audit_log_id_seq'::regclass);


--
-- TOC entry 4516 (class 2604 OID 28007)
-- Name: webhook_failures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_failures ALTER COLUMN id SET DEFAULT nextval('public.webhook_failures_id_seq'::regclass);


--
-- TOC entry 4519 (class 2604 OID 28020)
-- Name: worker_webhook_failures-depreciated id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."worker_webhook_failures-depreciated" ALTER COLUMN id SET DEFAULT nextval('public.worker_webhook_failures_id_seq'::regclass);


--
-- TOC entry 5093 (class 2606 OID 17733)
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- TOC entry 5077 (class 2606 OID 17735)
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- TOC entry 5081 (class 2606 OID 17737)
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- TOC entry 5086 (class 2606 OID 17739)
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- TOC entry 5088 (class 2606 OID 17741)
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- TOC entry 5091 (class 2606 OID 17743)
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- TOC entry 5095 (class 2606 OID 17745)
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- TOC entry 5098 (class 2606 OID 17747)
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- TOC entry 5101 (class 2606 OID 17749)
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- TOC entry 5103 (class 2606 OID 17751)
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- TOC entry 5108 (class 2606 OID 17753)
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5116 (class 2606 OID 17755)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5119 (class 2606 OID 17757)
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- TOC entry 5122 (class 2606 OID 17759)
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- TOC entry 5124 (class 2606 OID 17761)
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 5129 (class 2606 OID 17763)
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- TOC entry 5132 (class 2606 OID 17765)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 5135 (class 2606 OID 17767)
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5140 (class 2606 OID 17769)
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- TOC entry 5143 (class 2606 OID 17771)
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 5155 (class 2606 OID 17773)
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- TOC entry 5157 (class 2606 OID 17775)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5347 (class 2606 OID 19789)
-- Name: ab_test_assignments ab_test_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5353 (class 2606 OID 19817)
-- Name: ab_test_results ab_test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_results
    ADD CONSTRAINT ab_test_results_pkey PRIMARY KEY (id);


--
-- TOC entry 5343 (class 2606 OID 19775)
-- Name: ab_test_variants ab_test_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_variants
    ADD CONSTRAINT ab_test_variants_pkey PRIMARY KEY (id);


--
-- TOC entry 5337 (class 2606 OID 19762)
-- Name: ab_tests ab_tests_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_tests
    ADD CONSTRAINT ab_tests_name_key UNIQUE (name);


--
-- TOC entry 5339 (class 2606 OID 19760)
-- Name: ab_tests ab_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_tests
    ADD CONSTRAINT ab_tests_pkey PRIMARY KEY (id);


--
-- TOC entry 5777 (class 2606 OID 90108)
-- Name: admin_action_log_app admin_action_log_app_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_log_app
    ADD CONSTRAINT admin_action_log_app_pkey PRIMARY KEY (id);


--
-- TOC entry 5754 (class 2606 OID 89895)
-- Name: admin_action_log admin_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_log
    ADD CONSTRAINT admin_action_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5159 (class 2606 OID 17777)
-- Name: admin_alerts admin_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_pkey PRIMARY KEY (id);


--
-- TOC entry 5769 (class 2606 OID 90057)
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5771 (class 2606 OID 90059)
-- Name: admin_sessions admin_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_session_id_key UNIQUE (session_id);


--
-- TOC entry 5786 (class 2606 OID 90138)
-- Name: admin_two_person_queue admin_two_person_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_two_person_queue
    ADD CONSTRAINT admin_two_person_queue_pkey PRIMARY KEY (id);


--
-- TOC entry 5687 (class 2606 OID 81569)
-- Name: advisor_adjustments advisor_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_adjustments
    ADD CONSTRAINT advisor_adjustments_pkey PRIMARY KEY (id);


--
-- TOC entry 5731 (class 2606 OID 87022)
-- Name: advisor_analytics_summary advisor_analytics_summary_advisor_id_period_start_period_en_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_analytics_summary
    ADD CONSTRAINT advisor_analytics_summary_advisor_id_period_start_period_en_key UNIQUE (advisor_id, period_start, period_end);


--
-- TOC entry 5733 (class 2606 OID 87020)
-- Name: advisor_analytics_summary advisor_analytics_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_analytics_summary
    ADD CONSTRAINT advisor_analytics_summary_pkey PRIMARY KEY (id);


--
-- TOC entry 5699 (class 2606 OID 84055)
-- Name: advisor_application_drafts advisor_application_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_application_drafts
    ADD CONSTRAINT advisor_application_drafts_pkey PRIMARY KEY (id);


--
-- TOC entry 5728 (class 2606 OID 86943)
-- Name: advisor_availability_settings advisor_availability_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_availability_settings
    ADD CONSTRAINT advisor_availability_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 5682 (class 2606 OID 81552)
-- Name: advisor_consultation_charges advisor_consultation_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultation_charges
    ADD CONSTRAINT advisor_consultation_charges_pkey PRIMARY KEY (id);


--
-- TOC entry 5684 (class 2606 OID 81554)
-- Name: advisor_consultation_charges advisor_consultation_charges_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultation_charges
    ADD CONSTRAINT advisor_consultation_charges_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- TOC entry 5668 (class 2606 OID 81524)
-- Name: advisor_consultations advisor_consultations_cal_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_cal_booking_id_key UNIQUE (cal_booking_id);


--
-- TOC entry 5670 (class 2606 OID 81522)
-- Name: advisor_consultations advisor_consultations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_pkey PRIMARY KEY (id);


--
-- TOC entry 5705 (class 2606 OID 84073)
-- Name: advisor_event_timeline advisor_event_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_event_timeline
    ADD CONSTRAINT advisor_event_timeline_pkey PRIMARY KEY (id);


--
-- TOC entry 5724 (class 2606 OID 85665)
-- Name: advisor_free_consultation_metrics advisor_free_consultation_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_free_consultation_metrics
    ADD CONSTRAINT advisor_free_consultation_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5693 (class 2606 OID 81624)
-- Name: advisor_payouts advisor_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_payouts
    ADD CONSTRAINT advisor_payouts_pkey PRIMARY KEY (id);


--
-- TOC entry 5696 (class 2606 OID 81642)
-- Name: advisor_processed_calcom_events advisor_processed_calcom_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_processed_calcom_events
    ADD CONSTRAINT advisor_processed_calcom_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5690 (class 2606 OID 81597)
-- Name: advisor_reviews advisor_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_reviews
    ADD CONSTRAINT advisor_reviews_pkey PRIMARY KEY (id);


--
-- TOC entry 5711 (class 2606 OID 85497)
-- Name: advisor_specialty_translations advisor_specialty_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_specialty_translations
    ADD CONSTRAINT advisor_specialty_translations_pkey PRIMARY KEY (id);


--
-- TOC entry 5718 (class 2606 OID 85523)
-- Name: advisor_translation_metrics advisor_translation_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_translation_metrics
    ADD CONSTRAINT advisor_translation_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5656 (class 2606 OID 81496)
-- Name: advisors advisors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisors
    ADD CONSTRAINT advisors_pkey PRIMARY KEY (id);


--
-- TOC entry 5658 (class 2606 OID 81498)
-- Name: advisors advisors_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisors
    ADD CONSTRAINT advisors_user_id_key UNIQUE (user_id);


--
-- TOC entry 5924 (class 2606 OID 92039)
-- Name: ai_time_ledger ai_time_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_time_ledger
    ADD CONSTRAINT ai_time_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 5164 (class 2606 OID 17779)
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (hash);


--
-- TOC entry 5879 (class 2606 OID 91929)
-- Name: billing_customers billing_customers_payment_provider_provider_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_payment_provider_provider_customer_id_key UNIQUE (payment_provider, provider_customer_id);


--
-- TOC entry 5881 (class 2606 OID 91925)
-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (id);


--
-- TOC entry 5883 (class 2606 OID 91927)
-- Name: billing_customers billing_customers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_user_id_key UNIQUE (user_id);


--
-- TOC entry 5889 (class 2606 OID 91953)
-- Name: billing_invoices billing_invoices_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_idempotency_key_key UNIQUE (idempotency_key);


--
-- TOC entry 5891 (class 2606 OID 91951)
-- Name: billing_invoices billing_invoices_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_order_id_key UNIQUE (order_id);


--
-- TOC entry 5893 (class 2606 OID 91949)
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- TOC entry 5906 (class 2606 OID 92005)
-- Name: billing_payments billing_payments_payment_provider_provider_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_payment_provider_provider_payment_id_key UNIQUE (payment_provider, provider_payment_id);


--
-- TOC entry 5908 (class 2606 OID 92003)
-- Name: billing_payments billing_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5898 (class 2606 OID 91978)
-- Name: billing_subscriptions billing_subscriptions_payment_provider_provider_subscriptio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_payment_provider_provider_subscriptio_key UNIQUE (payment_provider, provider_subscription_id);


--
-- TOC entry 5900 (class 2606 OID 91976)
-- Name: billing_subscriptions billing_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);


--
-- TOC entry 5167 (class 2606 OID 17781)
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- TOC entry 5169 (class 2606 OID 17783)
-- Name: branches branches_project_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_project_id_name_key UNIQUE (project_id, name);


--
-- TOC entry 5554 (class 2606 OID 53339)
-- Name: build_events_daily_stats build_events_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_events_daily_stats
    ADD CONSTRAINT build_events_daily_stats_pkey PRIMARY KEY (date);


--
-- TOC entry 5556 (class 2606 OID 53377)
-- Name: project_chat_log_minimal chat_log_minimal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_log_minimal
    ADD CONSTRAINT chat_log_minimal_pkey PRIMARY KEY (id);


--
-- TOC entry 5580 (class 2606 OID 53659)
-- Name: project_chat_plan_sessions chat_plan_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_plan_sessions
    ADD CONSTRAINT chat_plan_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5582 (class 2606 OID 53661)
-- Name: project_chat_plan_sessions chat_plan_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_plan_sessions
    ADD CONSTRAINT chat_plan_sessions_session_id_key UNIQUE (session_id);


--
-- TOC entry 5467 (class 2606 OID 33863)
-- Name: project_ai_session_metrics claude_session_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_ai_session_metrics
    ADD CONSTRAINT claude_session_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5172 (class 2606 OID 17785)
-- Name: claude_user_usage claude_user_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claude_user_usage
    ADD CONSTRAINT claude_user_usage_pkey PRIMARY KEY (id);


--
-- TOC entry 5174 (class 2606 OID 17787)
-- Name: claude_user_usage claude_user_usage_user_id_window_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claude_user_usage
    ADD CONSTRAINT claude_user_usage_user_id_window_start_key UNIQUE (user_id, window_start);


--
-- TOC entry 5177 (class 2606 OID 17789)
-- Name: commits commits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_pkey PRIMARY KEY (id);


--
-- TOC entry 5357 (class 2606 OID 19934)
-- Name: component_map component_map_ai_component_name_industry_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_map
    ADD CONSTRAINT component_map_ai_component_name_industry_key UNIQUE (ai_component_name, industry);


--
-- TOC entry 5359 (class 2606 OID 19932)
-- Name: component_map component_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_map
    ADD CONSTRAINT component_map_pkey PRIMARY KEY (id);


--
-- TOC entry 5181 (class 2606 OID 17791)
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- TOC entry 5473 (class 2606 OID 33961)
-- Name: project_deployment_metrics deployment_metrics_build_id_created_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_deployment_metrics
    ADD CONSTRAINT deployment_metrics_build_id_created_at_key UNIQUE (build_id, created_at);


--
-- TOC entry 5475 (class 2606 OID 33875)
-- Name: project_deployment_metrics deployment_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_deployment_metrics
    ADD CONSTRAINT deployment_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5480 (class 2606 OID 33888)
-- Name: project_error_metrics error_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_error_metrics
    ADD CONSTRAINT error_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5928 (class 2606 OID 92244)
-- Name: exchange_rates exchange_rates_from_currency_to_currency_effective_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_from_currency_to_currency_effective_date_key UNIQUE (from_currency, to_currency, effective_date);


--
-- TOC entry 5930 (class 2606 OID 92242)
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- TOC entry 5183 (class 2606 OID 17799)
-- Name: export_logs export_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_logs
    ADD CONSTRAINT export_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5790 (class 2606 OID 90185)
-- Name: github_sync_operations github_sync_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_sync_operations
    ADD CONSTRAINT github_sync_operations_pkey PRIMARY KEY (id);


--
-- TOC entry 5782 (class 2606 OID 90122)
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- TOC entry 5610 (class 2606 OID 69662)
-- Name: oauth_exchange_idempotency oauth_exchange_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_exchange_idempotency
    ADD CONSTRAINT oauth_exchange_idempotency_pkey PRIMARY KEY (id);


--
-- TOC entry 5605 (class 2606 OID 69650)
-- Name: oauth_state_nonces oauth_state_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state_nonces
    ADD CONSTRAINT oauth_state_nonces_pkey PRIMARY KEY (id);


--
-- TOC entry 5192 (class 2606 OID 17805)
-- Name: organization_members organization_members_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- TOC entry 5194 (class 2606 OID 17807)
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- TOC entry 5196 (class 2606 OID 17809)
-- Name: organization_usage organization_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage
    ADD CONSTRAINT organization_usage_pkey PRIMARY KEY (organization_id, period_start, metric_name);


--
-- TOC entry 5201 (class 2606 OID 17811)
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- TOC entry 5203 (class 2606 OID 17813)
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- TOC entry 5206 (class 2606 OID 17819)
-- Name: plan_change_log plan_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_change_log
    ADD CONSTRAINT plan_change_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5209 (class 2606 OID 17821)
-- Name: plan_limits plan_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_limits
    ADD CONSTRAINT plan_limits_pkey PRIMARY KEY (plan_name);


--
-- TOC entry 5859 (class 2606 OID 91609)
-- Name: pricing_catalog_versions pricing_catalog_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_catalog_versions
    ADD CONSTRAINT pricing_catalog_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 5861 (class 2606 OID 91611)
-- Name: pricing_catalog_versions pricing_catalog_versions_version_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_catalog_versions
    ADD CONSTRAINT pricing_catalog_versions_version_tag_key UNIQUE (version_tag);


--
-- TOC entry 5873 (class 2606 OID 91905)
-- Name: pricing_item_prices pricing_item_prices_payment_provider_provider_price_externa_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_item_prices
    ADD CONSTRAINT pricing_item_prices_payment_provider_provider_price_externa_key UNIQUE (payment_provider, provider_price_external_id);


--
-- TOC entry 5875 (class 2606 OID 91901)
-- Name: pricing_item_prices pricing_item_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_item_prices
    ADD CONSTRAINT pricing_item_prices_pkey PRIMARY KEY (id);


--
-- TOC entry 5877 (class 2606 OID 91903)
-- Name: pricing_item_prices pricing_item_prices_pricing_item_id_payment_provider_curren_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_item_prices
    ADD CONSTRAINT pricing_item_prices_pricing_item_id_payment_provider_curren_key UNIQUE (pricing_item_id, payment_provider, currency);


--
-- TOC entry 5867 (class 2606 OID 91648)
-- Name: pricing_items pricing_items_catalog_version_id_item_key_currency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_items
    ADD CONSTRAINT pricing_items_catalog_version_id_item_key_currency_key UNIQUE (catalog_version_id, item_key, currency);


--
-- TOC entry 5869 (class 2606 OID 91646)
-- Name: pricing_items pricing_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_items
    ADD CONSTRAINT pricing_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5920 (class 2606 OID 92029)
-- Name: processed_payment_events processed_payment_events_payment_provider_provider_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_payment_events
    ADD CONSTRAINT processed_payment_events_payment_provider_provider_event_id_key UNIQUE (payment_provider, provider_event_id);


--
-- TOC entry 5922 (class 2606 OID 92027)
-- Name: processed_payment_events processed_payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_payment_events
    ADD CONSTRAINT processed_payment_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5651 (class 2606 OID 81431)
-- Name: processed_stripe_events processed_stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_stripe_events
    ADD CONSTRAINT processed_stripe_events_pkey PRIMARY KEY (stripe_event_id);


--
-- TOC entry 5647 (class 2606 OID 81052)
-- Name: project_advisors project_advisors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_advisors
    ADD CONSTRAINT project_advisors_pkey PRIMARY KEY (project_id, advisor_id);


--
-- TOC entry 5463 (class 2606 OID 33844)
-- Name: project_build_metrics project_build_metrics_build_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_metrics
    ADD CONSTRAINT project_build_metrics_build_id_key UNIQUE (build_id);


--
-- TOC entry 5465 (class 2606 OID 33842)
-- Name: project_build_metrics project_build_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_metrics
    ADD CONSTRAINT project_build_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5641 (class 2606 OID 81013)
-- Name: project_chat_last_read project_chat_last_read_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_last_read
    ADD CONSTRAINT project_chat_last_read_pkey PRIMARY KEY (project_id, user_id);


--
-- TOC entry 5638 (class 2606 OID 80997)
-- Name: project_chat_read_receipts project_chat_read_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_read_receipts
    ADD CONSTRAINT project_chat_read_receipts_pkey PRIMARY KEY (project_id, message_id, user_id);


--
-- TOC entry 5635 (class 2606 OID 80920)
-- Name: project_chat_seq project_chat_seq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_seq
    ADD CONSTRAINT project_chat_seq_pkey PRIMARY KEY (project_id);


--
-- TOC entry 5215 (class 2606 OID 17823)
-- Name: project_collaborators project_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_pkey PRIMARY KEY (id);


--
-- TOC entry 5217 (class 2606 OID 17825)
-- Name: project_collaborators project_collaborators_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- TOC entry 5622 (class 2606 OID 69783)
-- Name: project_integrations project_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_integrations
    ADD CONSTRAINT project_integrations_pkey PRIMARY KEY (id);


--
-- TOC entry 5644 (class 2606 OID 81032)
-- Name: project_memberships project_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_pkey PRIMARY KEY (project_id, user_id);


--
-- TOC entry 5492 (class 2606 OID 33989)
-- Name: project_metrics_summary project_metrics_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_metrics_summary
    ADD CONSTRAINT project_metrics_summary_pkey PRIMARY KEY (id);


--
-- TOC entry 5494 (class 2606 OID 34146)
-- Name: project_metrics_summary project_metrics_summary_project_id_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_metrics_summary
    ADD CONSTRAINT project_metrics_summary_project_id_user_id_date_key UNIQUE (project_id, user_id, date);


--
-- TOC entry 5544 (class 2606 OID 45159)
-- Name: project_published_domains project_published_domains_domain_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_published_domains
    ADD CONSTRAINT project_published_domains_domain_name_key UNIQUE (domain_name);


--
-- TOC entry 5546 (class 2606 OID 45271)
-- Name: project_published_domains project_published_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_published_domains
    ADD CONSTRAINT project_published_domains_pkey PRIMARY KEY (project_id, domain_name);


--
-- TOC entry 5441 (class 2606 OID 31450)
-- Name: project_recommendations project_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_recommendations
    ADD CONSTRAINT project_recommendations_pkey PRIMARY KEY (id);


--
-- TOC entry 5443 (class 2606 OID 31452)
-- Name: project_recommendations project_recommendations_project_id_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_recommendations
    ADD CONSTRAINT project_recommendations_project_id_version_id_key UNIQUE (project_id, version_id);


--
-- TOC entry 5455 (class 2606 OID 33756)
-- Name: project_versions_metadata-delete project_versions_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT project_versions_metadata_pkey PRIMARY KEY (version_id);


--
-- TOC entry 5376 (class 2606 OID 25574)
-- Name: project_versions project_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT project_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 5378 (class 2606 OID 25576)
-- Name: project_versions project_versions_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT project_versions_version_id_key UNIQUE (version_id);


--
-- TOC entry 5241 (class 2606 OID 17827)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- TOC entry 5243 (class 2606 OID 17829)
-- Name: projects projects_subdomain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_subdomain_key UNIQUE (subdomain);


--
-- TOC entry 5821 (class 2606 OID 91402)
-- Name: promotion_artifacts promotion_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT promotion_artifacts_pkey PRIMARY KEY (id);


--
-- TOC entry 5814 (class 2606 OID 91383)
-- Name: promotion_codes promotion_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_codes
    ADD CONSTRAINT promotion_codes_pkey PRIMARY KEY (id);


--
-- TOC entry 5952 (class 2606 OID 93963)
-- Name: promotion_provider_changes promotion_provider_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_provider_changes
    ADD CONSTRAINT promotion_provider_changes_pkey PRIMARY KEY (id);


--
-- TOC entry 5847 (class 2606 OID 91470)
-- Name: promotion_redemptions promotion_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_pkey PRIMARY KEY (id);


--
-- TOC entry 5946 (class 2606 OID 93818)
-- Name: promotion_regional_config promotion_regional_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_regional_config
    ADD CONSTRAINT promotion_regional_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5835 (class 2606 OID 91436)
-- Name: promotion_reservations promotion_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_reservations
    ADD CONSTRAINT promotion_reservations_pkey PRIMARY KEY (id);


--
-- TOC entry 5810 (class 2606 OID 91367)
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- TOC entry 5552 (class 2606 OID 45297)
-- Name: publication_idempotency_keys publication_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_idempotency_keys
    ADD CONSTRAINT publication_idempotency_keys_pkey PRIMARY KEY (idempotency_key);


--
-- TOC entry 5253 (class 2606 OID 17831)
-- Name: quota_audit_log quota_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_audit_log
    ADD CONSTRAINT quota_audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5259 (class 2606 OID 17833)
-- Name: quota_audit_logs quota_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_audit_logs
    ADD CONSTRAINT quota_audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5271 (class 2606 OID 17835)
-- Name: quota_rate_limits quota_rate_limits_identifier_identifier_type_window_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_rate_limits
    ADD CONSTRAINT quota_rate_limits_identifier_identifier_type_window_start_key UNIQUE (identifier, identifier_type, window_start);


--
-- TOC entry 5273 (class 2606 OID 17837)
-- Name: quota_rate_limits quota_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_rate_limits
    ADD CONSTRAINT quota_rate_limits_pkey PRIMARY KEY (id);


--
-- TOC entry 5527 (class 2606 OID 37840)
-- Name: r2_cleanup_logs r2_cleanup_logs_cleanup_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.r2_cleanup_logs
    ADD CONSTRAINT r2_cleanup_logs_cleanup_date_key UNIQUE (cleanup_date);


--
-- TOC entry 5529 (class 2606 OID 37838)
-- Name: r2_cleanup_logs r2_cleanup_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.r2_cleanup_logs
    ADD CONSTRAINT r2_cleanup_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5279 (class 2606 OID 17839)
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- TOC entry 5281 (class 2606 OID 17841)
-- Name: referrals referrals_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referral_code_key UNIQUE (referral_code);


--
-- TOC entry 5934 (class 2606 OID 92254)
-- Name: regional_calendars regional_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regional_calendars
    ADD CONSTRAINT regional_calendars_pkey PRIMARY KEY (id);


--
-- TOC entry 5936 (class 2606 OID 92256)
-- Name: regional_calendars regional_calendars_region_code_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regional_calendars
    ADD CONSTRAINT regional_calendars_region_code_date_key UNIQUE (region_code, date);


--
-- TOC entry 5628 (class 2606 OID 73221)
-- Name: security_audit_log security_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_audit_log
    ADD CONSTRAINT security_audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5716 (class 2606 OID 85499)
-- Name: advisor_specialty_translations specialty_translations_unique_key_lang; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_specialty_translations
    ADD CONSTRAINT specialty_translations_unique_key_lang UNIQUE (specialty_key, language_code);


--
-- TOC entry 5285 (class 2606 OID 17843)
-- Name: storage_audit_log storage_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_audit_log
    ADD CONSTRAINT storage_audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5654 (class 2606 OID 81441)
-- Name: stripe_raw_events stripe_raw_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_raw_events
    ADD CONSTRAINT stripe_raw_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5600 (class 2606 OID 69632)
-- Name: supabase_account_discovery supabase_account_discovery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_account_discovery
    ADD CONSTRAINT supabase_account_discovery_pkey PRIMARY KEY (id);


--
-- TOC entry 5615 (class 2606 OID 69676)
-- Name: supabase_breakglass_recovery supabase_breakglass_recovery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_breakglass_recovery
    ADD CONSTRAINT supabase_breakglass_recovery_pkey PRIMARY KEY (id);


--
-- TOC entry 5596 (class 2606 OID 69621)
-- Name: supabase_connections supabase_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_connections
    ADD CONSTRAINT supabase_connections_pkey PRIMARY KEY (id);


--
-- TOC entry 5752 (class 2606 OID 89881)
-- Name: support_ticket_messages support_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 5019 (class 2606 OID 89913)
-- Name: support_tickets support_tickets_closed_requires_timestamp; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_closed_requires_timestamp CHECK (((status <> 'closed'::public.ticket_status) OR (closed_at IS NOT NULL))) NOT VALID;


--
-- TOC entry 5745 (class 2606 OID 89867)
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- TOC entry 5020 (class 2606 OID 89912)
-- Name: support_tickets support_tickets_resolved_when_status_ok; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_resolved_when_status_ok CHECK (((resolved_at IS NULL) OR (status = ANY (ARRAY['resolved'::public.ticket_status, 'closed'::public.ticket_status])))) NOT VALID;


--
-- TOC entry 5747 (class 2606 OID 89869)
-- Name: support_tickets support_tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);


--
-- TOC entry 5590 (class 2606 OID 65072)
-- Name: unified_chat_sessions unified_chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_chat_sessions
    ADD CONSTRAINT unified_chat_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5592 (class 2606 OID 65074)
-- Name: unified_chat_sessions unified_chat_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_chat_sessions
    ADD CONSTRAINT unified_chat_sessions_session_id_key UNIQUE (session_id);


--
-- TOC entry 5509 (class 2606 OID 37807)
-- Name: user_ai_time_consumption uniq_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_consumption
    ADD CONSTRAINT uniq_idempotency_key UNIQUE (idempotency_key);


--
-- TOC entry 6946 (class 0 OID 0)
-- Dependencies: 5509
-- Name: CONSTRAINT uniq_idempotency_key ON user_ai_time_consumption; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT uniq_idempotency_key ON public.user_ai_time_consumption IS 'Prevents duplicate billing for the same build operation';


--
-- TOC entry 5517 (class 2606 OID 37805)
-- Name: user_ai_time_purchases uniq_payment_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_purchases
    ADD CONSTRAINT uniq_payment_id UNIQUE (payment_id);


--
-- TOC entry 6947 (class 0 OID 0)
-- Dependencies: 5517
-- Name: CONSTRAINT uniq_payment_id ON user_ai_time_purchases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT uniq_payment_id ON public.user_ai_time_purchases IS 'Prevents duplicate payment processing from webhook retries or race conditions';


--
-- TOC entry 5351 (class 2606 OID 19791)
-- Name: ab_test_assignments unique_assignment_per_test; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_assignments
    ADD CONSTRAINT unique_assignment_per_test UNIQUE (test_id, session_id);


--
-- TOC entry 5266 (class 2606 OID 17853)
-- Name: usage_events unique_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT unique_idempotency_key UNIQUE (user_id, idempotency_key);


--
-- TOC entry 5496 (class 2606 OID 33902)
-- Name: project_metrics_summary unique_project_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_metrics_summary
    ADD CONSTRAINT unique_project_date UNIQUE (project_id, user_id, project_started);


--
-- TOC entry 5457 (class 2606 OID 45143)
-- Name: project_versions_metadata-delete unique_version_name_per_project; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT unique_version_name_per_project UNIQUE (project_id, version_name);


--
-- TOC entry 5823 (class 2606 OID 93764)
-- Name: promotion_artifacts uq_artifact_coupon; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT uq_artifact_coupon UNIQUE (gateway, external_coupon_id);


--
-- TOC entry 5825 (class 2606 OID 93766)
-- Name: promotion_artifacts uq_artifact_promotion_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT uq_artifact_promotion_code UNIQUE (gateway, external_promotion_code_id);


--
-- TOC entry 5617 (class 2606 OID 69678)
-- Name: supabase_breakglass_recovery uq_breakglass_connection; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_breakglass_recovery
    ADD CONSTRAINT uq_breakglass_connection UNIQUE (connection_id);


--
-- TOC entry 5602 (class 2606 OID 69634)
-- Name: supabase_account_discovery uq_connection_discovery; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_account_discovery
    ADD CONSTRAINT uq_connection_discovery UNIQUE (connection_id);


--
-- TOC entry 5612 (class 2606 OID 69664)
-- Name: oauth_exchange_idempotency uq_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_exchange_idempotency
    ADD CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key);


--
-- TOC entry 5607 (class 2606 OID 69652)
-- Name: oauth_state_nonces uq_nonce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state_nonces
    ADD CONSTRAINT uq_nonce UNIQUE (nonce);


--
-- TOC entry 5624 (class 2606 OID 69785)
-- Name: project_integrations uq_project_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_integrations
    ADD CONSTRAINT uq_project_type UNIQUE (project_id, type);


--
-- TOC entry 5850 (class 2606 OID 91472)
-- Name: promotion_redemptions uq_redemp_reservation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT uq_redemp_reservation UNIQUE (reservation_id);


--
-- TOC entry 5598 (class 2606 OID 69623)
-- Name: supabase_connections uq_user_project; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_connections
    ADD CONSTRAINT uq_user_project UNIQUE (user_id, project_id);


--
-- TOC entry 5291 (class 2606 OID 17855)
-- Name: usage_bonuses usage_bonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_bonuses
    ADD CONSTRAINT usage_bonuses_pkey PRIMARY KEY (id);


--
-- TOC entry 5268 (class 2606 OID 17857)
-- Name: usage_events usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5294 (class 2606 OID 17859)
-- Name: usage_tracking usage_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_tracking
    ADD CONSTRAINT usage_tracking_pkey PRIMARY KEY (user_id, period_start);


--
-- TOC entry 5765 (class 2606 OID 89909)
-- Name: user_admin_status user_admin_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_status
    ADD CONSTRAINT user_admin_status_pkey PRIMARY KEY (id);


--
-- TOC entry 5767 (class 2606 OID 89911)
-- Name: user_admin_status user_admin_status_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_status
    ADD CONSTRAINT user_admin_status_user_id_key UNIQUE (user_id);


--
-- TOC entry 5523 (class 2606 OID 37774)
-- Name: user_ai_consumption_metadata user_ai_consumption_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_consumption_metadata
    ADD CONSTRAINT user_ai_consumption_metadata_pkey PRIMARY KEY (consumption_id);


--
-- TOC entry 5503 (class 2606 OID 37706)
-- Name: user_ai_time_balance user_ai_time_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_balance
    ADD CONSTRAINT user_ai_time_balance_pkey PRIMARY KEY (user_id);


--
-- TOC entry 5511 (class 2606 OID 37735)
-- Name: user_ai_time_consumption user_ai_time_consumption_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_consumption
    ADD CONSTRAINT user_ai_time_consumption_idempotency_key_key UNIQUE (idempotency_key);


--
-- TOC entry 5513 (class 2606 OID 37733)
-- Name: user_ai_time_consumption user_ai_time_consumption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_consumption
    ADD CONSTRAINT user_ai_time_consumption_pkey PRIMARY KEY (id);


--
-- TOC entry 5519 (class 2606 OID 37758)
-- Name: user_ai_time_purchases user_ai_time_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_purchases
    ADD CONSTRAINT user_ai_time_purchases_pkey PRIMARY KEY (id);


--
-- TOC entry 5298 (class 2606 OID 17863)
-- Name: user_bonuses user_bonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_bonuses
    ADD CONSTRAINT user_bonuses_pkey PRIMARY KEY (id);


--
-- TOC entry 5828 (class 2606 OID 93784)
-- Name: promotion_artifacts ux_artifacts_gateway_external; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT ux_artifacts_gateway_external UNIQUE (gateway, external_coupon_id) DEFERRABLE;


--
-- TOC entry 5549 (class 2606 OID 45178)
-- Name: versioning_metrics versioning_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versioning_metrics
    ADD CONSTRAINT versioning_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 5303 (class 2606 OID 17865)
-- Name: webhook_dead_letter webhook_dead_letter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_dead_letter
    ADD CONSTRAINT webhook_dead_letter_pkey PRIMARY KEY (id);


--
-- TOC entry 5431 (class 2606 OID 28013)
-- Name: webhook_failures webhook_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_failures
    ADD CONSTRAINT webhook_failures_pkey PRIMARY KEY (id);


--
-- TOC entry 5427 (class 2606 OID 28000)
-- Name: project_build_events worker_build_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_events
    ADD CONSTRAINT worker_build_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5403 (class 2606 OID 26824)
-- Name: project_build_records worker_build_records_build_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_records
    ADD CONSTRAINT worker_build_records_build_id_key UNIQUE (build_id);


--
-- TOC entry 5405 (class 2606 OID 26822)
-- Name: project_build_records worker_build_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_records
    ADD CONSTRAINT worker_build_records_pkey PRIMARY KEY (id);


--
-- TOC entry 5396 (class 2606 OID 26798)
-- Name: worker_task_dependencies worker_task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_dependencies
    ADD CONSTRAINT worker_task_dependencies_pkey PRIMARY KEY (id);


--
-- TOC entry 5398 (class 2606 OID 26800)
-- Name: worker_task_dependencies worker_task_dependencies_task_id_depends_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_dependencies
    ADD CONSTRAINT worker_task_dependencies_task_id_depends_on_key UNIQUE (task_id, depends_on);


--
-- TOC entry 5382 (class 2606 OID 26768)
-- Name: worker_task_plans worker_task_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_plans
    ADD CONSTRAINT worker_task_plans_pkey PRIMARY KEY (id);


--
-- TOC entry 5384 (class 2606 OID 26770)
-- Name: worker_task_plans worker_task_plans_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_plans
    ADD CONSTRAINT worker_task_plans_plan_id_key UNIQUE (plan_id);


--
-- TOC entry 5390 (class 2606 OID 26782)
-- Name: worker_tasks worker_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_tasks
    ADD CONSTRAINT worker_tasks_pkey PRIMARY KEY (id);


--
-- TOC entry 5392 (class 2606 OID 26784)
-- Name: worker_tasks worker_tasks_task_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_tasks
    ADD CONSTRAINT worker_tasks_task_id_key UNIQUE (task_id);


--
-- TOC entry 5433 (class 2606 OID 28026)
-- Name: worker_webhook_failures-depreciated worker_webhook_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."worker_webhook_failures-depreciated"
    ADD CONSTRAINT worker_webhook_failures_pkey PRIMARY KEY (id);


--
-- TOC entry 5305 (class 2606 OID 17867)
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5531 (class 2606 OID 38122)
-- Name: messages_2025_07_27 messages_2025_07_27_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_07_27
    ADD CONSTRAINT messages_2025_07_27_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5533 (class 2606 OID 38133)
-- Name: messages_2025_07_28 messages_2025_07_28_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_07_28
    ADD CONSTRAINT messages_2025_07_28_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5535 (class 2606 OID 38144)
-- Name: messages_2025_07_29 messages_2025_07_29_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_07_29
    ADD CONSTRAINT messages_2025_07_29_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5537 (class 2606 OID 38155)
-- Name: messages_2025_07_30 messages_2025_07_30_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_07_30
    ADD CONSTRAINT messages_2025_07_30_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5539 (class 2606 OID 38166)
-- Name: messages_2025_07_31 messages_2025_07_31_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_07_31
    ADD CONSTRAINT messages_2025_07_31_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5310 (class 2606 OID 17869)
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- TOC entry 5307 (class 2606 OID 17871)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 5633 (class 2606 OID 80890)
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- TOC entry 5314 (class 2606 OID 17873)
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- TOC entry 5316 (class 2606 OID 17875)
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- TOC entry 5318 (class 2606 OID 17877)
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 5326 (class 2606 OID 17879)
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- TOC entry 5631 (class 2606 OID 80845)
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- TOC entry 5331 (class 2606 OID 17881)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- TOC entry 5329 (class 2606 OID 17883)
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- TOC entry 5333 (class 2606 OID 17885)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 5335 (class 2606 OID 17887)
-- Name: seed_files seed_files_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.seed_files
    ADD CONSTRAINT seed_files_pkey PRIMARY KEY (path);


--
-- TOC entry 5078 (class 1259 OID 17888)
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- TOC entry 5145 (class 1259 OID 17889)
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 5146 (class 1259 OID 17890)
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 5147 (class 1259 OID 17891)
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 5099 (class 1259 OID 17892)
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- TOC entry 5079 (class 1259 OID 17893)
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- TOC entry 5084 (class 1259 OID 17894)
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- TOC entry 6948 (class 0 OID 0)
-- Dependencies: 5084
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- TOC entry 5089 (class 1259 OID 17895)
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- TOC entry 5082 (class 1259 OID 17896)
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- TOC entry 5083 (class 1259 OID 17897)
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- TOC entry 5096 (class 1259 OID 17898)
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- TOC entry 5104 (class 1259 OID 17899)
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- TOC entry 5105 (class 1259 OID 17900)
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- TOC entry 5109 (class 1259 OID 17901)
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- TOC entry 5110 (class 1259 OID 17902)
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- TOC entry 5111 (class 1259 OID 17903)
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- TOC entry 5148 (class 1259 OID 17904)
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 5149 (class 1259 OID 17905)
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 5112 (class 1259 OID 17906)
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- TOC entry 5113 (class 1259 OID 17907)
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- TOC entry 5114 (class 1259 OID 17908)
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- TOC entry 5117 (class 1259 OID 17909)
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- TOC entry 5120 (class 1259 OID 17910)
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- TOC entry 5125 (class 1259 OID 17911)
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- TOC entry 5126 (class 1259 OID 17912)
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- TOC entry 5127 (class 1259 OID 17913)
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- TOC entry 5130 (class 1259 OID 17914)
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- TOC entry 5133 (class 1259 OID 17915)
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- TOC entry 5136 (class 1259 OID 17916)
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- TOC entry 5138 (class 1259 OID 17917)
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- TOC entry 5141 (class 1259 OID 17918)
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- TOC entry 5144 (class 1259 OID 17919)
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- TOC entry 5106 (class 1259 OID 17920)
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- TOC entry 5137 (class 1259 OID 17921)
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- TOC entry 5150 (class 1259 OID 17922)
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- TOC entry 6949 (class 0 OID 0)
-- Dependencies: 5150
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- TOC entry 5151 (class 1259 OID 17923)
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- TOC entry 5152 (class 1259 OID 17924)
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- TOC entry 5153 (class 1259 OID 17925)
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- TOC entry 5348 (class 1259 OID 19836)
-- Name: idx_ab_test_assignments_test_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_test_assignments_test_session ON public.ab_test_assignments USING btree (test_id, session_id);


--
-- TOC entry 5349 (class 1259 OID 19837)
-- Name: idx_ab_test_assignments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_test_assignments_user ON public.ab_test_assignments USING btree (user_id);


--
-- TOC entry 5354 (class 1259 OID 19838)
-- Name: idx_ab_test_results_test_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_test_results_test_variant ON public.ab_test_results USING btree (test_id, variant_id);


--
-- TOC entry 5355 (class 1259 OID 19839)
-- Name: idx_ab_test_results_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_test_results_timestamp ON public.ab_test_results USING btree ("timestamp");


--
-- TOC entry 5344 (class 1259 OID 19835)
-- Name: idx_ab_test_variants_test_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_test_variants_test_id ON public.ab_test_variants USING btree (test_id);


--
-- TOC entry 5340 (class 1259 OID 19834)
-- Name: idx_ab_tests_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_tests_dates ON public.ab_tests USING btree (start_date, end_date);


--
-- TOC entry 5341 (class 1259 OID 19833)
-- Name: idx_ab_tests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_tests_status ON public.ab_tests USING btree (status);


--
-- TOC entry 5755 (class 1259 OID 89926)
-- Name: idx_admin_action_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_action ON public.admin_action_log USING btree (action);


--
-- TOC entry 5756 (class 1259 OID 89925)
-- Name: idx_admin_action_log_admin_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_admin_user ON public.admin_action_log USING btree (admin_user_id, created_at DESC);


--
-- TOC entry 5778 (class 1259 OID 90110)
-- Name: idx_admin_action_log_app_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_app_admin ON public.admin_action_log_app USING btree (admin_user_id, created_at DESC);


--
-- TOC entry 5779 (class 1259 OID 90111)
-- Name: idx_admin_action_log_app_corr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_app_corr ON public.admin_action_log_app USING btree (correlation_id);


--
-- TOC entry 5780 (class 1259 OID 90109)
-- Name: idx_admin_action_log_app_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_app_created ON public.admin_action_log_app USING btree (created_at DESC);


--
-- TOC entry 5757 (class 1259 OID 89929)
-- Name: idx_admin_action_log_correlation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_correlation_id ON public.admin_action_log USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- TOC entry 5758 (class 1259 OID 89928)
-- Name: idx_admin_action_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_created_at ON public.admin_action_log USING btree (created_at DESC);


--
-- TOC entry 5759 (class 1259 OID 89927)
-- Name: idx_admin_action_log_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_log_resource ON public.admin_action_log USING btree (resource_type, resource_id);


--
-- TOC entry 5160 (class 1259 OID 17927)
-- Name: idx_admin_alerts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_severity ON public.admin_alerts USING btree (severity, created_at DESC);


--
-- TOC entry 5161 (class 1259 OID 17928)
-- Name: idx_admin_alerts_time_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_time_severity ON public.admin_alerts USING btree (created_at DESC, severity);


--
-- TOC entry 5162 (class 1259 OID 17929)
-- Name: idx_admin_alerts_unack; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_unack ON public.admin_alerts USING btree (acknowledged, created_at DESC) WHERE (NOT acknowledged);


--
-- TOC entry 5772 (class 1259 OID 90073)
-- Name: idx_admin_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_active ON public.admin_sessions USING btree (user_id, expires_at) WHERE (revoked_at IS NULL);


--
-- TOC entry 5773 (class 1259 OID 90072)
-- Name: idx_admin_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_expires_at ON public.admin_sessions USING btree (expires_at);


--
-- TOC entry 5774 (class 1259 OID 90071)
-- Name: idx_admin_sessions_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_session_id ON public.admin_sessions USING btree (session_id);


--
-- TOC entry 5775 (class 1259 OID 90070)
-- Name: idx_admin_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_user_id ON public.admin_sessions USING btree (user_id);


--
-- TOC entry 5688 (class 1259 OID 81649)
-- Name: idx_advisor_adjustments_advisor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_adjustments_advisor ON public.advisor_adjustments USING btree (advisor_id, created_at);


--
-- TOC entry 5685 (class 1259 OID 81646)
-- Name: idx_advisor_charges_pi; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_advisor_charges_pi ON public.advisor_consultation_charges USING btree (stripe_payment_intent_id);


--
-- TOC entry 5671 (class 1259 OID 86984)
-- Name: idx_advisor_consult_analytics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_consult_analytics ON public.advisor_consultations USING btree (advisor_id, created_at) WHERE (status = 'completed'::public.consultation_status);


--
-- TOC entry 5672 (class 1259 OID 86983)
-- Name: idx_advisor_consult_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_consult_completed ON public.advisor_consultations USING btree (advisor_id, start_time DESC) WHERE (status = 'completed'::public.consultation_status);


--
-- TOC entry 5673 (class 1259 OID 86982)
-- Name: idx_advisor_consult_scheduled_upcoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_consult_scheduled_upcoming ON public.advisor_consultations USING btree (advisor_id, start_time) WHERE (status = ANY (ARRAY['scheduled'::public.consultation_status, 'in_progress'::public.consultation_status]));


--
-- TOC entry 5674 (class 1259 OID 81643)
-- Name: idx_advisor_consultations_advisor_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_consultations_advisor_time ON public.advisor_consultations USING btree (advisor_id, start_time);


--
-- TOC entry 5675 (class 1259 OID 81645)
-- Name: idx_advisor_consultations_cal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_advisor_consultations_cal ON public.advisor_consultations USING btree (cal_booking_id);


--
-- TOC entry 5676 (class 1259 OID 81644)
-- Name: idx_advisor_consultations_client_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_consultations_client_time ON public.advisor_consultations USING btree (client_id, start_time);


--
-- TOC entry 5677 (class 1259 OID 87059)
-- Name: idx_advisor_consultations_earnings_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_consultations_earnings_month ON public.advisor_consultations USING btree (advisor_id, start_time) WHERE ((status = 'completed'::public.consultation_status) AND (is_free_consultation = false));


--
-- TOC entry 5697 (class 1259 OID 81650)
-- Name: idx_advisor_processed_calcom_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisor_processed_calcom_received ON public.advisor_processed_calcom_events USING btree (received_at);


--
-- TOC entry 5659 (class 1259 OID 81648)
-- Name: idx_advisors_approval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_approval ON public.advisors USING btree (approval_status, created_at);


--
-- TOC entry 5660 (class 1259 OID 87058)
-- Name: idx_advisors_dashboard_overview; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_dashboard_overview ON public.advisors USING btree (user_id, approval_status, is_accepting_bookings, created_at DESC);


--
-- TOC entry 5661 (class 1259 OID 85578)
-- Name: idx_advisors_has_multilingual_bio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_has_multilingual_bio ON public.advisors USING btree (user_id) WHERE (multilingual_bio <> '{}'::jsonb);


--
-- TOC entry 5662 (class 1259 OID 85556)
-- Name: idx_advisors_multilingual_bio_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_multilingual_bio_gin ON public.advisors USING gin (multilingual_bio);


--
-- TOC entry 5663 (class 1259 OID 85600)
-- Name: idx_advisors_multilingual_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_multilingual_composite ON public.advisors USING btree (approval_status, is_accepting_bookings) WHERE (multilingual_bio <> '{}'::jsonb);


--
-- TOC entry 5664 (class 1259 OID 85802)
-- Name: idx_advisors_multilingual_display_name_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_multilingual_display_name_gin ON public.advisors USING gin (multilingual_display_name);


--
-- TOC entry 5665 (class 1259 OID 84097)
-- Name: idx_advisors_onboarding_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_onboarding_gin ON public.advisors USING gin (onboarding_steps);


--
-- TOC entry 5666 (class 1259 OID 84098)
-- Name: idx_advisors_review_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_review_timeline ON public.advisors USING btree (review_started_at, review_completed_at, approval_status);


--
-- TOC entry 5645 (class 1259 OID 81071)
-- Name: idx_advisors_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advisors_status ON public.project_advisors USING btree (status, created_at DESC) WHERE (status = ANY (ARRAY['invited'::text, 'active'::text]));


--
-- TOC entry 5468 (class 1259 OID 34094)
-- Name: idx_ai_session_duration_min; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_session_duration_min ON public.project_ai_session_metrics USING btree (session_duration_min);


--
-- TOC entry 5734 (class 1259 OID 87028)
-- Name: idx_analytics_advisor_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_advisor_period ON public.advisor_analytics_summary USING btree (advisor_id, period_start DESC);


--
-- TOC entry 5735 (class 1259 OID 87029)
-- Name: idx_analytics_period_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_period_range ON public.advisor_analytics_summary USING btree (period_start, period_end);


--
-- TOC entry 5444 (class 1259 OID 45321)
-- Name: idx_artifact_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artifact_sha256 ON public."project_versions_metadata-delete" USING btree (artifact_sha256) WHERE (artifact_sha256 IS NOT NULL);


--
-- TOC entry 5165 (class 1259 OID 17930)
-- Name: idx_assets_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_project ON public.assets USING btree (project_id);


--
-- TOC entry 5254 (class 1259 OID 17931)
-- Name: idx_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created_at ON public.quota_audit_logs USING btree (created_at DESC);


--
-- TOC entry 5255 (class 1259 OID 17932)
-- Name: idx_audit_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_event_type ON public.quota_audit_logs USING btree (event_type, created_at DESC);


--
-- TOC entry 5256 (class 1259 OID 17933)
-- Name: idx_audit_metric_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_metric_time ON public.quota_audit_logs USING btree (metric, created_at DESC);


--
-- TOC entry 5244 (class 1259 OID 17934)
-- Name: idx_audit_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_reason ON public.quota_audit_log USING btree (reason, created_at DESC);


--
-- TOC entry 5245 (class 1259 OID 17935)
-- Name: idx_audit_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_success ON public.quota_audit_log USING btree (success, created_at DESC);


--
-- TOC entry 5257 (class 1259 OID 17936)
-- Name: idx_audit_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user_event ON public.quota_audit_logs USING btree (user_id, event_type, created_at DESC);


--
-- TOC entry 5246 (class 1259 OID 17937)
-- Name: idx_audit_user_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user_metric ON public.quota_audit_log USING btree (user_id, metric, created_at DESC);


--
-- TOC entry 5884 (class 1259 OID 92281)
-- Name: idx_billing_customers_health_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_health_score ON public.billing_customers USING btree (health_score, risk_level);


--
-- TOC entry 5885 (class 1259 OID 92282)
-- Name: idx_billing_customers_health_update; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_health_update ON public.billing_customers USING btree (last_health_update);


--
-- TOC entry 5886 (class 1259 OID 92055)
-- Name: idx_billing_customers_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_provider ON public.billing_customers USING btree (payment_provider);


--
-- TOC entry 5887 (class 1259 OID 92054)
-- Name: idx_billing_customers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_user ON public.billing_customers USING btree (user_id);


--
-- TOC entry 5894 (class 1259 OID 92056)
-- Name: idx_billing_invoices_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_invoices_customer ON public.billing_invoices USING btree (customer_id);


--
-- TOC entry 5909 (class 1259 OID 92284)
-- Name: idx_billing_payments_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_payments_currency ON public.billing_payments USING btree (currency, created_at);


--
-- TOC entry 5910 (class 1259 OID 92057)
-- Name: idx_billing_payments_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_payments_customer ON public.billing_payments USING btree (customer_id);


--
-- TOC entry 5911 (class 1259 OID 92286)
-- Name: idx_billing_payments_error_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_payments_error_category ON public.billing_payments USING btree (provider_error_category, created_at) WHERE (status = 'failed'::public.payment_status);


--
-- TOC entry 5912 (class 1259 OID 92257)
-- Name: idx_billing_payments_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_payments_flow ON public.billing_payments USING btree (payment_flow);


--
-- TOC entry 5913 (class 1259 OID 92285)
-- Name: idx_billing_payments_provider_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_payments_provider_status ON public.billing_payments USING btree (payment_provider, status);


--
-- TOC entry 5901 (class 1259 OID 92058)
-- Name: idx_billing_subscriptions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_subscriptions_customer ON public.billing_subscriptions USING btree (customer_id);


--
-- TOC entry 5497 (class 1259 OID 91693)
-- Name: idx_bonus_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_tracking ON public.user_ai_time_balance USING btree (bonus_month_year, bonus_used_this_month);


--
-- TOC entry 5170 (class 1259 OID 17938)
-- Name: idx_branches_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branches_project ON public.branches USING btree (project_id);


--
-- TOC entry 5613 (class 1259 OID 69688)
-- Name: idx_breakglass_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_breakglass_active ON public.supabase_breakglass_recovery USING btree (user_id, project_id) WHERE (is_active = true);


--
-- TOC entry 5458 (class 1259 OID 34095)
-- Name: idx_build_duration_min; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_duration_min ON public.project_build_metrics USING btree (total_duration_min);


--
-- TOC entry 5406 (class 1259 OID 38034)
-- Name: idx_build_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events ON public.project_build_events USING btree (build_id, created_at);


--
-- TOC entry 5407 (class 1259 OID 31478)
-- Name: idx_build_events_build_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_build_id ON public.project_build_events USING btree (build_id);


--
-- TOC entry 5408 (class 1259 OID 40379)
-- Name: idx_build_events_build_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_build_user_created ON public.project_build_events USING btree (build_id, user_id, created_at DESC);


--
-- TOC entry 6950 (class 0 OID 0)
-- Dependencies: 5408
-- Name: INDEX idx_build_events_build_user_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_build_events_build_user_created IS 'Optimizes real-time subscription queries: build_id + user_id filters with chronological order';


--
-- TOC entry 5409 (class 1259 OID 53460)
-- Name: idx_build_events_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_code ON public.project_build_events USING btree (event_code);


--
-- TOC entry 5410 (class 1259 OID 53461)
-- Name: idx_build_events_code_params; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_code_params ON public.project_build_events USING gin (event_params);


--
-- TOC entry 5411 (class 1259 OID 31479)
-- Name: idx_build_events_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_composite ON public.project_build_events USING btree (build_id, id);


--
-- TOC entry 5412 (class 1259 OID 41515)
-- Name: idx_build_events_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_phase ON public.project_build_events USING btree (build_id, event_phase, id);


--
-- TOC entry 5413 (class 1259 OID 38062)
-- Name: idx_build_events_user_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_user_build ON public.project_build_events USING btree (user_id, build_id);


--
-- TOC entry 5414 (class 1259 OID 40378)
-- Name: idx_build_events_user_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_user_created_desc ON public.project_build_events USING btree (user_id, created_at DESC);


--
-- TOC entry 6951 (class 0 OID 0)
-- Dependencies: 5414
-- Name: INDEX idx_build_events_user_created_desc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_build_events_user_created_desc IS 'Optimizes user dashboard queries: ORDER BY created_at DESC with user filtering';


--
-- TOC entry 5415 (class 1259 OID 38061)
-- Name: idx_build_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_user_id ON public.project_build_events USING btree (user_id);


--
-- TOC entry 5416 (class 1259 OID 40380)
-- Name: idx_build_events_user_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_user_type_created ON public.project_build_events USING btree (user_id, event_type, created_at DESC);


--
-- TOC entry 6952 (class 0 OID 0)
-- Dependencies: 5416
-- Name: INDEX idx_build_events_user_type_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_build_events_user_type_created IS 'Optimizes analytics queries: event type filtering by user with chronological order';


--
-- TOC entry 5417 (class 1259 OID 41514)
-- Name: idx_build_events_user_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_events_user_visible ON public.project_build_events USING btree (build_id, user_visible, id) WHERE (user_visible = true);


--
-- TOC entry 5459 (class 1259 OID 33905)
-- Name: idx_build_metrics_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_metrics_created ON public.project_build_metrics USING btree (created_at DESC);


--
-- TOC entry 5460 (class 1259 OID 33903)
-- Name: idx_build_metrics_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_metrics_project ON public.project_build_metrics USING btree (project_id, user_id);


--
-- TOC entry 5461 (class 1259 OID 33904)
-- Name: idx_build_metrics_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_metrics_status ON public.project_build_metrics USING btree (status);


--
-- TOC entry 5399 (class 1259 OID 26834)
-- Name: idx_build_records_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_records_project ON public.project_build_records USING btree (user_id, project_id);


--
-- TOC entry 5400 (class 1259 OID 26835)
-- Name: idx_build_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_records_status ON public.project_build_records USING btree (status);


--
-- TOC entry 5401 (class 1259 OID 26833)
-- Name: idx_build_records_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_build_records_user ON public.project_build_records USING btree (user_id);


--
-- TOC entry 5557 (class 1259 OID 81367)
-- Name: idx_chat_actor_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_actor_type ON public.project_chat_log_minimal USING btree (project_id, actor_type, seq DESC);


--
-- TOC entry 5558 (class 1259 OID 81370)
-- Name: idx_chat_created_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_created_seq ON public.project_chat_log_minimal USING btree (project_id, created_at DESC, seq DESC);


--
-- TOC entry 5559 (class 1259 OID 59270)
-- Name: idx_chat_log_billable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_billable ON public.project_chat_log_minimal USING btree (project_id, user_id, billable_seconds) WHERE (billable_seconds IS NOT NULL);


--
-- TOC entry 5560 (class 1259 OID 53385)
-- Name: idx_chat_log_build_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_build_mode ON public.project_chat_log_minimal USING btree (mode, build_triggered, created_at DESC) WHERE (mode = 'build'::text);


--
-- TOC entry 5561 (class 1259 OID 53386)
-- Name: idx_chat_log_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_correlation ON public.project_chat_log_minimal USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- TOC entry 5562 (class 1259 OID 53663)
-- Name: idx_chat_log_project_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_project_timeline ON public.project_chat_log_minimal USING btree (project_id, timeline_seq DESC);


--
-- TOC entry 5563 (class 1259 OID 53383)
-- Name: idx_chat_log_project_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_project_user ON public.project_chat_log_minimal USING btree (project_id, user_id, created_at DESC);


--
-- TOC entry 5564 (class 1259 OID 53387)
-- Name: idx_chat_log_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_request ON public.project_chat_log_minimal USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- TOC entry 5565 (class 1259 OID 53665)
-- Name: idx_chat_log_response_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_response_type ON public.project_chat_log_minimal USING btree (((response_data ->> 'type'::text))) WHERE (response_data IS NOT NULL);


--
-- TOC entry 5566 (class 1259 OID 53664)
-- Name: idx_chat_log_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_session ON public.project_chat_log_minimal USING btree (session_id);


--
-- TOC entry 5567 (class 1259 OID 53666)
-- Name: idx_chat_log_templates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_templates ON public.project_chat_log_minimal USING btree (response_data) WHERE ((response_data ->> 'template'::text) IS NOT NULL);


--
-- TOC entry 5568 (class 1259 OID 59269)
-- Name: idx_chat_log_tokens_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_tokens_used ON public.project_chat_log_minimal USING btree (project_id, tokens_used) WHERE (tokens_used IS NOT NULL);


--
-- TOC entry 5569 (class 1259 OID 53384)
-- Name: idx_chat_log_user_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_log_user_recent ON public.project_chat_log_minimal USING btree (user_id, created_at DESC);


--
-- TOC entry 5570 (class 1259 OID 81368)
-- Name: idx_chat_mode_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_mode_seq ON public.project_chat_log_minimal USING btree (project_id, mode, seq DESC) WHERE (mode IS NOT NULL);


--
-- TOC entry 5571 (class 1259 OID 81371)
-- Name: idx_chat_parent_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_parent_seq ON public.project_chat_log_minimal USING btree (project_id, parent_message_id, seq DESC) WHERE (parent_message_id IS NOT NULL);


--
-- TOC entry 5572 (class 1259 OID 81366)
-- Name: idx_chat_proj_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_proj_seq ON public.project_chat_log_minimal USING btree (project_id, seq DESC);


--
-- TOC entry 5573 (class 1259 OID 81365)
-- Name: idx_chat_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_trgm ON public.project_chat_log_minimal USING gin (message_text public.gin_trgm_ops);


--
-- TOC entry 5574 (class 1259 OID 81364)
-- Name: idx_chat_tsv_func; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_tsv_func ON public.project_chat_log_minimal USING gin (to_tsvector('simple'::regconfig, COALESCE(message_text, ''::text)));


--
-- TOC entry 5575 (class 1259 OID 81369)
-- Name: idx_chat_visibility_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_visibility_seq ON public.project_chat_log_minimal USING btree (project_id, visibility, seq DESC) WHERE (is_deleted = false);


--
-- TOC entry 5469 (class 1259 OID 33906)
-- Name: idx_claude_metrics_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claude_metrics_build ON public.project_ai_session_metrics USING btree (build_id);


--
-- TOC entry 5470 (class 1259 OID 33908)
-- Name: idx_claude_metrics_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claude_metrics_cost ON public.project_ai_session_metrics USING btree (total_cost_usd DESC);


--
-- TOC entry 5471 (class 1259 OID 33907)
-- Name: idx_claude_metrics_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claude_metrics_session ON public.project_ai_session_metrics USING btree (session_id);


--
-- TOC entry 5175 (class 1259 OID 17939)
-- Name: idx_claude_usage_user_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claude_usage_user_window ON public.claude_user_usage USING btree (user_id, window_start DESC);


--
-- TOC entry 5178 (class 1259 OID 17940)
-- Name: idx_commits_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commits_author ON public.commits USING btree (author_id);


--
-- TOC entry 5179 (class 1259 OID 17941)
-- Name: idx_commits_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commits_project ON public.commits USING btree (project_id);


--
-- TOC entry 5360 (class 1259 OID 19942)
-- Name: idx_component_map_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_map_industry ON public.component_map USING btree (industry);


--
-- TOC entry 5361 (class 1259 OID 19940)
-- Name: idx_component_map_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_map_lookup ON public.component_map USING btree (ai_component_name, industry, is_active);


--
-- TOC entry 5362 (class 1259 OID 19941)
-- Name: idx_component_map_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_map_priority ON public.component_map USING btree (priority DESC);


--
-- TOC entry 5678 (class 1259 OID 87061)
-- Name: idx_consult_history_cursor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consult_history_cursor ON public.advisor_consultations USING btree (advisor_id, start_time DESC, id) WHERE (status = 'completed'::public.consultation_status);


--
-- TOC entry 5679 (class 1259 OID 87060)
-- Name: idx_consult_upcoming_pagination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consult_upcoming_pagination ON public.advisor_consultations USING btree (advisor_id, start_time, id) WHERE (status = ANY (ARRAY['scheduled'::public.consultation_status, 'in_progress'::public.consultation_status]));


--
-- TOC entry 5680 (class 1259 OID 87062)
-- Name: idx_consultations_monthly_agg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consultations_monthly_agg ON public.advisor_consultations USING btree (advisor_id, start_time) WHERE (status = 'completed'::public.consultation_status);


--
-- TOC entry 5504 (class 1259 OID 37743)
-- Name: idx_consumption_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_build ON public.user_ai_time_consumption USING btree (build_id);


--
-- TOC entry 5505 (class 1259 OID 37744)
-- Name: idx_consumption_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_idempotency ON public.user_ai_time_consumption USING btree (idempotency_key);


--
-- TOC entry 5520 (class 1259 OID 37781)
-- Name: idx_consumption_meta_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_meta_date ON public.user_ai_consumption_metadata USING btree (created_at);


--
-- TOC entry 5521 (class 1259 OID 37780)
-- Name: idx_consumption_meta_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_meta_model ON public.user_ai_consumption_metadata USING btree (ai_model_used);


--
-- TOC entry 5506 (class 1259 OID 37742)
-- Name: idx_consumption_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_project ON public.user_ai_time_consumption USING btree (project_id);


--
-- TOC entry 5507 (class 1259 OID 37741)
-- Name: idx_consumption_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_user_date ON public.user_ai_time_consumption USING btree (user_id, created_at);


--
-- TOC entry 5476 (class 1259 OID 33909)
-- Name: idx_deployment_metrics_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployment_metrics_build ON public.project_deployment_metrics USING btree (build_id);


--
-- TOC entry 5477 (class 1259 OID 33964)
-- Name: idx_deployment_metrics_build_id_attempts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployment_metrics_build_id_attempts ON public.project_deployment_metrics USING btree (build_id, attempt_number DESC);


--
-- TOC entry 5478 (class 1259 OID 33910)
-- Name: idx_deployment_metrics_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployment_metrics_success ON public.project_deployment_metrics USING btree (success);


--
-- TOC entry 5540 (class 1259 OID 45289)
-- Name: idx_dns_check_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dns_check_status ON public.project_published_domains USING btree (last_dns_checked_at) WHERE (last_dns_checked_at IS NOT NULL);


--
-- TOC entry 5700 (class 1259 OID 84092)
-- Name: idx_drafts_languages_specialties_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drafts_languages_specialties_gin ON public.advisor_application_drafts USING gin (((professional_data -> 'languages'::text)), ((professional_data -> 'specialties'::text)));


--
-- TOC entry 5701 (class 1259 OID 84091)
-- Name: idx_drafts_professional_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drafts_professional_data_gin ON public.advisor_application_drafts USING gin (professional_data);


--
-- TOC entry 5702 (class 1259 OID 84090)
-- Name: idx_drafts_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drafts_user_status ON public.advisor_application_drafts USING btree (user_id, status, updated_at);


--
-- TOC entry 5481 (class 1259 OID 33911)
-- Name: idx_error_metrics_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_metrics_build ON public.project_error_metrics USING btree (build_id);


--
-- TOC entry 5482 (class 1259 OID 33912)
-- Name: idx_error_metrics_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_metrics_type ON public.project_error_metrics USING btree (error_type);


--
-- TOC entry 5483 (class 1259 OID 33913)
-- Name: idx_error_metrics_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_metrics_unresolved ON public.project_error_metrics USING btree (recovery_success) WHERE (recovery_success = false);


--
-- TOC entry 5917 (class 1259 OID 92063)
-- Name: idx_events_provider_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_provider_processed ON public.processed_payment_events USING btree (payment_provider, processed);


--
-- TOC entry 5918 (class 1259 OID 92062)
-- Name: idx_events_unprocessed_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_unprocessed_recent ON public.processed_payment_events USING btree (payment_provider, received_at) WHERE (processed = false);


--
-- TOC entry 5931 (class 1259 OID 92283)
-- Name: idx_exchange_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_lookup ON public.exchange_rates USING btree (from_currency, to_currency, effective_date DESC);


--
-- TOC entry 5184 (class 1259 OID 17945)
-- Name: idx_export_logs_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_logs_project ON public.export_logs USING btree (project_id);


--
-- TOC entry 5185 (class 1259 OID 17946)
-- Name: idx_export_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_logs_user ON public.export_logs USING btree (user_id);


--
-- TOC entry 5186 (class 1259 OID 17947)
-- Name: idx_export_logs_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_logs_user_time ON public.export_logs USING btree (user_id, exported_at DESC);


--
-- TOC entry 5725 (class 1259 OID 85671)
-- Name: idx_free_consultation_metrics_advisor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_free_consultation_metrics_advisor ON public.advisor_free_consultation_metrics USING btree (advisor_user_id);


--
-- TOC entry 5726 (class 1259 OID 85672)
-- Name: idx_free_consultation_metrics_conversion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_free_consultation_metrics_conversion ON public.advisor_free_consultation_metrics USING btree (conversion_to_paid, created_at);


--
-- TOC entry 5445 (class 1259 OID 33765)
-- Name: idx_git_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_git_tag ON public."project_versions_metadata-delete" USING btree (git_tag);


--
-- TOC entry 5791 (class 1259 OID 90192)
-- Name: idx_github_sync_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_github_sync_created_at ON public.github_sync_operations USING btree (created_at DESC);


--
-- TOC entry 5792 (class 1259 OID 90193)
-- Name: idx_github_sync_operation_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_github_sync_operation_type ON public.github_sync_operations USING btree (operation_type, created_at DESC);


--
-- TOC entry 5793 (class 1259 OID 90191)
-- Name: idx_github_sync_project_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_github_sync_project_status ON public.github_sync_operations USING btree (project_id, status);


--
-- TOC entry 5794 (class 1259 OID 91543)
-- Name: idx_gso_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gso_active ON public.github_sync_operations USING btree (project_id) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[]));


--
-- TOC entry 5795 (class 1259 OID 91544)
-- Name: idx_gso_delivery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gso_delivery_id ON public.github_sync_operations USING btree (((metadata ->> 'delivery_id'::text)));


--
-- TOC entry 5796 (class 1259 OID 91541)
-- Name: idx_gso_project_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gso_project_created_at ON public.github_sync_operations USING btree (project_id, created_at DESC);


--
-- TOC entry 5797 (class 1259 OID 91542)
-- Name: idx_gso_project_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gso_project_status_created ON public.github_sync_operations USING btree (project_id, status, created_at DESC);


--
-- TOC entry 5783 (class 1259 OID 90124)
-- Name: idx_idemp_action_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idemp_action_resource ON public.idempotency_keys USING btree (action, resource_type, COALESCE(resource_id, ''::text));


--
-- TOC entry 5784 (class 1259 OID 90123)
-- Name: idx_idemp_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idemp_created ON public.idempotency_keys USING btree (created_at DESC);


--
-- TOC entry 5550 (class 1259 OID 45298)
-- Name: idx_idempotency_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_cleanup ON public.publication_idempotency_keys USING btree (created_at);


--
-- TOC entry 5895 (class 1259 OID 92061)
-- Name: idx_invoices_voucher_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_voucher_expiry ON public.billing_invoices USING btree (status, expires_at) WHERE (payment_flow = 'cash_voucher'::text);


--
-- TOC entry 5639 (class 1259 OID 81069)
-- Name: idx_last_read_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_last_read_project ON public.project_chat_last_read USING btree (project_id, last_seq DESC);


--
-- TOC entry 5925 (class 1259 OID 92065)
-- Name: idx_ledger_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_source ON public.ai_time_ledger USING btree (source_type, source_id);


--
-- TOC entry 5926 (class 1259 OID 92064)
-- Name: idx_ledger_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_user_time ON public.ai_time_ledger USING btree (user_id, occurred_at);


--
-- TOC entry 5642 (class 1259 OID 81070)
-- Name: idx_memberships_user_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_user_role ON public.project_memberships USING btree (user_id, role);


--
-- TOC entry 5498 (class 1259 OID 91694)
-- Name: idx_next_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_next_expiry ON public.user_ai_time_balance USING btree (next_expiry_at) WHERE (next_expiry_at IS NOT NULL);


--
-- TOC entry 5499 (class 1259 OID 91695)
-- Name: idx_next_expiry_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_next_expiry_active ON public.user_ai_time_balance USING btree (next_expiry_at) WHERE ((next_expiry_at IS NOT NULL) AND ((total_paid_seconds + total_bonus_seconds) > 0));


--
-- TOC entry 5608 (class 1259 OID 69687)
-- Name: idx_oauth_idempotency_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_idempotency_expires ON public.oauth_exchange_idempotency USING btree (expires_at);


--
-- TOC entry 5603 (class 1259 OID 69686)
-- Name: idx_oauth_nonces_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_nonces_expires ON public.oauth_state_nonces USING btree (expires_at) WHERE (consumed = false);


--
-- TOC entry 5541 (class 1259 OID 45272)
-- Name: idx_one_primary_domain_per_project; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_primary_domain_per_project ON public.project_published_domains USING btree (project_id) WHERE (is_primary = true);


--
-- TOC entry 5446 (class 1259 OID 45145)
-- Name: idx_one_published_per_project; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_published_per_project ON public."project_versions_metadata-delete" USING btree (project_id) WHERE ((is_published = true) AND (soft_deleted_at IS NULL));


--
-- TOC entry 5187 (class 1259 OID 73975)
-- Name: idx_organization_members_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_active ON public.organization_members USING btree (organization_id, user_id) WHERE (role IS NOT NULL);


--
-- TOC entry 5188 (class 1259 OID 17951)
-- Name: idx_organization_members_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_org_id ON public.organization_members USING btree (organization_id);


--
-- TOC entry 5189 (class 1259 OID 73974)
-- Name: idx_organization_members_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_org_user ON public.organization_members USING btree (organization_id, user_id);


--
-- TOC entry 5190 (class 1259 OID 17952)
-- Name: idx_organization_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);


--
-- TOC entry 5197 (class 1259 OID 17953)
-- Name: idx_organizations_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_owner_id ON public.organizations USING btree (owner_id);


--
-- TOC entry 5198 (class 1259 OID 17954)
-- Name: idx_organizations_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_slug ON public.organizations USING btree (slug);


--
-- TOC entry 5199 (class 1259 OID 73870)
-- Name: idx_organizations_subscription_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_subscription_tier ON public.organizations USING btree (subscription_tier);


--
-- TOC entry 5914 (class 1259 OID 92067)
-- Name: idx_payments_provider_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_success ON public.billing_payments USING btree (payment_provider, status) WHERE (status = 'succeeded'::public.payment_status);


--
-- TOC entry 5915 (class 1259 OID 92066)
-- Name: idx_payments_status_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status_currency ON public.billing_payments USING btree (status, currency, created_at);


--
-- TOC entry 5694 (class 1259 OID 81647)
-- Name: idx_payouts_advisor_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_advisor_month ON public.advisor_payouts USING btree (advisor_id, payout_month);


--
-- TOC entry 5418 (class 1259 OID 53435)
-- Name: idx_pbe_build_id_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_build_id_sequence ON public.project_build_events USING btree (build_id, id);


--
-- TOC entry 5419 (class 1259 OID 53434)
-- Name: idx_pbe_build_user_id_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_build_user_id_sequence ON public.project_build_events USING btree (build_id, user_id, id);


--
-- TOC entry 5420 (class 1259 OID 53436)
-- Name: idx_pbe_clean_events_only; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_clean_events_only ON public.project_build_events USING btree (build_id, user_id, id) WHERE ((user_visible = true) AND (event_phase IS NOT NULL));


--
-- TOC entry 5421 (class 1259 OID 53439)
-- Name: idx_pbe_completion_monitoring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_completion_monitoring ON public.project_build_events USING btree (event_type, finished, created_at) WHERE (finished = true);


--
-- TOC entry 5422 (class 1259 OID 53438)
-- Name: idx_pbe_created_at_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_created_at_cleanup ON public.project_build_events USING btree (created_at);


--
-- TOC entry 5423 (class 1259 OID 53305)
-- Name: idx_pbe_error_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_error_code ON public.project_build_events USING btree (error_code) WHERE (error_code IS NOT NULL);


--
-- TOC entry 5424 (class 1259 OID 53437)
-- Name: idx_pbe_user_recent_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbe_user_recent_events ON public.project_build_events USING btree (user_id, created_at DESC);


--
-- TOC entry 5210 (class 1259 OID 82785)
-- Name: idx_pc_project_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pc_project_user ON public.project_collaborators USING btree (project_id, user_id);


--
-- TOC entry 5618 (class 1259 OID 69788)
-- Name: idx_pi_connected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pi_connected ON public.project_integrations USING btree (project_id) WHERE (status = 'connected'::public.integration_status);


--
-- TOC entry 6953 (class 0 OID 0)
-- Dependencies: 5618
-- Name: INDEX idx_pi_connected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_pi_connected IS 'Partial index for fast dashboard queries of active integrations';


--
-- TOC entry 5619 (class 1259 OID 69786)
-- Name: idx_pi_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pi_project ON public.project_integrations USING btree (project_id);


--
-- TOC entry 5620 (class 1259 OID 69787)
-- Name: idx_pi_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pi_type_status ON public.project_integrations USING btree (type, status);


--
-- TOC entry 5204 (class 1259 OID 17958)
-- Name: idx_plan_change_log_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_change_log_user_time ON public.plan_change_log USING btree (user_id, effective_date DESC);


--
-- TOC entry 5207 (class 1259 OID 17959)
-- Name: idx_plan_limits_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_limits_name ON public.plan_limits USING btree (plan_name);


--
-- TOC entry 5583 (class 1259 OID 53670)
-- Name: idx_plan_sessions_last_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_sessions_last_active ON public.project_chat_plan_sessions USING btree (last_active);


--
-- TOC entry 5584 (class 1259 OID 53669)
-- Name: idx_plan_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_sessions_status ON public.project_chat_plan_sessions USING btree (status) WHERE ((status)::text = ANY ((ARRAY['active'::character varying, 'converted'::character varying])::text[]));


--
-- TOC entry 5585 (class 1259 OID 53668)
-- Name: idx_plan_sessions_user_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_sessions_user_project ON public.project_chat_plan_sessions USING btree (user_id, project_id);


--
-- TOC entry 5870 (class 1259 OID 92052)
-- Name: idx_pricing_item_prices_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_item_prices_lookup ON public.pricing_item_prices USING btree (pricing_item_id, currency, payment_provider);


--
-- TOC entry 5871 (class 1259 OID 92053)
-- Name: idx_pricing_item_prices_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_item_prices_provider ON public.pricing_item_prices USING btree (payment_provider, is_active);


--
-- TOC entry 5862 (class 1259 OID 91656)
-- Name: idx_pricing_items_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_items_active ON public.pricing_items USING btree (is_active) WHERE (is_active = true);


--
-- TOC entry 5863 (class 1259 OID 91654)
-- Name: idx_pricing_items_catalog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_items_catalog ON public.pricing_items USING btree (catalog_version_id);


--
-- TOC entry 5864 (class 1259 OID 91657)
-- Name: idx_pricing_items_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_items_display_order ON public.pricing_items USING btree (display_order);


--
-- TOC entry 5865 (class 1259 OID 91655)
-- Name: idx_pricing_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_items_type ON public.pricing_items USING btree (item_type);


--
-- TOC entry 5855 (class 1259 OID 91617)
-- Name: idx_pricing_versions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_versions_active ON public.pricing_catalog_versions USING btree (is_active) WHERE (is_active = true);


--
-- TOC entry 5856 (class 1259 OID 91618)
-- Name: idx_pricing_versions_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_versions_effective ON public.pricing_catalog_versions USING btree (effective_at);


--
-- TOC entry 5648 (class 1259 OID 81433)
-- Name: idx_processed_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processed_events_created_at ON public.processed_stripe_events USING btree (processed_at);


--
-- TOC entry 5649 (class 1259 OID 81432)
-- Name: idx_processed_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processed_events_user_id ON public.processed_stripe_events USING btree (user_id);


--
-- TOC entry 5425 (class 1259 OID 53306)
-- Name: idx_project_build_events_user_error_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_build_events_user_error_message ON public.project_build_events USING btree (user_error_message) WHERE (user_error_message IS NOT NULL);


--
-- TOC entry 5211 (class 1259 OID 17960)
-- Name: idx_project_collaborators_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_collaborators_project_id ON public.project_collaborators USING btree (project_id);


--
-- TOC entry 5212 (class 1259 OID 17961)
-- Name: idx_project_collaborators_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_collaborators_role ON public.project_collaborators USING btree (role);


--
-- TOC entry 5213 (class 1259 OID 17962)
-- Name: idx_project_collaborators_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_collaborators_user_id ON public.project_collaborators USING btree (user_id);


--
-- TOC entry 5363 (class 1259 OID 61646)
-- Name: idx_project_display_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_display_version ON public.project_versions USING btree (project_id, display_version_number DESC);


--
-- TOC entry 5447 (class 1259 OID 33762)
-- Name: idx_project_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_history ON public."project_versions_metadata-delete" USING btree (project_id, created_at DESC);


--
-- TOC entry 5484 (class 1259 OID 34099)
-- Name: idx_project_last_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_last_updated ON public.project_metrics_summary USING btree (project_last_updated);


--
-- TOC entry 5485 (class 1259 OID 34147)
-- Name: idx_project_metrics_summary_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_metrics_summary_date ON public.project_metrics_summary USING btree (date);


--
-- TOC entry 5486 (class 1259 OID 34148)
-- Name: idx_project_metrics_summary_project_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_metrics_summary_project_date ON public.project_metrics_summary USING btree (project_id, date);


--
-- TOC entry 5487 (class 1259 OID 34191)
-- Name: idx_project_metrics_summary_project_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_metrics_summary_project_user ON public.project_metrics_summary USING btree (project_id, user_id);


--
-- TOC entry 5488 (class 1259 OID 34098)
-- Name: idx_project_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_started ON public.project_metrics_summary USING btree (project_started);


--
-- TOC entry 5489 (class 1259 OID 33914)
-- Name: idx_project_summary_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_summary_lookup ON public.project_metrics_summary USING btree (project_id, user_id, project_started DESC);


--
-- TOC entry 5364 (class 1259 OID 37865)
-- Name: idx_project_versions_artifact_checksum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_artifact_checksum ON public.project_versions USING btree (artifact_checksum) WHERE (artifact_checksum IS NOT NULL);


--
-- TOC entry 5365 (class 1259 OID 37864)
-- Name: idx_project_versions_artifact_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_artifact_size ON public.project_versions USING btree (artifact_size) WHERE (artifact_size IS NOT NULL);


--
-- TOC entry 5366 (class 1259 OID 25580)
-- Name: idx_project_versions_cf_deployment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_cf_deployment ON public.project_versions USING btree (cf_deployment_id) WHERE (cf_deployment_id IS NOT NULL);


--
-- TOC entry 5367 (class 1259 OID 47640)
-- Name: idx_project_versions_change_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_change_type ON public.project_versions USING btree (project_id, change_type) WHERE ((change_type)::text = ANY ((ARRAY['minor'::character varying, 'major'::character varying])::text[]));


--
-- TOC entry 5368 (class 1259 OID 74000)
-- Name: idx_project_versions_deployment_lane; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_deployment_lane ON public.project_versions USING btree (deployment_lane);


--
-- TOC entry 5369 (class 1259 OID 74001)
-- Name: idx_project_versions_deployment_lane_detected_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_deployment_lane_detected_at ON public.project_versions USING btree (deployment_lane_detected_at);


--
-- TOC entry 5370 (class 1259 OID 47639)
-- Name: idx_project_versions_project_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_project_published ON public.project_versions USING btree (project_id, is_published, created_at DESC);


--
-- TOC entry 5371 (class 1259 OID 25578)
-- Name: idx_project_versions_project_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_project_version ON public.project_versions USING btree (project_id, version_id);


--
-- TOC entry 5372 (class 1259 OID 34259)
-- Name: idx_project_versions_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_session ON public.project_versions USING btree (ai_session_id);


--
-- TOC entry 5373 (class 1259 OID 25577)
-- Name: idx_project_versions_user_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_user_project ON public.project_versions USING btree (user_id, project_id);


--
-- TOC entry 5374 (class 1259 OID 25579)
-- Name: idx_project_versions_user_project_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_user_project_created ON public.project_versions USING btree (user_id, project_id, created_at DESC);


--
-- TOC entry 5218 (class 1259 OID 17963)
-- Name: idx_projects_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_active ON public.projects USING btree (owner_id, archived_at) WHERE (archived_at IS NULL);


--
-- TOC entry 6954 (class 0 OID 0)
-- Dependencies: 5218
-- Name: INDEX idx_projects_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_projects_active IS 'Partial index for non-archived projects only';


--
-- TOC entry 5219 (class 1259 OID 17964)
-- Name: idx_projects_active_by_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_active_by_owner ON public.projects USING btree (owner_id, created_at DESC) WHERE (archived_at IS NULL);


--
-- TOC entry 5220 (class 1259 OID 65057)
-- Name: idx_projects_chat_preferences; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_chat_preferences ON public.projects USING btree (((chat_preferences ->> 'buildImmediately'::text))) WHERE (chat_preferences IS NOT NULL);


--
-- TOC entry 5221 (class 1259 OID 17965)
-- Name: idx_projects_collaborators; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_collaborators ON public.projects USING gin (((config -> 'collaborator_ids'::text)));


--
-- TOC entry 5222 (class 1259 OID 47601)
-- Name: idx_projects_current_version_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_current_version_name ON public.projects USING btree (current_version_name) WHERE (current_version_name IS NOT NULL);


--
-- TOC entry 5223 (class 1259 OID 73998)
-- Name: idx_projects_deployment_lane; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_deployment_lane ON public.projects USING btree (deployment_lane);


--
-- TOC entry 5224 (class 1259 OID 73999)
-- Name: idx_projects_deployment_lane_detected_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_deployment_lane_detected_at ON public.projects USING btree (deployment_lane_detected_at);


--
-- TOC entry 5225 (class 1259 OID 90194)
-- Name: idx_projects_github_sync_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_github_sync_enabled ON public.projects USING btree (github_sync_enabled) WHERE (github_sync_enabled = true);


--
-- TOC entry 5226 (class 1259 OID 53708)
-- Name: idx_projects_last_ai_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_last_ai_session_id ON public.projects USING btree (last_ai_session_id) WHERE (last_ai_session_id IS NOT NULL);


--
-- TOC entry 5227 (class 1259 OID 53709)
-- Name: idx_projects_last_ai_session_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_last_ai_session_updated_at ON public.projects USING btree (last_ai_session_updated_at) WHERE (last_ai_session_updated_at IS NOT NULL);


--
-- TOC entry 5228 (class 1259 OID 17966)
-- Name: idx_projects_name_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_name_search ON public.projects USING gin (to_tsvector('english'::regconfig, name));


--
-- TOC entry 6955 (class 0 OID 0)
-- Dependencies: 5228
-- Name: INDEX idx_projects_name_search; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_projects_name_search IS 'Full-text search index for project names';


--
-- TOC entry 5229 (class 1259 OID 73972)
-- Name: idx_projects_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_org_active ON public.projects USING btree (org_id) WHERE ((org_id IS NOT NULL) AND (archived_at IS NULL));


--
-- TOC entry 5230 (class 1259 OID 73876)
-- Name: idx_projects_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_org_id ON public.projects USING btree (org_id);


--
-- TOC entry 5231 (class 1259 OID 17967)
-- Name: idx_projects_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);


--
-- TOC entry 5232 (class 1259 OID 73973)
-- Name: idx_projects_owner_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_owner_org_active ON public.projects USING btree (owner_id, org_id, updated_at DESC) WHERE (archived_at IS NULL);


--
-- TOC entry 5233 (class 1259 OID 17968)
-- Name: idx_projects_owner_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_owner_updated ON public.projects USING btree (owner_id, updated_at DESC);


--
-- TOC entry 6956 (class 0 OID 0)
-- Dependencies: 5233
-- Name: INDEX idx_projects_owner_updated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_projects_owner_updated IS 'Composite index for user dashboard main query';


--
-- TOC entry 5234 (class 1259 OID 91545)
-- Name: idx_projects_repo_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_repo_ci ON public.projects USING btree (lower((github_repo_owner)::text), lower((github_repo_name)::text));


--
-- TOC entry 5235 (class 1259 OID 17969)
-- Name: idx_projects_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_updated_at ON public.projects USING btree (updated_at DESC);


--
-- TOC entry 6957 (class 0 OID 0)
-- Dependencies: 5235
-- Name: INDEX idx_projects_updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_projects_updated_at IS 'Performance index for dashboard sort-by-recent functionality';


--
-- TOC entry 5948 (class 1259 OID 94043)
-- Name: idx_promo_provider_changes_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_provider_changes_correlation ON public.promotion_provider_changes USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- TOC entry 5949 (class 1259 OID 93969)
-- Name: idx_promo_provider_changes_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_provider_changes_promotion ON public.promotion_provider_changes USING btree (promotion_id, created_at DESC);


--
-- TOC entry 5950 (class 1259 OID 93970)
-- Name: idx_promo_provider_changes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_provider_changes_user ON public.promotion_provider_changes USING btree (changed_by, created_at DESC);


--
-- TOC entry 5830 (class 1259 OID 93804)
-- Name: idx_promo_reservations_state_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_reservations_state_expires ON public.promotion_reservations USING btree (status, expires_at);


--
-- TOC entry 5816 (class 1259 OID 93767)
-- Name: idx_promotion_artifacts_coupon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_artifacts_coupon_id ON public.promotion_artifacts USING btree (gateway, external_coupon_id);


--
-- TOC entry 5817 (class 1259 OID 91417)
-- Name: idx_promotion_artifacts_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_artifacts_expires_at ON public.promotion_artifacts USING btree (expires_at);


--
-- TOC entry 5818 (class 1259 OID 93768)
-- Name: idx_promotion_artifacts_promo_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_artifacts_promo_code_id ON public.promotion_artifacts USING btree (gateway, external_promotion_code_id);


--
-- TOC entry 5819 (class 1259 OID 91420)
-- Name: idx_promotion_artifacts_promotion_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_artifacts_promotion_code ON public.promotion_artifacts USING btree (promotion_code_id);


--
-- TOC entry 5811 (class 1259 OID 93787)
-- Name: idx_promotion_codes_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_codes_normalized ON public.promotion_codes USING btree (code_normalized) WHERE (is_active = true);


--
-- TOC entry 5812 (class 1259 OID 91390)
-- Name: idx_promotion_codes_promotion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_codes_promotion_id ON public.promotion_codes USING btree (promotion_id);


--
-- TOC entry 5837 (class 1259 OID 91488)
-- Name: idx_promotion_redemptions_promotion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_redemptions_promotion_id ON public.promotion_redemptions USING btree (promotion_id);


--
-- TOC entry 5838 (class 1259 OID 91490)
-- Name: idx_promotion_redemptions_redeemed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_redemptions_redeemed_at ON public.promotion_redemptions USING btree (redeemed_at);


--
-- TOC entry 5839 (class 1259 OID 91491)
-- Name: idx_promotion_redemptions_stripe_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_redemptions_stripe_ids ON public.promotion_redemptions USING btree (stripe_payment_intent_id, stripe_session_id);


--
-- TOC entry 5840 (class 1259 OID 91489)
-- Name: idx_promotion_redemptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_redemptions_user_id ON public.promotion_redemptions USING btree (user_id);


--
-- TOC entry 5831 (class 1259 OID 91448)
-- Name: idx_promotion_reservations_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_reservations_expires_at ON public.promotion_reservations USING btree (expires_at);


--
-- TOC entry 5832 (class 1259 OID 91450)
-- Name: idx_promotion_reservations_stripe_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_reservations_stripe_intent ON public.promotion_reservations USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- TOC entry 5833 (class 1259 OID 91449)
-- Name: idx_promotion_reservations_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_reservations_user_status ON public.promotion_reservations USING btree (user_id, status);


--
-- TOC entry 5798 (class 1259 OID 94050)
-- Name: idx_promotions_active_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_active_currency ON public.promotions USING btree (currency, status, valid_from, valid_until) WHERE (status = 'active'::public.promotion_status);


--
-- TOC entry 5799 (class 1259 OID 93971)
-- Name: idx_promotions_active_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_active_dates ON public.promotions USING btree (valid_from, valid_until) WHERE (status = 'active'::public.promotion_status);


--
-- TOC entry 5800 (class 1259 OID 94052)
-- Name: idx_promotions_checkout_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_checkout_types ON public.promotions USING gin (checkout_type_restrictions) WHERE (checkout_type_restrictions IS NOT NULL);


--
-- TOC entry 5801 (class 1259 OID 91369)
-- Name: idx_promotions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_created_by ON public.promotions USING btree (created_by);


--
-- TOC entry 5802 (class 1259 OID 94042)
-- Name: idx_promotions_min_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_min_order ON public.promotions USING btree (minimum_order_currency, minimum_order_minor_units) WHERE (minimum_order_minor_units IS NOT NULL);


--
-- TOC entry 5803 (class 1259 OID 94051)
-- Name: idx_promotions_provider_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_provider_lookup ON public.promotions USING gin (supported_providers) WHERE (status = 'active'::public.promotion_status);


--
-- TOC entry 5804 (class 1259 OID 93840)
-- Name: idx_promotions_status_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_status_dates ON public.promotions USING btree (status, valid_from, valid_until) WHERE (status = 'active'::public.promotion_status);


--
-- TOC entry 5805 (class 1259 OID 91368)
-- Name: idx_promotions_status_valid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_status_valid ON public.promotions USING btree (status, valid_from, valid_until);


--
-- TOC entry 5806 (class 1259 OID 93742)
-- Name: idx_promotions_supported_currencies; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_supported_currencies ON public.promotions USING gin (supported_currencies);


--
-- TOC entry 5807 (class 1259 OID 94045)
-- Name: idx_promotions_supported_currencies_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_supported_currencies_gin ON public.promotions USING gin (supported_currencies);


--
-- TOC entry 5808 (class 1259 OID 93741)
-- Name: idx_promotions_supported_providers; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_supported_providers ON public.promotions USING gin (supported_providers);


--
-- TOC entry 5448 (class 1259 OID 45166)
-- Name: idx_published_versions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_published_versions ON public."project_versions_metadata-delete" USING btree (project_id, published_at DESC) WHERE (is_published = true);


--
-- TOC entry 5514 (class 1259 OID 37765)
-- Name: idx_purchases_retention; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_retention ON public.user_ai_time_purchases USING btree (retention_until);


--
-- TOC entry 5515 (class 1259 OID 37764)
-- Name: idx_purchases_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_user ON public.user_ai_time_purchases USING btree (user_id, purchased_at);


--
-- TOC entry 5247 (class 1259 OID 17970)
-- Name: idx_quota_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quota_audit_log_created_at ON public.quota_audit_log USING btree (created_at DESC);


--
-- TOC entry 5248 (class 1259 OID 17971)
-- Name: idx_quota_audit_log_failures; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quota_audit_log_failures ON public.quota_audit_log USING btree (created_at DESC) WHERE (success = false);


--
-- TOC entry 5249 (class 1259 OID 17972)
-- Name: idx_quota_audit_log_reasons; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quota_audit_log_reasons ON public.quota_audit_log USING btree (reason, created_at DESC) WHERE (success = false);


--
-- TOC entry 5250 (class 1259 OID 18623)
-- Name: idx_quota_audit_log_refunds; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quota_audit_log_refunds ON public.quota_audit_log USING btree (user_id, reason, created_at DESC) WHERE (reason = 'project_deletion_refund'::text);


--
-- TOC entry 5251 (class 1259 OID 17973)
-- Name: idx_quota_audit_log_user_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quota_audit_log_user_activity ON public.quota_audit_log USING btree (user_id, created_at DESC);


--
-- TOC entry 5269 (class 1259 OID 17974)
-- Name: idx_quota_rate_limits_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quota_rate_limits_lookup ON public.quota_rate_limits USING btree (identifier, identifier_type, window_start DESC);


--
-- TOC entry 5524 (class 1259 OID 37841)
-- Name: idx_r2_cleanup_logs_cleanup_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_r2_cleanup_logs_cleanup_date ON public.r2_cleanup_logs USING btree (cleanup_date DESC);


--
-- TOC entry 5525 (class 1259 OID 37842)
-- Name: idx_r2_cleanup_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_r2_cleanup_logs_created_at ON public.r2_cleanup_logs USING btree (created_at DESC);


--
-- TOC entry 5636 (class 1259 OID 81068)
-- Name: idx_read_receipts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_read_receipts_user ON public.project_chat_read_receipts USING btree (user_id, read_at DESC);


--
-- TOC entry 5434 (class 1259 OID 41620)
-- Name: idx_recommendations_build_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_build_id ON public.project_recommendations USING btree (build_id) WHERE (build_id IS NOT NULL);


--
-- TOC entry 5435 (class 1259 OID 31453)
-- Name: idx_recommendations_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_project ON public.project_recommendations USING btree (project_id);


--
-- TOC entry 5436 (class 1259 OID 41665)
-- Name: idx_recommendations_user_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_user_build ON public.project_recommendations USING btree (user_id, build_id) WHERE ((user_id IS NOT NULL) AND (build_id IS NOT NULL));


--
-- TOC entry 5437 (class 1259 OID 41664)
-- Name: idx_recommendations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_user_id ON public.project_recommendations USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- TOC entry 5438 (class 1259 OID 41666)
-- Name: idx_recommendations_user_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_user_project ON public.project_recommendations USING btree (user_id, project_id) WHERE (user_id IS NOT NULL);


--
-- TOC entry 5439 (class 1259 OID 31454)
-- Name: idx_recommendations_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_version ON public.project_recommendations USING btree (version_id);


--
-- TOC entry 5841 (class 1259 OID 94107)
-- Name: idx_redemptions_analytics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_analytics ON public.promotion_redemptions USING btree (promotion_id, committed_at, gateway, currency) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5842 (class 1259 OID 93806)
-- Name: idx_redemptions_gateway_state_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_gateway_state_date ON public.promotion_redemptions USING btree (gateway, committed_at DESC) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5843 (class 1259 OID 93805)
-- Name: idx_redemptions_prom_state_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_prom_state_date ON public.promotion_redemptions USING btree (promotion_id, committed_at DESC) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5844 (class 1259 OID 93972)
-- Name: idx_redemptions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_user_date ON public.promotion_redemptions USING btree (user_id, redeemed_at DESC) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5845 (class 1259 OID 93841)
-- Name: idx_redemptions_user_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_user_promotion ON public.promotion_redemptions USING btree (user_id, promotion_id, committed_at DESC) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5274 (class 1259 OID 17975)
-- Name: idx_referrals_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_code ON public.referrals USING btree (referral_code);


--
-- TOC entry 5275 (class 1259 OID 17976)
-- Name: idx_referrals_referred_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referred_user_id ON public.referrals USING btree (referred_user_id);


--
-- TOC entry 5276 (class 1259 OID 17977)
-- Name: idx_referrals_referrer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referrer_user_id ON public.referrals USING btree (referrer_user_id);


--
-- TOC entry 5277 (class 1259 OID 17978)
-- Name: idx_referrals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_status ON public.referrals USING btree (status, created_at);


--
-- TOC entry 5932 (class 1259 OID 92288)
-- Name: idx_regional_calendars_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regional_calendars_lookup ON public.regional_calendars USING btree (region_code, date, is_weekend, is_holiday);


--
-- TOC entry 5944 (class 1259 OID 94038)
-- Name: idx_regional_config_region_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regional_config_region_lower ON public.promotion_regional_config USING btree (lower(region_code));


--
-- TOC entry 5691 (class 1259 OID 87063)
-- Name: idx_reviews_advisor_analytics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_advisor_analytics ON public.advisor_reviews USING btree (advisor_id, created_at DESC, rating);


--
-- TOC entry 5449 (class 1259 OID 45168)
-- Name: idx_rollback_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rollback_lineage ON public."project_versions_metadata-delete" USING btree (rollback_source_version_id, rollback_target_version_id) WHERE (rollback_source_version_id IS NOT NULL);


--
-- TOC entry 5625 (class 1259 OID 73222)
-- Name: idx_security_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_audit_log_created_at ON public.security_audit_log USING btree (created_at);


--
-- TOC entry 5626 (class 1259 OID 73223)
-- Name: idx_security_audit_log_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_audit_log_event_type ON public.security_audit_log USING btree (event_type);


--
-- TOC entry 5586 (class 1259 OID 81400)
-- Name: idx_sessions_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_locale ON public.unified_chat_sessions USING btree (preferred_locale) WHERE (preferred_locale IS NOT NULL);


--
-- TOC entry 5712 (class 1259 OID 85505)
-- Name: idx_specialty_translations_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialty_translations_key ON public.advisor_specialty_translations USING btree (specialty_key);


--
-- TOC entry 5713 (class 1259 OID 85506)
-- Name: idx_specialty_translations_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialty_translations_lang ON public.advisor_specialty_translations USING btree (language_code);


--
-- TOC entry 5714 (class 1259 OID 85507)
-- Name: idx_specialty_translations_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialty_translations_lookup ON public.advisor_specialty_translations USING btree (specialty_key, language_code);


--
-- TOC entry 5542 (class 1259 OID 45288)
-- Name: idx_ssl_check_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssl_check_status ON public.project_published_domains USING btree (ssl_status, last_ssl_checked_at) WHERE ((ssl_status)::text <> 'active'::text);


--
-- TOC entry 5282 (class 1259 OID 17979)
-- Name: idx_storage_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storage_audit_created_at ON public.storage_audit_log USING btree (created_at);


--
-- TOC entry 5283 (class 1259 OID 17980)
-- Name: idx_storage_audit_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storage_audit_user_id ON public.storage_audit_log USING btree (user_id);


--
-- TOC entry 5652 (class 1259 OID 81442)
-- Name: idx_stripe_raw_events_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_raw_events_received_at ON public.stripe_raw_events USING btree (received_at);


--
-- TOC entry 5902 (class 1259 OID 92287)
-- Name: idx_subscriptions_mrr_calc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_mrr_calc ON public.billing_subscriptions USING btree (status, currency, payment_provider) WHERE (status = ANY (ARRAY['active'::public.subscription_status, 'trialing'::public.subscription_status, 'past_due'::public.subscription_status]));


--
-- TOC entry 5903 (class 1259 OID 92060)
-- Name: idx_subscriptions_provider_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_provider_status ON public.billing_subscriptions USING btree (payment_provider, status);


--
-- TOC entry 5904 (class 1259 OID 92059)
-- Name: idx_subscriptions_status_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_status_expiry ON public.billing_subscriptions USING btree (status, current_period_end);


--
-- TOC entry 5593 (class 1259 OID 69685)
-- Name: idx_supabase_connections_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supabase_connections_status ON public.supabase_connections USING btree (connection_status) WHERE ((connection_status)::text = 'active'::text);


--
-- TOC entry 5594 (class 1259 OID 69684)
-- Name: idx_supabase_connections_user_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supabase_connections_user_project ON public.supabase_connections USING btree (user_id, project_id);


--
-- TOC entry 5450 (class 1259 OID 45167)
-- Name: idx_superseded_versions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_superseded_versions ON public."project_versions_metadata-delete" USING btree (superseded_by_version_id) WHERE (superseded_by_version_id IS NOT NULL);


--
-- TOC entry 5748 (class 1259 OID 89924)
-- Name: idx_support_ticket_messages_is_internal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_messages_is_internal ON public.support_ticket_messages USING btree (is_internal);


--
-- TOC entry 5749 (class 1259 OID 89923)
-- Name: idx_support_ticket_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_messages_sender_id ON public.support_ticket_messages USING btree (sender_id);


--
-- TOC entry 5750 (class 1259 OID 89922)
-- Name: idx_support_ticket_messages_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_messages_ticket_id ON public.support_ticket_messages USING btree (ticket_id, created_at DESC);


--
-- TOC entry 5736 (class 1259 OID 89915)
-- Name: idx_support_tickets_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_assigned_to ON public.support_tickets USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);


--
-- TOC entry 5737 (class 1259 OID 89920)
-- Name: idx_support_tickets_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_category ON public.support_tickets USING btree (category);


--
-- TOC entry 5738 (class 1259 OID 89921)
-- Name: idx_support_tickets_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_channel ON public.support_tickets USING btree (channel);


--
-- TOC entry 5739 (class 1259 OID 89917)
-- Name: idx_support_tickets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_created_at ON public.support_tickets USING btree (created_at DESC);


--
-- TOC entry 5740 (class 1259 OID 89914)
-- Name: idx_support_tickets_status_priority_sla; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status_priority_sla ON public.support_tickets USING btree (status, priority, sla_due_at);


--
-- TOC entry 5741 (class 1259 OID 89919)
-- Name: idx_support_tickets_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_tags ON public.support_tickets USING gin (tags);


--
-- TOC entry 5742 (class 1259 OID 89918)
-- Name: idx_support_tickets_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_updated_at ON public.support_tickets USING btree (updated_at DESC);


--
-- TOC entry 5743 (class 1259 OID 89916)
-- Name: idx_support_tickets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user_id ON public.support_tickets USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- TOC entry 5393 (class 1259 OID 26832)
-- Name: idx_task_deps_depends; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_deps_depends ON public.worker_task_dependencies USING btree (depends_on);


--
-- TOC entry 5394 (class 1259 OID 26831)
-- Name: idx_task_deps_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_deps_task ON public.worker_task_dependencies USING btree (task_id);


--
-- TOC entry 5379 (class 1259 OID 26826)
-- Name: idx_task_plans_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_plans_build ON public.worker_task_plans USING btree (build_id);


--
-- TOC entry 5380 (class 1259 OID 26825)
-- Name: idx_task_plans_user_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_plans_user_project ON public.worker_task_plans USING btree (user_id, project_id);


--
-- TOC entry 5385 (class 1259 OID 26828)
-- Name: idx_tasks_build; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_build ON public.worker_tasks USING btree (build_id);


--
-- TOC entry 5386 (class 1259 OID 26830)
-- Name: idx_tasks_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_fingerprint ON public.worker_tasks USING btree (fingerprint) WHERE (fingerprint IS NOT NULL);


--
-- TOC entry 5387 (class 1259 OID 26827)
-- Name: idx_tasks_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_plan ON public.worker_tasks USING btree (plan_id);


--
-- TOC entry 5388 (class 1259 OID 26829)
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.worker_tasks USING btree (status);


--
-- TOC entry 5706 (class 1259 OID 84094)
-- Name: idx_timeline_advisor_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_advisor_time ON public.advisor_event_timeline USING btree (advisor_id, created_at DESC);


--
-- TOC entry 5707 (class 1259 OID 84096)
-- Name: idx_timeline_event_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_event_data_gin ON public.advisor_event_timeline USING gin (event_data);


--
-- TOC entry 5708 (class 1259 OID 84095)
-- Name: idx_timeline_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_event_type ON public.advisor_event_timeline USING btree (event_type, created_at DESC);


--
-- TOC entry 5709 (class 1259 OID 84093)
-- Name: idx_timeline_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_user_time ON public.advisor_event_timeline USING btree (user_id, created_at DESC);


--
-- TOC entry 5490 (class 1259 OID 34100)
-- Name: idx_total_duration_min; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_total_duration_min ON public.project_metrics_summary USING btree (total_duration_min);


--
-- TOC entry 5787 (class 1259 OID 90139)
-- Name: idx_tpq_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tpq_state ON public.admin_two_person_queue USING btree (state, created_at DESC);


--
-- TOC entry 5719 (class 1259 OID 85531)
-- Name: idx_translation_metrics_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translation_metrics_action ON public.advisor_translation_metrics USING btree (action_type);


--
-- TOC entry 5720 (class 1259 OID 85529)
-- Name: idx_translation_metrics_advisor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translation_metrics_advisor ON public.advisor_translation_metrics USING btree (advisor_user_id);


--
-- TOC entry 5721 (class 1259 OID 85532)
-- Name: idx_translation_metrics_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translation_metrics_created ON public.advisor_translation_metrics USING btree (created_at);


--
-- TOC entry 5722 (class 1259 OID 85530)
-- Name: idx_translation_metrics_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translation_metrics_language ON public.advisor_translation_metrics USING btree (language_code);


--
-- TOC entry 5587 (class 1259 OID 65080)
-- Name: idx_unified_sessions_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_sessions_project ON public.unified_chat_sessions USING btree (project_id, created_at DESC);


--
-- TOC entry 5588 (class 1259 OID 65081)
-- Name: idx_unified_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_sessions_user ON public.unified_chat_sessions USING btree (user_id, created_at DESC);


--
-- TOC entry 5286 (class 1259 OID 17994)
-- Name: idx_usage_bonuses_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_bonuses_archived ON public.usage_bonuses USING btree (archived);


--
-- TOC entry 5287 (class 1259 OID 17995)
-- Name: idx_usage_bonuses_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_bonuses_expires_at ON public.usage_bonuses USING btree (expires_at);


--
-- TOC entry 5288 (class 1259 OID 17996)
-- Name: idx_usage_bonuses_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_bonuses_metric ON public.usage_bonuses USING btree (metric);


--
-- TOC entry 5289 (class 1259 OID 17997)
-- Name: idx_usage_bonuses_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_bonuses_user_id ON public.usage_bonuses USING btree (user_id);


--
-- TOC entry 5260 (class 1259 OID 17998)
-- Name: idx_usage_events_collisions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_collisions ON public.usage_events USING btree (collision_detected, created_at DESC) WHERE (collision_detected = true);


--
-- TOC entry 5261 (class 1259 OID 17999)
-- Name: idx_usage_events_idempotency_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_idempotency_lookup ON public.usage_events USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- TOC entry 6958 (class 0 OID 0)
-- Dependencies: 5261
-- Name: INDEX idx_usage_events_idempotency_lookup; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_usage_events_idempotency_lookup IS 'CRITICAL: Prevents duplicate request table scans';


--
-- TOC entry 5262 (class 1259 OID 18000)
-- Name: idx_usage_events_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_metric ON public.usage_events USING btree (metric, created_at DESC);


--
-- TOC entry 5263 (class 1259 OID 18001)
-- Name: idx_usage_events_time_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_time_metric ON public.usage_events USING btree (created_at DESC, metric);


--
-- TOC entry 5264 (class 1259 OID 18002)
-- Name: idx_usage_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_events_user ON public.usage_events USING btree (user_id, created_at DESC);


--
-- TOC entry 5292 (class 1259 OID 18502)
-- Name: idx_usage_tracking_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_tracking_period ON public.usage_tracking USING btree (user_id, period_start DESC);


--
-- TOC entry 5760 (class 1259 OID 89932)
-- Name: idx_user_admin_status_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_admin_status_banned ON public.user_admin_status USING btree (is_banned);


--
-- TOC entry 5761 (class 1259 OID 89933)
-- Name: idx_user_admin_status_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_admin_status_risk ON public.user_admin_status USING btree (risk_level, risk_score);


--
-- TOC entry 5762 (class 1259 OID 89931)
-- Name: idx_user_admin_status_suspended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_admin_status_suspended ON public.user_admin_status USING btree (is_suspended, suspended_until);


--
-- TOC entry 5763 (class 1259 OID 89930)
-- Name: idx_user_admin_status_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_admin_status_user_id ON public.user_admin_status USING btree (user_id);


--
-- TOC entry 5500 (class 1259 OID 37713)
-- Name: idx_user_balance_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_balance_subscription ON public.user_ai_time_balance USING btree (subscription_reset_at);


--
-- TOC entry 5501 (class 1259 OID 37712)
-- Name: idx_user_balance_used_today; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_balance_used_today ON public.user_ai_time_balance USING btree (daily_gift_used_today) WHERE (daily_gift_used_today > 0);


--
-- TOC entry 5295 (class 1259 OID 18008)
-- Name: idx_user_bonuses_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_bonuses_available ON public.user_bonuses USING btree (user_id, metric, expires_at) WHERE (used_amount < amount);


--
-- TOC entry 6959 (class 0 OID 0)
-- Dependencies: 5295
-- Name: INDEX idx_user_bonuses_available; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_user_bonuses_available IS 'CRITICAL: 90% smaller partial index for bonus calculations';


--
-- TOC entry 5296 (class 1259 OID 18009)
-- Name: idx_user_bonuses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_bonuses_user ON public.user_bonuses USING btree (user_id, metric);


--
-- TOC entry 5451 (class 1259 OID 45169)
-- Name: idx_user_comments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_comments ON public."project_versions_metadata-delete" USING btree (project_id) WHERE (user_comment IS NOT NULL);


--
-- TOC entry 5452 (class 1259 OID 33763)
-- Name: idx_version_semver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_version_semver ON public."project_versions_metadata-delete" USING btree (project_id, major_version, minor_version, patch_version);


--
-- TOC entry 5453 (class 1259 OID 33764)
-- Name: idx_version_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_version_type ON public."project_versions_metadata-delete" USING btree (change_type);


--
-- TOC entry 5547 (class 1259 OID 45179)
-- Name: idx_versioning_metrics_project_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versioning_metrics_project_type ON public.versioning_metrics USING btree (project_id, metric_type, created_at DESC);


--
-- TOC entry 5299 (class 1259 OID 18010)
-- Name: idx_webhook_dead_letter_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_dead_letter_created_at ON public.webhook_dead_letter USING btree (created_at);


--
-- TOC entry 5300 (class 1259 OID 18011)
-- Name: idx_webhook_dead_letter_gateway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_dead_letter_gateway ON public.webhook_dead_letter USING btree (gateway);


--
-- TOC entry 5301 (class 1259 OID 18012)
-- Name: idx_webhook_dead_letter_retry_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_dead_letter_retry_count ON public.webhook_dead_letter USING btree (retry_count);


--
-- TOC entry 5428 (class 1259 OID 28015)
-- Name: idx_webhook_failures_build_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_failures_build_id ON public.webhook_failures USING btree (build_id);


--
-- TOC entry 5429 (class 1259 OID 28014)
-- Name: idx_webhook_failures_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_failures_retry ON public.webhook_failures USING btree (retry_at);


--
-- TOC entry 5857 (class 1259 OID 91619)
-- Name: one_active_pricing_catalog; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_active_pricing_catalog ON public.pricing_catalog_versions USING btree ((true)) WHERE is_active;


--
-- TOC entry 5236 (class 1259 OID 45062)
-- Name: projects_build_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_build_status_idx ON public.projects USING btree (build_status);


--
-- TOC entry 5237 (class 1259 OID 45065)
-- Name: projects_current_build_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_current_build_lookup_idx ON public.projects USING btree (current_build_id) WHERE (current_build_id IS NOT NULL);


--
-- TOC entry 5238 (class 1259 OID 45063)
-- Name: projects_framework_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_framework_idx ON public.projects USING btree (framework);


--
-- TOC entry 5239 (class 1259 OID 45064)
-- Name: projects_last_build_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_last_build_started_idx ON public.projects USING btree (last_build_started DESC);


--
-- TOC entry 5576 (class 1259 OID 53667)
-- Name: uniq_build_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_build_reference ON public.project_chat_log_minimal USING btree (build_id) WHERE ((response_data ->> 'type'::text) = 'build_reference'::text);


--
-- TOC entry 5577 (class 1259 OID 80958)
-- Name: uniq_client_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_client_msg ON public.project_chat_log_minimal USING btree (project_id, client_msg_id) WHERE (client_msg_id IS NOT NULL);


--
-- TOC entry 5578 (class 1259 OID 80937)
-- Name: uniq_project_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_project_seq ON public.project_chat_log_minimal USING btree (project_id, seq);


--
-- TOC entry 5815 (class 1259 OID 91389)
-- Name: uniq_promotion_codes_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_promotion_codes_normalized ON public.promotion_codes USING btree (code_normalized);


--
-- TOC entry 5836 (class 1259 OID 91447)
-- Name: uniq_promotion_reservations_cart; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_promotion_reservations_cart ON public.promotion_reservations USING btree (user_id, promotion_code_id, cart_hash);


--
-- TOC entry 5788 (class 1259 OID 90140)
-- Name: uniq_tpq_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_tpq_pending ON public.admin_two_person_queue USING btree (action, resource_type, COALESCE(resource_id, ''::text)) WHERE (state = 'pending'::text);


--
-- TOC entry 5345 (class 1259 OID 19841)
-- Name: unique_control_per_test; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_control_per_test ON public.ab_test_variants USING btree (test_id) WHERE (is_control = true);


--
-- TOC entry 5826 (class 1259 OID 93769)
-- Name: uq_artifact_reservation_gateway; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_artifact_reservation_gateway ON public.promotion_artifacts USING btree (reservation_id, gateway) WHERE (reservation_id IS NOT NULL);


--
-- TOC entry 5729 (class 1259 OID 86949)
-- Name: uq_availability_advisor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_availability_advisor ON public.advisor_availability_settings USING btree (advisor_id);


--
-- TOC entry 5703 (class 1259 OID 84061)
-- Name: uq_drafts_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_drafts_user_active ON public.advisor_application_drafts USING btree (user_id) WHERE (is_active = true);


--
-- TOC entry 5848 (class 1259 OID 91492)
-- Name: uq_redemp_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_redemp_payment_intent ON public.promotion_redemptions USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- TOC entry 5851 (class 1259 OID 91493)
-- Name: uq_redemp_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_redemp_session ON public.promotion_redemptions USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);


--
-- TOC entry 5829 (class 1259 OID 93786)
-- Name: ux_artifacts_gateway_external_partial; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_artifacts_gateway_external_partial ON public.promotion_artifacts USING btree (gateway, external_coupon_id) WHERE (external_coupon_id IS NOT NULL);


--
-- TOC entry 5937 (class 1259 OID 92296)
-- Name: ux_customer_financial_summary_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_customer_financial_summary_unique ON public.mv_customer_financial_summary USING btree (customer_id);


--
-- TOC entry 5943 (class 1259 OID 92366)
-- Name: ux_customer_ltv_summary_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_customer_ltv_summary_unique ON public.mv_customer_ltv_summary USING btree (customer_id);


--
-- TOC entry 5896 (class 1259 OID 92050)
-- Name: ux_invoices_provider_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_invoices_provider_invoice ON public.billing_invoices USING btree (payment_provider, provider_invoice_id) WHERE (provider_invoice_id IS NOT NULL);


--
-- TOC entry 6960 (class 0 OID 0)
-- Dependencies: 5896
-- Name: INDEX ux_invoices_provider_invoice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.ux_invoices_provider_invoice IS 'Ensures uniqueness of provider invoice IDs per provider (nullable constraint)';


--
-- TOC entry 5941 (class 1259 OID 92350)
-- Name: ux_monthly_revenue_history_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_monthly_revenue_history_unique ON public.mv_monthly_revenue_history USING btree (month_date, currency, payment_provider);


--
-- TOC entry 5938 (class 1259 OID 92330)
-- Name: ux_mrr_by_currency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_mrr_by_currency_unique ON public.mv_mrr_by_currency USING btree (as_of_date, currency, payment_provider);


--
-- TOC entry 5939 (class 1259 OID 92338)
-- Name: ux_mrr_usd_normalized_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_mrr_usd_normalized_unique ON public.mv_mrr_usd_normalized USING btree (as_of_date);


--
-- TOC entry 5940 (class 1259 OID 92344)
-- Name: ux_package_revenue_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_package_revenue_unique ON public.mv_package_revenue_daily USING btree (revenue_date, currency, payment_provider);


--
-- TOC entry 5916 (class 1259 OID 92051)
-- Name: ux_payments_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_payments_idempotency_key ON public.billing_payments USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- TOC entry 6961 (class 0 OID 0)
-- Dependencies: 5916
-- Name: INDEX ux_payments_idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.ux_payments_idempotency_key IS 'Global idempotency fence prevents duplicate payments across all providers';


--
-- TOC entry 5852 (class 1259 OID 93802)
-- Name: ux_promo_code_per_user_committed; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_promo_code_per_user_committed ON public.promotion_redemptions USING btree (promotion_code_id, user_id) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5853 (class 1259 OID 93803)
-- Name: ux_promo_per_user_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_promo_per_user_once ON public.promotion_redemptions USING btree (promotion_id, user_id) WHERE (committed_at IS NOT NULL);


--
-- TOC entry 5854 (class 1259 OID 93801)
-- Name: ux_promo_redemptions_reservation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_promo_redemptions_reservation ON public.promotion_redemptions USING btree (reservation_id) WHERE (reservation_id IS NOT NULL);


--
-- TOC entry 5947 (class 1259 OID 93824)
-- Name: ux_promotion_region; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_promotion_region ON public.promotion_regional_config USING btree (promotion_id, region_code);


--
-- TOC entry 5942 (class 1259 OID 92358)
-- Name: ux_provider_performance_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_provider_performance_unique ON public.mv_provider_performance USING btree (payment_provider, currency);


--
-- TOC entry 5308 (class 1259 OID 18013)
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- TOC entry 5311 (class 1259 OID 18014)
-- Name: subscription_subscription_id_entity_filters_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters);


--
-- TOC entry 5312 (class 1259 OID 18015)
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- TOC entry 5319 (class 1259 OID 18016)
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- TOC entry 5327 (class 1259 OID 18017)
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- TOC entry 5320 (class 1259 OID 80863)
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- TOC entry 5321 (class 1259 OID 18018)
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- TOC entry 5322 (class 1259 OID 80865)
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- TOC entry 5629 (class 1259 OID 80866)
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- TOC entry 5323 (class 1259 OID 18019)
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- TOC entry 5324 (class 1259 OID 80864)
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- TOC entry 5953 (class 0 OID 0)
-- Name: messages_2025_07_27_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_07_27_pkey;


--
-- TOC entry 5954 (class 0 OID 0)
-- Name: messages_2025_07_28_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_07_28_pkey;


--
-- TOC entry 5955 (class 0 OID 0)
-- Name: messages_2025_07_29_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_07_29_pkey;


--
-- TOC entry 5956 (class 0 OID 0)
-- Name: messages_2025_07_30_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_07_30_pkey;


--
-- TOC entry 5957 (class 0 OID 0)
-- Name: messages_2025_07_31_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_07_31_pkey;


--
-- TOC entry 6134 (class 2620 OID 85534)
-- Name: advisor_specialty_translations advisor_specialty_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER advisor_specialty_translations_updated_at BEFORE UPDATE ON public.advisor_specialty_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6155 (class 2620 OID 91660)
-- Name: pricing_catalog_versions ensure_single_active_catalog_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_active_catalog_trigger BEFORE UPDATE ON public.pricing_catalog_versions FOR EACH ROW EXECUTE FUNCTION public.ensure_single_active_catalog();


--
-- TOC entry 6150 (class 2620 OID 91496)
-- Name: promotion_reservations forbid_finalized_updates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER forbid_finalized_updates BEFORE UPDATE ON public.promotion_reservations FOR EACH ROW EXECUTE FUNCTION public.forbid_updates_when_finalized();


--
-- TOC entry 6106 (class 2620 OID 18020)
-- Name: organizations handle_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- TOC entry 6132 (class 2620 OID 89949)
-- Name: advisors log_advisor_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_advisor_changes AFTER UPDATE ON public.advisors FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('advisor.update');


--
-- TOC entry 6141 (class 2620 OID 89946)
-- Name: support_ticket_messages log_support_message_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_support_message_delete AFTER DELETE ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('ticket_message.delete');


--
-- TOC entry 6142 (class 2620 OID 89944)
-- Name: support_ticket_messages log_support_message_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_support_message_insert AFTER INSERT ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('ticket_message.insert');


--
-- TOC entry 6143 (class 2620 OID 89945)
-- Name: support_ticket_messages log_support_message_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_support_message_update AFTER UPDATE ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('ticket_message.update');


--
-- TOC entry 6137 (class 2620 OID 89943)
-- Name: support_tickets log_support_ticket_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_support_ticket_delete AFTER DELETE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('ticket.delete');


--
-- TOC entry 6138 (class 2620 OID 89941)
-- Name: support_tickets log_support_ticket_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_support_ticket_insert AFTER INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('ticket.insert');


--
-- TOC entry 6139 (class 2620 OID 89942)
-- Name: support_tickets log_support_ticket_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_support_ticket_update AFTER UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('ticket.update');


--
-- TOC entry 6144 (class 2620 OID 89947)
-- Name: user_admin_status log_user_admin_status_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_user_admin_status_insert AFTER INSERT ON public.user_admin_status FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('user_status.insert');


--
-- TOC entry 6145 (class 2620 OID 89948)
-- Name: user_admin_status log_user_admin_status_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_user_admin_status_update AFTER UPDATE ON public.user_admin_status FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('user_status.update');


--
-- TOC entry 6126 (class 2620 OID 91699)
-- Name: user_ai_time_balance maintain_computed_balance_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER maintain_computed_balance_fields BEFORE INSERT OR UPDATE ON public.user_ai_time_balance FOR EACH ROW EXECUTE FUNCTION public.update_computed_balance_fields();


--
-- TOC entry 6153 (class 2620 OID 91499)
-- Name: promotion_redemptions redemptions_code_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER redemptions_code_match BEFORE INSERT OR UPDATE ON public.promotion_redemptions FOR EACH ROW EXECUTE FUNCTION public.enforce_code_promo_match();


--
-- TOC entry 6151 (class 2620 OID 91498)
-- Name: promotion_reservations reservations_code_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reservations_code_match BEFORE INSERT OR UPDATE ON public.promotion_reservations FOR EACH ROW EXECUTE FUNCTION public.enforce_code_promo_match();


--
-- TOC entry 6149 (class 2620 OID 91422)
-- Name: promotion_artifacts set_promotion_artifacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_promotion_artifacts_updated_at BEFORE UPDATE ON public.promotion_artifacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6148 (class 2620 OID 91391)
-- Name: promotion_codes set_promotion_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_promotion_codes_updated_at BEFORE UPDATE ON public.promotion_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6154 (class 2620 OID 91494)
-- Name: promotion_redemptions set_promotion_redemptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_promotion_redemptions_updated_at BEFORE UPDATE ON public.promotion_redemptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6152 (class 2620 OID 91451)
-- Name: promotion_reservations set_promotion_reservations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_promotion_reservations_updated_at BEFORE UPDATE ON public.promotion_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6147 (class 2620 OID 91370)
-- Name: promotions set_promotions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_promotions_updated_at BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6140 (class 2620 OID 89950)
-- Name: support_tickets support_tickets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_tickets_set_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6157 (class 2620 OID 92069)
-- Name: billing_customers touch_billing_customers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_billing_customers BEFORE UPDATE ON public.billing_customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 6158 (class 2620 OID 92071)
-- Name: billing_invoices touch_billing_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_billing_invoices BEFORE UPDATE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 6160 (class 2620 OID 92073)
-- Name: billing_payments touch_billing_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_billing_payments BEFORE UPDATE ON public.billing_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 6159 (class 2620 OID 92072)
-- Name: billing_subscriptions touch_billing_subscriptions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_billing_subscriptions BEFORE UPDATE ON public.billing_subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 6156 (class 2620 OID 92070)
-- Name: pricing_item_prices touch_pricing_item_prices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_pricing_item_prices BEFORE UPDATE ON public.pricing_item_prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 6133 (class 2620 OID 84102)
-- Name: advisors tr_advisors_protect_admin_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_advisors_protect_admin_fields BEFORE UPDATE ON public.advisors FOR EACH ROW EXECUTE FUNCTION public.prevent_advisor_admin_field_changes();


--
-- TOC entry 6136 (class 2620 OID 87032)
-- Name: advisor_analytics_summary trg_analytics_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_updated BEFORE UPDATE ON public.advisor_analytics_summary FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6135 (class 2620 OID 86958)
-- Name: advisor_availability_settings trg_availability_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_availability_updated BEFORE UPDATE ON public.advisor_availability_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6128 (class 2620 OID 80928)
-- Name: project_chat_log_minimal trg_set_chat_seq; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_chat_seq BEFORE INSERT ON public.project_chat_log_minimal FOR EACH ROW EXECUTE FUNCTION public.set_chat_seq();


--
-- TOC entry 6108 (class 2620 OID 18022)
-- Name: projects trigger_add_owner_as_collaborator; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_add_owner_as_collaborator AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_collaborator();


--
-- TOC entry 6107 (class 2620 OID 18024)
-- Name: plan_limits trigger_plan_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_plan_limits_updated_at BEFORE UPDATE ON public.plan_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6109 (class 2620 OID 18025)
-- Name: projects trigger_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6161 (class 2620 OID 93838)
-- Name: promotion_regional_config trigger_update_promotion_regional_config_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_promotion_regional_config_timestamp BEFORE UPDATE ON public.promotion_regional_config FOR EACH ROW EXECUTE FUNCTION public.update_promotion_regional_config_timestamp();


--
-- TOC entry 6125 (class 2620 OID 34122)
-- Name: project_metrics_summary trigger_update_total_duration_min; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_total_duration_min BEFORE INSERT OR UPDATE ON public.project_metrics_summary FOR EACH ROW EXECUTE FUNCTION public.update_total_duration_min();


--
-- TOC entry 6112 (class 2620 OID 18027)
-- Name: usage_tracking trigger_usage_tracking_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_usage_tracking_updated_at BEFORE UPDATE ON public.usage_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6119 (class 2620 OID 19840)
-- Name: ab_tests update_ab_tests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ab_tests_updated_at BEFORE UPDATE ON public.ab_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6110 (class 2620 OID 53711)
-- Name: projects update_ai_session_timestamp_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_session_timestamp_trigger BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_ai_session_timestamp();


--
-- TOC entry 6104 (class 2620 OID 18028)
-- Name: branches update_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6124 (class 2620 OID 26838)
-- Name: project_build_records update_build_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_build_records_updated_at BEFORE UPDATE ON public.project_build_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6105 (class 2620 OID 18029)
-- Name: commits update_commits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_commits_updated_at BEFORE UPDATE ON public.commits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6120 (class 2620 OID 19945)
-- Name: component_map update_component_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_component_map_updated_at BEFORE UPDATE ON public.component_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6121 (class 2620 OID 25581)
-- Name: project_versions update_project_versions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_versions_updated_at BEFORE UPDATE ON public.project_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6111 (class 2620 OID 18031)
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6122 (class 2620 OID 26836)
-- Name: worker_task_plans update_task_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_task_plans_updated_at BEFORE UPDATE ON public.worker_task_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6123 (class 2620 OID 26837)
-- Name: worker_tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.worker_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6129 (class 2620 OID 65083)
-- Name: unified_chat_sessions update_unified_session_activity_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_unified_session_activity_trigger BEFORE UPDATE ON public.unified_chat_sessions FOR EACH ROW EXECUTE FUNCTION public.update_unified_session_activity();


--
-- TOC entry 6127 (class 2620 OID 37782)
-- Name: user_ai_time_balance update_user_ai_time_balance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_ai_time_balance_updated_at BEFORE UPDATE ON public.user_ai_time_balance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 6146 (class 2620 OID 89951)
-- Name: user_admin_status user_admin_status_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_admin_status_set_updated_at BEFORE UPDATE ON public.user_admin_status FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 6113 (class 2620 OID 18032)
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- TOC entry 6114 (class 2620 OID 80873)
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- TOC entry 6115 (class 2620 OID 80861)
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- TOC entry 6116 (class 2620 OID 80859)
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- TOC entry 6117 (class 2620 OID 80860)
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- TOC entry 6130 (class 2620 OID 80869)
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- TOC entry 6131 (class 2620 OID 80858)
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- TOC entry 6118 (class 2620 OID 18033)
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- TOC entry 5958 (class 2606 OID 18034)
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5959 (class 2606 OID 18039)
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- TOC entry 5960 (class 2606 OID 18044)
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- TOC entry 5961 (class 2606 OID 18049)
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5962 (class 2606 OID 18054)
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5963 (class 2606 OID 18059)
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- TOC entry 5964 (class 2606 OID 18064)
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 5965 (class 2606 OID 18069)
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- TOC entry 5966 (class 2606 OID 18074)
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 5967 (class 2606 OID 18079)
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5968 (class 2606 OID 18084)
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 6007 (class 2606 OID 19792)
-- Name: ab_test_assignments ab_test_assignments_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;


--
-- TOC entry 6008 (class 2606 OID 19802)
-- Name: ab_test_assignments ab_test_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6009 (class 2606 OID 19797)
-- Name: ab_test_assignments ab_test_assignments_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_assignments
    ADD CONSTRAINT ab_test_assignments_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.ab_test_variants(id) ON DELETE CASCADE;


--
-- TOC entry 6010 (class 2606 OID 19818)
-- Name: ab_test_results ab_test_results_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_results
    ADD CONSTRAINT ab_test_results_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;


--
-- TOC entry 6011 (class 2606 OID 19828)
-- Name: ab_test_results ab_test_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_results
    ADD CONSTRAINT ab_test_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6012 (class 2606 OID 19823)
-- Name: ab_test_results ab_test_results_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_results
    ADD CONSTRAINT ab_test_results_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.ab_test_variants(id) ON DELETE CASCADE;


--
-- TOC entry 6006 (class 2606 OID 19776)
-- Name: ab_test_variants ab_test_variants_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_test_variants
    ADD CONSTRAINT ab_test_variants_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;


--
-- TOC entry 5969 (class 2606 OID 18089)
-- Name: admin_alerts admin_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id);


--
-- TOC entry 6077 (class 2606 OID 90065)
-- Name: admin_sessions admin_sessions_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id);


--
-- TOC entry 6078 (class 2606 OID 90060)
-- Name: admin_sessions admin_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6059 (class 2606 OID 81570)
-- Name: advisor_adjustments advisor_adjustments_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_adjustments
    ADD CONSTRAINT advisor_adjustments_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id);


--
-- TOC entry 6060 (class 2606 OID 81575)
-- Name: advisor_adjustments advisor_adjustments_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_adjustments
    ADD CONSTRAINT advisor_adjustments_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.advisor_consultations(id);


--
-- TOC entry 6061 (class 2606 OID 81580)
-- Name: advisor_adjustments advisor_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_adjustments
    ADD CONSTRAINT advisor_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 6075 (class 2606 OID 87023)
-- Name: advisor_analytics_summary advisor_analytics_summary_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_analytics_summary
    ADD CONSTRAINT advisor_analytics_summary_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id) ON DELETE CASCADE;


--
-- TOC entry 6067 (class 2606 OID 84056)
-- Name: advisor_application_drafts advisor_application_drafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_application_drafts
    ADD CONSTRAINT advisor_application_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6074 (class 2606 OID 86944)
-- Name: advisor_availability_settings advisor_availability_settings_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_availability_settings
    ADD CONSTRAINT advisor_availability_settings_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id) ON DELETE CASCADE;


--
-- TOC entry 6058 (class 2606 OID 81555)
-- Name: advisor_consultation_charges advisor_consultation_charges_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultation_charges
    ADD CONSTRAINT advisor_consultation_charges_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.advisor_consultations(id);


--
-- TOC entry 6055 (class 2606 OID 81525)
-- Name: advisor_consultations advisor_consultations_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id);


--
-- TOC entry 6056 (class 2606 OID 81530)
-- Name: advisor_consultations advisor_consultations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.users(id);


--
-- TOC entry 6057 (class 2606 OID 81535)
-- Name: advisor_consultations advisor_consultations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- TOC entry 6068 (class 2606 OID 84079)
-- Name: advisor_event_timeline advisor_event_timeline_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_event_timeline
    ADD CONSTRAINT advisor_event_timeline_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id);


--
-- TOC entry 6069 (class 2606 OID 84084)
-- Name: advisor_event_timeline advisor_event_timeline_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_event_timeline
    ADD CONSTRAINT advisor_event_timeline_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 6070 (class 2606 OID 84074)
-- Name: advisor_event_timeline advisor_event_timeline_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_event_timeline
    ADD CONSTRAINT advisor_event_timeline_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6073 (class 2606 OID 85666)
-- Name: advisor_free_consultation_metrics advisor_free_consultation_metrics_advisor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_free_consultation_metrics
    ADD CONSTRAINT advisor_free_consultation_metrics_advisor_user_id_fkey FOREIGN KEY (advisor_user_id) REFERENCES auth.users(id);


--
-- TOC entry 6065 (class 2606 OID 81625)
-- Name: advisor_payouts advisor_payouts_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_payouts
    ADD CONSTRAINT advisor_payouts_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id);


--
-- TOC entry 6066 (class 2606 OID 81630)
-- Name: advisor_payouts advisor_payouts_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_payouts
    ADD CONSTRAINT advisor_payouts_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id);


--
-- TOC entry 6062 (class 2606 OID 81598)
-- Name: advisor_reviews advisor_reviews_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_reviews
    ADD CONSTRAINT advisor_reviews_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.advisors(id);


--
-- TOC entry 6063 (class 2606 OID 81603)
-- Name: advisor_reviews advisor_reviews_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_reviews
    ADD CONSTRAINT advisor_reviews_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.users(id);


--
-- TOC entry 6064 (class 2606 OID 81608)
-- Name: advisor_reviews advisor_reviews_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_reviews
    ADD CONSTRAINT advisor_reviews_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.advisor_consultations(id);


--
-- TOC entry 6071 (class 2606 OID 85500)
-- Name: advisor_specialty_translations advisor_specialty_translations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_specialty_translations
    ADD CONSTRAINT advisor_specialty_translations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 6072 (class 2606 OID 85524)
-- Name: advisor_translation_metrics advisor_translation_metrics_advisor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_translation_metrics
    ADD CONSTRAINT advisor_translation_metrics_advisor_user_id_fkey FOREIGN KEY (advisor_user_id) REFERENCES auth.users(id);


--
-- TOC entry 6053 (class 2606 OID 81504)
-- Name: advisors advisors_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisors
    ADD CONSTRAINT advisors_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- TOC entry 6054 (class 2606 OID 81499)
-- Name: advisors advisors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisors
    ADD CONSTRAINT advisors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6100 (class 2606 OID 92045)
-- Name: ai_time_ledger ai_time_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_time_ledger
    ADD CONSTRAINT ai_time_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 6101 (class 2606 OID 92040)
-- Name: ai_time_ledger ai_time_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_time_ledger
    ADD CONSTRAINT ai_time_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 5970 (class 2606 OID 18094)
-- Name: assets assets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 5971 (class 2606 OID 18099)
-- Name: assets assets_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES auth.users(id);


--
-- TOC entry 6092 (class 2606 OID 91930)
-- Name: billing_customers billing_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6093 (class 2606 OID 91954)
-- Name: billing_invoices billing_invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.billing_customers(id) ON DELETE CASCADE;


--
-- TOC entry 6094 (class 2606 OID 91959)
-- Name: billing_invoices billing_invoices_pricing_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pricing_item_id_fkey FOREIGN KEY (pricing_item_id) REFERENCES public.pricing_items(id);


--
-- TOC entry 6095 (class 2606 OID 93831)
-- Name: billing_invoices billing_invoices_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id);


--
-- TOC entry 6098 (class 2606 OID 92006)
-- Name: billing_payments billing_payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.billing_customers(id) ON DELETE CASCADE;


--
-- TOC entry 6099 (class 2606 OID 92011)
-- Name: billing_payments billing_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id);


--
-- TOC entry 6096 (class 2606 OID 91979)
-- Name: billing_subscriptions billing_subscriptions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.billing_customers(id) ON DELETE CASCADE;


--
-- TOC entry 6097 (class 2606 OID 91984)
-- Name: billing_subscriptions billing_subscriptions_pricing_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pricing_item_id_fkey FOREIGN KEY (pricing_item_id) REFERENCES public.pricing_items(id);


--
-- TOC entry 5972 (class 2606 OID 18104)
-- Name: branches branches_head_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_head_id_fkey FOREIGN KEY (head_id) REFERENCES public.commits(id) ON DELETE SET NULL;


--
-- TOC entry 5973 (class 2606 OID 18109)
-- Name: branches branches_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 5974 (class 2606 OID 18114)
-- Name: claude_user_usage claude_user_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claude_user_usage
    ADD CONSTRAINT claude_user_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5975 (class 2606 OID 18119)
-- Name: commits commits_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id);


--
-- TOC entry 5976 (class 2606 OID 18124)
-- Name: commits commits_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6013 (class 2606 OID 19935)
-- Name: component_map component_map_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_map
    ADD CONSTRAINT component_map_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 5977 (class 2606 OID 18134)
-- Name: export_logs export_logs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_logs
    ADD CONSTRAINT export_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- TOC entry 5978 (class 2606 OID 18139)
-- Name: export_logs export_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_logs
    ADD CONSTRAINT export_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6039 (class 2606 OID 69725)
-- Name: supabase_breakglass_recovery fk_breakglass_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_breakglass_recovery
    ADD CONSTRAINT fk_breakglass_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6040 (class 2606 OID 69705)
-- Name: supabase_breakglass_recovery fk_breakglass_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_breakglass_recovery
    ADD CONSTRAINT fk_breakglass_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6029 (class 2606 OID 53378)
-- Name: project_chat_log_minimal fk_chat_log_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_log_minimal
    ADD CONSTRAINT fk_chat_log_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6037 (class 2606 OID 69720)
-- Name: oauth_exchange_idempotency fk_oauth_idempotency_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_exchange_idempotency
    ADD CONSTRAINT fk_oauth_idempotency_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6038 (class 2606 OID 69700)
-- Name: oauth_exchange_idempotency fk_oauth_idempotency_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_exchange_idempotency
    ADD CONSTRAINT fk_oauth_idempotency_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6035 (class 2606 OID 69715)
-- Name: oauth_state_nonces fk_oauth_nonces_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state_nonces
    ADD CONSTRAINT fk_oauth_nonces_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6036 (class 2606 OID 69695)
-- Name: oauth_state_nonces fk_oauth_nonces_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state_nonces
    ADD CONSTRAINT fk_oauth_nonces_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6019 (class 2606 OID 33757)
-- Name: project_versions_metadata-delete fk_parent_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT fk_parent_version FOREIGN KEY (parent_version_id) REFERENCES public."project_versions_metadata-delete"(version_id);


--
-- TOC entry 6028 (class 2606 OID 45279)
-- Name: project_published_domains fk_project_domain; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_published_domains
    ADD CONSTRAINT fk_project_domain FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6042 (class 2606 OID 69789)
-- Name: project_integrations fk_project_integrations_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_integrations
    ADD CONSTRAINT fk_project_integrations_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6020 (class 2606 OID 45265)
-- Name: project_versions_metadata-delete fk_published_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT fk_published_by_user FOREIGN KEY (published_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5988 (class 2606 OID 53489)
-- Name: projects fk_published_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_published_version FOREIGN KEY (published_version_id) REFERENCES public.project_versions(version_id) ON DELETE SET NULL;


--
-- TOC entry 6021 (class 2606 OID 45132)
-- Name: project_versions_metadata-delete fk_rollback_source; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT fk_rollback_source FOREIGN KEY (rollback_source_version_id) REFERENCES public."project_versions_metadata-delete"(version_id);


--
-- TOC entry 6022 (class 2606 OID 45137)
-- Name: project_versions_metadata-delete fk_rollback_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT fk_rollback_target FOREIGN KEY (rollback_target_version_id) REFERENCES public."project_versions_metadata-delete"(version_id);


--
-- TOC entry 6032 (class 2606 OID 69710)
-- Name: supabase_connections fk_supabase_connections_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_connections
    ADD CONSTRAINT fk_supabase_connections_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6033 (class 2606 OID 69690)
-- Name: supabase_connections fk_supabase_connections_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_connections
    ADD CONSTRAINT fk_supabase_connections_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6023 (class 2606 OID 45127)
-- Name: project_versions_metadata-delete fk_superseded_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."project_versions_metadata-delete"
    ADD CONSTRAINT fk_superseded_by FOREIGN KEY (superseded_by_version_id) REFERENCES public."project_versions_metadata-delete"(version_id) ON DELETE SET NULL;


--
-- TOC entry 6014 (class 2606 OID 33766)
-- Name: project_versions fk_version_metadata; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT fk_version_metadata FOREIGN KEY (version_metadata_id) REFERENCES public."project_versions_metadata-delete"(version_id);


--
-- TOC entry 6079 (class 2606 OID 90186)
-- Name: github_sync_operations github_sync_operations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_sync_operations
    ADD CONSTRAINT github_sync_operations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 5979 (class 2606 OID 18179)
-- Name: organization_members organization_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- TOC entry 5980 (class 2606 OID 18184)
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5981 (class 2606 OID 18189)
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5982 (class 2606 OID 18194)
-- Name: organization_usage organization_usage_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage
    ADD CONSTRAINT organization_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- TOC entry 5983 (class 2606 OID 18199)
-- Name: organizations organizations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- TOC entry 5984 (class 2606 OID 18209)
-- Name: plan_change_log plan_change_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_change_log
    ADD CONSTRAINT plan_change_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6089 (class 2606 OID 91612)
-- Name: pricing_catalog_versions pricing_catalog_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_catalog_versions
    ADD CONSTRAINT pricing_catalog_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 6091 (class 2606 OID 91906)
-- Name: pricing_item_prices pricing_item_prices_pricing_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_item_prices
    ADD CONSTRAINT pricing_item_prices_pricing_item_id_fkey FOREIGN KEY (pricing_item_id) REFERENCES public.pricing_items(id) ON DELETE CASCADE;


--
-- TOC entry 6090 (class 2606 OID 91649)
-- Name: pricing_items pricing_items_catalog_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_items
    ADD CONSTRAINT pricing_items_catalog_version_id_fkey FOREIGN KEY (catalog_version_id) REFERENCES public.pricing_catalog_versions(id);


--
-- TOC entry 6050 (class 2606 OID 81063)
-- Name: project_advisors project_advisors_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_advisors
    ADD CONSTRAINT project_advisors_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6051 (class 2606 OID 81058)
-- Name: project_advisors project_advisors_advisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_advisors
    ADD CONSTRAINT project_advisors_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6052 (class 2606 OID 81053)
-- Name: project_advisors project_advisors_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_advisors
    ADD CONSTRAINT project_advisors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6018 (class 2606 OID 38056)
-- Name: project_build_events project_build_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_build_events
    ADD CONSTRAINT project_build_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6046 (class 2606 OID 81014)
-- Name: project_chat_last_read project_chat_last_read_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_last_read
    ADD CONSTRAINT project_chat_last_read_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6047 (class 2606 OID 81019)
-- Name: project_chat_last_read project_chat_last_read_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_last_read
    ADD CONSTRAINT project_chat_last_read_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6030 (class 2606 OID 53627)
-- Name: project_chat_log_minimal project_chat_log_minimal_parent_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_log_minimal
    ADD CONSTRAINT project_chat_log_minimal_parent_message_id_fkey FOREIGN KEY (parent_message_id) REFERENCES public.project_chat_log_minimal(id);


--
-- TOC entry 6044 (class 2606 OID 80998)
-- Name: project_chat_read_receipts project_chat_read_receipts_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_read_receipts
    ADD CONSTRAINT project_chat_read_receipts_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.project_chat_log_minimal(id) ON DELETE CASCADE;


--
-- TOC entry 6045 (class 2606 OID 81003)
-- Name: project_chat_read_receipts project_chat_read_receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chat_read_receipts
    ADD CONSTRAINT project_chat_read_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5985 (class 2606 OID 18214)
-- Name: project_collaborators project_collaborators_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- TOC entry 5986 (class 2606 OID 18219)
-- Name: project_collaborators project_collaborators_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 5987 (class 2606 OID 18224)
-- Name: project_collaborators project_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6048 (class 2606 OID 81033)
-- Name: project_memberships project_memberships_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 6049 (class 2606 OID 81038)
-- Name: project_memberships project_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5989 (class 2606 OID 45052)
-- Name: projects projects_current_build_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_current_build_fk FOREIGN KEY (current_build_id) REFERENCES public.project_build_metrics(build_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 5990 (class 2606 OID 45057)
-- Name: projects projects_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_current_version_fk FOREIGN KEY (current_version_id) REFERENCES public.project_versions(version_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 5991 (class 2606 OID 73871)
-- Name: projects projects_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- TOC entry 5992 (class 2606 OID 18229)
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6081 (class 2606 OID 91412)
-- Name: promotion_artifacts promotion_artifacts_promotion_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT promotion_artifacts_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_codes(id) ON DELETE CASCADE;


--
-- TOC entry 6082 (class 2606 OID 91407)
-- Name: promotion_artifacts promotion_artifacts_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT promotion_artifacts_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 6083 (class 2606 OID 91452)
-- Name: promotion_artifacts promotion_artifacts_reservation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_artifacts
    ADD CONSTRAINT promotion_artifacts_reservation_fk FOREIGN KEY (reservation_id) REFERENCES public.promotion_reservations(id) ON DELETE SET NULL;


--
-- TOC entry 6080 (class 2606 OID 91384)
-- Name: promotion_codes promotion_codes_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_codes
    ADD CONSTRAINT promotion_codes_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 6103 (class 2606 OID 93964)
-- Name: promotion_provider_changes promotion_provider_changes_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_provider_changes
    ADD CONSTRAINT promotion_provider_changes_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 6086 (class 2606 OID 91478)
-- Name: promotion_redemptions promotion_redemptions_promotion_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_codes(id);


--
-- TOC entry 6087 (class 2606 OID 91473)
-- Name: promotion_redemptions promotion_redemptions_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id);


--
-- TOC entry 6088 (class 2606 OID 91483)
-- Name: promotion_redemptions promotion_redemptions_reservation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.promotion_reservations(id);


--
-- TOC entry 6102 (class 2606 OID 93819)
-- Name: promotion_regional_config promotion_regional_config_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_regional_config
    ADD CONSTRAINT promotion_regional_config_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 6084 (class 2606 OID 91442)
-- Name: promotion_reservations promotion_reservations_promotion_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_reservations
    ADD CONSTRAINT promotion_reservations_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_codes(id) ON DELETE CASCADE;


--
-- TOC entry 6085 (class 2606 OID 91437)
-- Name: promotion_reservations promotion_reservations_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_reservations
    ADD CONSTRAINT promotion_reservations_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 5993 (class 2606 OID 18234)
-- Name: quota_audit_log quota_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_audit_log
    ADD CONSTRAINT quota_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 5994 (class 2606 OID 18239)
-- Name: quota_audit_logs quota_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_audit_logs
    ADD CONSTRAINT quota_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 5996 (class 2606 OID 18244)
-- Name: referrals referrals_referred_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES auth.users(id);


--
-- TOC entry 5997 (class 2606 OID 18249)
-- Name: referrals referrals_referrer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id);


--
-- TOC entry 5998 (class 2606 OID 18254)
-- Name: storage_audit_log storage_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_audit_log
    ADD CONSTRAINT storage_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6034 (class 2606 OID 69635)
-- Name: supabase_account_discovery supabase_account_discovery_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_account_discovery
    ADD CONSTRAINT supabase_account_discovery_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.supabase_connections(id) ON DELETE CASCADE;


--
-- TOC entry 6041 (class 2606 OID 69679)
-- Name: supabase_breakglass_recovery supabase_breakglass_recovery_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_breakglass_recovery
    ADD CONSTRAINT supabase_breakglass_recovery_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.supabase_connections(id) ON DELETE CASCADE;


--
-- TOC entry 6076 (class 2606 OID 89882)
-- Name: support_ticket_messages support_ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- TOC entry 6031 (class 2606 OID 65075)
-- Name: unified_chat_sessions unified_chat_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_chat_sessions
    ADD CONSTRAINT unified_chat_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 5999 (class 2606 OID 18274)
-- Name: usage_bonuses usage_bonuses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_bonuses
    ADD CONSTRAINT usage_bonuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 5995 (class 2606 OID 18279)
-- Name: usage_events usage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6000 (class 2606 OID 18284)
-- Name: usage_tracking usage_tracking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_tracking
    ADD CONSTRAINT usage_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6027 (class 2606 OID 37775)
-- Name: user_ai_consumption_metadata user_ai_consumption_metadata_consumption_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_consumption_metadata
    ADD CONSTRAINT user_ai_consumption_metadata_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES public.user_ai_time_consumption(id) ON DELETE CASCADE;


--
-- TOC entry 6024 (class 2606 OID 37707)
-- Name: user_ai_time_balance user_ai_time_balance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_balance
    ADD CONSTRAINT user_ai_time_balance_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6025 (class 2606 OID 37736)
-- Name: user_ai_time_consumption user_ai_time_consumption_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_consumption
    ADD CONSTRAINT user_ai_time_consumption_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6026 (class 2606 OID 37759)
-- Name: user_ai_time_purchases user_ai_time_purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_time_purchases
    ADD CONSTRAINT user_ai_time_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 6001 (class 2606 OID 18289)
-- Name: user_bonuses user_bonuses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_bonuses
    ADD CONSTRAINT user_bonuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 6016 (class 2606 OID 26806)
-- Name: worker_task_dependencies worker_task_dependencies_depends_on_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_dependencies
    ADD CONSTRAINT worker_task_dependencies_depends_on_fkey FOREIGN KEY (depends_on) REFERENCES public.worker_tasks(task_id) ON DELETE CASCADE;


--
-- TOC entry 6017 (class 2606 OID 26801)
-- Name: worker_task_dependencies worker_task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_dependencies
    ADD CONSTRAINT worker_task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.worker_tasks(task_id) ON DELETE CASCADE;


--
-- TOC entry 6015 (class 2606 OID 26785)
-- Name: worker_tasks worker_tasks_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_tasks
    ADD CONSTRAINT worker_tasks_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.worker_task_plans(plan_id) ON DELETE CASCADE;


--
-- TOC entry 6002 (class 2606 OID 18294)
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 6043 (class 2606 OID 80846)
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 6003 (class 2606 OID 18299)
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 6004 (class 2606 OID 18304)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 6005 (class 2606 OID 18309)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- TOC entry 6331 (class 0 OID 17268)
-- Dependencies: 257
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6332 (class 0 OID 17274)
-- Dependencies: 258
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6333 (class 0 OID 17279)
-- Dependencies: 259
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6334 (class 0 OID 17286)
-- Dependencies: 260
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6335 (class 0 OID 17291)
-- Dependencies: 261
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6336 (class 0 OID 17296)
-- Dependencies: 262
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6337 (class 0 OID 17301)
-- Dependencies: 263
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6338 (class 0 OID 17306)
-- Dependencies: 264
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6339 (class 0 OID 17314)
-- Dependencies: 265
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6340 (class 0 OID 17320)
-- Dependencies: 267
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6341 (class 0 OID 17328)
-- Dependencies: 268
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6342 (class 0 OID 17334)
-- Dependencies: 269
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6343 (class 0 OID 17337)
-- Dependencies: 270
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6344 (class 0 OID 17342)
-- Dependencies: 271
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6345 (class 0 OID 17348)
-- Dependencies: 272
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6346 (class 0 OID 17354)
-- Dependencies: 273
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6483 (class 3256 OID 19847)
-- Name: ab_tests Admins can manage all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all" ON public.ab_tests TO authenticated USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6484 (class 3256 OID 19848)
-- Name: ab_test_variants Admins can manage all variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all variants" ON public.ab_test_variants TO authenticated USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6485 (class 3256 OID 19849)
-- Name: ab_test_assignments Admins can view all assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all assignments" ON public.ab_test_assignments FOR SELECT TO authenticated USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6486 (class 3256 OID 19850)
-- Name: ab_test_results Admins can view all results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all results" ON public.ab_test_results FOR SELECT TO authenticated USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6487 (class 3256 OID 19896)
-- Name: ab_tests Authenticated users can manage all tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage all tests" ON public.ab_tests TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- TOC entry 6488 (class 3256 OID 19897)
-- Name: ab_test_variants Authenticated users can manage all variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage all variants" ON public.ab_test_variants TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- TOC entry 6489 (class 3256 OID 19898)
-- Name: ab_test_assignments Authenticated users can view all assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all assignments" ON public.ab_test_assignments FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- TOC entry 6490 (class 3256 OID 19899)
-- Name: ab_test_results Authenticated users can view all results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all results" ON public.ab_test_results FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- TOC entry 6447 (class 3256 OID 18314)
-- Name: organization_members Organization members can view members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can view members" ON public.organization_members FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_members om
  WHERE ((om.organization_id = organization_members.organization_id) AND (om.user_id = auth.uid())))));


--
-- TOC entry 6448 (class 3256 OID 18315)
-- Name: organizations Organization members can view organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can view organization" ON public.organizations FOR SELECT USING (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.organization_members
  WHERE ((organization_members.organization_id = organizations.id) AND (organization_members.user_id = auth.uid()))))));


--
-- TOC entry 6449 (class 3256 OID 18316)
-- Name: organization_usage Organization members can view usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can view usage" ON public.organization_usage FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_members
  WHERE ((organization_members.organization_id = organization_usage.organization_id) AND (organization_members.user_id = auth.uid())))));


--
-- TOC entry 6450 (class 3256 OID 18317)
-- Name: organizations Organization owners can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization owners can update" ON public.organizations FOR UPDATE USING ((owner_id = auth.uid()));


--
-- TOC entry 6494 (class 3256 OID 38064)
-- Name: project_build_events Service role can insert build events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert build events" ON public.project_build_events FOR INSERT WITH CHECK (true);


--
-- TOC entry 6451 (class 3256 OID 18319)
-- Name: organization_members Service role can manage organization members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage organization members" ON public.organization_members USING ((auth.role() = 'service_role'::text));


--
-- TOC entry 6452 (class 3256 OID 18320)
-- Name: organization_usage Service role can manage organization usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage organization usage" ON public.organization_usage USING ((auth.role() = 'service_role'::text));


--
-- TOC entry 6453 (class 3256 OID 18321)
-- Name: organizations Service role can manage organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage organizations" ON public.organizations USING ((auth.role() = 'service_role'::text));


--
-- TOC entry 6454 (class 3256 OID 18322)
-- Name: referrals Service role can manage referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage referrals" ON public.referrals USING ((auth.role() = 'service_role'::text));


--
-- TOC entry 6455 (class 3256 OID 18324)
-- Name: usage_bonuses Service role can manage usage bonuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage usage bonuses" ON public.usage_bonuses USING ((auth.role() = 'service_role'::text));


--
-- TOC entry 6456 (class 3256 OID 18325)
-- Name: webhook_dead_letter Service role can manage webhook dead letter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage webhook dead letter" ON public.webhook_dead_letter USING ((auth.role() = 'service_role'::text));


--
-- TOC entry 6495 (class 3256 OID 38065)
-- Name: project_build_events Service role can update build events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update build events" ON public.project_build_events FOR UPDATE USING (true);


--
-- TOC entry 6481 (class 3256 OID 19845)
-- Name: ab_test_assignments Users can create assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create assignments" ON public.ab_test_assignments FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR (session_id = current_setting('app.session_id'::text, true))));


--
-- TOC entry 6482 (class 3256 OID 19846)
-- Name: ab_test_results Users can create results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create results" ON public.ab_test_results FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR (session_id = current_setting('app.session_id'::text, true))));


--
-- TOC entry 6478 (class 3256 OID 19842)
-- Name: ab_tests Users can view active tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view active tests" ON public.ab_tests FOR SELECT TO authenticated USING ((status = 'active'::text));


--
-- TOC entry 6493 (class 3256 OID 38063)
-- Name: project_build_events Users can view own build events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own build events" ON public.project_build_events FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 6457 (class 3256 OID 18327)
-- Name: claude_user_usage Users can view own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own usage" ON public.claude_user_usage FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 6458 (class 3256 OID 18328)
-- Name: usage_bonuses Users can view own usage bonuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own usage bonuses" ON public.usage_bonuses FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 6459 (class 3256 OID 18329)
-- Name: referrals Users can view related referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view related referrals" ON public.referrals FOR SELECT USING (((auth.uid() = referrer_user_id) OR (auth.uid() = referred_user_id)));


--
-- TOC entry 6480 (class 3256 OID 19844)
-- Name: ab_test_assignments Users can view their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their assignments" ON public.ab_test_assignments FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (session_id = current_setting('app.session_id'::text, true))));


--
-- TOC entry 6479 (class 3256 OID 19843)
-- Name: ab_test_variants Users can view variants for active tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view variants for active tests" ON public.ab_test_variants FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.ab_tests
  WHERE ((ab_tests.id = ab_test_variants.test_id) AND (ab_tests.status = 'active'::text)))));


--
-- TOC entry 6621 (class 3256 OID 90113)
-- Name: admin_action_log_app aal_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_insert ON public.admin_action_log_app FOR INSERT WITH CHECK (public.is_admin(auth.uid()));


--
-- TOC entry 6620 (class 3256 OID 90112)
-- Name: admin_action_log_app aal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_read ON public.admin_action_log_app FOR SELECT USING (public.is_admin(auth.uid()));


--
-- TOC entry 6379 (class 0 OID 19781)
-- Dependencies: 318
-- Name: ab_test_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6572 (class 3256 OID 73703)
-- Name: ab_test_assignments ab_test_assignments_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ab_test_assignments_admin_delete ON public.ab_test_assignments FOR DELETE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6571 (class 3256 OID 73702)
-- Name: ab_test_assignments ab_test_assignments_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ab_test_assignments_user_update ON public.ab_test_assignments FOR UPDATE USING (((user_id = auth.uid()) OR ((auth.jwt() ->> 'role'::text) = 'admin'::text)));


--
-- TOC entry 6380 (class 0 OID 19807)
-- Dependencies: 319
-- Name: ab_test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ab_test_results ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6574 (class 3256 OID 73705)
-- Name: ab_test_results ab_test_results_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ab_test_results_admin_delete ON public.ab_test_results FOR DELETE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6573 (class 3256 OID 73704)
-- Name: ab_test_results ab_test_results_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ab_test_results_admin_update ON public.ab_test_results FOR UPDATE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6378 (class 0 OID 19763)
-- Dependencies: 317
-- Name: ab_test_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6377 (class 0 OID 19747)
-- Dependencies: 316
-- Name: ab_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6436 (class 0 OID 89887)
-- Dependencies: 406
-- Name: admin_action_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6615 (class 3256 OID 89964)
-- Name: admin_action_log admin_action_log_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_action_log_admin_read ON public.admin_action_log FOR SELECT USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('admin.audit'::text)));


--
-- TOC entry 6439 (class 0 OID 90099)
-- Dependencies: 411
-- Name: admin_action_log_app; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_action_log_app ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6347 (class 0 OID 17369)
-- Dependencies: 274
-- Name: admin_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6545 (class 3256 OID 73649)
-- Name: admin_alerts admin_alerts_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_alerts_admin_only ON public.admin_alerts USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6628 (class 3256 OID 91511)
-- Name: promotion_codes admin_full_access_promotion_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_promotion_codes ON public.promotion_codes USING (public.has_admin_perm('promotion:*'::text));


--
-- TOC entry 6627 (class 3256 OID 91510)
-- Name: promotions admin_full_access_promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_promotions ON public.promotions USING (public.has_admin_perm('promotion:*'::text));


--
-- TOC entry 6438 (class 0 OID 90047)
-- Dependencies: 410
-- Name: admin_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6619 (class 3256 OID 90075)
-- Name: admin_sessions admin_sessions_own_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sessions_own_sessions ON public.admin_sessions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- TOC entry 6618 (class 3256 OID 90074)
-- Name: admin_sessions admin_sessions_super_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sessions_super_admin_all ON public.admin_sessions TO authenticated USING ((((auth.jwt() ->> 'role'::text) = 'super_admin'::text) OR (((auth.jwt() ->> 'is_admin'::text))::boolean = true) OR (EXISTS ( SELECT 1
   FROM jsonb_array_elements_text(COALESCE((auth.jwt() -> 'admin_permissions'::text), '[]'::jsonb)) p(value)
  WHERE (p.value = 'admin.super'::text)))));


--
-- TOC entry 6441 (class 0 OID 90128)
-- Dependencies: 413
-- Name: admin_two_person_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_two_person_queue ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6425 (class 0 OID 81560)
-- Dependencies: 393
-- Name: advisor_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_adjustments ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6433 (class 0 OID 87006)
-- Dependencies: 403
-- Name: advisor_analytics_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_analytics_summary ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6429 (class 0 OID 84043)
-- Dependencies: 397
-- Name: advisor_application_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_application_drafts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6432 (class 0 OID 86927)
-- Dependencies: 402
-- Name: advisor_availability_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_availability_settings ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6424 (class 0 OID 81540)
-- Dependencies: 392
-- Name: advisor_consultation_charges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_consultation_charges ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6423 (class 0 OID 81509)
-- Dependencies: 391
-- Name: advisor_consultations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_consultations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6587 (class 3256 OID 81654)
-- Name: advisor_consultations advisor_consultations_advisor_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisor_consultations_advisor_select ON public.advisor_consultations FOR SELECT USING ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid()))));


--
-- TOC entry 6588 (class 3256 OID 81655)
-- Name: advisor_consultations advisor_consultations_client_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisor_consultations_client_select ON public.advisor_consultations FOR SELECT USING ((client_id = auth.uid()));


--
-- TOC entry 6430 (class 0 OID 84062)
-- Dependencies: 398
-- Name: advisor_event_timeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_event_timeline ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6427 (class 0 OID 81613)
-- Dependencies: 395
-- Name: advisor_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_payouts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6591 (class 3256 OID 81658)
-- Name: advisor_payouts advisor_payouts_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisor_payouts_select_own ON public.advisor_payouts FOR SELECT USING ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid()))));


--
-- TOC entry 6428 (class 0 OID 81635)
-- Dependencies: 396
-- Name: advisor_processed_calcom_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_processed_calcom_events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6426 (class 0 OID 81585)
-- Dependencies: 394
-- Name: advisor_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_reviews ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6589 (class 3256 OID 81656)
-- Name: advisor_reviews advisor_reviews_client_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisor_reviews_client_insert ON public.advisor_reviews FOR INSERT WITH CHECK ((client_id = auth.uid()));


--
-- TOC entry 6590 (class 3256 OID 81657)
-- Name: advisor_reviews advisor_reviews_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisor_reviews_read ON public.advisor_reviews FOR SELECT USING (((client_id = auth.uid()) OR (advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid())))));


--
-- TOC entry 6431 (class 0 OID 85486)
-- Dependencies: 399
-- Name: advisor_specialty_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_specialty_translations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6422 (class 0 OID 81479)
-- Dependencies: 390
-- Name: advisors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6544 (class 3256 OID 81076)
-- Name: project_advisors advisors_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisors_project_access ON public.project_advisors USING (((advisor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_advisors.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))))));


--
-- TOC entry 6586 (class 3256 OID 81652)
-- Name: advisors advisors_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisors_select_own ON public.advisors FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 6559 (class 3256 OID 81653)
-- Name: advisors advisors_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisors_update_own ON public.advisors FOR UPDATE USING ((user_id = auth.uid()));


--
-- TOC entry 6593 (class 3256 OID 84103)
-- Name: advisors advisors_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisors_user_select ON public.advisors FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 6594 (class 3256 OID 84104)
-- Name: advisors advisors_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advisors_user_update ON public.advisors FOR UPDATE USING ((user_id = auth.uid()));


--
-- TOC entry 6512 (class 3256 OID 73435)
-- Name: project_ai_session_metrics ai_session_metrics_via_build; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_session_metrics_via_build ON public.project_ai_session_metrics USING ((EXISTS ( SELECT 1
   FROM (public.project_build_records pbr
     JOIN public.projects p ON (((p.id)::text = pbr.project_id)))
  WHERE ((pbr.build_id = (project_ai_session_metrics.build_id)::text) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6602 (class 3256 OID 87031)
-- Name: advisor_analytics_summary analytics_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY analytics_admin ON public.advisor_analytics_summary TO authenticated USING ((EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND ((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text)))));


--
-- TOC entry 6596 (class 3256 OID 87030)
-- Name: advisor_analytics_summary analytics_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY analytics_select ON public.advisor_analytics_summary FOR SELECT USING ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid()))));


--
-- TOC entry 6629 (class 3256 OID 91512)
-- Name: promotion_artifacts artifacts_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artifacts_admin_read ON public.promotion_artifacts FOR SELECT USING ((public.has_admin_perm('promotion:read'::text) OR public.has_admin_perm('promotion:*'::text)));


--
-- TOC entry 6348 (class 0 OID 17379)
-- Dependencies: 275
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6460 (class 3256 OID 18334)
-- Name: assets assets_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_insert_policy ON public.assets FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = assets.project_id) AND (projects.owner_id = auth.uid())))));


--
-- TOC entry 6461 (class 3256 OID 18335)
-- Name: assets assets_secure_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_secure_access ON public.assets USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = assets.project_id) AND (((auth.uid() IS NOT NULL) AND (projects.owner_id = auth.uid())) OR (((projects.owner_id)::text ~~ 'demo_%'::text) AND (projects.created_at > (now() - '7 days'::interval))))))));


--
-- TOC entry 6599 (class 3256 OID 86955)
-- Name: advisor_availability_settings avail_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avail_insert ON public.advisor_availability_settings FOR INSERT WITH CHECK ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid()))));


--
-- TOC entry 6598 (class 3256 OID 86954)
-- Name: advisor_availability_settings avail_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avail_select ON public.advisor_availability_settings FOR SELECT USING ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid()))));


--
-- TOC entry 6600 (class 3256 OID 86956)
-- Name: advisor_availability_settings avail_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avail_update ON public.advisor_availability_settings FOR UPDATE USING ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid())))) WITH CHECK ((advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid()))));


--
-- TOC entry 6349 (class 0 OID 17385)
-- Dependencies: 276
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6462 (class 3256 OID 18336)
-- Name: branches branches_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_insert_policy ON public.branches FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = branches.project_id) AND (projects.owner_id = auth.uid())))));


--
-- TOC entry 6463 (class 3256 OID 18337)
-- Name: branches branches_secure_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_secure_access ON public.branches USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = branches.project_id) AND (((auth.uid() IS NOT NULL) AND (projects.owner_id = auth.uid())) OR (((projects.owner_id)::text ~~ 'demo_%'::text) AND (projects.created_at > (now() - '7 days'::interval))))))));


--
-- TOC entry 6405 (class 0 OID 53328)
-- Dependencies: 360
-- Name: build_events_daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.build_events_daily_stats ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6550 (class 3256 OID 73656)
-- Name: build_events_daily_stats build_events_daily_stats_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY build_events_daily_stats_admin_only ON public.build_events_daily_stats USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6514 (class 3256 OID 73437)
-- Name: project_build_metrics build_metrics_user_and_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY build_metrics_user_and_project_access ON public.project_build_metrics USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_build_metrics.project_id)::text) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6502 (class 3256 OID 73294)
-- Name: project_build_records build_records_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY build_records_access ON public.project_build_records USING (((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = project_build_records.project_id) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6496 (class 3256 OID 73288)
-- Name: project_chat_log_minimal chat_log_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_log_user_access ON public.project_chat_log_minimal USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6515 (class 3256 OID 73438)
-- Name: project_chat_plan_sessions chat_plan_sessions_user_and_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_plan_sessions_user_and_project_access ON public.project_chat_plan_sessions USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_chat_plan_sessions.project_id)::text) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6497 (class 3256 OID 73289)
-- Name: unified_chat_sessions chat_sessions_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_sessions_user_access ON public.unified_chat_sessions USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6350 (class 0 OID 17395)
-- Dependencies: 277
-- Name: claude_user_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claude_user_usage ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6577 (class 3256 OID 73708)
-- Name: claude_user_usage claude_user_usage_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claude_user_usage_admin_delete ON public.claude_user_usage FOR DELETE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6575 (class 3256 OID 73706)
-- Name: claude_user_usage claude_user_usage_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claude_user_usage_admin_insert ON public.claude_user_usage FOR INSERT WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6576 (class 3256 OID 73707)
-- Name: claude_user_usage claude_user_usage_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claude_user_usage_admin_update ON public.claude_user_usage FOR UPDATE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6351 (class 0 OID 17407)
-- Dependencies: 279
-- Name: commits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6464 (class 3256 OID 18338)
-- Name: commits commits_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commits_insert_policy ON public.commits FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = commits.project_id) AND (projects.owner_id = auth.uid())))));


--
-- TOC entry 6465 (class 3256 OID 18339)
-- Name: commits commits_secure_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commits_secure_access ON public.commits USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = commits.project_id) AND (((auth.uid() IS NOT NULL) AND (projects.owner_id = auth.uid())) OR (((projects.owner_id)::text ~~ 'demo_%'::text) AND (projects.created_at > (now() - '7 days'::interval))))))));


--
-- TOC entry 6381 (class 0 OID 19920)
-- Dependencies: 320
-- Name: component_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_map ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6492 (class 3256 OID 19944)
-- Name: component_map component_map_admin_write_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY component_map_admin_write_policy ON public.component_map USING ((auth.uid() IS NOT NULL));


--
-- TOC entry 6491 (class 3256 OID 19943)
-- Name: component_map component_map_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY component_map_read_policy ON public.component_map FOR SELECT USING ((is_active = true));


--
-- TOC entry 6352 (class 0 OID 17418)
-- Dependencies: 280
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6567 (class 3256 OID 73698)
-- Name: currencies currencies_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_admin_delete ON public.currencies FOR DELETE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6565 (class 3256 OID 73696)
-- Name: currencies currencies_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_admin_insert ON public.currencies FOR INSERT WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6566 (class 3256 OID 73697)
-- Name: currencies currencies_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_admin_update ON public.currencies FOR UPDATE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6564 (class 3256 OID 73695)
-- Name: currencies currencies_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_read_all ON public.currencies FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 6516 (class 3256 OID 73439)
-- Name: project_deployment_metrics deployment_metrics_via_build; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deployment_metrics_via_build ON public.project_deployment_metrics USING ((EXISTS ( SELECT 1
   FROM (public.project_build_records pbr
     JOIN public.projects p ON (((p.id)::text = pbr.project_id)))
  WHERE ((pbr.build_id = (project_deployment_metrics.build_id)::text) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6503 (class 3256 OID 73295)
-- Name: project_published_domains domains_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY domains_project_access ON public.project_published_domains USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_published_domains.project_id) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6579 (class 3256 OID 84099)
-- Name: advisor_application_drafts drafts_user_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drafts_user_full_access ON public.advisor_application_drafts USING ((user_id = auth.uid()));


--
-- TOC entry 6517 (class 3256 OID 73441)
-- Name: project_error_metrics error_metrics_via_build; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY error_metrics_via_build ON public.project_error_metrics USING ((EXISTS ( SELECT 1
   FROM (public.project_build_records pbr
     JOIN public.projects p ON (((p.id)::text = pbr.project_id)))
  WHERE ((pbr.build_id = (project_error_metrics.build_id)::text) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6353 (class 0 OID 17432)
-- Dependencies: 281
-- Name: export_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6548 (class 3256 OID 73652)
-- Name: export_logs export_logs_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY export_logs_admin_only ON public.export_logs USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6623 (class 3256 OID 90126)
-- Name: idempotency_keys idemp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY idemp_insert ON public.idempotency_keys FOR INSERT WITH CHECK (public.is_admin(auth.uid()));


--
-- TOC entry 6622 (class 3256 OID 90125)
-- Name: idempotency_keys idemp_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY idemp_read ON public.idempotency_keys FOR SELECT USING (public.is_admin(auth.uid()));


--
-- TOC entry 6440 (class 0 OID 90115)
-- Dependencies: 412
-- Name: idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6518 (class 3256 OID 73443)
-- Name: project_integrations integrations_project_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integrations_project_owner ON public.project_integrations USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_integrations.project_id) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6542 (class 3256 OID 81073)
-- Name: project_chat_last_read last_read_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY last_read_user_access ON public.project_chat_last_read USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6543 (class 3256 OID 81074)
-- Name: project_memberships memberships_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_project_access ON public.project_memberships USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_memberships.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))))))));


--
-- TOC entry 6519 (class 3256 OID 73444)
-- Name: project_metrics_summary metrics_summary_user_and_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metrics_summary_user_and_project_access ON public.project_metrics_summary USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_metrics_summary.project_id)::text) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6412 (class 0 OID 69653)
-- Dependencies: 372
-- Name: oauth_exchange_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_exchange_idempotency ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6561 (class 3256 OID 73692)
-- Name: oauth_exchange_idempotency oauth_exchange_idempotency_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oauth_exchange_idempotency_admin_only ON public.oauth_exchange_idempotency USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6411 (class 0 OID 69640)
-- Dependencies: 371
-- Name: oauth_state_nonces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_state_nonces ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6562 (class 3256 OID 73693)
-- Name: oauth_state_nonces oauth_state_nonces_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oauth_state_nonces_admin_only ON public.oauth_state_nonces USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6354 (class 0 OID 17452)
-- Dependencies: 282
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6355 (class 0 OID 17458)
-- Dependencies: 283
-- Name: organization_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_usage ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6356 (class 0 OID 17461)
-- Dependencies: 284
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6357 (class 0 OID 17481)
-- Dependencies: 285
-- Name: plan_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_change_log ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6560 (class 3256 OID 73691)
-- Name: plan_change_log plan_change_log_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_change_log_admin_only ON public.plan_change_log USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6358 (class 0 OID 17490)
-- Dependencies: 286
-- Name: plan_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6570 (class 3256 OID 73701)
-- Name: plan_limits plan_limits_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_limits_admin_delete ON public.plan_limits FOR DELETE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6568 (class 3256 OID 73699)
-- Name: plan_limits plan_limits_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_limits_admin_insert ON public.plan_limits FOR INSERT WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6569 (class 3256 OID 73700)
-- Name: plan_limits plan_limits_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_limits_admin_update ON public.plan_limits FOR UPDATE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6466 (class 3256 OID 18342)
-- Name: plan_limits plan_limits_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_limits_read_policy ON public.plan_limits FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 6421 (class 0 OID 81043)
-- Dependencies: 386
-- Name: project_advisors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_advisors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6391 (class 0 OID 33846)
-- Dependencies: 337
-- Name: project_ai_session_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_ai_session_metrics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6526 (class 3256 OID 73606)
-- Name: project_ai_session_metrics project_ai_session_metrics_build_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ai_session_metrics_build_access ON public.project_ai_session_metrics USING ((EXISTS ( SELECT 1
   FROM (public.project_build_records pbr
     JOIN public.projects p ON (((p.id)::text = pbr.project_id)))
  WHERE ((pbr.build_id = (project_ai_session_metrics.build_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]))))))))));


--
-- TOC entry 6387 (class 0 OID 27992)
-- Dependencies: 327
-- Name: project_build_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_build_events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6581 (class 3256 OID 73736)
-- Name: project_build_events project_build_events_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_build_events_admin_delete ON public.project_build_events FOR DELETE USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6390 (class 0 OID 33830)
-- Dependencies: 335
-- Name: project_build_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_build_metrics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6527 (class 3256 OID 73608)
-- Name: project_build_metrics project_build_metrics_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_build_metrics_access ON public.project_build_metrics USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_build_metrics.project_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))))))))));


--
-- TOC entry 6386 (class 0 OID 26811)
-- Dependencies: 325
-- Name: project_build_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_build_records ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6528 (class 3256 OID 73610)
-- Name: project_build_records project_build_records_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_build_records_access ON public.project_build_records USING (((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = project_build_records.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))))))))));


--
-- TOC entry 6419 (class 0 OID 81008)
-- Dependencies: 384
-- Name: project_chat_last_read; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chat_last_read ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6406 (class 0 OID 53365)
-- Dependencies: 362
-- Name: project_chat_log_minimal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chat_log_minimal ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6529 (class 3256 OID 73612)
-- Name: project_chat_log_minimal project_chat_log_minimal_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_chat_log_minimal_access ON public.project_chat_log_minimal USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_chat_log_minimal.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))))))));


--
-- TOC entry 6407 (class 0 OID 53644)
-- Dependencies: 364
-- Name: project_chat_plan_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chat_plan_sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6530 (class 3256 OID 73613)
-- Name: project_chat_plan_sessions project_chat_plan_sessions_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_chat_plan_sessions_access ON public.project_chat_plan_sessions USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_chat_plan_sessions.project_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE (((pc.project_id)::text = (p.id)::text) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))))))));


--
-- TOC entry 6418 (class 0 OID 80992)
-- Dependencies: 383
-- Name: project_chat_read_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chat_read_receipts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6359 (class 0 OID 17499)
-- Dependencies: 287
-- Name: project_collaborators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6511 (class 3256 OID 73434)
-- Name: project_collaborators project_collaborators_delete_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_collaborators_delete_access ON public.project_collaborators FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_collaborators.project_id) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6509 (class 3256 OID 73432)
-- Name: project_collaborators project_collaborators_insert_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_collaborators_insert_access ON public.project_collaborators FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_collaborators.project_id) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6508 (class 3256 OID 73431)
-- Name: project_collaborators project_collaborators_read_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_collaborators_read_access ON public.project_collaborators FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_collaborators.project_id) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6510 (class 3256 OID 73433)
-- Name: project_collaborators project_collaborators_update_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_collaborators_update_access ON public.project_collaborators FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_collaborators.project_id) AND (p.owner_id = auth.uid())))));


--
-- TOC entry 6392 (class 0 OID 33865)
-- Dependencies: 339
-- Name: project_deployment_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_deployment_metrics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6531 (class 3256 OID 73615)
-- Name: project_deployment_metrics project_deployment_metrics_build_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_deployment_metrics_build_access ON public.project_deployment_metrics USING ((EXISTS ( SELECT 1
   FROM (public.project_build_records pbr
     JOIN public.projects p ON (((p.id)::text = pbr.project_id)))
  WHERE ((pbr.build_id = (project_deployment_metrics.build_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]))))))))));


--
-- TOC entry 6393 (class 0 OID 33879)
-- Dependencies: 341
-- Name: project_error_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_error_metrics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6532 (class 3256 OID 73617)
-- Name: project_error_metrics project_error_metrics_build_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_error_metrics_build_access ON public.project_error_metrics USING ((EXISTS ( SELECT 1
   FROM (public.project_build_records pbr
     JOIN public.projects p ON (((p.id)::text = pbr.project_id)))
  WHERE ((pbr.build_id = (project_error_metrics.build_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]))))))))));


--
-- TOC entry 6414 (class 0 OID 69771)
-- Dependencies: 374
-- Name: project_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6533 (class 3256 OID 73619)
-- Name: project_integrations project_integrations_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_integrations_project_access ON public.project_integrations USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_integrations.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))))))));


--
-- TOC entry 6420 (class 0 OID 81024)
-- Dependencies: 385
-- Name: project_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_memberships ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6394 (class 0 OID 33889)
-- Dependencies: 342
-- Name: project_metrics_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_metrics_summary ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6534 (class 3256 OID 73620)
-- Name: project_metrics_summary project_metrics_summary_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_metrics_summary_access ON public.project_metrics_summary USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_metrics_summary.project_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))))))))));


--
-- TOC entry 6400 (class 0 OID 45146)
-- Dependencies: 355
-- Name: project_published_domains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_published_domains ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6535 (class 3256 OID 73622)
-- Name: project_published_domains project_published_domains_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_published_domains_project_access ON public.project_published_domains USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_published_domains.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]))))))))));


--
-- TOC entry 6389 (class 0 OID 31442)
-- Dependencies: 332
-- Name: project_recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_recommendations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6536 (class 3256 OID 73623)
-- Name: project_recommendations project_recommendations_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_recommendations_access ON public.project_recommendations USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_recommendations.project_id)::text) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE (((pc.project_id)::text = (p.id)::text) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))))))))));


--
-- TOC entry 6382 (class 0 OID 25563)
-- Dependencies: 321
-- Name: project_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6403 (class 0 OID 47628)
-- Dependencies: 358
-- Name: project_versions_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_versions_backup ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6578 (class 3256 OID 73734)
-- Name: project_versions_backup project_versions_backup_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_versions_backup_admin_only ON public.project_versions_backup USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6507 (class 3256 OID 73300)
-- Name: project_versions project_versions_delete_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_versions_delete_access ON public.project_versions FOR DELETE USING (((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = project_versions.project_id) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6504 (class 3256 OID 73296)
-- Name: project_versions project_versions_enhanced_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_versions_enhanced_access ON public.project_versions FOR SELECT USING (((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = project_versions.project_id) AND (p.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.project_collaborators pc
  WHERE (((pc.project_id)::text = project_versions.project_id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))))));


--
-- TOC entry 6404 (class 0 OID 47633)
-- Dependencies: 359
-- Name: project_versions_metadata_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_versions_metadata_backup ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6580 (class 3256 OID 73735)
-- Name: project_versions_metadata_backup project_versions_metadata_backup_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_versions_metadata_backup_admin_only ON public.project_versions_metadata_backup USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6505 (class 3256 OID 73298)
-- Name: project_versions project_versions_modify_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_versions_modify_access ON public.project_versions FOR INSERT WITH CHECK ((user_id = (auth.uid())::text));


--
-- TOC entry 6506 (class 3256 OID 73299)
-- Name: project_versions project_versions_update_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_versions_update_access ON public.project_versions FOR UPDATE USING (((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = project_versions.project_id) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6360 (class 0 OID 17510)
-- Dependencies: 288
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6467 (class 3256 OID 18343)
-- Name: projects projects_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_policy ON public.projects FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (owner_id = auth.uid())));


--
-- TOC entry 6468 (class 3256 OID 18344)
-- Name: projects projects_secure_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_secure_access ON public.projects USING ((((auth.uid() IS NOT NULL) AND (owner_id = auth.uid())) OR (((owner_id)::text ~~ 'demo_%'::text) AND (created_at > (now() - '7 days'::interval)))));


--
-- TOC entry 6444 (class 0 OID 91392)
-- Dependencies: 417
-- Name: promotion_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_artifacts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6443 (class 0 OID 91371)
-- Dependencies: 416
-- Name: promotion_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_codes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6446 (class 0 OID 91457)
-- Dependencies: 419
-- Name: promotion_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6445 (class 0 OID 91423)
-- Dependencies: 418
-- Name: promotion_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_reservations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6442 (class 0 OID 91349)
-- Dependencies: 415
-- Name: promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6402 (class 0 OID 45290)
-- Dependencies: 357
-- Name: publication_idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publication_idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6563 (class 3256 OID 73694)
-- Name: publication_idempotency_keys publication_idempotency_keys_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publication_idempotency_keys_admin_only ON public.publication_idempotency_keys USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6361 (class 0 OID 17519)
-- Dependencies: 289
-- Name: quota_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quota_audit_log ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6539 (class 3256 OID 73646)
-- Name: quota_audit_log quota_audit_log_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quota_audit_log_admin_only ON public.quota_audit_log USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6362 (class 0 OID 17527)
-- Dependencies: 290
-- Name: quota_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quota_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6540 (class 3256 OID 73647)
-- Name: quota_audit_logs quota_audit_logs_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quota_audit_logs_admin_only ON public.quota_audit_logs USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6364 (class 0 OID 17565)
-- Dependencies: 296
-- Name: quota_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quota_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6541 (class 3256 OID 73648)
-- Name: quota_rate_limits quota_rate_limits_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quota_rate_limits_admin_only ON public.quota_rate_limits USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6399 (class 0 OID 37829)
-- Dependencies: 349
-- Name: r2_cleanup_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.r2_cleanup_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6549 (class 3256 OID 73653)
-- Name: r2_cleanup_logs r2_cleanup_logs_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY r2_cleanup_logs_admin_only ON public.r2_cleanup_logs USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6585 (class 3256 OID 81072)
-- Name: project_chat_read_receipts read_receipts_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_receipts_user_access ON public.project_chat_read_receipts USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6501 (class 3256 OID 73293)
-- Name: project_recommendations recommendations_project_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recommendations_project_access ON public.project_recommendations USING ((((user_id)::text = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (((p.id)::text = (project_recommendations.project_id)::text) AND (p.owner_id = auth.uid()))))));


--
-- TOC entry 6365 (class 0 OID 17580)
-- Dependencies: 298
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6415 (class 0 OID 73212)
-- Dependencies: 376
-- Name: security_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6546 (class 3256 OID 73650)
-- Name: security_audit_log security_audit_log_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY security_audit_log_admin_only ON public.security_audit_log USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6597 (class 3256 OID 85509)
-- Name: advisor_specialty_translations specialty_translations_admin_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY specialty_translations_admin_policy ON public.advisor_specialty_translations TO authenticated USING ((EXISTS ( SELECT 1
   FROM auth.users u
  WHERE ((u.id = auth.uid()) AND (((u.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((u.raw_user_meta_data ->> 'role'::text) = 'super_admin'::text))))));


--
-- TOC entry 6595 (class 3256 OID 85508)
-- Name: advisor_specialty_translations specialty_translations_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY specialty_translations_read_policy ON public.advisor_specialty_translations FOR SELECT TO authenticated USING (true);


--
-- TOC entry 6366 (class 0 OID 17588)
-- Dependencies: 299
-- Name: storage_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_audit_log ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6547 (class 3256 OID 73651)
-- Name: storage_audit_log storage_audit_log_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_audit_log_admin_only ON public.storage_audit_log USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6410 (class 0 OID 69624)
-- Dependencies: 370
-- Name: supabase_account_discovery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supabase_account_discovery ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6557 (class 3256 OID 73663)
-- Name: supabase_account_discovery supabase_account_discovery_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supabase_account_discovery_admin_only ON public.supabase_account_discovery USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6413 (class 0 OID 69665)
-- Dependencies: 373
-- Name: supabase_breakglass_recovery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supabase_breakglass_recovery ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6558 (class 3256 OID 73664)
-- Name: supabase_breakglass_recovery supabase_breakglass_recovery_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supabase_breakglass_recovery_admin_only ON public.supabase_breakglass_recovery USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6409 (class 0 OID 69610)
-- Dependencies: 369
-- Name: supabase_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supabase_connections ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6556 (class 3256 OID 73662)
-- Name: supabase_connections supabase_connections_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supabase_connections_admin_only ON public.supabase_connections USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6614 (class 3256 OID 89963)
-- Name: support_ticket_messages support_messages_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_admin_delete ON public.support_ticket_messages FOR DELETE USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text)));


--
-- TOC entry 6612 (class 3256 OID 89961)
-- Name: support_ticket_messages support_messages_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_admin_insert ON public.support_ticket_messages FOR INSERT WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text)));


--
-- TOC entry 6611 (class 3256 OID 89960)
-- Name: support_ticket_messages support_messages_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_admin_read ON public.support_ticket_messages FOR SELECT USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.read'::text)));


--
-- TOC entry 6613 (class 3256 OID 89962)
-- Name: support_ticket_messages support_messages_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_admin_update ON public.support_ticket_messages FOR UPDATE USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text))) WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text)));


--
-- TOC entry 6610 (class 3256 OID 89959)
-- Name: support_ticket_messages support_messages_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_user_insert ON public.support_ticket_messages FOR INSERT WITH CHECK (((is_internal = false) AND (sender_id = auth.uid()) AND (ticket_id IN ( SELECT support_tickets.id
   FROM public.support_tickets
  WHERE (support_tickets.user_id = auth.uid())))));


--
-- TOC entry 6609 (class 3256 OID 89958)
-- Name: support_ticket_messages support_messages_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_messages_user_read ON public.support_ticket_messages FOR SELECT USING (((is_internal = false) AND (ticket_id IN ( SELECT support_tickets.id
   FROM public.support_tickets
  WHERE (support_tickets.user_id = auth.uid())))));


--
-- TOC entry 6435 (class 0 OID 89870)
-- Dependencies: 405
-- Name: support_ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6434 (class 0 OID 89853)
-- Dependencies: 404
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6608 (class 3256 OID 89957)
-- Name: support_tickets support_tickets_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_admin_delete ON public.support_tickets FOR DELETE USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text)));


--
-- TOC entry 6606 (class 3256 OID 89955)
-- Name: support_tickets support_tickets_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_admin_insert ON public.support_tickets FOR INSERT WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text)));


--
-- TOC entry 6605 (class 3256 OID 89954)
-- Name: support_tickets support_tickets_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_admin_read ON public.support_tickets FOR SELECT USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.read'::text)));


--
-- TOC entry 6607 (class 3256 OID 89956)
-- Name: support_tickets support_tickets_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_admin_update ON public.support_tickets FOR UPDATE USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text))) WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('support.write'::text)));


--
-- TOC entry 6604 (class 3256 OID 89953)
-- Name: support_tickets support_tickets_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_user_insert ON public.support_tickets FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6603 (class 3256 OID 89952)
-- Name: support_tickets support_tickets_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_tickets_user_read ON public.support_tickets FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 6498 (class 3256 OID 73290)
-- Name: user_ai_time_balance time_balance_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY time_balance_user_access ON public.user_ai_time_balance USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6499 (class 3256 OID 73291)
-- Name: user_ai_time_consumption time_consumption_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY time_consumption_user_access ON public.user_ai_time_consumption USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6500 (class 3256 OID 73292)
-- Name: user_ai_time_purchases time_purchases_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY time_purchases_user_access ON public.user_ai_time_purchases USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6592 (class 3256 OID 84100)
-- Name: advisor_event_timeline timeline_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_user_read ON public.advisor_event_timeline FOR SELECT USING (((user_id = auth.uid()) OR (advisor_id IN ( SELECT advisors.id
   FROM public.advisors
  WHERE (advisors.user_id = auth.uid())))));


--
-- TOC entry 6625 (class 3256 OID 90143)
-- Name: admin_two_person_queue tpq_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpq_insert ON public.admin_two_person_queue FOR INSERT WITH CHECK (public.is_admin(auth.uid()));


--
-- TOC entry 6624 (class 3256 OID 90142)
-- Name: admin_two_person_queue tpq_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpq_read ON public.admin_two_person_queue FOR SELECT USING (public.is_admin(auth.uid()));


--
-- TOC entry 6626 (class 3256 OID 90144)
-- Name: admin_two_person_queue tpq_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpq_update ON public.admin_two_person_queue FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- TOC entry 6408 (class 0 OID 65058)
-- Dependencies: 368
-- Name: unified_chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_chat_sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6538 (class 3256 OID 73625)
-- Name: unified_chat_sessions unified_chat_sessions_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY unified_chat_sessions_access ON public.unified_chat_sessions USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = unified_chat_sessions.project_id) AND ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_collaborators pc
          WHERE ((pc.project_id = p.id) AND (pc.user_id = auth.uid()) AND (pc.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))))))));


--
-- TOC entry 6367 (class 0 OID 17626)
-- Dependencies: 300
-- Name: usage_bonuses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_bonuses ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6583 (class 3256 OID 73738)
-- Name: usage_bonuses usage_bonuses_user_and_admin_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_bonuses_user_and_admin_access ON public.usage_bonuses USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (user_id = auth.uid())));


--
-- TOC entry 6363 (class 0 OID 17535)
-- Dependencies: 291
-- Name: usage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6513 (class 3256 OID 73654)
-- Name: usage_events usage_events_user_and_admin_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_events_user_and_admin_access ON public.usage_events USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (user_id = auth.uid())));


--
-- TOC entry 6537 (class 3256 OID 73655)
-- Name: usage_events usage_events_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_events_user_insert ON public.usage_events FOR INSERT WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (user_id = auth.uid())));


--
-- TOC entry 6368 (class 0 OID 17634)
-- Dependencies: 301
-- Name: usage_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6582 (class 3256 OID 73737)
-- Name: usage_tracking usage_tracking_user_and_admin_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_tracking_user_and_admin_access ON public.usage_tracking USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (user_id = auth.uid())));


--
-- TOC entry 6469 (class 3256 OID 18346)
-- Name: usage_tracking usage_tracking_user_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_tracking_user_policy ON public.usage_tracking USING ((auth.uid() = user_id));


--
-- TOC entry 6437 (class 0 OID 89896)
-- Dependencies: 407
-- Name: user_admin_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_admin_status ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6617 (class 3256 OID 89966)
-- Name: user_admin_status user_admin_status_admin_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_admin_status_admin_access ON public.user_admin_status USING ((((auth.jwt() ->> 'role'::text) = 'admin'::text) OR (COALESCE(((auth.jwt() ->> 'is_admin'::text))::boolean, false) = true) OR public.has_admin_perm('users.read'::text)));


--
-- TOC entry 6616 (class 3256 OID 89965)
-- Name: user_admin_status user_admin_status_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_admin_status_user_read ON public.user_admin_status FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 6520 (class 3256 OID 73445)
-- Name: user_ai_consumption_metadata user_ai_consumption_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ai_consumption_admin_only ON public.user_ai_consumption_metadata USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6398 (class 0 OID 37766)
-- Dependencies: 347
-- Name: user_ai_consumption_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ai_consumption_metadata ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6525 (class 3256 OID 73584)
-- Name: user_ai_consumption_metadata user_ai_consumption_metadata_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ai_consumption_metadata_admin_only ON public.user_ai_consumption_metadata USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6395 (class 0 OID 37678)
-- Dependencies: 344
-- Name: user_ai_time_balance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ai_time_balance ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6521 (class 3256 OID 73580)
-- Name: user_ai_time_balance user_ai_time_balance_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ai_time_balance_user_access ON public.user_ai_time_balance USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6396 (class 0 OID 37714)
-- Dependencies: 345
-- Name: user_ai_time_consumption; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ai_time_consumption ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6522 (class 3256 OID 73581)
-- Name: user_ai_time_consumption user_ai_time_consumption_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ai_time_consumption_user_access ON public.user_ai_time_consumption USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6397 (class 0 OID 37745)
-- Dependencies: 346
-- Name: user_ai_time_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ai_time_purchases ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6523 (class 3256 OID 73582)
-- Name: user_ai_time_purchases user_ai_time_purchases_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ai_time_purchases_user_access ON public.user_ai_time_purchases USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6369 (class 0 OID 17645)
-- Dependencies: 302
-- Name: user_bonuses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_bonuses ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6524 (class 3256 OID 73583)
-- Name: user_bonuses user_bonuses_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_bonuses_user_access ON public.user_bonuses USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 6601 (class 3256 OID 91514)
-- Name: promotion_redemptions user_own_redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_own_redemptions ON public.promotion_redemptions FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 6630 (class 3256 OID 91513)
-- Name: promotion_reservations user_own_reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_own_reservations ON public.promotion_reservations USING ((auth.uid() = user_id));


--
-- TOC entry 6401 (class 0 OID 45170)
-- Dependencies: 356
-- Name: versioning_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.versioning_metrics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6551 (class 3256 OID 73657)
-- Name: versioning_metrics versioning_metrics_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY versioning_metrics_admin_only ON public.versioning_metrics USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6370 (class 0 OID 17654)
-- Dependencies: 303
-- Name: webhook_dead_letter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_dead_letter ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6584 (class 3256 OID 73739)
-- Name: webhook_dead_letter webhook_dead_letter_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_dead_letter_admin_only ON public.webhook_dead_letter USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6385 (class 0 OID 26790)
-- Dependencies: 324
-- Name: worker_task_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6554 (class 3256 OID 73660)
-- Name: worker_task_dependencies worker_task_dependencies_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_task_dependencies_admin_only ON public.worker_task_dependencies USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6383 (class 0 OID 26759)
-- Dependencies: 322
-- Name: worker_task_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_task_plans ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6553 (class 3256 OID 73659)
-- Name: worker_task_plans worker_task_plans_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_task_plans_admin_only ON public.worker_task_plans USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6384 (class 0 OID 26771)
-- Dependencies: 323
-- Name: worker_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_tasks ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6552 (class 3256 OID 73658)
-- Name: worker_tasks worker_tasks_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_tasks_admin_only ON public.worker_tasks USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6388 (class 0 OID 28017)
-- Dependencies: 331
-- Name: worker_webhook_failures-depreciated; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."worker_webhook_failures-depreciated" ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6555 (class 3256 OID 73661)
-- Name: worker_webhook_failures-depreciated worker_webhook_failures_deprecated_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_webhook_failures_deprecated_admin_only ON public."worker_webhook_failures-depreciated" USING (((auth.jwt() ->> 'role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- TOC entry 6371 (class 0 OID 17664)
-- Dependencies: 304
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6470 (class 3256 OID 18347)
-- Name: objects Authenticated read assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated read assets" ON storage.objects FOR SELECT USING (((bucket_id = 'assets'::text) AND (auth.role() = 'authenticated'::text)));


--
-- TOC entry 6471 (class 3256 OID 18348)
-- Name: objects Deny delete assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Deny delete assets" ON storage.objects FOR DELETE USING (((bucket_id = 'assets'::text) AND false));


--
-- TOC entry 6472 (class 3256 OID 18349)
-- Name: objects Deny delete builds; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Deny delete builds" ON storage.objects FOR DELETE USING (((bucket_id = 'builds'::text) AND false));


--
-- TOC entry 6473 (class 3256 OID 18350)
-- Name: objects Deny update assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Deny update assets" ON storage.objects FOR UPDATE USING (((bucket_id = 'assets'::text) AND false));


--
-- TOC entry 6474 (class 3256 OID 18351)
-- Name: objects Deny update builds; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Deny update builds" ON storage.objects FOR UPDATE USING (((bucket_id = 'builds'::text) AND false));


--
-- TOC entry 6475 (class 3256 OID 18352)
-- Name: objects Project members upload assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Project members upload assets" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'assets'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM public.projects
  WHERE (((projects.id)::text = split_part(projects.name, '/'::text, 1)) AND ((projects.owner_id = auth.uid()) OR (auth.uid() = ANY (((projects.config ->> 'collaborator_ids'::text))::uuid[]))))))));


--
-- TOC entry 6476 (class 3256 OID 18353)
-- Name: objects Public read objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public read objects" ON storage.objects FOR SELECT USING ((bucket_id = 'objects'::text));


--
-- TOC entry 6477 (class 3256 OID 18354)
-- Name: objects Service role builds; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Service role builds" ON storage.objects USING (((bucket_id = 'builds'::text) AND (auth.role() = 'service_role'::text)));


--
-- TOC entry 6372 (class 0 OID 17683)
-- Dependencies: 308
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6417 (class 0 OID 80880)
-- Dependencies: 381
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6373 (class 0 OID 17692)
-- Dependencies: 309
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6374 (class 0 OID 17696)
-- Dependencies: 310
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6416 (class 0 OID 80836)
-- Dependencies: 380
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6375 (class 0 OID 17706)
-- Dependencies: 311
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6376 (class 0 OID 17713)
-- Dependencies: 312
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 6631 (class 6104 OID 18355)
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- TOC entry 6632 (class 6104 OID 38169)
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- TOC entry 6633 (class 6106 OID 38028)
-- Name: supabase_realtime project_build_events; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.project_build_events;


--
-- TOC entry 6634 (class 6106 OID 38170)
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- TOC entry 4318 (class 3466 OID 18403)
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- TOC entry 4323 (class 3466 OID 18441)
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- TOC entry 4317 (class 3466 OID 18402)
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- TOC entry 4324 (class 3466 OID 18442)
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- TOC entry 4319 (class 3466 OID 18404)
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- TOC entry 4320 (class 3466 OID 18405)
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


-- Completed on 2025-09-03 01:23:41 EEST

--
-- PostgreSQL database dump complete
--

\unrestrict u6VrPAuMM3WcU8lzzTVaLdoWwZIqnP8wBI8TuaInAeSiu8WedIrGKP1SzBbAur3

