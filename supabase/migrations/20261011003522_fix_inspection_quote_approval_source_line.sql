begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Regression history -------------------------------------------------------
--
-- Approving a quote line that was imported from an inspection used to create
-- its own punchable repair line (last known good: 2026-07-23, EL000004). It
-- now merges the repair into the inspection job. Two changes combined:
--
--   1. 2026-07-31, 20260731162625_repair_parts_quote_linkage_p0 (01c617a2f):
--      approval was changed to reuse source_work_order_line_id instead of
--      creating a duplicate line. Correct for quotes created from a repair
--      job's parts request, where the source line IS the repair.
--   2. 2026-09-09, 20260909163200_harden_deferred_work_shared_integration
--      (07160738c): a backfill and trigger began copying
--      metadata.source_work_order_line_id into the source column for every
--      quote line. The inspection import writes the inspection job there, so
--      from this point every inspection-imported quote resolved to the
--      "reuse the source line" path in (1).
--
-- Reusing the inspection job as the approved line merged the repair into it:
-- activate_source_work_order_line_from_quote overwrote its price_estimate and
-- approval state, the Parts Request and items were relinked to it, and no
-- separate repair line existed. It also masked a latent failure: quotes
-- imported from inspections carry job_type 'inspection-fail' (since the
-- 2026-08-27 data), which work_order_lines_job_type_check has never allowed,
-- so creating a dedicated line would have failed the insert.
--
-- The source column stays populated (deferred-work lineage depends on it);
-- only what approval does with it changes.
--
-- A quote line imported from an inspection records the inspection job as its
-- source_work_order_line_id. That line is the inspection itself, not the repair
-- the customer is approving. Customer approval used to reuse the source line as
-- the materialized work-order line, which merged the repair into the inspection
-- job (labor/price overwritten, parts relinked) and left no separate punchable
-- repair line. Only quote lines whose source is a genuine repair job may reuse
-- it; inspection-sourced quotes must materialize their own line.
create or replace function public.quote_line_source_line_is_reusable(
  p_shop_id uuid,
  p_metadata jsonb,
  p_source_line_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_source_line_id is null then false
    when nullif(
      btrim(coalesce(p_metadata ->> 'source_inspection_id', '')),
      ''
    ) is not null then false
    else not exists (
      select 1
      from public.work_order_lines source_line
      where source_line.id = p_source_line_id
        and source_line.shop_id = p_shop_id
        and lower(btrim(coalesce(source_line.job_type::text, ''))) = 'inspection'
    )
  end;
$$;

comment on function public.quote_line_source_line_is_reusable(uuid, jsonb, uuid) is
  'True only when a quote line''s source work-order line is a repair job that approval may authorize in place. Inspection-sourced quotes (source_inspection_id metadata, or an inspection source line) must materialize their own work-order line.';

revoke all on function public.quote_line_source_line_is_reusable(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.quote_line_source_line_is_reusable(uuid, jsonb, uuid)
  to service_role;

-- Customer decision engine: stop falling back to an inspection source line,
-- and map quote job types the work-order line check constraint rejects
-- (e.g. 'inspection-fail', 'customer_request') to 'repair' when materializing.
do $$
declare
  v_sql text;
  v_old text := 'v_work_order_line_id := coalesce(v_quote.work_order_line_id, v_quote.source_work_order_line_id);';
  v_new text := E'v_work_order_line_id := coalesce(\n        v_quote.work_order_line_id,\n        case\n          when public.quote_line_source_line_is_reusable(\n            v_quote.shop_id,\n            v_quote.metadata,\n            v_quote.source_work_order_line_id\n          ) then v_quote.source_work_order_line_id\n        end\n      );';
  v_old_type text := E'coalesce(nullif(trim(v_quote.job_type::text), \'\'), \'repair\'),';
  v_new_type text := E'case\n            when lower(trim(coalesce(v_quote.job_type::text, \'\'))) in (\n              \'diagnosis\', \'inspection\', \'maintenance\', \'repair\', \'tech-suggested\'\n            ) then lower(trim(v_quote.job_type::text))\n            else \'repair\'\n          end,';
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position('quote_line_source_line_is_reusable' in v_sql) > 0 then
    return;
  end if;
  if position(v_old in v_sql) = 0 or position(v_old_type in v_sql) = 0 then
    raise exception 'Customer quote decision engine source-line replacement did not match';
  end if;

  execute replace(replace(v_sql, v_old, v_new), v_old_type, v_new_type);
end;
$$;

-- Approval trigger: do not activate (approve / reprice) an inspection source
-- line from a quote that was imported from that inspection.
do $$
declare
  v_sql text;
  v_old text := 'if new.source_work_order_line_id is null';
  v_new text := E'if new.source_work_order_line_id is null\n     or not public.quote_line_source_line_is_reusable(\n       new.shop_id,\n       new.metadata,\n       new.source_work_order_line_id\n     )';
begin
  select pg_get_functiondef(
    'public.activate_source_work_order_line_from_quote()'::regprocedure
  ) into v_sql;

  if position('quote_line_source_line_is_reusable' in v_sql) > 0 then
    return;
  end if;
  if position(v_old in v_sql) = 0 then
    raise exception 'Source work-order line activation trigger replacement did not match';
  end if;

  execute replace(v_sql, v_old, v_new);
end;
$$;

do $$
declare
  v_engine text;
  v_trigger text;
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_engine;
  select pg_get_functiondef(
    'public.activate_source_work_order_line_from_quote()'::regprocedure
  ) into v_trigger;

  if position('quote_line_source_line_is_reusable' in v_engine) = 0
     or position('quote_line_source_line_is_reusable' in v_trigger) = 0 then
    raise exception 'Inspection quote approval source-line postcheck failed';
  end if;
end;
$$;

commit;
