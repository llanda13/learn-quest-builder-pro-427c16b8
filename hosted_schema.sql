

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "extensions";


ALTER SCHEMA "extensions" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'teacher',
    'validator'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."bloom_taxonomy" AS ENUM (
    'remember',
    'understand',
    'apply',
    'analyze',
    'evaluate',
    'create'
);


ALTER TYPE "public"."bloom_taxonomy" OWNER TO "postgres";


CREATE TYPE "public"."difficulty_level" AS ENUM (
    'easy',
    'medium',
    'hard'
);


ALTER TYPE "public"."difficulty_level" OWNER TO "postgres";


CREATE TYPE "public"."question_type" AS ENUM (
    'multiple_choice',
    'true_false',
    'essay',
    'fill_blank'
);


ALTER TYPE "public"."question_type" OWNER TO "postgres";


CREATE TYPE "public"."subject_type" AS ENUM (
    'major',
    'minor',
    'ge',
    'pe',
    'nstp'
);


ALTER TYPE "public"."subject_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'teacher'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "extensions"."grant_pg_cron_access"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$$;


ALTER FUNCTION "extensions"."grant_pg_cron_access"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."grant_pg_cron_access"() IS 'Grants access to pg_cron';



CREATE OR REPLACE FUNCTION "extensions"."grant_pg_graphql_access"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
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

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


ALTER FUNCTION "extensions"."grant_pg_graphql_access"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."grant_pg_graphql_access"() IS 'Grants access to pg_graphql';



CREATE OR REPLACE FUNCTION "extensions"."grant_pg_net_access"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
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


ALTER FUNCTION "extensions"."grant_pg_net_access"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."grant_pg_net_access"() IS 'Grants access to pg_net';



CREATE OR REPLACE FUNCTION "extensions"."pgrst_ddl_watch"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "extensions"."pgrst_ddl_watch"() OWNER TO "supabase_admin";


CREATE OR REPLACE FUNCTION "extensions"."pgrst_drop_watch"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "extensions"."pgrst_drop_watch"() OWNER TO "supabase_admin";


CREATE OR REPLACE FUNCTION "extensions"."set_graphql_placeholder"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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
            set search_path to ''
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


ALTER FUNCTION "extensions"."set_graphql_placeholder"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."set_graphql_placeholder"() IS 'Reintroduces placeholder function for graphql_public.graphql';



CREATE OR REPLACE FUNCTION "public"."apply_test_validation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.decision = 'approved' THEN
    UPDATE public.generated_tests
      SET validation_status = 'validated',
          validated_at = NEW.created_at,
          validated_by = NEW.validator_id
      WHERE id = NEW.generated_test_id;
  ELSIF NEW.decision = 'revision_requested' THEN
    UPDATE public.generated_tests
      SET validation_status = 'revision_requested',
          validated_at = NULL,
          validated_by = NULL
      WHERE id = NEW.generated_test_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."apply_test_validation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_admin_role"("user_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id FROM profiles WHERE email = user_email;
  IF target_user_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (target_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;


ALTER FUNCTION "public"."assign_admin_role"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_default_teacher_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Assign default teacher role if no role exists
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'teacher'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_default_teacher_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_user_role"("target_user_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;
  
  -- Validate role value
  IF new_role NOT IN ('admin', 'teacher', 'none') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Prevent removing own admin role
  IF target_user_id = auth.uid() THEN
    IF new_role != 'admin' THEN
      RAISE EXCEPTION 'Cannot remove your own admin role';
    END IF;
  END IF;
  
  -- Delete existing roles
  DELETE FROM user_roles WHERE user_id = target_user_id;
  
  -- Insert new role (skip if 'none')
  IF new_role != 'none' THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (target_user_id, new_role::app_role);
  END IF;
  
  -- Log the change
  INSERT INTO activity_log (user_id, entity_type, entity_id, action, meta)
  VALUES (
    auth.uid(),
    'user_role',
    target_user_id,
    'role_assigned',
    jsonb_build_object('new_role', new_role)
  );
END;
$$;


ALTER FUNCTION "public"."assign_user_role"("target_user_id" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_rubric_total_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  criterion RECORD;
  total numeric := 0;
BEGIN
  -- Calculate total based on criteria weights and scores
  FOR criterion IN 
    SELECT rc.id, rc.weight, rc.max_score
    FROM public.rubric_criteria rc
    JOIN public.rubrics r ON r.id = rc.rubric_id
    JOIN public.questions q ON q.id = NEW.question_id
  LOOP
    total := total + COALESCE((NEW.scores->>(criterion.id::text))::numeric, 0) * criterion.weight;
  END LOOP;
  
  NEW.total_score := total;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_rubric_total_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_similarity_metrics"() RETURNS TABLE("avg_similarity" numeric, "max_similarity" numeric, "total_pairs" bigint, "high_similarity_pairs" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    AVG(similarity_score) as avg_similarity,
    MAX(similarity_score) as max_similarity,
    COUNT(*) as total_pairs,
    COUNT(*) FILTER (WHERE similarity_score >= 0.8) as high_similarity_pairs
  FROM question_similarities;
END;
$$;


ALTER FUNCTION "public"."calculate_similarity_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_tos"("tos_owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    (tos_owner = auth.uid()) OR public.is_admin(auth.uid());
$$;


ALTER FUNCTION "public"."can_access_tos"("tos_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_question_similarity"("p_question_text" "text", "p_topic" "text", "p_bloom_level" "text", "p_threshold" numeric DEFAULT 0.85) RETURNS TABLE("similar_question_id" "uuid", "similarity_score" numeric, "question_text" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- This is a placeholder for actual semantic similarity logic
  -- In production, this would use vector embeddings
  RETURN QUERY
  SELECT 
    q.id,
    0.9::NUMERIC as similarity,
    q.question_text
  FROM questions q
  WHERE q.topic = p_topic
    AND q.bloom_level = p_bloom_level
    AND q.approved = true
    AND q.question_text ILIKE '%' || p_question_text || '%'
  LIMIT 5;
END;
$$;


ALTER FUNCTION "public"."check_question_similarity"("p_question_text" "text", "p_topic" "text", "p_bloom_level" "text", "p_threshold" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_presence"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run presence cleanup';
  END IF;
  DELETE FROM public.document_presence
  WHERE last_seen < now() - interval '1 hour' OR is_active = false;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_test_draft_edit_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Content is immutable once the questionnaire has been submitted for expert
  -- validation (or already approved). Only Draft / Revision Requested is editable.
  IF OLD.validation_status IN ('pending_validation', 'validated')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.items IS DISTINCT FROM OLD.items
       OR NEW.answer_key IS DISTINCT FROM OLD.answer_key THEN
      RAISE EXCEPTION 'This questionnaire is locked: it is under or has completed expert validation.';
    END IF;
  END IF;

  -- Track submission moment on transition into pending validation.
  IF NEW.validation_status = 'pending_validation'
     AND OLD.validation_status IS DISTINCT FROM 'pending_validation' THEN
    NEW.submitted_at := now();
  END IF;

  -- Returning to an editable state clears the submission stamp.
  IF NEW.validation_status = 'draft' AND OLD.validation_status <> 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_test_draft_edit_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_test_versions"("p_parent_test_id" "uuid") RETURNS TABLE("version_id" "uuid", "version_number" integer, "assignment_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gt.id as version_id,
    gt.version_number,
    COUNT(ta.id) as assignment_count
  FROM generated_tests gt
  LEFT JOIN test_assignments ta ON ta.test_version_id = gt.id
  WHERE gt.parent_test_id = p_parent_test_id 
     OR (gt.id = p_parent_test_id AND gt.parent_test_id IS NULL)
  GROUP BY gt.id, gt.version_number
  ORDER BY gt.version_number;
END;
$$;


ALTER FUNCTION "public"."get_available_test_versions"("p_parent_test_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'validator' THEN 2
    WHEN 'teacher' THEN 3
    WHEN 'student' THEN 4
  END
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_question_stats"("user_uuid" "uuid") RETURNS TABLE("bloom_level" "text", "difficulty" "text", "knowledge_dimension" "text", "count" bigint, "approved_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only allow users to query their own stats or admins to query all
  IF user_uuid != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: can only view own statistics';
  END IF;

  RETURN QUERY
  SELECT 
    q.bloom_level,
    q.difficulty,
    q.knowledge_dimension,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE q.approved = true) as approved_count
  FROM public.questions q
  WHERE q.owner = user_uuid
  GROUP BY q.bloom_level, q.difficulty, q.knowledge_dimension
  ORDER BY count DESC;
END;
$$;


ALTER FUNCTION "public"."get_user_question_stats"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  SELECT role::text FROM user_roles WHERE user_roles.user_id = $1
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'teacher' THEN 2
  END
  LIMIT 1;
$_$;


ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_validation_statistics"() RETURNS TABLE("total_validations" bigint, "accepted_count" bigint, "modified_count" bigint, "rejected_count" bigint, "avg_confidence" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_validations,
    COUNT(*) FILTER (WHERE validation_confidence >= 0.9) as accepted_count,
    COUNT(*) FILTER (WHERE validation_confidence >= 0.5 AND validation_confidence < 0.9) as modified_count,
    COUNT(*) FILTER (WHERE validation_confidence < 0.5) as rejected_count,
    AVG(validation_confidence) as avg_confidence
  FROM classification_validations;
END;
$$;


ALTER FUNCTION "public"."get_validation_statistics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, college, course)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
          NULLIF(NEW.raw_user_meta_data->>'college',''), NULLIF(NEW.raw_user_meta_data->>'course',''))
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    college = COALESCE(EXCLUDED.college, public.profiles.college),
    course = COALESCE(EXCLUDED.course, public.profiles.course),
    updated_at = now();
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_usage_count"("question_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE questions 
  SET used_count = COALESCE(used_count, 0) + 1,
      used_history = COALESCE(used_history, '[]'::jsonb) || jsonb_build_object('used_at', now())
  WHERE id = question_id;
END;
$$;


ALTER FUNCTION "public"."increment_usage_count"("question_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_document_collaborator"("p_document_id" "text", "p_document_type" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.document_collaborators
    WHERE document_id = p_document_id
      AND document_type = p_document_type
      AND user_email = (SELECT email FROM auth.users WHERE id::text = auth.uid()::text)
  )
$$;


ALTER FUNCTION "public"."is_document_collaborator"("p_document_id" "text", "p_document_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_teacher_or_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = $1 AND role IN ('admin', 'teacher')
  );
END;
$_$;


ALTER FUNCTION "public"."is_teacher_or_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tos_collaborator"("p_tos_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tos_collaborators
    WHERE tos_id = p_tos_id
      AND user_id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."is_tos_collaborator"("p_tos_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tos_owner"("p_tos_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tos_entries
    WHERE id = p_tos_id
      AND owner = auth.uid()
  )
$$;


ALTER FUNCTION "public"."is_tos_owner"("p_tos_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_classification_metric"("p_question_id" "uuid", "p_confidence" numeric, "p_cognitive_level" "text", "p_response_time_ms" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
INSERT INTO system_metrics (
metric_name,
metric_value,
metric_unit,
metric_category,
dimensions,
measured_at
) VALUES (
'classification_confidence',
p_confidence,
'score',
'quality',
jsonb_build_object(
'question_id', p_question_id,
'cognitive_level', p_cognitive_level,
'response_time_ms', p_response_time_ms
),
now()
);
END;
$$;


ALTER FUNCTION "public"."log_classification_metric"("p_question_id" "uuid", "p_confidence" numeric, "p_cognitive_level" "text", "p_response_time_ms" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_question_used"("p_question_id" "uuid", "p_test_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE questions
  SET 
    used_count = COALESCE(used_count, 0) + 1,
    used_history = COALESCE(used_history, '[]'::jsonb) || 
      jsonb_build_object(
        'test_id', p_test_id,
        'used_at', NOW()
      )
  WHERE id = p_question_id;
END;
$$;


ALTER FUNCTION "public"."mark_question_used"("p_question_id" "uuid", "p_test_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_question_similarities"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Mark that recalculation is needed
  NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) || 
    jsonb_build_object('needs_similarity_recalc', true, 'recalc_queued_at', NOW());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."recalculate_question_similarities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_topic_for_subject"("p_subject_id" "uuid", "p_candidate" "text", "p_min_similarity" real DEFAULT 0.5) RETURNS TABLE("topic_id" "uuid", "topic_name" "text", "similarity" real, "matched" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_norm TEXT := lower(btrim(coalesce(p_candidate, '')));
BEGIN
  IF v_norm = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0::REAL, FALSE;
    RETURN;
  END IF;

  -- 1) Exact normalized match
  RETURN QUERY
    SELECT t.id, t.name, 1.0::REAL, TRUE
    FROM public.academic_topics t
    WHERE t.subject_id = p_subject_id
      AND t.approved = TRUE
      AND t.normalized_name = v_norm
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 2) Alias match
  RETURN QUERY
    SELECT t.id, t.name, 0.95::REAL, TRUE
    FROM public.academic_topics t
    WHERE t.subject_id = p_subject_id
      AND t.approved = TRUE
      AND v_norm = ANY (SELECT lower(btrim(a)) FROM unnest(t.aliases) AS a)
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 3) Trigram similarity fallback
  RETURN QUERY
    SELECT t.id, t.name, similarity(t.normalized_name, v_norm)::REAL AS sim,
           (similarity(t.normalized_name, v_norm) >= p_min_similarity)
    FROM public.academic_topics t
    WHERE t.subject_id = p_subject_id
      AND t.approved = TRUE
    ORDER BY similarity(t.normalized_name, v_norm) DESC
    LIMIT 1;
END; $$;


ALTER FUNCTION "public"."resolve_topic_for_subject"("p_subject_id" "uuid", "p_candidate" "text", "p_min_similarity" real) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_approval_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.approved IS DISTINCT FROM NEW.approved AND NEW.approved = true THEN
    NEW.approved_by := auth.uid()::text;
    NEW.approval_timestamp := NOW();
    NEW.needs_review := false;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_approval_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_approval_metadata"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Auto-set approval metadata when approved status changes
  IF OLD.approved IS DISTINCT FROM NEW.approved AND NEW.approved = true THEN
    NEW.approved_by := auth.uid()::text;
    NEW.approval_timestamp := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_approval_metadata"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Update email in profiles when user email changes
  UPDATE profiles 
  SET email = NEW.email 
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_profile_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_academic_topics_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."touch_academic_topics_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_similarity_recalculation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Mark question for recalculation by setting metadata flag
  NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) || 
    jsonb_build_object(
      'needs_similarity_update', true,
      'similarity_update_queued_at', NOW()
    );
  
  -- Send notification for background worker
  PERFORM pg_notify(
    'similarity_update',
    json_build_object(
      'question_id', NEW.id,
      'question_text', NEW.question_text,
      'action', TG_OP
    )::text
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_similarity_recalculation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_approval_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Set approval timestamp when approved status changes
  IF OLD.approved IS DISTINCT FROM NEW.approved THEN
    NEW.approval_timestamp = now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_approval_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_active"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.last_active = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_last_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_question_search_vector"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.question_text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.topic, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.choices::text, '')), 'C');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_question_search_vector"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_test_metadata_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_test_metadata_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_validation_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.validation_status IS DISTINCT FROM NEW.validation_status THEN
    NEW.validation_timestamp = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_validation_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_tos_exists"("p_tos_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tos_entries WHERE id = p_tos_id
  );
$$;


ALTER FUNCTION "public"."validate_tos_exists"("p_tos_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_version_balance"("p_parent_test_id" "uuid") RETURNS TABLE("is_balanced" boolean, "max_diff" integer, "warning_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_max_count INTEGER;
  v_min_count INTEGER;
  v_diff INTEGER;
BEGIN
  SELECT MAX(cnt), MIN(cnt) INTO v_max_count, v_min_count
  FROM (
    SELECT COUNT(*) as cnt
    FROM test_assignments ta
    JOIN generated_tests gt ON gt.id = ta.test_version_id
    WHERE gt.parent_test_id = p_parent_test_id 
       OR (gt.id = p_parent_test_id AND gt.parent_test_id IS NULL)
    GROUP BY gt.id
  ) counts;
  
  v_diff := COALESCE(v_max_count - v_min_count, 0);
  
  RETURN QUERY SELECT 
    v_diff <= 2 as is_balanced,
    v_diff as max_diff,
    CASE 
      WHEN v_diff > 5 THEN 'Severe imbalance detected'
      WHEN v_diff > 2 THEN 'Minor imbalance detected'
      ELSE 'Distribution is balanced'
    END as warning_message;
END;
$$;


ALTER FUNCTION "public"."validate_version_balance"("p_parent_test_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."academic_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."academic_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."academic_specializations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."academic_specializations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."academic_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "specialization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject_type" "public"."subject_type" DEFAULT 'major'::"public"."subject_type" NOT NULL,
    "course_codes" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."academic_subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."academic_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "normalized_name" "text" GENERATED ALWAYS AS ("lower"("btrim"("name"))) STORED,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "approved" boolean DEFAULT true NOT NULL,
    "needs_review" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'admin'::"text" NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academic_topics_name_length" CHECK ((("char_length"("btrim"("name")) >= 2) AND ("char_length"("btrim"("name")) <= 80)))
);


ALTER TABLE "public"."academic_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New Conversation'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active_intent" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid",
    "generation_type" "text" NOT NULL,
    "tos_id" "uuid",
    "prompt_used" "text",
    "model_used" "text",
    "semantic_similarity_score" numeric,
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejection_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "ai_generation_logs_generation_type_check" CHECK (("generation_type" = ANY (ARRAY['from_tos'::"text", 'from_topic'::"text", 'distractor_generation'::"text"]))),
    CONSTRAINT "ai_generation_logs_semantic_similarity_score_check" CHECK ((("semantic_similarity_score" >= (0)::numeric) AND ("semantic_similarity_score" <= (1)::numeric)))
);


ALTER TABLE "public"."ai_generation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assembly_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assembly_id" "uuid" NOT NULL,
    "version_label" "text" NOT NULL,
    "question_order" "text"[] NOT NULL,
    "shuffle_seed" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assembly_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classification_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid",
    "original_classification" "jsonb" NOT NULL,
    "validated_classification" "jsonb" NOT NULL,
    "validator_id" "uuid",
    "validation_confidence" numeric NOT NULL,
    "validation_type" "text",
    "cognitive_level" "text",
    "knowledge_dimension" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "classification_validations_validation_confidence_check" CHECK ((("validation_confidence" >= (0)::numeric) AND ("validation_confidence" <= (1)::numeric))),
    CONSTRAINT "classification_validations_validation_type_check" CHECK (("validation_type" = ANY (ARRAY['approve'::"text", 'modify'::"text", 'reject'::"text"])))
);


ALTER TABLE "public"."classification_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collaboration_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "message" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."collaboration_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."department_officers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "department" "text" NOT NULL,
    "course" "text" NOT NULL,
    "chairperson" "text" DEFAULT ''::"text" NOT NULL,
    "dean" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "department_officers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."department_officers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "action_details" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_activity_action_type_check" CHECK (("action_type" = ANY (ARRAY['created'::"text", 'edited'::"text", 'commented'::"text", 'approved'::"text", 'shared'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."document_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_collaborators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "text",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "last_active" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_collaborators_document_type_check" CHECK (("document_type" = ANY (ARRAY['question'::"text", 'tos'::"text", 'test'::"text", 'rubric'::"text"]))),
    CONSTRAINT "document_collaborators_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."document_collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_presence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "user_color" "text",
    "cursor_position" "jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."educational_standards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "grade_level" "text",
    "subject_area" "text",
    "framework" "text" NOT NULL,
    "parent_standard_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."educational_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tos_id" "uuid",
    "parent_test_id" "uuid",
    "version_label" "text",
    "version_number" integer,
    "title" "text",
    "subject" "text",
    "course" "text",
    "year_section" "text",
    "exam_period" "text",
    "school_year" "text",
    "items" "jsonb" NOT NULL,
    "answer_key" "jsonb",
    "instructions" "text",
    "question_order" "jsonb",
    "shuffle_seed" "text",
    "watermark_data" "jsonb",
    "time_limit" integer,
    "points_per_question" integer,
    "shuffle_questions" boolean DEFAULT false,
    "shuffle_choices" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "semester" "text",
    "validation_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "content_hash" "text",
    "validated_at" timestamp with time zone,
    "validated_by" "uuid",
    "submitted_at" timestamp with time zone,
    "format_id" "text",
    CONSTRAINT "generated_tests_points_per_question_check" CHECK (("points_per_question" > 0)),
    CONSTRAINT "generated_tests_time_limit_check" CHECK (("time_limit" > 0)),
    CONSTRAINT "generated_tests_validation_status_check" CHECK (("validation_status" = ANY (ARRAY['draft'::"text", 'pending_validation'::"text", 'validated'::"text", 'revision_requested'::"text"])))
);


ALTER TABLE "public"."generated_tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_competencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tos_id" "uuid" NOT NULL,
    "topic_name" "text" NOT NULL,
    "hours" integer,
    "percentage" numeric,
    "remembering_items" integer DEFAULT 0 NOT NULL,
    "understanding_items" integer DEFAULT 0 NOT NULL,
    "applying_items" integer DEFAULT 0 NOT NULL,
    "analyzing_items" integer DEFAULT 0 NOT NULL,
    "evaluating_items" integer DEFAULT 0 NOT NULL,
    "creating_items" integer DEFAULT 0 NOT NULL,
    "total_items" integer NOT NULL,
    "item_numbers" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_competencies_analyzing_items_check" CHECK (("analyzing_items" >= 0)),
    CONSTRAINT "learning_competencies_applying_items_check" CHECK (("applying_items" >= 0)),
    CONSTRAINT "learning_competencies_creating_items_check" CHECK (("creating_items" >= 0)),
    CONSTRAINT "learning_competencies_evaluating_items_check" CHECK (("evaluating_items" >= 0)),
    CONSTRAINT "learning_competencies_percentage_check" CHECK ((("percentage" >= (0)::numeric) AND ("percentage" <= (100)::numeric))),
    CONSTRAINT "learning_competencies_remembering_items_check" CHECK (("remembering_items" >= 0)),
    CONSTRAINT "learning_competencies_total_items_check" CHECK (("total_items" >= 0)),
    CONSTRAINT "learning_competencies_understanding_items_check" CHECK (("understanding_items" >= 0))
);


ALTER TABLE "public"."learning_competencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_benchmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation_name" "text" NOT NULL,
    "average_response_time" numeric,
    "min_response_time" numeric,
    "max_response_time" numeric,
    "throughput" numeric,
    "error_rate" numeric,
    "measured_at" timestamp with time zone NOT NULL,
    "measurement_period_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "performance_benchmarks_average_response_time_check" CHECK (("average_response_time" >= (0)::numeric)),
    CONSTRAINT "performance_benchmarks_error_rate_check" CHECK ((("error_rate" >= (0)::numeric) AND ("error_rate" <= (100)::numeric))),
    CONSTRAINT "performance_benchmarks_max_response_time_check" CHECK (("max_response_time" >= (0)::numeric)),
    CONSTRAINT "performance_benchmarks_measurement_period_minutes_check" CHECK (("measurement_period_minutes" > 0)),
    CONSTRAINT "performance_benchmarks_min_response_time_check" CHECK (("min_response_time" >= (0)::numeric)),
    CONSTRAINT "performance_benchmarks_throughput_check" CHECK (("throughput" >= (0)::numeric))
);


ALTER TABLE "public"."performance_benchmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "institution" "text",
    "avatar_url" "text",
    "college" "text",
    "course" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."institution" IS 'Educational institution name for display on TOS and printed outputs';



COMMENT ON COLUMN "public"."profiles"."avatar_url" IS 'Profile picture URL for the user';



CREATE TABLE IF NOT EXISTS "public"."psychometric_analyses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_id" "uuid",
    "question_id" "uuid",
    "analysis_type" "text" NOT NULL,
    "difficulty_index" numeric,
    "discrimination_index" numeric,
    "point_biserial_correlation" numeric,
    "reliability_coefficient" numeric,
    "validity_score" numeric,
    "sample_size" integer,
    "analysis_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "analyzed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "psychometric_analyses_analysis_type_check" CHECK (("analysis_type" = ANY (ARRAY['item_analysis'::"text", 'reliability'::"text", 'validity'::"text", 'difficulty_calibration'::"text"]))),
    CONSTRAINT "psychometric_analyses_difficulty_index_check" CHECK ((("difficulty_index" >= (0)::numeric) AND ("difficulty_index" <= (1)::numeric))),
    CONSTRAINT "psychometric_analyses_discrimination_index_check" CHECK ((("discrimination_index" >= ('-1'::integer)::numeric) AND ("discrimination_index" <= (1)::numeric))),
    CONSTRAINT "psychometric_analyses_point_biserial_correlation_check" CHECK ((("point_biserial_correlation" >= ('-1'::integer)::numeric) AND ("point_biserial_correlation" <= (1)::numeric))),
    CONSTRAINT "psychometric_analyses_reliability_coefficient_check" CHECK ((("reliability_coefficient" >= (0)::numeric) AND ("reliability_coefficient" <= (1)::numeric))),
    CONSTRAINT "psychometric_analyses_sample_size_check" CHECK (("sample_size" >= 0)),
    CONSTRAINT "psychometric_analyses_validity_score_check" CHECK ((("validity_score" >= (0)::numeric) AND ("validity_score" <= (1)::numeric)))
);


ALTER TABLE "public"."psychometric_analyses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quality_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "overall_score" numeric NOT NULL,
    "characteristics" "jsonb" NOT NULL,
    "recommendations" "text"[] DEFAULT '{}'::"text"[],
    "compliance_level" "text" NOT NULL,
    "assessment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_review_date" timestamp with time zone,
    "assessed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quality_assessments_compliance_level_check" CHECK (("compliance_level" = ANY (ARRAY['excellent'::"text", 'good'::"text", 'acceptable'::"text", 'poor'::"text"]))),
    CONSTRAINT "quality_assessments_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['question'::"text", 'test'::"text", 'rubric'::"text", 'tos'::"text"]))),
    CONSTRAINT "quality_assessments_overall_score_check" CHECK ((("overall_score" >= (0)::numeric) AND ("overall_score" <= (100)::numeric)))
);


ALTER TABLE "public"."quality_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quality_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "characteristic" "text" NOT NULL,
    "metric_name" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text",
    "measurement_method" "text",
    "automated" boolean DEFAULT false NOT NULL,
    "measured_by" "uuid",
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quality_metrics_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['question'::"text", 'test'::"text", 'rubric'::"text", 'tos'::"text"])))
);


ALTER TABLE "public"."quality_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_similarities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question1_id" "uuid" NOT NULL,
    "question2_id" "uuid" NOT NULL,
    "similarity_score" numeric NOT NULL,
    "algorithm_used" "text" NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "question_similarities_check" CHECK (("question1_id" < "question2_id")),
    CONSTRAINT "question_similarities_similarity_score_check" CHECK ((("similarity_score" >= (0)::numeric) AND ("similarity_score" <= (1)::numeric)))
);


ALTER TABLE "public"."question_similarities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_standards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "standard_id" "uuid" NOT NULL,
    "alignment_strength" numeric,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "question_standards_alignment_strength_check" CHECK ((("alignment_strength" >= (0)::numeric) AND ("alignment_strength" <= (1)::numeric)))
);


ALTER TABLE "public"."question_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tos_id" "uuid",
    "topic" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "choices" "jsonb",
    "correct_answer" "text",
    "bloom_level" "text",
    "cognitive_level" "text",
    "knowledge_dimension" "text",
    "difficulty" "text",
    "subject" "text",
    "grade_level" "text",
    "term" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_by" "text" NOT NULL,
    "owner" "uuid",
    "approved" boolean DEFAULT true NOT NULL,
    "approved_by" "text",
    "approval_notes" "text",
    "approval_confidence" numeric,
    "approval_timestamp" timestamp with time zone,
    "needs_review" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "validation_status" "text",
    "validated_by" "uuid",
    "validation_timestamp" timestamp with time zone,
    "ai_confidence_score" numeric,
    "classification_confidence" numeric,
    "semantic_vector" "text",
    "quality_score" numeric,
    "readability_score" numeric,
    "used_count" integer DEFAULT 0 NOT NULL,
    "used_history" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "deleted" boolean DEFAULT false NOT NULL,
    "search_vector" "tsvector",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "specialization" "text",
    "subject_code" "text",
    "subject_description" "text",
    CONSTRAINT "questions_ai_confidence_score_check" CHECK ((("ai_confidence_score" >= (0)::numeric) AND ("ai_confidence_score" <= (1)::numeric))),
    CONSTRAINT "questions_approval_confidence_check" CHECK ((("approval_confidence" >= (0)::numeric) AND ("approval_confidence" <= (1)::numeric))),
    CONSTRAINT "questions_classification_confidence_check" CHECK ((("classification_confidence" >= (0)::numeric) AND ("classification_confidence" <= (1)::numeric))),
    CONSTRAINT "questions_created_by_check" CHECK (("created_by" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'ai'::"text"]))),
    CONSTRAINT "questions_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'average'::"text", 'difficult'::"text"]))),
    CONSTRAINT "questions_knowledge_dimension_check" CHECK (("knowledge_dimension" = ANY (ARRAY['factual'::"text", 'conceptual'::"text", 'procedural'::"text", 'metacognitive'::"text"]))),
    CONSTRAINT "questions_quality_score_check" CHECK ((("quality_score" >= (0)::numeric) AND ("quality_score" <= (100)::numeric))),
    CONSTRAINT "questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['mcq'::"text", 'true_false'::"text", 'essay'::"text", 'short_answer'::"text"]))),
    CONSTRAINT "questions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "review_result" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "review_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['classification_review'::"text", 'quality_review'::"text", 'content_review'::"text"]))),
    CONSTRAINT "review_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."review_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rubric_criteria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rubric_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "weight" numeric,
    "max_score" numeric NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rubric_criteria_max_score_check" CHECK (("max_score" > (0)::numeric)),
    CONSTRAINT "rubric_criteria_order_index_check" CHECK (("order_index" >= 0)),
    CONSTRAINT "rubric_criteria_weight_check" CHECK ((("weight" >= (0)::numeric) AND ("weight" <= (100)::numeric)))
);


ALTER TABLE "public"."rubric_criteria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rubric_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid",
    "test_id" "uuid",
    "student_id" "uuid",
    "student_name" "text",
    "scorer_id" "uuid" NOT NULL,
    "scores" "jsonb" NOT NULL,
    "total_score" numeric NOT NULL,
    "comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rubric_scores_total_score_check" CHECK (("total_score" >= (0)::numeric))
);


ALTER TABLE "public"."rubric_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rubrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rubrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_name" "text" NOT NULL,
    "metric_value" numeric NOT NULL,
    "metric_unit" "text",
    "metric_category" "text" NOT NULL,
    "aggregation_period" "text",
    "dimensions" "jsonb" DEFAULT '{}'::"jsonb",
    "measured_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_metrics_aggregation_period_check" CHECK (("aggregation_period" = ANY (ARRAY['hourly'::"text", 'daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "system_metrics_metric_category_check" CHECK (("metric_category" = ANY (ARRAY['performance'::"text", 'usage'::"text", 'quality'::"text", 'security'::"text"])))
);


ALTER TABLE "public"."system_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_assemblies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "tos_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "params" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_assemblies_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'assembling'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."test_assemblies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_assembly_constraints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_id" "uuid" NOT NULL,
    "constraint_type" "text" NOT NULL,
    "constraint_config" "jsonb" NOT NULL,
    "priority" integer DEFAULT 1 NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_assembly_constraints_constraint_type_check" CHECK (("constraint_type" = ANY (ARRAY['bloom_distribution'::"text", 'difficulty_balance'::"text", 'topic_coverage'::"text", 'avoid_similarity'::"text"]))),
    CONSTRAINT "test_assembly_constraints_priority_check" CHECK (("priority" > 0))
);


ALTER TABLE "public"."test_assembly_constraints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "text" NOT NULL,
    "student_name" "text" NOT NULL,
    "test_version_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid",
    "seat_number" "text",
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'started'::"text", 'submitted'::"text", 'graded'::"text"])))
);


ALTER TABLE "public"."test_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_distribution_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_test_id" "uuid",
    "distribution_strategy" "text" NOT NULL,
    "total_versions" integer NOT NULL,
    "total_students" integer NOT NULL,
    "distributed_by" "uuid" NOT NULL,
    "distributed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_distribution_logs_distribution_strategy_check" CHECK (("distribution_strategy" = ANY (ARRAY['sequential'::"text", 'random'::"text", 'seating_chart'::"text"]))),
    CONSTRAINT "test_distribution_logs_total_students_check" CHECK (("total_students" > 0)),
    CONSTRAINT "test_distribution_logs_total_versions_check" CHECK (("total_versions" > 0))
);


ALTER TABLE "public"."test_distribution_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_equivalence_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_name" "text" NOT NULL,
    "description" "text",
    "target_difficulty" numeric,
    "target_reliability" numeric,
    "statistical_metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_equivalence_groups_target_difficulty_check" CHECK ((("target_difficulty" >= (0)::numeric) AND ("target_difficulty" <= (1)::numeric))),
    CONSTRAINT "test_equivalence_groups_target_reliability_check" CHECK ((("target_reliability" >= (0)::numeric) AND ("target_reliability" <= (1)::numeric)))
);


ALTER TABLE "public"."test_equivalence_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_equivalence_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "test_id" "uuid" NOT NULL,
    "equivalence_score" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_equivalence_members_equivalence_score_check" CHECK ((("equivalence_score" >= (0)::numeric) AND ("equivalence_score" <= (1)::numeric)))
);


ALTER TABLE "public"."test_equivalence_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_version_id" "uuid" NOT NULL,
    "export_type" "text" NOT NULL,
    "file_name" "text",
    "exported_by" "text",
    "exported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_exports_export_type_check" CHECK (("export_type" = ANY (ARRAY['pdf'::"text", 'docx'::"text", 'latex'::"text", 'json'::"text"])))
);


ALTER TABLE "public"."test_exports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_metadata" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "course" "text",
    "year_section" "text",
    "exam_period" "text",
    "school_year" "text",
    "instructions" "text",
    "time_limit" integer,
    "points_per_question" integer,
    "total_questions" integer,
    "shuffle_questions" boolean DEFAULT false NOT NULL,
    "shuffle_choices" boolean DEFAULT false NOT NULL,
    "number_of_versions" integer DEFAULT 1 NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_metadata_number_of_versions_check" CHECK (("number_of_versions" > 0)),
    CONSTRAINT "test_metadata_points_per_question_check" CHECK (("points_per_question" > 0)),
    CONSTRAINT "test_metadata_time_limit_check" CHECK (("time_limit" > 0)),
    CONSTRAINT "test_metadata_total_questions_check" CHECK (("total_questions" > 0))
);


ALTER TABLE "public"."test_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "generated_test_id" "uuid" NOT NULL,
    "validator_id" "uuid" NOT NULL,
    "percentage_correctness" numeric(5,2) NOT NULL,
    "decision" "text" NOT NULL,
    "comments" "text",
    "instrument_scores" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reused_from_test_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "likert_scores" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "bloom_alignment" "text",
    "items_for_revision" "text",
    "general_comments" "text",
    "weighted_mean" numeric,
    "interpretation" "text",
    "expert_full_name" "text",
    "expert_position" "text",
    "expert_experience" "text",
    "item_alignment_matrix" "jsonb" DEFAULT '[]'::"jsonb",
    "content_validity_index" numeric,
    CONSTRAINT "test_validations_decision_check" CHECK (("decision" = ANY (ARRAY['approved'::"text", 'revision_requested'::"text"]))),
    CONSTRAINT "test_validations_percentage_correctness_check" CHECK ((("percentage_correctness" >= (0)::numeric) AND ("percentage_correctness" <= (100)::numeric)))
);


ALTER TABLE "public"."test_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_metadata_id" "uuid" NOT NULL,
    "version_label" "text" NOT NULL,
    "questions" "jsonb" NOT NULL,
    "answer_key" "jsonb" NOT NULL,
    "total_points" integer,
    "question_order" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."test_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tos_collaborators" (
    "tos_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "can_edit" boolean DEFAULT false NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tos_collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tos_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subject_no" "text",
    "course" "text" NOT NULL,
    "description" "text",
    "year_section" "text",
    "exam_period" "text",
    "school_year" "text" NOT NULL,
    "total_items" integer NOT NULL,
    "prepared_by" "text" NOT NULL,
    "noted_by" "text",
    "created_by" "text",
    "owner" "uuid",
    "topics" "jsonb" DEFAULT '[]'::"jsonb",
    "distribution" "jsonb" DEFAULT '{}'::"jsonb",
    "matrix" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bloom_distribution" "jsonb" DEFAULT '{}'::"jsonb",
    "checked_by" "text",
    "semester" "text",
    CONSTRAINT "tos_entries_total_items_check" CHECK (("total_items" > 0))
);


ALTER TABLE "public"."tos_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "session_id" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "draft_key" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid"
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."version_security_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_version_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    CONSTRAINT "version_security_logs_event_type_check" CHECK (("event_type" = ANY (ARRAY['unauthorized_access'::"text", 'duplicate_detection'::"text", 'timing_anomaly'::"text", 'suspicious_activity'::"text"]))),
    CONSTRAINT "version_security_logs_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."version_security_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."academic_categories"
    ADD CONSTRAINT "academic_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."academic_categories"
    ADD CONSTRAINT "academic_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."academic_specializations"
    ADD CONSTRAINT "academic_specializations_category_id_name_key" UNIQUE ("category_id", "name");



ALTER TABLE ONLY "public"."academic_specializations"
    ADD CONSTRAINT "academic_specializations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."academic_subjects"
    ADD CONSTRAINT "academic_subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."academic_subjects"
    ADD CONSTRAINT "academic_subjects_specialization_id_code_key" UNIQUE ("specialization_id", "code");



ALTER TABLE ONLY "public"."academic_topics"
    ADD CONSTRAINT "academic_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."academic_topics"
    ADD CONSTRAINT "academic_topics_unique_per_subject" UNIQUE ("subject_id", "normalized_name");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assembly_versions"
    ADD CONSTRAINT "assembly_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classification_validations"
    ADD CONSTRAINT "classification_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collaboration_messages"
    ADD CONSTRAINT "collaboration_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."department_officers"
    ADD CONSTRAINT "department_officers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_activity"
    ADD CONSTRAINT "document_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_collaborators"
    ADD CONSTRAINT "document_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_presence"
    ADD CONSTRAINT "document_presence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."educational_standards"
    ADD CONSTRAINT "educational_standards_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."educational_standards"
    ADD CONSTRAINT "educational_standards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_tests"
    ADD CONSTRAINT "generated_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_competencies"
    ADD CONSTRAINT "learning_competencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_benchmarks"
    ADD CONSTRAINT "performance_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."psychometric_analyses"
    ADD CONSTRAINT "psychometric_analyses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quality_assessments"
    ADD CONSTRAINT "quality_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quality_metrics"
    ADD CONSTRAINT "quality_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_similarities"
    ADD CONSTRAINT "question_similarities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_similarities"
    ADD CONSTRAINT "question_similarities_question1_id_question2_id_key" UNIQUE ("question1_id", "question2_id");



ALTER TABLE ONLY "public"."question_standards"
    ADD CONSTRAINT "question_standards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_standards"
    ADD CONSTRAINT "question_standards_question_id_standard_id_key" UNIQUE ("question_id", "standard_id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rubric_criteria"
    ADD CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rubric_scores"
    ADD CONSTRAINT "rubric_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rubrics"
    ADD CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_metrics"
    ADD CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."test_assemblies"
    ADD CONSTRAINT "test_assemblies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_assembly_constraints"
    ADD CONSTRAINT "test_assembly_constraints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_assignments"
    ADD CONSTRAINT "test_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_distribution_logs"
    ADD CONSTRAINT "test_distribution_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_equivalence_groups"
    ADD CONSTRAINT "test_equivalence_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_equivalence_members"
    ADD CONSTRAINT "test_equivalence_members_group_id_test_id_key" UNIQUE ("group_id", "test_id");



ALTER TABLE ONLY "public"."test_equivalence_members"
    ADD CONSTRAINT "test_equivalence_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_exports"
    ADD CONSTRAINT "test_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_metadata"
    ADD CONSTRAINT "test_metadata_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_validations"
    ADD CONSTRAINT "test_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_versions"
    ADD CONSTRAINT "test_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_versions"
    ADD CONSTRAINT "test_versions_test_metadata_id_version_label_key" UNIQUE ("test_metadata_id", "version_label");



ALTER TABLE ONLY "public"."tos_collaborators"
    ADD CONSTRAINT "tos_collaborators_pkey" PRIMARY KEY ("tos_id", "user_id");



ALTER TABLE ONLY "public"."tos_entries"
    ADD CONSTRAINT "tos_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_analytics"
    ADD CONSTRAINT "user_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_drafts"
    ADD CONSTRAINT "user_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_drafts"
    ADD CONSTRAINT "user_drafts_user_id_draft_key_key" UNIQUE ("user_id", "draft_key");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."version_security_logs"
    ADD CONSTRAINT "version_security_logs_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "department_officers_active_unique" ON "public"."department_officers" USING "btree" ("lower"("btrim"("department")), "lower"("btrim"("course"))) WHERE ("status" = 'active'::"text");



CREATE INDEX "generated_tests_submitted_at_idx" ON "public"."generated_tests" USING "btree" ("submitted_at");



CREATE INDEX "generated_tests_submitted_at_idx1" ON "public"."generated_tests" USING "btree" ("submitted_at");



CREATE INDEX "idx_academic_topics_approved" ON "public"."academic_topics" USING "btree" ("subject_id", "approved");



CREATE INDEX "idx_academic_topics_name_trgm" ON "public"."academic_topics" USING "gin" ("normalized_name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_academic_topics_subject" ON "public"."academic_topics" USING "btree" ("subject_id");



CREATE INDEX "idx_activity_log_created_at" ON "public"."activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_log_entity_type" ON "public"."activity_log" USING "btree" ("entity_type");



CREATE INDEX "idx_activity_log_user_id" ON "public"."activity_log" USING "btree" ("user_id");



CREATE INDEX "idx_ai_conversations_last_message" ON "public"."ai_conversations" USING "btree" ("last_message_at" DESC);



CREATE INDEX "idx_ai_conversations_user_id" ON "public"."ai_conversations" USING "btree" ("user_id");



CREATE INDEX "idx_ai_generation_logs_question" ON "public"."ai_generation_logs" USING "btree" ("question_id");



CREATE INDEX "idx_assembly_versions_assembly_id" ON "public"."assembly_versions" USING "btree" ("assembly_id");



CREATE INDEX "idx_classification_validations_question" ON "public"."classification_validations" USING "btree" ("question_id");



CREATE INDEX "idx_classification_validations_validator" ON "public"."classification_validations" USING "btree" ("validator_id");



CREATE INDEX "idx_collaboration_messages_document" ON "public"."collaboration_messages" USING "btree" ("document_id", "document_type");



CREATE INDEX "idx_collaboration_messages_timestamp" ON "public"."collaboration_messages" USING "btree" ("timestamp");



CREATE INDEX "idx_document_activity_document" ON "public"."document_activity" USING "btree" ("document_id", "document_type");



CREATE INDEX "idx_document_activity_timestamp" ON "public"."document_activity" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_document_collaborators_document" ON "public"."document_collaborators" USING "btree" ("document_id", "document_type");



CREATE INDEX "idx_document_collaborators_user_email" ON "public"."document_collaborators" USING "btree" ("user_email");



CREATE INDEX "idx_document_presence_document" ON "public"."document_presence" USING "btree" ("document_id", "document_type");



CREATE INDEX "idx_document_presence_is_active" ON "public"."document_presence" USING "btree" ("is_active");



CREATE INDEX "idx_document_presence_user_email" ON "public"."document_presence" USING "btree" ("user_email");



CREATE INDEX "idx_educational_standards_framework" ON "public"."educational_standards" USING "btree" ("framework");



CREATE INDEX "idx_educational_standards_grade_level" ON "public"."educational_standards" USING "btree" ("grade_level");



CREATE INDEX "idx_educational_standards_parent" ON "public"."educational_standards" USING "btree" ("parent_standard_id");



CREATE INDEX "idx_educational_standards_subject_area" ON "public"."educational_standards" USING "btree" ("subject_area");



CREATE INDEX "idx_generated_tests_content_hash" ON "public"."generated_tests" USING "btree" ("content_hash");



CREATE INDEX "idx_generated_tests_created_by" ON "public"."generated_tests" USING "btree" ("created_by");



CREATE INDEX "idx_generated_tests_parent_id" ON "public"."generated_tests" USING "btree" ("parent_test_id");



CREATE INDEX "idx_generated_tests_tos_id" ON "public"."generated_tests" USING "btree" ("tos_id");



CREATE INDEX "idx_generated_tests_validation_status" ON "public"."generated_tests" USING "btree" ("validation_status");



CREATE INDEX "idx_learning_competencies_tos_id" ON "public"."learning_competencies" USING "btree" ("tos_id");



CREATE INDEX "idx_performance_benchmarks_measured_at" ON "public"."performance_benchmarks" USING "btree" ("measured_at" DESC);



CREATE INDEX "idx_performance_benchmarks_operation" ON "public"."performance_benchmarks" USING "btree" ("operation_name");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_psychometric_analyses_analyzed_by" ON "public"."psychometric_analyses" USING "btree" ("analyzed_by");



CREATE INDEX "idx_psychometric_analyses_question_id" ON "public"."psychometric_analyses" USING "btree" ("question_id");



CREATE INDEX "idx_psychometric_analyses_test_id" ON "public"."psychometric_analyses" USING "btree" ("test_id");



CREATE INDEX "idx_quality_assessments_assessed_by" ON "public"."quality_assessments" USING "btree" ("assessed_by");



CREATE INDEX "idx_quality_assessments_compliance" ON "public"."quality_assessments" USING "btree" ("compliance_level");



CREATE INDEX "idx_quality_assessments_entity" ON "public"."quality_assessments" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_quality_metrics_characteristic" ON "public"."quality_metrics" USING "btree" ("characteristic");



CREATE INDEX "idx_quality_metrics_entity" ON "public"."quality_metrics" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_quality_metrics_measured_by" ON "public"."quality_metrics" USING "btree" ("measured_by");



CREATE INDEX "idx_question_standards_question_id" ON "public"."question_standards" USING "btree" ("question_id");



CREATE INDEX "idx_question_standards_standard_id" ON "public"."question_standards" USING "btree" ("standard_id");



CREATE INDEX "idx_question_standards_validated_by" ON "public"."question_standards" USING "btree" ("validated_by");



CREATE INDEX "idx_questions_approved" ON "public"."questions" USING "btree" ("approved");



CREATE INDEX "idx_questions_approved_used" ON "public"."questions" USING "btree" ("approved", "used_count") WHERE ("deleted" = false);



CREATE INDEX "idx_questions_bloom_level" ON "public"."questions" USING "btree" ("bloom_level");



CREATE INDEX "idx_questions_category" ON "public"."questions" USING "btree" ("category");



CREATE INDEX "idx_questions_needs_review" ON "public"."questions" USING "btree" ("needs_review");



CREATE INDEX "idx_questions_owner" ON "public"."questions" USING "btree" ("owner");



CREATE INDEX "idx_questions_search_vector" ON "public"."questions" USING "gin" ("search_vector");



CREATE INDEX "idx_questions_specialization" ON "public"."questions" USING "btree" ("specialization");



CREATE INDEX "idx_questions_subject_code" ON "public"."questions" USING "btree" ("subject_code");



CREATE INDEX "idx_questions_topic" ON "public"."questions" USING "btree" ("topic");



CREATE INDEX "idx_questions_topic_bloom_difficulty" ON "public"."questions" USING "btree" ("topic", "bloom_level", "difficulty") WHERE (("approved" = true) AND ("deleted" = false));



CREATE INDEX "idx_questions_tos_id" ON "public"."questions" USING "btree" ("tos_id");



CREATE INDEX "idx_review_requests_assigned" ON "public"."review_requests" USING "btree" ("assigned_to");



CREATE INDEX "idx_rubric_criteria_rubric_id" ON "public"."rubric_criteria" USING "btree" ("rubric_id");



CREATE INDEX "idx_rubric_scores_question_id" ON "public"."rubric_scores" USING "btree" ("question_id");



CREATE INDEX "idx_rubric_scores_scorer_id" ON "public"."rubric_scores" USING "btree" ("scorer_id");



CREATE INDEX "idx_rubric_scores_student_id" ON "public"."rubric_scores" USING "btree" ("student_id");



CREATE INDEX "idx_rubric_scores_test_id" ON "public"."rubric_scores" USING "btree" ("test_id");



CREATE INDEX "idx_rubrics_created_by" ON "public"."rubrics" USING "btree" ("created_by");



CREATE INDEX "idx_system_metrics_category" ON "public"."system_metrics" USING "btree" ("metric_category");



CREATE INDEX "idx_system_metrics_measured_at" ON "public"."system_metrics" USING "btree" ("measured_at" DESC);



CREATE INDEX "idx_system_metrics_name" ON "public"."system_metrics" USING "btree" ("metric_name");



CREATE INDEX "idx_test_assemblies_created_by" ON "public"."test_assemblies" USING "btree" ("created_by");



CREATE INDEX "idx_test_assembly_constraints_test_id" ON "public"."test_assembly_constraints" USING "btree" ("test_id");



CREATE INDEX "idx_test_assignments_student_id" ON "public"."test_assignments" USING "btree" ("student_id");



CREATE INDEX "idx_test_assignments_version_id" ON "public"."test_assignments" USING "btree" ("test_version_id");



CREATE INDEX "idx_test_distribution_logs_distributed_by" ON "public"."test_distribution_logs" USING "btree" ("distributed_by");



CREATE INDEX "idx_test_equivalence_members_group_id" ON "public"."test_equivalence_members" USING "btree" ("group_id");



CREATE INDEX "idx_test_equivalence_members_test_id" ON "public"."test_equivalence_members" USING "btree" ("test_id");



CREATE INDEX "idx_test_exports_version_id" ON "public"."test_exports" USING "btree" ("test_version_id");



CREATE INDEX "idx_test_metadata_created_by" ON "public"."test_metadata" USING "btree" ("created_by");



CREATE INDEX "idx_test_validations_test_id" ON "public"."test_validations" USING "btree" ("generated_test_id");



CREATE INDEX "idx_test_versions_metadata_id" ON "public"."test_versions" USING "btree" ("test_metadata_id");



CREATE INDEX "idx_tos_collaborators_user_id" ON "public"."tos_collaborators" USING "btree" ("user_id");



CREATE INDEX "idx_tos_entries_bloom_distribution" ON "public"."tos_entries" USING "gin" ("bloom_distribution");



CREATE INDEX "idx_tos_entries_owner" ON "public"."tos_entries" USING "btree" ("owner");



CREATE INDEX "idx_user_analytics_event_type" ON "public"."user_analytics" USING "btree" ("event_type");



CREATE INDEX "idx_user_analytics_occurred_at" ON "public"."user_analytics" USING "btree" ("occurred_at" DESC);



CREATE INDEX "idx_user_analytics_user_id" ON "public"."user_analytics" USING "btree" ("user_id");



CREATE INDEX "idx_user_drafts_user_key" ON "public"."user_drafts" USING "btree" ("user_id", "draft_key");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_user_settings_user_id" ON "public"."user_settings" USING "btree" ("user_id");



CREATE INDEX "idx_version_security_logs_severity" ON "public"."version_security_logs" USING "btree" ("severity");



CREATE INDEX "idx_version_security_logs_version_id" ON "public"."version_security_logs" USING "btree" ("test_version_id");



CREATE OR REPLACE TRIGGER "enforce_test_draft_edit_lock_trg" BEFORE UPDATE ON "public"."generated_tests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_test_draft_edit_lock"();



CREATE OR REPLACE TRIGGER "trg_apply_test_validation" AFTER INSERT ON "public"."test_validations" FOR EACH ROW EXECUTE FUNCTION "public"."apply_test_validation"();



CREATE OR REPLACE TRIGGER "trg_touch_academic_topics" BEFORE UPDATE ON "public"."academic_topics" FOR EACH ROW EXECUTE FUNCTION "public"."touch_academic_topics_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_set_approval_fields" BEFORE UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_approval_fields"();



CREATE OR REPLACE TRIGGER "update_ai_conversations_updated_at" BEFORE UPDATE ON "public"."ai_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_department_officers_updated_at" BEFORE UPDATE ON "public"."department_officers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_educational_standards_updated_at" BEFORE UPDATE ON "public"."educational_standards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quality_assessments_updated_at" BEFORE UPDATE ON "public"."quality_assessments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_questions_updated_at" BEFORE UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_test_assemblies_updated_at" BEFORE UPDATE ON "public"."test_assemblies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_test_metadata_updated_at" BEFORE UPDATE ON "public"."test_metadata" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tos_entries_updated_at" BEFORE UPDATE ON "public"."tos_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_drafts_updated_at" BEFORE UPDATE ON "public"."user_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."academic_specializations"
    ADD CONSTRAINT "academic_specializations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."academic_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."academic_subjects"
    ADD CONSTRAINT "academic_subjects_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "public"."academic_specializations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."academic_topics"
    ADD CONSTRAINT "academic_topics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."academic_topics"
    ADD CONSTRAINT "academic_topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."academic_subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assembly_versions"
    ADD CONSTRAINT "assembly_versions_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "public"."test_assemblies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classification_validations"
    ADD CONSTRAINT "classification_validations_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classification_validations"
    ADD CONSTRAINT "classification_validations_validator_id_fkey" FOREIGN KEY ("validator_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."educational_standards"
    ADD CONSTRAINT "educational_standards_parent_standard_id_fkey" FOREIGN KEY ("parent_standard_id") REFERENCES "public"."educational_standards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "fk_ai_generation_logs_tos_id" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "fk_questions_tos_id" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_tests"
    ADD CONSTRAINT "generated_tests_parent_test_id_fkey" FOREIGN KEY ("parent_test_id") REFERENCES "public"."generated_tests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_tests"
    ADD CONSTRAINT "generated_tests_tos_id_fkey" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_competencies"
    ADD CONSTRAINT "learning_competencies_tos_id_fkey" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."psychometric_analyses"
    ADD CONSTRAINT "psychometric_analyses_analyzed_by_fkey" FOREIGN KEY ("analyzed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."psychometric_analyses"
    ADD CONSTRAINT "psychometric_analyses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."psychometric_analyses"
    ADD CONSTRAINT "psychometric_analyses_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."generated_tests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quality_assessments"
    ADD CONSTRAINT "quality_assessments_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quality_metrics"
    ADD CONSTRAINT "quality_metrics_measured_by_fkey" FOREIGN KEY ("measured_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."question_similarities"
    ADD CONSTRAINT "question_similarities_question1_id_fkey" FOREIGN KEY ("question1_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_similarities"
    ADD CONSTRAINT "question_similarities_question2_id_fkey" FOREIGN KEY ("question2_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_standards"
    ADD CONSTRAINT "question_standards_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_standards"
    ADD CONSTRAINT "question_standards_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "public"."educational_standards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_standards"
    ADD CONSTRAINT "question_standards_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_owner_fkey" FOREIGN KEY ("owner") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_tos_id_fkey" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rubric_criteria"
    ADD CONSTRAINT "rubric_criteria_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rubric_scores"
    ADD CONSTRAINT "rubric_scores_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rubric_scores"
    ADD CONSTRAINT "rubric_scores_scorer_id_fkey" FOREIGN KEY ("scorer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rubric_scores"
    ADD CONSTRAINT "rubric_scores_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."generated_tests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rubrics"
    ADD CONSTRAINT "rubrics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."test_assemblies"
    ADD CONSTRAINT "test_assemblies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_assemblies"
    ADD CONSTRAINT "test_assemblies_tos_id_fkey" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_assembly_constraints"
    ADD CONSTRAINT "test_assembly_constraints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_assembly_constraints"
    ADD CONSTRAINT "test_assembly_constraints_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."test_assemblies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_assignments"
    ADD CONSTRAINT "test_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_assignments"
    ADD CONSTRAINT "test_assignments_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "public"."test_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_distribution_logs"
    ADD CONSTRAINT "test_distribution_logs_distributed_by_fkey" FOREIGN KEY ("distributed_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_distribution_logs"
    ADD CONSTRAINT "test_distribution_logs_parent_test_id_fkey" FOREIGN KEY ("parent_test_id") REFERENCES "public"."generated_tests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_equivalence_groups"
    ADD CONSTRAINT "test_equivalence_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_equivalence_members"
    ADD CONSTRAINT "test_equivalence_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."test_equivalence_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_equivalence_members"
    ADD CONSTRAINT "test_equivalence_members_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."generated_tests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_exports"
    ADD CONSTRAINT "test_exports_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "public"."test_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_validations"
    ADD CONSTRAINT "test_validations_generated_test_id_fkey" FOREIGN KEY ("generated_test_id") REFERENCES "public"."generated_tests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_validations"
    ADD CONSTRAINT "test_validations_reused_from_test_id_fkey" FOREIGN KEY ("reused_from_test_id") REFERENCES "public"."generated_tests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_versions"
    ADD CONSTRAINT "test_versions_test_metadata_id_fkey" FOREIGN KEY ("test_metadata_id") REFERENCES "public"."test_metadata"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tos_collaborators"
    ADD CONSTRAINT "tos_collaborators_tos_id_fkey" FOREIGN KEY ("tos_id") REFERENCES "public"."tos_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tos_collaborators"
    ADD CONSTRAINT "tos_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tos_entries"
    ADD CONSTRAINT "tos_entries_owner_fkey" FOREIGN KEY ("owner") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_analytics"
    ADD CONSTRAINT "user_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."version_security_logs"
    ADD CONSTRAINT "version_security_logs_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "public"."test_versions"("id") ON DELETE CASCADE;



CREATE POLICY "Admins and teachers can create analyses" ON "public"."psychometric_analyses" FOR INSERT TO "authenticated" WITH CHECK ((("analyzed_by" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Admins can create standards" ON "public"."educational_standards" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete any question" ON "public"."questions" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete categories" ON "public"."academic_categories" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete specializations" ON "public"."academic_specializations" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete standards" ON "public"."educational_standards" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete subjects" ON "public"."academic_subjects" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert categories" ON "public"."academic_categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert settings" ON "public"."system_settings" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert specializations" ON "public"."academic_specializations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert subjects" ON "public"."academic_subjects" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all assessments" ON "public"."quality_assessments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all collaborators" ON "public"."document_collaborators" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all mappings" ON "public"."question_standards" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all metrics" ON "public"."quality_metrics" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all rubrics" ON "public"."rubrics" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all scores" ON "public"."rubric_scores" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read all activity" ON "public"."activity_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read all analytics" ON "public"."user_analytics" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read all psychometric analyses" ON "public"."psychometric_analyses" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read performance benchmarks" ON "public"."performance_benchmarks" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read security logs" ON "public"."version_security_logs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read system metrics" ON "public"."system_metrics" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update any question" ON "public"."questions" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update categories" ON "public"."academic_categories" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update settings" ON "public"."system_settings" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update specializations" ON "public"."academic_specializations" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update standards" ON "public"."educational_standards" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update subjects" ON "public"."academic_subjects" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all review requests" ON "public"."review_requests" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins delete officers" ON "public"."department_officers" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins insert officers" ON "public"."department_officers" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins update officers" ON "public"."department_officers" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Assessors can update their assessments" ON "public"."quality_assessments" FOR UPDATE TO "authenticated" USING (("assessed_by" = "auth"."uid"())) WITH CHECK (("assessed_by" = "auth"."uid"()));



CREATE POLICY "Authenticated can read officers" ON "public"."department_officers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can create activity logs" ON "public"."activity_log" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can create document activity" ON "public"."document_activity" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can create security logs" ON "public"."version_security_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read categories" ON "public"."academic_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read equivalence groups" ON "public"."test_equivalence_groups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read equivalence members" ON "public"."test_equivalence_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read quality assessments" ON "public"."quality_assessments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read quality metrics" ON "public"."quality_metrics" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read question-standard mappings" ON "public"."question_standards" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read rubrics" ON "public"."rubrics" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read settings" ON "public"."system_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read specializations" ON "public"."academic_specializations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read standards" ON "public"."educational_standards" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read subjects" ON "public"."academic_subjects" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can record quality metrics" ON "public"."quality_metrics" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can record system metrics" ON "public"."system_metrics" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view similarities" ON "public"."question_similarities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Collaborators can create messages" ON "public"."collaboration_messages" FOR INSERT TO "authenticated" WITH CHECK ((("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."document_collaborators" "dc"
  WHERE (("dc"."document_id" = "collaboration_messages"."document_id") AND ("dc"."document_type" = "collaboration_messages"."document_type") AND ("dc"."user_email" = ( SELECT "profiles"."email"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))))));



CREATE POLICY "Collaborators can view activity" ON "public"."document_activity" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."document_collaborators"
  WHERE (("document_collaborators"."document_id" = "document_activity"."document_id") AND ("document_collaborators"."document_type" = "document_activity"."document_type") AND ("document_collaborators"."user_email" = ( SELECT "profiles"."email"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Collaborators can view messages" ON "public"."collaboration_messages" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."document_collaborators"
  WHERE (("document_collaborators"."document_id" = "collaboration_messages"."document_id") AND ("document_collaborators"."document_type" = "collaboration_messages"."document_type") AND ("document_collaborators"."user_email" = ( SELECT "profiles"."email"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Collaborators can view presence" ON "public"."document_presence" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."document_collaborators"
  WHERE (("document_collaborators"."document_id" = "document_presence"."document_id") AND ("document_collaborators"."document_type" = "document_presence"."document_type") AND ("document_collaborators"."user_email" = ( SELECT "profiles"."email"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Creators can delete their rubrics" ON "public"."rubrics" FOR DELETE TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Creators can update their rubrics" ON "public"."rubrics" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Document owners can manage collaborators" ON "public"."document_collaborators" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR (("document_type" = 'tos'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."tos_entries" "t"
  WHERE ((("t"."id")::"text" = "document_collaborators"."document_id") AND ("t"."owner" = "auth"."uid"()))))) OR (("document_type" = ANY (ARRAY['test'::"text", 'generated_test'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."generated_tests" "g"
  WHERE ((("g"."id")::"text" = "document_collaborators"."document_id") AND ("g"."created_by" = "auth"."uid"())))))));



CREATE POLICY "Document owners can update collaborators" ON "public"."document_collaborators" FOR UPDATE TO "authenticated" USING ((("role" = 'owner'::"text") AND ("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))))) WITH CHECK ((("role" = 'owner'::"text") AND ("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "Only admins can view user analytics" ON "public"."user_analytics" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Owners can delete their questions" ON "public"."questions" FOR DELETE TO "authenticated" USING (("owner" = "auth"."uid"()));



CREATE POLICY "Owners can update their questions" ON "public"."questions" FOR UPDATE TO "authenticated" USING (("owner" = "auth"."uid"())) WITH CHECK (("owner" = "auth"."uid"()));



CREATE POLICY "Rubric creators can manage criteria" ON "public"."rubric_criteria" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rubrics"
  WHERE (("rubrics"."id" = "rubric_criteria"."rubric_id") AND (("rubrics"."created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rubrics"
  WHERE (("rubrics"."id" = "rubric_criteria"."rubric_id") AND (("rubrics"."created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))));



CREATE POLICY "Scorers can read their scores" ON "public"."rubric_scores" FOR SELECT TO "authenticated" USING ((("scorer_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Scorers can update their scores" ON "public"."rubric_scores" FOR UPDATE TO "authenticated" USING (("scorer_id" = "auth"."uid"())) WITH CHECK (("scorer_id" = "auth"."uid"()));



CREATE POLICY "System can create analytics" ON "public"."user_analytics" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "System can create benchmarks" ON "public"."performance_benchmarks" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "TOS owners can manage collaborators" ON "public"."tos_collaborators" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tos_entries"
  WHERE (("tos_entries"."id" = "tos_collaborators"."tos_id") AND ("tos_entries"."owner" = "auth"."uid"())))));



CREATE POLICY "Teachers and admins can create AI logs" ON "public"."ai_generation_logs" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers and admins can create assessments" ON "public"."quality_assessments" FOR INSERT TO "authenticated" WITH CHECK ((("assessed_by" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Teachers and admins can create questions" ON "public"."questions" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers and admins can read AI logs" ON "public"."ai_generation_logs" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can create distribution logs" ON "public"."test_distribution_logs" FOR INSERT TO "authenticated" WITH CHECK ((("distributed_by" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Teachers can create equivalence groups" ON "public"."test_equivalence_groups" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Teachers can create question-standard mappings" ON "public"."question_standards" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can create review requests" ON "public"."review_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can create rubrics" ON "public"."rubrics" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Teachers can create scores" ON "public"."rubric_scores" FOR INSERT TO "authenticated" WITH CHECK ((("scorer_id" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Teachers can create test assemblies" ON "public"."test_assemblies" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))));



CREATE POLICY "Teachers can create test assignments" ON "public"."test_assignments" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can create test exports" ON "public"."test_exports" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can create test metadata" ON "public"."test_metadata" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can create test versions" ON "public"."test_versions" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can read psychometric analyses" ON "public"."psychometric_analyses" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role"));



CREATE POLICY "Teachers can read their own test assignments" ON "public"."test_assignments" FOR SELECT USING ((("assigned_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can update test metadata" ON "public"."test_metadata" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can update their mappings" ON "public"."question_standards" FOR UPDATE TO "authenticated" USING ((("validated_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK ((("validated_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can update their own test assignments" ON "public"."test_assignments" FOR UPDATE USING ((("assigned_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK ((("assigned_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Teachers can view own ai logs" ON "public"."ai_generation_logs" FOR SELECT TO "authenticated" USING ((("generated_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Users can create competencies for their TOS" ON "public"."learning_competencies" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tos_entries"
  WHERE (("tos_entries"."id" = "learning_competencies"."tos_id") AND ("tos_entries"."owner" = "auth"."uid"())))));



CREATE POLICY "Users can create their own conversations" ON "public"."ai_conversations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own drafts" ON "public"."user_drafts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their presence" ON "public"."document_presence" FOR INSERT TO "authenticated" WITH CHECK (("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete their own conversations" ON "public"."ai_conversations" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own drafts" ON "public"."user_drafts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their presence" ON "public"."document_presence" FOR DELETE TO "authenticated" USING (("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can read assembly versions they have access to" ON "public"."assembly_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."test_assemblies"
  WHERE (("test_assemblies"."id" = "assembly_versions"."assembly_id") AND (("test_assemblies"."created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))));



CREATE POLICY "Users can read competencies of accessible TOS" ON "public"."learning_competencies" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tos_entries"
  WHERE (("tos_entries"."id" = "learning_competencies"."tos_id") AND (("tos_entries"."owner" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))));



CREATE POLICY "Users can read constraints for their assemblies" ON "public"."test_assembly_constraints" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."test_assemblies"
  WHERE (("test_assemblies"."id" = "test_assembly_constraints"."test_id") AND (("test_assemblies"."created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))));



CREATE POLICY "Users can read criteria for accessible rubrics" ON "public"."rubric_criteria" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rubrics"
  WHERE ("rubrics"."id" = "rubric_criteria"."rubric_id"))));



CREATE POLICY "Users can read own test exports" ON "public"."test_exports" FOR SELECT TO "authenticated" USING ((("exported_by" = ("auth"."uid"())::"text") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Users can read their distribution logs" ON "public"."test_distribution_logs" FOR SELECT TO "authenticated" USING ((("distributed_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Users can read their own activity" ON "public"."activity_log" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read their own analytics" ON "public"."user_analytics" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read their test assemblies" ON "public"."test_assemblies" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Users can update competencies of their TOS" ON "public"."learning_competencies" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tos_entries"
  WHERE (("tos_entries"."id" = "learning_competencies"."tos_id") AND ("tos_entries"."owner" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tos_entries"
  WHERE (("tos_entries"."id" = "learning_competencies"."tos_id") AND ("tos_entries"."owner" = "auth"."uid"())))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own conversations" ON "public"."ai_conversations" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own drafts" ON "public"."user_drafts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their presence" ON "public"."document_presence" FOR UPDATE TO "authenticated" USING (("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update their test assemblies" ON "public"."test_assemblies" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can view collaborations they're part of" ON "public"."document_collaborators" FOR SELECT TO "authenticated" USING ((("user_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Users can view collaborations they're part of" ON "public"."tos_collaborators" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own conversations" ON "public"."ai_conversations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own drafts" ON "public"."user_drafts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their review requests" ON "public"."review_requests" FOR SELECT TO "authenticated" USING ((("requested_by" = "auth"."uid"()) OR ("assigned_to" = "auth"."uid"())));



CREATE POLICY "Users manage own settings" ON "public"."user_settings" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Validators and admins can view validations" ON "public"."classification_validations" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Validators can create validations" ON "public"."classification_validations" FOR INSERT TO "authenticated" WITH CHECK (("validator_id" = "auth"."uid"()));



ALTER TABLE "public"."academic_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."academic_specializations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."academic_subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."academic_topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "academic_topics_delete_admin" ON "public"."academic_topics" FOR DELETE TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "academic_topics_insert_admin" ON "public"."academic_topics" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "academic_topics_read" ON "public"."academic_topics" FOR SELECT TO "authenticated" USING ((("approved" = true) OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "academic_topics_update_admin" ON "public"."academic_topics" FOR UPDATE TO "authenticated" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_generation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assembly_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classification_validations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collaboration_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete_generated_tests" ON "public"."generated_tests" FOR DELETE TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "delete_own_tos" ON "public"."tos_entries" FOR DELETE USING ("public"."can_access_tos"("owner"));



ALTER TABLE "public"."department_officers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."educational_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_tests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_generated_tests" ON "public"."generated_tests" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "insert_own_tos" ON "public"."tos_entries" FOR INSERT WITH CHECK (("owner" = "auth"."uid"()));



ALTER TABLE "public"."learning_competencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_benchmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."psychometric_analyses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quality_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quality_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_similarities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rubric_criteria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rubric_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rubrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_generated_tests" ON "public"."generated_tests" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "select_own_tos" ON "public"."tos_entries" FOR SELECT USING ("public"."can_access_tos"("owner"));



CREATE POLICY "select_questions" ON "public"."questions" FOR SELECT TO "authenticated" USING ((("owner" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'teacher'::"public"."app_role") OR (("approved" = true) AND ("deleted" = false))));



CREATE POLICY "select_test_metadata" ON "public"."test_metadata" FOR SELECT TO "authenticated" USING ((("created_by" = ("auth"."uid"())::"text") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "select_test_versions" ON "public"."test_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."test_metadata" "tm"
  WHERE (("tm"."id" = "test_versions"."test_metadata_id") AND (("tm"."created_by" = ("auth"."uid"())::"text") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))));



ALTER TABLE "public"."system_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_assemblies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_assembly_constraints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_distribution_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_equivalence_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_equivalence_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_validations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tos_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tos_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_generated_tests" ON "public"."generated_tests" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "update_own_tos" ON "public"."tos_entries" FOR UPDATE USING ("public"."can_access_tos"("owner")) WITH CHECK ("public"."can_access_tos"("owner"));



CREATE POLICY "update_test_metadata" ON "public"."test_metadata" FOR UPDATE TO "authenticated" USING ((("created_by" = ("auth"."uid"())::"text") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK ((("created_by" = ("auth"."uid"())::"text") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



ALTER TABLE "public"."user_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "validators_admins_insert_validations" ON "public"."test_validations" FOR INSERT WITH CHECK ((("validator_id" = "auth"."uid"()) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'validator'::"public"."app_role"))));



CREATE POLICY "validators_admins_read_all_tests" ON "public"."generated_tests" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'validator'::"public"."app_role")));



CREATE POLICY "validators_admins_read_all_validations" ON "public"."test_validations" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'validator'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."generated_tests" "gt"
  WHERE (("gt"."id" = "test_validations"."generated_test_id") AND ("gt"."created_by" = "auth"."uid"()))))));



CREATE POLICY "validators_read_tos_for_tests" ON "public"."tos_entries" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'validator'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."generated_tests" "gt"
  WHERE ("gt"."tos_id" = "tos_entries"."id")))));



ALTER TABLE "public"."version_security_logs" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "extensions" TO "anon";
GRANT USAGE ON SCHEMA "extensions" TO "authenticated";
GRANT USAGE ON SCHEMA "extensions" TO "service_role";
GRANT ALL ON SCHEMA "extensions" TO "dashboard_user";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "extensions"."grant_pg_cron_access"() FROM "supabase_admin";
GRANT ALL ON FUNCTION "extensions"."grant_pg_cron_access"() TO "supabase_admin" WITH GRANT OPTION;
GRANT ALL ON FUNCTION "extensions"."grant_pg_cron_access"() TO "dashboard_user";
GRANT ALL ON FUNCTION "extensions"."grant_pg_cron_access"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "extensions"."grant_pg_graphql_access"() TO "postgres" WITH GRANT OPTION;



REVOKE ALL ON FUNCTION "extensions"."grant_pg_net_access"() FROM "supabase_admin";
GRANT ALL ON FUNCTION "extensions"."grant_pg_net_access"() TO "supabase_admin" WITH GRANT OPTION;
GRANT ALL ON FUNCTION "extensions"."grant_pg_net_access"() TO "dashboard_user";
GRANT ALL ON FUNCTION "extensions"."grant_pg_net_access"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "extensions"."pgrst_ddl_watch"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "extensions"."pgrst_drop_watch"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "extensions"."set_graphql_placeholder"() TO "postgres" WITH GRANT OPTION;



REVOKE ALL ON FUNCTION "public"."apply_test_validation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_test_validation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_test_validation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_admin_role"("user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_admin_role"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_admin_role"("user_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_default_teacher_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_default_teacher_role"() TO "service_role";
GRANT ALL ON FUNCTION "public"."assign_default_teacher_role"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."assign_user_role"("target_user_id" "uuid", "new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_user_role"("target_user_id" "uuid", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_user_role"("target_user_id" "uuid", "new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_rubric_total_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_rubric_total_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_rubric_total_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_similarity_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_similarity_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_similarity_metrics"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_tos"("tos_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_tos"("tos_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_tos"("tos_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_question_similarity"("p_question_text" "text", "p_topic" "text", "p_bloom_level" "text", "p_threshold" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_question_similarity"("p_question_text" "text", "p_topic" "text", "p_bloom_level" "text", "p_threshold" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_question_similarity"("p_question_text" "text", "p_topic" "text", "p_bloom_level" "text", "p_threshold" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_old_presence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_presence"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_old_presence"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."enforce_test_draft_edit_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_test_draft_edit_lock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_available_test_versions"("p_parent_test_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_available_test_versions"("p_parent_test_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_test_versions"("p_parent_test_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_question_stats"("user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_question_stats"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_question_stats"("user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_validation_statistics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_validation_statistics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_validation_statistics"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_usage_count"("question_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_usage_count"("question_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_usage_count"("question_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_document_collaborator"("p_document_id" "text", "p_document_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_document_collaborator"("p_document_id" "text", "p_document_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_document_collaborator"("p_document_id" "text", "p_document_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_teacher_or_admin"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_teacher_or_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_teacher_or_admin"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_tos_collaborator"("p_tos_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_tos_collaborator"("p_tos_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tos_collaborator"("p_tos_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_tos_owner"("p_tos_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_tos_owner"("p_tos_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tos_owner"("p_tos_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_classification_metric"("p_question_id" "uuid", "p_confidence" numeric, "p_cognitive_level" "text", "p_response_time_ms" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_classification_metric"("p_question_id" "uuid", "p_confidence" numeric, "p_cognitive_level" "text", "p_response_time_ms" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_classification_metric"("p_question_id" "uuid", "p_confidence" numeric, "p_cognitive_level" "text", "p_response_time_ms" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_question_used"("p_question_id" "uuid", "p_test_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_question_used"("p_question_id" "uuid", "p_test_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_question_used"("p_question_id" "uuid", "p_test_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_question_similarities"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_question_similarities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_question_similarities"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_topic_for_subject"("p_subject_id" "uuid", "p_candidate" "text", "p_min_similarity" real) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_topic_for_subject"("p_subject_id" "uuid", "p_candidate" "text", "p_min_similarity" real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_topic_for_subject"("p_subject_id" "uuid", "p_candidate" "text", "p_min_similarity" real) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_approval_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_approval_fields"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_approval_fields"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_approval_metadata"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_approval_metadata"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_approval_metadata"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_profile_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."touch_academic_topics_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_academic_topics_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_academic_topics_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_similarity_recalculation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_similarity_recalculation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."trigger_similarity_recalculation"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_approval_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_approval_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_approval_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_question_search_vector"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_question_search_vector"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_question_search_vector"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_test_metadata_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_test_metadata_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_test_metadata_updated_at"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_validation_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_validation_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_validation_timestamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_tos_exists"("p_tos_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_tos_exists"("p_tos_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_tos_exists"("p_tos_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_version_balance"("p_parent_test_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_version_balance"("p_parent_test_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_version_balance"("p_parent_test_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."academic_categories" TO "anon";
GRANT ALL ON TABLE "public"."academic_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_categories" TO "service_role";



GRANT ALL ON TABLE "public"."academic_specializations" TO "anon";
GRANT ALL ON TABLE "public"."academic_specializations" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_specializations" TO "service_role";



GRANT ALL ON TABLE "public"."academic_subjects" TO "anon";
GRANT ALL ON TABLE "public"."academic_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_subjects" TO "service_role";



GRANT ALL ON TABLE "public"."academic_topics" TO "anon";
GRANT ALL ON TABLE "public"."academic_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_topics" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generation_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_generation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."assembly_versions" TO "anon";
GRANT ALL ON TABLE "public"."assembly_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."assembly_versions" TO "service_role";



GRANT ALL ON TABLE "public"."classification_validations" TO "anon";
GRANT ALL ON TABLE "public"."classification_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."classification_validations" TO "service_role";



GRANT ALL ON TABLE "public"."collaboration_messages" TO "anon";
GRANT ALL ON TABLE "public"."collaboration_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."collaboration_messages" TO "service_role";



GRANT ALL ON TABLE "public"."department_officers" TO "anon";
GRANT ALL ON TABLE "public"."department_officers" TO "authenticated";
GRANT ALL ON TABLE "public"."department_officers" TO "service_role";



GRANT ALL ON TABLE "public"."document_activity" TO "anon";
GRANT ALL ON TABLE "public"."document_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."document_activity" TO "service_role";



GRANT ALL ON TABLE "public"."document_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."document_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."document_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."document_presence" TO "anon";
GRANT ALL ON TABLE "public"."document_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."document_presence" TO "service_role";



GRANT ALL ON TABLE "public"."educational_standards" TO "anon";
GRANT ALL ON TABLE "public"."educational_standards" TO "authenticated";
GRANT ALL ON TABLE "public"."educational_standards" TO "service_role";



GRANT ALL ON TABLE "public"."generated_tests" TO "anon";
GRANT ALL ON TABLE "public"."generated_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_tests" TO "service_role";



GRANT ALL ON TABLE "public"."learning_competencies" TO "anon";
GRANT ALL ON TABLE "public"."learning_competencies" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_competencies" TO "service_role";



GRANT ALL ON TABLE "public"."performance_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."performance_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_benchmarks" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."psychometric_analyses" TO "anon";
GRANT ALL ON TABLE "public"."psychometric_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."psychometric_analyses" TO "service_role";



GRANT ALL ON TABLE "public"."quality_assessments" TO "anon";
GRANT ALL ON TABLE "public"."quality_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."quality_metrics" TO "anon";
GRANT ALL ON TABLE "public"."quality_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."question_similarities" TO "anon";
GRANT ALL ON TABLE "public"."question_similarities" TO "authenticated";
GRANT ALL ON TABLE "public"."question_similarities" TO "service_role";



GRANT ALL ON TABLE "public"."question_standards" TO "anon";
GRANT ALL ON TABLE "public"."question_standards" TO "authenticated";
GRANT ALL ON TABLE "public"."question_standards" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."review_requests" TO "anon";
GRANT ALL ON TABLE "public"."review_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."review_requests" TO "service_role";



GRANT ALL ON TABLE "public"."rubric_criteria" TO "anon";
GRANT ALL ON TABLE "public"."rubric_criteria" TO "authenticated";
GRANT ALL ON TABLE "public"."rubric_criteria" TO "service_role";



GRANT ALL ON TABLE "public"."rubric_scores" TO "anon";
GRANT ALL ON TABLE "public"."rubric_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."rubric_scores" TO "service_role";



GRANT ALL ON TABLE "public"."rubrics" TO "anon";
GRANT ALL ON TABLE "public"."rubrics" TO "authenticated";
GRANT ALL ON TABLE "public"."rubrics" TO "service_role";



GRANT ALL ON TABLE "public"."system_metrics" TO "anon";
GRANT ALL ON TABLE "public"."system_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."system_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."test_assemblies" TO "anon";
GRANT ALL ON TABLE "public"."test_assemblies" TO "authenticated";
GRANT ALL ON TABLE "public"."test_assemblies" TO "service_role";



GRANT ALL ON TABLE "public"."test_assembly_constraints" TO "anon";
GRANT ALL ON TABLE "public"."test_assembly_constraints" TO "authenticated";
GRANT ALL ON TABLE "public"."test_assembly_constraints" TO "service_role";



GRANT ALL ON TABLE "public"."test_assignments" TO "anon";
GRANT ALL ON TABLE "public"."test_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."test_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."test_distribution_logs" TO "anon";
GRANT ALL ON TABLE "public"."test_distribution_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."test_distribution_logs" TO "service_role";



GRANT ALL ON TABLE "public"."test_equivalence_groups" TO "anon";
GRANT ALL ON TABLE "public"."test_equivalence_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."test_equivalence_groups" TO "service_role";



GRANT ALL ON TABLE "public"."test_equivalence_members" TO "anon";
GRANT ALL ON TABLE "public"."test_equivalence_members" TO "authenticated";
GRANT ALL ON TABLE "public"."test_equivalence_members" TO "service_role";



GRANT ALL ON TABLE "public"."test_exports" TO "anon";
GRANT ALL ON TABLE "public"."test_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."test_exports" TO "service_role";



GRANT ALL ON TABLE "public"."test_metadata" TO "anon";
GRANT ALL ON TABLE "public"."test_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."test_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."test_validations" TO "anon";
GRANT ALL ON TABLE "public"."test_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."test_validations" TO "service_role";



GRANT ALL ON TABLE "public"."test_versions" TO "anon";
GRANT ALL ON TABLE "public"."test_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."test_versions" TO "service_role";



GRANT ALL ON TABLE "public"."tos_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."tos_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."tos_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."tos_entries" TO "anon";
GRANT ALL ON TABLE "public"."tos_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."tos_entries" TO "service_role";



GRANT ALL ON TABLE "public"."user_analytics" TO "anon";
GRANT ALL ON TABLE "public"."user_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."user_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."user_drafts" TO "anon";
GRANT ALL ON TABLE "public"."user_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."version_security_logs" TO "anon";
GRANT ALL ON TABLE "public"."version_security_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."version_security_logs" TO "service_role";












ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






