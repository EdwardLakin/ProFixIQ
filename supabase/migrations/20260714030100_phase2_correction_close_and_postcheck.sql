begin;

create or replace function public.close_work_order_correction_session(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_correction_session_id uuid,
  p_actor_user_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns public.work_order_correction_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.work_order_correction_sessions;
begin
  select *
    into v_session
  from public.work_order_correction_sessions cs
  where cs.id = p_correction_session_id
    and cs.shop_id = p_shop_id
    and cs.work_order_id = p_work_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Correction session not found for work order';
  end if;
  if v_session.status = 'closed' then
    return v_session;
  end if;
  if v_session.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'Correction session is not open';
  end if;

  update public.work_order_correction_sessions
  set
    status = 'closed',
    closed_by = p_actor_user_id,
    closed_at = now(),
    metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
  where id = p_correction_session_id
    and shop_id = p_shop_id
    and work_order_id = p_work_order_id
  returning * into v_session;

  insert into public.financial_domain_outbox(
    shop_id,
    aggregate_type,
    aggregate_id,
    event_type,
    dedupe_key,
    payload
  ) values (
    p_shop_id,
    'work_order_correction',
    v_session.id,
    'work_order.correction_closed',
    'work_order.correction_closed:' || v_session.id::text,
    jsonb_build_object(
      'correction_session_id', v_session.id,
      'work_order_id', v_session.work_order_id,
      'invoice_version_id', v_session.invoice_version_id,
      'actor_user_id', p_actor_user_id
    )
  ) on conflict do nothing;

  return v_session;
end;
$$;

revoke all on function public.close_work_order_correction_session(uuid,uuid,uuid,uuid,jsonb)
  from public, authenticated;
grant execute on function public.close_work_order_correction_session(uuid,uuid,uuid,uuid,jsonb)
  to service_role;

revoke all on function public.close_work_order_correction_session(uuid,uuid,uuid,jsonb)
  from public, authenticated, service_role;
drop function public.close_work_order_correction_session(uuid,uuid,uuid,jsonb);

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.work_order_correction_sessions') is null then
    v_missing := array_append(v_missing, 'table:work_order_correction_sessions');
  end if;

  if to_regprocedure('public.work_order_financial_lock_state(uuid,uuid)') is null then
    v_missing := array_append(v_missing, 'function:work_order_financial_lock_state');
  end if;

  if to_regprocedure('public.open_work_order_correction_session(uuid,uuid,uuid,text,text,text,jsonb)') is null then
    v_missing := array_append(v_missing, 'function:open_work_order_correction_session');
  end if;

  if to_regprocedure('public.close_work_order_correction_session(uuid,uuid,uuid,uuid,jsonb)') is null then
    v_missing := array_append(v_missing, 'function:close_work_order_correction_session');
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.work_orders'::regclass
      and t.tgname = 'trg_guard_financially_locked_work_order'
      and not t.tgisinternal
  ) then
    v_missing := array_append(v_missing, 'trigger:work_orders');
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.work_order_lines'::regclass
      and t.tgname = 'trg_guard_financially_locked_work_order_lines'
      and not t.tgisinternal
  ) then
    v_missing := array_append(v_missing, 'trigger:work_order_lines');
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.work_order_quote_lines'::regclass
      and t.tgname = 'trg_guard_financially_locked_work_order_quote_lines'
      and not t.tgisinternal
  ) then
    v_missing := array_append(v_missing, 'trigger:work_order_quote_lines');
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.work_order_parts'::regclass
      and t.tgname = 'trg_guard_financially_locked_work_order_parts'
      and not t.tgisinternal
  ) then
    v_missing := array_append(v_missing, 'trigger:work_order_parts');
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Phase 2 lifecycle protection postcheck failed: %', array_to_string(v_missing, ', ');
  end if;

  raise notice 'Phase 2 lifecycle protection postcheck passed.';
end;
$$;

notify pgrst, 'reload schema';

commit;
