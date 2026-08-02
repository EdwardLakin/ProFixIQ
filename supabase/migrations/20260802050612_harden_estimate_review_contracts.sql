begin;

-- Search and status filtering must happen before the page bound so older
-- estimates remain discoverable without loading an unbounded tenant dataset.
create or replace function public.search_estimate_work_order_ids(
  p_shop_id uuid,
  p_mode text,
  p_status text,
  p_search text,
  p_offset integer,
  p_limit integer
)
returns table(work_order_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select w.id
  from public.work_orders w
  left join public.customers c
    on c.id = w.customer_id and c.shop_id = w.shop_id
  left join public.vehicles v
    on v.id = w.vehicle_id and v.shop_id = w.shop_id
  where w.shop_id = p_shop_id
    and w.estimate_number is not null
    and (
      lower(btrim(coalesce(p_mode, 'advisor'))) <> 'parts'
      or w.estimate_status = 'waiting_for_parts'
    )
    and (
      lower(btrim(coalesce(p_mode, 'advisor'))) = 'parts'
      or nullif(lower(btrim(coalesce(p_status, 'all'))), 'all') is null
      or (
        lower(btrim(p_status)) = 'approved'
        and w.estimate_status in ('approved', 'partially_approved')
      )
      or (
        lower(btrim(p_status)) = 'declined'
        and w.estimate_status in ('declined', 'deferred', 'expired')
      )
      or w.estimate_status = lower(btrim(p_status))
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or concat_ws(
        ' ',
        w.estimate_number,
        w.custom_id,
        c.business_name,
        c.name,
        c.first_name,
        c.last_name,
        v.vin,
        v.unit_number,
        v.year,
        v.make,
        v.model,
        v.license_plate
      ) ilike '%' || btrim(p_search) || '%'
    )
  order by w.updated_at desc nulls last, w.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 49), 1), 101);
$$;

revoke all on function public.search_estimate_work_order_ids(
  uuid, text, text, text, integer, integer
) from public, anon;
grant execute on function public.search_estimate_work_order_ids(
  uuid, text, text, text, integer, integer
) to authenticated, service_role;

-- Treat every accepted draft write as a compare-and-swap mutation. The
-- revision returned to the caller is the version required by the next write.
do $migration$
declare
  v_sql text;
  v_patch_count integer := 0;
begin
  select pg_get_functiondef(
    'public.save_estimate_draft_atomic(uuid,uuid,integer,jsonb,text,timestamptz,text)'::regprocedure
  ) into v_sql;

  if position('v_next_revision integer;' in v_sql) = 0 then
    if position('v_line_notes jsonb := ''{}''::jsonb;' in v_sql) = 0 then
      raise exception 'save_estimate_draft_atomic revision declaration patch point not found';
    end if;
    v_sql := replace(
      v_sql,
      'v_line_notes jsonb := ''{}''::jsonb;',
      'v_line_notes jsonb := ''{}''::jsonb;' || E'\n  v_next_revision integer;'
    );
    v_patch_count := v_patch_count + 1;

    v_sql := replace(
      v_sql,
      E'  if v_work_order.estimate_status <> ''draft''\n     or v_work_order.estimate_revision <> p_expected_revision then\n    raise exception using errcode = ''40001'', message = ''Estimate draft is stale or no longer editable.'';\n  end if;',
      E'  if v_work_order.estimate_status <> ''draft''\n     or v_work_order.estimate_revision <> p_expected_revision then\n    raise exception using errcode = ''40001'', message = ''Estimate draft is stale or no longer editable.'';\n  end if;\n  v_next_revision := v_work_order.estimate_revision + 1;'
    );
    v_patch_count := v_patch_count + 1;

    v_sql := replace(
      v_sql,
      E'    p_shop_id, p_work_order_id, v_work_order.estimate_revision,\n    ''draft_saved'', v_actor_profile_id, p_idempotency_key',
      E'    p_shop_id, p_work_order_id, v_next_revision,\n    ''draft_saved'', v_actor_profile_id, p_idempotency_key'
    );
    v_patch_count := v_patch_count + 1;

    v_sql := replace(
      v_sql,
      '''estimate_revision'', v_work_order.estimate_revision,',
      '''estimate_revision'', v_next_revision,'
    );
    v_patch_count := v_patch_count + 1;

    v_sql := replace(
      v_sql,
      E'  set notes = null,\n      estimate_expires_at = p_expires_at,',
      E'  set notes = null,\n      estimate_expires_at = p_expires_at,\n      estimate_revision = v_next_revision,'
    );
    v_patch_count := v_patch_count + 1;

    v_sql := replace(
      v_sql,
      '''estimateStatus'', ''draft'', ''estimateRevision'', v_work_order.estimate_revision,',
      '''estimateStatus'', ''draft'', ''estimateRevision'', v_next_revision,'
    );
    v_patch_count := v_patch_count + 1;

    if v_patch_count <> 6
       or position('v_next_revision := v_work_order.estimate_revision + 1;' in v_sql) = 0
       or position('estimate_revision = v_next_revision' in v_sql) = 0
       or position('''estimateRevision'', v_next_revision' in v_sql) = 0 then
      raise exception 'save_estimate_draft_atomic revision patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- Expiration is enforced while the canonical work order is locked. Returning
-- an error object (instead of raising) commits the lifecycle transition.
do $migration$
declare
  v_sql text;
  v_guard text := E'  if v_work_order.estimate_expires_at is not null\n     and v_work_order.estimate_expires_at < now() then\n    update public.work_orders\n    set estimate_status = ''expired'', updated_at = now()\n    where id = p_work_order_id\n      and shop_id = p_shop_id\n      and estimate_status <> ''approved'';\n    return jsonb_build_object(\n      ''ok'', false, ''expired'', true,\n      ''error'', ''This estimate has expired and cannot be sent.''\n    );\n  end if;';
  v_anchor text := E'  if v_work_order.estimate_revision <> p_revision then\n    raise exception using errcode = ''40001'', message = ''Estimate revision is stale.'';\n  end if;';
begin
  select pg_get_functiondef(
    'public.reserve_estimate_send_atomic(uuid,uuid,integer,text,uuid,uuid,uuid[],boolean)'::regprocedure
  ) into v_sql;

  if position('This estimate has expired and cannot be sent.' in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'reserve_estimate_send_atomic expiration patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_anchor || E'\n' || v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'reserve_estimate_send_atomic expiration patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- Customer and shop-recorded decisions share this canonical function. Replays
-- of an already-committed operation stay valid; new decisions past the shop's
-- deadline are rejected atomically before quote lines can change.
do $migration$
declare
  v_sql text;
  v_guard text := E'  if v_work_order.estimate_number is not null\n     and v_work_order.estimate_expires_at is not null\n     and v_work_order.estimate_expires_at < now() then\n    update public.work_orders\n    set estimate_status = ''expired'', updated_at = now()\n    where id = p_work_order_id\n      and shop_id = p_shop_id\n      and estimate_status <> ''approved'';\n    return jsonb_build_object(\n      ''ok'', false, ''expired'', true,\n      ''error'', ''This estimate expired before the decision was submitted.''\n    );\n  end if;';
  v_anchor text := E'  if p_customer_id is not null and v_work_order.customer_id is distinct from p_customer_id then\n    raise exception using errcode = ''P0001'', message = ''Customer does not own this work order.'';\n  end if;';
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position('This estimate expired before the decision was submitted.' in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_atomic expiration patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_anchor || E'\n' || v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_atomic expiration patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- The shop-recorded wrapper delegates to the canonical customer function.
-- Do not record decision metadata or an operation key when that delegate
-- rejects an expired estimate.
do $migration$
declare
  v_sql text;
  v_anchor text := E'  v_result := public.apply_customer_quote_decision_atomic(\n    p_shop_id,\n    p_work_order_id,\n    p_quote_line_ids,\n    v_decision,\n    false,\n    null,\n    p_actor_user_id,\n    p_operation_key || '':canonical'',\n    v_now\n  );';
  v_guard text := E'  if coalesce((v_result ->> ''ok'')::boolean, false) = false then\n    return v_result;\n  end if;';
begin
  select pg_get_functiondef(
    'public.apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position(v_guard in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'apply_shop_quote_decision_atomic delegate patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_anchor || E'\n' || v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'apply_shop_quote_decision_atomic delegate patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- Fail the migration if any authoritative contract was not installed.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.save_estimate_draft_atomic(uuid,uuid,integer,jsonb,text,timestamptz,text)'::regprocedure
  ) into v_definition;
  if position('v_next_revision := v_work_order.estimate_revision + 1;' in v_definition) = 0
     or position('estimate_revision = v_next_revision' in v_definition) = 0 then
    raise exception 'Draft revision hardening postcondition failed';
  end if;

  select pg_get_functiondef(
    'public.reserve_estimate_send_atomic(uuid,uuid,integer,text,uuid,uuid,uuid[],boolean)'::regprocedure
  ) into v_definition;
  if position('This estimate has expired and cannot be sent.' in v_definition) = 0 then
    raise exception 'Estimate send expiration postcondition failed';
  end if;

  select pg_get_functiondef(
    'public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position('This estimate expired before the decision was submitted.' in v_definition) = 0 then
    raise exception 'Estimate decision expiration postcondition failed';
  end if;

  select pg_get_functiondef(
    'public.apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position('if coalesce((v_result ->> ''ok'')::boolean, false) = false then' in v_definition) = 0 then
    raise exception 'Shop decision rejection propagation postcondition failed';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
