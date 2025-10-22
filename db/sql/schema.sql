

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



CREATE TYPE "public"."job_type_enum" AS ENUM (
    'diagnosis',
    'inspection',
    'maintenance',
    'repair'
);


ALTER TYPE "public"."job_type_enum" OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "extensions"."grant_pg_cron_access"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "extensions"."grant_pg_cron_access"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."grant_pg_cron_access"() IS 'Grants access to pg_cron';



CREATE OR REPLACE FUNCTION "extensions"."grant_pg_graphql_access"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "extensions"."grant_pg_graphql_access"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."grant_pg_graphql_access"() IS 'Grants access to pg_graphql';



CREATE OR REPLACE FUNCTION "extensions"."grant_pg_net_access"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "extensions"."grant_pg_net_access"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."grant_pg_net_access"() IS 'Grants access to pg_net';



CREATE OR REPLACE FUNCTION "extensions"."pgrst_ddl_watch"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "extensions"."set_graphql_placeholder"() OWNER TO "supabase_admin";


COMMENT ON FUNCTION "extensions"."set_graphql_placeholder"() IS 'Reintroduces placeholder function for graphql_public.graphql';



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


CREATE OR REPLACE FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_move_id  uuid := gen_random_uuid();
  v_shop_id  uuid;
  v_effect   numeric := 0;
BEGIN
  -- Look up the shop_id from the part
  SELECT shop_id INTO v_shop_id
  FROM public.parts
  WHERE id = p_part;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'apply_stock_move: no shop_id for part %', p_part;
  END IF;

  -- Insert the stock move (cast reason to your enum)
  INSERT INTO public.stock_moves (
    id, part_id, location_id, qty_change, reason, reference_kind, reference_id, shop_id
  ) VALUES (
    v_move_id, p_part, p_loc, p_qty,
    p_reason::stock_move_reason,    -- <- enum cast
    p_ref_kind, p_ref_id, v_shop_id
  );

  -- Compute on-hand impact
  IF p_reason IN ('receive','adjust','return_in') THEN
    v_effect := p_qty;
  ELSIF p_reason IN ('consume','sale','waste','return_out') THEN
    v_effect := -p_qty;
  ELSE
    -- default to additive if you use other reasons
    v_effect := p_qty;
  END IF;

  -- Upsert summary (note shop_id is included)
  INSERT INTO public.part_stock_summary (
    part_id, location_id, shop_id, qty_on_hand, qty_reserved
  ) VALUES (
    p_part, p_loc, v_shop_id, v_effect, 0
  )
  ON CONFLICT (part_id, location_id) DO
  UPDATE SET
    qty_on_hand  = public.part_stock_summary.qty_on_hand + EXCLUDED.qty_on_hand;

  RETURN v_move_id;
END;
$$;


ALTER FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "public"."stock_move_reason", "p_ref_kind" "text" DEFAULT NULL::"text", "p_ref_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  move_id uuid;
BEGIN
  INSERT INTO public.stock_moves(part_id, location_id, qty_change, reason, reference_kind, reference_id)
  VALUES (p_part, p_loc, p_qty, p_reason, p_ref_kind, p_ref_id)
  RETURNING id INTO move_id;

  -- upsert on-hand (reserve conversion handled by separate flow)
  INSERT INTO public.part_stock(part_id, location_id, qty_on_hand, qty_reserved)
  VALUES (p_part, p_loc, GREATEST(p_qty,0), GREATEST(-p_qty,0))
  ON CONFLICT (part_id, location_id)
  DO UPDATE SET qty_on_hand = part_stock.qty_on_hand + EXCLUDED.qty_on_hand;

  RETURN move_id;
END
$$;


ALTER FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "public"."stock_move_reason", "p_ref_kind" "text", "p_ref_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."current_shop_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select nullif(current_setting('app.current_shop_id', true), '')::uuid
$$;


ALTER FUNCTION "public"."current_shop_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_shop_id"() IS 'Returns the shop_id for the current authenticated user (from profiles).';



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


CREATE OR REPLACE FUNCTION "public"."first_segment_uuid"("p" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(split_part(p, '/', 1), '')::uuid;
$$;


ALTER FUNCTION "public"."first_segment_uuid"("p" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."has_column"("_table" "regclass", "_col" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from pg_attribute
    where attrelid = _table
      and attname  = _col
      and attnum  > 0
      and not attisdropped
  );
$$;


ALTER FUNCTION "public"."has_column"("_table" "regclass", "_col" "text") OWNER TO "postgres";


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
end$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."sync_profiles_user_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.user_id := new.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profiles_user_id"() OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    "created_by" "uuid"
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
    "vehicle" "text"
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


CREATE TABLE IF NOT EXISTS "public"."feature_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature_slug" "text" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_reads" OWNER TO "postgres";


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
    "shop_id" "uuid"
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
    "chat_id" "uuid",
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


CREATE TABLE IF NOT EXISTS "public"."part_stock_summary" (
    "part_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "qty_on_hand" numeric DEFAULT 0 NOT NULL,
    "qty_reserved" numeric DEFAULT 0 NOT NULL,
    "qty_available" numeric GENERATED ALWAYS AS (("qty_on_hand" - "qty_reserved")) STORED
);


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
    "warranty_months" integer DEFAULT 0
);


ALTER TABLE "public"."parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts_barcodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "barcode" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['tech'::"text", 'advisor'::"text", 'manager'::"text", 'admin'::"text", 'owner'::"text", 'parts'::"text"]))),
    CONSTRAINT "profiles_role_chk" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'advisor'::"text", 'tech'::"text", 'admin'::"text"]))))
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
    CONSTRAINT "shops_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'diy'::"text", 'pro'::"text", 'pro_plus'::"text"]))),
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


CREATE TABLE IF NOT EXISTS "public"."stock_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shop_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."stock_locations" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."tech_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "inspection_id" "uuid",
    "work_order_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone
);


ALTER TABLE "public"."tech_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tech_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'regular'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    CONSTRAINT "tech_shifts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"]))),
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


CREATE OR REPLACE VIEW "public"."v_part_stock" AS
 SELECT "ps"."part_id",
    "ps"."location_id",
    ("ps"."qty_on_hand" - "ps"."qty_reserved") AS "qty_available",
    "ps"."qty_on_hand",
    "ps"."qty_reserved"
   FROM "public"."part_stock" "ps";


ALTER TABLE "public"."v_part_stock" OWNER TO "postgres";


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
    "engine_hours" integer
);

ALTER TABLE ONLY "public"."vehicles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


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
    CONSTRAINT "work_order_lines_approval_state_check" CHECK ((("approval_state" IS NULL) OR ("approval_state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"])))),
    CONSTRAINT "work_order_lines_job_type_check" CHECK ((("job_type" IS NULL) OR ("job_type" = ANY (ARRAY['diagnosis'::"text", 'inspection'::"text", 'maintenance'::"text", 'repair'::"text", 'tech-suggested'::"text"])))),
    CONSTRAINT "work_order_lines_punch_order_chk" CHECK ((("punched_out_at" IS NULL) OR ("punched_in_at" IS NULL) OR ("punched_out_at" >= "punched_in_at"))),
    CONSTRAINT "work_order_lines_status_check" CHECK (("status" = ANY (ARRAY['awaiting'::"text", 'in_progress'::"text", 'on_hold'::"text", 'completed'::"text", 'assigned'::"text", 'unassigned'::"text"]))),
    CONSTRAINT "work_order_lines_urgency_check" CHECK (("urgency" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."work_order_lines" OWNER TO "postgres";


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
    "stock_move_id" "uuid"
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
    CONSTRAINT "work_orders_approval_state_check" CHECK ((("approval_state" IS NULL) OR ("approval_state" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text", 'partial'::"text"])))),
    CONSTRAINT "work_orders_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'awaiting'::"text", 'awaiting_approval'::"text", 'queued'::"text", 'in_progress'::"text", 'on_hold'::"text", 'planned'::"text", 'completed'::"text"]))),
    CONSTRAINT "work_orders_type_check" CHECK (("type" = ANY (ARRAY['inspection'::"text", 'repair'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."work_orders" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."feature_reads"
    ADD CONSTRAINT "feature_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_reads"
    ADD CONSTRAINT "feature_reads_user_id_feature_slug_key" UNIQUE ("user_id", "feature_slug");



ALTER TABLE ONLY "public"."followups"
    ADD CONSTRAINT "followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history"
    ADD CONSTRAINT "history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_photos"
    ADD CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_sessions"
    ADD CONSTRAINT "inspection_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_templates"
    ADD CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."part_returns"
    ADD CONSTRAINT "part_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_part_id_location_id_key" UNIQUE ("part_id", "location_id");



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."part_stock_summary"
    ADD CONSTRAINT "part_stock_summary_pkey" PRIMARY KEY ("part_id", "location_id");



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



ALTER TABLE ONLY "public"."parts_quotes"
    ADD CONSTRAINT "parts_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_request_messages"
    ADD CONSTRAINT "parts_request_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts_requests"
    ADD CONSTRAINT "parts_requests_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_media"
    ADD CONSTRAINT "work_order_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_part_allocations"
    ADD CONSTRAINT "work_order_part_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_custom_id_key" UNIQUE ("custom_id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_events_run_step" ON "public"."agent_events" USING "btree" ("run_id", "step");



CREATE UNIQUE INDEX "agent_runs_idem" ON "public"."agent_runs" USING "btree" ("shop_id", "user_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "bookings_customer_idx" ON "public"."bookings" USING "btree" ("customer_id");



CREATE INDEX "bookings_shop_end_idx" ON "public"."bookings" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "bookings_shop_ends_idx" ON "public"."bookings" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "bookings_shop_id_idx" ON "public"."bookings" USING "btree" ("shop_id");



CREATE INDEX "bookings_shop_start_idx" ON "public"."bookings" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "bookings_shop_starts_idx" ON "public"."bookings" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "bookings_shop_time_overlap_idx" ON "public"."bookings" USING "btree" ("shop_id", "starts_at", "ends_at");



CREATE INDEX "customer_portal_invites_customer_id_idx" ON "public"."customer_portal_invites" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "customers_shop_email_uq" ON "public"."customers" USING "btree" ("shop_id", "email");



CREATE INDEX "customers_shop_id_idx" ON "public"."customers" USING "btree" ("shop_id");



CREATE INDEX "customers_user_id_idx" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "email_logs_email_idx" ON "public"."email_logs" USING "btree" ("email");



CREATE INDEX "email_logs_status_idx" ON "public"."email_logs" USING "btree" ("status");



CREATE INDEX "email_suppressions_email_idx" ON "public"."email_suppressions" USING "btree" ("email");



CREATE INDEX "feature_reads_user_id_feature_slug_idx" ON "public"."feature_reads" USING "btree" ("user_id", "feature_slug");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_target" ON "public"."audit_logs" USING "btree" ("target");



CREATE INDEX "idx_customers_user_id" ON "public"."customers" USING "btree" ("user_id");



CREATE INDEX "idx_email_logs_email" ON "public"."email_logs" USING "btree" ("email");



CREATE INDEX "idx_email_logs_event_type" ON "public"."email_logs" USING "btree" ("event_type");



CREATE INDEX "idx_email_suppressions_email" ON "public"."email_suppressions" USING "btree" ("email");



CREATE INDEX "idx_empdocs_shop" ON "public"."employee_documents" USING "btree" ("shop_id");



CREATE INDEX "idx_empdocs_uploaded_at" ON "public"."employee_documents" USING "btree" ("uploaded_at" DESC);



CREATE INDEX "idx_empdocs_user" ON "public"."employee_documents" USING "btree" ("user_id");



CREATE INDEX "idx_history_customer_id" ON "public"."history" USING "btree" ("customer_id");



CREATE INDEX "idx_inspsess_status" ON "public"."inspection_sessions" USING "btree" ("status");



CREATE INDEX "idx_inspsess_template" ON "public"."inspection_sessions" USING "btree" ("template");



CREATE INDEX "idx_inspsess_wo" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE INDEX "idx_inspsess_woline" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id");



CREATE INDEX "idx_messages_chat_id" ON "public"."messages" USING "btree" ("chat_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_meta_participants_key" ON "public"."messages" USING "btree" ((("metadata" ->> 'participants_key'::"text")));



CREATE INDEX "idx_messages_recipients_gin" ON "public"."messages" USING "gin" ("recipients");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_mip_item" ON "public"."menu_item_parts" USING "btree" ("menu_item_id");



CREATE INDEX "idx_mip_user" ON "public"."menu_item_parts" USING "btree" ("user_id");



CREATE INDEX "idx_po_shop" ON "public"."purchase_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_pol_po" ON "public"."purchase_order_lines" USING "btree" ("po_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_last_active_at" ON "public"."profiles" USING "btree" ("last_active_at" DESC);



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_shop" ON "public"."profiles" USING "btree" ("shop_id");



CREATE INDEX "idx_punch_events_user_shift_time" ON "public"."punch_events" USING "btree" ("user_id", "shift_id", "timestamp");



CREATE INDEX "idx_shop_reviews_customer_id" ON "public"."shop_reviews" USING "btree" ("customer_id");



CREATE INDEX "idx_shop_reviews_reviewer_user_id" ON "public"."shop_reviews" USING "btree" ("reviewer_user_id");



CREATE INDEX "idx_shop_reviews_shop_id" ON "public"."shop_reviews" USING "btree" ("shop_id");



CREATE INDEX "idx_tech_shifts_user_time" ON "public"."tech_shifts" USING "btree" ("user_id", "start_time" DESC);



CREATE INDEX "idx_wo_approval_state" ON "public"."work_orders" USING "btree" ("approval_state");



CREATE INDEX "idx_wo_shop" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_wol_approval_state" ON "public"."work_order_lines" USING "btree" ("approval_state");



CREATE INDEX "idx_wol_assigned_tech" ON "public"."work_order_lines" USING "btree" ("assigned_tech_id");



CREATE INDEX "idx_wol_assigned_to" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "idx_wol_created_at" ON "public"."work_order_lines" USING "btree" ("created_at");



CREATE INDEX "idx_wol_inspection_session" ON "public"."work_order_lines" USING "btree" ("inspection_session_id");



CREATE INDEX "idx_wol_job_type" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "idx_wol_shop" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "idx_wol_status" ON "public"."work_order_lines" USING "btree" ("status");



CREATE INDEX "idx_wol_status_priority_created" ON "public"."work_order_lines" USING "btree" ("status", "priority", "created_at");



CREATE INDEX "idx_wol_updated_at" ON "public"."work_order_lines" USING "btree" ("updated_at");



CREATE INDEX "idx_wol_vehicle_id" ON "public"."work_order_lines" USING "btree" ("vehicle_id");



CREATE INDEX "idx_wol_wo" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_wol_wo_approval" ON "public"."work_order_lines" USING "btree" ("work_order_id", "approval_state");



CREATE INDEX "idx_wol_work_order_id" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_order_lines_wo_id" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_orders_created" ON "public"."work_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_work_orders_customer" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_customer_id" ON "public"."work_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_work_orders_customer_signed" ON "public"."work_orders" USING "btree" ("customer_approval_at");



CREATE INDEX "idx_work_orders_shop" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders_shop_id" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE INDEX "idx_work_orders_status" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "idx_work_orders_vehicle_id" ON "public"."work_orders" USING "btree" ("vehicle_id");



CREATE UNIQUE INDEX "inspection_sessions_line_template_uniq" ON "public"."inspection_sessions" USING "btree" ("work_order_line_id", "template");



CREATE INDEX "inspection_sessions_vehicle_idx" ON "public"."inspection_sessions" USING "btree" ("vehicle_id");



CREATE INDEX "inspection_sessions_wo_idx" ON "public"."inspection_sessions" USING "btree" ("work_order_id");



CREATE INDEX "inspections_shop_id_idx" ON "public"."inspections" USING "btree" ("shop_id");



CREATE INDEX "inspections_vehicle_id_idx" ON "public"."inspections" USING "btree" ("vehicle_id");



CREATE INDEX "inspections_work_order_id_idx" ON "public"."inspections" USING "btree" ("work_order_id");



CREATE INDEX "ix_wol_history_line" ON "public"."work_order_line_history" USING "btree" ("line_id");



CREATE INDEX "ix_wol_history_wo" ON "public"."work_order_line_history" USING "btree" ("work_order_id");



CREATE INDEX "job_type_idx" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "menu_items_active_idx" ON "public"."menu_items" USING "btree" ("is_active");



CREATE INDEX "menu_items_name_idx" ON "public"."menu_items" USING "btree" ("name");



CREATE INDEX "menu_items_shop_idx" ON "public"."menu_items" USING "btree" ("shop_id");



CREATE INDEX "menu_items_user_idx" ON "public"."menu_items" USING "btree" ("user_id");



CREATE INDEX "message_reads_user_id_conversation_id_idx" ON "public"."message_reads" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "messages_chat_id_idx" ON "public"."messages" USING "btree" ("chat_id");



CREATE INDEX "messages_created_at_idx" ON "public"."messages" USING "btree" ("created_at");



CREATE INDEX "messages_recipients_gin" ON "public"."messages" USING "gin" ("recipients");



CREATE INDEX "messages_sender_id_idx" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE UNIQUE INDEX "parts_shop_sku_uq" ON "public"."parts" USING "btree" ("shop_id", "sku");



CREATE INDEX "shop_hours_shop_weekday_idx" ON "public"."shop_hours" USING "btree" ("shop_id", "weekday");



CREATE INDEX "shop_time_off_shop_end_idx" ON "public"."shop_time_off" USING "btree" ("shop_id", "ends_at");



CREATE INDEX "shop_time_off_shop_start_idx" ON "public"."shop_time_off" USING "btree" ("shop_id", "starts_at");



CREATE INDEX "shops_accepts_idx" ON "public"."shops" USING "btree" ("accepts_online_booking");



CREATE UNIQUE INDEX "shops_slug_key" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_slug_uidx" ON "public"."shops" USING "btree" ("slug");



CREATE UNIQUE INDEX "shops_slug_unique_idx" ON "public"."shops" USING "btree" ("slug");



CREATE INDEX "shops_timezone_idx" ON "public"."shops" USING "btree" ("timezone");



CREATE UNIQUE INDEX "stock_locations_shop_code_uq" ON "public"."stock_locations" USING "btree" ("shop_id", "code");



CREATE UNIQUE INDEX "suppliers_shop_name_uq" ON "public"."suppliers" USING "btree" ("shop_id", "name");



CREATE INDEX "tech_shifts_status_idx" ON "public"."tech_shifts" USING "btree" ("status");



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



CREATE INDEX "wol_jobtype_idx" ON "public"."work_order_lines" USING "btree" ("job_type");



CREATE INDEX "wol_shop_id_idx" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "wol_status_idx" ON "public"."work_order_lines" USING "btree" ("status");



CREATE INDEX "wol_wo_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "wol_work_order_id_idx" ON "public"."work_order_lines" USING "btree" ("work_order_id");



CREATE INDEX "work_order_lines_assigned_to_idx" ON "public"."work_order_lines" USING "btree" ("assigned_to");



CREATE INDEX "work_order_lines_shop_id_idx" ON "public"."work_order_lines" USING "btree" ("shop_id");



CREATE INDEX "work_orders_shop_id_idx" ON "public"."work_orders" USING "btree" ("shop_id");



CREATE OR REPLACE TRIGGER "audit_parts_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."parts_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_audit"();



CREATE OR REPLACE TRIGGER "biu_work_order_lines_shop_id" BEFORE INSERT OR UPDATE ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."assign_wol_shop_id"();



CREATE OR REPLACE TRIGGER "biu_work_orders_shop_id" BEFORE INSERT OR UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."assign_work_orders_shop_id"();



CREATE OR REPLACE TRIGGER "profiles_set_timestamps" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamps"();



CREATE OR REPLACE TRIGGER "shops_set_created_by" BEFORE INSERT ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."tg_shops_set_owner_and_creator"();



CREATE OR REPLACE TRIGGER "shops_set_timestamps" BEFORE INSERT OR UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamps"();



CREATE OR REPLACE TRIGGER "trg_agent_runs_updated_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bump_profile_last_active_on_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_profile_last_active_on_message"();



CREATE OR REPLACE TRIGGER "trg_customers_set_shop_id" BEFORE INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."customers_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_inspections_set_shop_id" BEFORE INSERT ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."inspections_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_del" AFTER DELETE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_ins" AFTER INSERT ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_recompute_shop_rating_upd" AFTER UPDATE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_recompute_shop_rating"();



CREATE OR REPLACE TRIGGER "trg_set_current_shop_id" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW WHEN (("new"."shop_id" IS NOT NULL)) EXECUTE FUNCTION "public"."set_current_shop_id"();



CREATE OR REPLACE TRIGGER "trg_set_message_edited_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_edited_at"();



CREATE OR REPLACE TRIGGER "trg_set_owner_shop_id" AFTER INSERT OR UPDATE OF "owner_id" ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."set_owner_shop_id"();



CREATE OR REPLACE TRIGGER "trg_set_wol_shop" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_wol_shop_id_from_wo"();



CREATE OR REPLACE TRIGGER "trg_shop_profiles_updated_at" BEFORE UPDATE ON "public"."shop_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_shop_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_ratings_updated_at" BEFORE UPDATE ON "public"."shop_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."set_shop_ratings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shop_reviews_set_updated_at" BEFORE UPDATE ON "public"."shop_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."tg_shop_reviews_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_profiles_user_id" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profiles_user_id"();



CREATE OR REPLACE TRIGGER "trg_vehicles_set_shop_id" BEFORE INSERT ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."vehicles_set_shop_id"();



CREATE OR REPLACE TRIGGER "trg_wol_set_shop_id" BEFORE INSERT ON "public"."work_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_wol_shop_id"();



CREATE OR REPLACE TRIGGER "trg_work_orders_set_shop_id" BEFORE INSERT ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."work_orders_set_shop_id"();



ALTER TABLE ONLY "public"."agent_events"
    ADD CONSTRAINT "agent_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."feature_reads"
    ADD CONSTRAINT "feature_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."media_uploads"
    ADD CONSTRAINT "media_uploads_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_parts"
    ADD CONSTRAINT "menu_item_parts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_pricing"
    ADD CONSTRAINT "menu_pricing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."part_returns"
    ADD CONSTRAINT "part_returns_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."part_stock"
    ADD CONSTRAINT "part_stock_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_stock_summary"
    ADD CONSTRAINT "part_stock_summary_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_stock_summary"
    ADD CONSTRAINT "part_stock_summary_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_stock_summary"
    ADD CONSTRAINT "part_stock_summary_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."part_warranties"
    ADD CONSTRAINT "part_warranties_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_barcodes"
    ADD CONSTRAINT "parts_barcodes_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_messages"
    ADD CONSTRAINT "parts_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."parts_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_quotes"
    ADD CONSTRAINT "parts_quotes_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_request_messages"
    ADD CONSTRAINT "parts_request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."parts_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parts_requests"
    ADD CONSTRAINT "parts_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."work_order_lines"("id");



ALTER TABLE ONLY "public"."parts_requests"
    ADD CONSTRAINT "parts_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."punch_events"
    ADD CONSTRAINT "punch_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."tech_shifts"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."tech_sessions"
    ADD CONSTRAINT "tech_sessions_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."work_order_approvals"
    ADD CONSTRAINT "work_order_approvals_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_line_history"
    ADD CONSTRAINT "work_order_line_history_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_line_history"
    ADD CONSTRAINT "work_order_line_history_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_assigned_tech_id_fkey" FOREIGN KEY ("assigned_tech_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_inspection_session_fk" FOREIGN KEY ("inspection_session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_inspection_session_id_fkey" FOREIGN KEY ("inspection_session_id") REFERENCES "public"."inspection_sessions"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_order_lines"
    ADD CONSTRAINT "work_order_lines_work_order_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



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


ALTER TABLE "public"."agent_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_events_insert" ON "public"."agent_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."profiles" "p" ON ((("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "r"."shop_id"))))
  WHERE (("r"."id" = "agent_events"."run_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "agent_events_select" ON "public"."agent_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."profiles" "p" ON ((("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "r"."shop_id"))))
  WHERE ("r"."id" = "agent_events"."run_id"))));



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_runs_insert" ON "public"."agent_runs" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id"))))));



CREATE POLICY "agent_runs_select" ON "public"."agent_runs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id")))));



CREATE POLICY "agent_runs_update" ON "public"."agent_runs" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id")))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."shop_id" = "agent_runs"."shop_id"))))));



ALTER TABLE "public"."ai_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_requests_wo_delete" ON "public"."ai_requests" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "ai_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "ai_requests_wo_insert" ON "public"."ai_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "ai_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "ai_requests_wo_select" ON "public"."ai_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "ai_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "ai_requests_wo_update" ON "public"."ai_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "ai_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "ai_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


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



CREATE POLICY "bookings_shop_delete" ON "public"."bookings" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "bookings_shop_insert" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "bookings_shop_select" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "bookings_shop_update" ON "public"."bookings" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "bookings_staff_select" ON "public"."bookings" FOR SELECT USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "bookings_staff_write" ON "public"."bookings" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_insert_self" ON "public"."chats" FOR INSERT WITH CHECK (true);



CREATE POLICY "chats_select_visible" ON "public"."chats" FOR SELECT USING (true);



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_bookings_shop_delete" ON "public"."customer_bookings" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "customer_bookings_shop_insert" ON "public"."customer_bookings" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "customer_bookings_shop_select" ON "public"."customer_bookings" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "customer_bookings_shop_update" ON "public"."customer_bookings" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."customer_portal_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_quotes_shop_delete" ON "public"."customer_quotes" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "customer_quotes_shop_insert" ON "public"."customer_quotes" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "customer_quotes_shop_select" ON "public"."customer_quotes" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "customer_quotes_shop_update" ON "public"."customer_quotes" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."customer_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_by_profile_shop_select" ON "public"."customers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "customers"."shop_id")))));



ALTER TABLE "public"."decoded_vins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."defective_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defective_parts_shop_delete" ON "public"."defective_parts" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "defective_parts_shop_insert" ON "public"."defective_parts" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "defective_parts_shop_select" ON "public"."defective_parts" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "defective_parts_shop_update" ON "public"."defective_parts" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."dtc_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_suppressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_documents_self_delete" ON "public"."employee_documents" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_read" ON "public"."employee_documents" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_update" ON "public"."employee_documents" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_self_write" ON "public"."employee_documents" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "employee_documents_shop_delete" ON "public"."employee_documents" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "employee_documents_shop_insert" ON "public"."employee_documents" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "employee_documents_shop_select" ON "public"."employee_documents" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "employee_documents_shop_update" ON "public"."employee_documents" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "employee_documents_staff_read" ON "public"."employee_documents" FOR SELECT USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "employee_documents_staff_write" ON "public"."employee_documents" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."feature_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."followups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "history_wo_delete" ON "public"."history" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "history_wo_insert" ON "public"."history" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "history_wo_select" ON "public"."history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "history_wo_update" ON "public"."history" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."inspection_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspection_sessions_insert_auth" ON "public"."inspection_sessions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "inspection_sessions_select_auth" ON "public"."inspection_sessions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "inspection_sessions_update_complete" ON "public"."inspection_sessions" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "inspection_sessions_wo_delete" ON "public"."inspection_sessions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "inspection_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "inspection_sessions_wo_insert" ON "public"."inspection_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "inspection_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "inspection_sessions_wo_select" ON "public"."inspection_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "inspection_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "inspection_sessions_wo_update" ON "public"."inspection_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "inspection_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "inspection_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."inspection_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspections_shop_delete" ON "public"."inspections" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "inspections_shop_insert" ON "public"."inspections" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "inspections_shop_select" ON "public"."inspections" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "inspections_shop_update" ON "public"."inspections" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."media_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_uploads_wo_delete" ON "public"."media_uploads" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "media_uploads"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "media_uploads_wo_insert" ON "public"."media_uploads" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "media_uploads"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "media_uploads_wo_select" ON "public"."media_uploads" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "media_uploads"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "media_uploads_wo_update" ON "public"."media_uploads" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "media_uploads"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "media_uploads"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."menu_item_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_shop_delete" ON "public"."menu_items" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "menu_items_shop_insert" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "menu_items_shop_select" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "menu_items_shop_update" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."menu_pricing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete" ON "public"."messages" FOR DELETE USING (false);



CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = ANY ("recipients"))));



CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE USING (false) WITH CHECK (false);



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



CREATE POLICY "own-punches" ON "public"."punch_events" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own-shifts" ON "public"."tech_shifts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."part_barcodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_barcodes_same_shop_all" ON "public"."part_barcodes" USING ((EXISTS ( SELECT 1
   FROM ("public"."parts" "p"
     JOIN "public"."profiles" "pr" ON (("pr"."user_id" = "auth"."uid"())))
  WHERE (("p"."id" = "part_barcodes"."part_id") AND ("p"."shop_id" = "pr"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."parts" "p"
     JOIN "public"."profiles" "pr" ON (("pr"."user_id" = "auth"."uid"())))
  WHERE (("p"."id" = "part_barcodes"."part_id") AND ("p"."shop_id" = "pr"."shop_id")))));



ALTER TABLE "public"."part_compatibility" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_compatibility_shop_delete" ON "public"."part_compatibility" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_compatibility_shop_insert" ON "public"."part_compatibility" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_compatibility_shop_select" ON "public"."part_compatibility" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_compatibility_shop_update" ON "public"."part_compatibility" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."part_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_purchases_shop_delete" ON "public"."part_purchases" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_purchases_shop_insert" ON "public"."part_purchases" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_purchases_shop_select" ON "public"."part_purchases" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_purchases_shop_update" ON "public"."part_purchases" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."part_returns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_returns_shop_delete" ON "public"."part_returns" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_returns_shop_insert" ON "public"."part_returns" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_returns_shop_select" ON "public"."part_returns" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_returns_shop_update" ON "public"."part_returns" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."part_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_stock_rw" ON "public"."part_stock" USING ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "part_stock"."part_id") AND "public"."is_shop_member"("p"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parts" "p"
  WHERE (("p"."id" = "part_stock"."part_id") AND "public"."is_shop_member"("p"."shop_id")))));



ALTER TABLE "public"."part_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_suppliers_shop_delete" ON "public"."part_suppliers" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_suppliers_shop_insert" ON "public"."part_suppliers" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_suppliers_shop_select" ON "public"."part_suppliers" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_suppliers_shop_update" ON "public"."part_suppliers" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."part_warranties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "part_warranties_shop_delete" ON "public"."part_warranties" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_warranties_shop_insert" ON "public"."part_warranties" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_warranties_shop_select" ON "public"."part_warranties" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "part_warranties_shop_update" ON "public"."part_warranties" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_quotes_wo_delete" ON "public"."parts_quotes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_quotes"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_quotes_wo_insert" ON "public"."parts_quotes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_quotes"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_quotes_wo_select" ON "public"."parts_quotes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_quotes"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_quotes_wo_update" ON "public"."parts_quotes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_quotes"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_quotes"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."parts_request_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parts_requests_staff_access" ON "public"."parts_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_requests"."work_order_id") AND "public"."is_staff_for_shop"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "w"
  WHERE (("w"."id" = "parts_requests"."work_order_id") AND "public"."is_staff_for_shop"("w"."shop_id")))));



CREATE POLICY "parts_requests_wo_delete" ON "public"."parts_requests" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_requests_wo_insert" ON "public"."parts_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_requests_wo_select" ON "public"."parts_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_requests_wo_update" ON "public"."parts_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "parts_requests"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "parts_rw" ON "public"."parts" USING ("public"."is_shop_member"("shop_id")) WITH CHECK ("public"."is_shop_member"("shop_id"));



CREATE POLICY "parts_shop_delete" ON "public"."parts" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "parts_shop_insert" ON "public"."parts" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "parts_shop_select" ON "public"."parts" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "parts_shop_update" ON "public"."parts" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



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


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quote_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_lines_wo_delete" ON "public"."quote_lines" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "quote_lines"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "quote_lines_wo_insert" ON "public"."quote_lines" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "quote_lines"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "quote_lines_wo_select" ON "public"."quote_lines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "quote_lines"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "quote_lines_wo_update" ON "public"."quote_lines" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "quote_lines"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "quote_lines"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."shop_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_hours_public_select" ON "public"."shop_hours" FOR SELECT USING (true);



CREATE POLICY "shop_hours_shop_delete" ON "public"."shop_hours" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_hours_shop_insert" ON "public"."shop_hours" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_hours_shop_select" ON "public"."shop_hours" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_hours_shop_update" ON "public"."shop_hours" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_hours_staff_write" ON "public"."shop_hours" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."shop_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_parts_shop_delete" ON "public"."shop_parts" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_parts_shop_insert" ON "public"."shop_parts" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_parts_shop_select" ON "public"."shop_parts" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_parts_shop_update" ON "public"."shop_parts" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_profiles_public_select" ON "public"."shop_profiles" FOR SELECT USING (true);



CREATE POLICY "shop_profiles_shop_delete" ON "public"."shop_profiles" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_profiles_shop_insert" ON "public"."shop_profiles" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_profiles_shop_select" ON "public"."shop_profiles" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_profiles_shop_update" ON "public"."shop_profiles" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_profiles_staff_write" ON "public"."shop_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_profiles"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "shop_profiles"."shop_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



ALTER TABLE "public"."shop_ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_ratings_shop_delete" ON "public"."shop_ratings" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_ratings_shop_insert" ON "public"."shop_ratings" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_ratings_shop_select" ON "public"."shop_ratings" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_ratings_shop_update" ON "public"."shop_ratings" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shop_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_reviews_shop_delete" ON "public"."shop_reviews" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_reviews_shop_insert" ON "public"."shop_reviews" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_reviews_shop_select" ON "public"."shop_reviews" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_reviews_shop_update" ON "public"."shop_reviews" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shop_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_schedules_shop_delete" ON "public"."shop_schedules" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_schedules_shop_insert" ON "public"."shop_schedules" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_schedules_shop_select" ON "public"."shop_schedules" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_schedules_shop_update" ON "public"."shop_schedules" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shop_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_time_off" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_time_off_public_select" ON "public"."shop_time_off" FOR SELECT USING (true);



CREATE POLICY "shop_time_off_shop_delete" ON "public"."shop_time_off" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_off_shop_insert" ON "public"."shop_time_off" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_off_shop_select" ON "public"."shop_time_off" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_off_shop_update" ON "public"."shop_time_off" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_off_staff_write" ON "public"."shop_time_off" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."shop_time_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shop_time_slots_shop_delete" ON "public"."shop_time_slots" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_slots_shop_insert" ON "public"."shop_time_slots" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_slots_shop_select" ON "public"."shop_time_slots" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "shop_time_slots_shop_update" ON "public"."shop_time_slots" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



ALTER TABLE "public"."shops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shops: only read my shop" ON "public"."shops" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "profiles"."shop_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) OR ("owner_id" = "auth"."uid"())));



CREATE POLICY "shops_public_select" ON "public"."shops" FOR SELECT USING (true);



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


CREATE POLICY "tech_sessions_wo_delete" ON "public"."tech_sessions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "tech_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "tech_sessions_wo_insert" ON "public"."tech_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "tech_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "tech_sessions_wo_select" ON "public"."tech_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "tech_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "tech_sessions_wo_update" ON "public"."tech_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "tech_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "tech_sessions"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."tech_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_app_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_widget_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_media_owner_select" ON "public"."vehicle_media" FOR SELECT USING (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "vehicle_media_shop_delete" ON "public"."vehicle_media" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_media_shop_insert" ON "public"."vehicle_media" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_media_shop_select" ON "public"."vehicle_media" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_media_shop_update" ON "public"."vehicle_media" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_media_staff_select" ON "public"."vehicle_media" FOR SELECT USING ("public"."is_staff_for_shop"("shop_id"));



CREATE POLICY "vehicle_media_staff_write" ON "public"."vehicle_media" USING ("public"."is_staff_for_shop"("shop_id")) WITH CHECK ("public"."is_staff_for_shop"("shop_id"));



ALTER TABLE "public"."vehicle_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_photos_shop_delete" ON "public"."vehicle_photos" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_photos_shop_insert" ON "public"."vehicle_photos" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_photos_shop_select" ON "public"."vehicle_photos" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "vehicle_photos_shop_update" ON "public"."vehicle_photos" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



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
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "vehicles"."shop_id")))));



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



CREATE POLICY "vin_decodes_select_auth" ON "public"."vin_decodes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "vin_decodes_select_own" ON "public"."vin_decodes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "vin_decodes_update_self" ON "public"."vin_decodes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vpn_same_shop_all" ON "public"."vendor_part_numbers" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."user_id" = "auth"."uid"()) AND ("pr"."shop_id" = "vendor_part_numbers"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."user_id" = "auth"."uid"()) AND ("pr"."shop_id" = "vendor_part_numbers"."shop_id")))));



ALTER TABLE "public"."widget_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wo_alloc_rw" ON "public"."work_order_part_allocations" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "wl"."work_order_id")))
  WHERE (("wl"."id" = "work_order_part_allocations"."work_order_line_id") AND "public"."is_shop_member"("w"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_order_lines" "wl"
     JOIN "public"."work_orders" "w" ON (("w"."id" = "wl"."work_order_id")))
  WHERE (("wl"."id" = "work_order_part_allocations"."work_order_line_id") AND "public"."is_shop_member"("w"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_delete" ON "public"."work_orders" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_insert" ON "public"."work_orders" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_select" ON "public"."work_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



CREATE POLICY "wo_by_profile_shop_update" ON "public"."work_orders" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."shop_id" = "work_orders"."shop_id")))));



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



CREATE POLICY "wol_history_same_shop_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_insert_same_shop" ON "public"."work_order_lines" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "w"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("w"."id" = "work_order_lines"."work_order_id") AND ("w"."shop_id" = "p"."shop_id")))));



CREATE POLICY "wol_shop_delete" ON "public"."work_order_lines" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "wol_shop_insert" ON "public"."work_order_lines" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "wol_shop_select" ON "public"."work_order_lines" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "wol_shop_update" ON "public"."work_order_lines" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "wolh_same_shop_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."work_orders" "wo"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "p"."shop_id")))));



ALTER TABLE "public"."work_order_approvals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_order_approvals_wo_delete" ON "public"."work_order_approvals" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_approvals_wo_insert" ON "public"."work_order_approvals" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_approvals_wo_select" ON "public"."work_order_approvals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_approvals_wo_update" ON "public"."work_order_approvals" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_approvals"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."work_order_line_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_order_line_history_wo_delete" ON "public"."work_order_line_history" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_line_history_wo_insert" ON "public"."work_order_line_history" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_line_history_wo_select" ON "public"."work_order_line_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_line_history_wo_update" ON "public"."work_order_line_history" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_line_history"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."work_order_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_part_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_order_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_order_parts_shop_delete" ON "public"."work_order_parts" FOR DELETE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_parts_shop_insert" ON "public"."work_order_parts" FOR INSERT TO "authenticated" WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_parts_shop_select" ON "public"."work_order_parts" FOR SELECT TO "authenticated" USING (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_parts_shop_update" ON "public"."work_order_parts" FOR UPDATE TO "authenticated" USING (("shop_id" = "public"."current_shop_id"())) WITH CHECK (("shop_id" = "public"."current_shop_id"()));



CREATE POLICY "work_order_parts_wo_delete" ON "public"."work_order_parts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_parts_wo_insert" ON "public"."work_order_parts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_parts_wo_select" ON "public"."work_order_parts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



CREATE POLICY "work_order_parts_wo_update" ON "public"."work_order_parts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_parts"."work_order_id") AND ("wo"."shop_id" = "public"."current_shop_id"())))));



ALTER TABLE "public"."work_orders" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON FUNCTION "extensions"."grant_pg_graphql_access"() TO "postgres" WITH GRANT OPTION;



REVOKE ALL ON FUNCTION "extensions"."grant_pg_net_access"() FROM "supabase_admin";
GRANT ALL ON FUNCTION "extensions"."grant_pg_net_access"() TO "supabase_admin" WITH GRANT OPTION;
GRANT ALL ON FUNCTION "extensions"."grant_pg_net_access"() TO "dashboard_user";



GRANT ALL ON FUNCTION "extensions"."pgrst_ddl_watch"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "extensions"."pgrst_drop_watch"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "extensions"."set_graphql_placeholder"() TO "postgres" WITH GRANT OPTION;



GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ensure_same_shop"("_wo" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "anon";
GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_can_start"() TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "text", "p_ref_kind" "text", "p_ref_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "public"."stock_move_reason", "p_ref_kind" "text", "p_ref_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "public"."stock_move_reason", "p_ref_kind" "text", "p_ref_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_move"("p_part" "uuid", "p_loc" "uuid", "p_qty" numeric, "p_reason" "public"."stock_move_reason", "p_ref_kind" "text", "p_ref_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_lines"("_wo" "uuid", "_approved_ids" "uuid"[], "_declined_ids" "uuid"[], "_decline_unchecked" boolean, "_approver" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_wol_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_wol_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_wol_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_work_orders_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_work_orders_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_work_orders_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_release_line"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_release_line"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_release_line"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_profile_last_active_on_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_profile_last_active_on_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_profile_last_active_on_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_profile"("target_profile_id" "uuid") TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."current_shop_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."customers_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."customers_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."customers_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_user_count_on_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_user_count_on_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_user_count_on_delete"() TO "service_role";



GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "anon";
GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "authenticated";
GRANT ALL ON PROCEDURE "public"."ensure_user_with_profile"(IN "uid" "uuid", IN "shop" "uuid", IN "role" "text", IN "name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."first_segment_uuid"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_approval_to_work_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_column"("_table" "regclass", "_col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_column"("_table" "regclass", "_col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_column"("_table" "regclass", "_col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_limit"("input_shop_id" "uuid", "increment_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspections_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_customer"("_customer" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_shop_member"("p_shop" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_for_shop"("_shop" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_work_order_line_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_active"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_last_active_now"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_edited_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_edited_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_edited_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_owner_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_owner_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_owner_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_shop_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_shop_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_shop_profiles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_shop_ratings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_shop_ratings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_shop_ratings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profiles_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_recompute_shop_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_recompute_shop_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_recompute_shop_rating"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_timestamps"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_work_orders_shop"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_work_orders_shop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_work_orders_shop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_shop_reviews_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_shop_reviews_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_shop_reviews_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_shops_set_owner_and_creator"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_shops_set_owner_and_creator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_shops_set_owner_and_creator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicles_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wol_set_shop_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."work_orders_set_shop_id"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_events" TO "anon";
GRANT ALL ON TABLE "public"."agent_events" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_events" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_requests" TO "anon";
GRANT ALL ON TABLE "public"."ai_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_requests" TO "service_role";



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



GRANT ALL ON TABLE "public"."feature_reads" TO "anon";
GRANT ALL ON TABLE "public"."feature_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_reads" TO "service_role";



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



GRANT ALL ON TABLE "public"."inspection_sessions" TO "anon";
GRANT ALL ON TABLE "public"."inspection_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_templates" TO "anon";
GRANT ALL ON TABLE "public"."inspection_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_templates" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



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



GRANT ALL ON TABLE "public"."part_returns" TO "anon";
GRANT ALL ON TABLE "public"."part_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."part_returns" TO "service_role";



GRANT ALL ON TABLE "public"."part_stock" TO "anon";
GRANT ALL ON TABLE "public"."part_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."part_stock" TO "service_role";



GRANT ALL ON TABLE "public"."part_stock_summary" TO "anon";
GRANT ALL ON TABLE "public"."part_stock_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."part_stock_summary" TO "service_role";



GRANT ALL ON TABLE "public"."part_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."part_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."part_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."part_warranties" TO "anon";
GRANT ALL ON TABLE "public"."part_warranties" TO "authenticated";
GRANT ALL ON TABLE "public"."part_warranties" TO "service_role";



GRANT ALL ON TABLE "public"."parts" TO "anon";
GRANT ALL ON TABLE "public"."parts" TO "authenticated";
GRANT ALL ON TABLE "public"."parts" TO "service_role";



GRANT ALL ON TABLE "public"."parts_barcodes" TO "anon";
GRANT ALL ON TABLE "public"."parts_barcodes" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_barcodes" TO "service_role";



GRANT ALL ON TABLE "public"."parts_messages" TO "anon";
GRANT ALL ON TABLE "public"."parts_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_messages" TO "service_role";



GRANT ALL ON TABLE "public"."parts_quotes" TO "anon";
GRANT ALL ON TABLE "public"."parts_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."parts_request_messages" TO "anon";
GRANT ALL ON TABLE "public"."parts_request_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_request_messages" TO "service_role";



GRANT ALL ON TABLE "public"."parts_requests" TO "anon";
GRANT ALL ON TABLE "public"."parts_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_requests" TO "service_role";



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



GRANT ALL ON TABLE "public"."shop_time_off" TO "anon";
GRANT ALL ON TABLE "public"."shop_time_off" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_time_off" TO "service_role";



GRANT ALL ON TABLE "public"."shop_time_slots" TO "anon";
GRANT ALL ON TABLE "public"."shop_time_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_time_slots" TO "service_role";



GRANT ALL ON TABLE "public"."stock_locations" TO "anon";
GRANT ALL ON TABLE "public"."stock_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_locations" TO "service_role";



GRANT ALL ON TABLE "public"."stock_moves" TO "anon";
GRANT ALL ON TABLE "public"."stock_moves" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_moves" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



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



GRANT ALL ON TABLE "public"."v_part_stock" TO "anon";
GRANT ALL ON TABLE "public"."v_part_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."v_part_stock" TO "service_role";



GRANT ALL ON TABLE "public"."v_shift_rollups" TO "anon";
GRANT ALL ON TABLE "public"."v_shift_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shift_rollups" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_media" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_media" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_media" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_photos" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_photos" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_recalls" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_recalls" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_recalls" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



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



GRANT ALL ON TABLE "public"."work_order_lines" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."work_order_lines" TO "authenticated";



GRANT ALL ON TABLE "public"."work_order_media" TO "anon";
GRANT ALL ON TABLE "public"."work_order_media" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_media" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "anon";
GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_part_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_parts" TO "anon";
GRANT ALL ON TABLE "public"."work_order_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_parts" TO "service_role";



GRANT ALL ON TABLE "public"."work_orders" TO "anon";
GRANT ALL ON TABLE "public"."work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."work_orders" TO "service_role";












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






RESET ALL;
