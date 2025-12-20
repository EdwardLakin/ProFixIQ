

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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



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
    'customer'
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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
DECLARE
  v_uid uuid;
  v_shop_id uuid;
  v_customer_id uuid;
  v_request_id uuid;

  v_item jsonb;
  v_desc text;
  v_qty numeric;

  v_is_staff boolean := false;
  v_is_owner boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array';
  END IF;

  -- Load WO + shop + customer
  SELECT wo.shop_id, wo.customer_id
    INTO v_shop_id, v_customer_id
  FROM public.work_orders wo
  WHERE wo.id = p_work_order_id;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  -- Authorization:
  -- Staff for this shop OR the portal customer who owns the work order.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.shop_id = v_shop_id
      AND (p.role IN ('owner','admin','manager','advisor','mechanic','parts'))
  )
  INTO v_is_staff;

  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_customer_id
      AND c.user_id = v_uid
  )
  INTO v_is_owner;

  IF NOT v_is_staff AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Prevent duplicates (active request already exists)
  IF EXISTS (
    SELECT 1
    FROM public.part_requests pr
    WHERE pr.work_order_id = p_work_order_id
      AND pr.status IN ('requested','quoted','approved')
  ) THEN
    -- Return the newest active request id (safe / idempotent)
    SELECT pr.id
      INTO v_request_id
    FROM public.part_requests pr
    WHERE pr.work_order_id = p_work_order_id
      AND pr.status IN ('requested','quoted','approved')
    ORDER BY pr.created_at DESC NULLS LAST
    LIMIT 1;

    RETURN v_request_id;
  END IF;

  -- Create parent request
  INSERT INTO public.part_requests (
    shop_id,
    work_order_id,
    job_id,
    requested_by,
    notes,
    status
  )
  VALUES (
    v_shop_id,
    p_work_order_id,
    p_job_id,
    v_uid,
    NULLIF(trim(coalesce(p_notes,'')), ''),
    'requested'
  )
  RETURNING id INTO v_request_id;

  -- Insert items
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_desc := NULLIF(trim(coalesce(v_item->>'description','')), '');
    IF v_desc IS NULL THEN
      RAISE EXCEPTION 'Each item requires a non-empty description. Item=%', v_item;
    END IF;

    BEGIN
      v_qty := COALESCE((v_item->>'qty')::numeric, 1);
    EXCEPTION WHEN others THEN
      v_qty := 1;
    END;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Item qty must be > 0. Item=%', v_item;
    END IF;

    INSERT INTO public.part_request_items (
      request_id,
      description,
      qty
    )
    VALUES (
      v_request_id,
      v_desc,
      v_qty
    );
  END LOOP;

  RETURN v_request_id;
END;
$$;


ALTER FUNCTION "public"."create_part_request_with_items"("p_work_order_id" "uuid", "p_items" "jsonb", "p_job_id" "uuid", "p_notes" "text") OWNER TO "postgres";


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


CREATE PROCEDURE "public"."ensure_same_shop_policies"(IN "tab" "regclass", IN "shop_col" "text" DEFAULT 'shop_id'::"text")
    LANGUAGE "plpgsql"
    AS $$
declare
  rel text := tab::text;
  base text := split_part(tab::text, '.', 2);
begin
  execute format(
    'create policy if not exists %I on %s for select to authenticated using (%I = public.current_shop_id())',
    base||'_same_shop_select', rel, shop_col
  );
  execute format(
    'create policy if not exists %I on %s for insert to authenticated with check (%I = public.current_shop_id())',
    base||'_same_shop_insert', rel, shop_col
  );
  execute format(
    'create policy if not exists %I on %s for update to authenticated using (%I = public.current_shop_id()) with check (%I = public.current_shop_id())',
    base||'_same_shop_update', rel, shop_col, shop_col
  );
  execute format(
    'create policy if not exists %I on %s for delete to authenticated using (%I = public.current_shop_id())',
    base||'_same_shop_delete', rel, shop_col
  );
  execute format('create index if not exists %I on %s(%I)', 'idx_'||base||'_'||shop_col, rel, shop_col);
end$$;


ALTER PROCEDURE "public"."ensure_same_shop_policies"(IN "tab" "regclass", IN "shop_col" "text") OWNER TO "postgres";


CREATE PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "user_col" "text" DEFAULT 'user_id'::"text")
    LANGUAGE "plpgsql"
    AS $$
declare
  rel text := tab::text;
  base text := split_part(tab::text, '.', 2);
begin
  execute format(
    'create policy if not exists %I on %s for select to authenticated using (%I = auth.uid())',
    base||'_self_select', rel, user_col
  );
  execute format(
    'create policy if not exists %I on %s for insert to authenticated with check (%I = auth.uid())',
    base||'_self_insert', rel, user_col
  );
  execute format(
    'create policy if not exists %I on %s for update to authenticated using (%I = auth.uid()) with check (%I = auth.uid())',
    base||'_self_update', rel, user_col, user_col
  );
  execute format(
    'create policy if not exists %I on %s for delete to authenticated using (%I = auth.uid())',
    base||'_self_delete', rel, user_col
  );
  execute format('create index if not exists %I on %s(%I)', 'idx_'||base||'_'||user_col, rel, user_col);
end$$;


ALTER PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "user_col" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."first_segment_uuid"("p" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(split_part(p, '/', 1), '')::uuid;
$$;


ALTER FUNCTION "public"."first_segment_uuid"("p" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_customer"("_customer" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.customers c
    where c.id = _customer and c.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_customer"("_customer" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_shop_member"("p_shop" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = auth.uid() AND pr.shop_id = p_shop
  );
$$;


ALTER FUNCTION "public"."is_shop_member"("p_shop" "uuid") OWNER TO "postgres";


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
    LANGUAGE "plpgsql"
    AS $$
declare
  v_event_type text;
begin
  -- TG_NARGS is the number of trigger args.
  -- TG_ARGV is 0-based: TG_ARGV[0] is the first arg.
  if TG_NARGS >= 1 then
    v_event_type := coalesce(TG_ARGV[0], '');
  else
    v_event_type := '';
  end if;

  insert into ai_events (
    shop_id,
    user_id,
    event_type,
    entity_id,
    entity_table,
    payload
  )
  values (
    NEW.shop_id,
    auth.uid(),
    v_event_type,
    NEW.id,
    TG_TABLE_NAME,
    to_jsonb(NEW)
  );

  return NEW;
end;
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


CREATE OR REPLACE FUNCTION "public"."punch_in"("line_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.work_order_lines
  set assigned_tech_id = coalesce(assigned_tech_id, auth.uid()),
      punched_in_at   = now(),
      punched_out_at  = null
  where id = line_id
    and coalesce(assigned_tech_id, auth.uid()) = auth.uid();

  if not found then
    raise exception 'Line not found or not assigned to you'
      using errcode = '28000';
  end if;
end;
$$;


ALTER FUNCTION "public"."punch_in"("line_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."set_current_shop_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform set_config('app.current_shop_id', new.shop_id::text, true);
  return new;
end;
$$;


ALTER FUNCTION "public"."set_current_shop_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ok boolean;
begin
  -- Ensure the current user actually belongs to this shop
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = p_shop_id
  )
  into v_ok;

  if not v_ok then
    raise exception 'Not allowed to set current shop to %', p_shop_id using errcode = '42501';
  end if;

  -- Store it in the per-request GUC for current_shop_id()
  perform set_config('app.current_shop_id', p_shop_id::text, true);
end;
$$;


ALTER FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") OWNER TO "postgres";


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
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."sync_profiles_user_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.user_id := new.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profiles_user_id"() OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."fleet_vehicles" (
    "fleet_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "nickname" "text",
    "custom_interval_km" integer,
    "custom_interval_hours" integer,
    "custom_interval_days" integer
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
    "work_order_id" "uuid"
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
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_item_parts" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    CONSTRAINT "profiles_agent_role_check" CHECK (("agent_role" = ANY (ARRAY['developer'::"text", 'none'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'mechanic'::"text", 'advisor'::"text", 'tech'::"text", 'parts'::"text"]))))
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
    "created_by" "uuid" DEFAULT "auth"."uid"()
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


CREATE TABLE IF NOT EXISTS "public"."saved_menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year_bucket" "text" NOT NULL,
    "title" "text" NOT NULL,
    "labor_time" numeric,
    "parts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_ai_profiles" (
    "shop_id" "uuid" NOT NULL,
    "summary" "jsonb" NOT NULL,
    "last_refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shop_ai_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid",
    "weekday" integer NOT NULL,
    "open_time" "text" NOT NULL,
    "close_time" "text" NOT NULL,
    CONSTRAINT "shop_hours_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."shop_hours" OWNER TO "postgres";


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
    "owner_id" "uuid" NOT NULL,
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
    CONSTRAINT "shops_active_user_count_le_max_users" CHECK ((COALESCE("active_user_count", 0) <= COALESCE("max_users", 1))),
    CONSTRAINT "shops_country_na_check" CHECK (("country" = ANY (ARRAY['US'::"text", 'CA'::"text"]))),
    CONSTRAINT "shops_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'diy'::"text", 'pro'::"text", 'pro_plus'::"text"]))),
    CONSTRAINT "shops_platform_fee_bps_range" CHECK ((("stripe_platform_fee_bps" >= 0) AND ("stripe_platform_fee_bps" <= 10000))),
    CONSTRAINT "shops_rating_check" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric)))
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
    CONSTRAINT "work_order_lines_approval_state_check" CHECK ((("approval_state" IS NULL) OR ("approval_state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"])))),
    CONSTRAINT "work_order_lines_job_type_check" CHECK ((("job_type" IS NULL) OR ("job_type" = ANY (ARRAY['diagnosis'::"text", 'inspection'::"text", 'maintenance'::"text", 'repair'::"text", 'tech-suggested'::"text"])))),
    CONSTRAINT "work_order_lines_punch_order_chk" CHECK ((("punched_out_at" IS NULL) OR ("punched_in_at" IS NULL) OR ("punched_out_at" >= "punched_in_at"))),
    CONSTRAINT "work_order_lines_status_check" CHECK (("status" = ANY (ARRAY['awaiting'::"text", 'queued'::"text", 'in_progress'::"text", 'on_hold'::"text", 'paused'::"text", 'completed'::"text", 'assigned'::"text", 'unassigned'::"text", 'awaiting_approval'::"text", 'declined'::"text", 'quoted'::"text"]))),
    CONSTRAINT "work_order_lines_urgency_check" CHECK (("urgency" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."work_order_lines" OWNER TO "postgres";


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
    CONSTRAINT "wo_requires_party_and_vehicle" CHECK ((("status" = ANY (ARRAY['awaiting_approval'::"text", 'new'::"text", 'planned'::"text"])) OR (("customer_id" IS NOT NULL) AND ("vehicle_id" IS NOT NULL)))),
    CONSTRAINT "work_orders_approval_state_check" CHECK ((("approval_state" IS NULL) OR ("approval_state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text", 'partial'::"text"])))),
    CONSTRAINT "work_orders_status_check" CHECK (("status" = ANY (ARRAY['awaiting'::"text", 'queued'::"text", 'in_progress'::"text", 'on_hold'::"text", 'planned'::"text", 'new'::"text", 'completed'::"text", 'awaiting_approval'::"text", 'ready_to_invoice'::"text", 'invoiced'::"text"]))),
    CONSTRAINT "work_orders_type_check" CHECK (("type" = ANY (ARRAY['inspection'::"text", 'repair'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."work_orders" OWNER TO "postgres";


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
    "engine_family" "text"
);

ALTER TABLE ONLY "public"."vehicles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."vendor_part_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "part_id" "uuid" NOT NULL,
    "vendor_sku" "text" NOT NULL
);


ALTER TABLE "public"."vendor_part_numbers" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."work_order_line_technicians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "technician_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid"
);


ALTER TABLE "public"."work_order_line_technicians" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."work_order_part_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_line_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qty" numeric(12,2) NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "stock_move_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "work_order_id" "uuid"
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
    "shop_id" "uuid"
);


ALTER TABLE "public"."work_order_parts" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."agent_attachments"
    ADD CONSTRAINT "agent_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_knowledge"
    ADD CONSTRAINT "agent_knowledge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_knowledge"
    ADD CONSTRAINT "agent_knowledge_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."agent_requests"
    ADD CONSTRAINT "agent_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_events"
    ADD CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."decoded_vins"
    ADD CONSTRAINT "decoded_vins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defective_parts"
    ADD CONSTRAINT "defective_parts_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."fleet_form_uploads"
    ADD CONSTRAINT "fleet_form_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_program_tasks"
    ADD CONSTRAINT "fleet_program_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_programs"
    ADD CONSTRAINT "fleet_programs_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."inspection_templates"
    ADD CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_logs"
    ADD CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."part_barcodes"
    ADD CONSTRAINT "part_barcodes_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."part_barcodes"
    ADD CONSTRAINT "part_barcodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_compatibility"
    ADD CONSTRAINT "part_compatibility_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."saved_menu_items"
    ADD CONSTRAINT "saved_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_ai_profiles"
    ADD CONSTRAINT "shop_ai_profiles_pkey" PRIMARY KEY ("shop_id");



ALTER TABLE ONLY "public"."shop_hours"
    ADD CONSTRAINT "shop_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_parts"
    ADD CONSTRAINT "shop_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_pkey" PRIMARY KEY ("shop_id");



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_shop_id_customer_id_key" UNIQUE ("shop_id", "customer_id");



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



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_shop_id_supplier_id_vendor_sku_key" UNIQUE ("shop_id", "supplier_id", "vendor_sku");



ALTER TABLE ONLY "public"."vin_decodes"
    ADD CONSTRAINT "vin_decodes_pkey" PRIMARY KEY ("id");



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
    ADD CONSTRAINT "work_orders_custom_id_key" UNIQUE ("custom_id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_events_run_step" ON "public"."agent_events" USING "btree" ("run_id", "step");



CREATE INDEX "agent_requests_run_id_idx" ON "public"."agent_requests" USING "btree" ("run_id");



CREATE UNIQUE INDEX "agent_runs_idem" ON "public"."agent_runs" USING "btree" ("shop_id", "user_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "ai_events_entity_idx" ON "public"."ai_events" USING "btree" ("entity_table", "entity_id");



CREATE INDEX "ai_events_shop_idx" ON "public"."ai_events" USING "btree" ("shop_id");



CREATE INDEX "ai_events_type_idx" ON "public"."ai_events" USING "btree" ("event_type");



CREATE INDEX "ai_training_embedding_hnsw_idx" ON "public"."ai_training_data" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "ai_training_embedding_idx" ON "public"."ai_training_data" USING "ivfflat" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "ai_training_shop_idx" ON "public"."ai_training_data" USING "btree" ("shop_id");



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



CREATE UNIQUE INDEX "customers_shop_email_uq" ON "public"."customers" USING "btree" ("shop_id", "email");



CREATE INDEX "customers_shop_id_idx" ON "public"."customers" USING "btree" ("shop_id");



CREATE INDEX "customers_user_id_idx" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "email_logs_email_idx" ON "public"."email_logs" USING "btree" ("email");



CREATE INDEX "email_logs_status_idx" ON "public"."email_logs" USING "btree" ("status");



CREATE INDEX "email_suppressions_email_idx" ON "public"."email_suppressions" USING "btree" ("email");



CREATE INDEX "expenses_shop_category_idx" ON "public"."expenses" USING "btree" ("shop_id", "category");



CREATE INDEX "expenses_shop_created_idx" ON "public"."expenses" USING "btree" ("shop_id", "created_at");



CREATE INDEX "expenses_shop_date_idx" ON "public"."expenses" USING "btree" ("shop_id", "expense_date");



CREATE INDEX "expenses_shop_expense_date_idx" ON "public"."expenses" USING "btree" ("shop_id", "expense_date");



CREATE INDEX "feature_reads_user_id_feature_slug_idx" ON "public"."feature_reads" USING "btree" ("user_id", "feature_slug");



CREATE INDEX "idx_agent_attachments_request" ON "public"."agent_attachments" USING "btree" ("agent_request_id");



CREATE INDEX "idx_agent_events_run_id" ON "public"."agent_events" USING "btree" ("run_id");



CREATE INDEX "idx_agent_knowledge_tags" ON "public"."agent_knowledge" USING "gin" ("tags");



CREATE INDEX "idx_agent_requests_reporter_id" ON "public"."agent_requests" USING "btree" ("reporter_id");



CREATE INDEX "idx_agent_requests_shop_id" ON "public"."agent_requests" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_runs_shop_id" ON "public"."agent_runs" USING "btree" ("shop_id");



CREATE INDEX "idx_agent_runs_user_id" ON "public"."agent_runs" USING "btree" ("user_id");



CREATE INDEX "idx_ai_events_shop_source_created" ON "public"."ai_events" USING "btree" ("shop_id", "training_source", "created_at" DESC);



CREATE INDEX "idx_ai_events_source_id" ON "public"."ai_events" USING "btree" ("source_id");



CREATE INDEX "idx_ai_training_data_shop_created" ON "public"."ai_training_data" USING "btree" ("shop_id", "created_at" DESC);



CREATE INDEX "idx_ai_training_data_source_event" ON "public"."ai_training_data" USING "btree" ("source_event_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_target" ON "public"."audit_logs" USING "btree" ("target");



CREATE INDEX "idx_conversation_participants_conv_user" ON "public"."conversation_participants" USING "btree" ("conversation_id", "user_id");



CREATE INDEX "idx_conversation_participants_conversation" ON "public"."conversation_participants" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_participants_user" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_conversation_participants_user_id" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_created_by" ON "public"."conversations" USING "btree" ("created_by");



CREATE INDEX "idx_cp_conversation_user" ON "public"."conversation_participants" USING "btree" ("conversation_id", "user_id");



CREATE INDEX "idx_cp_user" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_customers_updated_at" ON "public"."customers" USING "btree" ("updated_at");



CREATE INDEX "idx_customers_user_id" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "idx_email_logs_email" ON "public"."email_logs" USING "btree" ("email");



CREATE INDEX "idx_email_logs_event_type" ON "public"."email_logs" USING "btree" ("event_type");



CREATE INDEX "idx_email_suppressions_email" ON "public"."email_suppressions" USING "btree" ("email");



CREATE INDEX "idx_empdocs_shop" ON "public"."employee_documents" USING "btree" ("shop_id");



CREATE INDEX "idx_empdocs_uploaded_at" ON "public"."employee_documents" USING "btree" ("uploaded_at" DESC);



CREATE INDEX "idx_empdocs_user" ON "public"."employee_documents" USING "btree" ("user_id");



CREATE INDEX "idx_fleet_form_uploads_created_by_created_at" ON "public"."fleet_form_uploads" USING "btree" ("created_by", "created_at");



CREATE INDEX "idx_fleet_form_uploads_status_created_at" ON "public"."fleet_form_uploads" USING "btree" ("status", "created_at");



CREATE INDEX "idx_history_customer_id" ON "public"."history" USING "btree" ("customer_id");



CREATE INDEX "idx_inspection_result_items_result" ON "public"."inspection_result_items" USING "btree" ("result_id");



CREATE INDEX "idx_inspection_results_session" ON "public"."inspection_results" USING "btree" ("session_id");



CREATE INDEX "idx_inspection_results_wol" ON "public"."inspection_results" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_inspection_session_payloads_session" ON "public"."inspection_session_payloads" USING "btree" ("session_id");



CREATE INDEX "idx_inspection_sessions_wol" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_inspection_templates_shop" ON "public"."inspection_templates" USING "btree" ("shop_id");



CREATE INDEX "idx_inspection_templates_user" ON "public"."inspection_templates" USING "btree" ("user_id");



CREATE INDEX "idx_inspsess_status" ON "public"."inspection_sessions" USING "btree" ("status");



CREATE INDEX "idx_inspsess_template" ON "public"."inspection_sessions" USING "btree" ("template");



CREATE INDEX "idx_inspsess_wo" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE INDEX "idx_inspsess_woline" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_invoices_tech_shop_created_at" ON "public"."invoices" USING "btree" ("tech_id", "shop_id", "created_at");



CREATE INDEX "idx_maintenance_rules_target" ON "public"."maintenance_rules" USING "btree" ("make", "model", "year_from", "year_to", "engine_family");



CREATE INDEX "idx_maintenance_suggestions_status" ON "public"."maintenance_suggestions" USING "btree" ("status");



CREATE INDEX "idx_menu_items_shop_name" ON "public"."menu_items" USING "btree" ("shop_id", "lower"("name"));



CREATE INDEX "idx_menu_items_shop_service_key" ON "public"."menu_items" USING "btree" ("shop_id", "lower"("service_key"));



CREATE INDEX "idx_menu_items_vehicle_job" ON "public"."menu_items" USING "btree" ("vehicle_make", "vehicle_model", "engine_type", "transmission_type", "drivetrain", "lower"("name"));



CREATE INDEX "idx_menu_items_work_order_line" ON "public"."menu_items" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_conversation_created_desc" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_meta_participants_key" ON "public"."messages" USING "btree" ((("metadata" ->> 'participants_key'::"text")));



CREATE INDEX "idx_messages_recipients_gin" ON "public"."messages" USING "gin" ("recipients");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_mip_item" ON "public"."menu_item_parts" USING "btree" ("menu_item_id");



CREATE INDEX "idx_mip_user" ON "public"."menu_item_parts" USING "btree" ("user_id");



CREATE INDEX "idx_part_request_items_line_id" ON "public"."part_request_items" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_part_stock_part_loc" ON "public"."part_stock" USING "btree" ("part_id", "location_id");



CREATE INDEX "idx_parts_barcodes_part" ON "public"."parts_barcodes" USING "btree" ("part_id");



CREATE INDEX "idx_parts_barcodes_shop_code" ON "public"."parts_barcodes" USING "btree" ("shop_id", "code");



CREATE INDEX "idx_parts_shop_id" ON "public"."parts" USING "btree" ("shop_id");



CREATE INDEX "idx_payroll_timecards_user_shop_clock_in" ON "public"."payroll_timecards" USING "btree" ("user_id", "shop_id", "clock_in");



CREATE INDEX "idx_po_shop" ON "public"."purchase_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_pol_po" ON "public"."purchase_order_lines" USING "btree" ("po_id");



CREATE INDEX "idx_pqr_line_id" ON "public"."parts_quote_requests" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_pqr_status" ON "public"."parts_quote_requests" USING "btree" ("status");



CREATE INDEX "idx_pr_lines_wol" ON "public"."part_request_lines" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_id_shop" ON "public"."profiles" USING "btree" ("id", "shop_id");



CREATE INDEX "idx_profiles_last_active_at" ON "public"."profiles" USING "btree" ("last_active_at" DESC);



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_shop" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_profiles_shop_id" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_punch_events_shift_time" ON "public"."punch_events" USING "btree" ("shift_id", "timestamp" DESC);



CREATE INDEX "idx_punch_events_user_shift_time" ON "public"."punch_events" USING "btree" ("user_id", "shift_id", "timestamp");



CREATE INDEX "idx_punch_events_user_time" ON "public"."punch_events" USING "btree" ("user_id", "timestamp" DESC);



CREATE INDEX "idx_result_items_label" ON "public"."inspection_result_items" USING "btree" ("item_label");



CREATE INDEX "idx_shop_profiles_shop" ON "public"."shop_profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_shop_reviews_customer_id" ON "public"."shop_reviews" USING "btree" ("customer_id");



CREATE INDEX "idx_shop_reviews_reviewer_user_id" ON "public"."shop_reviews" USING "btree" ("reviewer_user_id");



CREATE INDEX "idx_shop_reviews_shop_id" ON "public"."shop_reviews" USING "btree" ("shop_id");



CREATE INDEX "idx_suppliers_shop_id" ON "public"."suppliers" USING "btree" ("shop_id");



CREATE INDEX "idx_tech_sessions_shift_started" ON "public"."tech_sessions" USING "btree" ("shift_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_shop_started" ON "public"."tech_sessions" USING "btree" ("shop_id", "started_at" DESC);



CREATE INDEX "idx_tech_sessions_user_started" ON "public"."tech_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_tech_shifts_shop_time" ON "public"."tech_shifts" USING "btree" ("shop_id", "start_time" DESC);



CREATE INDEX "idx_tech_shifts_user_time" ON "public"."tech_shifts" USING "btree" ("user_id", "start_time" DESC);



CREATE INDEX "idx_vehicle_menus_lookup" ON "public"."vehicle_menus" USING "btree" ("lower"("make"), "lower"("model"), "year_from", "year_to", "service_code");



CREATE INDEX "idx_vehicle_photos_shop_id" ON "public"."vehicle_photos" USING "btree" ("shop_id");



CREATE INDEX "idx_vehicle_photos_uploaded_by" ON "public"."vehicle_photos" USING "btree" ("uploaded_by");



CREATE INDEX "idx_vehicles_id_shop" ON "public"."vehicles" USING "btree" ("id", "shop_id");



CREATE INDEX "idx_vehicles_shop_vin" ON "public"."vehicles" USING "btree" ("shop_id", "vin");



CREATE INDEX "idx_warranties_shop" ON "public"."warranties" USING "btree" ("shop_id");



CREATE INDEX "idx_warranty_claims_warranty" ON "public"."warranty_claims" USING "btree" ("warranty_id");



CREATE INDEX "idx_wo_approval_state" ON "public"."work_orders" USING "btree" ("approval_state");



CREATE INDEX "idx_wo_shop" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_wol_approval_state" ON "public"."work_order_lines" USING "btree" ("approval_state");



CREATE INDEX "idx_wol_assigned_tech" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id");



CREATE INDEX "idx_wol_assigned_to" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "idx_wol_created_at" ON "public"."work_order_lines" USING "btree" ("created_at");



CREATE INDEX "idx_wol_inspection_session" ON "public"."work_order_lines" USING "btree" ("inspection_session_id");



CREATE INDEX "idx_wol_job_type" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "idx_wol_menu_item_vehicle" ON "public"."work_order_lines" USING "btree" ("menu_item_id", "vehicle_id");



CREATE INDEX "idx_wol_shop" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_wol_status" ON "public"."work_order_lines" USING "btree" ("status");



CREATE INDEX "idx_wol_status_priority_created" ON "public"."work_order_lines" USING "btree" ("status", "priority", "created_at");



CREATE INDEX "idx_wol_updated_at" ON "public"."work_order_lines" USING "btree" ("updated_at");



CREATE INDEX "idx_wol_vehicle_id" ON "public"."work_order_lines" USING "btree" ("vehicle_id");



CREATE INDEX "idx_wol_vehicle_status_created" ON "public"."work_order_lines" USING "btree" ("vehicle_id", "status", "created_at" DESC);



CREATE INDEX "idx_wol_wo" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_wol_wo_approval" ON "public"."work_order_lines" USING "btree" ("work_order_id", "approval_state");



CREATE INDEX "idx_wol_work_order_id" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_wolt_line_id" ON "public"."work_order_line_technicians" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_wopa_part" ON "public"."work_order_part_allocations" USING "btree" ("part_id");



CREATE INDEX "idx_wopa_wo" ON "public"."work_order_part_allocations" USING "btree" ("work_order_id");



CREATE INDEX "idx_wopa_wo_line" ON "public"."work_order_part_allocations" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_woql_shop_id" ON "public"."work_order_quote_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_woql_work_order_id" ON "public"."work_order_quote_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_woql_work_order_id_stage" ON "public"."work_order_quote_lines" USING "btree" ("work_order_id", "stage");



CREATE INDEX "idx_woql_work_order_line_id" ON "public"."work_order_quote_lines" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_work_order_lines_assigned_shop_created_at" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id", "shop_id", "created_at");



CREATE INDEX "idx_work_order_lines_assigned_tech" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id");



CREATE INDEX "idx_work_order_lines_wo_approval" ON "public"."work_order_lines" USING "btree" ("work_order_id", "approval_state");



CREATE INDEX "idx_work_order_lines_wo_id" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_order_part_allocations_created_at" ON "public"."work_order_part_allocations" USING "btree" ("created_at");



CREATE INDEX "idx_work_order_quote_lines_status" ON "public"."work_order_quote_lines" USING "btree" ("status");



CREATE INDEX "idx_work_order_quote_lines_suggested_by" ON "public"."work_order_quote_lines" USING "btree" ("suggested_by");



CREATE INDEX "idx_work_order_quote_lines_vehicle_id" ON "public"."work_order_quote_lines" USING "btree" ("vehicle_id");



CREATE INDEX "idx_work_order_quote_lines_work_order_id" ON "public"."work_order_quote_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_orders_approval_state" ON "public"."work_orders" USING "btree" ("approval_state");



CREATE INDEX "idx_work_orders_created" ON "public"."work_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_work_orders_customer" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_customer_id" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_customer_signed" ON "public"."work_orders" USING "btree" ("customer_approval_at");



CREATE INDEX "idx_work_orders_id_shop" ON "public"."work_orders" USING "btree" ("id", "shop_id");



CREATE INDEX "idx_work_orders_shop" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders_shop_id" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders_status" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "idx_work_orders_status_approval" ON "public"."work_orders" USING "btree" ("status", "approval_state");



CREATE INDEX "idx_work_orders_vehicle_id" ON "public"."work_orders" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "inspection_sessions_line_template_uniq" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id", "template");



CREATE INDEX "inspection_sessions_vehicle_idx" ON "public"."inspection_sessions" USING "btree" ("vehicle_id");



CREATE INDEX "inspection_sessions_wo_idx" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE INDEX "inspections_shop_id_idx" ON "public"."inspections" USING "btree" ("shop_id");



CREATE INDEX "inspections_vehicle_id_idx" ON "public"."inspections" USING "btree" ("vehicle_id");



CREATE INDEX "inspections_work_order_id_idx" ON "public"."inspections" USING "btree" ("work_order_id");



CREATE INDEX "integration_logs_provider_idx" ON "public"."integration_logs" USING "btree" ("provider");



CREATE INDEX "integration_logs_shop_idx" ON "public"."integration_logs" USING "btree" ("shop_id");



CREATE UNIQUE INDEX "integrations_shop_provider_idx" ON "public"."integrations" USING "btree" ("shop_id", "provider");



CREATE INDEX "invoices_shop_created_at_idx" ON "public"."invoices" USING "btree" ("shop_id", "created_at");



CREATE INDEX "invoices_shop_created_idx" ON "public"."invoices" USING "btree" ("shop_id", "created_at");



CREATE UNIQUE INDEX "invoices_shop_invoice_number_idx" ON "public"."invoices" USING "btree" ("shop_id", "invoice_number") WHERE ("invoice_number" IS NOT NULL);



CREATE INDEX "invoices_shop_status_idx" ON "public"."invoices" USING "btree" ("shop_id", "status");



CREATE INDEX "ix_wol_history_line" ON "public"."work_order_line_history" USING "btree" ("line_id");



CREATE INDEX "ix_wol_history_wo" ON "public"."work_order_line_history" USING "btree" ("work_order_id");



CREATE INDEX "job_type_idx" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "menu_items_active_idx" ON "public"."menu_items" USING "btree" ("is_active");



CREATE INDEX "menu_items_name_idx" ON "public"."menu_items" USING "btree" ("name");



CREATE INDEX "menu_items_shop_idx" ON "public"."menu_items" USING "btree" ("shop_id");



CREATE INDEX "menu_items_user_idx" ON "public"."menu_items" USING "btree" ("user_id");



CREATE INDEX "message_reads_user_id_conversation_id_idx" ON "public"."message_reads" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



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



CREATE UNIQUE INDEX "profiles_username_key" ON "public"."profiles" USING "btree" ("username") WHERE ("username" IS NOT NULL);



CREATE INDEX "shop_hours_shop_weekday_idx" ON "public"."shop_hours" USING "btree" ("shop_id", "weekday");



CREATE INDEX "shop_time_off_shop_end_idx" ON "public"."shop_time_off" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "shop_time_off_shop_start_idx" ON "public"."shop_time_off" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "shops_accepts_idx" ON "public"."shops" USING "btree" ("accepts_online_booking");



CREATE UNIQUE INDEX "shops_slug_key" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_slug_uidx" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_slug_unique_idx" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_stripe_account_id_unique_idx" ON "public"."shops" USING "btree" ("stripe_account_id") WHERE ("stripe_account_id" IS NOT NULL);



CREATE INDEX "shops_timezone_idx" ON "public"."shops" USING "btree" ("timezone");



CREATE UNIQUE INDEX "stock_locations_shop_code_uq" ON "public"."stock_locations" USING "btree" ("shop_id", "code");



CREATE INDEX "stock_moves_part_loc_idx" ON "public"."stock_moves" USING "btree" ("part_id", "location_id");



CREATE INDEX "stock_moves_shop_part_idx" ON "public"."stock_moves" USING "btree" ("shop_id", "part_id");



CREATE UNIQUE INDEX "suppliers_shop_name_uq" ON "public"."suppliers" USING "btree" ("shop_id", "name");



CREATE INDEX "tech_shifts_status_idx" ON "public"."tech_shifts" USING "btree" ("status");



CREATE UNIQUE INDEX "uniq_customers_user_id_not_null" ON "public"."customers" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_active_punch_per_user" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id") WHERE (("punched_in_at" IS NOT NULL) AND ("punched_out_at" IS NULL));



CREATE UNIQUE INDEX "uq_saved_menu_items" ON "public"."saved_menu_items" USING "btree" ("make", "model", "year_bucket", "title");



CREATE INDEX "vehicle_media_shop_id_idx" ON "public"."vehicle_media" USING "btree" ("shop_id");



CREATE INDEX "vehicle_photos_shop_id_idx" ON "public"."vehicle_photos" USING "btree" ("shop_id");



CREATE INDEX "vehicle_recalls_shop_idx" ON "public"."vehicle_recalls" USING "btree" ("shop_id");



CREATE INDEX "vehicle_recalls_vehicle_idx" ON "public"."vehicle_recalls" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "vehicle_recalls_vin_campaign_idx" ON "public"."vehicle_recalls" USING "btree" ("vin", "campaign_number");



CREATE INDEX "vehicle_recalls_vin_idx" ON "public"."vehicle_recalls" USING "btree" ("vin");



CREATE INDEX "vehicles_shop_id_idx" ON "public"."vehicles" USING "btree" ("shop_id");



CREATE INDEX "vin_decodes_user_id_idx" ON "public"."vin_decodes" USING "btree" ("user_id");



CREATE INDEX "vin_decodes_user_vin_idx" ON "public"."vin_decodes" USING "btree" ("user_id", "vin");



CREATE INDEX "vin_decodes_vin_idx" ON "public"."vin_decodes" USING "btree" ("vin");



CREATE UNIQUE INDEX "vin_decodes_vin_lower_uq" ON "public"."vin_decodes" USING "btree" ("lower"("vin"));



CREATE INDEX "widget_instances_user_id_widget_slug_idx" ON "public"."widget_instances" USING "btree" ("user_id", "widget_slug");



CREATE INDEX "wo_customer_idx" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "wo_status_idx" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "wo_vehicle_idx" ON "public"."work_orders" USING "btree" ("vehicle_id");



CREATE INDEX "wol_assigned_idx" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "wol_by_wo" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "wol_jobtype_idx" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "wol_shop_id_idx" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "wol_status_idx" ON "public"."work_order_lines" USING "btree" ("status");



CREATE INDEX "wol_wo_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "wol_work_order_id_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "work_order_lines_assigned_to_idx" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "work_order_lines_shop_id_idx" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "work_order_part_allocations_location_id_idx" ON "public"."work_order_part_allocations" USING "btree" ("location_id");



CREATE INDEX "work_orders_shop_id_idx" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE OR REPLACE TRIGGER "ai_event_to_training" AFTER INSERT ON "public"."ai_events" FOR EACH ROW EXECUTE FUNCTION "public"."ai_generate_training_row"();



CREATE OR REPLACE TRIGGER "audit_parts_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."parts_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "biu_work_order_lines_shop_id" BEFORE INSERT OR UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."assign_wol_shop_id"();



CREATE OR REPLACE TRIGGER "biu_work_orders_shop_id" BEFORE INSERT OR UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."assign_work_orders_shop_id"();



CREATE OR REPLACE TRIGGER "broadcast_chat_messages_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_chat_messages"();



CREATE OR REPLACE TRIGGER "compute_timecard_hours_biu" BEFORE INSERT OR UPDATE ON "public"."payroll_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."compute_timecard_hours"();



CREATE OR REPLACE TRIGGER "customer_quote_ai_log" AFTER INSERT OR UPDATE ON "public"."customer_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."log_ai_event"('quote_updated');



CREATE OR REPLACE TRIGGER "messages_broadcast_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."conversation_messages_broadcast_trigger"();



CREATE OR REPLACE TRIGGER "profiles_enforce_shop_user_limit" BEFORE INSERT OR UPDATE OF "shop_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_profiles_enforce_shop_user_limit"();



CREATE OR REPLACE TRIGGER "profiles_recalc_shop_user_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_profiles_recalc_shop_user_count"();



CREATE OR REPLACE TRIGGER "profiles_set_timestamps" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamps"();



CREATE OR REPLACE TRIGGER "set_hours_on_payroll_timecards" BEFORE INSERT OR UPDATE ON "public"."payroll_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."payroll_timecards_set_hours"();



CREATE OR REPLACE TRIGGER "set_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_fleet_form_uploads" BEFORE UPDATE ON "public"."fleet_form_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_invoices" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_payroll_timecards" BEFORE UPDATE ON "public"."payroll_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_work_order_lines" BEFORE UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "shops_set_created_by" BEFORE INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."tg_shops_set_owner_and_creator"();



CREATE OR REPLACE TRIGGER "shops_set_timestamps" BEFORE INSERT OR UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamps"();



CREATE OR REPLACE TRIGGER "trg_agent_requests_updated_at" BEFORE UPDATE ON "public"."agent_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agent_runs_updated_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assign_default_shop" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."assign_default_shop"();



CREATE OR REPLACE TRIGGER "trg_bump_profile_last_active_on_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_profile_last_active_on_message"();



CREATE OR REPLACE TRIGGER "trg_customers_set_shop_id" BEFORE INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."customers_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_customers_set_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."customers_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_inspections_set_shop_id" BEFORE INSERT ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."inspections_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_lines_recompute_wo_status" AFTER INSERT OR UPDATE OF "status", "punched_in_at", "punched_out_at" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."recompute_wo_status_trigger_func"();



CREATE OR REPLACE TRIGGER "trg_pqr_notify" AFTER INSERT ON "public"."parts_quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."tg_notify_quote_request"();



CREATE OR REPLACE TRIGGER "trg_pqr_updated" BEFORE UPDATE ON "public"."parts_quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_punch_events_set_user" BEFORE INSERT ON "public"."punch_events" FOR EACH ROW EXECUTE FUNCTION "public"."punch_events_set_user_from_shift"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_del" AFTER DELETE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_ins" AFTER INSERT ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_upd" AFTER UPDATE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_saved_menu_items_updated" BEFORE UPDATE ON "public"."saved_menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_current_shop_id" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW WHEN (("new"."shop_id" IS NOT NULL)) EXECUTE FUNCTION "public"."set_current_shop_id"();



CREATE OR REPLACE TRIGGER "trg_set_inspection_template_owner" BEFORE INSERT ON "public"."inspection_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_inspection_template_owner"();



CREATE OR REPLACE TRIGGER "trg_set_message_edited_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_edited_at"();



CREATE OR REPLACE TRIGGER "trg_set_owner_shop_id" AFTER INSERT OR UPDATE OF "owner_id" ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."set_owner_shop_id"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_work_order_quote_lines" BEFORE UPDATE ON "public"."work_order_quote_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_work_order_quote_lines"();



CREATE OR REPLACE TRIGGER "trg_set_wol_shop" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_wol_shop_id_from_wo"();



CREATE OR REPLACE TRIGGER "trg_shop_profiles_updated_at" BEFORE UPDATE ON "public"."shop_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_shop_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_ratings_updated_at" BEFORE UPDATE ON "public"."shop_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."set_shop_ratings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_reviews_set_updated_at" BEFORE UPDATE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_shop_reviews_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_invoice_from_work_order" AFTER INSERT OR UPDATE OF "status" ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_invoice_from_work_order"();



CREATE OR REPLACE TRIGGER "trg_sync_profiles_user_id" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profiles_user_id"();



CREATE OR REPLACE TRIGGER "trg_vehicles_set_shop_id" BEFORE INSERT ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."vehicles_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_wol_assign_line_no" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."wol_assign_line_no"();



CREATE OR REPLACE TRIGGER "trg_wol_set_quoted_at" BEFORE UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_quoted_at"();



CREATE OR REPLACE TRIGGER "trg_wol_set_shop_id" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_wol_shop_id"();



CREATE OR REPLACE TRIGGER "trg_wol_status_refresh" AFTER INSERT OR UPDATE OF "status", "punched_in_at", "punched_out_at" ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_work_order_status"();



CREATE OR REPLACE TRIGGER "trg_wol_status_refresh_del" AFTER DELETE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_work_order_status_del"();



CREATE OR REPLACE TRIGGER "trg_wopa_sync_work_order_id" BEFORE INSERT OR UPDATE OF "work_order_line_id" ON "public"."work_order_part_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."wopa_sync_work_order_id"();



CREATE OR REPLACE TRIGGER "trg_work_order_lines_updated_at" BEFORE INSERT OR UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_work_orders_set_shop_id" BEFORE INSERT ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."work_orders_set_shop_id"();



CREATE OR REPLACE TRIGGER "wo_ai_log" AFTER INSERT OR UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_ai_event"('work_order_updated');



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_attachments"
    ADD CONSTRAINT "agent_attachments_agent_request_id_fkey" FOREIGN KEY ("agent_request_id") REFERENCES "public"."agent_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_attachments"
    ADD CONSTRAINT "agent_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_portal_invites"
    ADD CONSTRAINT "customer_portal_invites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_quotes"
    ADD CONSTRAINT "customer_quotes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_settings"
    ADD CONSTRAINT "customer_settings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") NOT VALID;



ALTER TABLE ONLY "public"."decoded_vins"
    ADD CONSTRAINT "decoded_vins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defective_parts"
    ADD CONSTRAINT "defective_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id");



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



ALTER TABLE ONLY "public"."fleet_form_uploads"
    ADD CONSTRAINT "fleet_form_uploads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fleet_program_tasks"
    ADD CONSTRAINT "fleet_program_tasks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."fleet_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_programs"
    ADD CONSTRAINT "fleet_programs_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_vehicles"
    ADD CONSTRAINT "fleet_vehicles_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."integration_logs"
    ADD CONSTRAINT "integration_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_tech_id_fkey" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



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
    ADD CONSTRAINT "menu_item_parts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



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



ALTER TABLE ONLY "public"."part_barcodes"
    ADD CONSTRAINT "part_barcodes_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_compatibility"
    ADD CONSTRAINT "part_compatibility_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_purchases"
    ADD CONSTRAINT "part_purchases_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_purchases"
    ADD CONSTRAINT "part_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."part_suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."part_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_request_items"
    ADD CONSTRAINT "part_request_items_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."part_request_lines"
    ADD CONSTRAINT "part_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."part_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_request_lines"
    ADD CONSTRAINT "part_request_lines_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



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



ALTER TABLE ONLY "public"."shop_ai_profiles"
    ADD CONSTRAINT "shop_ai_profiles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."shop_hours"
    ADD CONSTRAINT "shop_hours_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_parts"
    ADD CONSTRAINT "shop_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_ratings"
    ADD CONSTRAINT "shop_ratings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



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



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_part_numbers"
    ADD CONSTRAINT "vendor_part_numbers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vin_decodes"
    ADD CONSTRAINT "vin_decodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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
    ADD CONSTRAINT "work_orders_customer_approved_by_fkey" FOREIGN KEY ("customer_approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert their own WO media" ON "public"."work_order_media" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their shop's media" ON "public"."work_order_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_order_media"."shop_id")))));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_attachments_delete_own_submitted" ON "public"."agent_attachments" FOR DELETE TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."agent_requests" "r"
  WHERE (("r"."id" = "agent_attachments"."agent_request_id") AND ("r"."status" = 'submitted'::"public"."agent_request_status"))))));



CREATE POLICY "agent_attachments_insert_own" ON "public"."agent_attachments" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_attachments_select_own_or_approvers" ON "public"."agent_attachments" FOR SELECT TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))));



ALTER TABLE "public"."agent_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_events_insert" ON "public"."agent_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."profiles" "p" ON ((("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "r"."shop_id"))))
  WHERE (("r"."id" = "agent_events"."run_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "agent_events_insert_own_via_run" ON "public"."agent_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent_runs" "r"
  WHERE (("r"."id" = "agent_events"."run_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "agent_events_select" ON "public"."agent_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."profiles" "p" ON ((("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "r"."shop_id"))))
  WHERE ("r"."id" = "agent_events"."run_id"))));



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



ALTER TABLE "public"."agent_knowledge" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_knowledge_select_by_shop" ON "public"."agent_knowledge" FOR SELECT TO "authenticated" USING ((("shop_id" IS NULL) OR ("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "agent_knowledge_upsert_approvers" ON "public"."agent_knowledge" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



ALTER TABLE "public"."agent_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_requests_insert" ON "public"."agent_requests" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "agent_requests_insert_own" ON "public"."agent_requests" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "reporter_id"));



CREATE POLICY "agent_requests_select_own" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING (("reporter_id" = "auth"."uid"()));



CREATE POLICY "agent_requests_select_own_or_approvers" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING ((("reporter_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text"))))));



CREATE POLICY "agent_requests_select_shop_admins" ON "public"."agent_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_requests"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'advisor'::"text", 'admin'::"text"]))))));



CREATE POLICY "agent_requests_update_approvers" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text"))))) WITH CHECK (true);



CREATE POLICY "agent_requests_update_developer" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'developer'::"text"))))) WITH CHECK (true);



CREATE POLICY "agent_requests_update_own_submitted" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "reporter_id") AND ("status" = 'submitted'::"public"."agent_request_status"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "reporter_id") AND ("status" = 'submitted'::"public"."agent_request_status")));



CREATE POLICY "agent_requests_update_shop_admins" ON "public"."agent_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_requests"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'advisor'::"text", 'admin'::"text"])))))) WITH CHECK (true);



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_runs_insert" ON "public"."agent_runs" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id"))))));



CREATE POLICY "agent_runs_insert_self" ON "public"."agent_runs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_runs_select" ON "public"."agent_runs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id")))));



CREATE POLICY "agent_runs_select_self_or_approvers" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text"))))));



CREATE POLICY "agent_runs_select_self_or_developer" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'developer'::"text"))))));



CREATE POLICY "agent_runs_update" ON "public"."agent_runs" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id")))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id"))))));



CREATE POLICY "agent_runs_update_approvers" ON "public"."agent_runs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."agent_role" = 'developer'::"text"))))) WITH CHECK (true);



CREATE POLICY "agent_runs_update_developer" ON "public"."agent_runs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'developer'::"text"))))) WITH CHECK (true);



ALTER TABLE "public"."ai_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow insert part request items" ON "public"."part_request_items" FOR INSERT TO "authenticated" WITH CHECK (("request_id" IN ( SELECT "part_requests"."id"
   FROM "public"."part_requests"
  WHERE ("part_requests"."requested_by" = "auth"."uid"()))));



CREATE POLICY "allow insert part requests for self" ON "public"."part_requests" FOR INSERT TO "authenticated" WITH CHECK (("requested_by" = "auth"."uid"()));



CREATE POLICY "allow insert part requests for user shop" ON "public"."part_requests" FOR INSERT TO "authenticated" WITH CHECK ((("requested_by" = "auth"."uid"()) AND ("shop_id" IN ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())))));



CREATE POLICY "allow update part request items" ON "public"."part_request_items" FOR UPDATE TO "authenticated" USING (("request_id" IN ( SELECT "part_requests"."id"
   FROM "public"."part_requests"
  WHERE ("part_requests"."requested_by" = "auth"."uid"())))) WITH CHECK (("request_id" IN ( SELECT "part_requests"."id"
   FROM "public"."part_requests"
  WHERE ("part_requests"."requested_by" = "auth"."uid"()))));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_tech_can_punch" ON "public"."work_order_lines" FOR UPDATE TO "authenticated" USING (("assigned_tech_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("assigned_tech_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_owner_select" ON "public"."bookings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "bookings_owner_write" ON "public"."bookings" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "bookings"."customer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "bookings_staff_select" ON "public"."bookings" FOR SELECT USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "bookings_staff_write" ON "public"."bookings" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_insert_self" ON "public"."chats" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert_self" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "conversations_select_mine_or_participant" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversations"."id") AND ("cp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "cp_insert_any_authenticated" ON "public"."conversation_participants" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "cp_select_for_my_conversations" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp2"
  WHERE (("cp2"."conversation_id" = "conversation_participants"."conversation_id") AND ("cp2"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_participants"."conversation_id") AND ("c"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "cp_select_own" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."customer_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_portal_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_quotes" ENABLE ROW LEVEL SECURITY;


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



ALTER TABLE "public"."decoded_vins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."defective_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dtc_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_suppressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_documents_self_delete" ON "public"."employee_documents" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_read" ON "public"."employee_documents" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_update" ON "public"."employee_documents" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_write" ON "public"."employee_documents" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_staff_read" ON "public"."employee_documents" FOR SELECT USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "employee_documents_staff_write" ON "public"."employee_documents" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_modify_by_shop" ON "public"."expenses" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "expenses"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "expenses"."shop_id")))));



CREATE POLICY "expenses_select_by_shop" ON "public"."expenses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "expenses"."shop_id")))));



ALTER TABLE "public"."feature_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fleet_form_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."followups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_result_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_session_payloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_templates_delete" ON "public"."inspection_templates" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "inspection_templates_insert" ON "public"."inspection_templates" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("shop_id" IN ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ((("profiles"."user_id" = "auth"."uid"()) OR ("profiles"."id" = "auth"."uid"())) AND ("profiles"."shop_id" IS NOT NULL))))));



CREATE POLICY "inspection_templates_select" ON "public"."inspection_templates" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("shop_id" IS NOT NULL) AND ("shop_id" IN ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ((("profiles"."user_id" = "auth"."uid"()) OR ("profiles"."id" = "auth"."uid"())) AND ("profiles"."shop_id" IS NOT NULL))))) OR ("is_public" = true)));



CREATE POLICY "inspection_templates_update" ON "public"."inspection_templates" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_modify_by_shop" ON "public"."invoices" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "invoices"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "invoices"."shop_id")))));



CREATE POLICY "invoices_select_by_shop" ON "public"."invoices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "invoices"."shop_id")))));



ALTER TABLE "public"."media_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_item_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_delete_own" ON "public"."menu_items" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "menu_items_insert_own" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "menu_items_select_all" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "menu_items_update_own" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."menu_pricing" ENABLE ROW LEVEL SECURITY;


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



CREATE POLICY "mip.delete.own" ON "public"."menu_item_parts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mip.insert.own" ON "public"."menu_item_parts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "mip.select.own" ON "public"."menu_item_parts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mip.update.own" ON "public"."menu_item_parts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own app layout" ON "public"."user_app_layouts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own feature reads" ON "public"."feature_reads" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own msg reads" ON "public"."message_reads" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own notifications" ON "public"."notifications" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own widget instances" ON "public"."widget_instances" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own widget layout" ON "public"."user_widget_layouts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."part_barcodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_barcodes_same_shop_all" ON "public"."part_barcodes" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts" "p"
     JOIN "public"."profiles" "pr" ON (("pr"."user_id" = "auth"."uid"())))
  WHERE (("p"."id" = "part_barcodes"."part_id") AND ("p"."shop_id" = "pr"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts" "p"
     JOIN "public"."profiles" "pr" ON (("pr"."user_id" = "auth"."uid"())))
  WHERE (("p"."id" = "part_barcodes"."part_id") AND ("p"."shop_id" = "pr"."shop_id")))));



ALTER TABLE "public"."part_compatibility" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."part_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."part_request_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_request_items.select.by_request_shop" ON "public"."part_request_items" FOR SELECT TO "authenticated" USING (("request_id" IN ( SELECT "part_requests"."id"
   FROM "public"."part_requests"
  WHERE ("part_requests"."shop_id" IN ( SELECT "profiles"."shop_id"
           FROM "public"."profiles"
          WHERE ("profiles"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."part_request_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."part_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_requests.select.by_user_shop" ON "public"."part_requests" FOR SELECT TO "authenticated" USING (("shop_id" IN ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."part_returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."part_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_stock_rw" ON "public"."part_stock" USING ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "part_stock"."part_id") AND "public"."is_shop_member"("p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "part_stock"."part_id") AND "public"."is_shop_member"("p"."shop_id")))));



ALTER TABLE "public"."part_suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."part_warranties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_barcodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_quote_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_request_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_requests_staff_access" ON "public"."parts_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_requests"."work_order_id") AND "public"."is_staff_for_shop"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_requests"."work_order_id") AND "public"."is_staff_for_shop"("w"."shop_id")))));



CREATE POLICY "parts_rw" ON "public"."parts" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "payload_same_shop_rw" ON "public"."inspection_session_payloads" USING ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_session_payloads"."session_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_session_payloads"."session_id") AND ("p"."shop_id" = "w"."shop_id")))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_select_same_shop" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "payments"."shop_id")))));



CREATE POLICY "payments_select_shop" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "payments"."shop_id") AND ("lower"(COALESCE("p"."role", ''::"text")) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'advisor'::"text"]))))));



ALTER TABLE "public"."payroll_timecards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "po_rw" ON "public"."purchase_orders" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "po_same_shop_all" ON "public"."purchase_orders" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "purchase_orders"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "purchase_orders"."shop_id")))));



CREATE POLICY "poi_rw" ON "public"."purchase_order_items" USING ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "po"
  WHERE (("po"."id" = "purchase_order_items"."po_id") AND "public"."is_shop_member"("po"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "po"
  WHERE (("po"."id" = "purchase_order_items"."po_id") AND "public"."is_shop_member"("po"."shop_id")))));



CREATE POLICY "pol_same_shop_all" ON "public"."purchase_order_lines" USING ((EXISTS ( SELECT 1
   FROM ("public"."purchase_orders" "po"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("po"."id" = "purchase_order_lines"."po_id") AND ("po"."shop_id" = "p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."purchase_orders" "po"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("po"."id" = "purchase_order_lines"."po_id") AND ("po"."shop_id" = "p"."shop_id")))));



CREATE POLICY "prm_staff_access" ON "public"."parts_request_messages" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "parts_request_messages"."request_id") AND "public"."is_staff_for_shop"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts_requests" "pr"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "pr"."work_order_id")))
  WHERE (("pr"."id" = "parts_request_messages"."request_id") AND "public"."is_staff_for_shop"("w"."shop_id")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles.self.insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles.self.read" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles.self.select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles.self.update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



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


CREATE POLICY "result_items_same_shop_ro" ON "public"."inspection_result_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((("public"."inspection_results" "r"
     JOIN "public"."inspection_sessions" "s" ON (("s"."id" = "r"."session_id")))
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("r"."id" = "inspection_result_items"."result_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "result_items_same_shop_rw" ON "public"."inspection_result_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."inspection_results" "r"
     JOIN "public"."inspection_sessions" "s" ON (("s"."id" = "r"."session_id")))
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("r"."id" = "inspection_result_items"."result_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."inspection_results" "r"
     JOIN "public"."inspection_sessions" "s" ON (("s"."id" = "r"."session_id")))
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("r"."id" = "inspection_result_items"."result_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "results_same_shop_rw" ON "public"."inspection_results" USING ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_results"."session_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."inspection_sessions" "s"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "s"."work_order_id")))
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("s"."id" = "inspection_results"."session_id") AND ("p"."shop_id" = "w"."shop_id")))));



ALTER TABLE "public"."saved_menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role updates" ON "public"."fleet_form_uploads" FOR UPDATE USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "sessions_same_shop_read" ON "public"."inspection_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("w"."id" = "inspection_sessions"."work_order_id") AND ("p"."shop_id" = "w"."shop_id")))));



CREATE POLICY "sessions_same_shop_write" ON "public"."inspection_sessions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("w"."id" = "inspection_sessions"."work_order_id") AND ("p"."shop_id" = "w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("w"."id" = "inspection_sessions"."work_order_id") AND ("p"."shop_id" = "w"."shop_id")))));



ALTER TABLE "public"."shop_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_hours_staff_write" ON "public"."shop_hours" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "shop_members_can_select_invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("shop_id" = ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)));



ALTER TABLE "public"."shop_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_profiles_staff_write" ON "public"."shop_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_profiles"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_profiles"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



ALTER TABLE "public"."shop_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_time_off" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_time_off_staff_write" ON "public"."shop_time_off" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."shop_time_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shops: only read my shop" ON "public"."shops" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) OR ("owner_id" = "auth"."uid"())));



CREATE POLICY "shops_staff_write" ON "public"."shops" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shops"."id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "staff can delete customers in shop" ON "public"."customers" FOR DELETE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can delete vehicles in shop" ON "public"."vehicles" FOR DELETE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can insert customers in shop" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can insert vehicles in shop" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can read customers in shop" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can read vehicles in shop" ON "public"."vehicles" FOR SELECT TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can update customers in shop" ON "public"."customers" FOR UPDATE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "staff can update vehicles in shop" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."stock_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_locations_rw" ON "public"."stock_locations" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



ALTER TABLE "public"."stock_moves" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_moves_r" ON "public"."stock_moves" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "stock_moves"."part_id") AND "public"."is_shop_member"("p"."shop_id")))));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_rw" ON "public"."suppliers" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "suppliers_same_shop_all" ON "public"."suppliers" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "suppliers"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "suppliers"."shop_id")))));



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


CREATE POLICY "timecards_manager_select" ON "public"."payroll_timecards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "p"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "timecards_own_select" ON "public"."payroll_timecards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."id" = "p"."user_id") AND ("p"."shop_id" = "p"."shop_id")))));



ALTER TABLE "public"."usage_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user can insert own fleet uploads" ON "public"."fleet_form_uploads" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "user can view own fleet uploads" ON "public"."fleet_form_uploads" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



ALTER TABLE "public"."user_app_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_widget_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_media_owner_select" ON "public"."vehicle_media" FOR SELECT USING (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "vehicle_media_staff_select" ON "public"."vehicle_media" FOR SELECT USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "vehicle_media_staff_write" ON "public"."vehicle_media" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."vehicle_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_photos_delete_own" ON "public"."vehicle_photos" FOR DELETE TO "authenticated" USING (("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vehicle_photos_insert_own" ON "public"."vehicle_photos" FOR INSERT TO "authenticated" WITH CHECK (("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vehicle_photos_select_by_shop" ON "public"."vehicle_photos" FOR SELECT TO "authenticated" USING (("shop_id" IN ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "vehicle_photos_select_own" ON "public"."vehicle_photos" FOR SELECT TO "authenticated" USING (("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."vehicle_recalls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_recalls_rw_own" ON "public"."vehicle_recalls" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "vehicle_recalls_rw_same_shop" ON "public"."vehicle_recalls" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "vehicle_recalls"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "vehicle_recalls"."shop_id")))));



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


ALTER TABLE "public"."vin_decodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vin_decodes_delete_self" ON "public"."vin_decodes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_insert_own" ON "public"."vin_decodes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_insert_self" ON "public"."vin_decodes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_select_own" ON "public"."vin_decodes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_update_self" ON "public"."vin_decodes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vpn_same_shop_all" ON "public"."vendor_part_numbers" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."user_id" = "auth"."uid"()) AND ("pr"."shop_id" = "vendor_part_numbers"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."user_id" = "auth"."uid"()) AND ("pr"."shop_id" = "vendor_part_numbers"."shop_id")))));



ALTER TABLE "public"."warranties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warranty_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."widget_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."widgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wo_alloc_rw" ON "public"."work_order_part_allocations" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "wl"."work_order_id")))
  WHERE (("wl"."id" = "work_order_part_allocations"."work_order_line_id") AND "public"."is_shop_member"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "wl"."work_order_id")))
  WHERE (("wl"."id" = "work_order_part_allocations"."work_order_line_id") AND "public"."is_shop_member"("w"."shop_id")))));



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



CREATE POLICY "wol_by_profile_shop_select" ON "public"."work_order_lines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_order_lines"."shop_id")))));



CREATE POLICY "wol_delete_via_parent_profile" ON "public"."work_order_lines" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_lines"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_history_same_shop_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_insert_same_shop" ON "public"."work_order_lines" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_update_via_parent" ON "public"."work_order_lines" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."user_id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wolh_same_shop_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "woql_delete" ON "public"."work_order_quote_lines" FOR DELETE TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "woql_insert" ON "public"."work_order_quote_lines" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "woql_read" ON "public"."work_order_quote_lines" FOR SELECT TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "woql_update" ON "public"."work_order_quote_lines" FOR UPDATE TO "authenticated" USING (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"())))) WITH CHECK (("shop_id" IN ( SELECT "p"."shop_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."work_order_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_line_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_part_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_quote_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_orders" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "anon";
GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_generate_training_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."ai_generate_training_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_generate_training_row"() TO "service_role";



GRANT ALL ON TABLE "public"."stock_moves" TO "anon";
GRANT ALL ON TABLE "public"."stock_moves" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_moves" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."clear_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_timecard_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_timecard_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_timecard_hours"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_messages_broadcast_trigger"() TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."current_shop_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "service_role";



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



GRANT ALL ON PROCEDURE "public"."ensure_same_shop_policies"(IN "tab" "regclass", IN "shop_col" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_same_shop_policies"(IN "tab" "regclass", IN "shop_col" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_same_shop_policies"(IN "tab" "regclass", IN "shop_col" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "user_col" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "user_col" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_self_owned_policies"(IN "tab" "regclass", IN "user_col" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_wo_shop_policies"(IN "tab" "regclass", IN "wo_col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_work_order_assignments"("p_work_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_column"("tab" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_column"("tab" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_column"("tab" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_ai_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_ai_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_ai_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_timecards_set_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_timecards_set_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_timecards_set_hours"() TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."punch_in"("line_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."punch_in"("line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."punch_in"("line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."punch_in"("line_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."punch_out"("line_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_shop_active_user_count"("p_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_wo_status_trigger_func"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_wo_status_trigger_func"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_wo_status_trigger_func"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_work_order_status"("p_wo" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_work_order_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_work_order_status_del"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status_del"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_work_order_status_del"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_hours"("shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_hours"("shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_hours"("shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_for_approval"("_wo" "uuid", "_line_ids" "uuid"[], "_set_wo_status" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_authenticated"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_authenticated"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_authenticated"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_shop_id"("p_shop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_inspection_template_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."snapshot_line_on_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_line_on_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_line_on_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_wol_on_wo_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_wol_on_wo_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_wol_on_wo_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_invoice_from_work_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_part_quote"("p_request" "uuid", "p_item" "uuid", "p_vendor" "text", "p_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_assign_line_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_assign_line_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_assign_line_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wopa_sync_work_order_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."wopa_sync_work_order_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wopa_sync_work_order_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "service_role";



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
GRANT ALL ON TABLE "public"."ai_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_events" TO "service_role";



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



GRANT ALL ON TABLE "public"."decoded_vins" TO "anon";
GRANT ALL ON TABLE "public"."decoded_vins" TO "authenticated";
GRANT ALL ON TABLE "public"."decoded_vins" TO "service_role";



GRANT ALL ON TABLE "public"."defective_parts" TO "anon";
GRANT ALL ON TABLE "public"."defective_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."defective_parts" TO "service_role";



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



GRANT ALL ON TABLE "public"."fleet_form_uploads" TO "anon";
GRANT ALL ON TABLE "public"."fleet_form_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_form_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_program_tasks" TO "anon";
GRANT ALL ON TABLE "public"."fleet_program_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_program_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_programs" TO "anon";
GRANT ALL ON TABLE "public"."fleet_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_programs" TO "service_role";



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



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



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



GRANT ALL ON TABLE "public"."saved_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."saved_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."shop_ai_profiles" TO "anon";
GRANT ALL ON TABLE "public"."shop_ai_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_ai_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shop_hours" TO "anon";
GRANT ALL ON TABLE "public"."shop_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_hours" TO "service_role";



GRANT ALL ON TABLE "public"."shop_parts" TO "anon";
GRANT ALL ON TABLE "public"."shop_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_parts" TO "service_role";



GRANT ALL ON TABLE "public"."shop_profiles" TO "anon";
GRANT ALL ON TABLE "public"."shop_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shops" TO "anon";
GRANT ALL ON TABLE "public"."shops" TO "authenticated";
GRANT ALL ON TABLE "public"."shops" TO "service_role";



GRANT ALL ON TABLE "public"."shop_public_profiles" TO "anon";
GRANT ALL ON TABLE "public"."shop_public_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_public_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shop_ratings" TO "anon";
GRANT ALL ON TABLE "public"."shop_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_ratings" TO "service_role";



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



GRANT ALL ON TABLE "public"."v_my_conversation_ids" TO "anon";
GRANT ALL ON TABLE "public"."v_my_conversation_ids" TO "authenticated";
GRANT ALL ON TABLE "public"."v_my_conversation_ids" TO "service_role";



GRANT ALL ON TABLE "public"."v_my_messages" TO "anon";
GRANT ALL ON TABLE "public"."v_my_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."v_my_messages" TO "service_role";



GRANT ALL ON TABLE "public"."v_part_stock" TO "anon";
GRANT ALL ON TABLE "public"."v_part_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."v_part_stock" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_lines" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."work_order_lines" TO "authenticated";



GRANT ALL ON TABLE "public"."work_orders" TO "anon";
GRANT ALL ON TABLE "public"."work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."work_orders" TO "service_role";



GRANT ALL ON TABLE "public"."v_quote_queue" TO "anon";
GRANT ALL ON TABLE "public"."v_quote_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."v_quote_queue" TO "service_role";



GRANT ALL ON TABLE "public"."v_shift_rollups" TO "anon";
GRANT ALL ON TABLE "public"."v_shift_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shift_rollups" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."v_vehicle_service_history" TO "anon";
GRANT ALL ON TABLE "public"."v_vehicle_service_history" TO "authenticated";
GRANT ALL ON TABLE "public"."v_vehicle_service_history" TO "service_role";



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



GRANT ALL ON TABLE "public"."vendor_part_numbers" TO "anon";
GRANT ALL ON TABLE "public"."vendor_part_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_part_numbers" TO "service_role";



GRANT ALL ON TABLE "public"."vin_decodes" TO "anon";
GRANT ALL ON TABLE "public"."vin_decodes" TO "authenticated";
GRANT ALL ON TABLE "public"."vin_decodes" TO "service_role";



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



GRANT ALL ON TABLE "public"."work_order_line_history" TO "anon";
GRANT ALL ON TABLE "public"."work_order_line_history" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_line_history" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_line_technicians" TO "anon";
GRANT ALL ON TABLE "public"."work_order_line_technicians" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_line_technicians" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_media" TO "anon";
GRANT ALL ON TABLE "public"."work_order_media" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_media" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "anon";
GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_parts" TO "anon";
GRANT ALL ON TABLE "public"."work_order_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_parts" TO "service_role";



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






