begin;

create table if not exists public.work_order_correction_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  invoice_version_id uuid references public.invoice_versions(id) on delete restrict,
  operation_key text not null,
  reason text not null,
  scope text not null default 'operational_correction'
    check (scope in ('operational_correction','invoice_adjustment','void_and_reissue','data_repair')),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (shop_id, operation_key)
);

create unique index if not exists work_order_correction_sessions_one_open_idx
  on public.work_order_correction_sessions(work_order_id)
  where status = 'open';

create index if not exists work_order_correction_sessions_shop_work_order_idx
  on public.work_order_correction_sessions(shop_id, work_order_id, opened_at desc);

alter table public.work_order_correction_sessions enable row level security;

drop policy if exists work_order_correction_sessions_shop_select
  on public.work_order_correction_sessions;
create policy work_order_correction_sessions_shop_select
  on public.work_order_correction_sessions
  for select
  to authenticated
  using (
    shop_id = nullif(current_setting('app.current_shop_id', true), '')::uuid
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = work_order_correction_sessions.shop_id
    )
  );

create or replace function public.work_order_financial_lock_state(
  p_shop_id uuid,
  p_work_order_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest_version as (
    select iv.id, iv.lifecycle_status, iv.version_number, iv.issued_at
    from public.invoice_versions iv
    where iv.shop_id = p_shop_id
      and iv.work_order_id = p_work_order_id
      and iv.lifecycle_status <> 'draft'
    order by iv.version_number desc
    limit 1
  ), open_correction as (
    select cs.id, cs.scope, cs.reason, cs.opened_at
    from public.work_order_correction_sessions cs
    where cs.shop_id = p_shop_id
      and cs.work_order_id = p_work_order_id
      and cs.status = 'open'
    order by cs.opened_at desc
    limit 1
  )
  select jsonb_build_object(
    'locked', exists(select 1 from latest_version) and not exists(select 1 from open_correction),
    'has_financial_history', exists(select 1 from latest_version),
    'invoice_version_id', (select id from latest_version),
    'invoice_lifecycle_status', (select lifecycle_status from latest_version),
    'invoice_version_number', (select version_number from latest_version),
    'correction_session_id', (select id from open_correction),
    'correction_scope', (select scope from open_correction),
    'correction_reason', (select reason from open_correction)
  );
$$;

revoke all on function public.work_order_financial_lock_state(uuid, uuid) from public;
grant execute on function public.work_order_financial_lock_state(uuid, uuid)
  to authenticated, service_role;

create or replace function public.work_order_is_financially_locked(
  p_shop_id uuid,
  p_work_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (public.work_order_financial_lock_state(p_shop_id, p_work_order_id) ->> 'locked')::boolean,
    false
  );
$$;

revoke all on function public.work_order_is_financially_locked(uuid, uuid) from public;
grant execute on function public.work_order_is_financially_locked(uuid, uuid)
  to authenticated, service_role;

create or replace function public.open_work_order_correction_session(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_scope text,
  p_operation_key text,
  p_metadata jsonb default '{}'::jsonb
) returns public.work_order_correction_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.work_order_correction_sessions;
  v_invoice_version_id uuid;
  v_scope text := coalesce(nullif(trim(p_scope), ''), 'operational_correction');
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'Correction reason is required';
  end if;
  if coalesce(trim(p_operation_key), '') = '' then
    raise exception using errcode = 'P0001', message = 'Correction operation key is required';
  end if;
  if v_scope not in ('operational_correction','invoice_adjustment','void_and_reissue','data_repair') then
    raise exception using errcode = 'P0001', message = 'Unsupported correction scope';
  end if;

  perform 1
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop';
  end if;

  select iv.id
    into v_invoice_version_id
  from public.invoice_versions iv
  where iv.shop_id = p_shop_id
    and iv.work_order_id = p_work_order_id
    and iv.lifecycle_status <> 'draft'
  order by iv.version_number desc
  limit 1;

  if v_invoice_version_id is null then
    raise exception using errcode = 'P0001', message = 'Work order has no finalized invoice history';
  end if;

  select *
    into v_session
  from public.work_order_correction_sessions cs
  where cs.shop_id = p_shop_id
    and cs.operation_key = p_operation_key;
  if found then
    return v_session;
  end if;

  if exists (
    select 1
    from public.work_order_correction_sessions cs
    where cs.work_order_id = p_work_order_id
      and cs.status = 'open'
  ) then
    raise exception using errcode = 'P0001', message = 'An open correction session already exists for this work order';
  end if;

  insert into public.work_order_correction_sessions(
    shop_id,
    work_order_id,
    invoice_version_id,
    operation_key,
    reason,
    scope,
    opened_by,
    metadata
  ) values (
    p_shop_id,
    p_work_order_id,
    v_invoice_version_id,
    p_operation_key,
    trim(p_reason),
    v_scope,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_session;

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
    'work_order.correction_opened',
    'work_order.correction_opened:' || v_session.id::text,
    jsonb_build_object(
      'correction_session_id', v_session.id,
      'work_order_id', p_work_order_id,
      'invoice_version_id', v_invoice_version_id,
      'scope', v_scope,
      'reason', trim(p_reason),
      'actor_user_id', p_actor_user_id
    )
  ) on conflict do nothing;

  return v_session;
end;
$$;

create or replace function public.close_work_order_correction_session(
  p_shop_id uuid,
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
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Correction session not found';
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

revoke all on function public.open_work_order_correction_session(uuid,uuid,uuid,text,text,text,jsonb)
  from public, authenticated;
revoke all on function public.close_work_order_correction_session(uuid,uuid,uuid,jsonb)
  from public, authenticated;
grant execute on function public.open_work_order_correction_session(uuid,uuid,uuid,text,text,text,jsonb)
  to service_role;
grant execute on function public.close_work_order_correction_session(uuid,uuid,uuid,jsonb)
  to service_role;

create or replace function public.guard_financially_locked_work_order_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_work_order_id uuid;
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_line_id uuid;
  v_parent_part_id uuid;
begin
  v_shop_id := nullif(v_row ->> 'shop_id', '')::uuid;
  v_work_order_id := nullif(v_row ->> 'work_order_id', '')::uuid;

  if v_work_order_id is null and nullif(v_row ->> 'work_order_line_id', '') is not null then
    v_line_id := (v_row ->> 'work_order_line_id')::uuid;
    select wol.work_order_id, coalesce(v_shop_id, wol.shop_id)
      into v_work_order_id, v_shop_id
    from public.work_order_lines wol
    where wol.id = v_line_id;
  end if;

  if v_work_order_id is null and nullif(v_row ->> 'work_order_part_id', '') is not null then
    v_parent_part_id := (v_row ->> 'work_order_part_id')::uuid;
    select wop.work_order_id, coalesce(v_shop_id, wop.shop_id)
      into v_work_order_id, v_shop_id
    from public.work_order_parts wop
    where wop.id = v_parent_part_id;
  end if;

  if v_shop_id is not null
     and v_work_order_id is not null
     and public.work_order_is_financially_locked(v_shop_id, v_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_FINANCIALLY_LOCKED',
      detail = format(
        'Ordinary %s on %s is blocked after invoice finalization for work order %s',
        tg_op,
        tg_table_name,
        v_work_order_id
      ),
      hint = 'Open an audited correction session before changing finalized work-order source data.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.guard_financially_locked_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_has_financial_history boolean;
  v_old_source jsonb;
  v_new_source jsonb;
  v_allowed_keys text[] := array[
    'updated_at',
    'invoice_total',
    'payment_status',
    'outstanding_balance',
    'paid_at',
    'status'
  ];
begin
  v_locked := public.work_order_is_financially_locked(old.shop_id, old.id);
  if not v_locked then
    return new;
  end if;

  v_has_financial_history := coalesce(
    (public.work_order_financial_lock_state(new.shop_id, new.id) ->> 'has_financial_history')::boolean,
    false
  );

  v_old_source := to_jsonb(old) - v_allowed_keys;
  v_new_source := to_jsonb(new) - v_allowed_keys;

  if v_old_source is distinct from v_new_source then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_FINANCIALLY_LOCKED',
      detail = format(
        'Operational work-order fields cannot change after invoice finalization for work order %s',
        old.id
      ),
      hint = 'Open an audited correction session before changing finalized work-order source data.';
  end if;

  if old.status is distinct from new.status then
    if not (
      v_has_financial_history
      and lower(coalesce(new.status::text, '')) = 'invoiced'
      and lower(coalesce(old.status::text, '')) <> 'invoiced'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'WORK_ORDER_FINANCIALLY_LOCKED',
        detail = format(
          'Work-order status cannot change after invoice finalization for work order %s',
          old.id
        ),
        hint = 'Open an audited correction session before changing finalized work-order source data.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_financially_locked_work_order
  on public.work_orders;
create trigger trg_guard_financially_locked_work_order
before update on public.work_orders
for each row execute function public.guard_financially_locked_work_order();

do $$
declare
  v_table text;
  v_tables text[] := array[
    'work_order_lines',
    'work_order_quote_lines',
    'work_order_parts',
    'work_order_part_allocations',
    'part_requests',
    'part_request_items',
    'work_order_line_technicians',
    'work_order_labor_entries',
    'labor_entries',
    'technician_job_punches'
  ];
  v_has_anchor boolean;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      select exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = v_table
          and c.column_name in ('work_order_id','work_order_line_id','work_order_part_id')
      ) into v_has_anchor;

      if v_has_anchor then
        execute format(
          'drop trigger if exists trg_guard_financially_locked_%I on public.%I',
          v_table,
          v_table
        );
        execute format(
          'create trigger trg_guard_financially_locked_%I before insert or update or delete on public.%I for each row execute function public.guard_financially_locked_work_order_child()',
          v_table,
          v_table
        );
      end if;
    end if;
  end loop;
end;
$$;

comment on function public.guard_financially_locked_work_order_child() is
  'Rejects ordinary mutations to work-order source records after invoice finalization unless an audited correction session is open.';
comment on function public.guard_financially_locked_work_order() is
  'Allows canonical financial rollup fields and the initial transition into invoiced while rejecting later operational mutations.';

notify pgrst, 'reload schema';

commit;
