

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


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "public"."agent_action_risk" AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE "public"."agent_action_risk" OWNER TO "postgres";


CREATE TYPE "public"."agent_action_status" AS ENUM (
    'proposed',
    'awaiting_approval',
    'approved',
    'rejected',
    'executing',
    'succeeded',
    'failed',
    'canceled'
);


ALTER TYPE "public"."agent_action_status" OWNER TO "postgres";


CREATE TYPE "public"."agent_job_kind" AS ENUM (
    'notify_discord',
    'analyze_request',
    'create_issue_pr',
    'run_checks',
    'apply_fix'
);


ALTER TYPE "public"."agent_job_kind" OWNER TO "postgres";


CREATE TYPE "public"."agent_job_status" AS ENUM (
    'queued',
    'running',
    'succeeded',
    'failed',
    'canceled',
    'dead'
);


ALTER TYPE "public"."agent_job_status" OWNER TO "postgres";


CREATE TYPE "public"."agent_message_direction" AS ENUM (
    'to_agent',
    'to_user'
);


ALTER TYPE "public"."agent_message_direction" OWNER TO "postgres";


CREATE TYPE "public"."agent_request_intent" AS ENUM (
    'feature_request',
    'bug_report',
    'inspection_catalog_add',
    'service_catalog_add',
    'refactor'
);


ALTER TYPE "public"."agent_request_intent" OWNER TO "postgres";


CREATE TYPE "public"."agent_request_status" AS ENUM (
    'submitted',
    'in_progress',
    'awaiting_approval',
    'approved',
    'rejected',
    'failed',
    'merged'
);


ALTER TYPE "public"."agent_request_status" OWNER TO "postgres";


CREATE TYPE "public"."ai_training_source" AS ENUM (
    'quote',
    'appointment',
    'inspection',
    'work_order',
    'customer',
    'vehicle'
);


ALTER TYPE "public"."ai_training_source" OWNER TO "postgres";


CREATE TYPE "public"."analytics_event_type" AS ENUM (
    'impression',
    'view',
    'click',
    'like',
    'comment',
    'share',
    'save',
    'watch_time',
    'engagement',
    'rank',
    'lead',
    'other'
);


ALTER TYPE "public"."analytics_event_type" OWNER TO "postgres";


CREATE TYPE "public"."content_asset_type" AS ENUM (
    'image',
    'video',
    'audio',
    'document',
    'thumbnail',
    'other'
);


ALTER TYPE "public"."content_asset_type" OWNER TO "postgres";


CREATE TYPE "public"."content_piece_type" AS ENUM (
    'idea',
    'hook',
    'title',
    'caption',
    'script',
    'voiceover',
    'blog',
    'seo_meta',
    'cta',
    'hashtags',
    'faq',
    'platform_copy'
);


ALTER TYPE "public"."content_piece_type" OWNER TO "postgres";


CREATE TYPE "public"."content_source_type" AS ENUM (
    'inspection',
    'inspection_item',
    'work_order',
    'work_order_line',
    'vehicle_media',
    'manual',
    'other'
);


ALTER TYPE "public"."content_source_type" OWNER TO "postgres";


CREATE TYPE "public"."content_status" AS ENUM (
    'draft',
    'queued',
    'processing',
    'ready',
    'published',
    'failed',
    'archived'
);


ALTER TYPE "public"."content_status" OWNER TO "postgres";


CREATE TYPE "public"."content_type" AS ENUM (
    'workflow_demo',
    'repair_story',
    'inspection_highlight',
    'before_after',
    'educational_tip',
    'how_to',
    'findings_on_vehicle',
    'blog_post',
    'faq',
    'google_business_post',
    'email_snippet',
    'social_post'
);


ALTER TYPE "public"."content_type" OWNER TO "postgres";


CREATE TYPE "public"."fitment_event_type" AS ENUM (
    'allocated',
    'consumed'
);


ALTER TYPE "public"."fitment_event_type" OWNER TO "postgres";


CREATE TYPE "public"."fleet_program_cadence" AS ENUM (
    'monthly',
    'quarterly',
    'mileage_based',
    'hours_based'
);


ALTER TYPE "public"."fleet_program_cadence" OWNER TO "postgres";


CREATE TYPE "public"."inspection_item_status" AS ENUM (
    'ok',
    'fail',
    'na',
    'recommend'
);


ALTER TYPE "public"."inspection_item_status" OWNER TO "postgres";


CREATE TYPE "public"."inspection_status" AS ENUM (
    'new',
    'in_progress',
    'paused',
    'completed',
    'aborted'
);


ALTER TYPE "public"."inspection_status" OWNER TO "postgres";


CREATE TYPE "public"."job_type_enum" AS ENUM (
    'diagnosis',
    'inspection',
    'maintenance',
    'repair'
);


ALTER TYPE "public"."job_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."part_request_item_status" AS ENUM (
    'requested',
    'quoted',
    'awaiting_customer_approval',
    'approved',
    'reserved',
    'picking',
    'picked',
    'ordered',
    'partially_received',
    'received',
    'consumed',
    'cancelled'
);


ALTER TYPE "public"."part_request_item_status" OWNER TO "postgres";


CREATE TYPE "public"."part_request_status" AS ENUM (
    'requested',
    'quoted',
    'approved',
    'fulfilled',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."part_request_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_t" AS ENUM (
    'free',
    'diy',
    'pro',
    'pro_plus'
);


ALTER TYPE "public"."plan_t" OWNER TO "postgres";


CREATE TYPE "public"."publication_status" AS ENUM (
    'draft',
    'queued',
    'publishing',
    'published',
    'failed',
    'skipped'
);


ALTER TYPE "public"."publication_status" OWNER TO "postgres";


CREATE TYPE "public"."publish_platform" AS ENUM (
    'instagram_reels',
    'facebook',
    'youtube_shorts',
    'tiktok',
    'blog',
    'linkedin',
    'google_business',
    'email'
);


ALTER TYPE "public"."publish_platform" OWNER TO "postgres";


CREATE TYPE "public"."punch_event_type" AS ENUM (
    'start',
    'break_start',
    'break_end',
    'lunch_start',
    'lunch_end',
    'end'
);


ALTER TYPE "public"."punch_event_type" OWNER TO "postgres";


CREATE TYPE "public"."quote_request_status" AS ENUM (
    'pending',
    'in_progress',
    'done'
);


ALTER TYPE "public"."quote_request_status" OWNER TO "postgres";


CREATE TYPE "public"."shift_status" AS ENUM (
    'active',
    'ended'
);


ALTER TYPE "public"."shift_status" OWNER TO "postgres";


CREATE TYPE "public"."stock_move_reason" AS ENUM (
    'receive',
    'adjust',
    'consume',
    'return',
    'transfer_out',
    'transfer_in',
    'wo_allocate',
    'wo_release',
    'seed'
);


ALTER TYPE "public"."stock_move_reason" OWNER TO "postgres";


CREATE TYPE "public"."user_role_enum" AS ENUM (
    'owner',
    'admin',
    'manager',
    'mechanic',
    'advisor',
    'parts',
    'customer',
    'driver',
    'dispatcher',
    'fleet_manager'
);


ALTER TYPE "public"."user_role_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.work_orders wo
    join public.profiles p on p.id = auth.uid()
    where wo.id = _wo
      and wo.shop_id = p.shop_id
  );
$$;


ALTER FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_repair_line_from_vehicle_service"("p_work_order_id" "uuid", "p_vehicle_year" integer, "p_vehicle_make" "text", "p_vehicle_model" "text", "p_engine_family" "text", "p_service_code" "text", "p_qty" numeric DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_shop_id uuid;
  v_menu_item_id uuid;
  v_line_id uuid;
  v_menu record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve shop from work order
  SELECT wo.shop_id
    INTO v_shop_id
  FROM public.work_orders wo
  WHERE wo.id = p_work_order_id;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'work_order % has no shop_id', p_work_order_id;
  END IF;

  -- Find the mapped menu item for this shop + YMM + service_code
  v_menu_item_id := public.find_menu_item_for_vehicle_service(
    v_shop_id,
    p_vehicle_year,
    p_vehicle_make,
    p_vehicle_model,
    p_engine_family,
    p_service_code
  );

  IF v_menu_item_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_menu_item',
      'detail', 'No mapped menu item exists for this YMM/service in this shop',
      'shop_id', v_shop_id
    );
  END IF;

  SELECT
    mi.id,
    mi.name,
    mi.description,
    mi.labor_time,
    mi.total_price,
    mi.inspection_template_id
  INTO v_menu
  FROM public.menu_items mi
  WHERE mi.id = v_menu_item_id;

  -- Insert work order line as waiting for approval
  INSERT INTO public.work_order_lines (
    work_order_id,
    description,
    notes,
    labor_time,
    price_estimate,
    status,
    menu_item_id,
    template_id,
    qty
  )
  VALUES (
    p_work_order_id,
    v_menu.name,
    COALESCE(v_menu.description, NULL),
    v_menu.labor_time,
    v_menu.total_price,
    'waiting_for_approval',
    v_menu.id,
    v_menu.inspection_template_id,
    COALESCE(NULLIF(p_qty, 0), 1)
  )
  RETURNING id INTO v_line_id;

  RETURN jsonb_build_object(
    'ok', true,
    'work_order_id', p_work_order_id,
    'shop_id', v_shop_id,
    'work_order_line_id', v_line_id,
    'menu_item_id', v_menu_item_id,
    'status', 'waiting_for_approval'
  );
END;
$$;


ALTER FUNCTION "public"."add_repair_line_from_vehicle_service"("p_work_order_id" "uuid", "p_vehicle_year" integer, "p_vehicle_make" "text", "p_vehicle_model" "text", "p_engine_family" "text", "p_service_code" "text", "p_qty" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "risk" "public"."agent_action_risk" DEFAULT 'low'::"public"."agent_action_risk" NOT NULL,
    "summary" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "requires_approval" boolean DEFAULT true NOT NULL,
    "status" "public"."agent_action_status" DEFAULT 'proposed'::"public"."agent_action_status" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejected_reason" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 10 NOT NULL,
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "result" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_actions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_approve_action"("p_action_id" "uuid", "p_approved_by" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."agent_actions"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  a public.agent_actions;
BEGIN
  UPDATE public.agent_actions
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now(),
      rejected_by = NULL,
      rejected_at = NULL,
      rejected_reason = NULL
  WHERE id = p_action_id
  RETURNING * INTO a;

  RETURN a;
END;
$$;


ALTER FUNCTION "public"."agent_approve_action"("p_action_id" "uuid", "p_approved_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_can_start"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((
    select now() - max(created_at) > interval '3 seconds'
    from agent_runs
    where user_id = auth.uid()
  ), true);
$$;


ALTER FUNCTION "public"."agent_can_start"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid",
    "kind" "public"."agent_job_kind" NOT NULL,
    "status" "public"."agent_job_status" DEFAULT 'queued'::"public"."agent_job_status" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 12 NOT NULL,
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_by" "text",
    "locked_at" timestamp with time zone,
    "heartbeat_at" timestamp with time zone,
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "logs_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[] DEFAULT NULL::"public"."agent_job_kind"[]) RETURNS "public"."agent_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  j public.agent_jobs;
BEGIN
  SELECT *
  INTO j
  FROM public.agent_jobs
  WHERE status = 'queued'
    AND run_after <= now()
    AND (kinds IS NULL OR kind = ANY(kinds))
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.agent_jobs
  SET status = 'running',
      locked_at = now(),
      locked_by = worker_id
  WHERE id = j.id;

  SELECT * INTO j FROM public.agent_jobs WHERE id = j.id;
  RETURN j;
END;
$$;


ALTER FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "direction" "public"."agent_message_direction" NOT NULL,
    "kind" "text" NOT NULL,
    "body" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 50 NOT NULL,
    "claimed_at" timestamp with time zone,
    "claimed_by" "text",
    "processed_at" timestamp with time zone,
    "processed_by" "text",
    "last_error" "text",
    "last_error_at" timestamp with time zone
);


ALTER TABLE "public"."agent_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_claim_next_message"("worker_id" "text", "kinds" "text"[] DEFAULT NULL::"text"[]) RETURNS "public"."agent_messages"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  m public.agent_messages;
BEGIN
  SELECT *
  INTO m
  FROM public.agent_messages
  WHERE direction = to_agent
    AND processed_at IS NULL
    AND run_after <= now()
    AND (kinds IS NULL OR kind = ANY(kinds))
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.agent_messages
  SET claimed_at = now(),
      claimed_by = worker_id
  WHERE id = m.id;

  SELECT * INTO m FROM public.agent_messages WHERE id = m.id;
  RETURN m;
END;
$$;


ALTER FUNCTION "public"."agent_claim_next_message"("worker_id" "text", "kinds" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_create_action"("p_request_id" "uuid", "p_kind" "text", "p_risk" "public"."agent_action_risk", "p_summary" "text", "p_payload" "jsonb", "p_requires_approval" boolean) RETURNS "public"."agent_actions"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  inserted public.agent_actions;
  v_status public.agent_action_status;
BEGIN
  v_status :=
    CASE
      WHEN p_requires_approval THEN 'awaiting_approval'::public.agent_action_status
      ELSE 'approved'::public.agent_action_status
    END;

  INSERT INTO public.agent_actions (
    request_id,
    kind,
    risk,
    summary,
    payload,
    requires_approval,
    status
  )
  VALUES (
    p_request_id,
    p_kind,
    p_risk,
    p_summary,
    COALESCE(p_payload, '{}'::jsonb),
    p_requires_approval,
    v_status
  )
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;


ALTER FUNCTION "public"."agent_create_action"("p_request_id" "uuid", "p_kind" "text", "p_risk" "public"."agent_action_risk", "p_summary" "text", "p_payload" "jsonb", "p_requires_approval" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_job_heartbeat"("job_id" "uuid", "worker_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.agent_jobs
  set heartbeat_at = now(),
      locked_by = worker_id,
      locked_at = coalesce(locked_at, now()),
      updated_at = now()
  where id = job_id
    and status = 'running';
end;
$$;


ALTER FUNCTION "public"."agent_job_heartbeat"("job_id" "uuid", "worker_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_mark_job_canceled"("job_id" "uuid", "reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.agent_jobs
  SET status = 'canceled',
      locked_at = NULL,
      locked_by = NULL,
      last_error = COALESCE(reason, last_error)
  WHERE id = job_id;
END;
$$;


ALTER FUNCTION "public"."agent_mark_job_canceled"("job_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_mark_job_failed"("job_id" "uuid", "err" "text", "retry_in_seconds" integer DEFAULT 30) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  a integer;
  m integer;
BEGIN
  SELECT attempts, max_attempts INTO a, m
  FROM public.agent_jobs WHERE id = job_id;

  a := COALESCE(a, 0) + 1;
  m := COALESCE(m, 25);

  IF a >= m THEN
    UPDATE public.agent_jobs
    SET status = 'failed',
        attempts = a,
        last_error = err,
        locked_at = NULL,
        locked_by = NULL
    WHERE id = job_id;
  ELSE
    UPDATE public.agent_jobs
    SET status = 'queued',
        attempts = a,
        last_error = err,
        locked_at = NULL,
        locked_by = NULL,
        run_after = now() + make_interval(secs => GREATEST(5, retry_in_seconds))
    WHERE id = job_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."agent_mark_job_failed"("job_id" "uuid", "err" "text", "retry_in_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_mark_job_succeeded"("job_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.agent_jobs
  SET status = 'succeeded',
      locked_at = NULL,
      locked_by = NULL,
      last_error = NULL
  WHERE id = job_id;
END;
$$;


ALTER FUNCTION "public"."agent_mark_job_succeeded"("job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_mark_message_failed"("message_id" "uuid", "err" "text", "retry_in_seconds" integer DEFAULT 30) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  a integer;
  m integer;
begin
  select attempts, max_attempts into a, m
  from public.agent_messages
  where id = message_id;

  a := coalesce(a, 0) + 1;
  m := coalesce(m, 50);

  if a >= m then
    update public.agent_messages
    set attempts = a,
        last_error = err,
        last_error_at = now(),
        processed_at = now(),
        processed_by = 'failed'
    where id = message_id;
  else
    update public.agent_messages
    set attempts = a,
        last_error = err,
        last_error_at = now(),
        run_after = now() + make_interval(secs => greatest(5, retry_in_seconds))
    where id = message_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."agent_mark_message_failed"("message_id" "uuid", "err" "text", "retry_in_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_mark_message_succeeded"("message_id" "uuid", "processed_by_in" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.agent_messages
  SET processed_at = now(),
      processed_by = COALESCE(processed_by_in, processed_by),
      last_error = NULL,
      last_error_at = NULL
  WHERE id = message_id;
END;
$$;


ALTER FUNCTION "public"."agent_mark_message_succeeded"("message_id" "uuid", "processed_by_in" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_reject_action"("p_action_id" "uuid", "p_rejected_by" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."agent_actions"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  a public.agent_actions;
BEGIN
  UPDATE public.agent_actions
  SET status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = now(),
      rejected_reason = p_reason
  WHERE id = p_action_id
  RETURNING * INTO a;

  RETURN a;
END;
$$;


ALTER FUNCTION "public"."agent_reject_action"("p_action_id" "uuid", "p_rejected_by" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_generate_training_row"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into ai_training_data(shop_id, source_event_id, content)
  values(
    new.shop_id,
    new.id,
    new.payload::text
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."ai_generate_training_row"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_moves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qty_change" numeric(12,2) NOT NULL,
    "reason" "public"."stock_move_reason" NOT NULL,
    "reference_kind" "text",
    "reference_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "shop_id" "uuid" NOT NULL
);


ALTER TABLE "public"."stock_moves" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") RETURNS "public"."stock_moves"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row  public.stock_moves;
  v_shop uuid;
  v_user uuid := auth.uid();
BEGIN
  -- Resolve shop from the location to guarantee consistency
  SELECT shop_id INTO v_shop FROM public.stock_locations WHERE id = p_loc;
  IF v_shop IS NULL THEN
    RAISE EXCEPTION 'Invalid location_id (no shop found): %', p_loc;
  END IF;

  INSERT INTO public.stock_moves (
    id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_at,
    created_by,
    shop_id
  )
  VALUES (
    gen_random_uuid(),
    p_part,
    p_loc,
    p_qty,
    p_reason::public.stock_move_reason,  -- << enum cast is the key fix
    p_ref_kind,                          -- note: reference_kind (not ref_kind)
    p_ref_id,
    now(),
    v_user,
    v_shop
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_stock_move_to_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.part_stock (part_id, location_id, qty_on_hand, qty_reserved)
  values (new.part_id, new.location_id, new.qty_change, 0)
  on conflict (part_id, location_id)
  do update set qty_on_hand = public.part_stock.qty_on_hand + excluded.qty_on_hand;
  return new;
end;
$$;


ALTER FUNCTION "public"."apply_stock_move_to_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[] DEFAULT NULL::"uuid"[], "_decline_unchecked" boolean DEFAULT true, "_approver" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  _now timestamptz := now();
  _approved_count int;
  _pending_remaining int;
  _total_pending int;
begin
  if not public._ensure_same_shop(_wo) then
    raise exception 'Not permitted for this work order';
  end if;

  -- Approve selected lines: set approval + make ready for tech
  update public.work_order_lines
     set approval_state = 'approved',
         approval_at    = _now,
         approval_by    = coalesce(_approver, auth.uid()),
         status         = 'awaiting',      -- ✅ becomes ready/next up for tech
         hold_reason    = null
   where work_order_id = _wo
     and id = any(_approved_ids);

  get diagnostics _approved_count = row_count;

  -- Decline explicit list (if provided)
  if _declined_ids is not null then
    update public.work_order_lines
       set approval_state = 'declined',
           approval_at    = _now,
           approval_by    = coalesce(_approver, auth.uid()),
           status         = 'on_hold',
           hold_reason    = 'declined by customer'
     where work_order_id = _wo
       and id = any(_declined_ids);
  end if;

  -- Optionally decline any remaining pending lines not approved
  if _decline_unchecked then
    update public.work_order_lines
       set approval_state = 'declined',
           approval_at    = _now,
           approval_by    = coalesce(_approver, auth.uid()),
           status         = 'on_hold',
           hold_reason    = 'declined by customer'
     where work_order_id = _wo
       and approval_state = 'pending'
       and (id <> all(_approved_ids));  -- all pending except approved
  end if;

  -- WO roll-up: approved/partial/declined
  select
    sum((approval_state = 'pending')::int),
    sum((approval_state = 'approved')::int)
  into _pending_remaining, _approved_count
  from public.work_order_lines
  where work_order_id = _wo;

  if _approved_count > 0 then
    -- at least one approved
    update public.work_orders
       set approval_state = case when _pending_remaining > 0 then 'partial' else 'approved' end,
           status = 'queued'  -- or 'awaiting' if you prefer
     where id = _wo;
  else
    -- none approved; all declined or still pending (rare)
    update public.work_orders
       set approval_state = case when _pending_remaining > 0 then 'pending' else 'declined' end,
           status = case when _pending_remaining > 0 then status else 'on_hold' end
     where id = _wo;
  end if;
end;
$$;


ALTER FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_default_shop"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- if shop_id is missing, copy the shop_id of the creator (assuming created_by column exists)
  if new.shop_id is null and new.created_by is not null then
    select shop_id into new.shop_id
    from public.profiles
    where id = new.created_by;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_default_shop"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_unassigned_lines"("wo_id" "uuid", "tech_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update work_order_lines
  set assigned_to = tech_id
  where work_order_id = wo_id
    and assigned_to is null;
end;
$$;


ALTER FUNCTION "public"."assign_unassigned_lines"("wo_id" "uuid", "tech_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_wol_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_shop uuid;
BEGIN
  IF NEW.shop_id IS NULL THEN
    -- Always inherit from the parent work order
    SELECT wo.shop_id INTO v_shop
    FROM public.work_orders wo
    WHERE wo.id = NEW.work_order_id;

    NEW.shop_id := v_shop;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_wol_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_work_orders_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.shop_id IS NULL THEN
    NEW.shop_id := public.current_shop_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_work_orders_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_release_line"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.parts_required IS NOT NULL AND NEW.parts_received IS NOT NULL THEN
    IF NEW.parts_required <@ NEW.parts_received THEN
      NEW.line_status := 'ready';
      NEW.on_hold_since := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_release_line"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_chat_messages"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Only care about rows that actually belong to a conversation
  if new.conversation_id is null then
    return new;
  end if;

  -- Topic: room:<conversation_id>:messages
  perform realtime.broadcast_changes(
    'room:' || new.conversation_id::text || ':messages', -- topic
    tg_op,                 -- event name: 'INSERT' | 'UPDATE' | 'DELETE'
    tg_op,                 -- operation
    tg_table_name,         -- table
    tg_table_schema,       -- schema
    new,                   -- new record
    old                    -- old record (if UPDATE/DELETE)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."broadcast_chat_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_profile_last_active_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      UPDATE public.profiles
      SET last_active_at = NOW()
      WHERE id = NEW.sender_id;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."bump_profile_last_active_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles owner_p
    join public.profiles target_p
      on target_p.id = target_profile_id
    where owner_p.id = auth.uid()
      and owner_p.role = 'owner'
      and owner_p.shop_id is not null
      and owner_p.shop_id = target_p.shop_id
  );
$$;


ALTER FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_work_order"("p_work_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.work_orders wo
    JOIN public.profiles me
      ON me.shop_id = wo.shop_id
     AND me.id = (SELECT auth.uid())
    WHERE wo.id = p_work_order_id
  );
$$;


ALTER FUNCTION "public"."can_view_work_order"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_participants_key"("_sender" "uuid", "_recipients" "uuid"[]) RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select array_to_string(
           (select array_agg(distinct x order by x)
              from unnest( coalesce(_recipients, '{}'::uuid[]) || coalesce(_sender, '00000000-0000-0000-0000-000000000000'::uuid) ) as x),
           ','
         );
$$;


ALTER FUNCTION "public"."chat_participants_key"("_sender" "uuid", "_recipients" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."chat_participants_key"("_sender" "uuid", "_recipients" "uuid"[]) IS 'Create a deterministic, sorted participants key from sender + recipients.';



CREATE OR REPLACE FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  new_chat_id uuid;
begin
  -- if no chat id provided, create a new one
  new_chat_id := coalesce(_chat_id, gen_random_uuid());

  insert into chats (id, created_at)
  values (new_chat_id, now())
  on conflict (id) do nothing;

  insert into messages (id, chat_id, sender_id, recipients, content)
  values (gen_random_uuid(), new_chat_id, auth.uid(), _recipients, _content);

  return new_chat_id;
end;
$$;


ALTER FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid") IS 'Post a message as auth.uid(); reuse the newest chat with the same participant set or create a new chat_id. Returns chat_id.';



CREATE OR REPLACE FUNCTION "public"."check_plan_limit"("_feature" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  plan_limit int;
  usage_count int;
begin
  select (features ->> _feature)::int into plan_limit
  from user_plans
  where user_id = auth.uid();

  if plan_limit is null then
    plan_limit := 999999;
  end if;

  select count(*) into usage_count
  from usage_logs
  where user_id = auth.uid()
    and feature = _feature;

  return usage_count < plan_limit;
end;
$$;


ALTER FUNCTION "public"."check_plan_limit"("_feature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_auth"() RETURNS "void"
    LANGUAGE "sql"
    AS $$
  select
    set_config('request.jwt.claim.role', null, true),
    set_config('request.jwt.claim.sub', null, true);
$$;


ALTER FUNCTION "public"."clear_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_labor_cost_for_work_order"("p_work_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  with rate as (
    select coalesce(s.labor_rate,0) as labor_rate
    from public.work_orders wo
    left join public.shops s on s.id = wo.shop_id
    where wo.id = p_work_order_id
    limit 1
  ), hours as (
    select coalesce(sum(coalesce(wol.labor_time,0)),0) as labor_hours
    from public.work_order_lines wol
    where wol.work_order_id = p_work_order_id
  )
  select (select labor_hours from hours) * (select labor_rate from rate);
$$;


ALTER FUNCTION "public"."compute_labor_cost_for_work_order"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_parts_cost_for_work_order"("p_work_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  select
    coalesce(
      sum(
        greatest(
          0,
          (case when coalesce(a.qty,0) > 0 then a.qty else 1 end) * coalesce(a.unit_cost,0)
        )
      ),
      0
    )
  from public.work_order_part_allocations a
  where a.work_order_id = p_work_order_id;
$$;


ALTER FUNCTION "public"."compute_parts_cost_for_work_order"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_timecard_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Only compute when both times are present
  if new.clock_in is not null and new.clock_out is not null then
    if new.clock_out <= new.clock_in then
      raise exception 'clock_out must be after clock_in';
    end if;

    new.hours_worked :=
      extract(epoch from (new.clock_out - new.clock_in)) / 3600.0;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."compute_timecard_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;

  v_shop_id uuid;
  v_location_id uuid;
  v_qty_available_to_consume numeric;
  v_qty_to_consume numeric;

  v_move_id uuid;
begin
  if p_request_item_id is null then
    return;
  end if;

  select
    i.id,
    i.shop_id,
    i.work_order_id,
    i.work_order_line_id,
    i.part_id,
    i.location_id,
    i.qty_approved,
    i.qty_reserved,
    i.qty_received,
    i.qty_consumed,
    i.unit_cost,
    i.status
  into r
  from public.part_request_items i
  where i.id = p_request_item_id;

  if r.id is null then
    return;
  end if;

  if r.part_id is null then
    -- free text item can't consume inventory
    return;
  end if;

  v_shop_id := r.shop_id;
  v_location_id := r.location_id;

  if v_shop_id is null then
    raise exception 'part_request_items.shop_id is required for consume';
  end if;

  if v_location_id is null then
    v_location_id := public.get_default_stock_location(v_shop_id);
  end if;

  if v_location_id is null then
    raise exception 'No stock location available for shop %', v_shop_id;
  end if;

  -- What is available to consume for THIS request item?
  -- We allow consuming up to reserved+received minus already consumed.
  v_qty_available_to_consume :=
    greatest(coalesce(r.qty_reserved,0),0)
    + greatest(coalesce(r.qty_received,0),0)
    - greatest(coalesce(r.qty_consumed,0),0);

  v_qty_to_consume := greatest(v_qty_available_to_consume, 0);

  if v_qty_to_consume <= 0 then
    return;
  end if;

  -- Create stock move (consume = negative delta)
  -- If it already exists due to retries, do nothing.
  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by
  )
  values (
    v_shop_id,
    r.part_id,
    v_location_id,
    -v_qty_to_consume,
    'consume',
    'part_request_item',
    r.id,
    auth.uid()
  )
  on conflict do nothing
  returning id into v_move_id;

  -- Create allocation record (source_request_item_id unique)
  -- qty = qty_to_consume
  insert into public.work_order_part_allocations (
    shop_id,
    work_order_id,
    work_order_line_id,
    part_id,
    location_id,
    qty,
    unit_cost,
    stock_move_id,
    source_request_item_id
  )
  values (
    v_shop_id,
    r.work_order_id,
    r.work_order_line_id,
    r.part_id,
    v_location_id,
    v_qty_to_consume,
    coalesce(r.unit_cost, 0),
    v_move_id,
    r.id
  )
  on conflict (source_request_item_id)
  do update set
    qty = excluded.qty,
    unit_cost = excluded.unit_cost,
    location_id = excluded.location_id,
    stock_move_id = excluded.stock_move_id;

  -- Update qty_consumed and status (consume implies picked->consumed)
  update public.part_request_items
  set
    location_id = v_location_id,
    qty_consumed = greatest(coalesce(qty_consumed,0),0) + v_qty_to_consume,
    status = 'consumed',
    updated_at = now()
  where id = r.id;

  -- After consume, release holds if possible
  if r.work_order_line_id is not null then
    perform public.maybe_release_line_hold_for_parts(r.work_order_line_id);
  end if;
end;
$$;


ALTER FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid", "p_location_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_qty_available_to_consume numeric;
  v_qty_to_consume numeric;
  v_move_id uuid;
begin
  if p_request_item_id is null then
    return;
  end if;

  select
    i.id,
    i.shop_id,
    i.work_order_id,
    i.work_order_line_id,
    i.part_id,
    i.location_id,
    i.qty_approved,
    i.qty_reserved,
    i.qty_received,
    i.qty_consumed,
    i.unit_cost,
    i.status
  into r
  from public.part_request_items i
  where i.id = p_request_item_id;

  if r.id is null then
    return;
  end if;

  if r.part_id is null then
    return;
  end if;

  v_shop_id := r.shop_id;
  v_location_id := coalesce(p_location_id, r.location_id, public.get_default_stock_location(v_shop_id));

  if v_shop_id is null then
    raise exception 'part_request_items.shop_id is required for consume';
  end if;

  if v_location_id is null then
    raise exception 'No stock location available for shop %', v_shop_id;
  end if;

  v_qty_available_to_consume :=
    greatest(coalesce(r.qty_reserved,0),0)
    + greatest(coalesce(r.qty_received,0),0)
    - greatest(coalesce(r.qty_consumed,0),0);

  v_qty_to_consume := greatest(v_qty_available_to_consume, 0);

  if v_qty_to_consume <= 0 then
    return;
  end if;

  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by
  )
  values (
    v_shop_id,
    r.part_id,
    v_location_id,
    -v_qty_to_consume,
    'consume',
    'part_request_item',
    r.id,
    auth.uid()
  )
  on conflict do nothing
  returning id into v_move_id;

  insert into public.work_order_part_allocations (
    shop_id,
    work_order_id,
    work_order_line_id,
    part_id,
    location_id,
    qty,
    unit_cost,
    stock_move_id,
    source_request_item_id
  )
  values (
    v_shop_id,
    r.work_order_id,
    r.work_order_line_id,
    r.part_id,
    v_location_id,
    v_qty_to_consume,
    coalesce(r.unit_cost, 0),
    v_move_id,
    r.id
  )
  on conflict (source_request_item_id)
  do update set
    qty = excluded.qty,
    unit_cost = excluded.unit_cost,
    location_id = excluded.location_id,
    stock_move_id = excluded.stock_move_id;

  update public.part_request_items
  set
    location_id = v_location_id,
    qty_consumed = greatest(coalesce(qty_consumed,0),0) + v_qty_to_consume,
    status = 'consumed',
    updated_at = now()
  where id = r.id;

  if r.work_order_line_id is not null then
    perform public.maybe_release_line_hold_for_parts(r.work_order_line_id);
  end if;
end;
$$;


ALTER FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."conversation_messages_broadcast_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'conversation:' || COALESCE(NEW.conversation_id, OLD.conversation_id)::text || ':messages',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."conversation_messages_broadcast_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_fleet_form_upload"("_path" "text", "_filename" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _id uuid;
BEGIN
  -- make sure we have a logged-in user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'create_fleet_form_upload must be called by an authenticated user';
  END IF;

  INSERT INTO public.fleet_form_uploads (storage_path, original_filename, created_by)
  VALUES (_path, _filename, auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;


ALTER FUNCTION "public"."create_fleet_form_upload"("_path" "text", "_filename" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_part_request"("p_work_order" "uuid", "p_notes" "text", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_req_id uuid;
  v_shop uuid := public.current_shop_id();
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'auth.uid() is NULL. This function requires an authenticated user.' using errcode = '28000';
  end if;
  if v_shop is null then
    raise exception 'current_shop_id() returned NULL. Ensure the user has a profile with shop_id.' using errcode = '23502';
  end if;

  insert into public.part_requests (shop_id, work_order_id, requested_by, notes)
  values (v_shop, p_work_order, v_user, nullif(p_notes,''))
  returning id into v_req_id;

  insert into public.part_request_items (request_id, part_id, description, qty)
  select
    v_req_id,
    nullif(it->>'part_id','')::uuid,
    coalesce(nullif(it->>'description',''), 'Requested Part'),
    coalesce(nullif(it->>'qty','')::numeric, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it;

  return v_req_id;
end $$;


ALTER FUNCTION "public"."create_part_request"("p_work_order" "uuid", "p_notes" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid;
  v_shop_id uuid;
  v_customer_id uuid;
  v_request_id uuid;

  v_item jsonb;
  v_desc text;
  v_qty numeric;

  v_is_staff boolean := false;
  v_is_owner boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array';
  end if;

  -- Load WO + shop + customer
  select wo.shop_id, wo.customer_id
    into v_shop_id, v_customer_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_shop_id is null then
    raise exception 'Work order not found';
  end if;

  -- Authorization: Staff in shop OR portal customer who owns the WO
  select exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.shop_id = v_shop_id
      and p.role in ('owner','admin','manager','advisor','mechanic','parts')
  ) into v_is_staff;

  select exists (
    select 1 from public.customers c
    where c.id = v_customer_id and c.user_id = v_uid
  ) into v_is_owner;

  if not v_is_staff and not v_is_owner then
    raise exception 'Not allowed';
  end if;

  -- Always create a NEW part request (removed: reuse existing active request)
  insert into public.part_requests (
    shop_id,
    work_order_id,
    job_id,
    requested_by,
    notes,
    status
  )
  values (
    v_shop_id,
    p_work_order_id,
    p_job_id,
    v_uid,
    nullif(trim(coalesce(p_notes,'')), ''),
    'requested'
  )
  returning id into v_request_id;

  -- Insert items
  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_desc := nullif(trim(coalesce(v_item->>'description','')), '');
    if v_desc is null then
      raise exception 'Each item requires a non-empty description. Item=%', v_item;
    end if;

    begin
      v_qty := coalesce((v_item->>'qty')::numeric, 1);
    exception when others then
      v_qty := 1;
    end;

    if v_qty <= 0 then
      raise exception 'Item qty must be > 0. Item=%', v_item;
    end if;

    insert into public.part_request_items (
      request_id,
      description,
      qty
    )
    values (
      v_request_id,
      v_desc,
      v_qty
    );
  end loop;

  return v_request_id;
end;
$$;


ALTER FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "vehicle_id" "uuid",
    "inspection_id" "uuid",
    "customer_id" "uuid",
    "assigned_tech" "uuid",
    "status" "text" DEFAULT 'awaiting_approval'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "labor_total" numeric,
    "parts_total" numeric,
    "invoice_total" numeric,
    "quote" "jsonb",
    "customer_name" "text",
    "vehicle_info" "text",
    "inspection_type" "text",
    "inspection_pdf_url" "text",
    "shop_id" "uuid",
    "quote_url" "text",
    "notes" "text",
    "type" "text",
    "custom_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "invoice_url" "text",
    "approval_state" "text",
    "vehicle_unit_number" "text",
    "vehicle_color" "text",
    "vehicle_mileage" integer,
    "vehicle_engine_hours" integer,
    "customer_approval_signature_url" "text",
    "customer_approval_at" timestamp with time zone,
    "customer_approval_signature_path" "text",
    "customer_approved_by" "uuid",
    "created_by" "uuid",
    "priority" integer DEFAULT 3,
    "odometer_km" integer,
    "is_waiter" boolean DEFAULT false NOT NULL,
    "invoice_sent_at" timestamp with time zone,
    "invoice_last_sent_to" "text",
    "invoice_pdf_url" "text",
    "source_fleet_service_request_id" "uuid",
    "source_fleet_program_id" "uuid",
    "source_intake_id" "uuid",
    "source_row_id" "uuid",
    "external_id" "text",
    "import_confidence" numeric,
    "import_notes" "text",
    "vehicle_vin" "text",
    "vehicle_license_plate" "text",
    "vehicle_make" "text",
    "vehicle_model" "text",
    "vehicle_year" integer,
    "vehicle_submodel" "text",
    "vehicle_engine" "text",
    "vehicle_drivetrain" "text",
    "vehicle_fuel_type" "text",
    "vehicle_transmission" "text",
    "intake_json" "jsonb",
    "intake_status" "text" DEFAULT 'draft'::"text",
    "intake_submitted_at" timestamp with time zone,
    "intake_submitted_by" "uuid",
    "customer_agreed_at" timestamp with time zone,
    "customer_signature_url" "text",
    "portal_submitted_at" timestamp with time zone,
    "advisor_id" "uuid",
    CONSTRAINT "wo_requires_party_and_vehicle" CHECK ((("status" = ANY (ARRAY['awaiting_approval'::"text", 'new'::"text", 'planned'::"text"])) OR (("customer_id" IS NOT NULL) AND ("vehicle_id" IS NOT NULL)))),
    CONSTRAINT "work_orders_approval_state_check" CHECK ((("approval_state" IS NULL) OR ("approval_state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text", 'partial'::"text"])))),
    CONSTRAINT "work_orders_status_check" CHECK (("status" = ANY (ARRAY['awaiting'::"text", 'queued'::"text", 'in_progress'::"text", 'on_hold'::"text", 'planned'::"text", 'new'::"text", 'completed'::"text", 'awaiting_approval'::"text", 'ready_to_invoice'::"text", 'invoiced'::"text"]))),
    CONSTRAINT "work_orders_type_check" CHECK (("type" = ANY (ARRAY['inspection'::"text", 'repair'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."work_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."work_orders"."vehicle_vin" IS 'Snapshot of vehicles.vin at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_license_plate" IS 'Snapshot of vehicles.license_plate at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_make" IS 'Snapshot of vehicles.make at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_model" IS 'Snapshot of vehicles.model at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_year" IS 'Snapshot of vehicles.year at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_submodel" IS 'Snapshot of vehicles.submodel/trim-equivalent at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_engine" IS 'Snapshot of vehicles.engine at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_drivetrain" IS 'Snapshot of vehicles.drivetrain at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_fuel_type" IS 'Snapshot of vehicles.fuel_type at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."vehicle_transmission" IS 'Snapshot of vehicles.transmission at time of WO create/update.';



COMMENT ON COLUMN "public"."work_orders"."intake_json" IS 'Structured customer intake questionnaire payload (ProFixIQ IntakeV1 schema).';



COMMENT ON COLUMN "public"."work_orders"."intake_status" IS 'draft | submitted | revised';



COMMENT ON COLUMN "public"."work_orders"."intake_submitted_at" IS 'Timestamp when customer submitted the intake form';



COMMENT ON COLUMN "public"."work_orders"."intake_submitted_by" IS 'User ID who submitted the intake form (customer portal or fleet portal)';



CREATE OR REPLACE FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean) RETURNS "public"."work_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_attempts int := 0;
  v_max_attempts int := 8;
  v_custom_id text;
  v_row public.work_orders;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  loop
    v_attempts := v_attempts + 1;

    v_custom_id :=
      generate_next_work_order_custom_id(p_shop_id, auth.uid());

    begin
      insert into work_orders (
        shop_id,
        custom_id,
        customer_id,
        vehicle_id,
        notes,
        priority,
        is_waiter,
        user_id,
        status
      )
      values (
        p_shop_id,
        v_custom_id,
        p_customer_id,
        p_vehicle_id,
        p_notes,
        p_priority,
        p_is_waiter,
        auth.uid(),
        'awaiting_approval'
      )
      returning * into v_row;

      return v_row;

    exception
      when unique_violation then
        -- collision → retry
        if v_attempts >= v_max_attempts then
          raise exception
            'Could not generate unique work order number after % attempts',
            v_attempts;
        end if;
        -- small jitter
        perform pg_sleep(0.02 + random() * 0.08);
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text" DEFAULT ''::"text", "p_priority" integer DEFAULT 3, "p_is_waiter" boolean DEFAULT false, "p_advisor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."work_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_created_by uuid;
  v_custom_id text;
  v_row public.work_orders;
begin
  v_created_by := auth.uid();

  if v_created_by is null then
    raise exception 'Not authenticated';
  end if;

  v_custom_id := public.generate_work_order_custom_id(
    p_shop_id,
    v_created_by
  );

  insert into public.work_orders (
    shop_id,
    customer_id,
    vehicle_id,
    notes,
    priority,
    is_waiter,
    created_by,
    advisor_id,
    custom_id,
    status
  )
  values (
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    coalesce(p_notes, ''),
    coalesce(p_priority, 3),
    coalesce(p_is_waiter, false),
    v_created_by,
    p_advisor_id,
    v_custom_id,
    'awaiting'
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean, "p_advisor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_shop_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.shop_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."current_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customers_set_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.shop_id is null then
    new.shop_id := public.current_shop_id();
  end if;
  return new;
end$$;


ALTER FUNCTION "public"."customers_set_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customers_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."customers_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_user_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.shop_id IS NOT NULL
     AND (NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.shop_id IS NULL)
     AND OLD.is_active = true THEN
    UPDATE shops
    SET active_user_count = GREATEST(0, active_user_count - 1)
    WHERE id = OLD.shop_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."decrement_user_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_user_count_on_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.shop_id IS NOT NULL AND OLD.is_active = true THEN
    UPDATE shops
    SET active_user_count = GREATEST(0, active_user_count - 1)
    WHERE id = OLD.shop_id;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."decrement_user_count_on_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_part_request"("p_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_user_shop_id uuid;
  v_request_shop_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select p.shop_id
    into v_user_shop_id
  from public.profiles p
  where p.id = v_user_id;

  if v_user_shop_id is null then
    raise exception using errcode = '28000', message = 'User has no shop';
  end if;

  -- lock request row and confirm boundary
  select pr.shop_id
    into v_request_shop_id
  from public.part_requests pr
  where pr.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Part request not found';
  end if;

  if v_request_shop_id is distinct from v_user_shop_id then
    raise exception using errcode = '42501', message = 'Forbidden';
  end if;

  -- children (always exists in your current workflow)
  delete from public.part_request_items where request_id = p_request_id;

  -- optional legacy/extra children (only delete if table exists)
  if to_regclass('public.part_request_lines') is not null then
    execute 'delete from public.part_request_lines where request_id = $1' using p_request_id;
  end if;

  if to_regclass('public.parts_request_messages') is not null then
    execute 'delete from public.parts_request_messages where request_id = $1' using p_request_id;
  end if;

  if to_regclass('public.parts_messages') is not null then
    execute 'delete from public.parts_messages where request_id = $1' using p_request_id;
  end if;

  -- parent
  delete from public.part_requests where id = p_request_id;

  return p_request_id;
end;
$_$;


ALTER FUNCTION "public"."delete_part_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_shop_user_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
  v_target_shop uuid;
begin
  if tg_op = 'INSERT' then
    v_target_shop := new.shop_id;
  else
    if new.shop_id is not distinct from old.shop_id then
      return new;
    end if;
    v_target_shop := new.shop_id;
  end if;

  if v_target_shop is null then
    return new;
  end if;

  select coalesce(s.plan, 'starter') into v_plan
  from public.shops s
  where s.id = v_target_shop;

  v_limit := public.plan_user_limit(v_plan);

  -- unlimited plans
  if v_limit is null then
    return new;
  end if;

  v_count := public.shop_staff_user_count(v_target_shop);

  -- v_count is current count; adding this row would exceed if >= limit
  if v_count >= v_limit then
    raise exception
      'PLAN_USER_LIMIT_REACHED: plan=% max=%',
      lower(v_plan),
      v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_shop_user_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_vehicle_shop_matches_customer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  c_shop_id uuid;
begin
  -- If customer is present, customer is the source of truth (Option A)
  if new.customer_id is not null then
    select c.shop_id into c_shop_id
    from public.customers c
    where c.id = new.customer_id;

    if c_shop_id is null then
      -- Customer exists but shop_id is null: we can't enforce yet (non-breaking)
      -- If you later make customers.shop_id NOT NULL, this path disappears.
      return new;
    end if;

    -- Always align to customer shop
    new.shop_id := c_shop_id;
    return new;
  end if;

  -- No customer_id: optionally default to current shop context (same behavior as old trigger)
  if new.shop_id is null then
    new.shop_id := public.current_shop_id();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_vehicle_shop_matches_customer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_inspection_session_for_line"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_needs_session boolean;
  v_session_id uuid;
BEGIN
  -- Only act on INSERT or relevant UPDATEs where inspection_session_id is still NULL
  IF TG_OP = 'UPDATE' THEN
    -- If inspection_session_id changed from NULL to NOT NULL, or is already set, skip
    IF NEW.inspection_session_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    -- If nothing relevant changed (job_type/template), skip
    IF COALESCE(NEW.job_type,'') = COALESCE(OLD.job_type,'')
       AND COALESCE(NEW.inspection_template_id, '00000000-0000-0000-0000-000000000000') =
           COALESCE(OLD.inspection_template_id, '00000000-0000-0000-0000-000000000000') THEN
      RETURN NEW;
    END IF;
  END IF;

  v_needs_session := (NEW.job_type = 'inspection') OR (NEW.inspection_template_id IS NOT NULL);
  IF NOT v_needs_session THEN
    RETURN NEW;
  END IF;

  -- If already linked (defensive, covers INSERT path)
  IF NEW.inspection_session_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inspection_sessions (user_id, work_order_id, work_order_line_id, state, created_by, status, updated_at)
  VALUES (NEW.user_id, NEW.work_order_id, NEW.id, '{}'::json, NEW.user_id, 'new', now())
  ON CONFLICT (work_order_line_id)
  DO UPDATE SET updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_session_id;

  UPDATE public.work_order_lines AS wol
    SET inspection_session_id = v_session_id
  WHERE wol.id = NEW.id
    AND wol.inspection_session_id IS NULL;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_inspection_session_for_line"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_same_shop_policies"("tab" "regclass", "shop_col" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  sch text;
  rel text;
  p_select text;
  p_ins text;
  p_upd text;
  p_del text;
BEGIN
  SELECT n.nspname, c.relname INTO sch, rel
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = tab;

  IF sch IS NULL OR rel IS NULL THEN
    RAISE EXCEPTION 'ensure_same_shop_policies: relation not found for %', tab;
  END IF;

  p_select := rel || '__shop_select';
  p_ins    := rel || '__shop_insert';
  p_upd    := rel || '__shop_update';
  p_del    := rel || '__shop_delete';

  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_select
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for select to authenticated using (is_shop_member_v2(%I))',
      p_select, sch, rel, shop_col
    );
  END IF;

  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_ins
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for insert to authenticated with check (is_shop_member_v2(%I))',
      p_ins, sch, rel, shop_col
    );
  END IF;

  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_upd
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for update to authenticated using (is_shop_member_v2(%I)) with check (is_shop_member_v2(%I))',
      p_upd, sch, rel, shop_col, shop_col
    );
  END IF;

  -- DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_del
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for delete to authenticated using (is_shop_member_v2(%I))',
      p_del, sch, rel, shop_col
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."ensure_same_shop_policies"("tab" "regclass", "shop_col" "text") OWNER TO "postgres";


CREATE PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "owner_col" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  sch text;
  rel text;
  p_select text;
  p_ins text;
  p_upd text;
  p_del text;
BEGIN
  SELECT n.nspname, c.relname INTO sch, rel
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = tab;

  IF sch IS NULL OR rel IS NULL THEN
    RAISE EXCEPTION 'ensure_self_owned_policies: relation not found for %', tab;
  END IF;

  p_select := rel || '__self_select';
  p_ins    := rel || '__self_insert';
  p_upd    := rel || '__self_update';
  p_del    := rel || '__self_delete';

  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_select
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for select to authenticated using ((select auth.uid()) = %I)',
      p_select, sch, rel, owner_col
    );
  END IF;

  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_ins
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for insert to authenticated with check ((select auth.uid()) = %I)',
      p_ins, sch, rel, owner_col
    );
  END IF;

  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_upd
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for update to authenticated using ((select auth.uid()) = %I) with check ((select auth.uid()) = %I)',
      p_upd, sch, rel, owner_col, owner_col
    );
  END IF;

  -- DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = sch AND tablename = rel AND policyname = p_del
  ) THEN
    EXECUTE format(
      'create policy %I on %I.%I for delete to authenticated using ((select auth.uid()) = %I)',
      p_del, sch, rel, owner_col
    );
  END IF;
END;
$$;


ALTER PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "owner_col" "text") OWNER TO "postgres";


CREATE PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text")
    LANGUAGE "plpgsql"
    AS $$
begin
  -- 1) Ensure user exists in auth.users
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, concat(lower(replace(name, ' ', '')), '@example.com'), jsonb_build_object('full_name', name))
  on conflict (id) do nothing;

  -- 2) Ensure profile exists
  insert into public.profiles (id, shop_id, role, full_name)
  values (uid, shop, role, name)
  on conflict (id) do update set shop_id = excluded.shop_id, role = excluded.role;
end;
$$;


ALTER PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") OWNER TO "postgres";


CREATE PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  rel text := tab::text;
  base text := split_part(tab::text, '.', 2);
  using_sql text := format(
    'exists (select 1 from public.work_orders wo where wo.id = %s.%s and wo.shop_id = public.current_shop_id())',
    base, wo_col
  );
begin
  execute format(
    'create policy if not exists %I on %s for select to authenticated using (%s)',
    base||'_wo_shop_select', rel, using_sql
  );
  execute format(
    'create policy if not exists %I on %s for insert to authenticated with check (%s)',
    base||'_wo_shop_insert', rel, using_sql
  );
  execute format(
    'create policy if not exists %I on %s for update to authenticated using (%s) with check (%s)',
    base||'_wo_shop_update', rel, using_sql, using_sql
  );
  execute format(
    'create policy if not exists %I on %s for delete to authenticated using (%s)',
    base||'_wo_shop_delete', rel, using_sql
  );
  execute format('create index if not exists %I on %s(%I)', 'idx_'||base||'_'||wo_col, rel, wo_col);
end$$;


ALTER PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_menu_item_for_vehicle_service"("p_shop_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_engine_family" "text", "p_service_code" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT svm.menu_item_id
  FROM public.vehicle_menus vm
  JOIN public.shop_vehicle_menu_items svm
    ON svm.vehicle_menu_id = vm.id
   AND svm.shop_id = p_shop_id
  WHERE lower(vm.make) = lower(p_make)
    AND lower(vm.model) = lower(p_model)
    AND p_year BETWEEN vm.year_from AND vm.year_to
    AND vm.service_code = p_service_code
    AND (vm.engine_family IS NULL
         OR p_engine_family IS NULL
         OR lower(vm.engine_family) = lower(p_engine_family))
  ORDER BY
    CASE
      WHEN vm.engine_family IS NOT NULL
       AND p_engine_family IS NOT NULL
       AND lower(vm.engine_family) = lower(p_engine_family) THEN 0
      WHEN vm.engine_family IS NULL THEN 1
      ELSE 2
    END
  LIMIT 1;
$$;


ALTER FUNCTION "public"."find_menu_item_for_vehicle_service"("p_shop_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_engine_family" "text", "p_service_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."first_segment_uuid"("p" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(split_part(p, '/', 1), '')::uuid;
$$;


ALTER FUNCTION "public"."first_segment_uuid"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fleet_fill_fleet_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_resolved uuid;
begin
  -- vehicle_id must exist for these tables; if not, fail clearly
  if new.vehicle_id is null then
    raise exception 'vehicle_id is required for %', tg_table_name
      using errcode = '23502'; -- not_null_violation style
  end if;

  v_resolved := public.resolve_fleet_id_from_vehicle(new.vehicle_id);

  -- If fleet_id not provided, populate it
  if new.fleet_id is null then
    new.fleet_id := v_resolved;
    return new;
  end if;

  -- If fleet_id provided, enforce consistency with vehicle mapping
  if new.fleet_id <> v_resolved then
    raise exception 'fleet_id mismatch for %. Provided %, resolved % from vehicle_id %',
      tg_table_name, new.fleet_id, v_resolved, new.vehicle_id
      using errcode = '23514';
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."fleet_fill_fleet_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fleet_inspection_schedules_set_next"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- If last_inspection_date present, compute next = last + interval_days
  if new.last_inspection_date is not null then
    new.next_inspection_date := new.last_inspection_date + make_interval(days => coalesce(new.interval_days, 365));
  elsif new.next_inspection_date is null then
    -- If no last date given and next is null, seed next from today + interval_days
    new.next_inspection_date := current_date + make_interval(days => coalesce(new.interval_days, 365));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."fleet_inspection_schedules_set_next"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_tech_sessions_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    declare
      wo_shop uuid;
    begin
      -- Basic time sanity
      if new.ended_at is not null and new.started_at is not null and new.ended_at < new.started_at then
        raise exception 'tech_sessions.ended_at cannot be before started_at';
      end if;

      -- If work_order_id present, enforce shop alignment
      if new.work_order_id is not null then
        select shop_id into wo_shop
        from public.work_orders
        where id = new.work_order_id;

        if wo_shop is not null then
          if new.shop_id is null then
            new.shop_id := wo_shop; -- auto-fill
          elsif new.shop_id <> wo_shop then
            raise exception 'tech_sessions.shop_id must match work_orders.shop_id';
          end if;
        end if;
      end if;

      return new;
    end;
    $$;


ALTER FUNCTION "public"."fn_tech_sessions_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_wol_sync_assigned_to"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
      begin
        -- If assigned_tech_id isn't set but assigned_to is, mirror it.
        if new.assigned_tech_id is null and new.assigned_to is not null then
          new.assigned_tech_id := new.assigned_to;
        end if;

        -- If assigned_to isn't set but assigned_tech_id is, mirror it.
        if new.assigned_to is null and new.assigned_tech_id is not null then
          new.assigned_to := new.assigned_tech_id;
        end if;

        return new;
      end;
      $$;


ALTER FUNCTION "public"."fn_wol_sync_assigned_to"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_next_work_order_custom_id"("p_shop_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_full_name    text;
  v_first_initial text;
  v_last_initial  text;
  v_prefix        text;
  v_last_id       text;
  v_next_num      int := 1;
begin
  -- Pull full_name (fallback to email/unknown)
  select
    coalesce(nullif(trim(full_name), ''), 'X X')
  into v_full_name
  from public.profiles
  where id = p_user_id;

  -- First initial = first char of first word
  v_first_initial :=
    upper(left(split_part(v_full_name, ' ', 1), 1));

  -- Last initial = first char of last “word” (if only one word, reuse first)
  v_last_initial :=
    upper(left(
      nullif(split_part(v_full_name, ' ', greatest(2, array_length(regexp_split_to_array(v_full_name, '\s+'), 1))), ''),
      1
    ));

  if v_last_initial is null or v_last_initial = '' then
    v_last_initial := v_first_initial;
  end if;

  v_prefix := coalesce(v_first_initial, 'X') || coalesce(v_last_initial, 'X');

  -- Find highest existing number for this shop + prefix
  select custom_id
  into v_last_id
  from public.work_orders
  where shop_id = p_shop_id
    and custom_id like v_prefix || '%'
  order by custom_id desc
  limit 1;

  if v_last_id is not null then
    v_next_num :=
      coalesce(
        nullif(regexp_replace(v_last_id, '^[A-Z]+', ''), '')::int,
        0
      ) + 1;
  end if;

  return v_prefix || lpad(v_next_num::text, 6, '0');
end;
$$;


ALTER FUNCTION "public"."generate_next_work_order_custom_id"("p_shop_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_stock_location"("p_shop_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select sl.id
  from public.stock_locations sl
  where sl.shop_id = p_shop_id
  order by sl.id asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_default_stock_location"("p_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_live_invoice_id"("p_work_order_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select i.id
  from public.invoices i
  where i.work_order_id = p_work_order_id
    and not public.invoice_is_locked(i.status, i.issued_at)
  order by i.created_at desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_live_invoice_id"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_make text;
  v_model text;
  v_year integer;
  v_trim text;
  v_engine text;
  v_drivetrain text;
  v_transmission text;
  v_fuel_type text;
  v_id uuid;
begin
  select
    nullif(trim(make), ''),
    nullif(trim(model), ''),
    year,
    nullif(trim(submodel), ''),
    nullif(trim(engine), ''),
    nullif(trim(drivetrain), ''),
    nullif(trim(transmission), ''),
    nullif(trim(fuel_type), '')
  into
    v_make,
    v_model,
    v_year,
    v_trim,
    v_engine,
    v_drivetrain,
    v_transmission,
    v_fuel_type
  from public.vehicles
  where id = p_vehicle_id and shop_id = p_shop_id
  limit 1;

  if v_make is null and v_model is null and v_year is null then
    return null;
  end if;

  insert into public.vehicle_signatures (
    shop_id, vehicle_id, year, make, model, trim, engine, drivetrain, transmission, fuel_type, created_at, updated_at
  ) values (
    p_shop_id, p_vehicle_id, v_year, v_make, v_model, v_trim, v_engine, v_drivetrain, v_transmission, v_fuel_type, now(), now()
  )
  on conflict (shop_id, vehicle_id)
  do update set
    year = excluded.year,
    make = excluded.make,
    model = excluded.model,
    trim = excluded.trim,
    engine = excluded.engine,
    drivetrain = excluded.drivetrain,
    transmission = excluded.transmission,
    fuel_type = excluded.fuel_type,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_trim" "text", "p_engine" "text", "p_drivetrain" "text", "p_transmission" "text", "p_fuel_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_id uuid;
begin
  insert into public.vehicle_signatures (
    shop_id, vehicle_id, year, make, model, trim, engine, drivetrain, transmission, fuel_type
  )
  values (
    p_shop_id, p_vehicle_id, p_year, p_make, p_model, p_trim, p_engine, p_drivetrain, p_transmission, p_fuel_type
  )
  on conflict on constraint vehicle_signatures_shop_config_uniq
  do update set
    vehicle_id = coalesce(public.vehicle_signatures.vehicle_id, excluded.vehicle_id),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_trim" "text", "p_engine" "text", "p_drivetrain" "text", "p_transmission" "text", "p_fuel_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") RETURNS TABLE("technician_id" "uuid", "full_name" "text", "role" "text", "has_active" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    p.id AS technician_id,
    p.full_name,
    p.role,
    BOOL_OR(wol.punched_in_at IS NOT NULL AND wol.punched_out_at IS NULL) AS has_active
  FROM public.work_order_lines wol
  LEFT JOIN public.work_order_line_technicians wolt
    ON wolt.work_order_line_id = wol.id
  LEFT JOIN public.profiles p
    ON p.id = COALESCE(wolt.technician_id, wol.assigned_tech_id)
  WHERE wol.work_order_id = p_work_order_id
    AND public.can_view_work_order(p_work_order_id)
  GROUP BY p.id, p.full_name, p.role
  HAVING p.id IS NOT NULL;
$$;


ALTER FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_approval_to_work_order"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  new_work_order_id uuid;
begin
  if NEW.status = 'approved' then
    insert into work_orders (
      user_id,
      vehicle_id,
      inspection_id,
      status,
      notes
    )
    values (
      NEW.user_id,
      NEW.vehicle_id,
      null,
      'awaiting-diagnosis',
      'Auto-created from customer booking: ' || coalesce(NEW.request_summary, '')
    )
    returning id into new_work_order_id;

    -- Optionally update the approval record with the new work order ID
    update work_order_approvals
    set work_order_id = new_work_order_id
    where id = NEW.id;
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."handle_approval_to_work_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, null);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_column"("tab" "regclass", "col" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select exists (
    select 1
    from pg_attribute
    where attrelid = tab and attname = col and not attisdropped
  )
$$;


ALTER FUNCTION "public"."has_column"("tab" "regclass", "col" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_user_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.shop_id IS NOT NULL
     AND OLD.shop_id IS DISTINCT FROM NEW.shop_id
     AND NEW.is_active = true THEN
    UPDATE shops
    SET active_user_count = active_user_count + 1
    WHERE id = NEW.shop_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_user_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer DEFAULT 5) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update shops
  set user_limit = coalesce(user_limit, 0) + increment_by
  where id = input_shop_id;
end;
$$;


ALTER FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspections_set_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare new_shop uuid;
begin
  if new.work_order_id is not null then
    select shop_id into new_shop from public.work_orders where id = new.work_order_id;
  end if;

  if new_shop is null and new.vehicle_id is not null then
    select shop_id into new_shop from public.vehicles where id = new.vehicle_id;
  end if;

  if new_shop is null then
    new_shop := public.current_shop_id();
  end if;

  new.shop_id := coalesce(new.shop_id, new_shop);
  return new;
end
$$;


ALTER FUNCTION "public"."inspections_set_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoice_is_locked"("s" "text", "issued_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select
    coalesce(trim(lower(s)), '') in ('issued','finalized','paid','sent')
    or issued_at is not null;
$$;


ALTER FUNCTION "public"."invoice_is_locked"("s" "text", "issued_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoices_compute_totals_biu"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_labor numeric;
  v_parts numeric;
  v_tax numeric;
  v_disc numeric;
  v_sub numeric;
  v_total numeric;
begin
  v_labor := coalesce(new.labor_cost,0);
  v_parts := coalesce(new.parts_cost,0);
  v_tax   := coalesce(new.tax_total,0);
  v_disc  := coalesce(new.discount_total,0);

  v_sub := greatest(0, v_labor + v_parts - v_disc);
  v_total := greatest(0, v_sub + v_tax);

  new.subtotal := v_sub;
  new.total := v_total;

  return new;
end;
$$;


ALTER FUNCTION "public"."invoices_compute_totals_biu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoices_sync_work_orders_aiu"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.work_orders wo
  set
    labor_total   = new.labor_cost,
    parts_total   = new.parts_cost,
    invoice_total = new.total
  where wo.id = new.work_order_id;

  return null;
end;
$$;


ALTER FUNCTION "public"."invoices_sync_work_orders_aiu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_agent_developer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select agent_role from public.profiles where id = auth.uid()), '') = 'developer'
$$;


ALTER FUNCTION "public"."is_agent_developer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_customer"("_customer" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.customers c
    where c.id = _customer and c.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_customer"("_customer" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_shop_member"("p_shop_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_shop_member"("p_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_shop_member_v2"("shop_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$ select public.is_shop_member($1); $_$;


ALTER FUNCTION "public"."is_shop_member_v2"("shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id   = auth.uid()
      and p.shop_id = _shop
      and p.role in ('owner','admin','manager','advisor','parts','mechanic')
  );
$$;


ALTER FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_ai_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_event text := COALESCE(TG_ARGV[0], TG_OP);
BEGIN
  INSERT INTO public.ai_events (
    event_type,
    entity_id,
    entity_table,
    shop_id,
    user_id,
    payload,
    created_at
  )
  VALUES (
    v_event,
    COALESCE(NEW.id, OLD.id),
    TG_TABLE_NAME,
    COALESCE(NEW.shop_id, OLD.shop_id),
    auth.uid(),
    jsonb_build_object(
      'op', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    ),
    now()
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN others THEN
    -- Never block the main write
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_ai_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  v_action text := TG_OP;                              -- 'INSERT' | 'UPDATE' | 'DELETE'
  v_table  text := TG_TABLE_NAME;
  v_row_id uuid := coalesce( (case when TG_OP in ('INSERT','UPDATE') then (to_jsonb(NEW)->>'id') end)::uuid,
                             (case when TG_OP = 'DELETE'               then (to_jsonb(OLD)->>'id') end)::uuid );
  v_metadata jsonb := jsonb_build_object(
    'old', case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    'new', case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end
  );
begin
  insert into public.audit_logs (id, created_at, actor_id, action, target, metadata)
  values (
    gen_random_uuid(),
    now(),
    v_actor,
    lower(v_action),
    format('%s:%s', v_table, coalesce(v_row_id::text, 'unknown')),
    v_metadata
  );
  -- standard row flow
  if TG_OP in ('INSERT','UPDATE') then
    return NEW;
  else
    return OLD;
  end if;
end;
$$;


ALTER FUNCTION "public"."log_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_work_order_line_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    insert into public.work_order_line_history (line_id, work_order_id, status, reason, snapshot)
    values (new.id, new.work_order_id, coalesce(new.status,'awaiting'), 'insert', to_jsonb(new));
    return new;
  elsif TG_OP = 'UPDATE' then
    -- capture meaningful changes
    if (coalesce(new.status,'') is distinct from coalesce(old.status,'')) then
      insert into public.work_order_line_history (line_id, work_order_id, status, reason, snapshot)
      values (new.id, new.work_order_id, coalesce(new.status,'awaiting'),
              'status_change:'||coalesce(old.status,'')||'→'||coalesce(new.status,''),
              to_jsonb(new));
    elsif (new.punched_out_at is distinct from old.punched_out_at) then
      insert into public.work_order_line_history (line_id, work_order_id, status, reason, snapshot)
      values (new.id, new.work_order_id, coalesce(new.status,'awaiting'),
              'punched_out',
              to_jsonb(new));
    elsif (new.punched_in_at is distinct from old.punched_in_at) then
      insert into public.work_order_line_history (line_id, work_order_id, status, reason, snapshot)
      values (new.id, new.work_order_id, coalesce(new.status,'awaiting'),
              'punched_in',
              to_jsonb(new));
    elsif (new.cause is distinct from old.cause
           or new.correction is distinct from old.correction
           or new.notes is distinct from old.notes) then
      insert into public.work_order_line_history (line_id, work_order_id, status, reason, snapshot)
      values (new.id, new.work_order_id, coalesce(new.status,'awaiting'),
              'notes_or_cause_update',
              to_jsonb(new));
    else
      -- fall back: record other updates too (optional; comment out if too chatty)
      insert into public.work_order_line_history (line_id, work_order_id, status, reason, snapshot)
      values (new.id, new.work_order_id, coalesce(new.status,'awaiting'),
              'update',
              to_jsonb(new));
    end if;
    return new;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."log_work_order_line_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_active"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.profiles
  SET last_active_at = NOW()
  WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."mark_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maybe_release_line_hold_for_parts"("p_work_order_line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_blocked int; begin
  if p_work_order_line_id is null then return; end if;
  select count(*) into v_blocked
  from public.part_request_items i
  where i.work_order_line_id = p_work_order_line_id
    and i.part_id is not null
    and greatest(coalesce(i.qty_approved,0),0) > 0
    and (greatest(coalesce(i.qty_received,0),0) + greatest(coalesce(i.qty_reserved,0),0)) < greatest(coalesce(i.qty_approved,0),0);
  if coalesce(v_blocked,0) = 0 then
    update public.work_order_lines
    set status = case when status = 'on_hold' then 'active' else status end,
        hold_reason = case when hold_reason = 'awaiting_parts' then null else hold_reason end,
        on_hold_since = case when hold_reason = 'awaiting_parts' then null else on_hold_since end,
        updated_at = now()
    where id = p_work_order_line_id and status = 'on_hold' and hold_reason = 'awaiting_parts';
  end if;
end; $$;


ALTER FUNCTION "public"."maybe_release_line_hold_for_parts"("p_work_order_line_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."menu_item_parts_set_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_shop_id uuid;
begin
  -- derive shop_id from parent menu item
  select mi.shop_id
    into v_shop_id
  from public.menu_items mi
  where mi.id = new.menu_item_id;

  if v_shop_id is null then
    raise exception 'menu_item_parts: parent menu_items.shop_id is null (menu_item_id=%)', new.menu_item_id;
  end if;

  new.shop_id := coalesce(new.shop_id, v_shop_id);
  new.user_id := coalesce(new.user_id, auth.uid());

  return new;
end;
$$;


ALTER FUNCTION "public"."menu_item_parts_set_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."menu_items_compute_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_labor_rate numeric := 0;
begin
  if new.shop_id is not null then
    select coalesce(labor_rate, 0)
      into v_labor_rate
    from public.shops
    where id = new.shop_id;
  end if;

  new.part_cost := coalesce(new.part_cost, 0);
  new.labor_time := new.labor_time;
  new.labor_hours := coalesce(new.labor_time, new.labor_hours);

  new.total_price :=
    coalesce(new.part_cost, 0)
    + (coalesce(new.labor_time, 0) * v_labor_rate);

  return new;
end;
$$;


ALTER FUNCTION "public"."menu_items_compute_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_part_request_item_approved_reserve_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_loc_id uuid;
  v_shop_id uuid;
  v_res jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Only when status changes INTO approved
  IF COALESCE(OLD.status::text,'') = COALESCE(NEW.status::text,'') THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'approved'::part_request_item_status THEN
    RETURN NEW;
  END IF;

  -- If already reserved/picked/etc somehow, don't backslide
  IF COALESCE(NEW.qty_reserved, 0) > 0 THEN
    RETURN NEW;
  END IF;

  v_shop_id := NEW.shop_id;
  IF v_shop_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Choose MAIN location if present, else any location for shop
  SELECT id
  INTO v_loc_id
  FROM public.stock_locations
  WHERE shop_id = v_shop_id
    AND upper(coalesce(code,'')) = 'MAIN'
  LIMIT 1;

  IF v_loc_id IS NULL THEN
    SELECT id
    INTO v_loc_id
    FROM public.stock_locations
    WHERE shop_id = v_shop_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_loc_id IS NULL THEN
    -- No location: cannot allocate/reserve automatically
    RETURN NEW;
  END IF;

  -- Create/upsert allocation
  v_res := public.upsert_part_allocation_from_request_item(
    NEW.id,
    v_loc_id,
    true
  );

  -- Mark reserved based on approval qty
  UPDATE public.part_request_items
  SET
    status = 'reserved'::part_request_item_status,
    qty_reserved = COALESCE(qty_approved, qty_requested, qty, 0),
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_part_request_item_approved_reserve_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_part_request_item_reserved_autopick"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_need numeric;
  v_loc_id uuid;
  v_stock_id uuid;
  v_on_hand numeric;
  v_reserved numeric;
  v_available numeric;
  v_pick numeric;
  v_new_picked numeric;
  v_target_status part_request_item_status;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Only when status changes INTO reserved
  IF COALESCE(OLD.status::text,'') = COALESCE(NEW.status::text,'') THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'reserved'::part_request_item_status THEN
    RETURN NEW;
  END IF;

  -- Must have a real part to pick
  IF NEW.part_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- How many do we want to pick?
  v_need := COALESCE(NEW.qty_reserved, 0);
  IF v_need <= 0 THEN
    v_need := COALESCE(NEW.qty_approved, NEW.qty_requested, NEW.qty, 0);
  END IF;
  IF v_need <= 0 THEN
    RETURN NEW;
  END IF;

  -- Prefer allocation location for this request item (best accuracy)
  SELECT wopa.location_id
  INTO v_loc_id
  FROM public.work_order_part_allocations wopa
  WHERE wopa.source_request_item_id = NEW.id
    AND wopa.part_id = NEW.part_id
  ORDER BY wopa.created_at DESC
  LIMIT 1;

  -- Fallback: MAIN location
  IF v_loc_id IS NULL AND NEW.shop_id IS NOT NULL THEN
    SELECT id
    INTO v_loc_id
    FROM public.stock_locations
    WHERE shop_id = NEW.shop_id
      AND upper(coalesce(code,'')) = 'MAIN'
    LIMIT 1;
  END IF;

  IF v_loc_id IS NULL THEN
    RETURN NEW;
  END IF;

  /* ------------------------------------------------------------------ */
  /* Lock stock row to avoid races                                       */
  /* ------------------------------------------------------------------ */
  SELECT ps.id, COALESCE(ps.qty_on_hand,0), COALESCE(ps.qty_reserved,0)
  INTO v_stock_id, v_on_hand, v_reserved
  FROM public.part_stock ps
  WHERE ps.part_id = NEW.part_id
    AND ps.location_id = v_loc_id
  FOR UPDATE;

  IF v_stock_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- available to pick = on_hand - reserved
  v_available := GREATEST(0, v_on_hand - v_reserved);

  IF v_available <= 0 THEN
    -- Nothing available; leave as reserved (later flow could move to ordered)
    RETURN NEW;
  END IF;

  v_pick := LEAST(v_need, v_available);
  IF v_pick <= 0 THEN
    RETURN NEW;
  END IF;

  -- Decrement on-hand (physical pick)
  UPDATE public.part_stock
  SET qty_on_hand = COALESCE(qty_on_hand, 0) - v_pick
  WHERE id = v_stock_id;

  -- Update request item progress/status
  v_new_picked := COALESCE(NEW.qty_picked, 0) + v_pick;

  v_target_status :=
    CASE
      WHEN v_new_picked >= v_need THEN 'picked'::part_request_item_status
      ELSE 'picking'::part_request_item_status
    END;

  UPDATE public.part_request_items
  SET
    qty_picked = v_new_picked,
    status = v_target_status,
    updated_at = now()
  WHERE id = NEW.id;

  -- Immutable ledger entry (audit trail)
  INSERT INTO public.stock_moves (
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    shop_id,
    created_by
  ) VALUES (
    NEW.part_id,
    v_loc_id,
    -v_pick,
    'wo_allocate'::stock_move_reason,
    'part_request_item',
    NEW.id,
    NEW.shop_id,
    auth.uid()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_part_request_item_reserved_autopick"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_part_request_items_recheck_line_hold"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_line_id uuid; begin
  v_line_id := coalesce(new.work_order_line_id, old.work_order_line_id);
  if v_line_id is not null then
    perform public.reserve_part_request_items_for_line(v_line_id, NULL);
    perform public.maybe_release_line_hold_for_parts(v_line_id);
  end if;
  return coalesce(new, old);
end; $$;


ALTER FUNCTION "public"."on_part_request_items_recheck_line_hold"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_work_order_line_active_parts_flow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if (tg_op = 'UPDATE') and (coalesce(old.status,'') <> 'active') and (new.status = 'active') then
    perform public.reserve_part_request_items_for_line(new.id);
    update public.part_request_items
    set status = 'picking'
    where work_order_line_id = new.id
      and part_id is not null
      and greatest(coalesce(qty_approved,0),0) > 0
      and (greatest(coalesce(qty_reserved,0),0) + greatest(coalesce(qty_received,0),0)) >= greatest(coalesce(qty_approved,0),0)
      and status in ('approved','reserved');
    perform public.maybe_release_line_hold_for_parts(new.id);
  end if;
  return new;
end; $$;


ALTER FUNCTION "public"."on_work_order_line_active_parts_flow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_work_order_line_became_active_create_parts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_shop_id uuid;
  v_work_order_id uuid;
  v_req_id uuid;
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_mip record;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Only when status changes INTO 'active'
  IF COALESCE(OLD.status::text,'') = COALESCE(NEW.status::text,'') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status::text,'') <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.work_order_id IS NULL OR NEW.menu_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_work_order_id := NEW.work_order_id;

  SELECT wo.shop_id
  INTO v_shop_id
  FROM public.work_orders wo
  WHERE wo.id = v_work_order_id;

  IF v_shop_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: if any request items already exist for this line, do nothing
  SELECT EXISTS (
    SELECT 1
    FROM public.part_request_items pri
    WHERE pri.work_order_line_id = NEW.id
  )
  INTO v_exists;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  /* ------------------------------------------------------------------ */
  /* 1) Create or reuse part_request for THIS line (job_id = line.id)    */
  /* ------------------------------------------------------------------ */
  SELECT pr.id
  INTO v_req_id
  FROM public.part_requests pr
  WHERE pr.job_id = NEW.id
  LIMIT 1;

  IF v_req_id IS NULL THEN
    INSERT INTO public.part_requests (
      id,
      shop_id,
      work_order_id,
      requested_by,
      assigned_to,
      status,
      notes,
      created_at,
      job_id
    )
    VALUES (
      gen_random_uuid(),
      v_shop_id,
      v_work_order_id,
      v_uid,
      NULL,
      'approved'::part_request_status,
      NULL,
      now(),
      NEW.id
    )
    RETURNING id INTO v_req_id;
  ELSE
    -- If it existed but wasn't advanced yet, bump to approved
    UPDATE public.part_requests
    SET status = 'approved'::part_request_status
    WHERE id = v_req_id
      AND status <> 'approved'::part_request_status;
  END IF;

  /* ------------------------------------------------------------------ */
  /* 2) Create request items from menu_item_parts                        */
  /* ------------------------------------------------------------------ */
  FOR v_mip IN
    SELECT
      mip.part_id,
      mip.name,
      mip.quantity,
      mip.unit_cost
    FROM public.menu_item_parts mip
    WHERE mip.menu_item_id = NEW.menu_item_id
      AND COALESCE(mip.quantity, 0) > 0
  LOOP
    -- For ordering/allocation you want a real catalog part_id. Skip otherwise.
    IF v_mip.part_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.part_request_items (
      id,
      request_id,
      part_id,
      description,
      qty,
      quoted_price,
      vendor,
      approved,
      work_order_line_id,
      markup_pct,
      shop_id,
      work_order_id,
      menu_item_id,
      status,
      qty_requested,
      qty_approved,
      qty_reserved,
      qty_picked,
      qty_received,
      qty_consumed,
      unit_cost,
      unit_price,
      vendor_id,
      created_at,
      updated_at,
      po_id
    )
    VALUES (
      gen_random_uuid(),
      v_req_id,
      v_mip.part_id,
      COALESCE(NULLIF(btrim(v_mip.name), ''), 'Part'),
      v_mip.quantity,
      NULL,
      NULL,
      true,
      NEW.id,
      NULL,
      v_shop_id,
      v_work_order_id,
      NEW.menu_item_id,
      'approved'::part_request_item_status,
      v_mip.quantity,
      v_mip.quantity,
      0,
      0,
      0,
      0,
      v_mip.unit_cost,
      v_mip.unit_cost,
      NULL,
      now(),
      now(),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_work_order_line_became_active_create_parts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_timecards_set_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only compute when both times are present
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    IF NEW.clock_out <= NEW.clock_in THEN
      RAISE EXCEPTION 'clock_out must be after clock_in';
    END IF;

    NEW.hours_worked :=
      EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."payroll_timecards_set_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_user_limit"("p_plan" "text") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v text := lower(coalesce(p_plan, 'starter'));
begin
  if v = 'starter' then
    return 10;
  elsif v = 'pro' then
    return 50;
  elsif v in ('enterprise', 'unlimited') then
    return null; -- no limit
  end if;

  -- Unknown plan -> safest default
  return 10;
end;
$$;


ALTER FUNCTION "public"."plan_user_limit"("p_plan" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_approve_line"("p_line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_customer_id uuid;
  v_wo_id uuid;
begin
  select c.id
    into v_customer_id
  from public.customers c
  where c.user_id = auth.uid()
  limit 1;

  if v_customer_id is null then
    raise exception 'No customer record linked to this user';
  end if;

  -- Verify ownership + get WO id
  select wol.work_order_id
    into v_wo_id
  from public.work_order_lines wol
  join public.work_orders wo on wo.id = wol.work_order_id
  where wol.id = p_line_id
    and wo.customer_id = v_customer_id;

  if v_wo_id is null then
    raise exception 'Not authorized for this line';
  end if;

  update public.work_order_lines
  set
    approval_state = 'approved',
    status = 'queued',
    hold_reason = null,
    punched_in_at = null,
    punched_out_at = null
  where id = p_line_id;

end;
$$;


ALTER FUNCTION "public"."portal_approve_line"("p_line_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_approve_part_request_item"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_customer_id uuid;
  v_line_id uuid;
  v_wo_id uuid;
  v_any_unapproved int;
begin
  -- Find portal user's customer record
  select c.id
    into v_customer_id
  from public.customers c
  where c.user_id = auth.uid()
  limit 1;

  if v_customer_id is null then
    raise exception 'No customer record linked to this user';
  end if;

  -- Verify item belongs to this customer's work order (via line -> wo -> customer)
  select pri.work_order_line_id
    into v_line_id
  from public.part_request_items pri
  join public.work_order_lines wol on wol.id = pri.work_order_line_id
  join public.work_orders wo on wo.id = wol.work_order_id
  where pri.id = p_item_id
    and wo.customer_id = v_customer_id;

  if v_line_id is null then
    raise exception 'Not authorized for this item';
  end if;

  -- Approve the item
  update public.part_request_items
  set approved = true
  where id = p_item_id;

  -- If ALL items for this line are now approved, approve the line
  select count(*)
    into v_any_unapproved
  from public.part_request_items pri
  where pri.work_order_line_id = v_line_id
    and coalesce(pri.approved, false) = false;

  if v_any_unapproved = 0 then
    -- Approve + re-queue the job line
    update public.work_order_lines
    set
      approval_state = 'approved',
      status = 'queued',
      hold_reason = null,
      punched_in_at = null,
      punched_out_at = null
    where id = v_line_id;

    -- Optional: if you want, also update the parent WO status out of awaiting_approval
    select wol.work_order_id into v_wo_id
    from public.work_order_lines wol
    where wol.id = v_line_id;

    if v_wo_id is not null then
      update public.work_orders
      set status = 'queued'
      where id = v_wo_id
        and status = 'awaiting_approval';
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."portal_approve_part_request_item"("p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_decline_line"("p_line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_customer_id uuid;
  v_wo_id uuid;
begin
  select c.id
    into v_customer_id
  from public.customers c
  where c.user_id = auth.uid()
  limit 1;

  if v_customer_id is null then
    raise exception 'No customer record linked to this user';
  end if;

  select wol.work_order_id
    into v_wo_id
  from public.work_order_lines wol
  join public.work_orders wo on wo.id = wol.work_order_id
  where wol.id = p_line_id
    and wo.customer_id = v_customer_id;

  if v_wo_id is null then
    raise exception 'Not authorized for this line';
  end if;

  update public.work_order_lines
  set
    approval_state = 'declined',
    status = 'awaiting'
  where id = p_line_id;

end;
$$;


ALTER FUNCTION "public"."portal_decline_line"("p_line_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_decline_part_request_item"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_customer_id uuid;
  v_ok uuid;
begin
  select c.id into v_customer_id
  from public.customers c
  where c.user_id = auth.uid()
  limit 1;

  if v_customer_id is null then
    raise exception 'No customer record linked to this user';
  end if;

  -- verify ownership
  select pri.id into v_ok
  from public.part_request_items pri
  join public.work_order_lines wol on wol.id = pri.work_order_line_id
  join public.work_orders wo on wo.id = wol.work_order_id
  where pri.id = p_item_id
    and wo.customer_id = v_customer_id;

  if v_ok is null then
    raise exception 'Not authorized for this item';
  end if;

  update public.part_request_items
  set approved = false
  where id = p_item_id;
end;
$$;


ALTER FUNCTION "public"."portal_decline_part_request_item"("p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_list_approvals"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
with current_customer as (
  select id
  from public.customers
  where user_id = auth.uid()
  limit 1
),
pending_lines as (
  select
    wol.id as line_id,
    wol.work_order_id,
    wol.description,
    wol.complaint,
    wol.notes,
    wol.status,
    wol.approval_state,
    wol.hold_reason,
    wol.created_at
  from public.work_order_lines wol
  join public.work_orders wo on wo.id = wol.work_order_id
  join current_customer cc on cc.id = wo.customer_id
  where wol.approval_state = 'pending'
),
items as (
  select
    pri.id,
    pri.work_order_line_id as line_id,
    pri.description,
    pri.qty,
    pri.vendor,
    pri.quoted_price,
    pri.markup_pct,
    pri.approved
  from public.part_request_items pri
  join pending_lines pl on pl.line_id = pri.work_order_line_id
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'line_id', pl.line_id,
      'work_order_id', pl.work_order_id,
      'description', coalesce(pl.description, pl.complaint, ''),
      'notes', pl.notes,
      'status', pl.status,
      'approval_state', pl.approval_state,
      'hold_reason', pl.hold_reason,
      'created_at', pl.created_at,
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'description', i.description,
              'qty', i.qty,
              'vendor', i.vendor,
              'quoted_price', i.quoted_price,
              'markup_pct', i.markup_pct,
              'approved', coalesce(i.approved,false)
            )
          )
          from items i
          where i.line_id = pl.line_id
        ),
        '[]'::jsonb
      )
    )
    order by pl.created_at desc
  ),
  '[]'::jsonb
)
from pending_lines pl
where exists (select 1 from items i where i.line_id = pl.line_id);
$$;


ALTER FUNCTION "public"."portal_list_approvals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."punch_events_set_user_from_shift"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.shift_id is null then
    raise exception 'shift_id is required';
  end if;

  select ts.user_id into new.user_id
  from public.tech_shifts ts
  where ts.id = new.shift_id;

  if new.user_id is null then
    raise exception 'shift_id % not found or shift has no user_id', new.shift_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."punch_events_set_user_from_shift"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."punch_in"("p_line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_line_shop uuid;
  v_user_shop uuid;
  v_assigned uuid;
  v_in timestamptz;
  v_out timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Load line context (shop + assignment + current punch state)
  select wo.shop_id, wol.assigned_tech_id, wol.punched_in_at, wol.punched_out_at
    into v_line_shop, v_assigned, v_in, v_out
  from public.work_order_lines wol
  join public.work_orders wo on wo.id = wol.work_order_id
  where wol.id = p_line_id;

  if v_line_shop is null then
    raise exception 'Line not found' using errcode = 'P0002';
  end if;

  -- Caller must belong to the same shop
  select p.shop_id
    into v_user_shop
  from public.profiles p
  where p.id = v_uid;

  if v_user_shop is distinct from v_line_shop then
    raise exception 'Forbidden: wrong shop' using errcode = '42501';
  end if;

  -- Strict rule: must be assigned to this line
  if v_assigned is distinct from v_uid then
    raise exception 'Not assigned to this line' using errcode = '28000';
  end if;

  -- Already punched in (and not punched out) -> block
  if v_in is not null and v_out is null then
    raise exception 'Already punched in' using errcode = '23505';
  end if;

  -- Punch in (only when assigned)
  update public.work_order_lines
     set punched_in_at  = now(),
         punched_out_at = null
   where id = p_line_id
     and assigned_tech_id = v_uid;

  if not found then
    raise exception 'Unable to punch in' using errcode = '28000';
  end if;
end;
$$;


ALTER FUNCTION "public"."punch_in"("p_line_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."punch_out"("line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.work_order_lines
  set punched_out_at = now()
  where id = line_id
    and assigned_tech_id = auth.uid()
    and punched_in_at is not null
    and punched_out_at is null;

  if not found then
    raise exception 'No active punch found for this line and user'
      using errcode = '28000';
  end if;
end;
$$;


ALTER FUNCTION "public"."punch_out"("line_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_menu_items_for_shop"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.labor_rate is distinct from old.labor_rate then
    update public.menu_items
      set total_price = coalesce(part_cost,0) + (coalesce(labor_time,0) * coalesce(new.labor_rate,0)),
          labor_hours = coalesce(labor_time, labor_hours)
    where shop_id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."recalc_menu_items_for_shop"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_count int;
BEGIN
  IF p_shop_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
    INTO v_count
  FROM public.profiles
  WHERE shop_id = p_shop_id;

  UPDATE public.shops
  SET active_user_count = v_count
  WHERE id = p_shop_id;
END;
$$;


ALTER FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_part_request_item"("p_item_id" "uuid", "p_location_id" "uuid", "p_qty" numeric, "p_po_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("move_id" "uuid", "qty_received" numeric, "status" "public"."part_request_item_status")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid;
  v_shop_id uuid;

  v_part_id uuid;
  v_work_order_id uuid;
  v_line_id uuid;

  v_qty_received numeric;
  v_qty_target numeric;
  v_add numeric;

  v_new_received numeric;
  v_new_status public.part_request_item_status;

  v_move_row public.stock_moves%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_item_id is null then
    raise exception 'p_item_id is required';
  end if;

  if p_location_id is null then
    raise exception 'p_location_id is required';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'p_qty must be > 0';
  end if;

  -- Load the request item (must be scoped already to shop_id/work_order_id per your v2 migration)
  select
    pri.shop_id,
    pri.part_id,
    pri.work_order_id,
    pri.work_order_line_id,
    greatest(coalesce(pri.qty_received, 0), 0) as qty_received,
    -- target is qty_approved if present, else qty_requested, else legacy qty
    greatest(
      coalesce(pri.qty_approved, 0),
      coalesce(pri.qty_requested, 0),
      coalesce(pri.qty, 0),
      0
    ) as qty_target
  into
    v_shop_id,
    v_part_id,
    v_work_order_id,
    v_line_id,
    v_qty_received,
    v_qty_target
  from public.part_request_items pri
  where pri.id = p_item_id;

  if v_shop_id is null then
    raise exception 'Part request item not found';
  end if;

  if v_part_id is null then
    raise exception 'Cannot receive: item.part_id is NULL';
  end if;

  -- Authorization: staff in shop
  if not exists (
    select 1
    from public.profiles p
    where p.user_id = v_uid
      and p.shop_id = v_shop_id
      and p.role in ('owner','admin','manager','advisor','mechanic','parts')
  ) then
    raise exception 'Not allowed';
  end if;

  -- Clamp to remaining if we have a target > 0 (prevents accidental over-receive)
  if v_qty_target > 0 then
    v_add := least(p_qty, greatest(v_qty_target - v_qty_received, 0));
    -- If already fully received, still allow receiving 0? No: treat as no-op.
    if v_add <= 0 then
      -- return current snapshot without creating stock move
      move_id := null;
      qty_received := v_qty_received;
      status := (select pri.status from public.part_request_items pri where pri.id = p_item_id);
      return next;
      return;
    end if;
  else
    v_add := p_qty;
  end if;

  -- Apply stock move (authoritative inventory record)
  -- Reference: if PO provided, reference purchase_order; otherwise tie to item.
  select *
  into v_move_row
  from public.apply_stock_move(
    p_part => v_part_id,
    p_loc => p_location_id,
    p_qty => v_add,
    p_reason => 'receive',
    p_ref_kind => case when p_po_id is null then 'part_request_item' else 'purchase_order' end,
    p_ref_id => coalesce(p_po_id, p_item_id)
  );

  -- Update item qty_received + status
  v_new_received := v_qty_received + v_add;

  if v_qty_target > 0 and v_new_received >= v_qty_target then
    v_new_status := 'received';
  else
    v_new_status := 'partially_received';
  end if;

  update public.part_request_items
  set
    qty_received = v_new_received,
    status = v_new_status
  where id = p_item_id;

  move_id := v_move_row.id;
  qty_received := v_new_received;
  status := v_new_status;
  return next;
end;
$$;


ALTER FUNCTION "public"."receive_part_request_item"("p_item_id" "uuid", "p_location_id" "uuid", "p_qty" numeric, "p_po_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_po_part_and_allocate"("p_po_id" "uuid", "p_part_id" "uuid", "p_location_id" "uuid", "p_qty" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid;
  v_shop_id uuid;

  v_move public.stock_moves%rowtype;

  v_remaining numeric;
  v_po_closed boolean := false;

  -- allocation loop
  v_item record;
  v_item_target numeric;
  v_item_received numeric;
  v_need numeric;
  v_take numeric;

  v_alloc jsonb := '[]'::jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_po_id is null then raise exception 'p_po_id is required'; end if;
  if p_part_id is null then raise exception 'p_part_id is required'; end if;
  if p_location_id is null then raise exception 'p_location_id is required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'p_qty must be > 0'; end if;

  -- Load PO shop
  select po.shop_id into v_shop_id
  from public.purchase_orders po
  where po.id = p_po_id;

  if v_shop_id is null then
    raise exception 'Purchase order not found';
  end if;

  -- Auth: staff in shop
  if not exists (
    select 1
    from public.profiles p
    where p.user_id = v_uid
      and p.shop_id = v_shop_id
      and p.role in ('owner','admin','manager','advisor','mechanic','parts')
  ) then
    raise exception 'Not allowed';
  end if;

  -- 1) Stock move (authoritative inventory record)
  select *
  into v_move
  from public.apply_stock_move(
    p_part => p_part_id,
    p_loc  => p_location_id,
    p_qty  => p_qty,
    p_reason => 'receive',
    p_ref_kind => 'purchase_order',
    p_ref_id => p_po_id
  );

  -- 2) Update PO lines received_qty (FIFO by created_at)
  v_remaining := p_qty;

  for v_item in
    select id, qty, received_qty
    from public.purchase_order_lines
    where po_id = p_po_id
      and part_id = p_part_id
    order by created_at asc
  loop
    exit when v_remaining <= 0;

    -- how much can this line still accept?
    v_need := greatest(coalesce(v_item.qty,0) - coalesce(v_item.received_qty,0), 0);
    v_take := least(v_remaining, v_need);

    if v_take > 0 then
      update public.purchase_order_lines
      set received_qty = coalesce(received_qty,0) + v_take
      where id = v_item.id;

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  -- 3) Auto-close PO if fully received
  if exists (
    select 1
    from public.purchase_order_lines pol
    where pol.po_id = p_po_id
      and coalesce(pol.received_qty,0) < coalesce(pol.qty,0)
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders
    set status = 'received'
    where id = p_po_id;
    v_po_closed := true;
  end if;

  -- 4) Allocate received qty to part_request_items (FIFO)
  v_remaining := p_qty;

  for v_item in
    select
      pri.id,
      pri.status,
      pri.qty,
      pri.qty_requested,
      pri.qty_approved,
      pri.qty_received
    from public.part_request_items pri
    where pri.shop_id = v_shop_id
      and pri.part_id = p_part_id
      and pri.status in ('approved','reserved','ordered','picking','picked','partially_received')
      and greatest(
            coalesce(pri.qty_approved,0),
            coalesce(pri.qty_requested,0),
            coalesce(pri.qty,0),
            0
          ) > greatest(coalesce(pri.qty_received,0),0)
    order by pri.created_at asc, pri.id asc
  loop
    exit when v_remaining <= 0;

    v_item_target :=
      greatest(
        coalesce(v_item.qty_approved,0),
        coalesce(v_item.qty_requested,0),
        coalesce(v_item.qty,0),
        0
      );

    v_item_received := greatest(coalesce(v_item.qty_received,0),0);
    v_need := greatest(v_item_target - v_item_received, 0);
    v_take := least(v_remaining, v_need);

    if v_take > 0 then
      update public.part_request_items
      set
        qty_received = v_item_received + v_take,
        status = case
          when (v_item_received + v_take) >= v_item_target then 'received'::public.part_request_item_status
          else 'partially_received'::public.part_request_item_status
        end
      where id = v_item.id;

      v_alloc := v_alloc || jsonb_build_object(
        'item_id', v_item.id,
        'delta_received', v_take
      );

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  -- Existing triggers will:
  -- - update stock snapshot (stock_moves -> part_stock)
  -- - re-run reservation + maybe release holds (part_request_items trigger)

  return jsonb_build_object(
    'ok', true,
    'move_id', v_move.id,
    'po_id', p_po_id,
    'po_closed', v_po_closed,
    'part_id', p_part_id,
    'qty_received_total', p_qty,
    'allocations', v_alloc,
    'unallocated_qty', greatest(v_remaining,0)
  );
end;
$$;


ALTER FUNCTION "public"."receive_po_part_and_allocate"("p_po_id" "uuid", "p_part_id" "uuid", "p_location_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_live_invoice_costs"("p_work_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_invoice_id uuid;
  v_labor numeric;
  v_parts numeric;
begin
  v_invoice_id := public.get_live_invoice_id(p_work_order_id);
  if v_invoice_id is null then
    return;
  end if;

  v_labor := public.compute_labor_cost_for_work_order(p_work_order_id);
  v_parts := public.compute_parts_cost_for_work_order(p_work_order_id);

  update public.invoices
    set labor_cost = v_labor,
        parts_cost = v_parts
  where id = v_invoice_id;
end;
$$;


ALTER FUNCTION "public"."recompute_live_invoice_costs"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_wo_status_trigger_func"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform public.recompute_work_order_status(NEW.work_order_id);
  return NEW;
end;
$$;


ALTER FUNCTION "public"."recompute_wo_status_trigger_func"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  has_in_progress boolean;
  has_on_hold     boolean;
  has_queued      boolean;
  has_awaiting    boolean;
  has_planned     boolean;
  has_new         boolean;
  all_completed   boolean;
  new_status      text;
begin
  if p_wo is null then
    return;
  end if;

  select
    bool_or(status = 'in_progress'),
    bool_or(status = 'on_hold'),
    bool_or(status = 'queued'),
    bool_or(status = 'awaiting'),
    bool_or(status = 'planned'),
    bool_or(status = 'new'),
    bool_and(status = 'completed')
  into has_in_progress, has_on_hold, has_queued, has_awaiting, has_planned, has_new, all_completed
  from public.work_order_lines
  where work_order_id = p_wo;

  if has_in_progress then
    new_status := 'in_progress';
  elsif has_on_hold then
    new_status := 'on_hold';
  elsif has_queued then
    new_status := 'queued';
  elsif has_awaiting then
    new_status := 'awaiting';
  elsif has_planned then
    new_status := 'planned';
  elsif has_new then
    new_status := 'new';
  elsif all_completed then
    new_status := 'completed';
  else
    select status into new_status from public.work_orders where id = p_wo;
  end if;

  update public.work_orders
     set status = new_status,
         updated_at = now()
   where id = p_wo
     and (status is distinct from new_status);
end;
$$;


ALTER FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "video_platform_post_id" "uuid",
    "metric_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "platform" "text" NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "watch_time_seconds" numeric(14,2) DEFAULT 0 NOT NULL,
    "avg_watch_seconds" numeric(14,2) DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "shares" integer DEFAULT 0 NOT NULL,
    "saves" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "leads" integer DEFAULT 0 NOT NULL,
    "bookings" integer DEFAULT 0 NOT NULL,
    "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_metrics_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'tiktok'::"text", 'youtube'::"text", 'linkedin'::"text", 'x'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."video_metrics" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_video_metric"("p_shop_id" "uuid", "p_video_id" "uuid", "p_platform" "text", "p_metric_date" "date", "p_impressions" integer DEFAULT 0, "p_views" integer DEFAULT 0, "p_watch_time_seconds" numeric DEFAULT 0, "p_avg_watch_seconds" numeric DEFAULT 0, "p_likes" integer DEFAULT 0, "p_comments" integer DEFAULT 0, "p_shares" integer DEFAULT 0, "p_saves" integer DEFAULT 0, "p_clicks" integer DEFAULT 0, "p_leads" integer DEFAULT 0, "p_bookings" integer DEFAULT 0, "p_revenue" numeric DEFAULT 0, "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."video_metrics"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.video_metrics;
begin
  insert into public.video_metrics (
    shop_id,
    video_id,
    platform,
    metric_date,
    impressions,
    views,
    watch_time_seconds,
    avg_watch_seconds,
    likes,
    comments,
    shares,
    saves,
    clicks,
    leads,
    bookings,
    revenue,
    meta
  )
  values (
    p_shop_id,
    p_video_id,
    p_platform,
    p_metric_date,
    coalesce(p_impressions, 0),
    coalesce(p_views, 0),
    coalesce(p_watch_time_seconds, 0),
    coalesce(p_avg_watch_seconds, 0),
    coalesce(p_likes, 0),
    coalesce(p_comments, 0),
    coalesce(p_shares, 0),
    coalesce(p_saves, 0),
    coalesce(p_clicks, 0),
    coalesce(p_leads, 0),
    coalesce(p_bookings, 0),
    coalesce(p_revenue, 0),
    coalesce(p_meta, '{}'::jsonb)
  )
  on conflict (video_id, platform, metric_date)
  do update set
    impressions = excluded.impressions,
    views = excluded.views,
    watch_time_seconds = excluded.watch_time_seconds,
    avg_watch_seconds = excluded.avg_watch_seconds,
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    saves = excluded.saves,
    clicks = excluded.clicks,
    leads = excluded.leads,
    bookings = excluded.bookings,
    revenue = excluded.revenue,
    meta = excluded.meta,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."record_video_metric"("p_shop_id" "uuid", "p_video_id" "uuid", "p_platform" "text", "p_metric_date" "date", "p_impressions" integer, "p_views" integer, "p_watch_time_seconds" numeric, "p_avg_watch_seconds" numeric, "p_likes" integer, "p_comments" integer, "p_shares" integer, "p_saves" integer, "p_clicks" integer, "p_leads" integer, "p_bookings" integer, "p_revenue" numeric, "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_work_order_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_wo_id uuid := new.work_order_id;
  v_current text;
  v_new     text;
  b_any_lines boolean;
  b_any_in_progress boolean;
  b_any_on_hold boolean;
  b_all_completed boolean;
begin
  if v_wo_id is null then
    return new;
  end if;

  select status into v_current
  from public.work_orders
  where id = v_wo_id
  for update;

  -- Don’t auto-change if awaiting_approval or invoiced
  if v_current in ('awaiting_approval', 'invoiced') then
    return new;
  end if;

  select
    count(*) > 0                                         as any_lines,
    bool_or((coalesce(status,'') = 'in_progress')
            or (punched_in_at is not null and punched_out_at is null)) as any_in_progress,
    bool_or(coalesce(status,'') = 'on_hold')             as any_on_hold,
    bool_and(coalesce(status,'') = 'completed')          as all_completed
  into
    b_any_lines,
    b_any_in_progress,
    b_any_on_hold,
    b_all_completed
  from public.work_order_lines
  where work_order_id = v_wo_id;

  if b_any_in_progress then
    v_new := 'in_progress';
  elsif b_any_on_hold then
    v_new := 'on_hold';
  elsif b_any_lines and b_all_completed then
    v_new := 'ready_to_invoice';
  else
    v_new := 'queued';
  end if;

  if coalesce(v_current, '') is distinct from coalesce(v_new, '') then
    update public.work_orders
    set status = v_new
    where id = v_wo_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."refresh_work_order_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_work_order_status_del"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_wo_id uuid := old.work_order_id;
  v_current text;
  v_new     text;
  b_any_lines boolean;
  b_any_in_progress boolean;
  b_any_on_hold boolean;
  b_all_completed boolean;
begin
  if v_wo_id is null then
    return old;
  end if;

  select status into v_current
  from public.work_orders
  where id = v_wo_id
  for update;

  if v_current in ('awaiting_approval', 'invoiced') then
    return old;
  end if;

  select
    count(*) > 0                                         as any_lines,
    bool_or((coalesce(status,'') = 'in_progress')
            or (punched_in_at is not null and punched_out_at is null)) as any_in_progress,
    bool_or(coalesce(status,'') = 'on_hold')             as any_on_hold,
    bool_and(coalesce(status,'') = 'completed')          as all_completed
  into
    b_any_lines,
    b_any_in_progress,
    b_any_on_hold,
    b_all_completed
  from public.work_order_lines
  where work_order_id = v_wo_id;

  if b_any_in_progress then
    v_new := 'in_progress';
  elsif b_any_on_hold then
    v_new := 'on_hold';
  elsif b_any_lines and b_all_completed then
    v_new := 'ready_to_invoice';
  else
    v_new := 'queued';
  end if;

  if coalesce(v_current, '') is distinct from coalesce(v_new, '') then
    update public.work_orders
    set status = v_new
    where id = v_wo_id;
  end if;

  return old;
end;
$$;


ALTER FUNCTION "public"."refresh_work_order_status_del"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_avail numeric;
  v_need numeric;
  v_take numeric;
begin
  if p_work_order_line_id is null then
    return;
  end if;

  select i.shop_id into v_shop_id
  from public.part_request_items i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id is not null
  limit 1;

  if v_shop_id is null then
    select wl.shop_id into v_shop_id from public.work_order_lines wl where wl.id = p_work_order_line_id;
  end if;
  if v_shop_id is null then return; end if;

  for r in
    select
      i.id,
      i.part_id,
      coalesce(i.location_id, public.get_default_stock_location(v_shop_id)) as location_id,
      greatest(coalesce(i.qty_approved, 0), 0) as qty_approved,
      greatest(coalesce(i.qty_reserved, 0), 0) as qty_reserved,
      greatest(coalesce(i.qty_received, 0), 0) as qty_received,
      i.status
    from public.part_request_items i
    where i.work_order_line_id = p_work_order_line_id
      and i.part_id is not null
      and greatest(coalesce(i.qty_approved, 0), 0) > 0
      and i.status in ('approved','reserved','ordered','partially_received','picking','picked')
    order by i.id asc
  loop
    v_location_id := r.location_id;
    if v_location_id is null then continue; end if;

    v_need := greatest(r.qty_approved - r.qty_reserved - r.qty_received, 0);
    if v_need <= 0 then
      update public.part_request_items
      set location_id = v_location_id, status = 'reserved'
      where id = r.id and status = 'approved';
      continue;
    end if;

    insert into public.part_stock (part_id, location_id, qty_on_hand, qty_reserved)
    values (r.part_id, v_location_id, 0, 0)
    on conflict (part_id, location_id) do nothing;

    select (ps.qty_on_hand - ps.qty_reserved) into v_avail
    from public.part_stock ps
    where ps.part_id = r.part_id and ps.location_id = v_location_id
    for update;

    v_avail := coalesce(v_avail, 0);
    v_take := least(v_avail, v_need);

    if v_take > 0 then
      update public.part_stock set qty_reserved = qty_reserved + v_take
      where part_id = r.part_id and location_id = v_location_id;

      update public.part_request_items
      set location_id = v_location_id,
          qty_reserved = qty_reserved + v_take,
          status = case when (qty_received + qty_reserved + v_take) >= qty_approved then 'reserved' else 'ordered' end
      where id = r.id;
    else
      update public.part_request_items
      set location_id = v_location_id, status = 'ordered'
      where id = r.id and status <> 'ordered';
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid", "p_location_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_avail numeric;
  v_need numeric;
  v_take numeric;
begin
  if p_work_order_line_id is null then
    return;
  end if;

  select i.shop_id into v_shop_id
  from public.part_request_items i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id is not null
  limit 1;

  if v_shop_id is null then
    select wl.shop_id into v_shop_id from public.work_order_lines wl where wl.id = p_work_order_line_id;
  end if;
  if v_shop_id is null then return; end if;

  -- Determine location from input or default per-item
  for r in
    select
      i.id,
      i.part_id,
      coalesce(p_location_id, i.location_id, public.get_default_stock_location(v_shop_id)) as location_id,
      greatest(coalesce(i.qty_approved, 0), 0) as qty_approved,
      greatest(coalesce(i.qty_reserved, 0), 0) as qty_reserved,
      greatest(coalesce(i.qty_received, 0), 0) as qty_received,
      i.status
    from public.part_request_items i
    where i.work_order_line_id = p_work_order_line_id
      and i.part_id is not null
      and greatest(coalesce(i.qty_approved, 0), 0) > 0
      and i.status in ('approved','reserved','ordered','partially_received','picking','picked')
    order by i.id asc
  loop
    v_location_id := r.location_id;

    if v_location_id is null then
      raise exception 'No stock location available for shop %', v_shop_id;
    end if;

    v_need := greatest(r.qty_approved - r.qty_reserved - r.qty_received, 0);
    if v_need <= 0 then
      update public.part_request_items
      set location_id = v_location_id, status = 'reserved'
      where id = r.id and status = 'approved';
      continue;
    end if;

    insert into public.part_stock (part_id, location_id, qty_on_hand, qty_reserved)
    values (r.part_id, v_location_id, 0, 0)
    on conflict (part_id, location_id) do nothing;

    select (ps.qty_on_hand - ps.qty_reserved) into v_avail
    from public.part_stock ps
    where ps.part_id = r.part_id and ps.location_id = v_location_id
    for update;

    v_avail := coalesce(v_avail, 0);
    v_take := least(v_avail, v_need);

    if v_take > 0 then
      update public.part_stock set qty_reserved = qty_reserved + v_take
      where part_id = r.part_id and location_id = v_location_id;

      update public.part_request_items
      set location_id = v_location_id,
          qty_reserved = qty_reserved + v_take,
          status = case when (qty_received + qty_reserved + v_take) >= qty_approved then 'reserved' else 'ordered' end
      where id = r.id;
    else
      update public.part_request_items
      set location_id = v_location_id, status = 'ordered'
      where id = r.id and status <> 'ordered';
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_fleet_id_from_vehicle"("p_vehicle_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_fleet_id uuid;
begin
  select fv.fleet_id
    into v_fleet_id
  from public.fleet_vehicles fv
  where fv.vehicle_id = p_vehicle_id
  limit 1;

  if v_fleet_id is null then
    raise exception 'Unable to resolve fleet_id from vehicle_id=%', p_vehicle_id
      using errcode = '23514'; -- check_violation style error
  end if;

  return v_fleet_id;
end $$;


ALTER FUNCTION "public"."resolve_fleet_id_from_vehicle"("p_vehicle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_qty_to_return numeric;
begin
  if p_request_item_id is null then
    return;
  end if;

  select
    i.id,
    i.shop_id,
    i.part_id,
    i.location_id,
    i.qty_consumed
  into r
  from public.part_request_items i
  where i.id = p_request_item_id;

  if r.id is null or r.part_id is null then
    return;
  end if;

  v_shop_id := r.shop_id;
  if v_shop_id is null then
    raise exception 'part_request_items.shop_id is required';
  end if;

  v_location_id := r.location_id;
  if v_location_id is null then
    v_location_id := public.get_default_stock_location(v_shop_id);
  end if;

  if v_location_id is null then
    raise exception 'No stock location available for shop %', v_shop_id;
  end if;

  v_qty_to_return := coalesce(p_qty, r.qty_consumed);
  v_qty_to_return := greatest(coalesce(v_qty_to_return,0), 0);
  v_qty_to_return := least(v_qty_to_return, greatest(coalesce(r.qty_consumed,0),0));

  if v_qty_to_return <= 0 then
    return;
  end if;

  -- Return stock (+qty, return)
  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by
  )
  values (
    v_shop_id,
    r.part_id,
    v_location_id,
    v_qty_to_return,
    'return',
    'part_request_item',
    r.id,
    auth.uid()
  )
  on conflict do nothing;

  update public.part_request_items
  set
    qty_consumed = greatest(coalesce(qty_consumed,0) - v_qty_to_return, 0),
    updated_at = now()
  where id = r.id;
end;
$$;


ALTER FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric DEFAULT NULL::numeric, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_qty_to_return numeric;
begin
  if p_request_item_id is null then
    return;
  end if;

  select
    i.id,
    i.shop_id,
    i.part_id,
    i.location_id,
    i.qty_consumed
  into r
  from public.part_request_items i
  where i.id = p_request_item_id;

  if r.id is null or r.part_id is null then
    return;
  end if;

  v_shop_id := r.shop_id;
  if v_shop_id is null then
    raise exception 'part_request_items.shop_id is required';
  end if;

  v_location_id := coalesce(p_location_id, r.location_id, public.get_default_stock_location(v_shop_id));

  if v_location_id is null then
    raise exception 'No stock location available for shop %', v_shop_id;
  end if;

  v_qty_to_return := coalesce(p_qty, r.qty_consumed);
  v_qty_to_return := greatest(coalesce(v_qty_to_return,0), 0);
  v_qty_to_return := least(v_qty_to_return, greatest(coalesce(r.qty_consumed,0),0));

  if v_qty_to_return <= 0 then
    return;
  end if;

  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by
  )
  values (
    v_shop_id,
    r.part_id,
    v_location_id,
    v_qty_to_return,
    'return',
    'part_request_item',
    r.id,
    auth.uid()
  )
  on conflict do nothing;

  update public.part_request_items
  set
    location_id = v_location_id,
    qty_consumed = greatest(coalesce(qty_consumed,0) - v_qty_to_return, 0),
    updated_at = now()
  where id = r.id;
end;
$$;


ALTER FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_hours"("shop_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.shop_hours (shop_id, weekday, open_time, close_time)
  select shop_id, d, '08:00', '17:00'
  from generate_series(1,5) as d
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."seed_default_hours"("shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only allow within same shop (prevents cross-tenant issues even with definer)
  if not public._ensure_same_shop(_wo) then
    raise exception 'Not permitted for this work order';
  end if;

  update public.work_order_lines
     set approval_state = 'pending',
         approval_at    = null,
         approval_by    = null
   where work_order_id = _wo
     and id = any(_line_ids);

  if _set_wo_status then
    update public.work_orders
       set status = 'awaiting_approval',
           approval_state = 'pending'
     where id = _wo;
  end if;
end;
$$;


ALTER FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_authenticated"("uid" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  select
    set_config('request.jwt.claim.role', 'authenticated', true),
    set_config('request.jwt.claim.sub', uid::text, true);
$$;


ALTER FUNCTION "public"."set_authenticated"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.shop_id = p_shop_id
  ) then
    raise exception 'Not authorized to select this shop';
  end if;

  perform set_config('app.current_shop_id', p_shop_id::text, true);
end;
$$;


ALTER FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_shop_id_from_row"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform set_config('app.current_shop_id', new.shop_id::text, true);
  return new;
end;
$$;


ALTER FUNCTION "public"."set_current_shop_id_from_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_inspection_template_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.shop_id is null then
    select p.shop_id into new.shop_id
    from public.profiles p
    where p.user_id = auth.uid() or p.id = auth.uid()
    limit 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_inspection_template_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_last_active_now"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."set_last_active_now"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_edited_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    BEGIN
      IF NEW.content IS DISTINCT FROM OLD.content
         OR NEW.attachments IS DISTINCT FROM OLD.attachments THEN
        NEW.edited_at := NOW();
      END IF;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."set_message_edited_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_owner_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.profiles p
     set shop_id = new.id
   where p.id = new.owner_id
     and (p.shop_id is distinct from new.id);
  return new;
end $$;


ALTER FUNCTION "public"."set_owner_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_part_request_status"("p_request" "uuid", "p_status" "public"."part_request_status") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.part_requests
  set status = p_status
  where id = p_request
    and shop_id = public.current_shop_id();
$$;


ALTER FUNCTION "public"."set_part_request_status"("p_request" "uuid", "p_status" "public"."part_request_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_shop_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end$$;


ALTER FUNCTION "public"."set_shop_profiles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_shop_ratings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end$$;


ALTER FUNCTION "public"."set_shop_ratings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_work_order_quote_lines"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."set_updated_at_work_order_quote_lines"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_wol_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.shop_id is null then
    select w.shop_id into new.shop_id
    from public.work_orders w
    where w.id = new.work_order_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_wol_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_wol_shop_id_from_wo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.work_order_id is not null and new.shop_id is null then
    select wo.shop_id into new.shop_id
    from work_orders wo
    where wo.id = new.work_order_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_wol_shop_id_from_wo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_id_for"("uid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select p.shop_id
  from public.profiles p
  where p.id = uid
$$;


ALTER FUNCTION "public"."shop_id_for"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_reel_settings_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."shop_reel_settings_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_role"("shop_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  select sm.role
  from public.shop_members sm
  where sm.shop_id = $1
    and sm.user_id = auth.uid()
  limit 1;
$_$;


ALTER FUNCTION "public"."shop_role"("shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_role_v2"("shop_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$ select public.shop_role($1); $_$;


ALTER FUNCTION "public"."shop_role_v2"("shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_staff_user_count"("p_shop_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  select count(*)
  from public.profiles p
  where p.shop_id = p_shop_id
$$;


ALTER FUNCTION "public"."shop_staff_user_count"("p_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shopreel_manual_assets_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."shopreel_manual_assets_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sign_inspection"("p_inspection_id" "uuid", "p_role" "text", "p_signed_name" "text", "p_signature_image_path" "text" DEFAULT NULL::"text", "p_signature_hash" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid uuid := auth.uid();
  v_locked boolean;
begin
  select locked into v_locked from public.inspections where id = p_inspection_id;
  if v_locked then
    raise exception 'inspection % is locked', p_inspection_id using errcode = '23514';
  end if;

  insert into public.inspection_signatures
    (inspection_id, role, signed_by, signed_name, signature_image_path, signature_hash)
  values
    (p_inspection_id, p_role, v_uid, p_signed_name, p_signature_image_path, p_signature_hash);

  update public.inspections
    set finalized_at = coalesce(finalized_at, now()),
        finalized_by = coalesce(finalized_by, v_uid),
        locked = true
  where id = p_inspection_id;
end;
$$;


ALTER FUNCTION "public"."sign_inspection"("p_inspection_id" "uuid", "p_role" "text", "p_signed_name" "text", "p_signature_image_path" "text", "p_signature_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_line_on_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only on first transition into 'completed'
  if tg_op = 'UPDATE'
     and new.status = 'completed'
     and coalesce(old.status,'') <> 'completed'
  then
    insert into public.work_order_line_history (
      work_order_id,
      line_id,
      status,
      reason,
      snapshot,
      created_at
    )
    values (
      new.work_order_id,
      new.id,
      coalesce(new.status,'awaiting'),
      'line_completed',
      to_jsonb(new),
      now()
    );
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."snapshot_line_on_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_wol_on_wo_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Only when status changes into 'completed'
  if (TG_OP = 'UPDATE' and NEW.status = 'completed' and coalesce(OLD.status,'') <> 'completed') then
    insert into public.work_order_line_history (work_order_id, snapshot, reason)
    select
      NEW.id,
      jsonb_agg(to_jsonb(wol.*)),
      'wo_completed'
    from public.work_order_lines wol
    where wol.work_order_id = NEW.id;

  end if;
  return NEW;
end
$$;


ALTER FUNCTION "public"."snapshot_wol_on_wo_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_inspections_from_inspection_sessions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_shop_id uuid;
BEGIN
  IF NEW.work_order_id IS NULL OR NEW.work_order_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT wo.shop_id INTO v_shop_id
  FROM public.work_orders wo
  WHERE wo.id = NEW.work_order_id;

  INSERT INTO public.inspections (
    work_order_id,
    work_order_line_id,
    shop_id,
    user_id,
    summary,
    is_draft,
    completed,
    locked,
    status,
    updated_at
  )
  VALUES (
    NEW.work_order_id,
    NEW.work_order_line_id,
    v_shop_id,
    NEW.user_id,
    NEW.state,
    TRUE,
    FALSE,
    FALSE,
    'draft',
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (work_order_line_id)
  DO UPDATE SET
    work_order_id = EXCLUDED.work_order_id,
    shop_id      = COALESCE(EXCLUDED.shop_id, public.inspections.shop_id),
    user_id      = COALESCE(EXCLUDED.user_id, public.inspections.user_id),
    summary      = EXCLUDED.summary,
    is_draft     = TRUE,
    completed    = FALSE,
    locked       = FALSE,
    status       = 'draft',
    updated_at   = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_inspections_from_inspection_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_invoice_from_work_order"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_shop_id uuid;
  v_customer_id uuid;
  v_total numeric(12,2);
  v_labor numeric(12,2);
begin
  v_shop_id := coalesce(NEW.shop_id, OLD.shop_id);
  v_customer_id := coalesce(NEW.customer_id, OLD.customer_id);

  select
    coalesce(sum(price_estimate), 0)::numeric(12,2) as total_estimate,
    coalesce(sum(labor_time), 0)::numeric(12,2)     as labor_estimate
  into v_total, v_labor
  from public.work_order_lines
  where work_order_id = coalesce(NEW.id, OLD.id);

  if v_shop_id is null then
    return NEW;
  end if;

  if NEW.status not in ('ready_to_invoice', 'invoiced') then
    return NEW;
  end if;

  insert into public.invoices (
    shop_id,
    work_order_id,
    customer_id,
    tech_id,
    invoice_number,
    status,
    subtotal,
    labor_cost,
    parts_cost,
    discount_total,
    tax_total,
    total,
    currency,
    issued_at,
    updated_at
  )
  values (
    v_shop_id,
    NEW.id,
    v_customer_id,
    null,
    concat('WO-', substr(NEW.id::text, 1, 8)),
    case when NEW.status = 'invoiced' then 'issued' else 'draft' end,
    v_total,
    v_labor,
    greatest(v_total - v_labor, 0),
    0,
    0,
    v_total,
    'USD',
    now(),
    now()
  )
  on conflict (work_order_id)
  do update set
    shop_id      = excluded.shop_id,
    customer_id  = excluded.customer_id,
    subtotal     = excluded.subtotal,
    labor_cost   = excluded.labor_cost,
    parts_cost   = excluded.parts_cost,
    total        = excluded.total,
    status       = excluded.status,
    updated_at   = now();

  return NEW;
end
$$;


ALTER FUNCTION "public"."sync_invoice_from_work_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_invoice_from_work_order"("p_work_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_shop_id uuid;
  v_customer_id uuid;
  v_shop_country text;
  v_labor_rate numeric := 0;

  v_labor_hours numeric := 0;
  v_labor_cost  numeric := 0;

  v_parts_cost_alloc numeric := 0;
  v_parts_cost_billed numeric := 0;
  v_parts_cost numeric := 0;

  v_existing_currency text;
  v_currency text;

  v_tax_total numeric := 0;
  v_discount_total numeric := 0;

  v_subtotal_raw numeric := 0;
  v_subtotal numeric := 0;
  v_total numeric := 0;

  v_existing record;
begin
  -- -----------------------------
  -- Auth guard (user-safe)
  -- -----------------------------
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select wo.shop_id, wo.customer_id
    into v_shop_id, v_customer_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_shop_id is null then
    raise exception 'Work order not found';
  end if;

  if not exists (
    select 1
    from public.user_shops us
    where us.shop_id = v_shop_id
      and us.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  -- -----------------------------
  -- Load shop details
  -- -----------------------------
  select
    coalesce(nullif(btrim(s.country), ''), 'US'),
    coalesce(s.labor_rate, 0)
  into v_shop_country, v_labor_rate
  from public.shops s
  where s.id = v_shop_id;

  v_labor_rate := coalesce(v_labor_rate, 0);

  -- -----------------------------
  -- Load latest invoice snapshot (if any)
  -- We preserve tax/discount/status/invoice_number/etc.
  -- -----------------------------
  select
    i.id,
    i.currency,
    coalesce(i.tax_total, 0) as tax_total,
    coalesce(i.discount_total, 0) as discount_total
  into v_existing
  from public.invoices i
  where i.work_order_id = p_work_order_id
  order by i.created_at desc
  limit 1;

  v_tax_total := coalesce(v_existing.tax_total, 0);
  v_discount_total := coalesce(v_existing.discount_total, 0);
  v_existing_currency := case when v_existing.currency is null then null else btrim(v_existing.currency::text) end;

  -- -----------------------------
  -- Compute labor in MONEY
  -- -----------------------------
  select coalesce(sum(coalesce(wol.labor_time, 0)), 0)
    into v_labor_hours
  from public.work_order_lines wol
  where wol.work_order_id = p_work_order_id;

  v_labor_hours := coalesce(v_labor_hours, 0);
  v_labor_cost := greatest(v_labor_hours * v_labor_rate, 0);

  -- -----------------------------
  -- Compute parts from allocations (authoritative in your current data)
  -- Fallback to billed parts if allocations are empty
  -- -----------------------------
  select coalesce(sum(greatest(coalesce(a.qty, 0), 0) * greatest(coalesce(a.unit_cost, 0), 0)), 0)
    into v_parts_cost_alloc
  from public.work_order_part_allocations a
  where a.work_order_id = p_work_order_id;

  select coalesce(sum(
      case
        when coalesce(p.total_price, 0) > 0 then coalesce(p.total_price, 0)
        else greatest(coalesce(p.quantity, 0), 0) * greatest(coalesce(p.unit_price, 0), 0)
      end
    ), 0)
    into v_parts_cost_billed
  from public.work_order_parts p
  where p.work_order_id = p_work_order_id;

  if coalesce(v_parts_cost_alloc, 0) > 0 then
    v_parts_cost := v_parts_cost_alloc;
  else
    v_parts_cost := v_parts_cost_billed;
  end if;

  v_parts_cost := greatest(coalesce(v_parts_cost, 0), 0);

  -- -----------------------------
  -- Currency (FIX)
  -- - derive from shop country
  -- - override the common wrong case: CA shop + USD currency => CAD
  -- -----------------------------
  v_currency :=
    case
      when upper(v_shop_country) = 'CA' then 'CAD'
      else 'USD'
    end;

  if v_existing_currency is not null and v_existing_currency in ('CAD','USD') then
    -- keep existing unless it's the "wrong default" for CA shops
    if upper(v_shop_country) = 'CA' and v_existing_currency = 'USD' then
      v_currency := 'CAD';
    else
      v_currency := v_existing_currency;
    end if;
  end if;

  -- -----------------------------
  -- Totals
  -- subtotal = labor + parts - discount (clamped)
  -- total    = subtotal + tax_total
  -- -----------------------------
  v_subtotal_raw := coalesce(v_labor_cost, 0) + coalesce(v_parts_cost, 0);
  v_subtotal := greatest(v_subtotal_raw - coalesce(v_discount_total, 0), 0);
  v_total := greatest(v_subtotal + coalesce(v_tax_total, 0), 0);

  -- -----------------------------
  -- Upsert invoice
  -- (requires UNIQUE on invoices(work_order_id) for ON CONFLICT)
  -- -----------------------------
  insert into public.invoices (
    shop_id,
    work_order_id,
    customer_id,
    status,
    subtotal,
    parts_cost,
    labor_cost,
    discount_total,
    tax_total,
    total,
    currency,
    issued_at,
    created_at,
    updated_at
  )
  values (
    v_shop_id,
    p_work_order_id,
    v_customer_id,
    'invoiced',
    v_subtotal,
    v_parts_cost,
    v_labor_cost,
    v_discount_total,
    v_tax_total,
    v_total,
    v_currency,
    now(),
    now(),
    now()
  )
  on conflict (work_order_id) do update
  set
    shop_id = excluded.shop_id,
    customer_id = excluded.customer_id,
    -- keep existing status if present; else take excluded
    status = coalesce(public.invoices.status, excluded.status),

    labor_cost = excluded.labor_cost,
    parts_cost = excluded.parts_cost,
    subtotal = excluded.subtotal,
    total = excluded.total,

    -- keep existing tax/discount if already set (tax is location-based elsewhere)
    tax_total = coalesce(public.invoices.tax_total, excluded.tax_total),
    discount_total = coalesce(public.invoices.discount_total, excluded.discount_total),

    currency = excluded.currency,

    issued_at = coalesce(public.invoices.issued_at, excluded.issued_at),
    updated_at = now();

  -- -----------------------------
  -- Cache totals on work_orders (so UI + PDFs can read them)
  -- -----------------------------
  update public.work_orders
  set
    labor_total = v_labor_cost,
    parts_total = v_parts_cost,
    invoice_total = v_total,
    updated_at = now()
  where id = p_work_order_id;

end;
$$;


ALTER FUNCTION "public"."sync_invoice_from_work_order"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_invoice_from_work_order_admin"("p_work_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_shop_id uuid;
  v_customer_id uuid;
  v_shop_country text;
  v_labor_rate numeric := 0;

  v_labor_hours numeric := 0;
  v_labor_cost  numeric := 0;

  v_parts_cost_alloc numeric := 0;
  v_parts_cost_billed numeric := 0;
  v_parts_cost numeric := 0;

  v_existing_currency text;
  v_currency text;

  v_tax_total numeric := 0;
  v_discount_total numeric := 0;

  v_subtotal_raw numeric := 0;
  v_subtotal numeric := 0;
  v_total numeric := 0;

  v_existing record;
begin
  -- Work order basics
  select wo.shop_id, wo.customer_id
    into v_shop_id, v_customer_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_shop_id is null then
    raise exception 'Work order not found';
  end if;

  -- Shop details
  select
    coalesce(nullif(btrim(s.country), ''), 'US'),
    coalesce(s.labor_rate, 0)
  into v_shop_country, v_labor_rate
  from public.shops s
  where s.id = v_shop_id;

  v_labor_rate := coalesce(v_labor_rate, 0);

  -- Latest invoice snapshot (preserve tax/discount if already set)
  select
    i.id,
    i.currency,
    coalesce(i.tax_total, 0) as tax_total,
    coalesce(i.discount_total, 0) as discount_total
  into v_existing
  from public.invoices i
  where i.work_order_id = p_work_order_id
  order by i.created_at desc
  limit 1;

  v_tax_total := coalesce(v_existing.tax_total, 0);
  v_discount_total := coalesce(v_existing.discount_total, 0);
  v_existing_currency := case when v_existing.currency is null then null else btrim(v_existing.currency::text) end;

  -- Labor dollars
  select coalesce(sum(coalesce(wol.labor_time, 0)), 0)
    into v_labor_hours
  from public.work_order_lines wol
  where wol.work_order_id = p_work_order_id;

  v_labor_hours := coalesce(v_labor_hours, 0);
  v_labor_cost := greatest(v_labor_hours * v_labor_rate, 0);

  -- Parts dollars: allocations (preferred) then billed parts fallback
  select coalesce(sum(greatest(coalesce(a.qty, 0), 0) * greatest(coalesce(a.unit_cost, 0), 0)), 0)
    into v_parts_cost_alloc
  from public.work_order_part_allocations a
  where a.work_order_id = p_work_order_id;

  select coalesce(sum(
      case
        when coalesce(p.total_price, 0) > 0 then coalesce(p.total_price, 0)
        else greatest(coalesce(p.quantity, 0), 0) * greatest(coalesce(p.unit_price, 0), 0)
      end
    ), 0)
    into v_parts_cost_billed
  from public.work_order_parts p
  where p.work_order_id = p_work_order_id;

  if coalesce(v_parts_cost_alloc, 0) > 0 then
    v_parts_cost := v_parts_cost_alloc;
  else
    v_parts_cost := v_parts_cost_billed;
  end if;

  v_parts_cost := greatest(coalesce(v_parts_cost, 0), 0);

  -- Currency (shop-derived, fix CA+USD default case)
  v_currency :=
    case
      when upper(v_shop_country) = 'CA' then 'CAD'
      else 'USD'
    end;

  if v_existing_currency is not null and v_existing_currency in ('CAD','USD') then
    if upper(v_shop_country) = 'CA' and v_existing_currency = 'USD' then
      v_currency := 'CAD';
    else
      v_currency := v_existing_currency;
    end if;
  end if;

  -- Totals
  v_subtotal_raw := coalesce(v_labor_cost, 0) + coalesce(v_parts_cost, 0);
  v_subtotal := greatest(v_subtotal_raw - coalesce(v_discount_total, 0), 0);
  v_total := greatest(v_subtotal + coalesce(v_tax_total, 0), 0);

  -- Upsert invoice
  insert into public.invoices (
    shop_id,
    work_order_id,
    customer_id,
    status,
    subtotal,
    parts_cost,
    labor_cost,
    discount_total,
    tax_total,
    total,
    currency,
    issued_at,
    created_at,
    updated_at
  )
  values (
    v_shop_id,
    p_work_order_id,
    v_customer_id,
    'invoiced',
    v_subtotal,
    v_parts_cost,
    v_labor_cost,
    v_discount_total,
    v_tax_total,
    v_total,
    v_currency,
    now(),
    now(),
    now()
  )
  on conflict (work_order_id) do update
  set
    shop_id = excluded.shop_id,
    customer_id = excluded.customer_id,
    status = coalesce(public.invoices.status, excluded.status),

    labor_cost = excluded.labor_cost,
    parts_cost = excluded.parts_cost,
    subtotal = excluded.subtotal,
    total = excluded.total,

    tax_total = coalesce(public.invoices.tax_total, excluded.tax_total),
    discount_total = coalesce(public.invoices.discount_total, excluded.discount_total),

    currency = excluded.currency,

    issued_at = coalesce(public.invoices.issued_at, excluded.issued_at),
    updated_at = now();

  -- Cache totals on work_orders
  update public.work_orders
  set
    labor_total = v_labor_cost,
    parts_total = v_parts_cost,
    invoice_total = v_total,
    updated_at = now()
  where id = p_work_order_id;

end;
$$;


ALTER FUNCTION "public"."sync_invoice_from_work_order_admin"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profiles_user_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.user_id := new.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profiles_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_work_order_line_assignee"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- If one is set and the other is null, copy it across
  if new.assigned_tech_id is null and new.assigned_to is not null then
    new.assigned_tech_id := new.assigned_to;
  elsif new.assigned_to is null and new.assigned_tech_id is not null then
    new.assigned_to := new.assigned_tech_id;
  end if;

  -- If both are set but different, prefer assigned_tech_id and overwrite assigned_to
  if new.assigned_tech_id is not null
     and new.assigned_to is not null
     and new.assigned_tech_id <> new.assigned_to then
    new.assigned_to := new.assigned_tech_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_work_order_line_assignee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_invoices_compute_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Always recompute subtotal from labor+parts (discount is applied at total level)
  new.subtotal := coalesce(new.labor_cost,0) + coalesce(new.parts_cost,0);

  -- Total = subtotal + tax - discount
  new.total := coalesce(new.subtotal,0) + coalesce(new.tax_total,0) - coalesce(new.discount_total,0);

  return new;
end;
$$;


ALTER FUNCTION "public"."tg_invoices_compute_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_invoices_sync_work_orders"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.work_order_id is not null then
    update public.work_orders wo
    set
      labor_total   = new.labor_cost,
      parts_total   = new.parts_cost,
      invoice_total = new.total
    where wo.id = new.work_order_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."tg_invoices_sync_work_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_log_part_fitment_event_from_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_shop_id uuid;
  v_vehicle_id uuid;
  v_vehicle_signature_id uuid;
  v_vehicle_year integer;
  v_vehicle_trim text;
  v_part record;
begin
  select
    wol.shop_id,
    wol.vehicle_id
  into
    v_shop_id,
    v_vehicle_id
  from public.work_order_lines wol
  where wol.id = new.work_order_line_id;

  if v_shop_id is null or new.part_id is null then
    return new;
  end if;

  if v_vehicle_id is not null then
    v_vehicle_signature_id :=
      public.get_or_create_vehicle_signature(v_shop_id, v_vehicle_id);

    select year, trim
      into v_vehicle_year, v_vehicle_trim
    from public.vehicle_signatures
    where id = v_vehicle_signature_id;
  end if;

  select
    supplier,
    part_number
  into v_part
  from public.parts
  where id = new.part_id;

  insert into public.part_fitment_events (
    shop_id,
    part_id,
    vehicle_signature_id,
    allocation_id,
    vehicle_year,
    vehicle_trim,
    event_type,
    part_supplier,
    part_number,
    confidence_source,
    confidence_score
  )
  values (
    v_shop_id,
    new.part_id,
    v_vehicle_signature_id,
    new.id,
    v_vehicle_year,
    v_vehicle_trim,
    'allocated',
    v_part.supplier,
    v_part.part_number,
    'manual',
    1
  )
  on conflict (allocation_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."tg_log_part_fitment_event_from_allocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_log_part_fitment_event_from_consumption"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event public.part_fitment_events%rowtype;
begin
  if new.reason <> 'consume' or new.work_order_line_id is null then
    return new;
  end if;

  -- Use existing allocation-based event as the base
  select *
    into v_event
  from public.part_fitment_events
  where allocation_id = new.allocation_id
  limit 1;

  if not found then
    return new;
  end if;

  insert into public.part_fitment_events (
    shop_id,
    part_id,
    vehicle_signature_id,
    allocation_id,
    vehicle_year,
    vehicle_trim,
    event_type,
    part_supplier,
    part_number,
    confidence_source,
    confidence_score
  )
  values (
    v_event.shop_id,
    v_event.part_id,
    v_event.vehicle_signature_id,
    v_event.allocation_id,
    v_event.vehicle_year,
    v_event.vehicle_trim,
    'consumed',
    v_event.part_supplier,
    v_event.part_number,
    'confirmed',
    2
  )
  on conflict do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."tg_log_part_fitment_event_from_consumption"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_notify_quote_request"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  payload json;
begin
  if (tg_op = 'INSERT') then
    payload = json_build_object(
      'type', 'quote_request',
      'id', new.id,
      'work_order_id', new.work_order_id,
      'work_order_line_id', new.work_order_line_id,
      'status', new.status,
      'created_at', new.created_at
    );
    perform pg_notify('quote_requests', payload::text);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_notify_quote_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_profiles_enforce_shop_user_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_max int;
  v_count int;
BEGIN
  IF NEW.shop_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max_users, 1)
    INTO v_max
  FROM public.shops
  WHERE id = NEW.shop_id;

  IF TG_OP = 'UPDATE' AND OLD.shop_id = NEW.shop_id THEN
    SELECT COUNT(*)
      INTO v_count
    FROM public.profiles
    WHERE shop_id = NEW.shop_id
      AND id <> NEW.id;
  ELSE
    SELECT COUNT(*)
      INTO v_count
    FROM public.profiles
    WHERE shop_id = NEW.shop_id;
  END IF;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Shop user limit reached'
      USING ERRCODE = '23514',
            DETAIL = 'This shop has reached its allowed user limit for the current plan.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_profiles_enforce_shop_user_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_profiles_recalc_shop_user_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_shop_active_user_count(NEW.shop_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.shop_id IS DISTINCT FROM OLD.shop_id THEN
      PERFORM public.recalc_shop_active_user_count(OLD.shop_id);
      PERFORM public.recalc_shop_active_user_count(NEW.shop_id);
    ELSE
      PERFORM public.recalc_shop_active_user_count(NEW.shop_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_shop_active_user_count(OLD.shop_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."tg_profiles_recalc_shop_user_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_recompute_shop_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_avg numeric;
begin
  select coalesce(avg(rating), 0) into v_avg
  from public.shop_reviews
  where shop_id = coalesce(new.shop_id, old.shop_id);

  update public.shops
  set rating = v_avg
  where id = coalesce(new.shop_id, old.shop_id);

  return coalesce(new, old);
end $$;


ALTER FUNCTION "public"."tg_recompute_shop_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_created_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_quoted_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.quoted_at is null and new.notes is not null and position('[quoted]' in new.notes) > 0 then
    new.quoted_at = now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_quoted_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_timestamps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_work_orders_shop"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if NEW.shop_id is null then
    select p.shop_id into NEW.shop_id
    from public.profiles p
    where p.id = auth.uid();
  end if;

  -- optional but helpful for auditing:
  if NEW.user_id is null then
    NEW.user_id := auth.uid();
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."tg_set_work_orders_shop"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_shop_reviews_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."tg_shop_reviews_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_shops_set_owner_and_creator"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_shops_set_owner_and_creator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_work_orders_sync_vehicle_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v record;
BEGIN
  IF NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    id,
    vin,
    license_plate,
    make,
    model,
    year,
    color,
    mileage,
    fuel_type,
    transmission,
    drivetrain,
    engine,
    engine_hours,
    unit_number,
    submodel
  INTO v
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Text columns in work_orders
  NEW.vehicle_unit_number    := COALESCE(NEW.vehicle_unit_number, v.unit_number);
  NEW.vehicle_color          := COALESCE(NEW.vehicle_color, v.color);
  NEW.vehicle_vin            := COALESCE(NEW.vehicle_vin, v.vin);
  NEW.vehicle_license_plate  := COALESCE(NEW.vehicle_license_plate, v.license_plate);
  NEW.vehicle_make           := COALESCE(NEW.vehicle_make, v.make);
  NEW.vehicle_model          := COALESCE(NEW.vehicle_model, v.model);
  NEW.vehicle_submodel       := COALESCE(NEW.vehicle_submodel, v.submodel);
  NEW.vehicle_engine         := COALESCE(NEW.vehicle_engine, v.engine);
  NEW.vehicle_drivetrain     := COALESCE(NEW.vehicle_drivetrain, v.drivetrain);
  NEW.vehicle_fuel_type      := COALESCE(NEW.vehicle_fuel_type, v.fuel_type);
  NEW.vehicle_transmission   := COALESCE(NEW.vehicle_transmission, v.transmission);

  -- Integer columns in work_orders
  NEW.vehicle_year := COALESCE(NEW.vehicle_year, v.year);

  -- ✅ FIX: vehicles.mileage is TEXT but work_orders.vehicle_mileage is INTEGER
  NEW.vehicle_mileage := COALESCE(
    NEW.vehicle_mileage,
    NULLIF(regexp_replace(COALESCE(v.mileage, ''), '[^0-9]', '', 'g'), '')::integer
  );

  NEW.vehicle_engine_hours := COALESCE(NEW.vehicle_engine_hours, v.engine_hours);

  -- Compose vehicle_info (text)
  NEW.vehicle_info := COALESCE(
    NULLIF(NEW.vehicle_info, ''),
    TRIM(
      CONCAT_WS(
        ' ',
        COALESCE(v.year::text, NULL),
        v.make,
        v.model,
        CASE WHEN COALESCE(v.submodel,'') <> '' THEN '(' || v.submodel || ')' ELSE NULL END,
        CASE WHEN COALESCE(v.unit_number,'') <> '' THEN 'Unit ' || v.unit_number ELSE NULL END
      )
    )
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_work_orders_sync_vehicle_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_part_request_item_picked_consume"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old.status::text,'') <> 'picked'
     and new.status::text = 'picked' then

    perform public.consume_part_request_item_on_picked(new.id, NULL);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_part_request_item_picked_consume"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_pri_auto_unreserve"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_old_reserved numeric;
  v_new_reserved numeric;
  v_delta numeric;
  old_status text;
  new_status text;
begin
  old_status := coalesce(old.status::text,'');
  new_status := coalesce(new.status::text,'');

  v_old_reserved := greatest(coalesce(old.qty_reserved,0),0);
  v_new_reserved := greatest(coalesce(new.qty_reserved,0),0);

  -- Case 1: cancellation/rejection -> unreserve whatever is still reserved
  if (new_status in ('cancelled','rejected')) and v_new_reserved > 0 then
    perform public.unreserve_part_request_item(new.id, v_new_reserved);
  end if;

  -- Case 2: qty_reserved decreased (e.g. manual edit or recalculation) -> unreserve the delta
  if v_new_reserved < v_old_reserved then
    v_delta := v_old_reserved - v_new_reserved;
    if v_delta > 0 then
      perform public.unreserve_part_request_item(new.id, v_delta);
    end if;
  end if;

  -- Optional: if someone rolls back from consumed -> cancelled/rejected, restock the consumed qty too
  if (old_status = 'consumed') and (new_status in ('cancelled','rejected')) then
    if greatest(coalesce(old.qty_consumed,0),0) > 0 then
      perform public.restock_consumed_part_request_item(new.id, old.qty_consumed);
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_pri_auto_unreserve"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_qty_to_unreserve numeric;
begin
  if p_request_item_id is null then
    return;
  end if;

  select
    i.id,
    i.shop_id,
    i.part_id,
    i.location_id,
    i.qty_reserved,
    i.qty_consumed,
    i.status
  into r
  from public.part_request_items i
  where i.id = p_request_item_id;

  if r.id is null or r.part_id is null then
    return;
  end if;

  v_shop_id := r.shop_id;
  if v_shop_id is null then
    raise exception 'part_request_items.shop_id is required';
  end if;

  v_location_id := r.location_id;
  if v_location_id is null then
    v_location_id := public.get_default_stock_location(v_shop_id);
  end if;

  if v_location_id is null then
    raise exception 'No stock location available for shop %', v_shop_id;
  end if;

  v_qty_to_unreserve := coalesce(p_qty, r.qty_reserved);
  v_qty_to_unreserve := greatest(coalesce(v_qty_to_unreserve,0), 0);

  -- Never unreserve more than currently reserved
  v_qty_to_unreserve := least(v_qty_to_unreserve, greatest(coalesce(r.qty_reserved,0),0));

  if v_qty_to_unreserve <= 0 then
    return;
  end if;

  -- Create stock move to put reserved back into on_hand (+qty, wo_release)
  -- If this exact unreserve was already recorded, do nothing.
  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by
  )
  values (
    v_shop_id,
    r.part_id,
    v_location_id,
    v_qty_to_unreserve,
    'wo_release',
    'part_request_item',
    r.id,
    auth.uid()
  )
  on conflict do nothing;

  -- Decrement reservation on the request item (never below 0)
  update public.part_request_items
  set
    qty_reserved = greatest(coalesce(qty_reserved,0) - v_qty_to_unreserve, 0),
    updated_at = now()
  where id = r.id;
end;
$$;


ALTER FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric DEFAULT NULL::numeric, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r record;
  v_shop_id uuid;
  v_location_id uuid;
  v_qty_to_unreserve numeric;
begin
  if p_request_item_id is null then
    return;
  end if;

  select
    i.id,
    i.shop_id,
    i.part_id,
    i.location_id,
    i.qty_reserved,
    i.qty_consumed,
    i.status
  into r
  from public.part_request_items i
  where i.id = p_request_item_id;

  if r.id is null or r.part_id is null then
    return;
  end if;

  v_shop_id := r.shop_id;
  if v_shop_id is null then
    raise exception 'part_request_items.shop_id is required';
  end if;

  v_location_id := coalesce(p_location_id, r.location_id, public.get_default_stock_location(v_shop_id));

  if v_location_id is null then
    raise exception 'No stock location available for shop %', v_shop_id;
  end if;

  v_qty_to_unreserve := coalesce(p_qty, r.qty_reserved);
  v_qty_to_unreserve := greatest(coalesce(v_qty_to_unreserve,0), 0);
  v_qty_to_unreserve := least(v_qty_to_unreserve, greatest(coalesce(r.qty_reserved,0),0));

  if v_qty_to_unreserve <= 0 then
    return;
  end if;

  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by
  )
  values (
    v_shop_id,
    r.part_id,
    v_location_id,
    v_qty_to_unreserve,
    'wo_release',
    'part_request_item',
    r.id,
    auth.uid()
  )
  on conflict do nothing;

  update public.part_request_items
  set
    location_id = v_location_id,
    qty_reserved = greatest(coalesce(qty_reserved,0) - v_qty_to_unreserve, 0),
    updated_at = now()
  where id = r.id;
end;
$$;


ALTER FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.part_request_items
  set vendor = nullif(p_vendor,''),
      quoted_price = p_price
  where id = p_item
    and request_id = p_request
    and exists (
      select 1
      from public.part_requests r
      where r.id = p_request
        and r.shop_id = public.current_shop_id()
    );

  update public.part_requests
  set status = 'quoted'
  where id = p_request
    and shop_id = public.current_shop_id()
    and exists (
      select 1
      from public.part_request_items i
      where i.request_id = p_request
        and i.quoted_price is not null
    );
end $$;


ALTER FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_part_allocation_from_request_item"("p_request_item_id" "uuid", "p_location_id" "uuid", "p_create_stock_move" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item       part_request_items%rowtype;
  v_req        part_requests%rowtype;
  v_wo         work_orders%rowtype;
  v_part       parts%rowtype;
  v_unit_cost  numeric;
  v_result     jsonb := '{}'::jsonb;
begin
  -- 1) Load request item
  select * into v_item
  from public.part_request_items
  where id = p_request_item_id;

  if not found then
    raise exception using message = format('part_request_items %s not found', p_request_item_id::text);
  end if;

  -- 2) Load parent request
  select * into v_req
  from public.part_requests
  where id = v_item.request_id;

  if not found then
    raise exception using message = format('part_requests %s not found for request item %s', v_item.request_id::text, p_request_item_id::text);
  end if;

  -- 3) Load work order
  select * into v_wo
  from public.work_orders
  where id = v_req.work_order_id;

  if not found then
    raise exception using message = format('work_orders %s not found for request %s', v_req.work_order_id::text, v_req.id::text);
  end if;

  if v_wo.shop_id is null then
    raise exception using message = format('work_order_part_allocations.shop_id cannot be null (work order %s has no shop_id)', v_wo.id::text);
  end if;

  -- 4) Load part (for cost) – optional
  if v_item.part_id is not null then
    select * into v_part
    from public.parts
    where id = v_item.part_id;
  end if;

  -- 5) Decide unit_cost:
  v_unit_cost := coalesce(v_part.cost, v_part.default_cost, v_item.quoted_price, 0);

  -- 6) Upsert allocation
  insert into public.work_order_part_allocations as wopa (
    work_order_id,
    work_order_line_id,
    part_id,
    location_id,
    qty,
    unit_cost,
    stock_move_id,
    source_request_item_id,
    shop_id
  )
  values (
    v_req.work_order_id,
    v_item.work_order_line_id,
    v_item.part_id,
    p_location_id,
    v_item.qty,
    v_unit_cost,
    null,
    v_item.id,
    v_wo.shop_id
  )
  on conflict (work_order_line_id, part_id, location_id)
  do update
     set qty       = excluded.qty,
         unit_cost = excluded.unit_cost
  returning jsonb_build_object(
    'id', id,
    'work_order_id', work_order_id,
    'work_order_line_id', work_order_line_id,
    'part_id', part_id,
    'location_id', location_id,
    'qty', qty,
    'unit_cost', unit_cost,
    'stock_move_id', stock_move_id,
    'source_request_item_id', source_request_item_id,
    'shop_id', shop_id,
    'created_at', created_at
  )
  into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."upsert_part_allocation_from_request_item"("p_request_item_id" "uuid", "p_location_id" "uuid", "p_create_stock_move" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_in_shop"("target_shop_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.shop_users su
    where su.shop_id = target_shop_id
      and su.user_id = auth.uid()
      and su.is_active = true
  );
$$;


ALTER FUNCTION "public"."user_is_in_shop"("target_shop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vehicles_set_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.shop_id is null then
    new.shop_id := public.current_shop_id();
  end if;
  return new;
end$$;


ALTER FUNCTION "public"."vehicles_set_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wo_alloc_recompute_invoice_aiu"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_work_order_id uuid;
begin
  v_work_order_id := coalesce(new.work_order_id, old.work_order_id);
  if v_work_order_id is null then
    return null;
  end if;
  perform public.recompute_live_invoice_costs(v_work_order_id);
  return null;
end;
$$;


ALTER FUNCTION "public"."wo_alloc_recompute_invoice_aiu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wo_release_parts_holds_for_part"("p_part_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_shop uuid;
  v_released int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select p.shop_id into v_shop
  from public.profiles p
  where p.id = v_uid;

  if v_shop is null then
    raise exception 'No shop profile';
  end if;

  with target_lines as (
    select distinct wl.id
    from public.work_order_lines wl
    join public.work_orders wo on wo.id = wl.work_order_id
    join public.work_order_part_allocations a on a.work_order_line_id = wl.id
    where wo.shop_id = v_shop
      and wl.status = 'on_hold'
      and lower(coalesce(wl.hold_reason,'')) in ('awaiting_parts','awaiting parts')
      and a.part_id = p_part_id
  )
  update public.work_order_lines wl
  set
    status = 'awaiting',
    on_hold_since = null,
    hold_reason = null,
    updated_at = now()
  from target_lines t
  where wl.id = t.id;

  get diagnostics v_released = row_count;
  return v_released;
end;
$$;


ALTER FUNCTION "public"."wo_release_parts_holds_for_part"("p_part_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_assign_line_no"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.line_no IS NULL THEN
    SELECT COALESCE(MAX(line_no), 0) + 1
    INTO NEW.line_no
    FROM public.work_order_lines
    WHERE work_order_id = NEW.work_order_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."wol_assign_line_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_backfill_template_from_menu"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.menu_item_id is not null and new.inspection_template_id is null then
    select mi.inspection_template_id
      into new.inspection_template_id
    from public.menu_items mi
    where mi.id = new.menu_item_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."wol_backfill_template_from_menu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_copy_menu_parts_to_work_order_parts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_shop uuid;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  v_shop := new.shop_id;

  insert into public.work_order_parts (
    work_order_id,
    work_order_line_id,
    part_id,
    quantity,
    unit_price,
    total_price,
    shop_id
  )
  select
    new.work_order_id,
    new.id as work_order_line_id,
    mip.part_id,
    greatest(1, coalesce(round(mip.quantity)::int, 1)) as quantity,

    case
      when mip.part_id is not null then
        coalesce(
          p.default_price,
          p.price,
          mip.unit_cost,
          p.default_cost,
          p.cost,
          0
        )::numeric
      else
        coalesce(mip.unit_cost, 0)::numeric
    end as unit_price,

    (
      greatest(1, coalesce(round(mip.quantity)::int, 1))
      *
      case
        when mip.part_id is not null then
          coalesce(
            p.default_price,
            p.price,
            mip.unit_cost,
            p.default_cost,
            p.cost,
            0
          )::numeric
        else
          coalesce(mip.unit_cost, 0)::numeric
      end
    )::numeric as total_price,

    v_shop
  from public.menu_item_parts mip
  left join public.parts p
    on p.id = mip.part_id
   and (p.shop_id is null or p.shop_id = v_shop)
  where mip.menu_item_id = new.menu_item_id
    and (mip.shop_id is null or mip.shop_id = v_shop);

  return new;
end;
$$;


ALTER FUNCTION "public"."wol_copy_menu_parts_to_work_order_parts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_create_inspection_session_before"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  sess_id uuid;
  wo_customer_id uuid;
BEGIN
  -- Only for inspection lines or when a template is present
  IF (NEW.job_type = 'inspection' OR NEW.inspection_template_id IS NOT NULL) THEN
    -- If missing, create session first so CHECK can pass
    IF NEW.inspection_session_id IS NULL THEN

      -- Best-effort customer_id from the work order (optional)
      SELECT wo.customer_id
        INTO wo_customer_id
      FROM public.work_orders wo
      WHERE wo.id = NEW.work_order_id;

      INSERT INTO public.inspection_sessions (
        user_id,
        work_order_id,
        work_order_line_id,
        vehicle_id,
        customer_id,
        template,
        created_by,
        status
      )
      VALUES (
        NEW.user_id,
        NEW.work_order_id,
        NULL,                 -- IMPORTANT: cannot set yet (FK would fail)
        NEW.vehicle_id,
        wo_customer_id,
        NULL,
        NEW.user_id,
        'new'
      )
      RETURNING id INTO sess_id;

      NEW.inspection_session_id := sess_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."wol_create_inspection_session_before"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_delete_staged_parts_on_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- delete only parts linked to this line
  delete from public.work_order_parts
  where work_order_line_id = old.id;

  return old;
end;
$$;


ALTER FUNCTION "public"."wol_delete_staged_parts_on_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_link_inspection_session_after"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (NEW.job_type = 'inspection' OR NEW.inspection_template_id IS NOT NULL) THEN
    IF NEW.inspection_session_id IS NOT NULL THEN
      UPDATE public.inspection_sessions s
      SET work_order_line_id = NEW.id
      WHERE s.id = NEW.inspection_session_id
        AND (s.work_order_line_id IS NULL OR s.work_order_line_id = NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."wol_link_inspection_session_after"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_recompute_invoice_aiu"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_work_order_id uuid;
begin
  v_work_order_id := coalesce(new.work_order_id, old.work_order_id);
  if v_work_order_id is null then
    return null;
  end if;
  perform public.recompute_live_invoice_costs(v_work_order_id);
  return null;
end;
$$;


ALTER FUNCTION "public"."wol_recompute_invoice_aiu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_refresh_staged_parts_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(old.menu_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(new.menu_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
  then
    return new;
  end if;

  -- remove old staged parts for this line
  delete from public.work_order_parts
  where work_order_line_id = new.id;

  -- re-stage if new has a menu item
  if new.menu_item_id is not null then
    perform public.wol_copy_menu_parts_to_work_order_parts();
    -- The above "perform" won't work because that function is a trigger function.
    -- So we inline the same insert logic here:
    insert into public.work_order_parts (
      work_order_id,
      work_order_line_id,
      part_id,
      quantity,
      unit_price,
      total_price,
      shop_id
    )
    select
      new.work_order_id,
      new.id,
      mip.part_id,
      greatest(1, coalesce(round(mip.quantity)::int, 1))::int,
      case
        when mip.part_id is not null then
          coalesce(p.default_price, p.price, mip.unit_cost, p.default_cost, p.cost, 0)::numeric
        else
          coalesce(mip.unit_cost, 0)::numeric
      end,
      (
        greatest(1, coalesce(round(mip.quantity)::int, 1))::int
        *
        case
          when mip.part_id is not null then
            coalesce(p.default_price, p.price, mip.unit_cost, p.default_cost, p.cost, 0)::numeric
          else
            coalesce(mip.unit_cost, 0)::numeric
        end
      )::numeric,
      new.shop_id
    from public.menu_item_parts mip
    left join public.parts p
      on p.id = mip.part_id
     and (p.shop_id is null or p.shop_id = new.shop_id)
    where mip.menu_item_id = new.menu_item_id
      and (mip.shop_id is null or mip.shop_id = new.shop_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."wol_refresh_staged_parts_on_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wol_set_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare new_shop uuid;
begin
  if new.work_order_id is not null then
    select shop_id into new_shop from public.work_orders where id = new.work_order_id;
  end if;

  if new_shop is null then
    new_shop := public.current_shop_id();
  end if;

  new.shop_id := coalesce(new.shop_id, new_shop);
  return new;
end
$$;


ALTER FUNCTION "public"."wol_set_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wopa_sync_work_order_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.work_order_id := (
    SELECT work_order_id
    FROM public.work_order_lines
    WHERE id = NEW.work_order_line_id
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."wopa_sync_work_order_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wor_enforce_shop_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  wo_shop_id uuid;
begin
  select shop_id into wo_shop_id from public.work_orders where id = NEW.work_order_id;
  if wo_shop_id is null then
    raise exception 'work_order_id % does not exist', NEW.work_order_id;
  end if;

  if NEW.shop_id is distinct from wo_shop_id then
    raise exception 'shop_id % does not match work order % shop_id %',
      NEW.shop_id, NEW.work_order_id, wo_shop_id;
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."wor_enforce_shop_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."work_order_in_my_shop"("p_work_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.work_orders wo
    join public.profiles p
      on (p.id = auth.uid() or p.user_id = auth.uid())
     and p.shop_id = wo.shop_id
    where wo.id = p_work_order_id
  );
$$;


ALTER FUNCTION "public"."work_order_in_my_shop"("p_work_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."work_order_lines_set_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.shop_id is null then
    select w.shop_id into new.shop_id
    from public.work_orders w
    where w.id = new.work_order_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."work_order_lines_set_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."work_orders_set_intake"("p_work_order_id" "uuid", "p_intake" "jsonb", "p_submit" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid;
  v_customer_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select c.id
    into v_customer_id
  from public.customers c
  where c.user_id = v_uid
  limit 1;

  if v_customer_id is null then
    raise exception 'Customer profile not found for this user';
  end if;

  -- Ensure this WO belongs to this customer
  if not exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.customer_id = v_customer_id
  ) then
    raise exception 'Work order not found or not owned by this customer';
  end if;

  update public.work_orders wo
  set
    intake_json         = p_intake,
    intake_status       = case when p_submit then 'submitted' else 'draft' end,
    intake_submitted_at = case when p_submit then now() else null end,
    intake_submitted_by = case when p_submit then v_uid else null end
  where wo.id = p_work_order_id;
end;
$$;


ALTER FUNCTION "public"."work_orders_set_intake"("p_work_order_id" "uuid", "p_intake" "jsonb", "p_submit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."work_orders_set_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.shop_id is null then
    new.shop_id := public.current_shop_id();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."work_orders_set_shop_id"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text",
    "target_table" "text",
    "target_id" "uuid",
    "context" "jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_request_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "kind" "text" DEFAULT 'screenshot'::"text" NOT NULL,
    "caption" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "step" integer NOT NULL,
    "kind" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_events_kind_check" CHECK (("kind" = ANY (ARRAY['plan'::"text", 'tool_call'::"text", 'tool_result'::"text", 'info'::"text", 'error'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."agent_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_job_events" (
    "id" bigint NOT NULL,
    "job_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_job_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agent_job_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."agent_job_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_job_events_id_seq" OWNED BY "public"."agent_job_events"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_knowledge" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_knowledge" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "reporter_id" "uuid",
    "reporter_role" "text",
    "description" "text" NOT NULL,
    "intent" "public"."agent_request_intent" DEFAULT 'feature_request'::"public"."agent_request_intent",
    "normalized_json" "jsonb" DEFAULT '{}'::"jsonb",
    "github_issue_number" integer,
    "github_issue_url" "text",
    "github_pr_number" integer,
    "github_pr_url" "text",
    "github_branch" "text",
    "github_commit_sha" "text",
    "llm_model" "text",
    "llm_confidence" numeric(4,3),
    "llm_notes" "text",
    "status" "public"."agent_request_status" DEFAULT 'submitted'::"public"."agent_request_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_id" "uuid"
);


ALTER TABLE "public"."agent_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "goal" "text" NOT NULL,
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "entity_id" "uuid",
    "entity_table" "text",
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "training_source" "public"."ai_training_source",
    "source_id" "uuid",
    "vehicle_ymm" "text",
    CONSTRAINT "ai_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['quote_created'::"text", 'quote_updated'::"text", 'work_order_created'::"text", 'work_order_updated'::"text", 'inspection_created'::"text", 'inspection_updated'::"text", 'booking_created'::"text", 'booking_updated'::"text", 'message'::"text", 'customer_added'::"text", 'vehicle_added'::"text", 'parts_added'::"text", 'labor_added'::"text"])))
);


ALTER TABLE "public"."ai_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid",
    "template_id" "uuid",
    "requested_by" "uuid",
    "provider" "text",
    "model" "text",
    "prompt_version" "text",
    "system_prompt" "text",
    "user_prompt" "text",
    "input_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "error_message" "text",
    "tokens_input" integer,
    "tokens_output" integer,
    "estimated_cost" numeric(12,4),
    "score_predicted" numeric(6,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_generation_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."ai_generation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "prompt" "text",
    "response" "text",
    "tool_used" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vehicle_id" "uuid",
    "work_order_id" "uuid"
);


ALTER TABLE "public"."ai_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_training_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "source_event_id" "uuid",
    "content" "text" NOT NULL,
    "embedding" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_training_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_training_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_ymm" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_training_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_training_events" IS 'Unified AI training log for quotes, invoices, inspections, menus, and chat.';



COMMENT ON COLUMN "public"."ai_training_events"."source" IS 'High-level source label: apply_ai_quote | invoice_review | inspection_to_quote | menu_learning | chat';



CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "label" "text",
    "api_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon_url" "text",
    "default_route" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."apps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "uploaded_by" "uuid",
    "storage_bucket" "text",
    "storage_path" "text",
    "public_url" "text",
    "mime_type" "text",
    "asset_type" "text" DEFAULT 'video'::"text" NOT NULL,
    "source" "text" DEFAULT 'upload'::"text" NOT NULL,
    "duration_seconds" numeric(10,2),
    "width" integer,
    "height" integer,
    "size_bytes" bigint,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['video'::"text", 'image'::"text", 'audio'::"text", 'document'::"text", 'other'::"text"]))),
    CONSTRAINT "assets_source_check" CHECK (("source" = ANY (ARRAY['upload'::"text", 'generated'::"text", 'imported'::"text"])))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "customer_id" "uuid",
    "vehicle_id" "uuid",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "work_order_id" "uuid"
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid",
    "profile_id" "uuid",
    "role" "text",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "type" "text" NOT NULL,
    "context_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chats_type_check" CHECK (("type" = ANY (ARRAY['general'::"text", 'parts'::"text", 'work_order'::"text", 'job_line'::"text"])))
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_analytics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "content_event_id" "uuid",
    "content_piece_id" "uuid",
    "publication_id" "uuid",
    "platform" "public"."publish_platform",
    "event_type" "public"."analytics_event_type" NOT NULL,
    "event_value" numeric(14,2),
    "event_count" integer,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_analytics_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "content_event_id" "uuid" NOT NULL,
    "asset_type" "public"."content_asset_type" NOT NULL,
    "storage_bucket" "text",
    "storage_path" "text",
    "public_url" "text",
    "mime_type" "text",
    "file_name" "text",
    "file_size_bytes" bigint,
    "duration_seconds" numeric(10,2),
    "width" integer,
    "height" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_calendar_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "calendar_id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "publish_date" "date" NOT NULL,
    "content_type" "text" NOT NULL,
    "source_work_order_id" "uuid",
    "source_video_id" "uuid",
    "title" "text",
    "hook" "text",
    "caption" "text",
    "cta" "text",
    "platform_targets" "text"[],
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."content_calendar_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_calendars" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."content_calendars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "source_type" "public"."content_source_type" NOT NULL,
    "source_id" "uuid",
    "content_type" "public"."content_type" NOT NULL,
    "title" "text",
    "summary" "text",
    "status" "public"."content_status" DEFAULT 'draft'::"public"."content_status" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "vehicle_id" "uuid",
    "customer_id" "uuid",
    "work_order_id" "uuid",
    "work_order_line_id" "uuid",
    "inspection_id" "uuid",
    "ai_prompt_version" "text",
    "needs_review" boolean DEFAULT true NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_pieces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "content_event_id" "uuid" NOT NULL,
    "piece_type" "public"."content_piece_type" NOT NULL,
    "platform" "public"."publish_platform",
    "title" "text",
    "slug" "text",
    "body_text" "text",
    "body_markdown" "text",
    "body_json" "jsonb",
    "excerpt" "text",
    "seo_title" "text",
    "seo_description" "text",
    "language_code" "text" DEFAULT 'en'::"text",
    "tone" "text",
    "version_no" integer DEFAULT 1 NOT NULL,
    "is_current" boolean DEFAULT true NOT NULL,
    "status" "public"."content_status" DEFAULT 'draft'::"public"."content_status" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_by_ai" boolean DEFAULT true NOT NULL,
    "model_name" "text",
    "prompt_version" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_pieces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_platform_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "platform" "public"."publish_platform" NOT NULL,
    "account_label" "text",
    "platform_account_id" "text",
    "platform_username" "text",
    "connection_active" boolean DEFAULT false NOT NULL,
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_connected_at" timestamp with time zone,
    "last_sync_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_platform_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "content_event_id" "uuid" NOT NULL,
    "content_piece_id" "uuid",
    "content_asset_id" "uuid",
    "platform_account_id" "uuid",
    "platform" "public"."publish_platform" NOT NULL,
    "status" "public"."publication_status" DEFAULT 'draft'::"public"."publication_status" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "published_at" timestamp with time zone,
    "platform_post_id" "text",
    "platform_post_url" "text",
    "caption" "text",
    "title" "text",
    "error_code" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "default_hook" "text",
    "default_cta" "text",
    "script_guidance" "text",
    "visual_guidance" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "user_id" "uuid",
    "role" "text",
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "context_type" "text",
    "context_id" "uuid",
    "is_group" boolean DEFAULT false,
    "title" "text"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "vin" "text",
    "vehicle_year" "text",
    "vehicle_make" "text",
    "vehicle_model" "text",
    "selected_services" "jsonb",
    "labor_hours_estimated" numeric,
    "customer_name" "text",
    "customer_phone" "text",
    "customer_email" "text",
    "preferred_date" "date",
    "preferred_time" time without time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_portal_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_portal_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_quotes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "shop_id" "uuid",
    "customer_name" "text",
    "customer_email" "text",
    "vehicle_year" integer,
    "vehicle_make" "text",
    "vehicle_model" "text",
    "selected_services" "jsonb",
    "estimated_total" numeric,
    "preferred_date" "date",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."customer_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_settings" (
    "customer_id" "uuid" NOT NULL,
    "comm_email_enabled" boolean DEFAULT true NOT NULL,
    "comm_sms_enabled" boolean DEFAULT false NOT NULL,
    "marketing_opt_in" boolean DEFAULT false NOT NULL,
    "preferred_contact" "text" DEFAULT 'email'::"text",
    "units" "text" DEFAULT 'imperial'::"text",
    "language" "text" DEFAULT 'en'::"text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_settings_preferred_contact_check" CHECK (("preferred_contact" = ANY (ARRAY['email'::"text", 'sms'::"text", 'phone'::"text"]))),
    CONSTRAINT "customer_settings_units_check" CHECK (("units" = ANY (ARRAY['imperial'::"text", 'metric'::"text"])))
);


ALTER TABLE "public"."customer_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "phone" "text",
    "email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "phone_number" "text",
    "address" "text",
    "city" "text",
    "province" "text",
    "postal_code" "text",
    "street" "text",
    "shop_id" "uuid",
    "vehicle" "text",
    "business_name" "text",
    "is_fleet" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_intake_id" "uuid",
    "source_row_id" "uuid",
    "external_id" "text",
    "import_confidence" numeric,
    "import_notes" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cvip_specs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spec_code" "text" NOT NULL,
    "component" "text" NOT NULL,
    "defect_group" "text" NOT NULL,
    "jurisdiction" "text" DEFAULT 'CA-AB'::"text" NOT NULL,
    "source_standard" "text" DEFAULT 'CVIP-NSC11'::"text" NOT NULL,
    "source_section" "text",
    "measurement_type" "text" NOT NULL,
    "unit" "text",
    "threshold_min" numeric,
    "threshold_max" numeric,
    "fail_operator" "text" DEFAULT 'NONE'::"text" NOT NULL,
    "mandatory_measurement" boolean DEFAULT false NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cvip_specs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cvip_thresholds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spec_code" "text" NOT NULL,
    "jurisdiction_code" "text" DEFAULT 'AB'::"text" NOT NULL,
    "category" "text" NOT NULL,
    "component" "text" NOT NULL,
    "measurement_type" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "axle_position" "text",
    "location_code" "text",
    "chamber_size" "text",
    "extra_tag" "text",
    "warn_min" numeric,
    "warn_max" numeric,
    "fail_min" numeric,
    "fail_max" numeric
);


ALTER TABLE "public"."cvip_thresholds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cvip_thresholds_master" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spec_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "unit_metric" "text",
    "fail_min_metric" numeric,
    "fail_max_metric" numeric,
    "unit_imperial" "text",
    "fail_min_imperial" numeric,
    "fail_max_imperial" numeric,
    "notes" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "cvip_thresholds_master_direction_check" CHECK (("direction" = ANY (ARRAY['min'::"text", 'max'::"text", 'range'::"text"])))
);


ALTER TABLE "public"."cvip_thresholds_master" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decoded_vins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "vin" "text" NOT NULL,
    "decoded" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."decoded_vins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."defective_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid",
    "shop_id" "uuid",
    "reported_by" "uuid",
    "reason" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "reported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."defective_parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demo_shop_boost_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "demo_id" "uuid" NOT NULL,
    "email" "public"."citext" NOT NULL,
    "summary" "text"
);


ALTER TABLE "public"."demo_shop_boost_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demo_shop_boosts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shop_id" "uuid",
    "intake_id" "uuid",
    "shop_name" "text" NOT NULL,
    "country" "text" DEFAULT 'US'::"text" NOT NULL,
    "snapshot" "jsonb",
    "has_unlocked" boolean DEFAULT false NOT NULL,
    CONSTRAINT "demo_shop_boosts_country_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"])))
);


ALTER TABLE "public"."demo_shop_boosts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dtc_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "vehicle_id" "uuid",
    "dtc_code" "text",
    "description" "text",
    "severity" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dtc_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text",
    "error" "text",
    "timestamp" timestamp with time zone NOT NULL,
    "sg_event_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_suppressions" (
    "email" "text" NOT NULL,
    "suppressed" boolean DEFAULT true,
    "reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_suppressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "bucket_id" "text" DEFAULT 'employee_docs'::"text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "employee_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['drivers_license'::"text", 'certification'::"text", 'tax_form'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."employee_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "vendor_name" "text",
    "description" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "work_order_id" "uuid",
    "invoice_ref" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature_slug" "text" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_fitment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "vehicle_signature_id" "uuid",
    "work_order_id" "uuid",
    "work_order_line_id" "uuid",
    "allocation_id" "uuid",
    "qty" numeric DEFAULT 1 NOT NULL,
    "unit_cost" numeric,
    "source" "text" DEFAULT 'wo_allocation'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicle_year" integer,
    "vehicle_trim" "text",
    "confidence_source" "text",
    "confidence_score" numeric,
    "event_type" "public"."fitment_event_type" DEFAULT 'allocated'::"public"."fitment_event_type" NOT NULL,
    "part_brand" "text",
    "part_number" "text",
    "part_supplier" "text",
    CONSTRAINT "part_fitment_events_qty_check" CHECK (("qty" > (0)::numeric))
);


ALTER TABLE "public"."part_fitment_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."part_fitment_events"."confidence_source" IS 'Where the fitment evidence came from (e.g. manual, ai, catalog, import).';



COMMENT ON COLUMN "public"."part_fitment_events"."confidence_score" IS 'Confidence score for this event (0..1 or 0..100 depending on future convention).';



COMMENT ON COLUMN "public"."part_fitment_events"."event_type" IS 'allocated = added to job, consumed = confirmed install';



COMMENT ON COLUMN "public"."part_fitment_events"."part_brand" IS 'Snapshot of parts.brand or supplier at time of event';



COMMENT ON COLUMN "public"."part_fitment_events"."part_number" IS 'Snapshot of parts.part_number at time of event';



COMMENT ON COLUMN "public"."part_fitment_events"."part_supplier" IS 'Snapshot of parts.supplier at time of event';



CREATE MATERIALIZED VIEW "public"."fitment_stats" AS
 SELECT "part_fitment_events"."shop_id",
    "part_fitment_events"."vehicle_signature_id",
    "part_fitment_events"."part_id",
    "count"(*) FILTER (WHERE ("part_fitment_events"."event_type" = 'allocated'::"public"."fitment_event_type")) AS "allocations",
    "count"(*) FILTER (WHERE ("part_fitment_events"."event_type" = 'consumed'::"public"."fitment_event_type")) AS "consumptions",
    "min"("part_fitment_events"."created_at") AS "first_seen_at",
    "max"("part_fitment_events"."created_at") AS "last_seen_at"
   FROM "public"."part_fitment_events"
  GROUP BY "part_fitment_events"."shop_id", "part_fitment_events"."vehicle_signature_id", "part_fitment_events"."part_id"
  WITH NO DATA;


ALTER TABLE "public"."fitment_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_dispatch_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_profile_id" "uuid" NOT NULL,
    "route_label" "text",
    "next_pretrip_due" timestamp with time zone,
    "state" "text" DEFAULT 'pretrip_due'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "driver_name" "text",
    "unit_label" "text",
    "vehicle_identifier" "text",
    "fleet_id" "uuid" NOT NULL,
    CONSTRAINT "fleet_dispatch_assignments_state_check" CHECK (("state" = ANY (ARRAY['pretrip_due'::"text", 'en_route'::"text", 'in_shop'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."fleet_dispatch_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_form_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "extracted_text" "text",
    "parsed_sections" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "error" "text",
    "error_message" "text",
    CONSTRAINT "fleet_form_uploads_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'parsed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."fleet_form_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_inspection_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "interval_days" integer DEFAULT 365 NOT NULL,
    "last_inspection_date" "date",
    "next_inspection_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fleet_id" "uuid" NOT NULL,
    CONSTRAINT "fleet_inspection_dates_order_chk" CHECK ((("next_inspection_date" IS NULL) OR ("last_inspection_date" IS NULL) OR ("next_inspection_date" >= "last_inspection_date")))
);


ALTER TABLE "public"."fleet_inspection_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_members" (
    "fleet_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "fleet_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text", 'driver'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."fleet_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_pretrip_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_profile_id" "uuid",
    "driver_name" "text" NOT NULL,
    "inspection_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "odometer_km" numeric(10,1),
    "checklist" "jsonb" NOT NULL,
    "notes" "text",
    "has_defects" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'mobile_pretrip'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "fleet_id" "uuid" NOT NULL,
    CONSTRAINT "fleet_pretrip_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."fleet_pretrip_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_program_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "job_type" "text" DEFAULT 'maintenance'::"text" NOT NULL,
    "default_labor_hours" numeric(5,2),
    "section_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fleet_program_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fleet_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cadence" "public"."fleet_program_cadence" NOT NULL,
    "interval_km" integer,
    "interval_hours" integer,
    "interval_days" integer,
    "base_template_slug" "text",
    "include_custom_inspection" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fleet_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_service_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "source_pretrip_id" "uuid",
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "scheduled_for_date" "date",
    "work_order_id" "uuid",
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fleet_id" "uuid" NOT NULL,
    CONSTRAINT "fleet_service_requests_severity_check" CHECK (("severity" = ANY (ARRAY['safety'::"text", 'compliance'::"text", 'maintenance'::"text", 'recommend'::"text"]))),
    CONSTRAINT "fleet_service_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."fleet_service_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_vehicles" (
    "fleet_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "nickname" "text",
    "custom_interval_km" integer,
    "custom_interval_hours" integer,
    "custom_interval_days" integer,
    "shop_id" "uuid"
);


ALTER TABLE "public"."fleet_vehicles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fleets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."followups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "customer_id" "uuid",
    "feature" "text",
    "send_at" timestamp with time zone,
    "sent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "work_order_id" "uuid",
    "service_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid",
    "section" "text",
    "label" "text",
    "value" "text",
    "status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inspection_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_photos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid",
    "item_name" "text",
    "image_url" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "user_id" "uuid"
);


ALTER TABLE "public"."inspection_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_result_items" (
    "result_id" "uuid" NOT NULL,
    "section_title" "text",
    "item_label" "text",
    "status" "public"."inspection_item_status",
    "value" "text",
    "unit" "text",
    "notes" "text",
    "photo_urls" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_result_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "template_name" "text",
    "customer" "jsonb",
    "vehicle" "jsonb",
    "sections" "jsonb" NOT NULL,
    "quote" "jsonb" DEFAULT '[]'::"jsonb",
    "finished_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_session_payloads" (
    "session_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_session_payloads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "work_order_id" "uuid",
    "state" "jsonb",
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "work_order_line_id" "uuid",
    "vehicle_id" "uuid",
    "customer_id" "uuid",
    "template" "text",
    "created_by" "uuid",
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    CONSTRAINT "inspection_sessions_template_check" CHECK (("template" = ANY (ARRAY['maintenance50'::"text", 'maintenance50-air'::"text"])))
);


ALTER TABLE "public"."inspection_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "signed_by" "uuid",
    "signed_name" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "signature_image_path" "text",
    "signature_hash" "text",
    CONSTRAINT "inspection_signatures_role_check" CHECK (("role" = ANY (ARRAY['technician'::"text", 'customer'::"text", 'advisor'::"text"])))
);


ALTER TABLE "public"."inspection_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_template_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "intake_id" "uuid",
    "template_key" "text",
    "name" "text" NOT NULL,
    "items" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "applies_to" "text" DEFAULT 'both'::"text" NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_template_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "template_name" "text" NOT NULL,
    "sections" "jsonb" NOT NULL,
    "description" "text",
    "tags" "text"[],
    "vehicle_type" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "labor_hours" numeric(5,2),
    "shop_id" "uuid",
    CONSTRAINT "inspection_templates_sections_is_array" CHECK (("jsonb_typeof"("sections") = 'array'::"text"))
);


ALTER TABLE "public"."inspection_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "vehicle_id" "uuid",
    "template_id" "uuid",
    "inspection_type" "text",
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "location" "text",
    "status" "text" DEFAULT 'not_started'::"text",
    "started_at" timestamp with time zone,
    "summary" "jsonb",
    "photo_urls" "text"[],
    "pdf_url" "text",
    "quote_id" "uuid",
    "notes" "text",
    "ai_summary" "text",
    "is_draft" boolean DEFAULT true,
    "shop_id" "uuid",
    "work_order_id" "uuid",
    "finalized_at" timestamp with time zone,
    "finalized_by" "uuid",
    "locked" boolean DEFAULT false,
    "pdf_storage_path" "text",
    "work_order_line_id" "uuid"
);


ALTER TABLE "public"."inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "provider" "text" NOT NULL,
    "action" "text" NOT NULL,
    "request" "jsonb",
    "response" "jsonb",
    "success" boolean DEFAULT true NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "integrations_provider_check" CHECK (("provider" = ANY (ARRAY['stripe'::"text", 'quickbooks'::"text", 'xero'::"text", 'napa'::"text", 'carquest'::"text", 'worldpac'::"text", 'kijiji_parts'::"text", 'ford_parts'::"text", 'gm_parts'::"text", 'aftermarket_api'::"text"]))),
    CONSTRAINT "integrations_status_check" CHECK (("status" = ANY (ARRAY['enabled'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'inspection_pdfs'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" DEFAULT 'application/pdf'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "work_order_id" "uuid",
    "customer_id" "uuid",
    "tech_id" "uuid",
    "invoice_number" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "parts_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "labor_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" character(3) DEFAULT 'USD'::"bpchar" NOT NULL,
    "issued_at" timestamp with time zone,
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid",
    "video_platform_post_id" "uuid",
    "event_type" "text" NOT NULL,
    "source_platform" "text",
    "lead_value" numeric(12,2),
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "lead_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['click'::"text", 'form_submit'::"text", 'call'::"text", 'message'::"text", 'booking'::"text", 'other'::"text"]))),
    CONSTRAINT "lead_events_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'tiktok'::"text", 'youtube'::"text", 'linkedin'::"text", 'x'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."lead_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid",
    "ai_generation_run_id" "uuid",
    "feedback_type" "text" NOT NULL,
    "score" numeric(6,2),
    "note" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['thumbs_up'::"text", 'thumbs_down'::"text", 'edited_caption'::"text", 'edited_hook'::"text", 'edited_cta'::"text", 'published'::"text", 'high_performer'::"text", 'low_performer'::"text", 'manual_note'::"text"])))
);


ALTER TABLE "public"."learning_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_code" "text" NOT NULL,
    "make" "text",
    "model" "text",
    "year_from" integer,
    "year_to" integer,
    "engine_family" "text",
    "distance_km_normal" integer,
    "distance_km_severe" integer,
    "time_months_normal" integer,
    "time_months_severe" integer,
    "first_due_km" integer,
    "first_due_months" integer,
    "is_critical" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."maintenance_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_services" (
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "default_job_type" "text" DEFAULT 'maintenance'::"text" NOT NULL,
    "default_labor_hours" numeric,
    "default_notes" "text"
);


ALTER TABLE "public"."maintenance_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_suggestions" (
    "work_order_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "mileage_km" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "suggestions" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."maintenance_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "inspection_id" "uuid",
    "work_order_id" "uuid",
    "file_url" "text",
    "file_type" "text",
    "audio_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "analysis_summary" "text"
);


ALTER TABLE "public"."media_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "part_id" "uuid",
    "shop_id" "uuid"
);


ALTER TABLE "public"."menu_item_parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "intake_id" "uuid",
    "title" "text" NOT NULL,
    "category" "text",
    "price_suggestion" numeric,
    "labor_hours_suggestion" numeric,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_item_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "complaint" "text",
    "cause" "text",
    "correction" "text",
    "labor_time" numeric,
    "tools" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "total_price" numeric,
    "part_cost" numeric,
    "labor_hours" numeric,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "shop_id" "uuid",
    "inspection_template_id" "uuid",
    "vehicle_year" integer,
    "vehicle_make" "text",
    "vehicle_model" "text",
    "engine_type" "text",
    "transmission_type" "text",
    "drivetrain" "text",
    "submodel" "text",
    "source" "text",
    "base_labor_hours" numeric,
    "base_price" numeric,
    "work_order_line_id" "uuid",
    "service_key" "text",
    "base_part_cost" numeric,
    "engine_code" "text",
    "transmission_code" "text"
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_pricing" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "vehicle_year" integer,
    "vehicle_make" "text",
    "vehicle_model" "text",
    "service_name" "text",
    "description" "text",
    "estimated_labor_minutes" integer,
    "part_cost" numeric,
    "labor_rate" numeric,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."menu_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "content" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "conversation_id" "uuid",
    "recipients" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reply_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "data" "jsonb",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_members" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."org_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "slug" "text",
    "owner_profile_id" "uuid",
    "stripe_customer_id" "text",
    "billing_email" "text",
    "billing_status" "text",
    "default_currency" "text" DEFAULT 'usd'::"text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_barcodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid" NOT NULL,
    "barcode" "text" NOT NULL,
    "kind" "text"
);


ALTER TABLE "public"."part_barcodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_compatibility" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid",
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year_range" "int4range",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shop_id" "uuid"
);


ALTER TABLE "public"."part_compatibility" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "part_id" "uuid",
    "shop_id" "uuid",
    "quantity" integer NOT NULL,
    "purchase_price" numeric(10,2),
    "purchased_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."part_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "part_id" "uuid",
    "description" "text" NOT NULL,
    "qty" numeric NOT NULL,
    "quoted_price" numeric,
    "vendor" "text",
    "approved" boolean DEFAULT false NOT NULL,
    "work_order_line_id" "uuid",
    "markup_pct" numeric DEFAULT 30,
    "shop_id" "uuid",
    "work_order_id" "uuid",
    "menu_item_id" "uuid",
    "status" "public"."part_request_item_status" DEFAULT 'requested'::"public"."part_request_item_status" NOT NULL,
    "qty_requested" numeric DEFAULT 0 NOT NULL,
    "qty_approved" numeric DEFAULT 0 NOT NULL,
    "qty_reserved" numeric DEFAULT 0 NOT NULL,
    "qty_picked" numeric DEFAULT 0 NOT NULL,
    "qty_received" numeric DEFAULT 0 NOT NULL,
    "qty_consumed" numeric DEFAULT 0 NOT NULL,
    "unit_cost" numeric,
    "unit_price" numeric,
    "vendor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "po_id" "uuid",
    "location_id" "uuid",
    CONSTRAINT "part_request_items_qty_check" CHECK (("qty" > (0)::numeric))
);


ALTER TABLE "public"."part_request_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_request_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."part_request_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "work_order_id" "uuid",
    "requested_by" "uuid",
    "assigned_to" "uuid",
    "status" "public"."part_request_status" DEFAULT 'requested'::"public"."part_request_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "job_id" "uuid"
);


ALTER TABLE "public"."part_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid",
    "shop_id" "uuid",
    "reason" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "returned_by" "uuid",
    "returned_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."part_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qty_on_hand" numeric(12,2) DEFAULT 0 NOT NULL,
    "qty_reserved" numeric(12,2) DEFAULT 0 NOT NULL,
    "reorder_point" numeric(12,2) DEFAULT 0,
    "reorder_qty" numeric(12,2) DEFAULT 0
);


ALTER TABLE "public"."part_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2),
    "cost" numeric(10,2),
    "part_number" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shop_id" "uuid",
    "sku" "text",
    "supplier" "text",
    "warranty_months" integer DEFAULT 0,
    "default_cost" numeric,
    "default_price" numeric,
    "subcategory" "text",
    "low_stock_threshold" numeric,
    "unit" "text",
    "taxable" boolean DEFAULT true
);


ALTER TABLE "public"."parts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."part_stock_summary" AS
 SELECT "p"."id" AS "part_id",
    "p"."shop_id",
    "p"."name",
    "p"."sku",
    "p"."category",
    "p"."price",
    COALESCE("sum"("sm"."qty_change"), (0)::numeric) AS "on_hand",
    "count"("sm"."id") AS "move_count"
   FROM ("public"."parts" "p"
     LEFT JOIN "public"."stock_moves" "sm" ON (("sm"."part_id" = "p"."id")))
  GROUP BY "p"."id", "p"."shop_id", "p"."name", "p"."sku", "p"."category", "p"."price";


ALTER TABLE "public"."part_stock_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_info" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shop_id" "uuid"
);


ALTER TABLE "public"."part_suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."part_warranties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid",
    "shop_id" "uuid",
    "warranty_provider" "text",
    "warranty_period_months" integer,
    "coverage_details" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."part_warranties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_barcodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "barcode" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text",
    "supplier_id" "uuid"
);


ALTER TABLE "public"."parts_barcodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid",
    "sender_id" "uuid",
    "recipient_role" "text",
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parts_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_quote_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "requested_by" "uuid",
    "status" "public"."quote_request_status" DEFAULT 'pending'::"public"."quote_request_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parts_quote_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "part_name" "text",
    "part_number" "text",
    "quantity" integer,
    "price" numeric,
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parts_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_request_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid",
    "sender_id" "uuid",
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parts_request_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "job_id" "uuid",
    "requested_by" "uuid",
    "part_name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "photo_url" "text",
    "photo_urls" "text"[],
    "urgency" "text" DEFAULT 'medium'::"text",
    "work_order_id" "uuid",
    "viewed" boolean DEFAULT false,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "viewed_at" timestamp with time zone,
    "fulfilled_at" timestamp with time zone,
    "archived" boolean DEFAULT false
);


ALTER TABLE "public"."parts_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "supplier_name" "text" NOT NULL,
    "api_key" "text",
    "api_base_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parts_suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "work_order_id" "uuid",
    "stripe_session_id" "text" NOT NULL,
    "stripe_payment_intent_id" "text",
    "amount_cents" integer NOT NULL,
    "currency" "text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_checkout_session_id" "text",
    "stripe_charge_id" "text",
    "stripe_connected_account_id" "text",
    "work_order_line_id" "uuid",
    "customer_id" "uuid",
    "created_by" "uuid",
    "description" "text",
    "platform_fee_cents" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "payments_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "payments_currency_check" CHECK (("currency" = ANY (ARRAY['usd'::"text", 'cad'::"text"]))),
    CONSTRAINT "payments_platform_fee_nonnegative" CHECK (("platform_fee_cents" >= 0)),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'pending'::"text", 'paid'::"text", 'failed'::"text", 'canceled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_deductions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timecard_id" "uuid",
    "deduction_type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_deductions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_export_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid",
    "pay_period_id" "uuid",
    "status" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_export_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_pay_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "processed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_pay_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "provider_name" "text" NOT NULL,
    "api_key" "text",
    "api_base_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_timecards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "shop_id" "uuid",
    "clock_in" timestamp with time zone NOT NULL,
    "clock_out" timestamp with time zone,
    "hours_worked" numeric(8,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_timecards_clock_out_after_in" CHECK ((("clock_in" IS NULL) OR ("clock_out" IS NULL) OR ("clock_out" > "clock_in"))),
    CONSTRAINT "payroll_timecards_positive_hours" CHECK ((("hours_worked" IS NULL) OR ("hours_worked" >= (0)::numeric)))
);


ALTER TABLE "public"."payroll_timecards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "step" integer NOT NULL,
    "kind" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."planner_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "planner_kind" "text" NOT NULL,
    "goal" "text" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "planner_runs_planner_kind_check" CHECK (("planner_kind" = ANY (ARRAY['simple'::"text", 'openai'::"text", 'fleet'::"text", 'approvals'::"text"]))),
    CONSTRAINT "planner_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."planner_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "work_order_id" "uuid",
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "portal_notifications_kind_check" CHECK (("kind" = ANY (ARRAY['invoice_ready'::"text", 'appointment_confirmed'::"text", 'work_order_updated'::"text"])))
);


ALTER TABLE "public"."portal_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "role" "text",
    "shop_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "plan" "public"."plan_t",
    "business_name" "text",
    "shop_name" "text",
    "street" "text",
    "city" "text",
    "province" "text",
    "postal_code" "text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone,
    "completed_onboarding" boolean DEFAULT false NOT NULL,
    "last_active_at" timestamp with time zone,
    "user_id" "uuid",
    "username" "text",
    "must_change_password" boolean DEFAULT false NOT NULL,
    "agent_role" "text" DEFAULT 'none'::"text",
    "organization_id" "uuid",
    "tech_signature_path" "text",
    "tech_signature_hash" "text",
    "tech_signature_updated_at" timestamp with time zone,
    CONSTRAINT "profiles_agent_role_check" CHECK (("agent_role" = ANY (ARRAY['developer'::"text", 'none'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'mechanic'::"text", 'parts'::"text", 'driver'::"text", 'dispatcher'::"text", 'fleet_manager'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."punch_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "profile_id" "uuid",
    "shift_id" "uuid",
    "event_type" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    CONSTRAINT "punch_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['start_shift'::"text", 'end_shift'::"text", 'break_start'::"text", 'break_end'::"text", 'lunch_start'::"text", 'lunch_end'::"text"])))
);


ALTER TABLE "public"."punch_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "description" "text",
    "qty_ordered" numeric(12,2) NOT NULL,
    "qty_received" numeric(12,2) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "location_id" "uuid"
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_id" "uuid" NOT NULL,
    "part_id" "uuid",
    "sku" "text",
    "description" "text",
    "qty" numeric NOT NULL,
    "unit_cost" numeric,
    "location_id" "uuid",
    "received_qty" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_order_lines_qty_check" CHECK (("qty" >= (0)::numeric)),
    CONSTRAINT "purchase_order_lines_received_qty_check" CHECK (("received_qty" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_order_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "ordered_at" "date",
    "expected_at" "date",
    "received_at" "date",
    "subtotal" numeric(12,2) DEFAULT 0,
    "tax_total" numeric(12,2) DEFAULT 0,
    "shipping_total" numeric(12,2) DEFAULT 0,
    "total" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "notes" "text"
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "labor_time" numeric,
    "labor_rate" numeric,
    "parts_cost" numeric,
    "quantity" integer DEFAULT 1,
    "total" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "item" "text",
    "part_price" numeric DEFAULT 0,
    "part_name" "text",
    "name" "text",
    "notes" "text",
    "status" "text",
    "price" numeric DEFAULT 0,
    "part" "jsonb",
    "photo_urls" "text"[],
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "quote_lines_status_check" CHECK (("status" = ANY (ARRAY['fail'::"text", 'recommend'::"text", 'ok'::"text", 'na'::"text"])))
);


ALTER TABLE "public"."quote_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "title" "text",
    "hook" "text",
    "voiceover_text" "text",
    "shots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "overlays" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "music_direction" "text",
    "estimated_duration_seconds" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reel_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_render_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "work_order_id" "uuid",
    "video_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "source_type" "text",
    "source_id" "uuid",
    "render_payload" "jsonb" NOT NULL,
    "output_url" "text",
    "thumbnail_url" "text",
    "error_message" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reel_render_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year_bucket" "text" NOT NULL,
    "title" "text" NOT NULL,
    "labor_time" numeric,
    "parts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shop_id" "uuid",
    "created_by" "uuid",
    "visibility" "text" DEFAULT 'shop'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid"
);


ALTER TABLE "public"."saved_menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_ai_profiles" (
    "shop_id" "uuid" NOT NULL,
    "summary" "jsonb" NOT NULL,
    "last_refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_ai_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_boost_intakes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "questionnaire" "jsonb" NOT NULL,
    "customers_file_path" "text",
    "vehicles_file_path" "text",
    "parts_file_path" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "source" "text",
    "intake_basics" "jsonb",
    "created_by" "uuid",
    "staff_file_path" "text",
    "history_file_path" "text",
    CONSTRAINT "shop_boost_intakes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."shop_boost_intakes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_content_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "content_type" "text" NOT NULL,
    "avg_engagement_score" numeric,
    "total_views" integer,
    "total_leads" integer,
    "posts_generated" integer,
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_content_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_health_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "intake_id" "uuid",
    "period_start" "date",
    "period_end" "date",
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "scores" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "narrative_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_health_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "weekday" integer NOT NULL,
    "open_time" "text" NOT NULL,
    "close_time" "text" NOT NULL,
    CONSTRAINT "shop_hours_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."shop_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_import_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intake_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text",
    "sha256" "text",
    "parsed_row_count" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_import_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_import_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intake_id" "uuid" NOT NULL,
    "file_id" "uuid",
    "row_number" integer,
    "entity_type" "text",
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normalized" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "errors" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_import_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_marketing_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "memory_key" "text" NOT NULL,
    "memory_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_type" "text",
    "source_id" "uuid",
    "confidence" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_marketing_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_members" (
    "shop_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "shop_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'mechanic'::"text", 'parts'::"text", 'driver'::"text", 'dispatcher'::"text", 'fleet_manager'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."shop_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid",
    "shop_id" "uuid",
    "quantity" integer DEFAULT 0 NOT NULL,
    "location" "text",
    "restock_threshold" integer DEFAULT 5,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_profiles" (
    "shop_id" "uuid" NOT NULL,
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "province" "text",
    "postal_code" "text",
    "country" "text" DEFAULT 'US'::"text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "hours" "jsonb",
    "tagline" "text",
    "description" "text",
    "images" "text"[],
    "latitude" double precision,
    "longitude" double precision,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "business_name" "text",
    "plan" "text",
    "user_limit" integer DEFAULT 1,
    "active_user_count" integer DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "address" "text",
    "postal_code" "text",
    "city" "text",
    "province" "text",
    "phone_number" "text",
    "email" "text",
    "logo_url" "text",
    "labor_rate" numeric,
    "supplies_percent" numeric,
    "diagnostic_fee" numeric,
    "tax_rate" numeric,
    "use_ai" boolean DEFAULT false,
    "require_cause_correction" boolean DEFAULT false,
    "require_authorization" boolean DEFAULT false,
    "invoice_terms" "text",
    "invoice_footer" "text",
    "email_on_complete" boolean DEFAULT false,
    "auto_generate_pdf" boolean DEFAULT false,
    "auto_send_quote_email" boolean DEFAULT false,
    "slug" "text",
    "timezone" "text" DEFAULT 'America/Los_Angeles'::"text",
    "accepts_online_booking" boolean DEFAULT true,
    "min_notice_minutes" integer DEFAULT 120,
    "max_lead_days" integer DEFAULT 30,
    "owner_pin_hash" "text",
    "name" "text",
    "pin" "text",
    "shop_name" "text",
    "street" "text",
    "owner_pin" "text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone,
    "geo_lat" numeric,
    "geo_lng" numeric,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "rating" numeric,
    "country" "text" DEFAULT 'US'::"text",
    "max_users" integer GENERATED ALWAYS AS (
CASE "plan"
    WHEN 'pro'::"text" THEN 30
    WHEN 'pro_plus'::"text" THEN 2147483647
    ELSE COALESCE("user_limit", 1)
END) STORED,
    "stripe_account_id" "text",
    "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
    "stripe_details_submitted" boolean DEFAULT false NOT NULL,
    "stripe_onboarding_completed" boolean DEFAULT false NOT NULL,
    "stripe_default_currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "stripe_platform_fee_bps" integer DEFAULT 0 NOT NULL,
    "stripe_subscription_status" "text",
    "stripe_trial_end" timestamp with time zone,
    "stripe_current_period_end" timestamp with time zone,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "organization_id" "uuid",
    "default_stock_location_id" "uuid",
    CONSTRAINT "shops_active_user_count_le_max_users" CHECK ((COALESCE("active_user_count", 0) <= COALESCE("max_users", 1))),
    CONSTRAINT "shops_country_na_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"]))),
    CONSTRAINT "shops_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'diy'::"text", 'pro'::"text", 'pro_plus'::"text"]))),
    CONSTRAINT "shops_platform_fee_bps_range" CHECK ((("stripe_platform_fee_bps" >= 0) AND ("stripe_platform_fee_bps" <= 10000))),
    CONSTRAINT "shops_rating_check" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric))),
    CONSTRAINT "shops_stripe_status_check" CHECK ((("stripe_subscription_status" IS NULL) OR ("stripe_subscription_status" = ANY (ARRAY['incomplete'::"text", 'incomplete_expired'::"text", 'trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'unpaid'::"text", 'paused'::"text"]))))
);


ALTER TABLE "public"."shops" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."shop_public_profiles" AS
 SELECT "shops"."id",
    "shops"."name",
    "shops"."city",
    "shops"."province",
    "shops"."logo_url",
    "shops"."images",
    "shops"."geo_lat",
    "shops"."geo_lng",
    "shops"."rating"
   FROM "public"."shops";


ALTER TABLE "public"."shop_public_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "score" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shop_ratings_score_check" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."shop_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_reel_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "publish_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "default_cta" "text" DEFAULT ''::"text" NOT NULL,
    "default_location" "text" DEFAULT ''::"text" NOT NULL,
    "brand_voice" "text" DEFAULT ''::"text" NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shop_reel_settings_publish_mode_check" CHECK (("publish_mode" = ANY (ARRAY['manual'::"text", 'approval_required'::"text", 'autopilot'::"text"])))
);


ALTER TABLE "public"."shop_reel_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "reviewer_user_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "rating" numeric NOT NULL,
    "comment" "text",
    "shop_owner_reply" "text",
    "replied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "public_name" "text",
    CONSTRAINT "shop_reviews_rating_check" CHECK ((("rating" >= (1)::numeric) AND ("rating" <= (5)::numeric)))
);


ALTER TABLE "public"."shop_reviews" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."shop_reviews_public" AS
 SELECT "r"."id",
    "r"."shop_id",
    "r"."rating",
    "r"."comment",
    "r"."created_at",
    COALESCE("r"."shop_owner_reply", ''::"text") AS "shop_owner_reply",
    "r"."replied_at"
   FROM "public"."shop_reviews" "r";


ALTER TABLE "public"."shop_reviews_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "date" "date" NOT NULL,
    "time_slot" "text" NOT NULL,
    "is_booked" boolean DEFAULT false,
    "booked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "province" "text" DEFAULT 'AB'::"text",
    "timezone" "text" DEFAULT 'America/Edmonton'::"text",
    "allow_customer_quotes" boolean DEFAULT true,
    "allow_self_booking" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."shop_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_tax_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "tax_rate_id" "uuid",
    "override_rate" numeric(6,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_tax_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_time_off" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "reason" "text"
);


ALTER TABLE "public"."shop_time_off" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_time_slots" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "shop_id" "uuid",
    "start_time" timestamp without time zone NOT NULL,
    "end_time" timestamp without time zone NOT NULL,
    "is_booked" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_time_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shop_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."shop_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_vehicle_menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_menu_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_vehicle_menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopreel_manual_asset_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "manual_asset_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_url" "text",
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "width" integer,
    "height" integer,
    "duration_seconds" numeric,
    "size_bytes" bigint,
    "metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shopreel_manual_asset_files_file_type_check" CHECK (("file_type" = ANY (ARRAY['image'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."shopreel_manual_asset_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopreel_manual_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "source_type" "text" DEFAULT 'manual_upload'::"text" NOT NULL,
    "asset_type" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "content_goal" "text",
    "note" "text",
    "platform_targets" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "primary_file_url" "text",
    "thumbnail_url" "text",
    "duration_seconds" numeric,
    "metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shopreel_manual_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['image'::"text", 'video'::"text", 'mixed'::"text"]))),
    CONSTRAINT "shopreel_manual_assets_content_goal_check" CHECK (("content_goal" = ANY (ARRAY['educational_tip'::"text", 'before_after'::"text", 'repair_story'::"text", 'promotion'::"text", 'customer_trust'::"text", 'team_culture'::"text", 'seasonal_reminder'::"text", 'product_spotlight'::"text"]))),
    CONSTRAINT "shopreel_manual_assets_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'uploaded'::"text", 'processing'::"text", 'ready'::"text", 'archived'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."shopreel_manual_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopreel_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid",
    "connection_id" "uuid",
    "platform" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "published_at" timestamp with time zone,
    "external_post_id" "text",
    "external_url" "text",
    "caption_override" "text",
    "title_override" "text",
    "publish_payload_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shopreel_publications_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'scheduled'::"text", 'publishing'::"text", 'published'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."shopreel_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopreel_publish_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "publication_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "completed_at" timestamp with time zone,
    "error_message" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shopreel_publish_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopreel_social_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "account_id" "text",
    "account_name" "text",
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "connection_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "meta_page_id" "text",
    "meta_page_name" "text",
    "meta_instagram_business_id" "text",
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."shopreel_social_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invite_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "intake_id" "uuid",
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "username" "text",
    "role" "public"."user_role_enum",
    "source" "text" DEFAULT 'staff_csv'::"text" NOT NULL,
    "confidence" numeric,
    "created_profile_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_lc" "text" GENERATED ALWAYS AS ("lower"("email")) STORED,
    "username_lc" "text" GENERATED ALWAYS AS ("lower"("username")) STORED,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_user_id" "uuid",
    "created_by" "uuid",
    "error" "text",
    CONSTRAINT "staff_invite_candidates_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))))
);


ALTER TABLE "public"."staff_invite_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invite_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "intake_id" "uuid",
    "role" "text" NOT NULL,
    "count_suggested" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "email" "text",
    "external_id" "text"
);


ALTER TABLE "public"."staff_invite_suggestions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stock_balances" AS
 SELECT "m"."part_id",
    "m"."location_id",
    "sum"("m"."qty_change") AS "on_hand"
   FROM "public"."stock_moves" "m"
  GROUP BY "m"."part_id", "m"."location_id";


ALTER TABLE "public"."stock_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."stock_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_catalog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "external_sku" "text" NOT NULL,
    "description" "text",
    "brand" "text",
    "cost" numeric(10,2),
    "price" numeric(10,2),
    "compatibility" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplier_catalog_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "shop_id" "uuid",
    "work_order_id" "uuid",
    "external_order_id" "text",
    "status" "text" NOT NULL,
    "items" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplier_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catalog_item_id" "uuid",
    "old_price" numeric(10,2),
    "new_price" numeric(10,2),
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplier_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "account_no" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_calculation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "work_order_id" "uuid",
    "quote_id" "uuid",
    "jurisdiction_id" "uuid",
    "gst" numeric(10,2),
    "pst" numeric(10,2),
    "hst" numeric(10,2),
    "total_tax" numeric(10,2) NOT NULL,
    "breakdown" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tax_calculation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_jurisdictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tax_jurisdictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "provider_name" "text" NOT NULL,
    "api_key" "text",
    "api_base_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tax_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jurisdiction_id" "uuid",
    "rate" numeric(6,4) NOT NULL,
    "tax_type" "text" NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tax_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tech_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "inspection_id" "uuid",
    "work_order_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "shop_id" "uuid",
    "shift_id" "uuid",
    "work_order_line_id" "uuid"
);


ALTER TABLE "public"."tech_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tech_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'shift'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "shop_id" "uuid",
    CONSTRAINT "tech_shifts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"]))),
    CONSTRAINT "tech_shifts_type_check" CHECK (("type" = ANY (ARRAY['shift'::"text", 'break'::"text", 'lunch'::"text"])))
);


ALTER TABLE "public"."tech_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "section" "text",
    "label" "text",
    "input_type" "text" DEFAULT 'text'::"text"
);


ALTER TABLE "public"."template_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "feature" "text",
    "used_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_app_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "layout" "jsonb" NOT NULL,
    "wallpaper" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_app_layouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plan_name" "text" NOT NULL,
    "features" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_widget_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "layout" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_widget_layouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "year" integer,
    "make" "text",
    "model" "text",
    "vin" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "license_plate" "text",
    "mileage" "text",
    "color" "text",
    "customer_id" "uuid",
    "shop_id" "uuid",
    "unit_number" "text",
    "engine_hours" integer,
    "engine_type" "text",
    "transmission_type" "text",
    "drivetrain" "text",
    "submodel" "text",
    "engine" "text",
    "transmission" "text",
    "fuel_type" "text",
    "engine_family" "text",
    "source_intake_id" "uuid",
    "source_row_id" "uuid",
    "external_id" "text",
    "import_confidence" numeric,
    "import_notes" "text"
);

ALTER TABLE ONLY "public"."vehicles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_fleet_inspections_due_30" AS
 SELECT "fis"."id" AS "schedule_id",
    "fis"."shop_id",
    "s"."name" AS "shop_name",
    "fis"."vehicle_id",
    "v"."unit_number",
    "v"."vin",
    "fis"."last_inspection_date",
    "fis"."next_inspection_date",
    "fis"."interval_days",
    "fis"."notes",
    GREATEST(0, ("fis"."next_inspection_date" - CURRENT_DATE)) AS "days_until_due"
   FROM (("public"."fleet_inspection_schedules" "fis"
     JOIN "public"."shops" "s" ON (("s"."id" = "fis"."shop_id")))
     JOIN "public"."vehicles" "v" ON (("v"."id" = "fis"."vehicle_id")))
  WHERE (("fis"."next_inspection_date" IS NOT NULL) AND ("fis"."next_inspection_date" <= (CURRENT_DATE + 30)))
  ORDER BY "fis"."next_inspection_date", "v"."unit_number";


ALTER TABLE "public"."v_fleet_inspections_due_30" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_fleet_inspection_buckets" AS
 SELECT "v_fleet_inspections_due_30"."shop_id",
    "v_fleet_inspections_due_30"."shop_name",
    "count"(*) FILTER (WHERE (("v_fleet_inspections_due_30"."days_until_due" >= 0) AND ("v_fleet_inspections_due_30"."days_until_due" <= 7))) AS "due_7_days",
    "count"(*) FILTER (WHERE (("v_fleet_inspections_due_30"."days_until_due" >= 8) AND ("v_fleet_inspections_due_30"."days_until_due" <= 14))) AS "due_14_days",
    "count"(*) FILTER (WHERE (("v_fleet_inspections_due_30"."days_until_due" >= 15) AND ("v_fleet_inspections_due_30"."days_until_due" <= 30))) AS "due_30_days",
    "count"(*) AS "total_due_30_days"
   FROM "public"."v_fleet_inspections_due_30"
  GROUP BY "v_fleet_inspections_due_30"."shop_id", "v_fleet_inspections_due_30"."shop_name"
  ORDER BY "v_fleet_inspections_due_30"."shop_name";


ALTER TABLE "public"."v_fleet_inspection_buckets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_fleet_inspections_due_14" AS
 SELECT "fis"."id" AS "schedule_id",
    "fis"."shop_id",
    "s"."name" AS "shop_name",
    "fis"."vehicle_id",
    "v"."unit_number",
    "v"."vin",
    "fis"."last_inspection_date",
    "fis"."next_inspection_date",
    "fis"."interval_days",
    "fis"."notes",
    GREATEST(0, ("fis"."next_inspection_date" - CURRENT_DATE)) AS "days_until_due"
   FROM (("public"."fleet_inspection_schedules" "fis"
     JOIN "public"."shops" "s" ON (("s"."id" = "fis"."shop_id")))
     JOIN "public"."vehicles" "v" ON (("v"."id" = "fis"."vehicle_id")))
  WHERE (("fis"."next_inspection_date" IS NOT NULL) AND ("fis"."next_inspection_date" <= (CURRENT_DATE + 14)))
  ORDER BY "fis"."next_inspection_date", "v"."unit_number";


ALTER TABLE "public"."v_fleet_inspections_due_14" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_fleet_inspections_due_7" AS
 SELECT "fis"."id" AS "schedule_id",
    "fis"."shop_id",
    "s"."name" AS "shop_name",
    "fis"."vehicle_id",
    "v"."unit_number",
    "v"."vin",
    "fis"."last_inspection_date",
    "fis"."next_inspection_date",
    "fis"."interval_days",
    "fis"."notes",
    GREATEST(0, ("fis"."next_inspection_date" - CURRENT_DATE)) AS "days_until_due"
   FROM (("public"."fleet_inspection_schedules" "fis"
     JOIN "public"."shops" "s" ON (("s"."id" = "fis"."shop_id")))
     JOIN "public"."vehicles" "v" ON (("v"."id" = "fis"."vehicle_id")))
  WHERE (("fis"."next_inspection_date" IS NOT NULL) AND ("fis"."next_inspection_date" <= (CURRENT_DATE + 7)))
  ORDER BY "fis"."next_inspection_date", "v"."unit_number";


ALTER TABLE "public"."v_fleet_inspections_due_7" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_global_saved_menu_items" AS
 SELECT "saved_menu_items"."id",
    "saved_menu_items"."make",
    "saved_menu_items"."model",
    "saved_menu_items"."year_bucket",
    "saved_menu_items"."title",
    "saved_menu_items"."labor_time",
    "saved_menu_items"."parts",
    "saved_menu_items"."created_at",
    "saved_menu_items"."updated_at",
    "saved_menu_items"."shop_id",
    "saved_menu_items"."created_by",
    "saved_menu_items"."visibility",
    "saved_menu_items"."published_at",
    "saved_menu_items"."published_by"
   FROM "public"."saved_menu_items"
  WHERE (("saved_menu_items"."visibility" = 'global'::"text") AND ("saved_menu_items"."published_at" IS NOT NULL));


ALTER TABLE "public"."v_global_saved_menu_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_my_conversation_ids" WITH ("security_invoker"='true') AS
 SELECT "cp"."conversation_id"
   FROM "public"."conversation_participants" "cp"
  WHERE ("cp"."user_id" = "auth"."uid"())
UNION
 SELECT "c"."id" AS "conversation_id"
   FROM "public"."conversations" "c"
  WHERE ("c"."created_by" = "auth"."uid"());


ALTER TABLE "public"."v_my_conversation_ids" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_my_messages" WITH ("security_invoker"='true') AS
 SELECT "m"."id",
    "m"."conversation_id",
    "m"."sender_id",
    "m"."content",
    "m"."sent_at",
    "m"."created_at"
   FROM "public"."messages" "m"
  WHERE ((EXISTS ( SELECT 1
           FROM "public"."conversations" "c"
          WHERE (("c"."id" = "m"."conversation_id") AND ("c"."created_by" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp"
          WHERE (("cp"."conversation_id" = "m"."conversation_id") AND ("cp"."user_id" = "auth"."uid"())))));


ALTER TABLE "public"."v_my_messages" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_part_stock" AS
 SELECT "ps"."part_id",
    "ps"."location_id",
    "ps"."qty_on_hand",
    "ps"."qty_reserved",
    ("ps"."qty_on_hand" - "ps"."qty_reserved") AS "qty_available"
   FROM "public"."part_stock" "ps";


ALTER TABLE "public"."v_part_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_part_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qty" numeric(12,2) NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "stock_move_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "work_order_id" "uuid",
    "source_request_item_id" "uuid",
    "shop_id" "uuid" NOT NULL
);


ALTER TABLE "public"."work_order_part_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "part_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2),
    "total_price" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shop_id" "uuid",
    "work_order_line_id" "uuid"
);


ALTER TABLE "public"."work_order_parts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_parts_reconciliation" AS
 WITH "wop" AS (
         SELECT "work_order_parts"."work_order_id",
            "sum"(COALESCE("work_order_parts"."total_price", (0)::numeric)) AS "wop_total"
           FROM "public"."work_order_parts"
          GROUP BY "work_order_parts"."work_order_id"
        ), "alloc" AS (
         SELECT "work_order_part_allocations"."work_order_id",
            "sum"(GREATEST((0)::numeric, (
                CASE
                    WHEN (COALESCE("work_order_part_allocations"."qty", (0)::numeric) > (0)::numeric) THEN "work_order_part_allocations"."qty"
                    ELSE (1)::numeric
                END * COALESCE("work_order_part_allocations"."unit_cost", (0)::numeric)))) AS "alloc_total"
           FROM "public"."work_order_part_allocations"
          GROUP BY "work_order_part_allocations"."work_order_id"
        )
 SELECT COALESCE("a"."work_order_id", "w"."work_order_id") AS "work_order_id",
    COALESCE("a"."alloc_total", (0)::numeric) AS "alloc_total",
    COALESCE("w"."wop_total", (0)::numeric) AS "wop_total",
    (COALESCE("a"."alloc_total", (0)::numeric) - COALESCE("w"."wop_total", (0)::numeric)) AS "diff",
        CASE
            WHEN ((COALESCE("a"."alloc_total", (0)::numeric) <= 0.01) AND (COALESCE("w"."wop_total", (0)::numeric) <= 0.01)) THEN 'NO_PARTS_EXPECTED_OR_RECORDED'::"text"
            WHEN ((COALESCE("a"."alloc_total", (0)::numeric) > 0.01) AND (COALESCE("w"."wop_total", (0)::numeric) <= 0.01)) THEN 'ALLOCATIONS_ONLY_NO_WOP'::"text"
            WHEN ((COALESCE("a"."alloc_total", (0)::numeric) <= 0.01) AND (COALESCE("w"."wop_total", (0)::numeric) > 0.01)) THEN 'WOP_ONLY_NO_ALLOC'::"text"
            WHEN ("abs"((COALESCE("a"."alloc_total", (0)::numeric) - COALESCE("w"."wop_total", (0)::numeric))) <= 0.01) THEN 'OK_MATCH'::"text"
            ELSE 'MISMATCH'::"text"
        END AS "status"
   FROM ("alloc" "a"
     FULL JOIN "wop" "w" ON (("w"."work_order_id" = "a"."work_order_id")));


ALTER TABLE "public"."v_parts_reconciliation" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_portal_invoices" AS
 SELECT "wo"."id" AS "work_order_id",
    "wo"."shop_id",
    "wo"."customer_id",
    "wo"."vehicle_id",
    "wo"."status",
    "wo"."approval_state",
    "wo"."invoice_total",
    "wo"."invoice_url",
    "wo"."invoice_pdf_url",
    "wo"."invoice_sent_at",
    "wo"."invoice_last_sent_to",
    "wo"."created_at",
    "wo"."updated_at"
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."invoice_sent_at" IS NOT NULL) OR ("wo"."invoice_pdf_url" IS NOT NULL) OR ("wo"."invoice_url" IS NOT NULL) OR ("wo"."status" = ANY (ARRAY['ready_to_invoice'::"text", 'invoiced'::"text"])));


ALTER TABLE "public"."v_portal_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "complaint" "text",
    "cause" "text",
    "correction" "text",
    "tools" "text",
    "labor_time" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "line_status" "text",
    "parts_required" "jsonb" DEFAULT '[]'::"jsonb",
    "parts_received" "jsonb" DEFAULT '[]'::"jsonb",
    "on_hold_since" timestamp without time zone,
    "hold_reason" "text",
    "description" "text",
    "user_id" "uuid",
    "vehicle_id" "uuid",
    "assigned_to" "uuid",
    "job_type" "text" DEFAULT 'repair'::"text",
    "priority" smallint DEFAULT 100,
    "status" "text" DEFAULT 'awaiting'::"text",
    "punched_in_at" timestamp with time zone,
    "punched_out_at" timestamp with time zone,
    "assigned_tech_id" "uuid",
    "updated_at" timestamp with time zone,
    "parts_needed" "jsonb",
    "template_id" "uuid",
    "notes" "text",
    "shop_id" "uuid",
    "approval_state" "text",
    "approval_at" timestamp with time zone,
    "approval_by" "uuid",
    "approval_note" "text",
    "inspection_session_id" "uuid",
    "urgency" "text" DEFAULT 'medium'::"text",
    "parts" "text",
    "price_estimate" numeric,
    "quoted_at" timestamp with time zone,
    "line_no" integer,
    "punchable" boolean GENERATED ALWAYS AS ((("approval_state" = 'approved'::"text") AND ("status" <> ALL (ARRAY['awaiting_approval'::"text", 'declined'::"text"])))) STORED,
    "inspection_template_id" "uuid",
    "menu_item_id" "uuid",
    "service_code" "text",
    "odometer_km" integer,
    "source_intake_id" "uuid",
    "source_row_id" "uuid",
    "external_id" "text",
    "import_confidence" numeric,
    "import_notes" "text",
    "voided_at" timestamp with time zone,
    "voided_reason" "text",
    "voided_note" "text",
    "voided_by" "uuid",
    "intake_json" "jsonb",
    "intake_status" "text",
    "intake_submitted_at" timestamp with time zone,
    "intake_submitted_by" "uuid",
    CONSTRAINT "work_order_lines_approval_state_check" CHECK ((("approval_state" IS NULL) OR ("approval_state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"])))),
    CONSTRAINT "work_order_lines_assignee_consistent" CHECK ((("assigned_tech_id" IS NULL) OR ("assigned_to" IS NULL) OR ("assigned_tech_id" = "assigned_to"))),
    CONSTRAINT "work_order_lines_inspection_or_template_requires_session_chk" CHECK (((("job_type" <> 'inspection'::"text") AND ("inspection_template_id" IS NULL)) OR ("inspection_session_id" IS NOT NULL))),
    CONSTRAINT "work_order_lines_intake_status_check" CHECK ((("intake_status" IS NULL) OR ("intake_status" = ANY (ARRAY['draft'::"text", 'submitted'::"text"])))),
    CONSTRAINT "work_order_lines_job_type_check" CHECK ((("job_type" IS NULL) OR ("job_type" = ANY (ARRAY['diagnosis'::"text", 'inspection'::"text", 'maintenance'::"text", 'repair'::"text", 'tech-suggested'::"text"])))),
    CONSTRAINT "work_order_lines_punch_order_chk" CHECK ((("punched_out_at" IS NULL) OR ("punched_in_at" IS NULL) OR ("punched_out_at" >= "punched_in_at"))),
    CONSTRAINT "work_order_lines_status_check" CHECK (("status" = ANY (ARRAY['awaiting'::"text", 'queued'::"text", 'in_progress'::"text", 'on_hold'::"text", 'paused'::"text", 'completed'::"text", 'assigned'::"text", 'unassigned'::"text", 'awaiting_approval'::"text", 'declined'::"text", 'quoted'::"text"]))),
    CONSTRAINT "work_order_lines_urgency_check" CHECK (("urgency" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."work_order_lines" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_quote_queue" AS
 SELECT "wol"."id",
    "wol"."work_order_id",
    "wol"."complaint",
    "wol"."cause",
    "wol"."correction",
    "wol"."tools",
    "wol"."labor_time",
    "wol"."created_at",
    "wol"."line_status",
    "wol"."parts_required",
    "wol"."parts_received",
    "wol"."on_hold_since",
    "wol"."hold_reason",
    "wol"."description",
    "wol"."user_id",
    "wol"."vehicle_id",
    "wol"."assigned_to",
    "wol"."job_type",
    "wol"."priority",
    "wol"."status",
    "wol"."punched_in_at",
    "wol"."punched_out_at",
    "wol"."assigned_tech_id",
    "wol"."updated_at",
    "wol"."parts_needed",
    "wol"."template_id",
    "wol"."notes",
    "wol"."shop_id",
    "wol"."approval_state",
    "wol"."approval_at",
    "wol"."approval_by",
    "wol"."approval_note",
    "wol"."inspection_session_id",
    "wol"."urgency",
    "wol"."parts",
    "wol"."price_estimate",
    "wo"."custom_id" AS "work_order_custom_id",
    "wo"."vehicle_id" AS "work_order_vehicle_id",
    "wo"."customer_id" AS "work_order_customer_id"
   FROM ("public"."work_order_lines" "wol"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "wol"."work_order_id")))
  WHERE ("wol"."approval_state" = 'pending'::"text")
  ORDER BY "wol"."created_at";


ALTER TABLE "public"."v_quote_queue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_shift_rollups" AS
 WITH "ordered" AS (
         SELECT "pe"."shift_id",
            "pe"."user_id",
            "pe"."event_type",
            "pe"."timestamp",
            "lead"("pe"."timestamp") OVER (PARTITION BY "pe"."shift_id" ORDER BY "pe"."timestamp") AS "next_ts"
           FROM "public"."punch_events" "pe"
        ), "segments" AS (
         SELECT "ordered"."shift_id",
            "ordered"."user_id",
            "ordered"."event_type",
            "ordered"."timestamp",
            COALESCE("ordered"."next_ts", "now"()) AS "ts_end"
           FROM "ordered"
        )
 SELECT "s"."shift_id",
    "s"."user_id",
    "sum"(
        CASE
            WHEN ("s"."event_type" = ANY (ARRAY['start'::"text", 'break_end'::"text", 'lunch_end'::"text"])) THEN (EXTRACT(epoch FROM ("s"."ts_end" - "s"."timestamp")))::bigint
            ELSE (0)::bigint
        END) AS "worked_seconds"
   FROM "segments" "s"
  GROUP BY "s"."shift_id", "s"."user_id";


ALTER TABLE "public"."v_shift_rollups" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_shop_boost_overview" WITH ("security_barrier"='true') AS
 WITH "latest_snapshot_by_intake" AS (
         SELECT DISTINCT ON ("shop_health_snapshots"."intake_id") "shop_health_snapshots"."id" AS "snapshot_id",
            "shop_health_snapshots"."shop_id",
            "shop_health_snapshots"."intake_id",
            "shop_health_snapshots"."scores",
            "shop_health_snapshots"."metrics",
            "shop_health_snapshots"."created_at"
           FROM "public"."shop_health_snapshots"
          ORDER BY "shop_health_snapshots"."intake_id", "shop_health_snapshots"."created_at" DESC
        ), "file_counts" AS (
         SELECT "shop_import_files"."intake_id",
            ("count"(*))::integer AS "file_count"
           FROM "public"."shop_import_files"
          GROUP BY "shop_import_files"."intake_id"
        ), "row_counts" AS (
         SELECT "shop_import_rows"."intake_id",
            ("count"(*))::integer AS "row_count"
           FROM "public"."shop_import_rows"
          GROUP BY "shop_import_rows"."intake_id"
        )
 SELECT "i"."id" AS "intake_id",
    "i"."shop_id",
    "i"."status" AS "intake_status",
    "i"."source" AS "intake_source",
    "i"."created_at" AS "intake_created_at",
    "i"."processed_at" AS "intake_processed_at",
    COALESCE("fc"."file_count", 0) AS "import_file_count",
    COALESCE("rc"."row_count", 0) AS "import_row_count",
    "ls"."snapshot_id" AS "latest_snapshot_id",
    "ls"."created_at" AS "latest_snapshot_created_at",
    "ls"."scores" AS "latest_scores",
    "ls"."metrics" AS "latest_metrics"
   FROM ((("public"."shop_boost_intakes" "i"
     LEFT JOIN "file_counts" "fc" ON (("fc"."intake_id" = "i"."id")))
     LEFT JOIN "row_counts" "rc" ON (("rc"."intake_id" = "i"."id")))
     LEFT JOIN "latest_snapshot_by_intake" "ls" ON (("ls"."intake_id" = "i"."id")));


ALTER TABLE "public"."v_shop_boost_overview" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_shop_boost_suggestions" AS
 SELECT 'menu_item'::"text" AS "suggestion_type",
    "mis"."id",
    "mis"."shop_id",
    "mis"."intake_id",
    COALESCE("mis"."title", 'Untitled'::"text") AS "name",
    "mis"."category",
    "mis"."price_suggestion",
    "mis"."labor_hours_suggestion",
    "mis"."confidence",
    "mis"."reason",
    "mis"."created_at"
   FROM "public"."menu_item_suggestions" "mis"
UNION ALL
 SELECT 'inspection_template'::"text" AS "suggestion_type",
    "its"."id",
    "its"."shop_id",
    "its"."intake_id",
    COALESCE("its"."name", 'Untitled'::"text") AS "name",
    "its"."applies_to" AS "category",
    NULL::numeric AS "price_suggestion",
    NULL::numeric AS "labor_hours_suggestion",
    "its"."confidence",
    NULL::"text" AS "reason",
    "its"."created_at"
   FROM "public"."inspection_template_suggestions" "its"
UNION ALL
 SELECT 'staff_invite'::"text" AS "suggestion_type",
    "sis"."id",
    "sis"."shop_id",
    "sis"."intake_id",
    COALESCE("sis"."full_name", "sis"."email", "sis"."role", 'Staff'::"text") AS "name",
    "sis"."role" AS "category",
    NULL::numeric AS "price_suggestion",
    NULL::numeric AS "labor_hours_suggestion",
    (0)::numeric AS "confidence",
    COALESCE("sis"."notes", ''::"text") AS "reason",
    "sis"."created_at"
   FROM "public"."staff_invite_suggestions" "sis";


ALTER TABLE "public"."v_shop_boost_suggestions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_shop_health_latest" WITH ("security_barrier"='true') AS
 SELECT DISTINCT ON ("shop_health_snapshots"."shop_id") "shop_health_snapshots"."id" AS "snapshot_id",
    "shop_health_snapshots"."shop_id",
    "shop_health_snapshots"."intake_id",
    "shop_health_snapshots"."period_start",
    "shop_health_snapshots"."period_end",
    "shop_health_snapshots"."metrics",
    "shop_health_snapshots"."scores",
    "shop_health_snapshots"."narrative_summary",
    "shop_health_snapshots"."created_at" AS "snapshot_created_at"
   FROM "public"."shop_health_snapshots"
  ORDER BY "shop_health_snapshots"."shop_id", "shop_health_snapshots"."created_at" DESC;


ALTER TABLE "public"."v_shop_health_latest" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_staff_invites_common" AS
 SELECT 'candidate'::"text" AS "source_type",
    "c"."id",
    "c"."shop_id",
    "c"."intake_id",
    COALESCE("c"."full_name", "c"."email", "c"."username", ("c"."role")::"text", 'Staff'::"text") AS "name",
    "c"."full_name",
    "c"."email",
    "c"."phone",
    "c"."username",
    ("c"."role")::"text" AS "role",
    "c"."notes",
    "c"."status",
    "c"."confidence",
    "c"."created_at"
   FROM "public"."staff_invite_candidates" "c"
UNION ALL
 SELECT 'suggestion'::"text" AS "source_type",
    "s"."id",
    "s"."shop_id",
    "s"."intake_id",
    COALESCE("s"."full_name", "s"."email", "s"."role", 'Staff'::"text") AS "name",
    "s"."full_name",
    "s"."email",
    NULL::"text" AS "phone",
    NULL::"text" AS "username",
    "s"."role",
    "s"."notes",
    NULL::"text" AS "status",
    NULL::numeric AS "confidence",
    "s"."created_at"
   FROM "public"."staff_invite_suggestions" "s"
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."staff_invite_candidates" "c"
          WHERE (("c"."shop_id" = "s"."shop_id") AND ("c"."intake_id" = "s"."intake_id")))));


ALTER TABLE "public"."v_staff_invites_common" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "source_asset_id" "uuid",
    "title" "text" NOT NULL,
    "slug" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "content_type" "text" NOT NULL,
    "hook" "text",
    "caption" "text",
    "cta" "text",
    "script_text" "text",
    "voiceover_text" "text",
    "platform_targets" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "published_at" timestamp with time zone,
    "thumbnail_url" "text",
    "render_url" "text",
    "duration_seconds" numeric(10,2),
    "generation_notes" "text",
    "ai_score" numeric(6,2),
    "human_rating" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "videos_content_type_check" CHECK (("content_type" = ANY (ARRAY['workflow_demo'::"text", 'repair_story'::"text", 'inspection_highlight'::"text", 'before_after'::"text", 'educational_tip'::"text", 'how_to'::"text", 'findings_on_vehicle'::"text"]))),
    CONSTRAINT "videos_human_rating_check" CHECK ((("human_rating" >= 1) AND ("human_rating" <= 5))),
    CONSTRAINT "videos_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'processing'::"text", 'ready'::"text", 'published'::"text", 'failed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."videos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_top_content_types_by_shop" AS
 SELECT "v"."shop_id",
    "v"."content_type",
    "avg"(COALESCE("v"."ai_score", (0)::numeric)) AS "avg_engagement_score",
    "count"(*) AS "posts_generated",
    COALESCE("sum"("vm"."views"), (0)::bigint) AS "total_views",
    COALESCE("sum"("vm"."leads"), (0)::bigint) AS "total_leads"
   FROM ("public"."videos" "v"
     LEFT JOIN "public"."video_metrics" "vm" ON (("vm"."video_id" = "v"."id")))
  GROUP BY "v"."shop_id", "v"."content_type";


ALTER TABLE "public"."v_top_content_types_by_shop" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_vehicle_service_history" AS
 SELECT "wol"."id" AS "work_order_line_id",
    "wol"."work_order_id",
    "wol"."vehicle_id",
    "v"."year",
    "v"."make",
    "v"."model",
    "wol"."menu_item_id",
    "mi"."name" AS "menu_name",
    "wol"."description",
    "wol"."status",
    "wol"."created_at"
   FROM (("public"."work_order_lines" "wol"
     LEFT JOIN "public"."menu_items" "mi" ON (("mi"."id" = "wol"."menu_item_id")))
     LEFT JOIN "public"."vehicles" "v" ON (("v"."id" = "wol"."vehicle_id")));


ALTER TABLE "public"."v_vehicle_service_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_platform_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "external_post_id" "text",
    "external_url" "text",
    "post_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "published_at" timestamp with time zone,
    "caption_override" "text",
    "hashtag_set" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_platform_posts_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'tiktok'::"text", 'youtube'::"text", 'linkedin'::"text", 'x'::"text", 'other'::"text"]))),
    CONSTRAINT "video_platform_posts_post_status_check" CHECK (("post_status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'published'::"text", 'failed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."video_platform_posts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_video_performance_summary" AS
 SELECT "v"."id" AS "video_id",
    "v"."shop_id",
    "v"."content_type",
    "v"."title",
    "v"."status",
    "count"(DISTINCT "vpp"."id") AS "platform_posts_count",
    COALESCE("sum"("vm"."impressions"), (0)::bigint) AS "impressions",
    COALESCE("sum"("vm"."views"), (0)::bigint) AS "views",
    COALESCE("sum"("vm"."likes"), (0)::bigint) AS "likes",
    COALESCE("sum"("vm"."comments"), (0)::bigint) AS "comments",
    COALESCE("sum"("vm"."shares"), (0)::bigint) AS "shares",
    COALESCE("sum"("vm"."saves"), (0)::bigint) AS "saves",
    COALESCE("sum"("vm"."clicks"), (0)::bigint) AS "clicks",
    COALESCE("sum"("vm"."leads"), (0)::bigint) AS "leads",
    COALESCE("sum"("vm"."bookings"), (0)::bigint) AS "bookings",
    COALESCE("sum"("vm"."revenue"), (0)::numeric) AS "revenue",
        CASE
            WHEN (COALESCE("sum"("vm"."views"), (0)::bigint) = 0) THEN (0)::numeric
            ELSE "round"((((((((((COALESCE("sum"("vm"."likes"), (0)::bigint))::numeric * 1.0) + ((COALESCE("sum"("vm"."comments"), (0)::bigint))::numeric * 2.0)) + ((COALESCE("sum"("vm"."shares"), (0)::bigint))::numeric * 3.0)) + ((COALESCE("sum"("vm"."saves"), (0)::bigint))::numeric * 2.0)) + ((COALESCE("sum"("vm"."clicks"), (0)::bigint))::numeric * 4.0)) + ((COALESCE("sum"("vm"."leads"), (0)::bigint))::numeric * 8.0)) + ((COALESCE("sum"("vm"."bookings"), (0)::bigint))::numeric * 10.0)) / (GREATEST("sum"("vm"."views"), (1)::bigint))::numeric), 4)
        END AS "engagement_score"
   FROM (("public"."videos" "v"
     LEFT JOIN "public"."video_platform_posts" "vpp" ON (("vpp"."video_id" = "v"."id")))
     LEFT JOIN "public"."video_metrics" "vm" ON (("vm"."video_id" = "v"."id")))
  GROUP BY "v"."id", "v"."shop_id", "v"."content_type", "v"."title", "v"."status";


ALTER TABLE "public"."v_video_performance_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_line_technicians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "technician_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid"
);


ALTER TABLE "public"."work_order_line_technicians" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_order_board_cards_shop" WITH ("security_invoker"='true') AS
 WITH "line_rollup" AS (
         SELECT "wol"."work_order_id",
            "count"(*) FILTER (WHERE ("wol"."voided_at" IS NULL)) AS "jobs_total",
            "count"(*) FILTER (WHERE (("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") = 'completed'::"text"))) AS "jobs_completed",
            "count"(*) FILTER (WHERE (("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") <> 'completed'::"text"))) AS "jobs_open",
            "count"(*) FILTER (WHERE (("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") = ANY (ARRAY['on_hold'::"text", 'awaiting_approval'::"text"])))) AS "jobs_blocked",
            "bool_or"((("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") = 'on_hold'::"text"))) AS "any_on_hold",
            "bool_or"((("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") = 'awaiting_approval'::"text"))) AS "any_awaiting_approval",
            "bool_or"((("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") = 'in_progress'::"text"))) AS "any_in_progress",
            "bool_or"((("wol"."voided_at" IS NULL) AND (COALESCE("wol"."status", ''::"text") = ANY (ARRAY['awaiting'::"text", 'queued'::"text"])))) AS "any_awaiting_or_queued"
           FROM "public"."work_order_lines" "wol"
          GROUP BY "wol"."work_order_id"
        ), "parts_rollup" AS (
         SELECT "wol"."work_order_id",
            "count"(*) FILTER (WHERE ((COALESCE(("pri"."status")::"text", ''::"text") = 'requested'::"text") OR (COALESCE("pri"."qty_received", (0)::numeric) < COALESCE("pri"."qty_approved", (0)::numeric)))) AS "parts_blocker_count",
            "bool_or"(((COALESCE(("pri"."status")::"text", ''::"text") = 'requested'::"text") OR (COALESCE("pri"."qty_received", (0)::numeric) < COALESCE("pri"."qty_approved", (0)::numeric)))) AS "has_waiting_parts"
           FROM ("public"."part_request_items" "pri"
             JOIN "public"."work_order_lines" "wol" ON (("wol"."id" = "pri"."work_order_line_id")))
          WHERE ("wol"."voided_at" IS NULL)
          GROUP BY "wol"."work_order_id"
        ), "tech_rollup" AS (
         SELECT "wol"."work_order_id",
            "count"(DISTINCT "wolt"."technician_id") AS "assigned_tech_count",
            "min"(NULLIF("p"."full_name", ''::"text")) AS "first_tech_name",
            "array_remove"("array_agg"(DISTINCT NULLIF("p"."full_name", ''::"text")), NULL::"text") AS "tech_names"
           FROM (("public"."work_order_line_technicians" "wolt"
             JOIN "public"."work_order_lines" "wol" ON (("wol"."id" = "wolt"."work_order_line_id")))
             LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "wolt"."technician_id")))
          WHERE ("wol"."voided_at" IS NULL)
          GROUP BY "wol"."work_order_id"
        )
 SELECT "w"."id" AS "work_order_id",
    "w"."custom_id",
    "w"."shop_id",
    "w"."customer_id",
    "w"."vehicle_id",
    COALESCE(NULLIF("c"."business_name", ''::"text"), NULLIF("c"."name", ''::"text"), NULLIF(TRIM(BOTH FROM ((COALESCE("c"."first_name", ''::"text") || ' '::"text") || COALESCE("c"."last_name", ''::"text"))), ''::"text"), 'Customer'::"text") AS "display_name",
    NULLIF("v"."unit_number", ''::"text") AS "unit_label",
    NULLIF(TRIM(BOTH FROM "concat_ws"(' '::"text", ("v"."year")::"text", "v"."make", "v"."model")), ''::"text") AS "vehicle_label",
    (COALESCE("lr"."jobs_total", (0)::bigint))::integer AS "jobs_total",
    (COALESCE("lr"."jobs_completed", (0)::bigint))::integer AS "jobs_completed",
    (
        CASE
            WHEN (COALESCE("lr"."jobs_total", (0)::bigint) = 0) THEN (0)::numeric
            ELSE "round"((((COALESCE("lr"."jobs_completed", (0)::bigint))::numeric / (NULLIF("lr"."jobs_total", 0))::numeric) * (100)::numeric))
        END)::integer AS "progress_pct",
    (COALESCE("pr"."parts_blocker_count", (0)::bigint))::integer AS "parts_blocker_count",
    COALESCE("pr"."has_waiting_parts", false) AS "has_waiting_parts",
    (COALESCE("tr"."assigned_tech_count", (0)::bigint))::integer AS "assigned_tech_count",
        CASE
            WHEN (COALESCE("tr"."assigned_tech_count", (0)::bigint) = 0) THEN 'Unassigned'::"text"
            WHEN (COALESCE("tr"."assigned_tech_count", (0)::bigint) = 1) THEN COALESCE("tr"."first_tech_name", 'Assigned'::"text")
            ELSE ((COALESCE("tr"."first_tech_name", 'Assigned'::"text") || ' +'::"text") || (("tr"."assigned_tech_count" - 1))::"text")
        END AS "assigned_summary",
        CASE
            WHEN ((COALESCE("lr"."jobs_total", (0)::bigint) > 0) AND (COALESCE("lr"."jobs_completed", (0)::bigint) = COALESCE("lr"."jobs_total", (0)::bigint))) THEN 'completed'::"text"
            WHEN COALESCE("lr"."any_on_hold", false) THEN 'on_hold'::"text"
            WHEN COALESCE("pr"."has_waiting_parts", false) THEN 'waiting_parts'::"text"
            WHEN (COALESCE("lr"."any_awaiting_approval", false) OR (COALESCE("w"."approval_state", ''::"text") = ANY (ARRAY['awaiting_approval'::"text", 'pending'::"text", 'sent'::"text"]))) THEN 'awaiting_approval'::"text"
            WHEN COALESCE("lr"."any_in_progress", false) THEN 'in_progress'::"text"
            WHEN COALESCE("lr"."any_awaiting_or_queued", false) THEN 'awaiting'::"text"
            WHEN (COALESCE("lr"."jobs_total", (0)::bigint) = 0) THEN 'empty'::"text"
            ELSE 'awaiting'::"text"
        END AS "overall_stage",
        CASE
            WHEN (COALESCE("pr"."has_waiting_parts", false) AND (COALESCE("w"."updated_at", "w"."created_at") < ("now"() - '48:00:00'::interval))) THEN 'danger'::"text"
            WHEN ((COALESCE("lr"."any_on_hold", false) OR COALESCE("pr"."has_waiting_parts", false) OR COALESCE("lr"."any_awaiting_approval", false)) AND (COALESCE("w"."updated_at", "w"."created_at") < ("now"() - '24:00:00'::interval))) THEN 'warn'::"text"
            ELSE 'none'::"text"
        END AS "risk_level",
        CASE
            WHEN (COALESCE("pr"."has_waiting_parts", false) AND (COALESCE("w"."updated_at", "w"."created_at") < ("now"() - '48:00:00'::interval))) THEN 'Waiting on parts too long'::"text"
            WHEN (COALESCE("lr"."any_on_hold", false) AND (COALESCE("w"."updated_at", "w"."created_at") < ("now"() - '24:00:00'::interval))) THEN 'On hold too long'::"text"
            WHEN (COALESCE("lr"."any_awaiting_approval", false) AND (COALESCE("w"."updated_at", "w"."created_at") < ("now"() - '24:00:00'::interval))) THEN 'Approval pending too long'::"text"
            ELSE NULL::"text"
        END AS "risk_reason",
    (GREATEST((0)::numeric, EXTRACT(epoch FROM ("now"() - COALESCE("w"."updated_at", "w"."created_at")))))::bigint AS "time_in_stage_seconds",
    COALESCE("w"."updated_at", "w"."created_at") AS "activity_at",
    NULL::"text" AS "portal_stage_label",
    NULL::"text" AS "portal_status_note",
    NULL::"text" AS "fleet_stage_label",
    "w"."priority",
    COALESCE("w"."is_waiter", false) AS "is_waiter",
    "w"."advisor_id",
    NULLIF("ap"."full_name", ''::"text") AS "advisor_name",
    "tr"."first_tech_name",
    "tr"."tech_names",
    (COALESCE("lr"."jobs_open", (0)::bigint))::integer AS "jobs_open",
    (COALESCE("lr"."jobs_blocked", (0)::bigint))::integer AS "jobs_blocked",
        CASE
            WHEN COALESCE("pr"."has_waiting_parts", false) THEN (COALESCE("pr"."parts_blocker_count", (0)::bigint))::integer
            ELSE 0
        END AS "jobs_waiting_parts"
   FROM (((((("public"."work_orders" "w"
     LEFT JOIN "line_rollup" "lr" ON (("lr"."work_order_id" = "w"."id")))
     LEFT JOIN "parts_rollup" "pr" ON (("pr"."work_order_id" = "w"."id")))
     LEFT JOIN "tech_rollup" "tr" ON (("tr"."work_order_id" = "w"."id")))
     LEFT JOIN "public"."customers" "c" ON (("c"."id" = "w"."customer_id")))
     LEFT JOIN "public"."vehicles" "v" ON (("v"."id" = "w"."vehicle_id")))
     LEFT JOIN "public"."profiles" "ap" ON (("ap"."id" = "w"."advisor_id")));


ALTER TABLE "public"."v_work_order_board_cards_shop" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_order_board_cards_fleet" WITH ("security_invoker"='true') AS
 SELECT "s"."work_order_id",
    "s"."custom_id",
    "s"."shop_id",
    "s"."customer_id",
    "s"."vehicle_id",
    "fv"."fleet_id",
    "f"."name" AS "fleet_name",
    "s"."display_name",
    "s"."unit_label",
    "s"."vehicle_label",
    "s"."jobs_total",
    "s"."jobs_completed",
    "s"."progress_pct",
    "s"."parts_blocker_count",
    "s"."has_waiting_parts",
    "s"."assigned_tech_count",
    "s"."assigned_summary",
    "s"."overall_stage",
    "s"."risk_level",
    "s"."risk_reason",
    "s"."time_in_stage_seconds",
    "s"."activity_at",
    "s"."portal_stage_label",
    "s"."portal_status_note",
        CASE
            WHEN ("s"."overall_stage" = 'completed'::"text") THEN 'Completed'::"text"
            WHEN ("s"."overall_stage" = 'waiting_parts'::"text") THEN 'Waiting parts'::"text"
            WHEN ("s"."overall_stage" = 'awaiting_approval'::"text") THEN 'Awaiting approval'::"text"
            WHEN ("s"."overall_stage" = 'in_progress'::"text") THEN 'In progress'::"text"
            WHEN ("s"."overall_stage" = 'on_hold'::"text") THEN 'On hold'::"text"
            WHEN ("s"."overall_stage" = 'empty'::"text") THEN 'Empty'::"text"
            ELSE 'Awaiting'::"text"
        END AS "fleet_stage_label",
    "s"."priority",
    "s"."is_waiter",
    "s"."advisor_id",
    "s"."advisor_name",
    "s"."first_tech_name",
    "s"."tech_names",
    "s"."jobs_open",
    "s"."jobs_blocked",
    "s"."jobs_waiting_parts"
   FROM (("public"."v_work_order_board_cards_shop" "s"
     LEFT JOIN "public"."fleet_vehicles" "fv" ON (("fv"."vehicle_id" = "s"."vehicle_id")))
     LEFT JOIN "public"."fleets" "f" ON (("f"."id" = "fv"."fleet_id")));


ALTER TABLE "public"."v_work_order_board_cards_fleet" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_order_board_cards_portal" WITH ("security_invoker"='true') AS
 SELECT "s"."work_order_id",
    "s"."custom_id",
    "s"."shop_id",
    "s"."customer_id",
    "s"."vehicle_id",
    NULL::"uuid" AS "fleet_id",
    NULL::"text" AS "fleet_name",
    "s"."display_name",
    "s"."unit_label",
    "s"."vehicle_label",
    "s"."jobs_total",
    "s"."jobs_completed",
    "s"."progress_pct",
    "s"."parts_blocker_count",
    "s"."has_waiting_parts",
    "s"."assigned_tech_count",
    NULL::"text" AS "assigned_summary",
    "s"."overall_stage",
    "s"."risk_level",
    "s"."risk_reason",
    "s"."time_in_stage_seconds",
    "s"."activity_at",
        CASE
            WHEN ("s"."overall_stage" = 'completed'::"text") THEN 'Completed'::"text"
            WHEN ("s"."overall_stage" = 'waiting_parts'::"text") THEN 'Waiting on parts'::"text"
            WHEN ("s"."overall_stage" = 'awaiting_approval'::"text") THEN 'Awaiting approval'::"text"
            WHEN ("s"."overall_stage" = 'in_progress'::"text") THEN 'In progress'::"text"
            WHEN ("s"."overall_stage" = 'on_hold'::"text") THEN 'On hold'::"text"
            WHEN ("s"."overall_stage" = 'empty'::"text") THEN 'Not started'::"text"
            ELSE 'Awaiting service'::"text"
        END AS "portal_stage_label",
        CASE
            WHEN ("s"."overall_stage" = 'completed'::"text") THEN 'Your work order is complete.'::"text"
            WHEN ("s"."overall_stage" = 'waiting_parts'::"text") THEN 'We are waiting on parts for your repair.'::"text"
            WHEN ("s"."overall_stage" = 'awaiting_approval'::"text") THEN 'We are waiting for approval before continuing.'::"text"
            WHEN ("s"."overall_stage" = 'in_progress'::"text") THEN 'Your vehicle is currently being worked on.'::"text"
            WHEN ("s"."overall_stage" = 'on_hold'::"text") THEN 'Your work order is temporarily on hold.'::"text"
            WHEN ("s"."overall_stage" = 'empty'::"text") THEN 'Your work order has been created.'::"text"
            ELSE 'Your work order is in queue.'::"text"
        END AS "portal_status_note",
    NULL::"text" AS "fleet_stage_label",
    "s"."priority",
    "s"."is_waiter",
    "s"."advisor_id",
    NULL::"text" AS "advisor_name",
    "s"."first_tech_name",
    NULL::"text"[] AS "tech_names",
    "s"."jobs_open",
    "s"."jobs_blocked",
    "s"."jobs_waiting_parts"
   FROM "public"."v_work_order_board_cards_shop" "s";


ALTER TABLE "public"."v_work_order_board_cards_portal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "url" "text",
    "filename" "text",
    "shop_id" "uuid",
    CONSTRAINT "vehicle_media_type_check" CHECK (("type" = ANY (ARRAY['photo'::"text", 'document'::"text"])))
);


ALTER TABLE "public"."vehicle_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year_from" integer NOT NULL,
    "year_to" integer NOT NULL,
    "engine_family" "text",
    "service_code" "text" NOT NULL,
    "default_labor_hours" numeric,
    "default_parts" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicle_menus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "uploaded_by" "uuid",
    "url" "text" NOT NULL,
    "caption" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shop_id" "uuid"
);


ALTER TABLE "public"."vehicle_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_recalls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "shop_id" "uuid",
    "nhtsa_campaign" "text",
    "component" "text",
    "summary" "text",
    "consequence" "text",
    "remedy" "text",
    "report_received_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vin" "text" NOT NULL,
    "campaign_number" "text" NOT NULL,
    "report_date" "text",
    "notes" "text",
    "manufacturer" "text",
    "make" "text",
    "model" "text",
    "model_year" "text",
    "user_id" "uuid"
);


ALTER TABLE "public"."vehicle_recalls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "year" integer,
    "make" "text",
    "model" "text",
    "trim" "text",
    "engine" "text",
    "drivetrain" "text",
    "transmission" "text",
    "fuel_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicle_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_part_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "part_id" "uuid" NOT NULL,
    "vendor_sku" "text" NOT NULL
);


ALTER TABLE "public"."vendor_part_numbers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid",
    "platform" "text",
    "platform_video_id" "text",
    "status" "text",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vin_decodes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "vin" "text" NOT NULL,
    "decoded_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "year" "text",
    "make" "text",
    "model" "text",
    "trim" "text",
    "engine" "text",
    CONSTRAINT "vin_decodes_vin_len_chk" CHECK (("length"("vin") = 17))
);


ALTER TABLE "public"."vin_decodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."viral_hook_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "video_id" "uuid",
    "content_type" "text",
    "hook_text" "text" NOT NULL,
    "score_predicted" numeric,
    "selected" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."viral_hook_tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warranties" (
    "id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "work_order_id" "uuid",
    "work_order_line_id" "uuid",
    "customer_id" "uuid",
    "vehicle_id" "uuid",
    "installed_at" timestamp with time zone NOT NULL,
    "warranty_months" integer DEFAULT 12 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warranties_warranty_months_check" CHECK (("warranty_months" > 0))
);


ALTER TABLE "public"."warranties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warranty_claims" (
    "id" "uuid" NOT NULL,
    "warranty_id" "uuid" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" NOT NULL,
    "supplier_rma" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warranty_claims_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'approved'::"text", 'denied'::"text", 'replaced'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."warranty_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."widget_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "widget_slug" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."widget_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."widgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "allowed_sizes" "text"[] DEFAULT ARRAY['1x1'::"text", '2x1'::"text", '2x2'::"text"] NOT NULL,
    "default_size" "text" DEFAULT '2x1'::"text" NOT NULL,
    "default_route" "text" NOT NULL
);


ALTER TABLE "public"."widgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone DEFAULT "now"(),
    "method" "text"
);


ALTER TABLE "public"."work_order_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_invoice_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "ok" boolean DEFAULT false NOT NULL,
    "issues" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."work_order_invoice_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_line_ai" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "intake_id" "uuid",
    "work_order_id" "uuid",
    "work_order_line_id" "uuid",
    "primary_category" "text",
    "secondary_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "job_scope" "text",
    "confidence" numeric DEFAULT 0 NOT NULL,
    "signals" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."work_order_line_ai" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_line_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason" "text" DEFAULT 'wo_completed'::"text" NOT NULL,
    "line_id" "uuid",
    "status" "text"
);


ALTER TABLE "public"."work_order_line_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_media" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "kind" "text" DEFAULT 'photo'::"text",
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."work_order_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_quote_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "suggested_by" "uuid",
    "description" "text" NOT NULL,
    "job_type" "text" DEFAULT 'tech-suggested'::"text" NOT NULL,
    "est_labor_hours" numeric,
    "notes" "text",
    "status" "text" DEFAULT 'pending_parts'::"text" NOT NULL,
    "ai_complaint" "text",
    "ai_cause" "text",
    "ai_correction" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "work_order_line_id" "uuid",
    "qty" numeric DEFAULT 1,
    "labor_hours" numeric,
    "parts_total" numeric,
    "labor_total" numeric,
    "subtotal" numeric,
    "tax_total" numeric,
    "grand_total" numeric,
    "metadata" "jsonb",
    "stage" "text",
    "group_id" "uuid",
    "sent_to_customer_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    CONSTRAINT "work_order_quote_lines_stage_check" CHECK ((("stage" IS NULL) OR ("stage" = ANY (ARRAY['advisor_pending'::"text", 'customer_pending'::"text", 'customer_approved'::"text", 'customer_declined'::"text"]))))
);


ALTER TABLE "public"."work_order_quote_lines" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_job_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_job_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."agent_actions"
    ADD CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_attachments"
    ADD CONSTRAINT "agent_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_job_events"
    ADD CONSTRAINT "agent_job_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_jobs"
    ADD CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_knowledge"
    ADD CONSTRAINT "agent_knowledge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_knowledge"
    ADD CONSTRAINT "agent_knowledge_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_requests"
    ADD CONSTRAINT "agent_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_events"
    ADD CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generation_runs"
    ADD CONSTRAINT "ai_generation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_training_data"
    ADD CONSTRAINT "ai_training_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_training_events"
    ADD CONSTRAINT "ai_training_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_analytics_events"
    ADD CONSTRAINT "content_analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_assets"
    ADD CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_calendar_items"
    ADD CONSTRAINT "content_calendar_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_calendars"
    ADD CONSTRAINT "content_calendars_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_pieces"
    ADD CONSTRAINT "content_pieces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_platform_accounts"
    ADD CONSTRAINT "content_platform_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_templates"
    ADD CONSTRAINT "content_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_templates"
    ADD CONSTRAINT "content_templates_shop_id_key_key" UNIQUE ("shop_id", "key");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_bookings"
    ADD CONSTRAINT "customer_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_portal_invites"
    ADD CONSTRAINT "customer_portal_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_quotes"
    ADD CONSTRAINT "customer_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_settings"
    ADD CONSTRAINT "customer_settings_pkey" PRIMARY KEY ("customer_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_user_id_uq" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."cvip_specs"
    ADD CONSTRAINT "cvip_specs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cvip_specs"
    ADD CONSTRAINT "cvip_specs_spec_code_key" UNIQUE ("spec_code");



ALTER TABLE ONLY "public"."cvip_thresholds_master"
    ADD CONSTRAINT "cvip_thresholds_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cvip_thresholds"
    ADD CONSTRAINT "cvip_thresholds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decoded_vins"
    ADD CONSTRAINT "decoded_vins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defective_parts"
    ADD CONSTRAINT "defective_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_shop_boost_leads"
    ADD CONSTRAINT "demo_shop_boost_leads_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."demo_shop_boost_leads"
    ADD CONSTRAINT "demo_shop_boost_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_shop_boosts"
    ADD CONSTRAINT "demo_shop_boosts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dtc_logs"
    ADD CONSTRAINT "dtc_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_logs"
    ADD CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_suppressions"
    ADD CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_reads"
    ADD CONSTRAINT "feature_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_reads"
    ADD CONSTRAINT "feature_reads_user_id_feature_slug_key" UNIQUE ("user_id", "feature_slug");



ALTER TABLE ONLY "public"."fleet_dispatch_assignments"
    ADD CONSTRAINT "fleet_dispatch_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_form_uploads"
    ADD CONSTRAINT "fleet_form_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_inspection_schedules"
    ADD CONSTRAINT "fleet_inspection_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_inspection_schedules"
    ADD CONSTRAINT "fleet_inspection_schedules_vehicle_unique" UNIQUE ("vehicle_id");



ALTER TABLE ONLY "public"."fleet_members"
    ADD CONSTRAINT "fleet_members_pkey" PRIMARY KEY ("fleet_id", "user_id");



ALTER TABLE ONLY "public"."fleet_pretrip_reports"
    ADD CONSTRAINT "fleet_pretrip_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_program_tasks"
    ADD CONSTRAINT "fleet_program_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_programs"
    ADD CONSTRAINT "fleet_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_vehicles"
    ADD CONSTRAINT "fleet_vehicles_pkey" PRIMARY KEY ("fleet_id", "vehicle_id");



ALTER TABLE ONLY "public"."fleets"
    ADD CONSTRAINT "fleets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."followups"
    ADD CONSTRAINT "followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history"
    ADD CONSTRAINT "history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_photos"
    ADD CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_results"
    ADD CONSTRAINT "inspection_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_session_payloads"
    ADD CONSTRAINT "inspection_session_payloads_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_work_order_line_unique" UNIQUE ("work_order_line_id");



ALTER TABLE ONLY "public"."inspection_signatures"
    ADD CONSTRAINT "inspection_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_template_suggestions"
    ADD CONSTRAINT "inspection_template_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_templates"
    ADD CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_logs"
    ADD CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_documents"
    ADD CONSTRAINT "invoice_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_work_order_id_key" UNIQUE ("work_order_id");



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_feedback"
    ADD CONSTRAINT "learning_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_rules"
    ADD CONSTRAINT "maintenance_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_services"
    ADD CONSTRAINT "maintenance_services_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."maintenance_suggestions"
    ADD CONSTRAINT "maintenance_suggestions_pkey" PRIMARY KEY ("work_order_id");



ALTER TABLE ONLY "public"."media_uploads"
    ADD CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_item_suggestions"
    ADD CONSTRAINT "menu_item_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_pricing"
    ADD CONSTRAINT "menu_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_conversation_id_key" UNIQUE ("user_id", "conversation_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_pkey" PRIMARY KEY ("org_id", "user_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_barcodes"
    ADD CONSTRAINT "part_barcodes_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."part_barcodes"
    ADD CONSTRAINT "part_barcodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_compatibility"
    ADD CONSTRAINT "part_compatibility_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_allocation_id_key" UNIQUE ("allocation_id");



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_purchases"
    ADD CONSTRAINT "part_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_request_lines"
    ADD CONSTRAINT "part_request_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_request_lines"
    ADD CONSTRAINT "part_request_lines_request_id_work_order_line_id_key" UNIQUE ("request_id", "work_order_line_id");



ALTER TABLE ONLY "public"."part_requests"
    ADD CONSTRAINT "part_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_returns"
    ADD CONSTRAINT "part_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_part_id_location_id_key" UNIQUE ("part_id", "location_id");



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_part_location_uniq" UNIQUE ("part_id", "location_id");



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_suppliers"
    ADD CONSTRAINT "part_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_warranties"
    ADD CONSTRAINT "part_warranties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_barcodes"
    ADD CONSTRAINT "parts_barcodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_barcodes"
    ADD CONSTRAINT "parts_barcodes_shop_id_barcode_key" UNIQUE ("shop_id", "barcode");



ALTER TABLE ONLY "public"."parts_messages"
    ADD CONSTRAINT "parts_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts"
    ADD CONSTRAINT "parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_quote_requests"
    ADD CONSTRAINT "parts_quote_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_quotes"
    ADD CONSTRAINT "parts_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_request_messages"
    ADD CONSTRAINT "parts_request_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_requests"
    ADD CONSTRAINT "parts_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_suppliers"
    ADD CONSTRAINT "parts_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_unique_payment_intent" UNIQUE ("stripe_payment_intent_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_unique_session" UNIQUE ("stripe_checkout_session_id");



ALTER TABLE ONLY "public"."payroll_deductions"
    ADD CONSTRAINT "payroll_deductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_export_log"
    ADD CONSTRAINT "payroll_export_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_pay_periods"
    ADD CONSTRAINT "payroll_pay_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_providers"
    ADD CONSTRAINT "payroll_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_timecards"
    ADD CONSTRAINT "payroll_timecards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_events"
    ADD CONSTRAINT "planner_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_runs"
    ADD CONSTRAINT "planner_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_notifications"
    ADD CONSTRAINT "portal_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_unique" UNIQUE ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."punch_events"
    ADD CONSTRAINT "punch_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_lines"
    ADD CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_plans"
    ADD CONSTRAINT "reel_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_render_jobs"
    ADD CONSTRAINT "reel_render_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_menu_items"
    ADD CONSTRAINT "saved_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_ai_profiles"
    ADD CONSTRAINT "shop_ai_profiles_pkey" PRIMARY KEY ("shop_id");



ALTER TABLE ONLY "public"."shop_boost_intakes"
    ADD CONSTRAINT "shop_boost_intakes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_content_signals"
    ADD CONSTRAINT "shop_content_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_content_signals"
    ADD CONSTRAINT "shop_content_signals_shop_id_content_type_key" UNIQUE ("shop_id", "content_type");



ALTER TABLE ONLY "public"."shop_health_snapshots"
    ADD CONSTRAINT "shop_health_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_hours"
    ADD CONSTRAINT "shop_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_import_files"
    ADD CONSTRAINT "shop_import_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_import_rows"
    ADD CONSTRAINT "shop_import_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_marketing_memory"
    ADD CONSTRAINT "shop_marketing_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_members"
    ADD CONSTRAINT "shop_members_pkey" PRIMARY KEY ("shop_id", "user_id");



ALTER TABLE ONLY "public"."shop_parts"
    ADD CONSTRAINT "shop_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_pkey" PRIMARY KEY ("shop_id");



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_shop_id_customer_id_key" UNIQUE ("shop_id", "customer_id");



ALTER TABLE ONLY "public"."shop_reel_settings"
    ADD CONSTRAINT "shop_reel_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_reel_settings"
    ADD CONSTRAINT "shop_reel_settings_shop_id_key" UNIQUE ("shop_id");



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_unique_reviewer" UNIQUE ("shop_id", "reviewer_user_id");



ALTER TABLE ONLY "public"."shop_schedules"
    ADD CONSTRAINT "shop_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_settings"
    ADD CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_tax_overrides"
    ADD CONSTRAINT "shop_tax_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_time_off"
    ADD CONSTRAINT "shop_time_off_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_time_slots"
    ADD CONSTRAINT "shop_time_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_users"
    ADD CONSTRAINT "shop_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_users"
    ADD CONSTRAINT "shop_users_shop_id_user_id_key" UNIQUE ("shop_id", "user_id");



ALTER TABLE ONLY "public"."shop_vehicle_menu_items"
    ADD CONSTRAINT "shop_vehicle_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_vehicle_menu_items"
    ADD CONSTRAINT "shop_vehicle_menu_items_shop_id_vehicle_menu_id_key" UNIQUE ("shop_id", "vehicle_menu_id");



ALTER TABLE ONLY "public"."shopreel_manual_asset_files"
    ADD CONSTRAINT "shopreel_manual_asset_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopreel_manual_assets"
    ADD CONSTRAINT "shopreel_manual_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopreel_publications"
    ADD CONSTRAINT "shopreel_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopreel_publish_jobs"
    ADD CONSTRAINT "shopreel_publish_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopreel_social_connections"
    ADD CONSTRAINT "shopreel_social_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invite_candidates"
    ADD CONSTRAINT "staff_invite_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invite_candidates"
    ADD CONSTRAINT "staff_invite_candidates_shop_email_lc_uq" UNIQUE ("shop_id", "email_lc");



ALTER TABLE ONLY "public"."staff_invite_candidates"
    ADD CONSTRAINT "staff_invite_candidates_shop_username_lc_uq" UNIQUE ("shop_id", "username_lc");



ALTER TABLE ONLY "public"."staff_invite_suggestions"
    ADD CONSTRAINT "staff_invite_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_locations"
    ADD CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_locations"
    ADD CONSTRAINT "stock_locations_shop_id_code_key" UNIQUE ("shop_id", "code");



ALTER TABLE ONLY "public"."stock_moves"
    ADD CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_catalog_items"
    ADD CONSTRAINT "supplier_catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_orders"
    ADD CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_calculation_log"
    ADD CONSTRAINT "tax_calculation_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_jurisdictions"
    ADD CONSTRAINT "tax_jurisdictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_providers"
    ADD CONSTRAINT "tax_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tech_shifts"
    ADD CONSTRAINT "tech_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_items"
    ADD CONSTRAINT "template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_logs"
    ADD CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_app_layouts"
    ADD CONSTRAINT "user_app_layouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_app_layouts"
    ADD CONSTRAINT "user_app_layouts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_plans"
    ADD CONSTRAINT "user_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_widget_layouts"
    ADD CONSTRAINT "user_widget_layouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_widget_layouts"
    ADD CONSTRAINT "user_widget_layouts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."vehicle_media"
    ADD CONSTRAINT "vehicle_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_menus"
    ADD CONSTRAINT "vehicle_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_photos"
    ADD CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_recalls"
    ADD CONSTRAINT "vehicle_recalls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_signatures"
    ADD CONSTRAINT "vehicle_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_shop_id_supplier_id_vendor_sku_key" UNIQUE ("shop_id", "supplier_id", "vendor_sku");



ALTER TABLE ONLY "public"."video_metrics"
    ADD CONSTRAINT "video_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_metrics"
    ADD CONSTRAINT "video_metrics_video_id_platform_metric_date_key" UNIQUE ("video_id", "platform", "metric_date");



ALTER TABLE ONLY "public"."video_platform_posts"
    ADD CONSTRAINT "video_platform_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_platform_posts"
    ADD CONSTRAINT "video_platform_posts_video_id_platform_key" UNIQUE ("video_id", "platform");



ALTER TABLE ONLY "public"."video_publications"
    ADD CONSTRAINT "video_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vin_decodes"
    ADD CONSTRAINT "vin_decodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."viral_hook_tests"
    ADD CONSTRAINT "viral_hook_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warranty_claims"
    ADD CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."widget_instances"
    ADD CONSTRAINT "widget_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."widgets"
    ADD CONSTRAINT "widgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."widgets"
    ADD CONSTRAINT "widgets_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."work_order_approvals"
    ADD CONSTRAINT "work_order_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_invoice_reviews"
    ADD CONSTRAINT "work_order_invoice_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_line_ai"
    ADD CONSTRAINT "work_order_line_ai_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_line_history"
    ADD CONSTRAINT "work_order_line_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_line_technicians"
    ADD CONSTRAINT "work_order_line_technicians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_line_technicians"
    ADD CONSTRAINT "work_order_line_technicians_work_order_line_id_technician_i_key" UNIQUE ("work_order_line_id", "technician_id");



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_media"
    ADD CONSTRAINT "work_order_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_quote_lines"
    ADD CONSTRAINT "work_order_quote_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_actions_pick_idx" ON "public"."agent_actions" USING "btree" ("status", "run_after", "risk", "created_at");



CREATE INDEX "agent_actions_request_idx" ON "public"."agent_actions" USING "btree" ("request_id", "created_at");



CREATE INDEX "agent_actions_status_idx" ON "public"."agent_actions" USING "btree" ("status", "run_after", "updated_at" DESC);



CREATE INDEX "agent_events_run_step" ON "public"."agent_events" USING "btree" ("run_id", "step");



CREATE INDEX "agent_job_events_job_idx" ON "public"."agent_job_events" USING "btree" ("job_id", "created_at");



CREATE INDEX "agent_jobs_kind_idx" ON "public"."agent_jobs" USING "btree" ("kind");



CREATE INDEX "agent_jobs_kind_pick_idx" ON "public"."agent_jobs" USING "btree" ("kind", "status", "run_after", "priority" DESC, "created_at") WHERE ("status" = 'queued'::"public"."agent_job_status");



CREATE INDEX "agent_jobs_locked_idx" ON "public"."agent_jobs" USING "btree" ("locked_by", "locked_at") WHERE ("status" = 'running'::"public"."agent_job_status");



CREATE INDEX "agent_jobs_pick_idx" ON "public"."agent_jobs" USING "btree" ("status", "run_after", "priority", "created_at");



CREATE INDEX "agent_jobs_request_idx" ON "public"."agent_jobs" USING "btree" ("request_id");



CREATE INDEX "agent_messages_claimed_idx" ON "public"."agent_messages" USING "btree" ("claimed_by", "claimed_at");



CREATE INDEX "agent_messages_pick_idx" ON "public"."agent_messages" USING "btree" ("direction", "processed_at", "run_after", "created_at");



CREATE INDEX "agent_messages_request_idx" ON "public"."agent_messages" USING "btree" ("request_id", "created_at");



CREATE INDEX "agent_requests_run_id_idx" ON "public"."agent_requests" USING "btree" ("run_id");



CREATE UNIQUE INDEX "agent_runs_idem" ON "public"."agent_runs" USING "btree" ("shop_id", "user_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "ai_events_entity_idx" ON "public"."ai_events" USING "btree" ("entity_table", "entity_id");



CREATE INDEX "ai_events_shop_id_idx" ON "public"."ai_events" USING "btree" ("shop_id");



CREATE INDEX "ai_events_shop_idx" ON "public"."ai_events" USING "btree" ("shop_id");



CREATE INDEX "ai_events_type_idx" ON "public"."ai_events" USING "btree" ("event_type");



CREATE INDEX "ai_training_embedding_hnsw_idx" ON "public"."ai_training_data" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "ai_training_embedding_idx" ON "public"."ai_training_data" USING "ivfflat" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "ai_training_shop_idx" ON "public"."ai_training_data" USING "btree" ("shop_id");



CREATE INDEX "bookings_customer_id_idx" ON "public"."bookings" USING "btree" ("customer_id");



CREATE INDEX "bookings_customer_idx" ON "public"."bookings" USING "btree" ("customer_id");



CREATE INDEX "bookings_shop_end_idx" ON "public"."bookings" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "bookings_shop_ends_idx" ON "public"."bookings" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "bookings_shop_id_idx" ON "public"."bookings" USING "btree" ("shop_id");



CREATE INDEX "bookings_shop_start_idx" ON "public"."bookings" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "bookings_shop_starts_idx" ON "public"."bookings" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "bookings_shop_time_overlap_idx" ON "public"."bookings" USING "btree" ("shop_id", "starts_at", "ends_at");



CREATE INDEX "conversation_participants_convo_user_idx" ON "public"."conversation_participants" USING "btree" ("conversation_id", "user_id");



CREATE INDEX "customer_portal_invites_customer_id_idx" ON "public"."customer_portal_invites" USING "btree" ("customer_id");



CREATE INDEX "customers_business_name_trgm" ON "public"."customers" USING "gin" ("business_name" "public"."gin_trgm_ops");



CREATE INDEX "customers_external_id_idx" ON "public"."customers" USING "btree" ("external_id");



CREATE UNIQUE INDEX "customers_shop_email_uq" ON "public"."customers" USING "btree" ("shop_id", "email");



CREATE INDEX "customers_shop_id_idx" ON "public"."customers" USING "btree" ("shop_id");



CREATE INDEX "customers_source_intake_id_idx" ON "public"."customers" USING "btree" ("source_intake_id");



CREATE INDEX "customers_source_row_id_idx" ON "public"."customers" USING "btree" ("source_row_id");



CREATE INDEX "customers_user_id_idx" ON "public"."customers" USING "btree" ("user_id");



CREATE UNIQUE INDEX "cvip_thresholds_master_spec_code_dir_idx" ON "public"."cvip_thresholds_master" USING "btree" ("spec_id", "code", "direction");



CREATE UNIQUE INDEX "cvip_thresholds_unique_idx" ON "public"."cvip_thresholds" USING "btree" ("spec_code", "measurement_type", COALESCE("axle_position", ''::"text"), COALESCE("location_code", ''::"text"), COALESCE("chamber_size", ''::"text"), COALESCE("extra_tag", ''::"text"));



CREATE INDEX "email_logs_email_idx" ON "public"."email_logs" USING "btree" ("email");



CREATE INDEX "email_logs_status_idx" ON "public"."email_logs" USING "btree" ("status");



CREATE INDEX "email_suppressions_email_idx" ON "public"."email_suppressions" USING "btree" ("email");



CREATE INDEX "expenses_shop_category_idx" ON "public"."expenses" USING "btree" ("shop_id", "category");



CREATE INDEX "expenses_shop_created_idx" ON "public"."expenses" USING "btree" ("shop_id", "created_at");



CREATE INDEX "expenses_shop_date_idx" ON "public"."expenses" USING "btree" ("shop_id", "expense_date");



CREATE INDEX "expenses_shop_expense_date_idx" ON "public"."expenses" USING "btree" ("shop_id", "expense_date");



CREATE INDEX "feature_reads_user_id_feature_slug_idx" ON "public"."feature_reads" USING "btree" ("user_id", "feature_slug");



CREATE UNIQUE INDEX "fitment_stats_pk" ON "public"."fitment_stats" USING "btree" ("shop_id", "vehicle_signature_id", "part_id");



CREATE INDEX "fleet_dispatch_assignments_driver_idx" ON "public"."fleet_dispatch_assignments" USING "btree" ("driver_profile_id");



CREATE INDEX "fleet_dispatch_assignments_shop_idx" ON "public"."fleet_dispatch_assignments" USING "btree" ("shop_id");



CREATE INDEX "fleet_dispatch_assignments_shop_state_idx" ON "public"."fleet_dispatch_assignments" USING "btree" ("shop_id", "state");



CREATE INDEX "fleet_dispatch_assignments_vehicle_idx" ON "public"."fleet_dispatch_assignments" USING "btree" ("vehicle_id");



CREATE INDEX "fleet_inspection_schedules_next_due_idx" ON "public"."fleet_inspection_schedules" USING "btree" ("next_inspection_date");



CREATE INDEX "fleet_inspection_schedules_shop_idx" ON "public"."fleet_inspection_schedules" USING "btree" ("shop_id");



CREATE INDEX "fleet_inspection_schedules_shop_vehicle_idx" ON "public"."fleet_inspection_schedules" USING "btree" ("shop_id", "vehicle_id");



CREATE INDEX "fleet_pretrip_reports_shop_date_idx" ON "public"."fleet_pretrip_reports" USING "btree" ("shop_id", "inspection_date" DESC);



CREATE INDEX "fleet_pretrip_reports_shop_vehicle_date_idx" ON "public"."fleet_pretrip_reports" USING "btree" ("shop_id", "vehicle_id", "inspection_date" DESC);



CREATE INDEX "fleet_service_requests_shop_status_idx" ON "public"."fleet_service_requests" USING "btree" ("shop_id", "status");



CREATE INDEX "fleet_service_requests_vehicle_idx" ON "public"."fleet_service_requests" USING "btree" ("vehicle_id");



CREATE INDEX "fleet_vehicles_shop_id_idx" ON "public"."fleet_vehicles" USING "btree" ("shop_id");



CREATE INDEX "idx_activity_logs__user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_admin_users__user_id" ON "public"."admin_users" USING "btree" ("user_id");



CREATE INDEX "idx_agent_actions_request_kind_status" ON "public"."agent_actions" USING "btree" ("request_id", "kind", "status");



CREATE INDEX "idx_agent_attachments_request" ON "public"."agent_attachments" USING "btree" ("agent_request_id");



CREATE INDEX "idx_agent_attachments_request_id" ON "public"."agent_attachments" USING "btree" ("agent_request_id");



CREATE INDEX "idx_agent_events_run" ON "public"."agent_events" USING "btree" ("run_id");



CREATE INDEX "idx_agent_events_run_id" ON "public"."agent_events" USING "btree" ("run_id");



CREATE INDEX "idx_agent_jobs_claim" ON "public"."agent_jobs" USING "btree" ("status", "run_after", "kind", "priority", "created_at");



CREATE INDEX "idx_agent_jobs_request_id" ON "public"."agent_jobs" USING "btree" ("request_id");



CREATE INDEX "idx_agent_jobs_status_kind" ON "public"."agent_jobs" USING "btree" ("status", "kind");



CREATE INDEX "idx_agent_knowledge__shop_id" ON "public"."agent_knowledge" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_knowledge_tags" ON "public"."agent_knowledge" USING "gin" ("tags");



CREATE INDEX "idx_agent_messages_request_created" ON "public"."agent_messages" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "idx_agent_requests__shop_id" ON "public"."agent_requests" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_requests_reporter_id" ON "public"."agent_requests" USING "btree" ("reporter_id");



CREATE INDEX "idx_agent_requests_shop_id" ON "public"."agent_requests" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_runs__shop_id" ON "public"."agent_runs" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_runs__user_id" ON "public"."agent_runs" USING "btree" ("user_id");



CREATE INDEX "idx_agent_runs_shop" ON "public"."agent_runs" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_runs_shop_id" ON "public"."agent_runs" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_runs_shop_user" ON "public"."agent_runs" USING "btree" ("shop_id", "user_id");



CREATE INDEX "idx_agent_runs_user" ON "public"."agent_runs" USING "btree" ("user_id");



CREATE INDEX "idx_agent_runs_user_id" ON "public"."agent_runs" USING "btree" ("user_id");



CREATE INDEX "idx_ai_events__shop_id" ON "public"."ai_events" USING "btree" ("shop_id");



CREATE INDEX "idx_ai_events__user_id" ON "public"."ai_events" USING "btree" ("user_id");



CREATE INDEX "idx_ai_events_shop_source_created" ON "public"."ai_events" USING "btree" ("shop_id", "training_source", "created_at" DESC);



CREATE INDEX "idx_ai_events_source_id" ON "public"."ai_events" USING "btree" ("source_id");



CREATE INDEX "idx_ai_generation_runs_shop_id" ON "public"."ai_generation_runs" USING "btree" ("shop_id");



CREATE INDEX "idx_ai_generation_runs_status" ON "public"."ai_generation_runs" USING "btree" ("status");



CREATE INDEX "idx_ai_generation_runs_video_id" ON "public"."ai_generation_runs" USING "btree" ("video_id");



CREATE INDEX "idx_ai_requests__user_id" ON "public"."ai_requests" USING "btree" ("user_id");



CREATE INDEX "idx_ai_training_data__shop_id" ON "public"."ai_training_data" USING "btree" ("shop_id");



CREATE INDEX "idx_ai_training_data_shop_created" ON "public"."ai_training_data" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_ai_training_data_source_event" ON "public"."ai_training_data" USING "btree" ("source_event_id");



CREATE INDEX "idx_ai_training_events__shop_id" ON "public"."ai_training_events" USING "btree" ("shop_id");



CREATE INDEX "idx_allocations_wo" ON "public"."work_order_part_allocations" USING "btree" ("work_order_id");



CREATE INDEX "idx_api_keys__user_id" ON "public"."api_keys" USING "btree" ("user_id");



CREATE INDEX "idx_assets_shop_id" ON "public"."assets" USING "btree" ("shop_id");



CREATE INDEX "idx_assets_source" ON "public"."assets" USING "btree" ("source");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_target" ON "public"."audit_logs" USING "btree" ("target");



CREATE INDEX "idx_bookings__shop_id" ON "public"."bookings" USING "btree" ("shop_id");



CREATE INDEX "idx_content_analytics_event_type" ON "public"."content_analytics_events" USING "btree" ("event_type");



CREATE INDEX "idx_content_analytics_occurred_at" ON "public"."content_analytics_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_content_analytics_publication_id" ON "public"."content_analytics_events" USING "btree" ("publication_id");



CREATE INDEX "idx_content_analytics_shop_id" ON "public"."content_analytics_events" USING "btree" ("shop_id");



CREATE INDEX "idx_content_assets_asset_type" ON "public"."content_assets" USING "btree" ("asset_type");



CREATE INDEX "idx_content_assets_event_id" ON "public"."content_assets" USING "btree" ("content_event_id");



CREATE INDEX "idx_content_assets_shop_id" ON "public"."content_assets" USING "btree" ("shop_id");



CREATE INDEX "idx_content_events_content_type" ON "public"."content_events" USING "btree" ("content_type");



CREATE INDEX "idx_content_events_metadata_gin" ON "public"."content_events" USING "gin" ("metadata" "jsonb_path_ops");



CREATE INDEX "idx_content_events_shop_id" ON "public"."content_events" USING "btree" ("shop_id");



CREATE INDEX "idx_content_events_source" ON "public"."content_events" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_content_events_status" ON "public"."content_events" USING "btree" ("status");



CREATE INDEX "idx_content_events_work_order_id" ON "public"."content_events" USING "btree" ("work_order_id");



CREATE INDEX "idx_content_pieces_event_id" ON "public"."content_pieces" USING "btree" ("content_event_id");



CREATE INDEX "idx_content_pieces_piece_type" ON "public"."content_pieces" USING "btree" ("piece_type");



CREATE INDEX "idx_content_pieces_platform" ON "public"."content_pieces" USING "btree" ("platform");



CREATE INDEX "idx_content_pieces_shop_id" ON "public"."content_pieces" USING "btree" ("shop_id");



CREATE INDEX "idx_content_pieces_slug" ON "public"."content_pieces" USING "btree" ("slug");



CREATE INDEX "idx_content_platform_accounts_shop_id" ON "public"."content_platform_accounts" USING "btree" ("shop_id");



CREATE INDEX "idx_content_publications_event_id" ON "public"."content_publications" USING "btree" ("content_event_id");



CREATE INDEX "idx_content_publications_platform_status" ON "public"."content_publications" USING "btree" ("platform", "status");



CREATE INDEX "idx_content_publications_scheduled_for" ON "public"."content_publications" USING "btree" ("scheduled_for");



CREATE INDEX "idx_content_publications_shop_id" ON "public"."content_publications" USING "btree" ("shop_id");



CREATE INDEX "idx_content_templates_shop_id" ON "public"."content_templates" USING "btree" ("shop_id");



CREATE INDEX "idx_conversation_participants__user_id" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_conversation_participants_conv_user" ON "public"."conversation_participants" USING "btree" ("conversation_id", "user_id");



CREATE INDEX "idx_conversation_participants_conversation" ON "public"."conversation_participants" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_participants_user" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_conversation_participants_user_id" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_created_by" ON "public"."conversations" USING "btree" ("created_by");



CREATE INDEX "idx_cp_conversation_user" ON "public"."conversation_participants" USING "btree" ("conversation_id", "user_id");



CREATE INDEX "idx_cp_user" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_customer_bookings__shop_id" ON "public"."customer_bookings" USING "btree" ("shop_id");



CREATE INDEX "idx_customer_quotes__shop_id" ON "public"."customer_quotes" USING "btree" ("shop_id");



CREATE INDEX "idx_customers__shop_id" ON "public"."customers" USING "btree" ("shop_id");



CREATE INDEX "idx_customers__user_id" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "idx_customers_updated_at" ON "public"."customers" USING "btree" ("updated_at");



CREATE INDEX "idx_customers_user" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "idx_customers_user_id" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "idx_decoded_vins__user_id" ON "public"."decoded_vins" USING "btree" ("user_id");



CREATE INDEX "idx_defective_parts__shop_id" ON "public"."defective_parts" USING "btree" ("shop_id");



CREATE INDEX "idx_demo_shop_boosts__shop_id" ON "public"."demo_shop_boosts" USING "btree" ("shop_id");



CREATE INDEX "idx_demo_shop_boosts_shop" ON "public"."demo_shop_boosts" USING "btree" ("shop_id");



CREATE INDEX "idx_dtc_logs__user_id" ON "public"."dtc_logs" USING "btree" ("user_id");



CREATE INDEX "idx_email_logs_email" ON "public"."email_logs" USING "btree" ("email");



CREATE INDEX "idx_email_logs_event_type" ON "public"."email_logs" USING "btree" ("event_type");



CREATE INDEX "idx_email_suppressions_email" ON "public"."email_suppressions" USING "btree" ("email");



CREATE INDEX "idx_empdocs_shop" ON "public"."employee_documents" USING "btree" ("shop_id");



CREATE INDEX "idx_empdocs_uploaded_at" ON "public"."employee_documents" USING "btree" ("uploaded_at" DESC);



CREATE INDEX "idx_empdocs_user" ON "public"."employee_documents" USING "btree" ("user_id");



CREATE INDEX "idx_employee_documents__shop_id" ON "public"."employee_documents" USING "btree" ("shop_id");



CREATE INDEX "idx_employee_documents__user_id" ON "public"."employee_documents" USING "btree" ("user_id");



CREATE INDEX "idx_expenses__shop_id" ON "public"."expenses" USING "btree" ("shop_id");



CREATE INDEX "idx_feature_reads__user_id" ON "public"."feature_reads" USING "btree" ("user_id");



CREATE INDEX "idx_fis_shop" ON "public"."fleet_inspection_schedules" USING "btree" ("shop_id");



CREATE INDEX "idx_fis_shop_next_date" ON "public"."fleet_inspection_schedules" USING "btree" ("shop_id", "next_inspection_date");



CREATE INDEX "idx_fis_vehicle" ON "public"."fleet_inspection_schedules" USING "btree" ("vehicle_id");



CREATE INDEX "idx_fleet_dispatch_assignments__shop_id" ON "public"."fleet_dispatch_assignments" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_dispatch_assignments_fleet_id" ON "public"."fleet_dispatch_assignments" USING "btree" ("fleet_id");



CREATE INDEX "idx_fleet_form_uploads_created_by_created_at" ON "public"."fleet_form_uploads" USING "btree" ("created_by", "created_at");



CREATE INDEX "idx_fleet_form_uploads_status_created_at" ON "public"."fleet_form_uploads" USING "btree" ("status", "created_at");



CREATE INDEX "idx_fleet_inspection_schedules__shop_id" ON "public"."fleet_inspection_schedules" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_inspection_schedules_fleet_id" ON "public"."fleet_inspection_schedules" USING "btree" ("fleet_id");



CREATE INDEX "idx_fleet_members__shop_id" ON "public"."fleet_members" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_members__user_id" ON "public"."fleet_members" USING "btree" ("user_id");



CREATE INDEX "idx_fleet_members_fleet" ON "public"."fleet_members" USING "btree" ("fleet_id");



CREATE INDEX "idx_fleet_members_shop" ON "public"."fleet_members" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_members_user" ON "public"."fleet_members" USING "btree" ("user_id");



CREATE INDEX "idx_fleet_pretrip_reports__shop_id" ON "public"."fleet_pretrip_reports" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_pretrip_reports_fleet_id" ON "public"."fleet_pretrip_reports" USING "btree" ("fleet_id");



CREATE INDEX "idx_fleet_service_requests__shop_id" ON "public"."fleet_service_requests" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_service_requests_fleet_id" ON "public"."fleet_service_requests" USING "btree" ("fleet_id");



CREATE INDEX "idx_fleet_vehicles__shop_id" ON "public"."fleet_vehicles" USING "btree" ("shop_id");



CREATE INDEX "idx_fleet_vehicles_fleet_id" ON "public"."fleet_vehicles" USING "btree" ("fleet_id");



CREATE INDEX "idx_fleet_vehicles_vehicle_id" ON "public"."fleet_vehicles" USING "btree" ("vehicle_id");



CREATE INDEX "idx_fleets__shop_id" ON "public"."fleets" USING "btree" ("shop_id");



CREATE INDEX "idx_fleets_shop_id" ON "public"."fleets" USING "btree" ("shop_id");



CREATE INDEX "idx_followups__user_id" ON "public"."followups" USING "btree" ("user_id");



CREATE INDEX "idx_history_customer_id" ON "public"."history" USING "btree" ("customer_id");



CREATE INDEX "idx_inspection_photos__user_id" ON "public"."inspection_photos" USING "btree" ("user_id");



CREATE INDEX "idx_inspection_result_items_result" ON "public"."inspection_result_items" USING "btree" ("result_id");



CREATE INDEX "idx_inspection_results_session" ON "public"."inspection_results" USING "btree" ("session_id");



CREATE INDEX "idx_inspection_results_wol" ON "public"."inspection_results" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_inspection_session_payloads_session" ON "public"."inspection_session_payloads" USING "btree" ("session_id");



CREATE INDEX "idx_inspection_session_payloads_session_id" ON "public"."inspection_session_payloads" USING "btree" ("session_id");



CREATE INDEX "idx_inspection_sessions__user_id" ON "public"."inspection_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_inspection_sessions_wol" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_inspection_sessions_work_order_id" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE INDEX "idx_inspection_template_suggestions__shop_id" ON "public"."inspection_template_suggestions" USING "btree" ("shop_id");



CREATE INDEX "idx_inspection_templates__shop_id" ON "public"."inspection_templates" USING "btree" ("shop_id");



CREATE INDEX "idx_inspection_templates__user_id" ON "public"."inspection_templates" USING "btree" ("user_id");



CREATE INDEX "idx_inspection_templates_shop" ON "public"."inspection_templates" USING "btree" ("shop_id");



CREATE INDEX "idx_inspection_templates_user" ON "public"."inspection_templates" USING "btree" ("user_id");



CREATE INDEX "idx_inspections__shop_id" ON "public"."inspections" USING "btree" ("shop_id");



CREATE INDEX "idx_inspections__user_id" ON "public"."inspections" USING "btree" ("user_id");



CREATE INDEX "idx_inspsess_status" ON "public"."inspection_sessions" USING "btree" ("status");



CREATE INDEX "idx_inspsess_template" ON "public"."inspection_sessions" USING "btree" ("template");



CREATE INDEX "idx_inspsess_wo" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE INDEX "idx_inspsess_woline" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_integration_logs__shop_id" ON "public"."integration_logs" USING "btree" ("shop_id");



CREATE INDEX "idx_integrations__shop_id" ON "public"."integrations" USING "btree" ("shop_id");



CREATE INDEX "idx_invoice_documents__shop_id" ON "public"."invoice_documents" USING "btree" ("shop_id");



CREATE INDEX "idx_invoices__shop_id" ON "public"."invoices" USING "btree" ("shop_id");



CREATE INDEX "idx_invoices_shop_tech_created" ON "public"."invoices" USING "btree" ("shop_id", "tech_id", "created_at");



CREATE INDEX "idx_invoices_tech_shop_created_at" ON "public"."invoices" USING "btree" ("tech_id", "shop_id", "created_at");



CREATE INDEX "idx_invoices_wo" ON "public"."invoices" USING "btree" ("work_order_id");



CREATE INDEX "idx_lead_events_occurred_at" ON "public"."lead_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_lead_events_shop_id" ON "public"."lead_events" USING "btree" ("shop_id");



CREATE INDEX "idx_lead_events_video_id" ON "public"."lead_events" USING "btree" ("video_id");



CREATE INDEX "idx_learning_feedback_run_id" ON "public"."learning_feedback" USING "btree" ("ai_generation_run_id");



CREATE INDEX "idx_learning_feedback_shop_id" ON "public"."learning_feedback" USING "btree" ("shop_id");



CREATE INDEX "idx_learning_feedback_type" ON "public"."learning_feedback" USING "btree" ("feedback_type");



CREATE INDEX "idx_learning_feedback_video_id" ON "public"."learning_feedback" USING "btree" ("video_id");



CREATE INDEX "idx_maintenance_rules_target" ON "public"."maintenance_rules" USING "btree" ("make", "model", "year_from", "year_to", "engine_family");



CREATE INDEX "idx_maintenance_suggestions_status" ON "public"."maintenance_suggestions" USING "btree" ("status");



CREATE INDEX "idx_media_uploads__user_id" ON "public"."media_uploads" USING "btree" ("user_id");



CREATE INDEX "idx_menu_item_parts__shop_id" ON "public"."menu_item_parts" USING "btree" ("shop_id");



CREATE INDEX "idx_menu_item_parts__user_id" ON "public"."menu_item_parts" USING "btree" ("user_id");



CREATE INDEX "idx_menu_item_suggestions__shop_id" ON "public"."menu_item_suggestions" USING "btree" ("shop_id");



CREATE INDEX "idx_menu_items__shop_id" ON "public"."menu_items" USING "btree" ("shop_id");



CREATE INDEX "idx_menu_items__user_id" ON "public"."menu_items" USING "btree" ("user_id");



CREATE INDEX "idx_menu_items_shop_active" ON "public"."menu_items" USING "btree" ("shop_id", "is_active");



CREATE INDEX "idx_menu_items_shop_name" ON "public"."menu_items" USING "btree" ("shop_id", "lower"("name"));



CREATE INDEX "idx_menu_items_shop_service_key" ON "public"."menu_items" USING "btree" ("shop_id", "lower"("service_key"));



CREATE INDEX "idx_menu_items_shop_vehicle_specs" ON "public"."menu_items" USING "btree" ("shop_id", "is_active", "submodel", "engine_type", "transmission_type", "drivetrain");



CREATE INDEX "idx_menu_items_shop_vehicle_ymm" ON "public"."menu_items" USING "btree" ("shop_id", "is_active", "vehicle_year", "vehicle_make", "vehicle_model");



CREATE INDEX "idx_menu_items_vehicle_job" ON "public"."menu_items" USING "btree" ("vehicle_make", "vehicle_model", "engine_type", "transmission_type", "drivetrain", "lower"("name"));



CREATE INDEX "idx_menu_items_work_order_line" ON "public"."menu_items" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_menu_pricing__user_id" ON "public"."menu_pricing" USING "btree" ("user_id");



CREATE INDEX "idx_message_reads__user_id" ON "public"."message_reads" USING "btree" ("user_id");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_conversation_created_desc" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_meta_participants_key" ON "public"."messages" USING "btree" ((("metadata" ->> 'participants_key'::"text")));



CREATE INDEX "idx_messages_recipients_gin" ON "public"."messages" USING "gin" ("recipients");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_mip_item" ON "public"."menu_item_parts" USING "btree" ("menu_item_id");



CREATE INDEX "idx_mip_user" ON "public"."menu_item_parts" USING "btree" ("user_id");



CREATE INDEX "idx_notifications__user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_org_members__user_id" ON "public"."org_members" USING "btree" ("user_id");



CREATE INDEX "idx_org_members_org_id" ON "public"."org_members" USING "btree" ("org_id");



CREATE INDEX "idx_org_members_user_id" ON "public"."org_members" USING "btree" ("user_id");



CREATE INDEX "idx_part_barcodes_part" ON "public"."part_barcodes" USING "btree" ("part_id");



CREATE INDEX "idx_part_compatibility__shop_id" ON "public"."part_compatibility" USING "btree" ("shop_id");



CREATE INDEX "idx_part_fitment_events__shop_id" ON "public"."part_fitment_events" USING "btree" ("shop_id");



CREATE INDEX "idx_part_purchases__shop_id" ON "public"."part_purchases" USING "btree" ("shop_id");



CREATE INDEX "idx_part_request_items__shop_id" ON "public"."part_request_items" USING "btree" ("shop_id");



CREATE INDEX "idx_part_request_items_line_id" ON "public"."part_request_items" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_part_requests__shop_id" ON "public"."part_requests" USING "btree" ("shop_id");



CREATE INDEX "idx_part_requests_job_id" ON "public"."part_requests" USING "btree" ("job_id");



CREATE INDEX "idx_part_returns__shop_id" ON "public"."part_returns" USING "btree" ("shop_id");



CREATE INDEX "idx_part_stock_part_loc" ON "public"."part_stock" USING "btree" ("part_id", "location_id");



CREATE INDEX "idx_part_suppliers__shop_id" ON "public"."part_suppliers" USING "btree" ("shop_id");



CREATE INDEX "idx_part_warranties__shop_id" ON "public"."part_warranties" USING "btree" ("shop_id");



CREATE INDEX "idx_parts__shop_id" ON "public"."parts" USING "btree" ("shop_id");



CREATE INDEX "idx_parts_barcodes__shop_id" ON "public"."parts_barcodes" USING "btree" ("shop_id");



CREATE INDEX "idx_parts_barcodes_part" ON "public"."parts_barcodes" USING "btree" ("part_id");



CREATE INDEX "idx_parts_barcodes_shop_code" ON "public"."parts_barcodes" USING "btree" ("shop_id", "code");



CREATE INDEX "idx_parts_shop" ON "public"."parts" USING "btree" ("shop_id");



CREATE INDEX "idx_parts_shop_id" ON "public"."parts" USING "btree" ("shop_id");



CREATE INDEX "idx_parts_suppliers__shop_id" ON "public"."parts_suppliers" USING "btree" ("shop_id");



CREATE INDEX "idx_payments__shop_id" ON "public"."payments" USING "btree" ("shop_id");



CREATE INDEX "idx_payroll_pay_periods__shop_id" ON "public"."payroll_pay_periods" USING "btree" ("shop_id");



CREATE INDEX "idx_payroll_providers__shop_id" ON "public"."payroll_providers" USING "btree" ("shop_id");



CREATE INDEX "idx_payroll_timecards__shop_id" ON "public"."payroll_timecards" USING "btree" ("shop_id");



CREATE INDEX "idx_payroll_timecards__user_id" ON "public"."payroll_timecards" USING "btree" ("user_id");



CREATE INDEX "idx_payroll_timecards_user_shop_clock_in" ON "public"."payroll_timecards" USING "btree" ("user_id", "shop_id", "clock_in");



CREATE INDEX "idx_planner_events_run_step" ON "public"."planner_events" USING "btree" ("run_id", "step");



CREATE INDEX "idx_planner_runs__shop_id" ON "public"."planner_runs" USING "btree" ("shop_id");



CREATE INDEX "idx_planner_runs__user_id" ON "public"."planner_runs" USING "btree" ("user_id");



CREATE INDEX "idx_planner_runs_idempotency" ON "public"."planner_runs" USING "btree" ("user_id", "idempotency_key");



CREATE INDEX "idx_planner_runs_shop_user" ON "public"."planner_runs" USING "btree" ("shop_id", "user_id");



CREATE INDEX "idx_po_shop" ON "public"."purchase_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_pol_po" ON "public"."purchase_order_lines" USING "btree" ("po_id");



CREATE INDEX "idx_pol_po_part_created" ON "public"."purchase_order_lines" USING "btree" ("po_id", "part_id", "created_at");



CREATE INDEX "idx_portal_notifications__user_id" ON "public"."portal_notifications" USING "btree" ("user_id");



CREATE INDEX "idx_pqr_line_id" ON "public"."parts_quote_requests" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_pqr_status" ON "public"."parts_quote_requests" USING "btree" ("status");



CREATE INDEX "idx_pr_lines_wol" ON "public"."part_request_lines" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_pri_line" ON "public"."part_request_items" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_pri_part" ON "public"."part_request_items" USING "btree" ("part_id");



CREATE INDEX "idx_pri_po_id" ON "public"."part_request_items" USING "btree" ("po_id");



CREATE INDEX "idx_pri_shop" ON "public"."part_request_items" USING "btree" ("shop_id");



CREATE INDEX "idx_pri_shop_part_status_created" ON "public"."part_request_items" USING "btree" ("shop_id", "part_id", "status", "created_at");



CREATE INDEX "idx_pri_wo" ON "public"."part_request_items" USING "btree" ("work_order_id");



CREATE INDEX "idx_profiles__shop_id" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_profiles__user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_id_shop" ON "public"."profiles" USING "btree" ("id", "shop_id");



CREATE INDEX "idx_profiles_last_active_at" ON "public"."profiles" USING "btree" ("last_active_at" DESC);



CREATE INDEX "idx_profiles_organization_id" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_role_lower" ON "public"."profiles" USING "btree" ("lower"(COALESCE("role", ''::"text")));



CREATE INDEX "idx_profiles_shop" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_profiles_shop_id" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_profiles_shop_role" ON "public"."profiles" USING "btree" ("shop_id", "role");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_punch_events__user_id" ON "public"."punch_events" USING "btree" ("user_id");



CREATE INDEX "idx_punch_events_shift_time" ON "public"."punch_events" USING "btree" ("shift_id", "timestamp" DESC);



CREATE INDEX "idx_punch_events_shift_timestamp" ON "public"."punch_events" USING "btree" ("shift_id", "timestamp");



CREATE INDEX "idx_punch_events_user_shift_time" ON "public"."punch_events" USING "btree" ("user_id", "shift_id", "timestamp");



CREATE INDEX "idx_punch_events_user_time" ON "public"."punch_events" USING "btree" ("user_id", "timestamp" DESC);



CREATE INDEX "idx_purchase_order_lines_po" ON "public"."purchase_order_lines" USING "btree" ("po_id");



CREATE INDEX "idx_purchase_orders__shop_id" ON "public"."purchase_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_purchase_orders_shop" ON "public"."purchase_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_quote_lines__user_id" ON "public"."quote_lines" USING "btree" ("user_id");



CREATE INDEX "idx_result_items_label" ON "public"."inspection_result_items" USING "btree" ("item_label");



CREATE INDEX "idx_shop_ai_profiles__shop_id" ON "public"."shop_ai_profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_boost_intakes__shop_id" ON "public"."shop_boost_intakes" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_health_snapshots__shop_id" ON "public"."shop_health_snapshots" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_hours__shop_id" ON "public"."shop_hours" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "idx_shop_marketing_memory_shop_key" ON "public"."shop_marketing_memory" USING "btree" ("shop_id", "memory_key");



CREATE INDEX "idx_shop_members__shop_id" ON "public"."shop_members" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_members__user_id" ON "public"."shop_members" USING "btree" ("user_id");



CREATE INDEX "idx_shop_parts__shop_id" ON "public"."shop_parts" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_profiles__shop_id" ON "public"."shop_profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_profiles_shop" ON "public"."shop_profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_ratings__shop_id" ON "public"."shop_ratings" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_reviews__shop_id" ON "public"."shop_reviews" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_reviews_customer_id" ON "public"."shop_reviews" USING "btree" ("customer_id");



CREATE INDEX "idx_shop_reviews_reviewer_user_id" ON "public"."shop_reviews" USING "btree" ("reviewer_user_id");



CREATE INDEX "idx_shop_reviews_shop_id" ON "public"."shop_reviews" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_schedules__shop_id" ON "public"."shop_schedules" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_settings__user_id" ON "public"."shop_settings" USING "btree" ("user_id");



CREATE INDEX "idx_shop_tax_overrides__shop_id" ON "public"."shop_tax_overrides" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_time_off__shop_id" ON "public"."shop_time_off" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_time_slots__shop_id" ON "public"."shop_time_slots" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_users_shop_id" ON "public"."shop_users" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_users_user_id" ON "public"."shop_users" USING "btree" ("user_id");



CREATE INDEX "idx_shop_vehicle_menu_items__shop_id" ON "public"."shop_vehicle_menu_items" USING "btree" ("shop_id");



CREATE INDEX "idx_shopreel_manual_asset_files_asset_id" ON "public"."shopreel_manual_asset_files" USING "btree" ("manual_asset_id");



CREATE INDEX "idx_shopreel_manual_assets_created_at" ON "public"."shopreel_manual_assets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_shopreel_manual_assets_shop_id" ON "public"."shopreel_manual_assets" USING "btree" ("shop_id");



CREATE INDEX "idx_shopreel_manual_assets_status" ON "public"."shopreel_manual_assets" USING "btree" ("status");



CREATE INDEX "idx_shopreel_publish_jobs_publication_id" ON "public"."shopreel_publish_jobs" USING "btree" ("publication_id");



CREATE INDEX "idx_shopreel_publish_jobs_status_run_after" ON "public"."shopreel_publish_jobs" USING "btree" ("status", "run_after");



CREATE INDEX "idx_shops_default_stock_location_id" ON "public"."shops" USING "btree" ("default_stock_location_id");



CREATE INDEX "idx_shops_organization_id" ON "public"."shops" USING "btree" ("organization_id");



CREATE INDEX "idx_shops_stripe_customer_id" ON "public"."shops" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_shops_stripe_status" ON "public"."shops" USING "btree" ("stripe_subscription_status");



CREATE INDEX "idx_shops_stripe_subscription_id" ON "public"."shops" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_staff_invite_candidates__shop_id" ON "public"."staff_invite_candidates" USING "btree" ("shop_id");



CREATE INDEX "idx_staff_invite_suggestions__shop_id" ON "public"."staff_invite_suggestions" USING "btree" ("shop_id");



CREATE INDEX "idx_stock_locations__shop_id" ON "public"."stock_locations" USING "btree" ("shop_id");



CREATE INDEX "idx_stock_moves__shop_id" ON "public"."stock_moves" USING "btree" ("shop_id");



CREATE INDEX "idx_supplier_orders__shop_id" ON "public"."supplier_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_suppliers__shop_id" ON "public"."suppliers" USING "btree" ("shop_id");



CREATE INDEX "idx_suppliers_shop_id" ON "public"."suppliers" USING "btree" ("shop_id");



CREATE INDEX "idx_tax_calculation_log__shop_id" ON "public"."tax_calculation_log" USING "btree" ("shop_id");



CREATE INDEX "idx_tax_providers__shop_id" ON "public"."tax_providers" USING "btree" ("shop_id");



CREATE INDEX "idx_tech_sessions__shop_id" ON "public"."tech_sessions" USING "btree" ("shop_id");



CREATE INDEX "idx_tech_sessions__user_id" ON "public"."tech_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_tech_sessions_shift_started" ON "public"."tech_sessions" USING "btree" ("shift_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_shop_started" ON "public"."tech_sessions" USING "btree" ("shop_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_shop_started_at" ON "public"."tech_sessions" USING "btree" ("shop_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_user_started" ON "public"."tech_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_user_started_at" ON "public"."tech_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_work_order_id" ON "public"."tech_sessions" USING "btree" ("work_order_id");



CREATE INDEX "idx_tech_sessions_work_order_line_id" ON "public"."tech_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_tech_shifts__shop_id" ON "public"."tech_shifts" USING "btree" ("shop_id");



CREATE INDEX "idx_tech_shifts__user_id" ON "public"."tech_shifts" USING "btree" ("user_id");



CREATE INDEX "idx_tech_shifts_shop_start_time" ON "public"."tech_shifts" USING "btree" ("shop_id", "start_time" DESC);



CREATE INDEX "idx_tech_shifts_shop_time" ON "public"."tech_shifts" USING "btree" ("shop_id", "start_time" DESC);



CREATE INDEX "idx_tech_shifts_shop_user_start_time" ON "public"."tech_shifts" USING "btree" ("shop_id", "user_id", "start_time" DESC);



CREATE INDEX "idx_tech_shifts_user_start_time" ON "public"."tech_shifts" USING "btree" ("user_id", "start_time" DESC);



CREATE INDEX "idx_tech_shifts_user_time" ON "public"."tech_shifts" USING "btree" ("user_id", "start_time" DESC);



CREATE INDEX "idx_timecards_shop_user_clockin" ON "public"."payroll_timecards" USING "btree" ("shop_id", "user_id", "clock_in");



CREATE INDEX "idx_usage_logs__user_id" ON "public"."usage_logs" USING "btree" ("user_id");



CREATE INDEX "idx_user_app_layouts__user_id" ON "public"."user_app_layouts" USING "btree" ("user_id");



CREATE INDEX "idx_user_plans__user_id" ON "public"."user_plans" USING "btree" ("user_id");



CREATE INDEX "idx_user_widget_layouts__user_id" ON "public"."user_widget_layouts" USING "btree" ("user_id");



CREATE INDEX "idx_vehicle_media__shop_id" ON "public"."vehicle_media" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicle_menus_lookup" ON "public"."vehicle_menus" USING "btree" ("lower"("make"), "lower"("model"), "year_from", "year_to", "service_code");



CREATE INDEX "idx_vehicle_photos__shop_id" ON "public"."vehicle_photos" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicle_photos_shop_id" ON "public"."vehicle_photos" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicle_photos_uploaded_by" ON "public"."vehicle_photos" USING "btree" ("uploaded_by");



CREATE INDEX "idx_vehicle_recalls__shop_id" ON "public"."vehicle_recalls" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicle_recalls__user_id" ON "public"."vehicle_recalls" USING "btree" ("user_id");



CREATE INDEX "idx_vehicle_signatures__shop_id" ON "public"."vehicle_signatures" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicles__shop_id" ON "public"."vehicles" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicles__user_id" ON "public"."vehicles" USING "btree" ("user_id");



CREATE INDEX "idx_vehicles_id_shop" ON "public"."vehicles" USING "btree" ("id", "shop_id");



CREATE INDEX "idx_vehicles_shop_vin" ON "public"."vehicles" USING "btree" ("shop_id", "vin");



CREATE INDEX "idx_vendor_part_numbers__shop_id" ON "public"."vendor_part_numbers" USING "btree" ("shop_id");



CREATE INDEX "idx_vendor_part_numbers_shop" ON "public"."vendor_part_numbers" USING "btree" ("shop_id");



CREATE INDEX "idx_video_metrics_metric_date" ON "public"."video_metrics" USING "btree" ("metric_date");



CREATE INDEX "idx_video_metrics_platform" ON "public"."video_metrics" USING "btree" ("platform");



CREATE INDEX "idx_video_metrics_shop_id" ON "public"."video_metrics" USING "btree" ("shop_id");



CREATE INDEX "idx_video_metrics_video_id" ON "public"."video_metrics" USING "btree" ("video_id");



CREATE INDEX "idx_video_platform_posts_platform" ON "public"."video_platform_posts" USING "btree" ("platform");



CREATE INDEX "idx_video_platform_posts_shop_id" ON "public"."video_platform_posts" USING "btree" ("shop_id");



CREATE INDEX "idx_video_platform_posts_video_id" ON "public"."video_platform_posts" USING "btree" ("video_id");



CREATE INDEX "idx_videos_content_type" ON "public"."videos" USING "btree" ("content_type");



CREATE INDEX "idx_videos_published_at" ON "public"."videos" USING "btree" ("published_at");



CREATE INDEX "idx_videos_shop_id" ON "public"."videos" USING "btree" ("shop_id");



CREATE INDEX "idx_videos_status" ON "public"."videos" USING "btree" ("status");



CREATE INDEX "idx_vin_decodes__user_id" ON "public"."vin_decodes" USING "btree" ("user_id");



CREATE INDEX "idx_warranties__shop_id" ON "public"."warranties" USING "btree" ("shop_id");



CREATE INDEX "idx_warranties_shop" ON "public"."warranties" USING "btree" ("shop_id");



CREATE INDEX "idx_warranty_claims_warranty" ON "public"."warranty_claims" USING "btree" ("warranty_id");



CREATE INDEX "idx_widget_instances__user_id" ON "public"."widget_instances" USING "btree" ("user_id");



CREATE INDEX "idx_wo_approval_state" ON "public"."work_orders" USING "btree" ("approval_state");



CREATE INDEX "idx_wo_shop" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_wol_active_shop_status" ON "public"."work_order_lines" USING "btree" ("shop_id", "status") WHERE ("status" = ANY (ARRAY['awaiting'::"text", 'queued'::"text", 'assigned'::"text", 'in_progress'::"text", 'on_hold'::"text", 'awaiting_approval'::"text"]));



CREATE INDEX "idx_wol_approval_state" ON "public"."work_order_lines" USING "btree" ("approval_state");



CREATE INDEX "idx_wol_assigned_tech" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id");



CREATE INDEX "idx_wol_assigned_to" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "idx_wol_created_at" ON "public"."work_order_lines" USING "btree" ("created_at");



CREATE INDEX "idx_wol_inspection_session" ON "public"."work_order_lines" USING "btree" ("inspection_session_id");



CREATE INDEX "idx_wol_inspection_session_id" ON "public"."work_order_lines" USING "btree" ("inspection_session_id");



CREATE INDEX "idx_wol_inspection_template_id" ON "public"."work_order_lines" USING "btree" ("inspection_template_id");



CREATE INDEX "idx_wol_job_type" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "idx_wol_menu_item_id" ON "public"."work_order_lines" USING "btree" ("menu_item_id");



CREATE INDEX "idx_wol_menu_item_vehicle" ON "public"."work_order_lines" USING "btree" ("menu_item_id", "vehicle_id");



CREATE INDEX "idx_wol_on_hold_since" ON "public"."work_order_lines" USING "btree" ("on_hold_since");



CREATE INDEX "idx_wol_pending_approvals" ON "public"."work_order_lines" USING "btree" ("shop_id") WHERE ("approval_state" = 'pending'::"text");



CREATE INDEX "idx_wol_required_session" ON "public"."work_order_lines" USING "btree" ("inspection_session_id") WHERE (("job_type" = 'inspection'::"text") OR ("inspection_template_id" IS NOT NULL));



CREATE INDEX "idx_wol_service_code" ON "public"."work_order_lines" USING "btree" ("service_code");



CREATE INDEX "idx_wol_shop" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_wol_shop_approval_state" ON "public"."work_order_lines" USING "btree" ("shop_id", "approval_state");



CREATE INDEX "idx_wol_shop_assigned_tech" ON "public"."work_order_lines" USING "btree" ("shop_id", "assigned_tech_id");



CREATE INDEX "idx_wol_shop_created_at" ON "public"."work_order_lines" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_wol_shop_quoted_at" ON "public"."work_order_lines" USING "btree" ("shop_id", "quoted_at" DESC);



CREATE INDEX "idx_wol_shop_status" ON "public"."work_order_lines" USING "btree" ("shop_id", "status");



CREATE INDEX "idx_wol_shop_urgency" ON "public"."work_order_lines" USING "btree" ("shop_id", "urgency");



CREATE INDEX "idx_wol_status" ON "public"."work_order_lines" USING "btree" ("status");



CREATE INDEX "idx_wol_status_priority_created" ON "public"."work_order_lines" USING "btree" ("status", "priority", "created_at");



CREATE INDEX "idx_wol_updated_at" ON "public"."work_order_lines" USING "btree" ("updated_at");



CREATE INDEX "idx_wol_user_id" ON "public"."work_order_lines" USING "btree" ("user_id");



CREATE INDEX "idx_wol_vehicle_id" ON "public"."work_order_lines" USING "btree" ("vehicle_id");



CREATE INDEX "idx_wol_vehicle_status_created" ON "public"."work_order_lines" USING "btree" ("vehicle_id", "status", "created_at" DESC);



CREATE INDEX "idx_wol_wo" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_wol_wo_approval" ON "public"."work_order_lines" USING "btree" ("work_order_id", "approval_state");



CREATE INDEX "idx_wol_wo_status_hold" ON "public"."work_order_lines" USING "btree" ("work_order_id", "status", "hold_reason");



CREATE INDEX "idx_wol_work_order_id" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_wol_work_order_line_no" ON "public"."work_order_lines" USING "btree" ("work_order_id", "line_no");



CREATE INDEX "idx_wolt_line_id" ON "public"."work_order_line_technicians" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_wolt_technician_id" ON "public"."work_order_line_technicians" USING "btree" ("technician_id");



CREATE INDEX "idx_wop_line_id" ON "public"."work_order_parts" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_wopa_line_part" ON "public"."work_order_part_allocations" USING "btree" ("work_order_line_id", "part_id");



CREATE INDEX "idx_wopa_part" ON "public"."work_order_part_allocations" USING "btree" ("part_id");



CREATE INDEX "idx_wopa_wo" ON "public"."work_order_part_allocations" USING "btree" ("work_order_id");



CREATE INDEX "idx_wopa_wo_line" ON "public"."work_order_part_allocations" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_woql_shop_id" ON "public"."work_order_quote_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_woql_work_order_id" ON "public"."work_order_quote_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_woql_work_order_id_stage" ON "public"."work_order_quote_lines" USING "btree" ("work_order_id", "stage");



CREATE INDEX "idx_woql_work_order_line_id" ON "public"."work_order_quote_lines" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_work_order_invoice_reviews__shop_id" ON "public"."work_order_invoice_reviews" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_line_ai__shop_id" ON "public"."work_order_line_ai" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_lines__shop_id" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_lines__user_id" ON "public"."work_order_lines" USING "btree" ("user_id");



CREATE INDEX "idx_work_order_lines_assigned_shop_created_at" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id", "shop_id", "created_at");



CREATE INDEX "idx_work_order_lines_assigned_tech" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id");



CREATE INDEX "idx_work_order_lines_assigned_tech_id" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id");



CREATE INDEX "idx_work_order_lines_assigned_to" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "idx_work_order_lines_wo_approval" ON "public"."work_order_lines" USING "btree" ("work_order_id", "approval_state");



CREATE INDEX "idx_work_order_lines_wo_id" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_order_media__shop_id" ON "public"."work_order_media" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_media__user_id" ON "public"."work_order_media" USING "btree" ("user_id");



CREATE INDEX "idx_work_order_part_allocations__shop_id" ON "public"."work_order_part_allocations" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_part_allocations_created_at" ON "public"."work_order_part_allocations" USING "btree" ("created_at");



CREATE INDEX "idx_work_order_parts__shop_id" ON "public"."work_order_parts" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_quote_lines__shop_id" ON "public"."work_order_quote_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_work_order_quote_lines_status" ON "public"."work_order_quote_lines" USING "btree" ("status");



CREATE INDEX "idx_work_order_quote_lines_suggested_by" ON "public"."work_order_quote_lines" USING "btree" ("suggested_by");



CREATE INDEX "idx_work_order_quote_lines_vehicle_id" ON "public"."work_order_quote_lines" USING "btree" ("vehicle_id");



CREATE INDEX "idx_work_order_quote_lines_work_order_id" ON "public"."work_order_quote_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_orders__shop_id" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders__user_id" ON "public"."work_orders" USING "btree" ("user_id");



CREATE INDEX "idx_work_orders_advisor_id" ON "public"."work_orders" USING "btree" ("advisor_id");



CREATE INDEX "idx_work_orders_approval_state" ON "public"."work_orders" USING "btree" ("approval_state");



CREATE INDEX "idx_work_orders_created" ON "public"."work_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_work_orders_customer" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_customer_id" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_customer_signed" ON "public"."work_orders" USING "btree" ("customer_approval_at");



CREATE INDEX "idx_work_orders_id_shop" ON "public"."work_orders" USING "btree" ("id", "shop_id");



CREATE INDEX "idx_work_orders_intake_json" ON "public"."work_orders" USING "gin" ("intake_json");



CREATE INDEX "idx_work_orders_intake_status" ON "public"."work_orders" USING "btree" ("intake_status");



CREATE INDEX "idx_work_orders_shop" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders_shop_assigned_tech_created_at" ON "public"."work_orders" USING "btree" ("shop_id", "assigned_tech", "created_at" DESC);



CREATE INDEX "idx_work_orders_shop_id" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders_shop_status" ON "public"."work_orders" USING "btree" ("shop_id", "status");



CREATE INDEX "idx_work_orders_source_fleet_program_id" ON "public"."work_orders" USING "btree" ("source_fleet_program_id");



CREATE INDEX "idx_work_orders_status" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "idx_work_orders_status_approval" ON "public"."work_orders" USING "btree" ("status", "approval_state");



CREATE INDEX "idx_work_orders_vehicle_id" ON "public"."work_orders" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "inspection_sessions_line_template_uniq" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id", "template");



CREATE INDEX "inspection_sessions_vehicle_idx" ON "public"."inspection_sessions" USING "btree" ("vehicle_id");



CREATE INDEX "inspection_sessions_wo_idx" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE UNIQUE INDEX "inspection_sessions_work_order_line_id_uq" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id") WHERE ("work_order_line_id" IS NOT NULL);



CREATE UNIQUE INDEX "inspection_sessions_work_order_line_id_ux" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "inspection_template_suggestions_intake_id_idx" ON "public"."inspection_template_suggestions" USING "btree" ("intake_id");



CREATE INDEX "inspection_template_suggestions_items_gin_idx" ON "public"."inspection_template_suggestions" USING "gin" ("items");



CREATE INDEX "inspection_template_suggestions_shop_id_idx" ON "public"."inspection_template_suggestions" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "inspections_one_per_line" ON "public"."inspections" USING "btree" ("work_order_line_id") WHERE ("work_order_line_id" IS NOT NULL);



CREATE INDEX "inspections_shop_id_idx" ON "public"."inspections" USING "btree" ("shop_id");



CREATE INDEX "inspections_vehicle_id_idx" ON "public"."inspections" USING "btree" ("vehicle_id");



CREATE INDEX "inspections_work_order_id_idx" ON "public"."inspections" USING "btree" ("work_order_id");



CREATE INDEX "inspections_work_order_line_id_idx" ON "public"."inspections" USING "btree" ("work_order_line_id");



CREATE INDEX "integration_logs_provider_idx" ON "public"."integration_logs" USING "btree" ("provider");



CREATE INDEX "integration_logs_shop_idx" ON "public"."integration_logs" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "integrations_shop_provider_idx" ON "public"."integrations" USING "btree" ("shop_id", "provider");



CREATE INDEX "invoice_documents_invoice_id_ix" ON "public"."invoice_documents" USING "btree" ("invoice_id");



CREATE UNIQUE INDEX "invoice_documents_invoice_kind_ux" ON "public"."invoice_documents" USING "btree" ("invoice_id", "kind");



CREATE INDEX "invoices_shop_created_at_idx" ON "public"."invoices" USING "btree" ("shop_id", "created_at");



CREATE INDEX "invoices_shop_created_idx" ON "public"."invoices" USING "btree" ("shop_id", "created_at");



CREATE UNIQUE INDEX "invoices_shop_invoice_number_idx" ON "public"."invoices" USING "btree" ("shop_id", "invoice_number") WHERE ("invoice_number" IS NOT NULL);



CREATE INDEX "invoices_shop_status_idx" ON "public"."invoices" USING "btree" ("shop_id", "status");



CREATE INDEX "invoices_work_order_id_idx" ON "public"."invoices" USING "btree" ("work_order_id");



CREATE INDEX "ix_wol_history_line" ON "public"."work_order_line_history" USING "btree" ("line_id");



CREATE INDEX "ix_wol_history_wo" ON "public"."work_order_line_history" USING "btree" ("work_order_id");



CREATE INDEX "job_type_idx" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "menu_item_parts_menu_item_id_idx" ON "public"."menu_item_parts" USING "btree" ("menu_item_id");



CREATE INDEX "menu_item_parts_part_id_idx" ON "public"."menu_item_parts" USING "btree" ("part_id");



CREATE INDEX "menu_item_parts_shop_id_idx" ON "public"."menu_item_parts" USING "btree" ("shop_id");



CREATE INDEX "menu_item_suggestions_intake_id_idx" ON "public"."menu_item_suggestions" USING "btree" ("intake_id");



CREATE INDEX "menu_item_suggestions_shop_id_idx" ON "public"."menu_item_suggestions" USING "btree" ("shop_id");



CREATE INDEX "menu_items_active_idx" ON "public"."menu_items" USING "btree" ("is_active");



CREATE INDEX "menu_items_name_idx" ON "public"."menu_items" USING "btree" ("name");



CREATE INDEX "menu_items_shop_idx" ON "public"."menu_items" USING "btree" ("shop_id");



CREATE INDEX "menu_items_user_idx" ON "public"."menu_items" USING "btree" ("user_id");



CREATE INDEX "message_reads_user_id_conversation_id_idx" ON "public"."message_reads" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE UNIQUE INDEX "organizations_slug_uq" ON "public"."organizations" USING "btree" ("slug");



CREATE UNIQUE INDEX "part_fitment_events_allocation_uniq" ON "public"."part_fitment_events" USING "btree" ("allocation_id") WHERE ("allocation_id" IS NOT NULL);



CREATE INDEX "part_fitment_events_created_at_idx" ON "public"."part_fitment_events" USING "btree" ("created_at" DESC);



CREATE INDEX "part_fitment_events_part_id_idx" ON "public"."part_fitment_events" USING "btree" ("part_id");



CREATE INDEX "part_fitment_events_shop_id_idx" ON "public"."part_fitment_events" USING "btree" ("shop_id");



CREATE INDEX "part_fitment_events_shop_part_created_idx" ON "public"."part_fitment_events" USING "btree" ("shop_id", "part_id", "created_at" DESC);



CREATE INDEX "part_fitment_events_shop_sig_created_idx" ON "public"."part_fitment_events" USING "btree" ("shop_id", "vehicle_signature_id", "created_at" DESC);



CREATE INDEX "part_fitment_events_vehicle_sig_idx" ON "public"."part_fitment_events" USING "btree" ("vehicle_signature_id");



CREATE INDEX "part_request_items_location_idx" ON "public"."part_request_items" USING "btree" ("location_id");



CREATE INDEX "part_request_items_work_order_line_id_idx" ON "public"."part_request_items" USING "btree" ("work_order_line_id");



CREATE INDEX "part_request_lines_line_idx" ON "public"."part_request_lines" USING "btree" ("work_order_line_id");



CREATE INDEX "part_request_lines_req_idx" ON "public"."part_request_lines" USING "btree" ("request_id");



CREATE UNIQUE INDEX "parts_shop_sku_uq" ON "public"."parts" USING "btree" ("shop_id", "sku");



CREATE INDEX "payments_shop_created_at_idx" ON "public"."payments" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "payments_shop_id_idx" ON "public"."payments" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "payments_unique_checkout_session_id" ON "public"."payments" USING "btree" ("stripe_checkout_session_id") WHERE (("stripe_checkout_session_id" IS NOT NULL) AND ("length"("stripe_checkout_session_id") > 0));



CREATE UNIQUE INDEX "payments_unique_payment_intent_id" ON "public"."payments" USING "btree" ("stripe_payment_intent_id") WHERE (("stripe_payment_intent_id" IS NOT NULL) AND ("length"("stripe_payment_intent_id") > 0));



CREATE UNIQUE INDEX "payments_unique_stripe_session_id" ON "public"."payments" USING "btree" ("stripe_session_id") WHERE (("stripe_session_id" IS NOT NULL) AND ("length"("stripe_session_id") > 0));



CREATE INDEX "payments_work_order_id_idx" ON "public"."payments" USING "btree" ("work_order_id");



CREATE INDEX "payments_work_order_idx" ON "public"."payments" USING "btree" ("work_order_id");



CREATE INDEX "portal_notifications_unread_user_idx" ON "public"."portal_notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "portal_notifications_user_created_idx" ON "public"."portal_notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "portal_notifications_user_wo_kind_uniq" ON "public"."portal_notifications" USING "btree" ("user_id", "work_order_id", "kind") WHERE ("work_order_id" IS NOT NULL);



CREATE INDEX "profiles_org_idx" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "profiles_shop_idx" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "profiles_shop_user_role_idx" ON "public"."profiles" USING "btree" ("shop_id", "user_id", "role");



CREATE UNIQUE INDEX "profiles_username_key" ON "public"."profiles" USING "btree" ("username") WHERE ("username" IS NOT NULL);



CREATE INDEX "shop_boost_intakes_created_at_idx" ON "public"."shop_boost_intakes" USING "btree" ("created_at");



CREATE INDEX "shop_boost_intakes_created_by_idx" ON "public"."shop_boost_intakes" USING "btree" ("created_by");



CREATE INDEX "shop_boost_intakes_shop_id_idx" ON "public"."shop_boost_intakes" USING "btree" ("shop_id");



CREATE INDEX "shop_boost_intakes_status_idx" ON "public"."shop_boost_intakes" USING "btree" ("status");



CREATE INDEX "shop_health_snapshots_created_at_idx" ON "public"."shop_health_snapshots" USING "btree" ("created_at");



CREATE INDEX "shop_health_snapshots_intake_id_idx" ON "public"."shop_health_snapshots" USING "btree" ("intake_id");



CREATE INDEX "shop_health_snapshots_metrics_gin_idx" ON "public"."shop_health_snapshots" USING "gin" ("metrics");



CREATE INDEX "shop_health_snapshots_scores_gin_idx" ON "public"."shop_health_snapshots" USING "gin" ("scores");



CREATE INDEX "shop_health_snapshots_shop_id_idx" ON "public"."shop_health_snapshots" USING "btree" ("shop_id");



CREATE INDEX "shop_hours_shop_weekday_idx" ON "public"."shop_hours" USING "btree" ("shop_id", "weekday");



CREATE INDEX "shop_import_files_intake_id_idx" ON "public"."shop_import_files" USING "btree" ("intake_id");



CREATE INDEX "shop_import_files_kind_idx" ON "public"."shop_import_files" USING "btree" ("kind");



CREATE INDEX "shop_import_files_sha256_idx" ON "public"."shop_import_files" USING "btree" ("sha256");



CREATE INDEX "shop_import_rows_entity_type_idx" ON "public"."shop_import_rows" USING "btree" ("entity_type");



CREATE INDEX "shop_import_rows_file_id_idx" ON "public"."shop_import_rows" USING "btree" ("file_id");



CREATE INDEX "shop_import_rows_intake_id_idx" ON "public"."shop_import_rows" USING "btree" ("intake_id");



CREATE INDEX "shop_import_rows_normalized_gin_idx" ON "public"."shop_import_rows" USING "gin" ("normalized");



CREATE INDEX "shop_import_rows_raw_gin_idx" ON "public"."shop_import_rows" USING "gin" ("raw");



CREATE INDEX "shop_members_shop_role_idx" ON "public"."shop_members" USING "btree" ("shop_id", "role");



CREATE INDEX "shop_members_user_shop_idx" ON "public"."shop_members" USING "btree" ("user_id", "shop_id");



CREATE INDEX "shop_reviews_is_public_created_at_idx" ON "public"."shop_reviews" USING "btree" ("is_public", "created_at" DESC);



CREATE INDEX "shop_time_off_shop_end_idx" ON "public"."shop_time_off" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "shop_time_off_shop_start_idx" ON "public"."shop_time_off" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "shop_vehicle_menu_items_menu_item_idx" ON "public"."shop_vehicle_menu_items" USING "btree" ("menu_item_id");



CREATE INDEX "shop_vehicle_menu_items_shop_idx" ON "public"."shop_vehicle_menu_items" USING "btree" ("shop_id");



CREATE INDEX "shopreel_publications_connection_idx" ON "public"."shopreel_publications" USING "btree" ("connection_id");



CREATE INDEX "shopreel_publications_platform_idx" ON "public"."shopreel_publications" USING "btree" ("platform");



CREATE INDEX "shopreel_publications_scheduled_for_idx" ON "public"."shopreel_publications" USING "btree" ("scheduled_for");



CREATE INDEX "shopreel_publications_shop_idx" ON "public"."shopreel_publications" USING "btree" ("shop_id");



CREATE INDEX "shopreel_publications_status_idx" ON "public"."shopreel_publications" USING "btree" ("status");



CREATE INDEX "shopreel_publications_video_idx" ON "public"."shopreel_publications" USING "btree" ("video_id");



CREATE INDEX "shopreel_social_connections_platform_idx" ON "public"."shopreel_social_connections" USING "btree" ("platform");



CREATE INDEX "shopreel_social_connections_shop_idx" ON "public"."shopreel_social_connections" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "shopreel_social_connections_shop_platform_uidx" ON "public"."shopreel_social_connections" USING "btree" ("shop_id", "platform");



CREATE INDEX "shops_accepts_idx" ON "public"."shops" USING "btree" ("accepts_online_booking");



CREATE INDEX "shops_org_idx" ON "public"."shops" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "shops_slug_key" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_slug_uidx" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_slug_unique_idx" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_stripe_account_id_unique_idx" ON "public"."shops" USING "btree" ("stripe_account_id") WHERE ("stripe_account_id" IS NOT NULL);



CREATE INDEX "shops_timezone_idx" ON "public"."shops" USING "btree" ("timezone");



CREATE INDEX "staff_invite_candidates_created_at_idx" ON "public"."staff_invite_candidates" USING "btree" ("created_at" DESC);



CREATE INDEX "staff_invite_candidates_intake_id_idx" ON "public"."staff_invite_candidates" USING "btree" ("intake_id");



CREATE INDEX "staff_invite_candidates_shop_id_idx" ON "public"."staff_invite_candidates" USING "btree" ("shop_id");



CREATE INDEX "staff_invite_candidates_shop_status_idx" ON "public"."staff_invite_candidates" USING "btree" ("shop_id", "status");



CREATE INDEX "staff_invite_suggestions_intake_id_idx" ON "public"."staff_invite_suggestions" USING "btree" ("intake_id");



CREATE UNIQUE INDEX "staff_invite_suggestions_shop_external_id_uidx" ON "public"."staff_invite_suggestions" USING "btree" ("shop_id", "external_id");



CREATE INDEX "staff_invite_suggestions_shop_id_idx" ON "public"."staff_invite_suggestions" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "stock_locations_shop_code_uq" ON "public"."stock_locations" USING "btree" ("shop_id", "code");



CREATE INDEX "stock_moves_part_loc_idx" ON "public"."stock_moves" USING "btree" ("part_id", "location_id");



CREATE INDEX "stock_moves_shop_part_idx" ON "public"."stock_moves" USING "btree" ("shop_id", "part_id");



CREATE UNIQUE INDEX "suppliers_shop_name_uq" ON "public"."suppliers" USING "btree" ("shop_id", "name");



CREATE INDEX "tech_shifts_status_idx" ON "public"."tech_shifts" USING "btree" ("status");



CREATE UNIQUE INDEX "uniq_customers_user_id_not_null" ON "public"."customers" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_active_punch_per_user" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id") WHERE (("punched_in_at" IS NOT NULL) AND ("punched_out_at" IS NULL));



CREATE UNIQUE INDEX "uq_content_pieces_current_version_not_null" ON "public"."content_pieces" USING "btree" ("content_event_id", "piece_type", "platform", "version_no") WHERE ("platform" IS NOT NULL);



CREATE UNIQUE INDEX "uq_content_pieces_current_version_null" ON "public"."content_pieces" USING "btree" ("content_event_id", "piece_type", "version_no") WHERE ("platform" IS NULL);



CREATE UNIQUE INDEX "uq_cpa_shop_platform_account_not_null" ON "public"."content_platform_accounts" USING "btree" ("shop_id", "platform", "platform_account_id") WHERE ("platform_account_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_cpa_shop_platform_account_null" ON "public"."content_platform_accounts" USING "btree" ("shop_id", "platform") WHERE ("platform_account_id" IS NULL);



CREATE UNIQUE INDEX "uq_inspection_sessions_wol" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE UNIQUE INDEX "uq_inspection_signatures_role" ON "public"."inspection_signatures" USING "btree" ("inspection_id", "role");



CREATE UNIQUE INDEX "uq_inspections_work_order_line_id" ON "public"."inspections" USING "btree" ("work_order_line_id");



CREATE UNIQUE INDEX "uq_pri_line_desc_nullpart" ON "public"."part_request_items" USING "btree" ("work_order_line_id", "lower"(TRIM(BOTH FROM "description"))) WHERE (("part_id" IS NULL) AND ("work_order_line_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_pri_line_part" ON "public"."part_request_items" USING "btree" ("work_order_line_id", "part_id") WHERE (("part_id" IS NOT NULL) AND ("work_order_line_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_saved_menu_items" ON "public"."saved_menu_items" USING "btree" ("make", "model", "year_bucket", "title");



CREATE UNIQUE INDEX "uq_shops_stripe_customer_id" ON "public"."shops" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_shops_stripe_subscription_id" ON "public"."shops" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_stock_moves_consume_part_request_item" ON "public"."stock_moves" USING "btree" ("reference_kind", "reference_id") WHERE (("reason" = 'consume'::"public"."stock_move_reason") AND ("reference_kind" = 'part_request_item'::"text") AND ("reference_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_stock_moves_return_part_request_item" ON "public"."stock_moves" USING "btree" ("reference_kind", "reference_id") WHERE (("reason" = 'return'::"public"."stock_move_reason") AND ("reference_kind" = 'part_request_item'::"text") AND ("reference_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_stock_moves_unreserve_part_request_item" ON "public"."stock_moves" USING "btree" ("reference_kind", "reference_id") WHERE (("reason" = 'wo_release'::"public"."stock_move_reason") AND ("reference_kind" = 'part_request_item'::"text") AND ("reference_id" IS NOT NULL));



CREATE UNIQUE INDEX "ux_fleet_vehicles_vehicle_id" ON "public"."fleet_vehicles" USING "btree" ("vehicle_id");



CREATE INDEX "vehicle_media_shop_id_idx" ON "public"."vehicle_media" USING "btree" ("shop_id");



CREATE INDEX "vehicle_menus_engine_idx" ON "public"."vehicle_menus" USING "btree" ("make", "model", COALESCE("engine_family", ''::"text"), "service_code");



CREATE INDEX "vehicle_menus_lookup_idx" ON "public"."vehicle_menus" USING "btree" ("make", "model", "service_code", "year_from", "year_to");



CREATE UNIQUE INDEX "vehicle_menus_unique_fitment" ON "public"."vehicle_menus" USING "btree" ("make", "model", "year_from", "year_to", COALESCE("engine_family", ''::"text"), "service_code");



CREATE INDEX "vehicle_photos_shop_id_idx" ON "public"."vehicle_photos" USING "btree" ("shop_id");



CREATE INDEX "vehicle_recalls_shop_idx" ON "public"."vehicle_recalls" USING "btree" ("shop_id");



CREATE INDEX "vehicle_recalls_vehicle_idx" ON "public"."vehicle_recalls" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "vehicle_recalls_vin_campaign_idx" ON "public"."vehicle_recalls" USING "btree" ("vin", "campaign_number");



CREATE INDEX "vehicle_recalls_vin_idx" ON "public"."vehicle_recalls" USING "btree" ("vin");



CREATE UNIQUE INDEX "vehicle_signatures_shop_config_uniq" ON "public"."vehicle_signatures" USING "btree" ("shop_id", COALESCE("year", '-1'::integer), COALESCE("lower"(TRIM(BOTH FROM "make")), ''::"text"), COALESCE("lower"(TRIM(BOTH FROM "model")), ''::"text"), COALESCE("lower"(TRIM(BOTH FROM "trim")), ''::"text"), COALESCE("lower"(TRIM(BOTH FROM "engine")), ''::"text"), COALESCE("lower"(TRIM(BOTH FROM "drivetrain")), ''::"text"), COALESCE("lower"(TRIM(BOTH FROM "transmission")), ''::"text"), COALESCE("lower"(TRIM(BOTH FROM "fuel_type")), ''::"text"));



CREATE INDEX "vehicle_signatures_shop_id_idx" ON "public"."vehicle_signatures" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "vehicle_signatures_shop_vehicle_unique" ON "public"."vehicle_signatures" USING "btree" ("shop_id", "vehicle_id");



CREATE INDEX "vehicle_signatures_vehicle_id_idx" ON "public"."vehicle_signatures" USING "btree" ("vehicle_id");



CREATE INDEX "vehicles_customer_id_idx" ON "public"."vehicles" USING "btree" ("customer_id");



CREATE INDEX "vehicles_external_id_idx" ON "public"."vehicles" USING "btree" ("external_id");



CREATE INDEX "vehicles_shop_id_idx" ON "public"."vehicles" USING "btree" ("shop_id");



CREATE INDEX "vehicles_source_intake_id_idx" ON "public"."vehicles" USING "btree" ("source_intake_id");



CREATE INDEX "vehicles_source_row_id_idx" ON "public"."vehicles" USING "btree" ("source_row_id");



CREATE INDEX "vin_decodes_user_id_idx" ON "public"."vin_decodes" USING "btree" ("user_id");



CREATE INDEX "vin_decodes_user_vin_idx" ON "public"."vin_decodes" USING "btree" ("user_id", "vin");



CREATE INDEX "vin_decodes_vin_idx" ON "public"."vin_decodes" USING "btree" ("vin");



CREATE UNIQUE INDEX "vin_decodes_vin_lower_uq" ON "public"."vin_decodes" USING "btree" ("lower"("vin"));



CREATE INDEX "widget_instances_user_id_widget_slug_idx" ON "public"."widget_instances" USING "btree" ("user_id", "widget_slug");



CREATE INDEX "wo_customer_idx" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "wo_part_alloc_unique_source_item" ON "public"."work_order_part_allocations" USING "btree" ("source_request_item_id") WHERE ("source_request_item_id" IS NOT NULL);



CREATE INDEX "wo_status_idx" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "wo_vehicle_idx" ON "public"."work_orders" USING "btree" ("vehicle_id");



CREATE INDEX "wol_assigned_idx" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "wol_by_wo" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "wol_jobtype_idx" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "wol_shop_id_idx" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "wol_status_idx" ON "public"."work_order_lines" USING "btree" ("status");



CREATE INDEX "wol_wo_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "wol_work_order_id_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE UNIQUE INDEX "wopa_line_part_loc_uniq" ON "public"."work_order_part_allocations" USING "btree" ("work_order_line_id", "part_id", "location_id");



CREATE INDEX "wor_created_at_idx" ON "public"."work_order_invoice_reviews" USING "btree" ("created_at" DESC);



CREATE INDEX "wor_shop_id_idx" ON "public"."work_order_invoice_reviews" USING "btree" ("shop_id");



CREATE INDEX "wor_work_order_created_idx" ON "public"."work_order_invoice_reviews" USING "btree" ("work_order_id", "created_at" DESC);



CREATE INDEX "work_order_line_ai_intake_id_idx" ON "public"."work_order_line_ai" USING "btree" ("intake_id");



CREATE INDEX "work_order_line_ai_shop_id_idx" ON "public"."work_order_line_ai" USING "btree" ("shop_id");



CREATE INDEX "work_order_line_ai_work_order_id_idx" ON "public"."work_order_line_ai" USING "btree" ("work_order_id");



CREATE INDEX "work_order_line_ai_work_order_line_id_idx" ON "public"."work_order_line_ai" USING "btree" ("work_order_line_id");



CREATE INDEX "work_order_lines_assigned_to_idx" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "work_order_lines_external_id_idx" ON "public"."work_order_lines" USING "btree" ("external_id");



CREATE INDEX "work_order_lines_intake_json_gin" ON "public"."work_order_lines" USING "gin" ("intake_json");



CREATE INDEX "work_order_lines_intake_status_idx" ON "public"."work_order_lines" USING "btree" ("intake_status");



CREATE INDEX "work_order_lines_menu_item_id_idx" ON "public"."work_order_lines" USING "btree" ("menu_item_id");



CREATE INDEX "work_order_lines_shop_id_idx" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "work_order_lines_source_intake_id_idx" ON "public"."work_order_lines" USING "btree" ("source_intake_id");



CREATE INDEX "work_order_lines_source_row_id_idx" ON "public"."work_order_lines" USING "btree" ("source_row_id");



CREATE INDEX "work_order_lines_voided_at_idx" ON "public"."work_order_lines" USING "btree" ("voided_at");



CREATE INDEX "work_order_lines_work_order_id_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "work_order_part_allocations_location_id_idx" ON "public"."work_order_part_allocations" USING "btree" ("location_id");



CREATE INDEX "work_order_part_allocations_shop_id_idx" ON "public"."work_order_part_allocations" USING "btree" ("shop_id");



CREATE INDEX "work_order_parts_part_id_idx" ON "public"."work_order_parts" USING "btree" ("part_id");



CREATE INDEX "work_order_parts_work_order_id_idx" ON "public"."work_order_parts" USING "btree" ("work_order_id");



CREATE INDEX "work_orders_customer_id_idx" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "work_orders_external_id_idx" ON "public"."work_orders" USING "btree" ("external_id");



CREATE UNIQUE INDEX "work_orders_shop_custom_id_uniq" ON "public"."work_orders" USING "btree" ("shop_id", "custom_id");



CREATE INDEX "work_orders_shop_id_idx" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "work_orders_shop_vehicle_id_idx" ON "public"."work_orders" USING "btree" ("shop_id", "vehicle_id");



CREATE INDEX "work_orders_source_fleet_sr_idx" ON "public"."work_orders" USING "btree" ("source_fleet_service_request_id");



CREATE INDEX "work_orders_source_intake_id_idx" ON "public"."work_orders" USING "btree" ("source_intake_id");



CREATE INDEX "work_orders_source_row_id_idx" ON "public"."work_orders" USING "btree" ("source_row_id");



CREATE OR REPLACE TRIGGER "ai_event_to_training" AFTER INSERT ON "public"."ai_events" FOR EACH ROW EXECUTE FUNCTION "public"."ai_generate_training_row"();



CREATE OR REPLACE TRIGGER "audit_parts_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."parts_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "biu_work_orders_shop_id" BEFORE INSERT OR UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."assign_work_orders_shop_id"();



CREATE OR REPLACE TRIGGER "broadcast_chat_messages_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_chat_messages"();



CREATE OR REPLACE TRIGGER "compute_timecard_hours_biu" BEFORE INSERT OR UPDATE ON "public"."payroll_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."compute_timecard_hours"();



CREATE OR REPLACE TRIGGER "customer_quote_ai_log" AFTER INSERT OR UPDATE ON "public"."customer_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."log_ai_event"('quote_updated');



CREATE OR REPLACE TRIGGER "invoices_compute_totals_biu" BEFORE INSERT OR UPDATE OF "labor_cost", "parts_cost", "tax_total", "discount_total", "status", "issued_at" ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."invoices_compute_totals_biu"();



CREATE OR REPLACE TRIGGER "invoices_sync_work_orders_aiu" AFTER INSERT OR UPDATE OF "labor_cost", "parts_cost", "subtotal", "total" ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."invoices_sync_work_orders_aiu"();



CREATE OR REPLACE TRIGGER "log_fitment_from_consumption" AFTER INSERT ON "public"."stock_moves" FOR EACH ROW EXECUTE FUNCTION "public"."tg_log_part_fitment_event_from_consumption"();



CREATE OR REPLACE TRIGGER "log_part_fitment_event_from_allocation" AFTER INSERT ON "public"."work_order_part_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."tg_log_part_fitment_event_from_allocation"();



CREATE OR REPLACE TRIGGER "messages_broadcast_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."conversation_messages_broadcast_trigger"();



CREATE OR REPLACE TRIGGER "profiles_enforce_shop_user_limit" BEFORE INSERT OR UPDATE OF "shop_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_profiles_enforce_shop_user_limit"();



CREATE OR REPLACE TRIGGER "profiles_recalc_shop_user_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_profiles_recalc_shop_user_count"();



CREATE OR REPLACE TRIGGER "profiles_set_timestamps" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamps"();



CREATE OR REPLACE TRIGGER "set_agent_actions_updated_at" BEFORE UPDATE ON "public"."agent_actions" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_agent_jobs_updated_at" BEFORE UPDATE ON "public"."agent_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_hours_on_payroll_timecards" BEFORE INSERT OR UPDATE ON "public"."payroll_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."payroll_timecards_set_hours"();



CREATE OR REPLACE TRIGGER "set_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_fleet_form_uploads" BEFORE UPDATE ON "public"."fleet_form_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_invoices" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_payroll_timecards" BEFORE UPDATE ON "public"."payroll_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_vehicle_signatures_updated_at" BEFORE UPDATE ON "public"."vehicle_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "shops_set_created_by" BEFORE INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."tg_shops_set_owner_and_creator"();



CREATE OR REPLACE TRIGGER "shops_set_timestamps" BEFORE INSERT OR UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamps"();



CREATE OR REPLACE TRIGGER "tg_work_orders_sync_vehicle_snapshot" BEFORE INSERT OR UPDATE OF "vehicle_id" ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."tg_work_orders_sync_vehicle_snapshot"();



CREATE OR REPLACE TRIGGER "trg_agent_jobs_updated_at" BEFORE UPDATE ON "public"."agent_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agent_requests_updated_at" BEFORE UPDATE ON "public"."agent_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agent_runs_updated_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ai_generation_runs_updated_at" BEFORE UPDATE ON "public"."ai_generation_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assets_updated_at" BEFORE UPDATE ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assign_default_shop" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."assign_default_shop"();



CREATE OR REPLACE TRIGGER "trg_bump_profile_last_active_on_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_profile_last_active_on_message"();



CREATE OR REPLACE TRIGGER "trg_content_assets_updated_at" BEFORE UPDATE ON "public"."content_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_content_events_updated_at" BEFORE UPDATE ON "public"."content_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_content_pieces_updated_at" BEFORE UPDATE ON "public"."content_pieces" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_content_platform_accounts_updated_at" BEFORE UPDATE ON "public"."content_platform_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_content_publications_updated_at" BEFORE UPDATE ON "public"."content_publications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_content_templates_updated_at" BEFORE UPDATE ON "public"."content_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_set_shop_id" BEFORE INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."customers_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_customers_set_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."customers_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fleet_dispatch_assignments_fill_fleet_id" BEFORE INSERT OR UPDATE OF "vehicle_id", "fleet_id" ON "public"."fleet_dispatch_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."fleet_fill_fleet_id"();



CREATE OR REPLACE TRIGGER "trg_fleet_inspection_schedules_fill_fleet_id" BEFORE INSERT OR UPDATE OF "vehicle_id", "fleet_id" ON "public"."fleet_inspection_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."fleet_fill_fleet_id"();



CREATE OR REPLACE TRIGGER "trg_fleet_inspection_schedules_set_next" BEFORE INSERT OR UPDATE OF "last_inspection_date", "interval_days", "next_inspection_date" ON "public"."fleet_inspection_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."fleet_inspection_schedules_set_next"();



CREATE OR REPLACE TRIGGER "trg_fleet_pretrip_reports_fill_fleet_id" BEFORE INSERT OR UPDATE OF "vehicle_id", "fleet_id" ON "public"."fleet_pretrip_reports" FOR EACH ROW EXECUTE FUNCTION "public"."fleet_fill_fleet_id"();



CREATE OR REPLACE TRIGGER "trg_fleet_service_requests_fill_fleet_id" BEFORE INSERT OR UPDATE OF "vehicle_id", "fleet_id" ON "public"."fleet_service_requests" FOR EACH ROW EXECUTE FUNCTION "public"."fleet_fill_fleet_id"();



CREATE OR REPLACE TRIGGER "trg_inspections_set_shop_id" BEFORE INSERT ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."inspections_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_menu_item_parts_defaults" BEFORE INSERT ON "public"."menu_item_parts" FOR EACH ROW EXECUTE FUNCTION "public"."menu_item_parts_set_defaults"();



CREATE OR REPLACE TRIGGER "trg_menu_items_compute_totals" BEFORE INSERT OR UPDATE OF "part_cost", "labor_time", "shop_id" ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."menu_items_compute_totals"();



CREATE OR REPLACE TRIGGER "trg_part_request_items_updated_at" BEFORE UPDATE ON "public"."part_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pqr_notify" AFTER INSERT ON "public"."parts_quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."tg_notify_quote_request"();



CREATE OR REPLACE TRIGGER "trg_pqr_updated" BEFORE UPDATE ON "public"."parts_quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pri_approved_reserve_stock" AFTER UPDATE OF "status" ON "public"."part_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."on_part_request_item_approved_reserve_stock"();



CREATE OR REPLACE TRIGGER "trg_pri_auto_unreserve" AFTER UPDATE OF "status", "qty_reserved" ON "public"."part_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pri_auto_unreserve"();



CREATE OR REPLACE TRIGGER "trg_pri_picked_consume" AFTER UPDATE OF "status" ON "public"."part_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."trg_part_request_item_picked_consume"();



CREATE OR REPLACE TRIGGER "trg_pri_recheck_line_hold" AFTER INSERT OR UPDATE OF "qty_approved", "qty_reserved", "qty_received", "status", "part_id", "work_order_line_id" ON "public"."part_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."on_part_request_items_recheck_line_hold"();



CREATE OR REPLACE TRIGGER "trg_pri_reserved_autopick" AFTER UPDATE OF "status" ON "public"."part_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."on_part_request_item_reserved_autopick"();



CREATE OR REPLACE TRIGGER "trg_profiles_enforce_shop_user_limit_ins" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_shop_user_limit"();



CREATE OR REPLACE TRIGGER "trg_profiles_enforce_shop_user_limit_upd" BEFORE UPDATE OF "shop_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_shop_user_limit"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_punch_events_set_user" BEFORE INSERT ON "public"."punch_events" FOR EACH ROW EXECUTE FUNCTION "public"."punch_events_set_user_from_shift"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_del" AFTER DELETE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_ins" AFTER INSERT ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_upd" AFTER UPDATE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_saved_menu_items_updated" BEFORE UPDATE ON "public"."saved_menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_current_shop_id" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW WHEN (("new"."shop_id" IS NOT NULL)) EXECUTE FUNCTION "public"."set_current_shop_id_from_row"();



CREATE OR REPLACE TRIGGER "trg_set_inspection_template_owner" BEFORE INSERT ON "public"."inspection_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_inspection_template_owner"();



CREATE OR REPLACE TRIGGER "trg_set_message_edited_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_edited_at"();



CREATE OR REPLACE TRIGGER "trg_set_owner_shop_id" AFTER INSERT OR UPDATE OF "owner_id" ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."set_owner_shop_id"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_work_order_quote_lines" BEFORE UPDATE ON "public"."work_order_quote_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_work_order_quote_lines"();



CREATE OR REPLACE TRIGGER "trg_shop_labor_rate_recalc_menu" AFTER UPDATE OF "labor_rate" ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."recalc_menu_items_for_shop"();



CREATE OR REPLACE TRIGGER "trg_shop_profiles_updated_at" BEFORE UPDATE ON "public"."shop_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_shop_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_ratings_updated_at" BEFORE UPDATE ON "public"."shop_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."set_shop_ratings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_reel_settings_updated_at" BEFORE UPDATE ON "public"."shop_reel_settings" FOR EACH ROW EXECUTE FUNCTION "public"."shop_reel_settings_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_reviews_set_updated_at" BEFORE UPDATE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_shop_reviews_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_users_updated_at" BEFORE UPDATE ON "public"."shop_users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shopreel_manual_assets_updated_at" BEFORE UPDATE ON "public"."shopreel_manual_assets" FOR EACH ROW EXECUTE FUNCTION "public"."shopreel_manual_assets_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shopreel_publications_updated_at" BEFORE UPDATE ON "public"."shopreel_publications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_shopreel_publish_jobs_updated_at" BEFORE UPDATE ON "public"."shopreel_publish_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shopreel_social_connections_updated_at" BEFORE UPDATE ON "public"."shopreel_social_connections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_shops_updated_at" BEFORE UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_staff_invite_candidates_updated_at" BEFORE UPDATE ON "public"."staff_invite_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_stock_moves_apply_snapshot" AFTER INSERT ON "public"."stock_moves" FOR EACH ROW EXECUTE FUNCTION "public"."apply_stock_move_to_snapshot"();



CREATE OR REPLACE TRIGGER "trg_sync_inspections_from_sessions" AFTER INSERT OR UPDATE OF "state", "updated_at", "status" ON "public"."inspection_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_inspections_from_inspection_sessions"();



CREATE OR REPLACE TRIGGER "trg_sync_invoice_from_work_order" AFTER INSERT OR UPDATE OF "status" ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_invoice_from_work_order"();



CREATE OR REPLACE TRIGGER "trg_sync_profiles_user_id" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profiles_user_id"();



CREATE OR REPLACE TRIGGER "trg_sync_work_order_line_assignee" BEFORE INSERT OR UPDATE OF "assigned_to", "assigned_tech_id" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."sync_work_order_line_assignee"();



CREATE OR REPLACE TRIGGER "trg_tech_sessions_guard" BEFORE INSERT OR UPDATE ON "public"."tech_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_tech_sessions_guard"();



CREATE OR REPLACE TRIGGER "trg_vehicle_shop_match" BEFORE INSERT OR UPDATE OF "shop_id", "customer_id" ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_vehicle_shop_matches_customer"();



CREATE OR REPLACE TRIGGER "trg_video_metrics_updated_at" BEFORE UPDATE ON "public"."video_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_video_platform_posts_updated_at" BEFORE UPDATE ON "public"."video_platform_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_videos_updated_at" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wol_assign_line_no" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_assign_line_no"();



CREATE OR REPLACE TRIGGER "trg_wol_autocreate_inspection_ins" AFTER INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_inspection_session_for_line"();



CREATE OR REPLACE TRIGGER "trg_wol_autocreate_inspection_upd" AFTER UPDATE OF "job_type", "inspection_template_id" ON "public"."work_order_lines" FOR EACH ROW WHEN (("new"."inspection_session_id" IS NULL)) EXECUTE FUNCTION "public"."ensure_inspection_session_for_line"();



CREATE OR REPLACE TRIGGER "trg_wol_backfill_template_from_menu" BEFORE INSERT OR UPDATE OF "menu_item_id" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_backfill_template_from_menu"();



CREATE OR REPLACE TRIGGER "trg_wol_copy_menu_parts" AFTER INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_copy_menu_parts_to_work_order_parts"();



CREATE OR REPLACE TRIGGER "trg_wol_create_inspection_session_before" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_create_inspection_session_before"();



CREATE OR REPLACE TRIGGER "trg_wol_delete_staged_parts" AFTER DELETE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_delete_staged_parts_on_delete"();



CREATE OR REPLACE TRIGGER "trg_wol_link_inspection_session_after" AFTER INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_link_inspection_session_after"();



CREATE OR REPLACE TRIGGER "trg_wol_refresh_staged_parts" AFTER UPDATE OF "menu_item_id" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_refresh_staged_parts_on_update"();



CREATE OR REPLACE TRIGGER "trg_wol_set_quoted_at" BEFORE UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_quoted_at"();



CREATE OR REPLACE TRIGGER "trg_wol_status_refresh" AFTER INSERT OR UPDATE OF "status", "punched_in_at", "punched_out_at" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_work_order_status"();



CREATE OR REPLACE TRIGGER "trg_wol_status_refresh_del" AFTER DELETE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_work_order_status_del"();



CREATE OR REPLACE TRIGGER "trg_wol_sync_assigned_to" BEFORE INSERT OR UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wol_sync_assigned_to"();



CREATE OR REPLACE TRIGGER "trg_wopa_sync_work_order_id" BEFORE INSERT OR UPDATE OF "work_order_line_id" ON "public"."work_order_part_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."wopa_sync_work_order_id"();



CREATE OR REPLACE TRIGGER "trg_work_order_line_active_create_parts" AFTER UPDATE OF "status" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."on_work_order_line_became_active_create_parts"();



CREATE OR REPLACE TRIGGER "trg_work_order_lines_active_parts_flow" AFTER UPDATE OF "status" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."on_work_order_line_active_parts_flow"();



CREATE OR REPLACE TRIGGER "trg_work_order_lines_log_ai" AFTER INSERT OR DELETE OR UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."log_ai_event"();



CREATE OR REPLACE TRIGGER "trg_work_order_lines_set_shop_id" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."work_order_lines_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_work_order_lines_updated_at" BEFORE INSERT OR UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_work_orders_set_shop_id" BEFORE INSERT ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."work_orders_set_shop_id"();



CREATE OR REPLACE TRIGGER "wo_ai_log" AFTER INSERT OR UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_ai_event"('work_order_updated');



CREATE OR REPLACE TRIGGER "wo_alloc_recompute_invoice_aiu" AFTER INSERT OR DELETE OR UPDATE OF "qty", "unit_cost", "work_order_id" ON "public"."work_order_part_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."wo_alloc_recompute_invoice_aiu"();



CREATE OR REPLACE TRIGGER "wol_recompute_invoice_aiu" AFTER INSERT OR DELETE OR UPDATE OF "labor_time" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_recompute_invoice_aiu"();



CREATE OR REPLACE TRIGGER "wor_shop_consistency_trg" BEFORE INSERT ON "public"."work_order_invoice_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."wor_enforce_shop_consistency"();



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_attachments"
    ADD CONSTRAINT "agent_attachments_agent_request_id_fkey" FOREIGN KEY ("agent_request_id") REFERENCES "public"."agent_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_attachments"
    ADD CONSTRAINT "agent_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_job_events"
    ADD CONSTRAINT "agent_job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."agent_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_knowledge"
    ADD CONSTRAINT "agent_knowledge_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agent_requests"
    ADD CONSTRAINT "agent_requests_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_requests"
    ADD CONSTRAINT "agent_requests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id");



ALTER TABLE ONLY "public"."agent_requests"
    ADD CONSTRAINT "agent_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_events"
    ADD CONSTRAINT "ai_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_events"
    ADD CONSTRAINT "ai_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_runs"
    ADD CONSTRAINT "ai_generation_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_runs"
    ADD CONSTRAINT "ai_generation_runs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generation_runs"
    ADD CONSTRAINT "ai_generation_runs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."content_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_runs"
    ADD CONSTRAINT "ai_generation_runs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_training_data"
    ADD CONSTRAINT "ai_training_data_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_training_data"
    ADD CONSTRAINT "ai_training_data_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "public"."ai_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_training_events"
    ADD CONSTRAINT "ai_training_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_analytics_events"
    ADD CONSTRAINT "content_analytics_events_content_event_id_fkey" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_analytics_events"
    ADD CONSTRAINT "content_analytics_events_content_piece_id_fkey" FOREIGN KEY ("content_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_analytics_events"
    ADD CONSTRAINT "content_analytics_events_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "public"."content_publications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_analytics_events"
    ADD CONSTRAINT "content_analytics_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_assets"
    ADD CONSTRAINT "content_assets_content_event_id_fkey" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_assets"
    ADD CONSTRAINT "content_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_assets"
    ADD CONSTRAINT "content_assets_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_calendar_items"
    ADD CONSTRAINT "content_calendar_items_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."content_calendars"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_events"
    ADD CONSTRAINT "content_events_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_pieces"
    ADD CONSTRAINT "content_pieces_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_pieces"
    ADD CONSTRAINT "content_pieces_content_event_id_fkey" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_pieces"
    ADD CONSTRAINT "content_pieces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_pieces"
    ADD CONSTRAINT "content_pieces_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_platform_accounts"
    ADD CONSTRAINT "content_platform_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_platform_accounts"
    ADD CONSTRAINT "content_platform_accounts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_content_event_id_fkey" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_content_piece_id_fkey" FOREIGN KEY ("content_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "public"."content_platform_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_templates"
    ADD CONSTRAINT "content_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_templates"
    ADD CONSTRAINT "content_templates_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_portal_invites"
    ADD CONSTRAINT "customer_portal_invites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_quotes"
    ADD CONSTRAINT "customer_quotes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_settings"
    ADD CONSTRAINT "customer_settings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") NOT VALID;



ALTER TABLE ONLY "public"."cvip_thresholds_master"
    ADD CONSTRAINT "cvip_thresholds_master_spec_id_fkey" FOREIGN KEY ("spec_id") REFERENCES "public"."cvip_specs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cvip_thresholds"
    ADD CONSTRAINT "cvip_thresholds_spec_code_fkey" FOREIGN KEY ("spec_code") REFERENCES "public"."cvip_specs"("spec_code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."decoded_vins"
    ADD CONSTRAINT "decoded_vins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defective_parts"
    ADD CONSTRAINT "defective_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id");



ALTER TABLE ONLY "public"."demo_shop_boost_leads"
    ADD CONSTRAINT "demo_shop_boost_leads_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "public"."demo_shop_boosts"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."demo_shop_boosts"
    ADD CONSTRAINT "demo_shop_boosts_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."demo_shop_boosts"
    ADD CONSTRAINT "demo_shop_boosts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."dtc_logs"
    ADD CONSTRAINT "dtc_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feature_reads"
    ADD CONSTRAINT "feature_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "fk_wol_inspection_session" FOREIGN KEY ("inspection_session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE SET NULL DEFERRABLE;



ALTER TABLE ONLY "public"."fleet_dispatch_assignments"
    ADD CONSTRAINT "fleet_dispatch_assignments_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_dispatch_assignments"
    ADD CONSTRAINT "fleet_dispatch_assignments_fleet_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_dispatch_assignments"
    ADD CONSTRAINT "fleet_dispatch_assignments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_dispatch_assignments"
    ADD CONSTRAINT "fleet_dispatch_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_form_uploads"
    ADD CONSTRAINT "fleet_form_uploads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_inspection_schedules"
    ADD CONSTRAINT "fleet_inspection_schedules_fleet_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_inspection_schedules"
    ADD CONSTRAINT "fleet_inspection_schedules_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_inspection_schedules"
    ADD CONSTRAINT "fleet_inspection_schedules_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_members"
    ADD CONSTRAINT "fleet_members_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_members"
    ADD CONSTRAINT "fleet_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_pretrip_reports"
    ADD CONSTRAINT "fleet_pretrip_reports_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_pretrip_reports"
    ADD CONSTRAINT "fleet_pretrip_reports_fleet_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_pretrip_reports"
    ADD CONSTRAINT "fleet_pretrip_reports_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_pretrip_reports"
    ADD CONSTRAINT "fleet_pretrip_reports_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_program_tasks"
    ADD CONSTRAINT "fleet_program_tasks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."fleet_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_programs"
    ADD CONSTRAINT "fleet_programs_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_fleet_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_source_pretrip_id_fkey" FOREIGN KEY ("source_pretrip_id") REFERENCES "public"."fleet_pretrip_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_vehicle_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_service_requests"
    ADD CONSTRAINT "fleet_service_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_vehicles"
    ADD CONSTRAINT "fleet_vehicles_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_vehicles"
    ADD CONSTRAINT "fleet_vehicles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."fleet_vehicles"
    ADD CONSTRAINT "fleet_vehicles_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleets"
    ADD CONSTRAINT "fleets_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."followups"
    ADD CONSTRAINT "followups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."history"
    ADD CONSTRAINT "history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."history"
    ADD CONSTRAINT "history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history"
    ADD CONSTRAINT "history_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_photos"
    ADD CONSTRAINT "inspection_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inspection_result_items"
    ADD CONSTRAINT "inspection_result_items_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "public"."inspection_results"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_results"
    ADD CONSTRAINT "inspection_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_session_payloads"
    ADD CONSTRAINT "inspection_session_payloads_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_work_order_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_work_order_line_fk" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_signatures"
    ADD CONSTRAINT "inspection_signatures_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_template_suggestions"
    ADD CONSTRAINT "inspection_template_suggestions_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_template_suggestions"
    ADD CONSTRAINT "inspection_template_suggestions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_templates"
    ADD CONSTRAINT "inspection_templates_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."inspection_templates"
    ADD CONSTRAINT "inspection_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_vehicle_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_work_order_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "inspections_work_order_fk" ON "public"."inspections" IS 'Inspection may outlive its work order; work_order_id is nullable and SET NULL on delete for compliance history.';



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_work_order_line_fk" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."integration_logs"
    ADD CONSTRAINT "integration_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_documents"
    ADD CONSTRAINT "invoice_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invoice_documents"
    ADD CONSTRAINT "invoice_documents_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_documents"
    ADD CONSTRAINT "invoice_documents_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_tech_id_fkey" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_video_platform_post_id_fkey" FOREIGN KEY ("video_platform_post_id") REFERENCES "public"."video_platform_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_feedback"
    ADD CONSTRAINT "learning_feedback_ai_generation_run_id_fkey" FOREIGN KEY ("ai_generation_run_id") REFERENCES "public"."ai_generation_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_feedback"
    ADD CONSTRAINT "learning_feedback_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_feedback"
    ADD CONSTRAINT "learning_feedback_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_feedback"
    ADD CONSTRAINT "learning_feedback_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_rules"
    ADD CONSTRAINT "maintenance_rules_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "public"."maintenance_services"("code");



ALTER TABLE ONLY "public"."maintenance_suggestions"
    ADD CONSTRAINT "maintenance_suggestions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."maintenance_suggestions"
    ADD CONSTRAINT "maintenance_suggestions_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_uploads"
    ADD CONSTRAINT "media_uploads_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."menu_item_suggestions"
    ADD CONSTRAINT "menu_item_suggestions_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_suggestions"
    ADD CONSTRAINT "menu_item_suggestions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_inspection_template_id_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_pricing"
    ADD CONSTRAINT "menu_pricing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_fkey" FOREIGN KEY ("reply_to") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_profile_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_barcodes"
    ADD CONSTRAINT "part_barcodes_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_compatibility"
    ADD CONSTRAINT "part_compatibility_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."work_order_part_allocations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_vehicle_signature_id_fkey" FOREIGN KEY ("vehicle_signature_id") REFERENCES "public"."vehicle_signatures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_fitment_events"
    ADD CONSTRAINT "part_fitment_events_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_purchases"
    ADD CONSTRAINT "part_purchases_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_purchases"
    ADD CONSTRAINT "part_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."part_suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_location_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."part_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_request_lines"
    ADD CONSTRAINT "part_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."part_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_request_lines"
    ADD CONSTRAINT "part_request_lines_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_requests"
    ADD CONSTRAINT "part_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_returns"
    ADD CONSTRAINT "part_returns_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_warranties"
    ADD CONSTRAINT "part_warranties_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_barcodes"
    ADD CONSTRAINT "parts_barcodes_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_barcodes"
    ADD CONSTRAINT "parts_barcodes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."parts_messages"
    ADD CONSTRAINT "parts_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."parts_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_quote_requests"
    ADD CONSTRAINT "parts_quote_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_quote_requests"
    ADD CONSTRAINT "parts_quote_requests_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_quotes"
    ADD CONSTRAINT "parts_quotes_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_request_messages"
    ADD CONSTRAINT "parts_request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."parts_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_requests"
    ADD CONSTRAINT "parts_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."work_order_lines"("id");



ALTER TABLE ONLY "public"."parts_requests"
    ADD CONSTRAINT "parts_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."parts_suppliers"
    ADD CONSTRAINT "parts_suppliers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payroll_deductions"
    ADD CONSTRAINT "payroll_deductions_timecard_id_fkey" FOREIGN KEY ("timecard_id") REFERENCES "public"."payroll_timecards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_export_log"
    ADD CONSTRAINT "payroll_export_log_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "public"."payroll_pay_periods"("id");



ALTER TABLE ONLY "public"."payroll_export_log"
    ADD CONSTRAINT "payroll_export_log_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."payroll_providers"("id");



ALTER TABLE ONLY "public"."payroll_pay_periods"
    ADD CONSTRAINT "payroll_pay_periods_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_providers"
    ADD CONSTRAINT "payroll_providers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_timecards"
    ADD CONSTRAINT "payroll_timecards_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."payroll_timecards"
    ADD CONSTRAINT "payroll_timecards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_events"
    ADD CONSTRAINT "planner_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."planner_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_notifications"
    ADD CONSTRAINT "portal_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portal_notifications"
    ADD CONSTRAINT "portal_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_notifications"
    ADD CONSTRAINT "portal_notifications_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."punch_events"
    ADD CONSTRAINT "punch_events_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."tech_shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."punch_events"
    ADD CONSTRAINT "punch_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."tech_shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."punch_events"
    ADD CONSTRAINT "punch_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."punch_events"
    ADD CONSTRAINT "punch_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."quote_lines"
    ADD CONSTRAINT "quote_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quote_lines"
    ADD CONSTRAINT "quote_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_plans"
    ADD CONSTRAINT "reel_plans_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_render_jobs"
    ADD CONSTRAINT "reel_render_jobs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_ai_profiles"
    ADD CONSTRAINT "shop_ai_profiles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."shop_boost_intakes"
    ADD CONSTRAINT "shop_boost_intakes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_health_snapshots"
    ADD CONSTRAINT "shop_health_snapshots_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_health_snapshots"
    ADD CONSTRAINT "shop_health_snapshots_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_hours"
    ADD CONSTRAINT "shop_hours_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_import_files"
    ADD CONSTRAINT "shop_import_files_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_import_rows"
    ADD CONSTRAINT "shop_import_rows_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."shop_import_files"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_import_rows"
    ADD CONSTRAINT "shop_import_rows_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_members"
    ADD CONSTRAINT "shop_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_members"
    ADD CONSTRAINT "shop_members_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_members"
    ADD CONSTRAINT "shop_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_parts"
    ADD CONSTRAINT "shop_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_reel_settings"
    ADD CONSTRAINT "shop_reel_settings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_reviews"
    ADD CONSTRAINT "shop_reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_schedules"
    ADD CONSTRAINT "shop_schedules_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "public"."customer_bookings"("id");



ALTER TABLE ONLY "public"."shop_settings"
    ADD CONSTRAINT "shop_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_tax_overrides"
    ADD CONSTRAINT "shop_tax_overrides_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_tax_overrides"
    ADD CONSTRAINT "shop_tax_overrides_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id");



ALTER TABLE ONLY "public"."shop_time_off"
    ADD CONSTRAINT "shop_time_off_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_users"
    ADD CONSTRAINT "shop_users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_users"
    ADD CONSTRAINT "shop_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_vehicle_menu_items"
    ADD CONSTRAINT "shop_vehicle_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_vehicle_menu_items"
    ADD CONSTRAINT "shop_vehicle_menu_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_vehicle_menu_items"
    ADD CONSTRAINT "shop_vehicle_menu_items_vehicle_menu_id_fkey" FOREIGN KEY ("vehicle_menu_id") REFERENCES "public"."vehicle_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopreel_manual_asset_files"
    ADD CONSTRAINT "shopreel_manual_asset_files_manual_asset_id_fkey" FOREIGN KEY ("manual_asset_id") REFERENCES "public"."shopreel_manual_assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopreel_manual_asset_files"
    ADD CONSTRAINT "shopreel_manual_asset_files_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopreel_manual_assets"
    ADD CONSTRAINT "shopreel_manual_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopreel_manual_assets"
    ADD CONSTRAINT "shopreel_manual_assets_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopreel_publications"
    ADD CONSTRAINT "shopreel_publications_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."shopreel_social_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopreel_publications"
    ADD CONSTRAINT "shopreel_publications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopreel_publications"
    ADD CONSTRAINT "shopreel_publications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopreel_publications"
    ADD CONSTRAINT "shopreel_publications_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopreel_publish_jobs"
    ADD CONSTRAINT "shopreel_publish_jobs_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "public"."content_publications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopreel_publish_jobs"
    ADD CONSTRAINT "shopreel_publish_jobs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_default_stock_location_id_fkey" FOREIGN KEY ("default_stock_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_invite_candidates"
    ADD CONSTRAINT "staff_invite_candidates_created_profile_id_fkey" FOREIGN KEY ("created_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_invite_candidates"
    ADD CONSTRAINT "staff_invite_candidates_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_invite_candidates"
    ADD CONSTRAINT "staff_invite_candidates_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invite_suggestions"
    ADD CONSTRAINT "staff_invite_suggestions_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_invite_suggestions"
    ADD CONSTRAINT "staff_invite_suggestions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_moves"
    ADD CONSTRAINT "stock_moves_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id");



ALTER TABLE ONLY "public"."stock_moves"
    ADD CONSTRAINT "stock_moves_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_moves"
    ADD CONSTRAINT "stock_moves_shop_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_catalog_items"
    ADD CONSTRAINT "supplier_catalog_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."parts_suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_orders"
    ADD CONSTRAINT "supplier_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."supplier_orders"
    ADD CONSTRAINT "supplier_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."parts_suppliers"("id");



ALTER TABLE ONLY "public"."supplier_orders"
    ADD CONSTRAINT "supplier_orders_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."supplier_catalog_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tax_calculation_log"
    ADD CONSTRAINT "tax_calculation_log_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."tax_jurisdictions"("id");



ALTER TABLE ONLY "public"."tax_calculation_log"
    ADD CONSTRAINT "tax_calculation_log_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."customer_quotes"("id");



ALTER TABLE ONLY "public"."tax_calculation_log"
    ADD CONSTRAINT "tax_calculation_log_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tax_calculation_log"
    ADD CONSTRAINT "tax_calculation_log_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."tax_providers"
    ADD CONSTRAINT "tax_providers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."tax_jurisdictions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."tech_shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_shop_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_wol_fk" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_shifts"
    ADD CONSTRAINT "tech_shifts_shop_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_shifts"
    ADD CONSTRAINT "tech_shifts_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tech_shifts"
    ADD CONSTRAINT "tech_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_app_layouts"
    ADD CONSTRAINT "user_app_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_widget_layouts"
    ADD CONSTRAINT "user_widget_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_media"
    ADD CONSTRAINT "vehicle_media_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_media"
    ADD CONSTRAINT "vehicle_media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."vehicle_media"
    ADD CONSTRAINT "vehicle_media_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_menus"
    ADD CONSTRAINT "vehicle_menus_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "public"."maintenance_services"("code");



ALTER TABLE ONLY "public"."vehicle_photos"
    ADD CONSTRAINT "vehicle_photos_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_photos"
    ADD CONSTRAINT "vehicle_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_photos"
    ADD CONSTRAINT "vehicle_photos_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_recalls"
    ADD CONSTRAINT "vehicle_recalls_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_recalls"
    ADD CONSTRAINT "vehicle_recalls_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_signatures"
    ADD CONSTRAINT "vehicle_signatures_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_signatures"
    ADD CONSTRAINT "vehicle_signatures_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_metrics"
    ADD CONSTRAINT "video_metrics_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_metrics"
    ADD CONSTRAINT "video_metrics_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_metrics"
    ADD CONSTRAINT "video_metrics_video_platform_post_id_fkey" FOREIGN KEY ("video_platform_post_id") REFERENCES "public"."video_platform_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_platform_posts"
    ADD CONSTRAINT "video_platform_posts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_platform_posts"
    ADD CONSTRAINT "video_platform_posts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_publications"
    ADD CONSTRAINT "video_publications_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."content_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vin_decodes"
    ADD CONSTRAINT "vin_decodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."viral_hook_tests"
    ADD CONSTRAINT "viral_hook_tests_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warranties"
    ADD CONSTRAINT "warranties_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warranty_claims"
    ADD CONSTRAINT "warranty_claims_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "public"."warranties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."widget_instances"
    ADD CONSTRAINT "widget_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."widget_instances"
    ADD CONSTRAINT "widget_instances_widget_slug_fkey" FOREIGN KEY ("widget_slug") REFERENCES "public"."widgets"("slug") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "wopa_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_quote_lines"
    ADD CONSTRAINT "woql_shop_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."work_order_approvals"
    ADD CONSTRAINT "work_order_approvals_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_invoice_reviews"
    ADD CONSTRAINT "work_order_invoice_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_order_invoice_reviews"
    ADD CONSTRAINT "work_order_invoice_reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_invoice_reviews"
    ADD CONSTRAINT "work_order_invoice_reviews_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_line_ai"
    ADD CONSTRAINT "work_order_line_ai_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."shop_boost_intakes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_line_ai"
    ADD CONSTRAINT "work_order_line_ai_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_line_ai"
    ADD CONSTRAINT "work_order_line_ai_work_order_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_line_ai"
    ADD CONSTRAINT "work_order_line_ai_work_order_line_fk" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_line_history"
    ADD CONSTRAINT "work_order_line_history_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_line_history"
    ADD CONSTRAINT "work_order_line_history_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_line_technicians"
    ADD CONSTRAINT "work_order_line_technicians_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."work_order_line_technicians"
    ADD CONSTRAINT "work_order_line_technicians_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_order_line_technicians"
    ADD CONSTRAINT "work_order_line_technicians_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_assigned_tech_id_fkey" FOREIGN KEY ("assigned_tech_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_inspection_session_fk" FOREIGN KEY ("inspection_session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_inspection_session_id_fkey" FOREIGN KEY ("inspection_session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_inspection_template_id_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "public"."inspection_templates"("id");



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_media"
    ADD CONSTRAINT "work_order_media_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_media"
    ADD CONSTRAINT "work_order_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_order_media"
    ADD CONSTRAINT "work_order_media_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id");



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id");



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_shop_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_source_request_item_id_fkey" FOREIGN KEY ("source_request_item_id") REFERENCES "public"."part_request_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_stock_move_id_fkey" FOREIGN KEY ("stock_move_id") REFERENCES "public"."stock_moves"("id");



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id");



ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_quote_lines"
    ADD CONSTRAINT "work_order_quote_lines_suggested_by_fkey" FOREIGN KEY ("suggested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_order_quote_lines"
    ADD CONSTRAINT "work_order_quote_lines_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."work_order_quote_lines"
    ADD CONSTRAINT "work_order_quote_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_quote_lines"
    ADD CONSTRAINT "work_order_quote_lines_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_assigned_tech_fkey" FOREIGN KEY ("assigned_tech") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_customer_approved_by_fkey" FOREIGN KEY ("customer_approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_source_fleet_program_id_fkey" FOREIGN KEY ("source_fleet_program_id") REFERENCES "public"."fleet_programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_source_fleet_service_request_id_fkey" FOREIGN KEY ("source_fleet_service_request_id") REFERENCES "public"."fleet_service_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



CREATE POLICY "Fleet SR creatable by management" ON "public"."fleet_service_requests" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE (("profiles"."shop_id" = "fleet_service_requests"."shop_id") AND ("profiles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "Fleet SR visible in shop" ON "public"."fleet_service_requests" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."shop_id" = "fleet_service_requests"."shop_id"))));



CREATE POLICY "Fleet dispatch creatable by management" ON "public"."fleet_dispatch_assignments" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE (("profiles"."shop_id" = "fleet_dispatch_assignments"."shop_id") AND ("profiles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "Fleet dispatch visible in shop" ON "public"."fleet_dispatch_assignments" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."shop_id" = "fleet_dispatch_assignments"."shop_id"))));



CREATE POLICY "Fleet dispatch visible to driver" ON "public"."fleet_dispatch_assignments" FOR SELECT TO "authenticated" USING (("driver_profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Fleet pretrips are visible inside shop" ON "public"."fleet_pretrip_reports" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."shop_id" = "fleet_pretrip_reports"."shop_id"))));



CREATE POLICY "Fleet pretrips can be created by shop members" ON "public"."fleet_pretrip_reports" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."shop_id" = "fleet_pretrip_reports"."shop_id"))));



CREATE POLICY "Managers can reply or publish reviews" ON "public"."shop_reviews" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_reviews"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_reviews"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Public can read published reviews" ON "public"."shop_reviews" FOR SELECT TO "authenticated", "anon" USING (("is_public" = true));



CREATE POLICY "Shop members can create shop reviews" ON "public"."shop_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("reviewer_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_reviews"."shop_id"))))));



CREATE POLICY "Shop members can read shop reviews" ON "public"."shop_reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_reviews"."shop_id")))));



CREATE POLICY "Users can insert their own WO media" ON "public"."work_order_media" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_actions_deny_all" ON "public"."agent_actions" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."agent_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_attachments_delete_own_submitted" ON "public"."agent_attachments" FOR DELETE TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."agent_requests" "r"
  WHERE (("r"."id" = "agent_attachments"."agent_request_id") AND ("r"."status" = 'submitted'::"public"."agent_request_status"))))));



CREATE POLICY "agent_attachments_insert" ON "public"."agent_attachments" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."agent_requests" "ar"
  WHERE (("ar"."id" = "agent_attachments"."agent_request_id") AND ("ar"."shop_id" = ( SELECT "profiles"."shop_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))))));



CREATE POLICY "agent_attachments_insert_own" ON "public"."agent_attachments" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_attachments_select" ON "public"."agent_attachments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_requests" "ar"
  WHERE (("ar"."id" = "agent_attachments"."agent_request_id") AND ("ar"."shop_id" = ( SELECT "profiles"."shop_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))));



CREATE POLICY "agent_attachments_select_own_or_approvers" ON "public"."agent_attachments" FOR SELECT TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))));



ALTER TABLE "public"."agent_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_events_insert" ON "public"."agent_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("r"."id" = "agent_events"."run_id") AND ("r"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "r"."shop_id")))));



CREATE POLICY "agent_events_insert_own_via_run" ON "public"."agent_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent_runs" "r"
  WHERE (("r"."id" = "agent_events"."run_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "agent_events_insert_owner" ON "public"."agent_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent_runs" "r"
  WHERE (("r"."id" = "agent_events"."run_id") AND ("r"."shop_id" = ( SELECT "profiles"."shop_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "agent_events_select" ON "public"."agent_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("r"."id" = "agent_events"."run_id") AND ("p"."shop_id" = "r"."shop_id")))));



CREATE POLICY "agent_events_select_by_run_access" ON "public"."agent_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_runs" "r"
  WHERE (("r"."id" = "agent_events"."run_id") AND (("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'developer'::"text")))))))));



CREATE POLICY "agent_events_select_via_run_user" ON "public"."agent_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_runs" "r"
  WHERE (("r"."id" = "agent_events"."run_id") AND (("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text")))))))));



ALTER TABLE "public"."agent_job_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_knowledge" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_knowledge_select_by_shop" ON "public"."agent_knowledge" FOR SELECT TO "authenticated" USING ((("shop_id" IS NULL) OR ("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "agent_knowledge_upsert_approvers" ON "public"."agent_knowledge" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



ALTER TABLE "public"."agent_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_messages_deny_all" ON "public"."agent_messages" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."agent_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_requests_delete_shop" ON "public"."agent_requests" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "agent_requests_insert" ON "public"."agent_requests" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "agent_requests_insert_own" ON "public"."agent_requests" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "reporter_id"));



CREATE POLICY "agent_requests_insert_shop" ON "public"."agent_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "agent_requests_select" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING (("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agent_requests_select_own" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING (("reporter_id" = "auth"."uid"()));



CREATE POLICY "agent_requests_select_own_or_approvers" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING ((("reporter_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text"))))));



CREATE POLICY "agent_requests_select_shop" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "agent_requests_select_shop_admins" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_requests"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'advisor'::"text", 'admin'::"text"]))))));



CREATE POLICY "agent_requests_update_own_submitted" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "reporter_id") AND ("status" = 'submitted'::"public"."agent_request_status"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "reporter_id") AND ("status" = 'submitted'::"public"."agent_request_status")));



CREATE POLICY "agent_requests_update_reporter_or_dev" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("reporter_id" = "auth"."uid"()) OR "public"."is_agent_developer"()))) WITH CHECK ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("reporter_id" = "auth"."uid"()) OR "public"."is_agent_developer"())));



CREATE POLICY "agent_requests_update_shop" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_runs_delete_shop" ON "public"."agent_runs" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "agent_runs_insert" ON "public"."agent_runs" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id"))))));



CREATE POLICY "agent_runs_insert_self" ON "public"."agent_runs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_runs_insert_shop" ON "public"."agent_runs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "agent_runs_select" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id")))));



CREATE POLICY "agent_runs_select_self_or_approvers" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text"))))));



CREATE POLICY "agent_runs_select_self_or_developer" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'developer'::"text"))))));



CREATE POLICY "agent_runs_select_shop" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "agent_runs_update" ON "public"."agent_runs" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id")))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id"))))));



CREATE POLICY "agent_runs_update_owner_or_dev" ON "public"."agent_runs" FOR UPDATE TO "authenticated" USING ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR "public"."is_agent_developer"()))) WITH CHECK ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR "public"."is_agent_developer"())));



CREATE POLICY "agent_runs_update_shop" ON "public"."agent_runs" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."ai_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_events_delete_none" ON "public"."ai_events" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "ai_events_insert_in_shop" ON "public"."ai_events" FOR INSERT TO "authenticated" WITH CHECK ((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"())));



CREATE POLICY "ai_events_select_in_shop" ON "public"."ai_events" FOR SELECT TO "authenticated" USING ((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"())));



CREATE POLICY "ai_events_update_none" ON "public"."ai_events" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."ai_generation_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_generation_runs_all_member" ON "public"."ai_generation_runs" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."ai_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_requests_insert_own" ON "public"."ai_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "ai_requests_rw_scoped" ON "public"."ai_requests" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "ai_requests"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "ai_requests"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id")))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "ai_requests"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "ai_requests"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id"))))));



CREATE POLICY "ai_requests_select_via_entities" ON "public"."ai_requests" FOR SELECT TO "authenticated" USING (((("work_order_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "ai_requests"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) OR (("vehicle_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "ai_requests"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id"))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "ai_requests_update_own" ON "public"."ai_requests" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."ai_training_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_training_data_service_only" ON "public"."ai_training_data" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ai_training_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_training_events_rw_shop" ON "public"."ai_training_events" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "allow insert part requests for self" ON "public"."part_requests" FOR INSERT TO "authenticated" WITH CHECK (("requested_by" = "auth"."uid"()));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "api_keys__own_all" ON "public"."api_keys" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "apps__read" ON "public"."apps" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assets_all_member" ON "public"."assets" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



CREATE POLICY "assigned_tech_can_punch" ON "public"."work_order_lines" FOR UPDATE TO "authenticated" USING (("assigned_tech_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("assigned_tech_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_owner_select" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "bookings_owner_write" ON "public"."bookings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "bookings_staff_select" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "bookings_staff_write" ON "public"."bookings" TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_participants__delete_creator" ON "public"."chat_participants" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."chats" "c"
     JOIN "public"."profiles" "p" ON (("p"."id" = "c"."created_by")))
  WHERE (("c"."id" = "chat_participants"."chat_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chat_participants__insert_creator" ON "public"."chat_participants" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."chats" "c"
     JOIN "public"."profiles" "p" ON (("p"."id" = "c"."created_by")))
  WHERE (("c"."id" = "chat_participants"."chat_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chat_participants__leave_self" ON "public"."chat_participants" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "chat_participants"."profile_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chat_participants__select_participant" ON "public"."chat_participants" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."chat_participants" "me"
     JOIN "public"."profiles" "pme" ON (("pme"."id" = "me"."profile_id")))
  WHERE (("me"."chat_id" = "chat_participants"."chat_id") AND (("pme"."id" = "auth"."uid"()) OR ("pme"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chat_participants__update_creator" ON "public"."chat_participants" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."chats" "c"
     JOIN "public"."profiles" "p" ON (("p"."id" = "c"."created_by")))
  WHERE (("c"."id" = "chat_participants"."chat_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."chats" "c"
     JOIN "public"."profiles" "p" ON (("p"."id" = "c"."created_by")))
  WHERE (("c"."id" = "chat_participants"."chat_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats__delete_creator" ON "public"."chats" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "chats"."created_by") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chats__insert_creator" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "chats"."created_by") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chats__select_participant" ON "public"."chats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."chat_participants" "cp"
     JOIN "public"."profiles" "p" ON (("p"."id" = "cp"."profile_id")))
  WHERE (("cp"."chat_id" = "chats"."id") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chats__update_creator" ON "public"."chats" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "chats"."created_by") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "chats"."created_by") AND (("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."content_analytics_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_analytics_events_delete_shop" ON "public"."content_analytics_events" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_analytics_events_insert_shop" ON "public"."content_analytics_events" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_analytics_events_select_shop" ON "public"."content_analytics_events" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_analytics_events_update_shop" ON "public"."content_analytics_events" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."content_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_assets_delete_shop" ON "public"."content_assets" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_assets_insert_shop" ON "public"."content_assets" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_assets_select_shop" ON "public"."content_assets" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_assets_update_shop" ON "public"."content_assets" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."content_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_events_delete_shop" ON "public"."content_events" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_events_insert_shop" ON "public"."content_events" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_events_select_shop" ON "public"."content_events" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_events_update_shop" ON "public"."content_events" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."content_pieces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_pieces_delete_shop" ON "public"."content_pieces" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_pieces_insert_shop" ON "public"."content_pieces" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_pieces_select_shop" ON "public"."content_pieces" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_pieces_update_shop" ON "public"."content_pieces" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."content_platform_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_platform_accounts_delete_shop" ON "public"."content_platform_accounts" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_platform_accounts_insert_shop" ON "public"."content_platform_accounts" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_platform_accounts_select_shop" ON "public"."content_platform_accounts" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_platform_accounts_update_shop" ON "public"."content_platform_accounts" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."content_publications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_publications_delete_shop" ON "public"."content_publications" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_publications_insert_shop" ON "public"."content_publications" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_publications_select_shop" ON "public"."content_publications" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "content_publications_update_shop" ON "public"."content_publications" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."content_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "content_templates_all_member" ON "public"."content_templates" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert_self" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "conversations_select_mine_or_participant" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversations"."id") AND ("cp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "cp_select_for_my_conversations" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp2"
  WHERE (("cp2"."conversation_id" = "conversation_participants"."conversation_id") AND ("cp2"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_participants"."conversation_id") AND ("c"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "cp_select_own" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "cpi_staff_rw" ON "public"."customer_portal_invites" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_portal_invites"."customer_id") AND "public"."is_shop_member_v2"("c"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_portal_invites"."customer_id") AND "public"."is_shop_member_v2"("c"."shop_id")))));



ALTER TABLE "public"."customer_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_bookings__shop_delete" ON "public"."customer_bookings" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_bookings__shop_insert" ON "public"."customer_bookings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_bookings__shop_select" ON "public"."customer_bookings" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_bookings__shop_update" ON "public"."customer_bookings" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."customer_portal_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_quotes__shop_delete" ON "public"."customer_quotes" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_quotes__shop_insert" ON "public"."customer_quotes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_quotes__shop_select" ON "public"."customer_quotes" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_quotes__shop_update" ON "public"."customer_quotes" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "customer_select_allocations_for_own_work_orders" ON "public"."work_order_part_allocations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."customers" "c" ON (("c"."id" = "wo"."customer_id")))
  WHERE (("wo"."id" = "work_order_part_allocations"."work_order_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_invoices_for_own_work_orders" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."customers" "c" ON (("c"."id" = "wo"."customer_id")))
  WHERE (("wo"."id" = "invoices"."work_order_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_lines_for_own_work_orders" ON "public"."work_order_lines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."customers" "c" ON (("c"."id" = "wo"."customer_id")))
  WHERE (("wo"."id" = "work_order_lines"."work_order_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_own" ON "public"."customers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "customer_select_own_bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_own_history" ON "public"."history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "history"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_own_vehicles" ON "public"."vehicles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "vehicles"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_own_work_orders" ON "public"."work_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "work_orders"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_parts_referenced_by_own_work_orders" ON "public"."parts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."work_order_parts" "wop"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "wop"."work_order_id")))
     JOIN "public"."customers" "c" ON (("c"."id" = "wo"."customer_id")))
  WHERE (("wop"."part_id" = "parts"."id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "customer_select_work_order_parts_for_own_work_orders" ON "public"."work_order_parts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."customers" "c" ON (("c"."id" = "wo"."customer_id")))
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."customer_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_settings_insert_own" ON "public"."customer_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_settings"."customer_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "customer_settings_select_own" ON "public"."customer_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_settings"."customer_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "customer_settings_update_own" ON "public"."customer_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_settings"."customer_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_settings"."customer_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_by_profile_shop_select" ON "public"."customers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "customers"."shop_id")))));



ALTER TABLE "public"."cvip_specs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cvip_thresholds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cvip_thresholds_master" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decoded_vins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "decoded_vins__own_all" ON "public"."decoded_vins" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."defective_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defective_parts__shop_delete" ON "public"."defective_parts" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "defective_parts__shop_insert" ON "public"."defective_parts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "defective_parts__shop_select" ON "public"."defective_parts" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "defective_parts__shop_update" ON "public"."defective_parts" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."demo_shop_boost_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demo_shop_boosts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dtc_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dtc_logs_rw_via_vehicle_shop" ON "public"."dtc_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "dtc_logs"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "dtc_logs"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id")))));



CREATE POLICY "dtc_rw_scoped" ON "public"."dtc_logs" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "dtc_logs"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id")))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."vehicles" "v"
  WHERE (("v"."id" = "dtc_logs"."vehicle_id") AND "public"."is_shop_member_v2"("v"."shop_id"))))));



ALTER TABLE "public"."email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_suppressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_documents_self_delete" ON "public"."employee_documents" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_read" ON "public"."employee_documents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_update" ON "public"."employee_documents" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_write" ON "public"."employee_documents" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_staff_read" ON "public"."employee_documents" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "employee_documents_staff_write" ON "public"."employee_documents" TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_modify_by_shop" ON "public"."expenses" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "expenses"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "expenses"."shop_id")))));



CREATE POLICY "expenses_select_by_shop" ON "public"."expenses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "expenses"."shop_id")))));



ALTER TABLE "public"."feature_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fleet_dispatch_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_dispatch_assignments.delete.management" ON "public"."fleet_dispatch_assignments" FOR DELETE TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_dispatch_assignments"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_dispatch_assignments.insert.management" ON "public"."fleet_dispatch_assignments" FOR INSERT TO "authenticated" WITH CHECK ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_dispatch_assignments"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_dispatch_assignments.select.member" ON "public"."fleet_dispatch_assignments" FOR SELECT TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_dispatch_assignments"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "fleet_dispatch_assignments_delete_shop" ON "public"."fleet_dispatch_assignments" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_dispatch_assignments_insert_shop" ON "public"."fleet_dispatch_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_dispatch_assignments_select_shop" ON "public"."fleet_dispatch_assignments" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_dispatch_assignments_update_shop" ON "public"."fleet_dispatch_assignments" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."fleet_form_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fleet_inspection_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_inspection_schedules insert shop" ON "public"."fleet_inspection_schedules" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."shop_id" = "fleet_inspection_schedules"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "fleet_inspection_schedules select shop" ON "public"."fleet_inspection_schedules" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."shop_id" = "fleet_inspection_schedules"."shop_id")))));



CREATE POLICY "fleet_inspection_schedules.delete.management" ON "public"."fleet_inspection_schedules" FOR DELETE TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_inspection_schedules"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_inspection_schedules.insert.management" ON "public"."fleet_inspection_schedules" FOR INSERT TO "authenticated" WITH CHECK ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_inspection_schedules"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_inspection_schedules.select.member" ON "public"."fleet_inspection_schedules" FOR SELECT TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_inspection_schedules"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "fleet_inspection_schedules_delete_shop" ON "public"."fleet_inspection_schedules" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_inspection_schedules_insert_shop" ON "public"."fleet_inspection_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_inspection_schedules_select_shop" ON "public"."fleet_inspection_schedules" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_inspection_schedules_update_shop" ON "public"."fleet_inspection_schedules" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."fleet_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_members.delete.management" ON "public"."fleet_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_members"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "fleet_members.insert.management" ON "public"."fleet_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_members"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "fleet_members.select.self" ON "public"."fleet_members" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "fleet_members_delete_shop" ON "public"."fleet_members" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_members_insert_shop" ON "public"."fleet_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_members_select_shop" ON "public"."fleet_members" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_members_update_shop" ON "public"."fleet_members" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."fleet_pretrip_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_pretrip_reports.delete.management" ON "public"."fleet_pretrip_reports" FOR DELETE TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_pretrip_reports"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_pretrip_reports.insert.member" ON "public"."fleet_pretrip_reports" FOR INSERT TO "authenticated" WITH CHECK ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_pretrip_reports"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "fleet_pretrip_reports.select.member" ON "public"."fleet_pretrip_reports" FOR SELECT TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_pretrip_reports"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "fleet_pretrip_reports_delete_shop" ON "public"."fleet_pretrip_reports" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_pretrip_reports_insert_shop" ON "public"."fleet_pretrip_reports" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_pretrip_reports_select_shop" ON "public"."fleet_pretrip_reports" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_pretrip_reports_update_shop" ON "public"."fleet_pretrip_reports" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."fleet_program_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_program_tasks__program_shop_all" ON "public"."fleet_program_tasks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."fleet_programs" "fp"
     JOIN "public"."fleets" "f" ON (("f"."id" = "fp"."fleet_id")))
  WHERE (("fp"."id" = "fleet_program_tasks"."program_id") AND "public"."is_shop_member_v2"("f"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."fleet_programs" "fp"
     JOIN "public"."fleets" "f" ON (("f"."id" = "fp"."fleet_id")))
  WHERE (("fp"."id" = "fleet_program_tasks"."program_id") AND "public"."is_shop_member_v2"("f"."shop_id")))));



ALTER TABLE "public"."fleet_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_programs__fleet_shop_all" ON "public"."fleet_programs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fleets" "f"
  WHERE (("f"."id" = "fleet_programs"."fleet_id") AND "public"."is_shop_member_v2"("f"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fleets" "f"
  WHERE (("f"."id" = "fleet_programs"."fleet_id") AND "public"."is_shop_member_v2"("f"."shop_id")))));



ALTER TABLE "public"."fleet_service_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_service_requests.delete.management" ON "public"."fleet_service_requests" FOR DELETE TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_service_requests"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_service_requests.insert.management" ON "public"."fleet_service_requests" FOR INSERT TO "authenticated" WITH CHECK ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_service_requests"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"])))))));



CREATE POLICY "fleet_service_requests.select.member" ON "public"."fleet_service_requests" FOR SELECT TO "authenticated" USING ((("fleet_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleet_service_requests"."fleet_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "fleet_service_requests_delete_shop" ON "public"."fleet_service_requests" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_service_requests_insert_shop" ON "public"."fleet_service_requests" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_service_requests_select_shop" ON "public"."fleet_service_requests" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_service_requests_update_shop" ON "public"."fleet_service_requests" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."fleet_vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_vehicles_delete_shop" ON "public"."fleet_vehicles" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_vehicles_insert_shop" ON "public"."fleet_vehicles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_vehicles_select_shop" ON "public"."fleet_vehicles" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleet_vehicles_update_shop" ON "public"."fleet_vehicles" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."fleets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleets.delete.management" ON "public"."fleets" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "fleets"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "fleets.insert.management" ON "public"."fleets" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "fleets"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'fleet_manager'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "fleets.select.member" ON "public"."fleets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fleet_members" "m"
  WHERE (("m"."fleet_id" = "fleets"."id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "fleets.select.same_shop" ON "public"."fleets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "fleets"."shop_id")))));



CREATE POLICY "fleets_delete_shop" ON "public"."fleets" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleets_insert_shop" ON "public"."fleets" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleets_select_shop" ON "public"."fleets" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "fleets_update_shop" ON "public"."fleets" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."followups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "followups__own_all" ON "public"."followups" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_items__shop_all" ON "public"."inspection_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_items"."inspection_id") AND "public"."is_shop_member_v2"("i"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_items"."inspection_id") AND "public"."is_shop_member_v2"("i"."shop_id")))));



ALTER TABLE "public"."inspection_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_photos_table_delete_shop" ON "public"."inspection_photos" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_photos"."inspection_id") AND ("i"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "inspection_photos_table_insert_shop" ON "public"."inspection_photos" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_photos"."inspection_id") AND ("i"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "inspection_photos_table_select_shop" ON "public"."inspection_photos" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_photos"."inspection_id") AND ("i"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "inspection_photos_table_update_shop" ON "public"."inspection_photos" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_photos"."inspection_id") AND ("i"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "inspection_photos"."inspection_id") AND ("i"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."inspection_result_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_session_payloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_template_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_templates_delete" ON "public"."inspection_templates" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "inspection_templates_insert" ON "public"."inspection_templates" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ((("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"())) AND ("p"."shop_id" IS NOT NULL))))));



CREATE POLICY "inspection_templates_select" ON "public"."inspection_templates" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (("shop_id" IS NOT NULL) AND ("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" IS NOT NULL))))) OR ("is_public" = true)));



CREATE POLICY "inspection_templates_update" ON "public"."inspection_templates" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspections_delete_same_shop" ON "public"."inspections" FOR DELETE TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_insert_same_shop" ON "public"."inspections" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_select_same_shop" ON "public"."inspections" FOR SELECT TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_update_same_shop" ON "public"."inspections" FOR UPDATE TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))) WITH CHECK (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



ALTER TABLE "public"."integration_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_logs__shop_delete" ON "public"."integration_logs" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "integration_logs__shop_insert" ON "public"."integration_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "integration_logs__shop_select" ON "public"."integration_logs" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "integration_logs__shop_update" ON "public"."integration_logs" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integrations__shop_delete" ON "public"."integrations" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "integrations__shop_insert" ON "public"."integrations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "integrations__shop_select" ON "public"."integrations" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "integrations__shop_update" ON "public"."integrations" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."invoice_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_documents_delete" ON "public"."invoice_documents" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "invoice_documents_select" ON "public"."invoice_documents" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "invoice_documents_update" ON "public"."invoice_documents" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "invoice_documents_write" ON "public"."invoice_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_modify_by_shop" ON "public"."invoices" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "invoices"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "invoices"."shop_id")))));



CREATE POLICY "invoices_select_by_shop" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "invoices"."shop_id")))));



ALTER TABLE "public"."lead_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_events_all_member" ON "public"."lead_events" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."learning_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_feedback_all_member" ON "public"."learning_feedback" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



CREATE POLICY "maint_suggestions_rw" ON "public"."maintenance_suggestions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "maintenance_suggestions"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "maintenance_suggestions"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id")))));



ALTER TABLE "public"."maintenance_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "maintenance_rules_read" ON "public"."maintenance_rules" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."maintenance_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "maintenance_services_read" ON "public"."maintenance_services" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."maintenance_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_uploads__scoped_all" ON "public"."media_uploads" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (("work_order_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "media_uploads"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) OR (("inspection_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "media_uploads"."inspection_id") AND "public"."is_shop_member_v2"("i"."shop_id"))))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (("work_order_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "media_uploads"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) OR (("inspection_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "media_uploads"."inspection_id") AND "public"."is_shop_member_v2"("i"."shop_id")))))));



ALTER TABLE "public"."menu_item_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_item_parts_delete_in_shop" ON "public"."menu_item_parts" FOR DELETE TO "authenticated" USING ((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"())));



CREATE POLICY "menu_item_parts_insert_in_shop" ON "public"."menu_item_parts" FOR INSERT TO "authenticated" WITH CHECK (((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"())) AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"()))));



CREATE POLICY "menu_item_parts_select_in_shop" ON "public"."menu_item_parts" FOR SELECT TO "authenticated" USING ((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"())));



CREATE POLICY "menu_item_parts_update_in_shop" ON "public"."menu_item_parts" FOR UPDATE TO "authenticated" USING ((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"()))) WITH CHECK (((("shop_id" IS NULL) OR ("shop_id" = "public"."current_shop_id"())) AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"()))));



ALTER TABLE "public"."menu_item_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_delete_own" ON "public"."menu_items" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "menu_items_insert_own" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "menu_items_select_all" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "menu_items_update_own" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."menu_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_pricing__own_all" ON "public"."menu_pricing" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete_for_conversation" ON "public"."messages" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp"
          WHERE (("cp"."conversation_id" = "c"."id") AND ("cp"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "messages_insert_for_conversation" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp"
          WHERE (("cp"."conversation_id" = "c"."id") AND ("cp"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "messages_select_for_conversation" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp"
          WHERE (("cp"."conversation_id" = "c"."id") AND ("cp"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "messages_update_for_conversation" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp"
          WHERE (("cp"."conversation_id" = "c"."id") AND ("cp"."user_id" = "auth"."uid"()))))))))) WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp"
          WHERE (("cp"."conversation_id" = "c"."id") AND ("cp"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "mip.delete.own" ON "public"."menu_item_parts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mip.insert.own" ON "public"."menu_item_parts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "mip.select.own" ON "public"."menu_item_parts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mip.update.own" ON "public"."menu_item_parts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_members_select_self" ON "public"."org_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_by_membership" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "organizations"."id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "own app layout" ON "public"."user_app_layouts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own feature reads" ON "public"."feature_reads" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own msg reads" ON "public"."message_reads" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own notifications" ON "public"."notifications" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own widget instances" ON "public"."widget_instances" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own widget layout" ON "public"."user_widget_layouts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."part_barcodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_barcodes_same_shop_all" ON "public"."part_barcodes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts" "pa"
     JOIN "public"."profiles" "pr" ON (("pr"."id" = "auth"."uid"())))
  WHERE (("pa"."id" = "part_barcodes"."part_id") AND ("pa"."shop_id" = "pr"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts" "pa"
     JOIN "public"."profiles" "pr" ON (("pr"."id" = "auth"."uid"())))
  WHERE (("pa"."id" = "part_barcodes"."part_id") AND ("pa"."shop_id" = "pr"."shop_id")))));



ALTER TABLE "public"."part_compatibility" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_compatibility__shop_delete" ON "public"."part_compatibility" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_compatibility__shop_insert" ON "public"."part_compatibility" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_compatibility__shop_select" ON "public"."part_compatibility" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_compatibility__shop_update" ON "public"."part_compatibility" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."part_fitment_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_fitment_events_select_in_shop" ON "public"."part_fitment_events" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."part_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_purchases__shop_delete" ON "public"."part_purchases" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_purchases__shop_insert" ON "public"."part_purchases" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_purchases__shop_select" ON "public"."part_purchases" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_purchases__shop_update" ON "public"."part_purchases" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."part_request_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_request_items_insert" ON "public"."part_request_items" FOR INSERT TO "authenticated" WITH CHECK (("request_id" IN ( SELECT "pr"."id"
   FROM "public"."part_requests" "pr"
  WHERE ("pr"."requested_by" = "auth"."uid"()))));



CREATE POLICY "part_request_items_select_by_request_shop" ON "public"."part_request_items" FOR SELECT TO "authenticated" USING (("request_id" IN ( SELECT "pr"."id"
   FROM "public"."part_requests" "pr"
  WHERE ("pr"."shop_id" IN ( SELECT "p"."shop_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"()))))));



CREATE POLICY "part_request_items_update" ON "public"."part_request_items" FOR UPDATE TO "authenticated" USING (("request_id" IN ( SELECT "pr"."id"
   FROM "public"."part_requests" "pr"
  WHERE ("pr"."requested_by" = "auth"."uid"())))) WITH CHECK (("request_id" IN ( SELECT "pr"."id"
   FROM "public"."part_requests" "pr"
  WHERE ("pr"."requested_by" = "auth"."uid"()))));



ALTER TABLE "public"."part_request_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_request_lines__request_shop_all" ON "public"."part_request_lines" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "part_request_lines"."request_id") AND "public"."is_shop_member_v2"("wo"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "part_request_lines"."request_id") AND "public"."is_shop_member_v2"("wo"."shop_id")))));



ALTER TABLE "public"."part_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_requests_insert_user_shop" ON "public"."part_requests" FOR INSERT TO "authenticated" WITH CHECK ((("requested_by" = "auth"."uid"()) AND ("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))));



CREATE POLICY "part_requests_select_by_user_shop" ON "public"."part_requests" FOR SELECT TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



ALTER TABLE "public"."part_returns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_returns__shop_delete" ON "public"."part_returns" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_returns__shop_insert" ON "public"."part_returns" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_returns__shop_select" ON "public"."part_returns" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_returns__shop_update" ON "public"."part_returns" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."part_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_stock_rw" ON "public"."part_stock" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "part_stock"."part_id") AND "public"."is_shop_member_v2"("p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "part_stock"."part_id") AND "public"."is_shop_member_v2"("p"."shop_id")))));



ALTER TABLE "public"."part_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_suppliers__shop_delete" ON "public"."part_suppliers" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_suppliers__shop_insert" ON "public"."part_suppliers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_suppliers__shop_select" ON "public"."part_suppliers" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_suppliers__shop_update" ON "public"."part_suppliers" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."part_warranties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_warranties__shop_delete" ON "public"."part_warranties" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_warranties__shop_insert" ON "public"."part_warranties" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_warranties__shop_select" ON "public"."part_warranties" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "part_warranties__shop_update" ON "public"."part_warranties" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_barcodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_barcodes__shop_delete" ON "public"."parts_barcodes" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_barcodes__shop_insert" ON "public"."parts_barcodes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_barcodes__shop_select" ON "public"."parts_barcodes" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_barcodes__shop_update" ON "public"."parts_barcodes" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_barcodes_rw_shop" ON "public"."parts_barcodes" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."parts_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_messages__request_shop_all" ON "public"."parts_messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "parts_messages"."request_id") AND "public"."is_shop_member_v2"("wo"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "parts_messages"."request_id") AND "public"."is_shop_member_v2"("wo"."shop_id")))));



ALTER TABLE "public"."parts_quote_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_request_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_requests_staff_access" ON "public"."parts_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_requests"."work_order_id") AND "public"."is_staff_for_shop"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_requests"."work_order_id") AND "public"."is_staff_for_shop"("w"."shop_id")))));



CREATE POLICY "parts_rw" ON "public"."parts" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."parts_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_suppliers__shop_delete" ON "public"."parts_suppliers" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_suppliers__shop_insert" ON "public"."parts_suppliers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_suppliers__shop_select" ON "public"."parts_suppliers" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "parts_suppliers__shop_update" ON "public"."parts_suppliers" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payload_same_shop_rw" ON "public"."inspection_session_payloads" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_session_payloads"."session_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_session_payloads"."session_id") AND ("p"."shop_id" = "w"."shop_id")))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_select_same_shop" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "payments"."shop_id")))));



CREATE POLICY "payments_select_shop" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "payments"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text"]))))));



ALTER TABLE "public"."payroll_deductions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_export_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_pay_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_pay_periods__shop_delete" ON "public"."payroll_pay_periods" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payroll_pay_periods__shop_insert" ON "public"."payroll_pay_periods" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payroll_pay_periods__shop_select" ON "public"."payroll_pay_periods" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payroll_pay_periods__shop_update" ON "public"."payroll_pay_periods" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."payroll_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_providers__shop_delete" ON "public"."payroll_providers" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payroll_providers__shop_insert" ON "public"."payroll_providers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payroll_providers__shop_select" ON "public"."payroll_providers" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "payroll_providers__shop_update" ON "public"."payroll_providers" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."payroll_timecards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_events_insert" ON "public"."planner_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."planner_runs" "r"
  WHERE (("r"."id" = "planner_events"."run_id") AND ("r"."shop_id" = ( SELECT "profiles"."shop_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "planner_events_select" ON "public"."planner_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."planner_runs" "r"
  WHERE (("r"."id" = "planner_events"."run_id") AND ("r"."shop_id" = ( SELECT "profiles"."shop_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))));



ALTER TABLE "public"."planner_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_runs_insert" ON "public"."planner_runs" FOR INSERT TO "authenticated" WITH CHECK ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "planner_runs_select" ON "public"."planner_runs" FOR SELECT TO "authenticated" USING (("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "planner_runs_update" ON "public"."planner_runs" FOR UPDATE TO "authenticated" USING ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("shop_id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "po_rw" ON "public"."purchase_orders" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "po_same_shop_all" ON "public"."purchase_orders" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "purchase_orders"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "purchase_orders"."shop_id")))));



CREATE POLICY "poi_rw" ON "public"."purchase_order_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "po"
  WHERE (("po"."id" = "purchase_order_items"."po_id") AND "public"."is_shop_member_v2"("po"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "po"
  WHERE (("po"."id" = "purchase_order_items"."po_id") AND "public"."is_shop_member_v2"("po"."shop_id")))));



CREATE POLICY "pol_same_shop_all" ON "public"."purchase_order_lines" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."purchase_orders" "po"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("po"."id" = "purchase_order_lines"."po_id") AND ("po"."shop_id" = "p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."purchase_orders" "po"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("po"."id" = "purchase_order_lines"."po_id") AND ("po"."shop_id" = "p"."shop_id")))));



CREATE POLICY "portal user can mark own notifications read" ON "public"."portal_notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "portal user can view own notifications" ON "public"."portal_notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."portal_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pq_rw" ON "public"."parts_quotes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_quotes"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_quotes"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id")))));



CREATE POLICY "pqr_rw" ON "public"."parts_quote_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_quote_requests"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_quote_requests"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id")))));



CREATE POLICY "prm_staff_access" ON "public"."parts_request_messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "parts_request_messages"."request_id") AND "public"."is_staff_for_shop"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "parts_request_messages"."request_id") AND "public"."is_staff_for_shop"("w"."shop_id")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles.self.insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "profiles.self.select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "profiles.self.update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"()))) WITH CHECK ((("id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."punch_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "punch_events_delete_none" ON "public"."punch_events" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "punch_events_insert_own" ON "public"."punch_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tech_shifts" "ts"
  WHERE (("ts"."id" = "punch_events"."shift_id") AND ("ts"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "punch_events_select_own" ON "public"."punch_events" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "punch_events_update_none" ON "public"."punch_events" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quote_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_lines__wo_shop_all" ON "public"."quote_lines" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "quote_lines"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "quote_lines"."work_order_id") AND "public"."is_shop_member_v2"("w"."shop_id")))));



CREATE POLICY "result_items_same_shop_ro" ON "public"."inspection_result_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."inspection_results" "r"
     JOIN "public"."inspection_sessions" "s" ON (("s"."id" = "r"."session_id")))
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("r"."id" = "inspection_result_items"."result_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "result_items_same_shop_rw" ON "public"."inspection_result_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."inspection_results" "r"
     JOIN "public"."inspection_sessions" "s" ON (("s"."id" = "r"."session_id")))
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("r"."id" = "inspection_result_items"."result_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."inspection_results" "r"
     JOIN "public"."inspection_sessions" "s" ON (("s"."id" = "r"."session_id")))
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("r"."id" = "inspection_result_items"."result_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "results_same_shop_rw" ON "public"."inspection_results" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_results"."session_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_results"."session_id") AND ("p"."shop_id" = "w"."shop_id")))));



ALTER TABLE "public"."saved_menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_menu_items__global_read" ON "public"."saved_menu_items" FOR SELECT TO "authenticated" USING ((("visibility" = 'global'::"text") AND ("published_at" IS NOT NULL)));



CREATE POLICY "saved_menu_items__read" ON "public"."saved_menu_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "saved_menu_items__service_all" ON "public"."saved_menu_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role updates" ON "public"."fleet_form_uploads" FOR UPDATE TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "service-role-manage-cvip-specs" ON "public"."cvip_specs" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-cvip-thresholds" ON "public"."cvip_thresholds" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-cvip-thresholds-master" ON "public"."cvip_thresholds_master" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-demo-leads" ON "public"."demo_shop_boost_leads" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-demo-runs" ON "public"."demo_shop_boosts" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-inspection-signatures" ON "public"."inspection_signatures" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-inspection-template-suggestions" ON "public"."inspection_template_suggestions" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-menu-item-suggestions" ON "public"."menu_item_suggestions" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-shop-health-snapshots" ON "public"."shop_health_snapshots" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-shop-import-files" ON "public"."shop_import_files" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-shop-import-rows" ON "public"."shop_import_rows" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-staff-invite-suggestions" ON "public"."staff_invite_suggestions" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-manage-work-order-line-ai" ON "public"."work_order_line_ai" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service-role-only-inserts" ON "public"."shop_boost_intakes" FOR INSERT TO "service_role" WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role can manage portal_notifications" ON "public"."portal_notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "sessions_same_shop_read" ON "public"."inspection_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "inspection_sessions"."work_order_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "sessions_same_shop_write" ON "public"."inspection_sessions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "inspection_sessions"."work_order_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "inspection_sessions"."work_order_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "shop-users-read-inspection-template-suggestions" ON "public"."inspection_template_suggestions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "inspection_template_suggestions"."shop_id")))));



CREATE POLICY "shop-users-read-menu-item-suggestions" ON "public"."menu_item_suggestions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "menu_item_suggestions"."shop_id")))));



CREATE POLICY "shop-users-read-shop-boost-intakes" ON "public"."shop_boost_intakes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_boost_intakes"."shop_id")))));



CREATE POLICY "shop-users-read-shop-health-snapshots" ON "public"."shop_health_snapshots" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_health_snapshots"."shop_id")))));



CREATE POLICY "shop-users-read-shop-import-files" ON "public"."shop_import_files" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."shop_boost_intakes" "i"
     JOIN "public"."profiles" "p" ON ((("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "i"."shop_id"))))
  WHERE ("i"."id" = "shop_import_files"."intake_id"))));



CREATE POLICY "shop-users-read-shop-import-rows" ON "public"."shop_import_rows" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."shop_boost_intakes" "i"
     JOIN "public"."profiles" "p" ON ((("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "i"."shop_id"))))
  WHERE ("i"."id" = "shop_import_rows"."intake_id"))));



CREATE POLICY "shop-users-read-staff-invite-suggestions" ON "public"."staff_invite_suggestions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "staff_invite_suggestions"."shop_id")))));



CREATE POLICY "shop-users-read-work-order-line-ai" ON "public"."work_order_line_ai" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_order_line_ai"."shop_id")))));



CREATE POLICY "shop_admins_update_labor_rate" ON "public"."shops" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."shop_ai_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_ai_profiles__shop_delete" ON "public"."shop_ai_profiles" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_ai_profiles__shop_insert" ON "public"."shop_ai_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_ai_profiles__shop_select" ON "public"."shop_ai_profiles" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_ai_profiles__shop_update" ON "public"."shop_ai_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."shop_boost_intakes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_editors_delete_menu_items" ON "public"."menu_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "menu_items"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text"]))))));



CREATE POLICY "shop_editors_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "menu_items"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text"]))))));



CREATE POLICY "shop_editors_update_menu_items" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "menu_items"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "menu_items"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text"]))))));



ALTER TABLE "public"."shop_health_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_hours_staff_write" ON "public"."shop_hours" TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."shop_import_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_import_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_members_can_select_invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "shop_members_select_menu_items" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "menu_items"."shop_id")))));



CREATE POLICY "shop_members_select_self" ON "public"."shop_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "shop_members_select_shops" ON "public"."shops" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id")))));



ALTER TABLE "public"."shop_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_parts__shop_delete" ON "public"."shop_parts" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_parts__shop_insert" ON "public"."shop_parts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_parts__shop_select" ON "public"."shop_parts" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_parts__shop_update" ON "public"."shop_parts" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."shop_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_profiles_staff_write" ON "public"."shop_profiles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_profiles"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_profiles"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



ALTER TABLE "public"."shop_ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_ratings__shop_delete" ON "public"."shop_ratings" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_ratings__shop_insert" ON "public"."shop_ratings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_ratings__shop_select" ON "public"."shop_ratings" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_ratings__shop_update" ON "public"."shop_ratings" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."shop_reel_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_reel_settings_delete_shop" ON "public"."shop_reel_settings" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_reel_settings_insert_shop" ON "public"."shop_reel_settings" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_reel_settings_select_shop" ON "public"."shop_reel_settings" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_reel_settings_update_shop" ON "public"."shop_reel_settings" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shop_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_schedules__shop_delete" ON "public"."shop_schedules" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_schedules__shop_insert" ON "public"."shop_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_schedules__shop_select" ON "public"."shop_schedules" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_schedules__shop_update" ON "public"."shop_schedules" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."shop_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_settings__own_all" ON "public"."shop_settings" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."shop_tax_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_tax_overrides__shop_delete" ON "public"."shop_tax_overrides" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_tax_overrides__shop_insert" ON "public"."shop_tax_overrides" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_tax_overrides__shop_select" ON "public"."shop_tax_overrides" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_tax_overrides__shop_update" ON "public"."shop_tax_overrides" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."shop_time_off" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_time_off_staff_write" ON "public"."shop_time_off" TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."shop_time_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_time_slots__shop_delete" ON "public"."shop_time_slots" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_time_slots__shop_insert" ON "public"."shop_time_slots" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_time_slots__shop_select" ON "public"."shop_time_slots" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_time_slots__shop_update" ON "public"."shop_time_slots" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "shop_users_insert_member" ON "public"."shop_users" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_is_in_shop"("shop_id"));



CREATE POLICY "shop_users_select_member" ON "public"."shop_users" FOR SELECT TO "authenticated" USING ("public"."user_is_in_shop"("shop_id"));



CREATE POLICY "shop_users_update_member" ON "public"."shop_users" FOR UPDATE TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."shop_vehicle_menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopreel_manual_asset_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shopreel_manual_asset_files_delete_shop" ON "public"."shopreel_manual_asset_files" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_manual_asset_files_insert_shop" ON "public"."shopreel_manual_asset_files" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_manual_asset_files_select_shop" ON "public"."shopreel_manual_asset_files" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_manual_asset_files_update_shop" ON "public"."shopreel_manual_asset_files" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shopreel_manual_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shopreel_manual_assets_delete_shop" ON "public"."shopreel_manual_assets" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_manual_assets_insert_shop" ON "public"."shopreel_manual_assets" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_manual_assets_select_shop" ON "public"."shopreel_manual_assets" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_manual_assets_update_shop" ON "public"."shopreel_manual_assets" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shopreel_publications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shopreel_publications_delete_shop" ON "public"."shopreel_publications" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_publications_insert_shop" ON "public"."shopreel_publications" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_publications_select_shop" ON "public"."shopreel_publications" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_publications_update_shop" ON "public"."shopreel_publications" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shopreel_social_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shopreel_social_connections_delete_shop" ON "public"."shopreel_social_connections" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_social_connections_insert_shop" ON "public"."shopreel_social_connections" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_social_connections_select_shop" ON "public"."shopreel_social_connections" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shopreel_social_connections_update_shop" ON "public"."shopreel_social_connections" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shops: only read my shop" ON "public"."shops" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) OR ("owner_id" = "auth"."uid"())));



CREATE POLICY "shops_insert_authenticated" ON "public"."shops" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "shops_select_member" ON "public"."shops" FOR SELECT TO "authenticated" USING ("public"."user_is_in_shop"("id"));



CREATE POLICY "shops_staff_write" ON "public"."shops" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "shops_update_member" ON "public"."shops" FOR UPDATE TO "authenticated" USING ("public"."user_is_in_shop"("id")) WITH CHECK ("public"."user_is_in_shop"("id"));



CREATE POLICY "staff can delete customers in shop" ON "public"."customers" FOR DELETE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can delete vehicles in shop" ON "public"."vehicles" FOR DELETE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can insert customers in shop" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can insert vehicles in shop" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can read customers in shop" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can read vehicles in shop" ON "public"."vehicles" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can update customers in shop" ON "public"."customers" FOR UPDATE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can update vehicles in shop" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."staff_invite_candidates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_invite_candidates_delete_owner_admin" ON "public"."staff_invite_candidates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "staff_invite_candidates"."shop_id") AND (COALESCE("p"."role", ''::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "staff_invite_candidates_insert_admin" ON "public"."staff_invite_candidates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "staff_invite_candidates"."shop_id") AND (COALESCE("p"."role", ''::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "staff_invite_candidates_select_shop" ON "public"."staff_invite_candidates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "staff_invite_candidates"."shop_id")))));



CREATE POLICY "staff_invite_candidates_update_admin" ON "public"."staff_invite_candidates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "staff_invite_candidates"."shop_id") AND (COALESCE("p"."role", ''::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "staff_invite_candidates"."shop_id") AND (COALESCE("p"."role", ''::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



ALTER TABLE "public"."staff_invite_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_locations_rw" ON "public"."stock_locations" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."stock_moves" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_moves_r" ON "public"."stock_moves" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "stock_moves"."part_id") AND "public"."is_shop_member_v2"("p"."shop_id")))));



ALTER TABLE "public"."supplier_catalog_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_catalog_items__supplier_shop_all" ON "public"."supplier_catalog_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."suppliers" "s"
  WHERE (("s"."id" = "supplier_catalog_items"."supplier_id") AND "public"."is_shop_member_v2"("s"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."suppliers" "s"
  WHERE (("s"."id" = "supplier_catalog_items"."supplier_id") AND "public"."is_shop_member_v2"("s"."shop_id")))));



ALTER TABLE "public"."supplier_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_orders__shop_delete" ON "public"."supplier_orders" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "supplier_orders__shop_insert" ON "public"."supplier_orders" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "supplier_orders__shop_select" ON "public"."supplier_orders" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "supplier_orders__shop_update" ON "public"."supplier_orders" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."supplier_price_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_price_history__catalog_shop_all" ON "public"."supplier_price_history" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."supplier_catalog_items" "sci"
     JOIN "public"."suppliers" "s" ON (("s"."id" = "sci"."supplier_id")))
  WHERE (("sci"."id" = "supplier_price_history"."catalog_item_id") AND "public"."is_shop_member_v2"("s"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."supplier_catalog_items" "sci"
     JOIN "public"."suppliers" "s" ON (("s"."id" = "sci"."supplier_id")))
  WHERE (("sci"."id" = "supplier_price_history"."catalog_item_id") AND "public"."is_shop_member_v2"("s"."shop_id")))));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_rw" ON "public"."suppliers" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "suppliers_same_shop_all" ON "public"."suppliers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "suppliers"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "suppliers"."shop_id")))));



CREATE POLICY "svmi_delete" ON "public"."shop_vehicle_menu_items" FOR DELETE TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "svmi_insert" ON "public"."shop_vehicle_menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "svmi_select" ON "public"."shop_vehicle_menu_items" FOR SELECT TO "authenticated" USING ("public"."is_shop_member"("shop_id"));



CREATE POLICY "svmi_update" ON "public"."shop_vehicle_menu_items" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."tax_calculation_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_calculation_log__shop_delete" ON "public"."tax_calculation_log" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "tax_calculation_log__shop_insert" ON "public"."tax_calculation_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "tax_calculation_log__shop_select" ON "public"."tax_calculation_log" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "tax_calculation_log__shop_update" ON "public"."tax_calculation_log" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."tax_jurisdictions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_jurisdictions__read" ON "public"."tax_jurisdictions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tax_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_providers__shop_delete" ON "public"."tax_providers" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "tax_providers__shop_insert" ON "public"."tax_providers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "tax_providers__shop_select" ON "public"."tax_providers" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "tax_providers__shop_update" ON "public"."tax_providers" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."tax_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_rates__read" ON "public"."tax_rates" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tech_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tech_sessions_delete_none" ON "public"."tech_sessions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "tech_sessions_insert_own" ON "public"."tech_sessions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tech_sessions_select_own" ON "public"."tech_sessions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tech_sessions_update_own" ON "public"."tech_sessions" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."tech_shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tech_shifts_delete_admin_owner_shop" ON "public"."tech_shifts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("p"."shop_id" = "tech_shifts"."shop_id")))));



CREATE POLICY "tech_shifts_delete_none" ON "public"."tech_shifts" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "tech_shifts_insert_admin_owner_shop" ON "public"."tech_shifts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("p"."shop_id" = "tech_shifts"."shop_id")))));



CREATE POLICY "tech_shifts_insert_own" ON "public"."tech_shifts" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tech_shifts_select_admin_owner_shop" ON "public"."tech_shifts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("p"."shop_id" = "tech_shifts"."shop_id")))));



CREATE POLICY "tech_shifts_select_own" ON "public"."tech_shifts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tech_shifts_select_self" ON "public"."tech_shifts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "tech_shifts_update_admin_owner_shop" ON "public"."tech_shifts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("p"."shop_id" = "tech_shifts"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("p"."shop_id" = "tech_shifts"."shop_id")))));



CREATE POLICY "tech_shifts_update_own" ON "public"."tech_shifts" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."template_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_items__template_access_all" ON "public"."template_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspection_templates" "t"
  WHERE (("t"."id" = "template_items"."template_id") AND (("t"."user_id" = "auth"."uid"()) OR (("t"."shop_id" IS NOT NULL) AND "public"."is_shop_member_v2"("t"."shop_id"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."inspection_templates" "t"
  WHERE (("t"."id" = "template_items"."template_id") AND (("t"."user_id" = "auth"."uid"()) OR (("t"."shop_id" IS NOT NULL) AND "public"."is_shop_member_v2"("t"."shop_id")))))));



CREATE POLICY "timecards_manager_select" ON "public"."payroll_timecards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "p"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "timecards_own_select" ON "public"."payroll_timecards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."id" = "p"."user_id") AND ("p"."shop_id" = "p"."shop_id")))));



ALTER TABLE "public"."usage_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usage_logs__own_all" ON "public"."usage_logs" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user can insert own fleet uploads" ON "public"."fleet_form_uploads" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "user can view own fleet uploads" ON "public"."fleet_form_uploads" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."user_app_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plans__own_all" ON "public"."user_plans" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_widget_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_media_owner_select" ON "public"."vehicle_media" FOR SELECT TO "authenticated" USING (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "vehicle_media_staff_select" ON "public"."vehicle_media" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "vehicle_media_staff_write" ON "public"."vehicle_media" TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."vehicle_menus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_menus_read" ON "public"."vehicle_menus" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."vehicle_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_photos_delete_own" ON "public"."vehicle_photos" FOR DELETE TO "authenticated" USING (("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vehicle_photos_insert_own" ON "public"."vehicle_photos" FOR INSERT TO "authenticated" WITH CHECK (("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vehicle_photos_select_by_shop" ON "public"."vehicle_photos" FOR SELECT TO "authenticated" USING (("shop_id" IN ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "vehicle_photos_select_own" ON "public"."vehicle_photos" FOR SELECT TO "authenticated" USING (("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."vehicle_recalls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_recalls_rw_own" ON "public"."vehicle_recalls" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "vehicle_recalls_rw_same_shop" ON "public"."vehicle_recalls" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "vehicle_recalls"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "vehicle_recalls"."shop_id")))));



ALTER TABLE "public"."vehicle_signatures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_signatures_rw_in_shop" ON "public"."vehicle_signatures" TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "vehicle_signatures_select_in_shop" ON "public"."vehicle_signatures" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_by_profile_shop_select" ON "public"."vehicles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "vehicles"."shop_id")))));



CREATE POLICY "vehicles_delete_same_shop" ON "public"."vehicles" FOR DELETE TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "vehicles_insert_same_shop" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "vehicles_select_same_shop" ON "public"."vehicles" FOR SELECT TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "vehicles_update_same_shop" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"())))) WITH CHECK (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."vendor_part_numbers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_metrics_all_member" ON "public"."video_metrics" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."video_platform_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_platform_posts_all_member" ON "public"."video_platform_posts" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "videos_all_member" ON "public"."videos" TO "authenticated" USING ("public"."user_is_in_shop"("shop_id")) WITH CHECK ("public"."user_is_in_shop"("shop_id"));



ALTER TABLE "public"."vin_decodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vin_decodes_delete_self" ON "public"."vin_decodes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_insert_own" ON "public"."vin_decodes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_insert_self" ON "public"."vin_decodes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_select_own" ON "public"."vin_decodes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_update_self" ON "public"."vin_decodes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vpn_same_shop_all" ON "public"."vendor_part_numbers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."id" = "auth"."uid"()) AND ("pr"."shop_id" = "vendor_part_numbers"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."id" = "auth"."uid"()) AND ("pr"."shop_id" = "vendor_part_numbers"."shop_id")))));



ALTER TABLE "public"."warranties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warranties__shop_delete" ON "public"."warranties" FOR DELETE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "warranties__shop_insert" ON "public"."warranties" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "warranties__shop_select" ON "public"."warranties" FOR SELECT TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id"));



CREATE POLICY "warranties__shop_update" ON "public"."warranties" FOR UPDATE TO "authenticated" USING ("public"."is_shop_member_v2"("shop_id")) WITH CHECK ("public"."is_shop_member_v2"("shop_id"));



ALTER TABLE "public"."warranty_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warranty_claims__warranty_shop_all" ON "public"."warranty_claims" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."warranties" "w"
  WHERE (("w"."id" = "warranty_claims"."warranty_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."warranties" "w"
  WHERE (("w"."id" = "warranty_claims"."warranty_id") AND "public"."is_shop_member_v2"("w"."shop_id")))));



ALTER TABLE "public"."widget_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."widgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "widgets__read" ON "public"."widgets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "wo_alloc_rw" ON "public"."work_order_part_allocations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "wl"."work_order_id")))
  WHERE (("wl"."id" = "work_order_part_allocations"."work_order_line_id") AND "public"."is_shop_member_v2"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "wl"."work_order_id")))
  WHERE (("wl"."id" = "work_order_part_allocations"."work_order_line_id") AND "public"."is_shop_member_v2"("w"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_delete" ON "public"."work_orders" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_insert" ON "public"."work_orders" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_select" ON "public"."work_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_update" ON "public"."work_orders" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "woa_same_shop_all" ON "public"."work_order_approvals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_by_profile_shop_select" ON "public"."work_order_lines" FOR SELECT TO "authenticated" USING ((("shop_id" = "public"."current_shop_id"()) OR "public"."work_order_in_my_shop"("work_order_id")));



CREATE POLICY "wol_delete_via_parent_profile" ON "public"."work_order_lines" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "wol_history_same_shop_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_insert_same_shop" ON "public"."work_order_lines" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON ((("p"."id" = "auth"."uid"()) OR ("p"."user_id" = "auth"."uid"()))))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_update_via_parent" ON "public"."work_order_lines" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'dispatcher'::"text"]))))) OR ("assigned_tech_id" = "auth"."uid"()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'dispatcher'::"text"]))))) OR ("assigned_tech_id" = "auth"."uid"())));



CREATE POLICY "wolh_same_shop_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wolt_select_same_shop" ON "public"."work_order_line_technicians" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "wl"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wl"."id" = "work_order_line_technicians"."work_order_line_id") AND ("p"."shop_id" = "wo"."shop_id")))));



CREATE POLICY "wolt_write_staff_same_shop" ON "public"."work_order_line_technicians" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "wl"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wl"."id" = "work_order_line_technicians"."work_order_line_id") AND ("p"."shop_id" = "wo"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'dispatcher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "wo" ON (("wo"."id" = "wl"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wl"."id" = "work_order_line_technicians"."work_order_line_id") AND ("p"."shop_id" = "wo"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'dispatcher'::"text"]))))));



CREATE POLICY "woql_delete" ON "public"."work_order_quote_lines" FOR DELETE TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "woql_insert" ON "public"."work_order_quote_lines" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "woql_read" ON "public"."work_order_quote_lines" FOR SELECT TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "woql_update" ON "public"."work_order_quote_lines" FOR UPDATE TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))) WITH CHECK (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



CREATE POLICY "wor_insert_privileged_profiles" ON "public"."work_order_invoice_reviews" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."shop_id" = "work_order_invoice_reviews"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text", 'lead'::"text", 'lead_hand'::"text", 'leadhand'::"text"]))))));



CREATE POLICY "wor_no_deletes" ON "public"."work_order_invoice_reviews" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "wor_no_updates" ON "public"."work_order_invoice_reviews" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "wor_parts_delete" ON "public"."work_order_parts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND "public"."is_shop_member_v2"("wo"."shop_id")))));



CREATE POLICY "wor_parts_insert" ON "public"."work_order_parts" FOR INSERT TO "authenticated" WITH CHECK ((("shop_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "work_order_parts"."shop_id") AND "public"."is_shop_member_v2"("wo"."shop_id"))))));



CREATE POLICY "wor_parts_update" ON "public"."work_order_parts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND "public"."is_shop_member_v2"("wo"."shop_id"))))) WITH CHECK ((("shop_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "work_order_parts"."shop_id") AND "public"."is_shop_member_v2"("wo"."shop_id"))))));



CREATE POLICY "wor_select_profiles" ON "public"."work_order_invoice_reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."shop_id" = "work_order_invoice_reviews"."shop_id")))));



ALTER TABLE "public"."work_order_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_invoice_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_line_ai" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_line_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_line_technicians" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_order_media_select" ON "public"."work_order_media" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_order_media"."shop_id")))));



ALTER TABLE "public"."work_order_part_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_order_part_allocations_delete_in_shop" ON "public"."work_order_part_allocations" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_part_allocations_insert_in_shop" ON "public"."work_order_part_allocations" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_part_allocations_select_in_shop" ON "public"."work_order_part_allocations" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_part_allocations_update_in_shop" ON "public"."work_order_part_allocations" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."work_order_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_quote_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_orders_select_customer" ON "public"."work_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "work_orders"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."menu_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."punch_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."shop_profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."shops";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tech_shifts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."vehicles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."work_order_lines";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."work_order_parts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."work_orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLES IN SCHEMA "public";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"("inet") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "anon";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_repair_line_from_vehicle_service"("p_work_order_id" "uuid", "p_vehicle_year" integer, "p_vehicle_make" "text", "p_vehicle_model" "text", "p_engine_family" "text", "p_service_code" "text", "p_qty" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_repair_line_from_vehicle_service"("p_work_order_id" "uuid", "p_vehicle_year" integer, "p_vehicle_make" "text", "p_vehicle_model" "text", "p_engine_family" "text", "p_service_code" "text", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."add_repair_line_from_vehicle_service"("p_work_order_id" "uuid", "p_vehicle_year" integer, "p_vehicle_make" "text", "p_vehicle_model" "text", "p_engine_family" "text", "p_service_code" "text", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_repair_line_from_vehicle_service"("p_work_order_id" "uuid", "p_vehicle_year" integer, "p_vehicle_make" "text", "p_vehicle_model" "text", "p_engine_family" "text", "p_service_code" "text", "p_qty" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."agent_actions" TO "anon";
GRANT ALL ON TABLE "public"."agent_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_actions" TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_approve_action"("p_action_id" "uuid", "p_approved_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_approve_action"("p_action_id" "uuid", "p_approved_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_approve_action"("p_action_id" "uuid", "p_approved_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "anon";
GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "service_role";



GRANT ALL ON TABLE "public"."agent_jobs" TO "anon";
GRANT ALL ON TABLE "public"."agent_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."agent_claim_next_job"("worker_id" "text", "kinds" "public"."agent_job_kind"[]) TO "supabase_read_only_user";



GRANT ALL ON TABLE "public"."agent_messages" TO "anon";
GRANT ALL ON TABLE "public"."agent_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_messages" TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_claim_next_message"("worker_id" "text", "kinds" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."agent_claim_next_message"("worker_id" "text", "kinds" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_claim_next_message"("worker_id" "text", "kinds" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_create_action"("p_request_id" "uuid", "p_kind" "text", "p_risk" "public"."agent_action_risk", "p_summary" "text", "p_payload" "jsonb", "p_requires_approval" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."agent_create_action"("p_request_id" "uuid", "p_kind" "text", "p_risk" "public"."agent_action_risk", "p_summary" "text", "p_payload" "jsonb", "p_requires_approval" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_create_action"("p_request_id" "uuid", "p_kind" "text", "p_risk" "public"."agent_action_risk", "p_summary" "text", "p_payload" "jsonb", "p_requires_approval" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_job_heartbeat"("job_id" "uuid", "worker_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_job_heartbeat"("job_id" "uuid", "worker_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_job_heartbeat"("job_id" "uuid", "worker_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_mark_job_canceled"("job_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_mark_job_canceled"("job_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_mark_job_canceled"("job_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_mark_job_failed"("job_id" "uuid", "err" "text", "retry_in_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."agent_mark_job_failed"("job_id" "uuid", "err" "text", "retry_in_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_mark_job_failed"("job_id" "uuid", "err" "text", "retry_in_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_mark_job_succeeded"("job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_mark_job_succeeded"("job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_mark_job_succeeded"("job_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_mark_message_failed"("message_id" "uuid", "err" "text", "retry_in_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."agent_mark_message_failed"("message_id" "uuid", "err" "text", "retry_in_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_mark_message_failed"("message_id" "uuid", "err" "text", "retry_in_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_mark_message_succeeded"("message_id" "uuid", "processed_by_in" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_mark_message_succeeded"("message_id" "uuid", "processed_by_in" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_mark_message_succeeded"("message_id" "uuid", "processed_by_in" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_reject_action"("p_action_id" "uuid", "p_rejected_by" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_reject_action"("p_action_id" "uuid", "p_rejected_by" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_reject_action"("p_action_id" "uuid", "p_rejected_by" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_generate_training_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."ai_generate_training_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_generate_training_row"() TO "service_role";



GRANT ALL ON TABLE "public"."stock_moves" TO "anon";
GRANT ALL ON TABLE "public"."stock_moves" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_moves" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_move_to_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_move_to_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_move_to_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_default_shop"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_default_shop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_default_shop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_unassigned_lines"("wo_id" "uuid", "tech_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_unassigned_lines"("wo_id" "uuid", "tech_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_unassigned_lines"("wo_id" "uuid", "tech_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_wol_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_wol_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_wol_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_work_orders_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_work_orders_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_work_orders_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_release_line"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_release_line"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_release_line"() TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_chat_messages"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_chat_messages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_chat_messages"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_profile_last_active_on_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_profile_last_active_on_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_profile_last_active_on_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_work_order"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_work_order"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_work_order"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_work_order"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_participants_key"("_sender" "uuid", "_recipients" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."chat_participants_key"("_sender" "uuid", "_recipients" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_participants_key"("_sender" "uuid", "_recipients" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_post_message"("_recipients" "uuid"[], "_content" "text", "_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_plan_limit"("_feature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_plan_limit"("_feature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_plan_limit"("_feature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_labor_cost_for_work_order"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_labor_cost_for_work_order"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_labor_cost_for_work_order"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_parts_cost_for_work_order"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_parts_cost_for_work_order"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_parts_cost_for_work_order"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_timecard_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_timecard_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_timecard_hours"() TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid", "p_location_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_part_request_item_on_picked"("p_request_item_id" "uuid", "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_fleet_form_upload"("_path" "text", "_filename" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_fleet_form_upload"("_path" "text", "_filename" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_fleet_form_upload"("_path" "text", "_filename" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_part_request"("p_work_order" "uuid", "p_notes" "text", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_part_request"("p_work_order" "uuid", "p_notes" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_part_request"("p_work_order" "uuid", "p_notes" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON TABLE "public"."work_orders" TO "anon";
GRANT ALL ON TABLE "public"."work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."work_orders" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean, "p_advisor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean, "p_advisor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_work_order_with_custom_id"("p_shop_id" "uuid", "p_customer_id" "uuid", "p_vehicle_id" "uuid", "p_notes" "text", "p_priority" integer, "p_is_waiter" boolean, "p_advisor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_shop_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."customers_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."customers_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."customers_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."customers_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."customers_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."customers_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_user_count_on_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_user_count_on_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_user_count_on_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_part_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_part_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_part_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_shop_user_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_shop_user_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_shop_user_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_vehicle_shop_matches_customer"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_vehicle_shop_matches_customer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_vehicle_shop_matches_customer"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_inspection_session_for_line"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_inspection_session_for_line"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_inspection_session_for_line"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_inspection_session_for_line"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_same_shop_policies"("tab" "regclass", "shop_col" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_same_shop_policies"("tab" "regclass", "shop_col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_same_shop_policies"("tab" "regclass", "shop_col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_same_shop_policies"("tab" "regclass", "shop_col" "text") TO "service_role";



REVOKE ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "owner_col" "text") FROM PUBLIC;
GRANT ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "owner_col" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "owner_col" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "owner_col" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_menu_item_for_vehicle_service"("p_shop_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_engine_family" "text", "p_service_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_menu_item_for_vehicle_service"("p_shop_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_engine_family" "text", "p_service_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_menu_item_for_vehicle_service"("p_shop_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_engine_family" "text", "p_service_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fleet_fill_fleet_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."fleet_fill_fleet_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fleet_fill_fleet_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fleet_inspection_schedules_set_next"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fleet_inspection_schedules_set_next"() TO "anon";
GRANT ALL ON FUNCTION "public"."fleet_inspection_schedules_set_next"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fleet_inspection_schedules_set_next"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_tech_sessions_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tech_sessions_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tech_sessions_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_wol_sync_assigned_to"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wol_sync_assigned_to"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wol_sync_assigned_to"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_next_work_order_custom_id"("p_shop_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_next_work_order_custom_id"("p_shop_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_stock_location"("p_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_stock_location"("p_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_stock_location"("p_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_live_invoice_id"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_live_invoice_id"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_live_invoice_id"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_trim" "text", "p_engine" "text", "p_drivetrain" "text", "p_transmission" "text", "p_fuel_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_trim" "text", "p_engine" "text", "p_drivetrain" "text", "p_transmission" "text", "p_fuel_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_vehicle_signature"("p_shop_id" "uuid", "p_vehicle_id" "uuid", "p_year" integer, "p_make" "text", "p_model" "text", "p_trim" "text", "p_engine" "text", "p_drivetrain" "text", "p_transmission" "text", "p_fuel_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_column"("tab" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_column"("tab" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_column"("tab" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoice_is_locked"("s" "text", "issued_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_is_locked"("s" "text", "issued_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_is_locked"("s" "text", "issued_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."invoices_compute_totals_biu"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoices_compute_totals_biu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_compute_totals_biu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoices_sync_work_orders_aiu"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoices_sync_work_orders_aiu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_sync_work_orders_aiu"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_agent_developer"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_agent_developer"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_agent_developer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_agent_developer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_shop_member_v2"("shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_shop_member_v2"("shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_shop_member_v2"("shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_ai_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_ai_event"() TO "service_role";
GRANT ALL ON FUNCTION "public"."log_ai_event"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."log_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."maybe_release_line_hold_for_parts"("p_work_order_line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."maybe_release_line_hold_for_parts"("p_work_order_line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."maybe_release_line_hold_for_parts"("p_work_order_line_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."menu_item_parts_set_defaults"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."menu_item_parts_set_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."menu_item_parts_set_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."menu_item_parts_set_defaults"() TO "service_role";



GRANT ALL ON FUNCTION "public"."menu_items_compute_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."menu_items_compute_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."menu_items_compute_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_part_request_item_approved_reserve_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_part_request_item_approved_reserve_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_part_request_item_approved_reserve_stock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_part_request_item_reserved_autopick"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_part_request_item_reserved_autopick"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_part_request_item_reserved_autopick"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_part_request_items_recheck_line_hold"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_part_request_items_recheck_line_hold"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_part_request_items_recheck_line_hold"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_work_order_line_active_parts_flow"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_work_order_line_active_parts_flow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_work_order_line_active_parts_flow"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_work_order_line_became_active_create_parts"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_work_order_line_became_active_create_parts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_work_order_line_became_active_create_parts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_timecards_set_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_timecards_set_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_timecards_set_hours"() TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_user_limit"("p_plan" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_user_limit"("p_plan" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_user_limit"("p_plan" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_approve_line"("p_line_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_approve_line"("p_line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_approve_line"("p_line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_approve_line"("p_line_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_approve_part_request_item"("p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_approve_part_request_item"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_approve_part_request_item"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_approve_part_request_item"("p_item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_decline_line"("p_line_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_decline_line"("p_line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_decline_line"("p_line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_decline_line"("p_line_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_decline_part_request_item"("p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_decline_part_request_item"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_decline_part_request_item"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_decline_part_request_item"("p_item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_list_approvals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_list_approvals"() TO "anon";
GRANT ALL ON FUNCTION "public"."portal_list_approvals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_list_approvals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."punch_events_set_user_from_shift"() TO "anon";
GRANT ALL ON FUNCTION "public"."punch_events_set_user_from_shift"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."punch_events_set_user_from_shift"() TO "service_role";



GRANT ALL ON FUNCTION "public"."punch_in"("p_line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."punch_in"("p_line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."punch_in"("p_line_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_menu_items_for_shop"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_menu_items_for_shop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_menu_items_for_shop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_part_request_item"("p_item_id" "uuid", "p_location_id" "uuid", "p_qty" numeric, "p_po_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_part_request_item"("p_item_id" "uuid", "p_location_id" "uuid", "p_qty" numeric, "p_po_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_part_request_item"("p_item_id" "uuid", "p_location_id" "uuid", "p_qty" numeric, "p_po_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_po_part_and_allocate"("p_po_id" "uuid", "p_part_id" "uuid", "p_location_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."receive_po_part_and_allocate"("p_po_id" "uuid", "p_part_id" "uuid", "p_location_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_po_part_and_allocate"("p_po_id" "uuid", "p_part_id" "uuid", "p_location_id" "uuid", "p_qty" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_live_invoice_costs"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_live_invoice_costs"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_live_invoice_costs"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_wo_status_trigger_func"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_wo_status_trigger_func"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_wo_status_trigger_func"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."video_metrics" TO "anon";
GRANT ALL ON TABLE "public"."video_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."video_metrics" TO "service_role";



GRANT ALL ON FUNCTION "public"."record_video_metric"("p_shop_id" "uuid", "p_video_id" "uuid", "p_platform" "text", "p_metric_date" "date", "p_impressions" integer, "p_views" integer, "p_watch_time_seconds" numeric, "p_avg_watch_seconds" numeric, "p_likes" integer, "p_comments" integer, "p_shares" integer, "p_saves" integer, "p_clicks" integer, "p_leads" integer, "p_bookings" integer, "p_revenue" numeric, "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_video_metric"("p_shop_id" "uuid", "p_video_id" "uuid", "p_platform" "text", "p_metric_date" "date", "p_impressions" integer, "p_views" integer, "p_watch_time_seconds" numeric, "p_avg_watch_seconds" numeric, "p_likes" integer, "p_comments" integer, "p_shares" integer, "p_saves" integer, "p_clicks" integer, "p_leads" integer, "p_bookings" integer, "p_revenue" numeric, "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_video_metric"("p_shop_id" "uuid", "p_video_id" "uuid", "p_platform" "text", "p_metric_date" "date", "p_impressions" integer, "p_views" integer, "p_watch_time_seconds" numeric, "p_avg_watch_seconds" numeric, "p_likes" integer, "p_comments" integer, "p_shares" integer, "p_saves" integer, "p_clicks" integer, "p_leads" integer, "p_bookings" integer, "p_revenue" numeric, "p_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_work_order_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_work_order_status_del"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status_del"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status_del"() TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid", "p_location_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_part_request_items_for_line"("p_work_order_line_id" "uuid", "p_location_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_fleet_id_from_vehicle"("p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_fleet_id_from_vehicle"("p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_fleet_id_from_vehicle"("p_vehicle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_consumed_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_hours"("shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_hours"("shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_hours"("shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_authenticated"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_authenticated"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_authenticated"("uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_current_shop_id_from_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_shop_id_from_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_shop_id_from_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_inspection_template_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_edited_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_edited_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_edited_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_owner_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_owner_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_owner_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_part_request_status"("p_request" "uuid", "p_status" "public"."part_request_status") TO "anon";
GRANT ALL ON FUNCTION "public"."set_part_request_status"("p_request" "uuid", "p_status" "public"."part_request_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_part_request_status"("p_request" "uuid", "p_status" "public"."part_request_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_shop_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_shop_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_shop_profiles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_shop_ratings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_shop_ratings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_shop_ratings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_work_order_quote_lines"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_work_order_quote_lines"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_work_order_quote_lines"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_wol_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_wol_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_wol_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_wol_shop_id_from_wo"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_wol_shop_id_from_wo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_wol_shop_id_from_wo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_id_for"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_id_for"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_id_for"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_reel_settings_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."shop_reel_settings_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_reel_settings_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_role"("shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_role"("shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_role"("shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_role_v2"("shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_role_v2"("shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_role_v2"("shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."shop_staff_user_count"("p_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_staff_user_count"("p_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_staff_user_count"("p_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."shopreel_manual_assets_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."shopreel_manual_assets_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."shopreel_manual_assets_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sign_inspection"("p_inspection_id" "uuid", "p_role" "text", "p_signed_name" "text", "p_signature_image_path" "text", "p_signature_hash" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."sign_inspection"("p_inspection_id" "uuid", "p_role" "text", "p_signed_name" "text", "p_signature_image_path" "text", "p_signature_hash" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_line_on_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_line_on_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_line_on_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_wol_on_wo_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_wol_on_wo_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_wol_on_wo_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_inspections_from_inspection_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_inspections_from_inspection_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_inspections_from_inspection_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_invoice_from_work_order"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"("p_work_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"("p_work_order_id" "uuid") TO "supabase_read_only_user";



REVOKE ALL ON FUNCTION "public"."sync_invoice_from_work_order_admin"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order_admin"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_work_order_line_assignee"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_work_order_line_assignee"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_work_order_line_assignee"() TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_invoices_compute_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_invoices_compute_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_invoices_compute_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_invoices_sync_work_orders"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_invoices_sync_work_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_invoices_sync_work_orders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_log_part_fitment_event_from_allocation"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_log_part_fitment_event_from_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_log_part_fitment_event_from_allocation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_log_part_fitment_event_from_consumption"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_log_part_fitment_event_from_consumption"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_log_part_fitment_event_from_consumption"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_notify_quote_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_notify_quote_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_notify_quote_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_profiles_enforce_shop_user_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_profiles_enforce_shop_user_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_profiles_enforce_shop_user_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_profiles_recalc_shop_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_profiles_recalc_shop_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_profiles_recalc_shop_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_recompute_shop_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_recompute_shop_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_recompute_shop_rating"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_quoted_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_quoted_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_quoted_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_timestamps"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_work_orders_shop"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_work_orders_shop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_work_orders_shop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_shop_reviews_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_shop_reviews_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_shop_reviews_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_shops_set_owner_and_creator"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_shops_set_owner_and_creator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_shops_set_owner_and_creator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_work_orders_sync_vehicle_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_work_orders_sync_vehicle_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_work_orders_sync_vehicle_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_part_request_item_picked_consume"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_part_request_item_picked_consume"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_part_request_item_picked_consume"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_pri_auto_unreserve"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_pri_auto_unreserve"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_pri_auto_unreserve"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unreserve_part_request_item"("p_request_item_id" "uuid", "p_qty" numeric, "p_location_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_part_allocation_from_request_item"("p_request_item_id" "uuid", "p_location_id" "uuid", "p_create_stock_move" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_part_allocation_from_request_item"("p_request_item_id" "uuid", "p_location_id" "uuid", "p_create_stock_move" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_part_allocation_from_request_item"("p_request_item_id" "uuid", "p_location_id" "uuid", "p_create_stock_move" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_part_allocation_from_request_item"("p_request_item_id" "uuid", "p_location_id" "uuid", "p_create_stock_move" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_in_shop"("target_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_in_shop"("target_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_in_shop"("target_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wo_alloc_recompute_invoice_aiu"() TO "anon";
GRANT ALL ON FUNCTION "public"."wo_alloc_recompute_invoice_aiu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wo_alloc_recompute_invoice_aiu"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wo_release_parts_holds_for_part"("p_part_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wo_release_parts_holds_for_part"("p_part_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wo_release_parts_holds_for_part"("p_part_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wo_release_parts_holds_for_part"("p_part_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_assign_line_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_assign_line_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_assign_line_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_backfill_template_from_menu"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_backfill_template_from_menu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_backfill_template_from_menu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_copy_menu_parts_to_work_order_parts"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_copy_menu_parts_to_work_order_parts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_copy_menu_parts_to_work_order_parts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_create_inspection_session_before"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_create_inspection_session_before"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_create_inspection_session_before"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_delete_staged_parts_on_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_delete_staged_parts_on_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_delete_staged_parts_on_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_link_inspection_session_after"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_link_inspection_session_after"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_link_inspection_session_after"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_recompute_invoice_aiu"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_recompute_invoice_aiu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_recompute_invoice_aiu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_refresh_staged_parts_on_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_refresh_staged_parts_on_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_refresh_staged_parts_on_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wopa_sync_work_order_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."wopa_sync_work_order_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wopa_sync_work_order_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wor_enforce_shop_consistency"() TO "anon";
GRANT ALL ON FUNCTION "public"."wor_enforce_shop_consistency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wor_enforce_shop_consistency"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."work_order_in_my_shop"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."work_order_in_my_shop"("p_work_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."work_order_in_my_shop"("p_work_order_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."work_order_lines_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."work_order_lines_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."work_order_lines_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."work_orders_set_intake"("p_work_order_id" "uuid", "p_intake" "jsonb", "p_submit" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."work_orders_set_intake"("p_work_order_id" "uuid", "p_intake" "jsonb", "p_submit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."work_orders_set_intake"("p_work_order_id" "uuid", "p_intake" "jsonb", "p_submit" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";









GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."agent_attachments" TO "anon";
GRANT ALL ON TABLE "public"."agent_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."agent_events" TO "anon";
GRANT ALL ON TABLE "public"."agent_events" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_events" TO "service_role";



GRANT ALL ON TABLE "public"."agent_job_events" TO "anon";
GRANT ALL ON TABLE "public"."agent_job_events" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_job_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_job_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_job_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_job_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."agent_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."agent_requests" TO "anon";
GRANT ALL ON TABLE "public"."agent_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_requests" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_events" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generation_runs" TO "anon";
GRANT ALL ON TABLE "public"."ai_generation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_requests" TO "anon";
GRANT ALL ON TABLE "public"."ai_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_requests" TO "service_role";



GRANT ALL ON TABLE "public"."ai_training_data" TO "anon";
GRANT ALL ON TABLE "public"."ai_training_data" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_training_data" TO "service_role";



GRANT ALL ON TABLE "public"."ai_training_events" TO "anon";
GRANT ALL ON TABLE "public"."ai_training_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_training_events" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."apps" TO "anon";
GRANT ALL ON TABLE "public"."apps" TO "authenticated";
GRANT ALL ON TABLE "public"."apps" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."chat_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_participants" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."content_analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."content_analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."content_analytics_events" TO "service_role";



GRANT ALL ON TABLE "public"."content_assets" TO "anon";
GRANT ALL ON TABLE "public"."content_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."content_assets" TO "service_role";



GRANT ALL ON TABLE "public"."content_calendar_items" TO "anon";
GRANT ALL ON TABLE "public"."content_calendar_items" TO "authenticated";
GRANT ALL ON TABLE "public"."content_calendar_items" TO "service_role";



GRANT ALL ON TABLE "public"."content_calendars" TO "anon";
GRANT ALL ON TABLE "public"."content_calendars" TO "authenticated";
GRANT ALL ON TABLE "public"."content_calendars" TO "service_role";



GRANT ALL ON TABLE "public"."content_events" TO "anon";
GRANT ALL ON TABLE "public"."content_events" TO "authenticated";
GRANT ALL ON TABLE "public"."content_events" TO "service_role";



GRANT ALL ON TABLE "public"."content_pieces" TO "anon";
GRANT ALL ON TABLE "public"."content_pieces" TO "authenticated";
GRANT ALL ON TABLE "public"."content_pieces" TO "service_role";



GRANT ALL ON TABLE "public"."content_platform_accounts" TO "anon";
GRANT ALL ON TABLE "public"."content_platform_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."content_platform_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."content_publications" TO "anon";
GRANT ALL ON TABLE "public"."content_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."content_publications" TO "service_role";



GRANT ALL ON TABLE "public"."content_templates" TO "anon";
GRANT ALL ON TABLE "public"."content_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."content_templates" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT SELECT("conversation_id") ON TABLE "public"."conversation_participants" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."conversation_participants" TO "authenticated";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."customer_bookings" TO "anon";
GRANT ALL ON TABLE "public"."customer_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."customer_portal_invites" TO "anon";
GRANT ALL ON TABLE "public"."customer_portal_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_portal_invites" TO "service_role";



GRANT ALL ON TABLE "public"."customer_quotes" TO "anon";
GRANT ALL ON TABLE "public"."customer_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."customer_settings" TO "anon";
GRANT ALL ON TABLE "public"."customer_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_settings" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."cvip_specs" TO "anon";
GRANT ALL ON TABLE "public"."cvip_specs" TO "authenticated";
GRANT ALL ON TABLE "public"."cvip_specs" TO "service_role";



GRANT ALL ON TABLE "public"."cvip_thresholds" TO "anon";
GRANT ALL ON TABLE "public"."cvip_thresholds" TO "authenticated";
GRANT ALL ON TABLE "public"."cvip_thresholds" TO "service_role";



GRANT ALL ON TABLE "public"."cvip_thresholds_master" TO "anon";
GRANT ALL ON TABLE "public"."cvip_thresholds_master" TO "authenticated";
GRANT ALL ON TABLE "public"."cvip_thresholds_master" TO "service_role";



GRANT ALL ON TABLE "public"."decoded_vins" TO "anon";
GRANT ALL ON TABLE "public"."decoded_vins" TO "authenticated";
GRANT ALL ON TABLE "public"."decoded_vins" TO "service_role";



GRANT ALL ON TABLE "public"."defective_parts" TO "anon";
GRANT ALL ON TABLE "public"."defective_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."defective_parts" TO "service_role";



GRANT ALL ON TABLE "public"."demo_shop_boost_leads" TO "anon";
GRANT ALL ON TABLE "public"."demo_shop_boost_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_shop_boost_leads" TO "service_role";



GRANT ALL ON TABLE "public"."demo_shop_boosts" TO "anon";
GRANT ALL ON TABLE "public"."demo_shop_boosts" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_shop_boosts" TO "service_role";



GRANT ALL ON TABLE "public"."dtc_logs" TO "anon";
GRANT ALL ON TABLE "public"."dtc_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."dtc_logs" TO "service_role";



GRANT ALL ON TABLE "public"."email_logs" TO "anon";
GRANT ALL ON TABLE "public"."email_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_logs" TO "service_role";



GRANT ALL ON TABLE "public"."email_suppressions" TO "anon";
GRANT ALL ON TABLE "public"."email_suppressions" TO "authenticated";
GRANT ALL ON TABLE "public"."email_suppressions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_documents" TO "anon";
GRANT ALL ON TABLE "public"."employee_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_documents" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."feature_reads" TO "anon";
GRANT ALL ON TABLE "public"."feature_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_reads" TO "service_role";



GRANT ALL ON TABLE "public"."part_fitment_events" TO "anon";
GRANT ALL ON TABLE "public"."part_fitment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."part_fitment_events" TO "service_role";



GRANT ALL ON TABLE "public"."fitment_stats" TO "anon";
GRANT ALL ON TABLE "public"."fitment_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."fitment_stats" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_dispatch_assignments" TO "anon";
GRANT ALL ON TABLE "public"."fleet_dispatch_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_dispatch_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_form_uploads" TO "anon";
GRANT ALL ON TABLE "public"."fleet_form_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_form_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_inspection_schedules" TO "anon";
GRANT ALL ON TABLE "public"."fleet_inspection_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_inspection_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_members" TO "anon";
GRANT ALL ON TABLE "public"."fleet_members" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_members" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_pretrip_reports" TO "anon";
GRANT ALL ON TABLE "public"."fleet_pretrip_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_pretrip_reports" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_program_tasks" TO "anon";
GRANT ALL ON TABLE "public"."fleet_program_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_program_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_programs" TO "anon";
GRANT ALL ON TABLE "public"."fleet_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_programs" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_service_requests" TO "anon";
GRANT ALL ON TABLE "public"."fleet_service_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_service_requests" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_vehicles" TO "anon";
GRANT ALL ON TABLE "public"."fleet_vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."fleets" TO "anon";
GRANT ALL ON TABLE "public"."fleets" TO "authenticated";
GRANT ALL ON TABLE "public"."fleets" TO "service_role";



GRANT ALL ON TABLE "public"."followups" TO "anon";
GRANT ALL ON TABLE "public"."followups" TO "authenticated";
GRANT ALL ON TABLE "public"."followups" TO "service_role";



GRANT ALL ON TABLE "public"."history" TO "anon";
GRANT ALL ON TABLE "public"."history" TO "authenticated";
GRANT ALL ON TABLE "public"."history" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_items" TO "anon";
GRANT ALL ON TABLE "public"."inspection_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_items" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_photos" TO "anon";
GRANT ALL ON TABLE "public"."inspection_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_photos" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_result_items" TO "anon";
GRANT ALL ON TABLE "public"."inspection_result_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_result_items" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_results" TO "anon";
GRANT ALL ON TABLE "public"."inspection_results" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_results" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_session_payloads" TO "anon";
GRANT ALL ON TABLE "public"."inspection_session_payloads" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_session_payloads" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_sessions" TO "anon";
GRANT ALL ON TABLE "public"."inspection_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_signatures" TO "anon";
GRANT ALL ON TABLE "public"."inspection_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_template_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."inspection_template_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_template_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_templates" TO "anon";
GRANT ALL ON TABLE "public"."inspection_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_templates" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



GRANT ALL ON TABLE "public"."integration_logs" TO "anon";
GRANT ALL ON TABLE "public"."integration_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_logs" TO "service_role";



GRANT ALL ON TABLE "public"."integrations" TO "anon";
GRANT ALL ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_documents" TO "anon";
GRANT ALL ON TABLE "public"."invoice_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_documents" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."lead_events" TO "anon";
GRANT ALL ON TABLE "public"."lead_events" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_events" TO "service_role";



GRANT ALL ON TABLE "public"."learning_feedback" TO "anon";
GRANT ALL ON TABLE "public"."learning_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_rules" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_rules" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_services" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_services" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_services" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."media_uploads" TO "anon";
GRANT ALL ON TABLE "public"."media_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."media_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."menu_item_parts" TO "anon";
GRANT ALL ON TABLE "public"."menu_item_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_item_parts" TO "service_role";



GRANT ALL ON TABLE "public"."menu_item_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."menu_item_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_item_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."menu_pricing" TO "anon";
GRANT ALL ON TABLE "public"."menu_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."message_reads" TO "anon";
GRANT ALL ON TABLE "public"."message_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reads" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."org_members" TO "anon";
GRANT ALL ON TABLE "public"."org_members" TO "authenticated";
GRANT ALL ON TABLE "public"."org_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."part_barcodes" TO "anon";
GRANT ALL ON TABLE "public"."part_barcodes" TO "authenticated";
GRANT ALL ON TABLE "public"."part_barcodes" TO "service_role";



GRANT ALL ON TABLE "public"."part_compatibility" TO "anon";
GRANT ALL ON TABLE "public"."part_compatibility" TO "authenticated";
GRANT ALL ON TABLE "public"."part_compatibility" TO "service_role";



GRANT ALL ON TABLE "public"."part_purchases" TO "anon";
GRANT ALL ON TABLE "public"."part_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."part_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."part_request_items" TO "anon";
GRANT ALL ON TABLE "public"."part_request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."part_request_items" TO "service_role";



GRANT ALL ON TABLE "public"."part_request_lines" TO "anon";
GRANT ALL ON TABLE "public"."part_request_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."part_request_lines" TO "service_role";



GRANT ALL ON TABLE "public"."part_requests" TO "anon";
GRANT ALL ON TABLE "public"."part_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."part_requests" TO "service_role";



GRANT ALL ON TABLE "public"."part_returns" TO "anon";
GRANT ALL ON TABLE "public"."part_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."part_returns" TO "service_role";



GRANT ALL ON TABLE "public"."part_stock" TO "anon";
GRANT ALL ON TABLE "public"."part_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."part_stock" TO "service_role";



GRANT ALL ON TABLE "public"."parts" TO "anon";
GRANT ALL ON TABLE "public"."parts" TO "authenticated";
GRANT ALL ON TABLE "public"."parts" TO "service_role";



GRANT ALL ON TABLE "public"."part_stock_summary" TO "anon";
GRANT ALL ON TABLE "public"."part_stock_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."part_stock_summary" TO "service_role";



GRANT ALL ON TABLE "public"."part_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."part_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."part_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."part_warranties" TO "anon";
GRANT ALL ON TABLE "public"."part_warranties" TO "authenticated";
GRANT ALL ON TABLE "public"."part_warranties" TO "service_role";



GRANT ALL ON TABLE "public"."parts_barcodes" TO "anon";
GRANT ALL ON TABLE "public"."parts_barcodes" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_barcodes" TO "service_role";



GRANT ALL ON TABLE "public"."parts_messages" TO "anon";
GRANT ALL ON TABLE "public"."parts_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_messages" TO "service_role";



GRANT ALL ON TABLE "public"."parts_quote_requests" TO "anon";
GRANT ALL ON TABLE "public"."parts_quote_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_quote_requests" TO "service_role";



GRANT ALL ON TABLE "public"."parts_quotes" TO "anon";
GRANT ALL ON TABLE "public"."parts_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."parts_request_messages" TO "anon";
GRANT ALL ON TABLE "public"."parts_request_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_request_messages" TO "service_role";



GRANT ALL ON TABLE "public"."parts_requests" TO "anon";
GRANT ALL ON TABLE "public"."parts_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_requests" TO "service_role";



GRANT ALL ON TABLE "public"."parts_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."parts_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_deductions" TO "anon";
GRANT ALL ON TABLE "public"."payroll_deductions" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_deductions" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_export_log" TO "anon";
GRANT ALL ON TABLE "public"."payroll_export_log" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_export_log" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_pay_periods" TO "anon";
GRANT ALL ON TABLE "public"."payroll_pay_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_pay_periods" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_providers" TO "anon";
GRANT ALL ON TABLE "public"."payroll_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_providers" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_timecards" TO "anon";
GRANT ALL ON TABLE "public"."payroll_timecards" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_timecards" TO "service_role";



GRANT ALL ON TABLE "public"."planner_events" TO "anon";
GRANT ALL ON TABLE "public"."planner_events" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_events" TO "service_role";



GRANT ALL ON TABLE "public"."planner_runs" TO "anon";
GRANT ALL ON TABLE "public"."planner_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_runs" TO "service_role";



GRANT ALL ON TABLE "public"."portal_notifications" TO "anon";
GRANT ALL ON TABLE "public"."portal_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."punch_events" TO "anon";
GRANT ALL ON TABLE "public"."punch_events" TO "authenticated";
GRANT ALL ON TABLE "public"."punch_events" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_lines" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_lines" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."quote_lines" TO "anon";
GRANT ALL ON TABLE "public"."quote_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_lines" TO "service_role";



GRANT ALL ON TABLE "public"."reel_plans" TO "anon";
GRANT ALL ON TABLE "public"."reel_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_plans" TO "service_role";



GRANT ALL ON TABLE "public"."reel_render_jobs" TO "anon";
GRANT ALL ON TABLE "public"."reel_render_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_render_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."saved_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."saved_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."shop_ai_profiles" TO "anon";
GRANT ALL ON TABLE "public"."shop_ai_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_ai_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shop_boost_intakes" TO "anon";
GRANT ALL ON TABLE "public"."shop_boost_intakes" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_boost_intakes" TO "service_role";



GRANT ALL ON TABLE "public"."shop_content_signals" TO "anon";
GRANT ALL ON TABLE "public"."shop_content_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_content_signals" TO "service_role";



GRANT ALL ON TABLE "public"."shop_health_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."shop_health_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_health_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."shop_hours" TO "anon";
GRANT ALL ON TABLE "public"."shop_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_hours" TO "service_role";



GRANT ALL ON TABLE "public"."shop_import_files" TO "anon";
GRANT ALL ON TABLE "public"."shop_import_files" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_import_files" TO "service_role";



GRANT ALL ON TABLE "public"."shop_import_rows" TO "anon";
GRANT ALL ON TABLE "public"."shop_import_rows" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_import_rows" TO "service_role";



GRANT ALL ON TABLE "public"."shop_marketing_memory" TO "anon";
GRANT ALL ON TABLE "public"."shop_marketing_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_marketing_memory" TO "service_role";



GRANT ALL ON TABLE "public"."shop_members" TO "anon";
GRANT ALL ON TABLE "public"."shop_members" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_members" TO "service_role";



GRANT ALL ON TABLE "public"."shop_parts" TO "anon";
GRANT ALL ON TABLE "public"."shop_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_parts" TO "service_role";



GRANT ALL ON TABLE "public"."shop_profiles" TO "anon";
GRANT ALL ON TABLE "public"."shop_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shops" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shops" TO "authenticated";
GRANT ALL ON TABLE "public"."shops" TO "service_role";



GRANT ALL ON TABLE "public"."shop_public_profiles" TO "anon";
GRANT ALL ON TABLE "public"."shop_public_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_public_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shop_ratings" TO "anon";
GRANT ALL ON TABLE "public"."shop_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."shop_reel_settings" TO "anon";
GRANT ALL ON TABLE "public"."shop_reel_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_reel_settings" TO "service_role";



GRANT ALL ON TABLE "public"."shop_reviews" TO "anon";
GRANT ALL ON TABLE "public"."shop_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."shop_reviews_public" TO "anon";
GRANT ALL ON TABLE "public"."shop_reviews_public" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_reviews_public" TO "service_role";



GRANT ALL ON TABLE "public"."shop_schedules" TO "anon";
GRANT ALL ON TABLE "public"."shop_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."shop_settings" TO "anon";
GRANT ALL ON TABLE "public"."shop_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_settings" TO "service_role";



GRANT ALL ON TABLE "public"."shop_tax_overrides" TO "anon";
GRANT ALL ON TABLE "public"."shop_tax_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_tax_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."shop_time_off" TO "anon";
GRANT ALL ON TABLE "public"."shop_time_off" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_time_off" TO "service_role";



GRANT ALL ON TABLE "public"."shop_time_slots" TO "anon";
GRANT ALL ON TABLE "public"."shop_time_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_time_slots" TO "service_role";



GRANT ALL ON TABLE "public"."shop_users" TO "anon";
GRANT ALL ON TABLE "public"."shop_users" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_users" TO "service_role";



GRANT ALL ON TABLE "public"."shop_vehicle_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."shop_vehicle_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_vehicle_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."shopreel_manual_asset_files" TO "anon";
GRANT ALL ON TABLE "public"."shopreel_manual_asset_files" TO "authenticated";
GRANT ALL ON TABLE "public"."shopreel_manual_asset_files" TO "service_role";



GRANT ALL ON TABLE "public"."shopreel_manual_assets" TO "anon";
GRANT ALL ON TABLE "public"."shopreel_manual_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."shopreel_manual_assets" TO "service_role";



GRANT ALL ON TABLE "public"."shopreel_publications" TO "anon";
GRANT ALL ON TABLE "public"."shopreel_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."shopreel_publications" TO "service_role";



GRANT ALL ON TABLE "public"."shopreel_publish_jobs" TO "anon";
GRANT ALL ON TABLE "public"."shopreel_publish_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."shopreel_publish_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."shopreel_social_connections" TO "anon";
GRANT ALL ON TABLE "public"."shopreel_social_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."shopreel_social_connections" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invite_candidates" TO "anon";
GRANT ALL ON TABLE "public"."staff_invite_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invite_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invite_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."staff_invite_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invite_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."stock_balances" TO "anon";
GRANT ALL ON TABLE "public"."stock_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_balances" TO "service_role";



GRANT ALL ON TABLE "public"."stock_locations" TO "anon";
GRANT ALL ON TABLE "public"."stock_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_locations" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."supplier_catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_orders" TO "anon";
GRANT ALL ON TABLE "public"."supplier_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_orders" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_price_history" TO "anon";
GRANT ALL ON TABLE "public"."supplier_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."tax_calculation_log" TO "anon";
GRANT ALL ON TABLE "public"."tax_calculation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_calculation_log" TO "service_role";



GRANT ALL ON TABLE "public"."tax_jurisdictions" TO "anon";
GRANT ALL ON TABLE "public"."tax_jurisdictions" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_jurisdictions" TO "service_role";



GRANT ALL ON TABLE "public"."tax_providers" TO "anon";
GRANT ALL ON TABLE "public"."tax_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_providers" TO "service_role";



GRANT ALL ON TABLE "public"."tax_rates" TO "anon";
GRANT ALL ON TABLE "public"."tax_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_rates" TO "service_role";



GRANT ALL ON TABLE "public"."tech_sessions" TO "anon";
GRANT ALL ON TABLE "public"."tech_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."tech_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."tech_shifts" TO "anon";
GRANT ALL ON TABLE "public"."tech_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."tech_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."template_items" TO "anon";
GRANT ALL ON TABLE "public"."template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."template_items" TO "service_role";



GRANT ALL ON TABLE "public"."usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_app_layouts" TO "anon";
GRANT ALL ON TABLE "public"."user_app_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_app_layouts" TO "service_role";



GRANT ALL ON TABLE "public"."user_plans" TO "anon";
GRANT ALL ON TABLE "public"."user_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plans" TO "service_role";



GRANT ALL ON TABLE "public"."user_widget_layouts" TO "anon";
GRANT ALL ON TABLE "public"."user_widget_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_widget_layouts" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."v_fleet_inspections_due_30" TO "anon";
GRANT ALL ON TABLE "public"."v_fleet_inspections_due_30" TO "authenticated";
GRANT ALL ON TABLE "public"."v_fleet_inspections_due_30" TO "service_role";



GRANT ALL ON TABLE "public"."v_fleet_inspection_buckets" TO "anon";
GRANT ALL ON TABLE "public"."v_fleet_inspection_buckets" TO "authenticated";
GRANT ALL ON TABLE "public"."v_fleet_inspection_buckets" TO "service_role";



GRANT ALL ON TABLE "public"."v_fleet_inspections_due_14" TO "anon";
GRANT ALL ON TABLE "public"."v_fleet_inspections_due_14" TO "authenticated";
GRANT ALL ON TABLE "public"."v_fleet_inspections_due_14" TO "service_role";



GRANT ALL ON TABLE "public"."v_fleet_inspections_due_7" TO "anon";
GRANT ALL ON TABLE "public"."v_fleet_inspections_due_7" TO "authenticated";
GRANT ALL ON TABLE "public"."v_fleet_inspections_due_7" TO "service_role";



GRANT ALL ON TABLE "public"."v_global_saved_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."v_global_saved_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."v_global_saved_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."v_my_conversation_ids" TO "anon";
GRANT ALL ON TABLE "public"."v_my_conversation_ids" TO "authenticated";
GRANT ALL ON TABLE "public"."v_my_conversation_ids" TO "service_role";



GRANT ALL ON TABLE "public"."v_my_messages" TO "anon";
GRANT ALL ON TABLE "public"."v_my_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."v_my_messages" TO "service_role";



GRANT ALL ON TABLE "public"."v_part_stock" TO "anon";
GRANT ALL ON TABLE "public"."v_part_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."v_part_stock" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "anon";
GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_parts" TO "anon";
GRANT ALL ON TABLE "public"."work_order_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_parts" TO "service_role";



GRANT ALL ON TABLE "public"."v_parts_reconciliation" TO "anon";
GRANT ALL ON TABLE "public"."v_parts_reconciliation" TO "authenticated";
GRANT ALL ON TABLE "public"."v_parts_reconciliation" TO "service_role";



GRANT ALL ON TABLE "public"."v_portal_invoices" TO "anon";
GRANT ALL ON TABLE "public"."v_portal_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."v_portal_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_lines" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."work_order_lines" TO "authenticated";



GRANT ALL ON TABLE "public"."v_quote_queue" TO "anon";
GRANT ALL ON TABLE "public"."v_quote_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."v_quote_queue" TO "service_role";



GRANT ALL ON TABLE "public"."v_shift_rollups" TO "anon";
GRANT ALL ON TABLE "public"."v_shift_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shift_rollups" TO "service_role";



GRANT ALL ON TABLE "public"."v_shop_boost_overview" TO "anon";
GRANT ALL ON TABLE "public"."v_shop_boost_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shop_boost_overview" TO "service_role";



GRANT ALL ON TABLE "public"."v_shop_boost_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."v_shop_boost_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shop_boost_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."v_shop_health_latest" TO "anon";
GRANT ALL ON TABLE "public"."v_shop_health_latest" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shop_health_latest" TO "service_role";



GRANT ALL ON TABLE "public"."v_staff_invites_common" TO "anon";
GRANT ALL ON TABLE "public"."v_staff_invites_common" TO "authenticated";
GRANT ALL ON TABLE "public"."v_staff_invites_common" TO "service_role";



GRANT ALL ON TABLE "public"."videos" TO "anon";
GRANT ALL ON TABLE "public"."videos" TO "authenticated";
GRANT ALL ON TABLE "public"."videos" TO "service_role";



GRANT ALL ON TABLE "public"."v_top_content_types_by_shop" TO "anon";
GRANT ALL ON TABLE "public"."v_top_content_types_by_shop" TO "authenticated";
GRANT ALL ON TABLE "public"."v_top_content_types_by_shop" TO "service_role";



GRANT ALL ON TABLE "public"."v_vehicle_service_history" TO "anon";
GRANT ALL ON TABLE "public"."v_vehicle_service_history" TO "authenticated";
GRANT ALL ON TABLE "public"."v_vehicle_service_history" TO "service_role";



GRANT ALL ON TABLE "public"."video_platform_posts" TO "anon";
GRANT ALL ON TABLE "public"."video_platform_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."video_platform_posts" TO "service_role";



GRANT ALL ON TABLE "public"."v_video_performance_summary" TO "anon";
GRANT ALL ON TABLE "public"."v_video_performance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."v_video_performance_summary" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_line_technicians" TO "anon";
GRANT ALL ON TABLE "public"."work_order_line_technicians" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_line_technicians" TO "service_role";



GRANT ALL ON TABLE "public"."v_work_order_board_cards_shop" TO "anon";
GRANT ALL ON TABLE "public"."v_work_order_board_cards_shop" TO "authenticated";
GRANT ALL ON TABLE "public"."v_work_order_board_cards_shop" TO "service_role";



GRANT ALL ON TABLE "public"."v_work_order_board_cards_fleet" TO "anon";
GRANT ALL ON TABLE "public"."v_work_order_board_cards_fleet" TO "authenticated";
GRANT ALL ON TABLE "public"."v_work_order_board_cards_fleet" TO "service_role";



GRANT ALL ON TABLE "public"."v_work_order_board_cards_portal" TO "anon";
GRANT ALL ON TABLE "public"."v_work_order_board_cards_portal" TO "authenticated";
GRANT ALL ON TABLE "public"."v_work_order_board_cards_portal" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_media" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_media" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_media" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_menus" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_menus" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_photos" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_photos" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_recalls" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_recalls" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_recalls" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_signatures" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_part_numbers" TO "anon";
GRANT ALL ON TABLE "public"."vendor_part_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_part_numbers" TO "service_role";



GRANT ALL ON TABLE "public"."video_publications" TO "anon";
GRANT ALL ON TABLE "public"."video_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."video_publications" TO "service_role";



GRANT ALL ON TABLE "public"."vin_decodes" TO "anon";
GRANT ALL ON TABLE "public"."vin_decodes" TO "authenticated";
GRANT ALL ON TABLE "public"."vin_decodes" TO "service_role";



GRANT ALL ON TABLE "public"."viral_hook_tests" TO "anon";
GRANT ALL ON TABLE "public"."viral_hook_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."viral_hook_tests" TO "service_role";



GRANT ALL ON TABLE "public"."warranties" TO "anon";
GRANT ALL ON TABLE "public"."warranties" TO "authenticated";
GRANT ALL ON TABLE "public"."warranties" TO "service_role";



GRANT ALL ON TABLE "public"."warranty_claims" TO "anon";
GRANT ALL ON TABLE "public"."warranty_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."warranty_claims" TO "service_role";



GRANT ALL ON TABLE "public"."widget_instances" TO "anon";
GRANT ALL ON TABLE "public"."widget_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."widget_instances" TO "service_role";



GRANT ALL ON TABLE "public"."widgets" TO "anon";
GRANT ALL ON TABLE "public"."widgets" TO "authenticated";
GRANT ALL ON TABLE "public"."widgets" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_approvals" TO "anon";
GRANT ALL ON TABLE "public"."work_order_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_invoice_reviews" TO "anon";
GRANT ALL ON TABLE "public"."work_order_invoice_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_invoice_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_line_ai" TO "anon";
GRANT ALL ON TABLE "public"."work_order_line_ai" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_line_ai" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_line_history" TO "anon";
GRANT ALL ON TABLE "public"."work_order_line_history" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_line_history" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_media" TO "anon";
GRANT ALL ON TABLE "public"."work_order_media" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_media" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_quote_lines" TO "anon";
GRANT ALL ON TABLE "public"."work_order_quote_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_quote_lines" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























drop policy "agent_actions_deny_all" on "public"."agent_actions";

drop policy "agent_messages_deny_all" on "public"."agent_messages";

drop policy "Public can read published reviews" on "public"."shop_reviews";

revoke delete on table "public"."ai_events" from "authenticated";

revoke update on table "public"."ai_events" from "authenticated";

revoke delete on table "public"."customers" from "anon";

revoke insert on table "public"."customers" from "anon";

revoke references on table "public"."customers" from "anon";

revoke select on table "public"."customers" from "anon";

revoke trigger on table "public"."customers" from "anon";

revoke truncate on table "public"."customers" from "anon";

revoke update on table "public"."customers" from "anon";

revoke delete on table "public"."inspections" from "anon";

revoke insert on table "public"."inspections" from "anon";

revoke references on table "public"."inspections" from "anon";

revoke select on table "public"."inspections" from "anon";

revoke trigger on table "public"."inspections" from "anon";

revoke truncate on table "public"."inspections" from "anon";

revoke update on table "public"."inspections" from "anon";

revoke delete on table "public"."shops" from "authenticated";

revoke insert on table "public"."shops" from "authenticated";

revoke delete on table "public"."vehicles" from "anon";

revoke insert on table "public"."vehicles" from "anon";

revoke references on table "public"."vehicles" from "anon";

revoke select on table "public"."vehicles" from "anon";

revoke trigger on table "public"."vehicles" from "anon";

revoke truncate on table "public"."vehicles" from "anon";

revoke update on table "public"."vehicles" from "anon";

revoke delete on table "public"."work_order_lines" from "anon";

revoke insert on table "public"."work_order_lines" from "anon";

revoke references on table "public"."work_order_lines" from "anon";

revoke select on table "public"."work_order_lines" from "anon";

revoke trigger on table "public"."work_order_lines" from "anon";

revoke truncate on table "public"."work_order_lines" from "anon";

revoke update on table "public"."work_order_lines" from "anon";

revoke references on table "public"."work_order_lines" from "authenticated";

revoke trigger on table "public"."work_order_lines" from "authenticated";

revoke truncate on table "public"."work_order_lines" from "authenticated";


  create policy "agent_actions_deny_all"
  on "public"."agent_actions"
  as permissive
  for all
  to anon, authenticated
using (false)
with check (false);



  create policy "agent_messages_deny_all"
  on "public"."agent_messages"
  as permissive
  for all
  to anon, authenticated
using (false)
with check (false);



  create policy "Public can read published reviews"
  on "public"."shop_reviews"
  as permissive
  for select
  to anon, authenticated
using ((is_public = true));


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "chat_realtime_insert"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE (((cp.conversation_id)::text = split_part(messages.topic, ':'::text, 2)) AND (cp.user_id = auth.uid())))));



  create policy "chat_realtime_select"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE (((cp.conversation_id)::text = split_part(messages.topic, ':'::text, 2)) AND (cp.user_id = auth.uid())))));



  create policy "conversation_members_can_read"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using (((topic ~~ 'conversation:%:messages'::text) AND (EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.user_id = auth.uid()) AND (cp.conversation_id = (split_part(messages.topic, ':'::text, 2))::uuid))))));



  create policy "conversation_members_can_write"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check (((topic ~~ 'conversation:%:messages'::text) AND (EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.user_id = auth.uid()) AND (cp.conversation_id = (split_part(messages.topic, ':'::text, 2))::uuid))))));



  create policy "admin_delete_all_inspection_photos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'inspection_photos'::text) AND public.is_admin()));



  create policy "admin_read_all_inspection_photos"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'inspection_photos'::text) AND public.is_admin()));



  create policy "admin_update_all_inspection_photos"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'inspection_photos'::text) AND public.is_admin()))
with check (((bucket_id = 'inspection_photos'::text) AND public.is_admin()));



  create policy "agent_uploads_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'agent_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "agent_uploads_delete_auth"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_insert_auth"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_objects_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'agent_uploads'::text) AND (owner = auth.uid())));



  create policy "agent_uploads_objects_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_objects_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_objects_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'agent_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text)));



  create policy "agent_uploads_select_auth"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'agent_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))
with check (((bucket_id = 'agent_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "agent_uploads_update_auth"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'agent_uploads'::text))
with check ((bucket_id = 'agent_uploads'::text));



  create policy "agent_uploads_write"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'agent_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "edocs_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'employee_docs'::text))
with check ((bucket_id = 'employee_docs'::text));



  create policy "fleet-forms uploads (images + pdf)"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'fleet-forms'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (lower(storage.extension(name)) = ANY (ARRAY['jpg'::text, 'jpeg'::text, 'png'::text, 'gif'::text, 'webp'::text, 'heic'::text, 'heif'::text, 'tif'::text, 'tiff'::text, 'pdf'::text]))));



  create policy "fleet_forms_service_role_all"
  on "storage"."objects"
  as permissive
  for all
  to service_role
using ((bucket_id = 'fleet-forms'::text))
with check ((bucket_id = 'fleet-forms'::text));



  create policy "fleet_forms_user_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'fleet-forms'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));



  create policy "fleet_forms_user_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'fleet-forms'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));



  create policy "fleet_forms_user_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'fleet-forms'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));



  create policy "fleet_forms_user_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'fleet-forms'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
with check (((bucket_id = 'fleet-forms'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));



  create policy "inspection pdfs read (scoped)"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'inspection_pdfs'::text) AND (EXISTS ( SELECT 1
   FROM ((public.inspections i
     JOIN public.work_orders w ON ((w.id = i.work_order_id)))
     JOIN public.profiles p ON (((p.id = auth.uid()) AND (p.shop_id = w.shop_id))))
  WHERE (i.pdf_storage_path = objects.name)))));



  create policy "inspection_pdfs_insert_shop"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'inspection_pdfs'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "inspection_pdfs_read_shop"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'inspection_pdfs'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "inspection_pdfs_update_shop"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'inspection_pdfs'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))))
with check (((bucket_id = 'inspection_pdfs'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "inspection_photos_delete_shop"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'inspection_photos'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "inspection_photos_insert_shop"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'inspection_photos'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "inspection_photos_read_shop"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'inspection_photos'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "inspection_photos_update_shop"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'inspection_photos'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))))
with check (((bucket_id = 'inspection_photos'::text) AND (name ~~ (('shops/'::text || (public.current_shop_id())::text) || '/%'::text))));



  create policy "job_photos_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'job-photos'::text));



  create policy "job_photos_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'job-photos'::text));



  create policy "job_photos_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'job-photos'::text));



  create policy "job_photos_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'job-photos'::text))
with check ((bucket_id = 'job-photos'::text));



  create policy "part_images_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'part_images'::text));



  create policy "part_images_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'part_images'::text));



  create policy "part_images_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'part_images'::text));



  create policy "part_images_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'part_images'::text))
with check ((bucket_id = 'part_images'::text));



  create policy "parts_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'parts-photos'::text))
with check ((bucket_id = 'parts-photos'::text));



  create policy "planner_uploads_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'planner_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "planner_uploads_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'planner_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text)));



  create policy "planner_uploads_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'planner_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))
with check (((bucket_id = 'planner_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "planner_uploads_write"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'planner_uploads'::text) AND ((storage.foldername(name))[1] = (public.current_shop_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "pphotos_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'profile-photos'::text))
with check ((bucket_id = 'profile-photos'::text));



  create policy "quotes_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'quotes'::text))
with check ((bucket_id = 'quotes'::text));



  create policy "quotes_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'quotes'::text));



  create policy "quotes_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'quotes'::text));



  create policy "quotes_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'quotes'::text));



  create policy "quotes_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'quotes'::text))
with check ((bucket_id = 'quotes'::text));



  create policy "quotes_write"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'quotes'::text));



  create policy "shop-imports delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'shop-imports'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "shop-imports insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'shop-imports'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "shop-imports read scoped to shop folder"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'shop-imports'::text) AND ((name ~~ (('shops/'::text || ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) || '/%'::text)) OR (name ~~ (( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) || '/%'::text)))));



  create policy "shop-imports read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'shop-imports'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "shop-imports update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'shop-imports'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
with check (((bucket_id = 'shop-imports'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "shop-imports upload scoped to shop folder"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'shop-imports'::text) AND ((name ~~ (('shops/'::text || ( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) || '/%'::text)) OR (name ~~ (( SELECT (profiles.shop_id)::text AS shop_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) || '/%'::text)))));



  create policy "shopreel_media_delete_authenticated"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'shopreel-media'::text) AND (split_part(name, '/'::text, 1) = (public.current_shop_id())::text)));



  create policy "shopreel_media_insert_authenticated"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'shopreel-media'::text) AND (split_part(name, '/'::text, 1) = (public.current_shop_id())::text)));



  create policy "shopreel_media_select_authenticated"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'shopreel-media'::text));



  create policy "shopreel_media_update_authenticated"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'shopreel-media'::text) AND (split_part(name, '/'::text, 1) = (public.current_shop_id())::text)))
with check (((bucket_id = 'shopreel-media'::text) AND (split_part(name, '/'::text, 1) = (public.current_shop_id())::text)));



  create policy "signatures_delete_auth"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'signatures'::text));



  create policy "signatures_insert_auth"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'signatures'::text));



  create policy "signatures_select_auth"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'signatures'::text));



  create policy "signatures_update_auth"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'signatures'::text))
with check ((bucket_id = 'signatures'::text));



  create policy "storage_read_by_auth"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (true);



  create policy "user reads fleet forms"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'fleet-forms'::text) AND (COALESCE((storage.foldername(name))[1], ''::text) = (( SELECT auth.uid() AS uid))::text)));



  create policy "user reads own fleet forms"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'fleet-forms'::text) AND (COALESCE((storage.foldername(name))[1], ''::text) = (( SELECT auth.uid() AS uid))::text)));



  create policy "user uploads fleet forms"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'fleet-forms'::text) AND (COALESCE((storage.foldername(name))[1], ''::text) = (( SELECT auth.uid() AS uid))::text) AND (lower(storage.extension(name)) = ANY (ARRAY['jpg'::text, 'jpeg'::text, 'png'::text, 'heic'::text, 'pdf'::text]))));



  create policy "vdocs_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'vehicle-docs'::text))
with check ((bucket_id = 'vehicle-docs'::text));



  create policy "vehicle-photos delete own"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'vehicle-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));



  create policy "vphotos_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'vehicle-photos'::text))
with check ((bucket_id = 'vehicle-photos'::text));



  create policy "workorders_bucket_guard"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'workorders'::text))
with check ((bucket_id = 'workorders'::text));



