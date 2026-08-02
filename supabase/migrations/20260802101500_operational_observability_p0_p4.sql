begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_role text,
  entity_type text not null,
  entity_id uuid,
  parent_entity_type text,
  parent_entity_id uuid,
  correlation_id uuid,
  causation_id uuid references public.operational_events(id) on delete set null,
  idempotency_key text,
  source text not null default 'database_trigger',
  severity text not null default 'info',
  schema_version smallint not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_events_event_type_format
    check (event_type ~ '^[a-z0-9_]+([.][a-z0-9_]+)+$'),
  constraint operational_events_entity_type_nonempty
    check (length(btrim(entity_type)) > 0),
  constraint operational_events_source_nonempty
    check (length(btrim(source)) > 0),
  constraint operational_events_severity_valid
    check (severity in ('info', 'warning', 'critical')),
  constraint operational_events_schema_version_positive
    check (schema_version > 0)
);

create unique index if not exists operational_events_shop_idempotency_uidx
  on public.operational_events (shop_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists operational_events_shop_occurred_idx
  on public.operational_events (shop_id, occurred_at desc);

create index if not exists operational_events_shop_type_occurred_idx
  on public.operational_events (shop_id, event_type, occurred_at desc);

create index if not exists operational_events_entity_idx
  on public.operational_events (shop_id, entity_type, entity_id, occurred_at desc);

create index if not exists operational_events_parent_idx
  on public.operational_events (shop_id, parent_entity_type, parent_entity_id, occurred_at desc);

create index if not exists operational_events_correlation_idx
  on public.operational_events (shop_id, correlation_id, occurred_at asc)
  where correlation_id is not null;

create table if not exists public.operational_event_failures (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  fingerprint text not null,
  event_type text,
  entity_type text,
  entity_id uuid,
  source_table text,
  sqlstate text,
  error_message text not null,
  context jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_event_failures_attempt_count_positive
    check (attempt_count > 0)
);

create unique index if not exists operational_event_failures_shop_fingerprint_uidx
  on public.operational_event_failures (shop_id, fingerprint);

create index if not exists operational_event_failures_shop_active_idx
  on public.operational_event_failures (shop_id, last_seen_at desc)
  where resolved_at is null;

alter table public.operational_events enable row level security;
alter table public.operational_event_failures enable row level security;

drop policy if exists operational_events_owner_read on public.operational_events;
create policy operational_events_owner_read
  on public.operational_events
  for select
  to authenticated
  using (
    public.is_shop_member_v2(shop_id)
    and lower(coalesce(public.profixiq_current_role(), '')) in ('owner', 'admin', 'manager')
  );

drop policy if exists operational_event_failures_owner_read on public.operational_event_failures;
create policy operational_event_failures_owner_read
  on public.operational_event_failures
  for select
  to authenticated
  using (
    shop_id is not null
    and public.is_shop_member_v2(shop_id)
    and lower(coalesce(public.profixiq_current_role(), '')) in ('owner', 'admin', 'manager')
  );

revoke all on public.operational_events from anon;
revoke all on public.operational_event_failures from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.operational_events from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.operational_event_failures from authenticated;
grant select on public.operational_events to authenticated;
grant select on public.operational_event_failures to authenticated;
grant select, insert on public.operational_events to service_role;
grant select, insert, update on public.operational_event_failures to service_role;

create or replace function private.operational_event_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.operational_event_slug(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    trim(both '_' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '_', 'g')),
    ''
  );
$$;

create or replace function private.operational_event_path(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    trim(both '.' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9.]+', '_', 'g')),
    ''
  );
$$;

create or replace function private.resolve_operational_event_failure(
  p_shop_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_table text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
begin
  if p_shop_id is null then
    return;
  end if;

  v_fingerprint := md5(concat_ws(
    '|',
    p_shop_id::text,
    coalesce(p_event_type, ''),
    coalesce(p_entity_type, ''),
    coalesce(p_entity_id::text, ''),
    coalesce(p_source_table, '')
  ));

  update public.operational_event_failures
  set resolved_at = now(),
      updated_at = now()
  where shop_id = p_shop_id
    and fingerprint = v_fingerprint
    and resolved_at is null;

  if not exists (
    select 1
    from public.operational_event_failures f
    where f.shop_id = p_shop_id
      and f.resolved_at is null
  ) then
    update public.assistant_notifications
    set status = 'resolved',
        resolved_at = now(),
        updated_at = now()
    where shop_id = p_shop_id
      and code = 'operational_event_write_failure'
      and status <> 'resolved';
  end if;
end;
$$;

create or replace function private.record_operational_event_failure(
  p_shop_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_table text,
  p_sqlstate text,
  p_error_message text,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
  v_failure_count integer;
begin
  v_fingerprint := md5(concat_ws(
    '|',
    coalesce(p_shop_id::text, ''),
    coalesce(p_event_type, ''),
    coalesce(p_entity_type, ''),
    coalesce(p_entity_id::text, ''),
    coalesce(p_source_table, '')
  ));

  insert into public.operational_event_failures (
    shop_id,
    fingerprint,
    event_type,
    entity_type,
    entity_id,
    source_table,
    sqlstate,
    error_message,
    context
  )
  values (
    p_shop_id,
    v_fingerprint,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_source_table,
    p_sqlstate,
    left(coalesce(p_error_message, 'Unknown operational event failure'), 1000),
    coalesce(p_context, '{}'::jsonb)
  )
  on conflict (shop_id, fingerprint)
  do update
  set sqlstate = excluded.sqlstate,
      error_message = excluded.error_message,
      context = excluded.context,
      attempt_count = public.operational_event_failures.attempt_count + 1,
      last_seen_at = now(),
      resolved_at = null,
      updated_at = now();

  if p_shop_id is null then
    return;
  end if;

  select count(*)::integer
    into v_failure_count
  from public.operational_event_failures f
  where f.shop_id = p_shop_id
    and f.resolved_at is null;

  insert into public.assistant_notifications (
    shop_id,
    user_id,
    role,
    source,
    fingerprint,
    code,
    level,
    title,
    message,
    href,
    entity_type,
    entity_id,
    status,
    metadata,
    first_seen_at,
    last_seen_at,
    resolved_at,
    created_at,
    updated_at
  )
  values (
    p_shop_id,
    null,
    'owner',
    'observability',
    'observability::operational_event_write_failure',
    'operational_event_write_failure',
    'critical',
    'Operational event logging needs attention',
    format(
      'ProFixIQ preserved the business action, but %s operational event failure%s require review.',
      v_failure_count,
      case when v_failure_count = 1 then '' else 's' end
    ),
    '/dashboard/operations/observability?panel=failures',
    coalesce(nullif(p_entity_type, ''), 'shop'),
    coalesce(p_entity_id, p_shop_id),
    'active',
    jsonb_build_object(
      'failure_count', v_failure_count,
      'event_type', p_event_type,
      'source_table', p_source_table,
      'sqlstate', p_sqlstate
    ),
    now(),
    now(),
    null,
    now(),
    now()
  )
  on conflict (shop_id, fingerprint)
  do update
  set level = excluded.level,
      title = excluded.title,
      message = excluded.message,
      href = excluded.href,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      status = 'active',
      metadata = excluded.metadata,
      last_seen_at = now(),
      resolved_at = null,
      updated_at = now();
end;
$$;

create or replace function private.append_operational_event(
  p_shop_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_actor_user_id uuid,
  p_actor_role text,
  p_entity_type text,
  p_entity_id uuid,
  p_parent_entity_type text,
  p_parent_entity_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_idempotency_key text,
  p_source text,
  p_severity text,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_shop_id is null then
    raise exception using
      errcode = '23502',
      message = 'Operational event shop_id is required';
  end if;

  if p_event_type is null
    or p_event_type !~ '^[a-z0-9_]+([.][a-z0-9_]+)+$'
  then
    raise exception using
      errcode = '22023',
      message = 'Operational event type is invalid';
  end if;

  insert into public.operational_events (
    shop_id,
    event_type,
    occurred_at,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    parent_entity_type,
    parent_entity_id,
    correlation_id,
    causation_id,
    idempotency_key,
    source,
    severity,
    metadata
  )
  values (
    p_shop_id,
    p_event_type,
    coalesce(p_occurred_at, now()),
    p_actor_user_id,
    p_actor_role,
    p_entity_type,
    p_entity_id,
    p_parent_entity_type,
    p_parent_entity_id,
    p_correlation_id,
    p_causation_id,
    nullif(p_idempotency_key, ''),
    coalesce(nullif(p_source, ''), 'database_trigger'),
    case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (shop_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id
      into v_id
    from public.operational_events
    where shop_id = p_shop_id
      and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

create or replace function private.capture_operational_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_shop_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_parent_entity_type text;
  v_parent_entity_id uuid;
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_inspection_id uuid;
  v_actor_user_id uuid;
  v_actor_role text;
  v_event_type text;
  v_prefix text;
  v_old_status text;
  v_new_status text;
  v_old_stage text;
  v_new_stage text;
  v_occurred_at timestamptz;
  v_idempotency_key text;
  v_source text := 'database_trigger:' || tg_table_name;
  v_metadata jsonb;
begin
  v_entity_id := private.operational_event_uuid(v_row ->> 'id');
  v_shop_id := private.operational_event_uuid(v_row ->> 'shop_id');
  v_work_order_id := private.operational_event_uuid(v_row ->> 'work_order_id');
  v_work_order_line_id := private.operational_event_uuid(v_row ->> 'work_order_line_id');
  v_inspection_id := private.operational_event_uuid(v_row ->> 'inspection_id');

  if tg_table_name = 'work_orders' then
    v_work_order_id := v_entity_id;
  elsif tg_table_name = 'work_order_lines' then
    v_work_order_line_id := v_entity_id;
  elsif tg_table_name = 'inspections' then
    v_inspection_id := v_entity_id;
  end if;

  if v_shop_id is null and tg_table_name = 'inspection_items' then
    select i.shop_id, i.work_order_id, i.work_order_line_id
      into v_shop_id, v_work_order_id, v_work_order_line_id
    from public.inspections i
    where i.id = private.operational_event_uuid(v_row ->> 'inspection_id');
  elsif v_shop_id is null and tg_table_name = 'purchase_order_lines' then
    select po.shop_id
      into v_shop_id
    from public.purchase_orders po
    where po.id = private.operational_event_uuid(v_row ->> 'po_id');
  elsif v_shop_id is null and tg_table_name = 'punch_events' then
    select p.shop_id
      into v_shop_id
    from public.profiles p
    where p.id = coalesce(
      private.operational_event_uuid(v_row ->> 'profile_id'),
      private.operational_event_uuid(v_row ->> 'user_id')
    )
    limit 1;
  elsif v_shop_id is null and tg_table_name = 'messages' then
    select c.shop_id, c.work_order_id
      into v_shop_id, v_work_order_id
    from public.conversations c
    where c.id = private.operational_event_uuid(v_row ->> 'conversation_id');
  elsif v_shop_id is null and tg_table_name = 'portal_notifications' then
    select wo.shop_id
      into v_shop_id
    from public.work_orders wo
    where wo.id = private.operational_event_uuid(v_row ->> 'work_order_id');
  end if;

  if v_shop_id is null then
    raise exception using
      errcode = '23502',
      message = format('Unable to resolve shop_id for %s', tg_table_name);
  end if;

  v_actor_user_id := coalesce(
    private.operational_event_uuid(v_row ->> 'actor_user_id'),
    private.operational_event_uuid(v_row ->> 'actor_profile_id'),
    private.operational_event_uuid(v_row ->> 'approved_by'),
    private.operational_event_uuid(v_row ->> 'issued_by'),
    private.operational_event_uuid(v_row ->> 'created_by'),
    private.operational_event_uuid(v_row ->> 'requested_by'),
    private.operational_event_uuid(v_row ->> 'assigned_by'),
    private.operational_event_uuid(v_row ->> 'sender_id'),
    private.operational_event_uuid(v_row ->> 'technician_id'),
    private.operational_event_uuid(v_row ->> 'profile_id'),
    private.operational_event_uuid(v_row ->> 'user_id'),
    auth.uid()
  );

  if v_actor_user_id is not null then
    select p.role
      into v_actor_role
    from public.profiles p
    where p.id = v_actor_user_id
    limit 1;
  end if;

  v_old_status := lower(nullif(coalesce(
    v_old ->> 'status',
    v_old ->> 'lifecycle_status',
    v_old ->> 'approval_state'
  ), ''));
  v_new_status := lower(nullif(coalesce(
    v_row ->> 'status',
    v_row ->> 'lifecycle_status',
    v_row ->> 'approval_state'
  ), ''));
  v_old_stage := lower(nullif(v_old ->> 'stage', ''));
  v_new_stage := lower(nullif(v_row ->> 'stage', ''));

  case tg_table_name
    when 'work_orders' then
      v_entity_type := 'work_order';
      v_prefix := 'work_order';
    when 'work_order_lines' then
      v_entity_type := 'work_order_line';
      v_prefix := 'work_order_line';
    when 'inspections' then
      v_entity_type := 'inspection';
      v_prefix := 'inspection';
    when 'inspection_items' then
      v_entity_type := 'inspection_item';
      v_prefix := 'inspection_item';
    when 'work_order_quote_lines' then
      v_entity_type := 'quote_line';
      v_prefix := 'quote_line';
    when 'part_requests' then
      v_entity_type := 'part_request';
      v_prefix := 'parts.request';
    when 'part_request_items' then
      v_entity_type := 'part_request_item';
      v_prefix := 'parts.request_item';
    when 'purchase_orders' then
      v_entity_type := 'purchase_order';
      v_prefix := 'parts.purchase_order';
    when 'purchase_order_lines' then
      v_entity_type := 'purchase_order_line';
      v_prefix := 'parts.purchase_order_line';
    when 'work_order_parts' then
      v_entity_type := 'work_order_part';
      v_prefix := 'parts.work_order_part';
    when 'parts_disposition_events' then
      v_entity_type := 'parts_disposition_event';
      v_prefix := 'parts.disposition';
    when 'work_order_line_labor_segments' then
      v_entity_type := 'work_order_line_labor_segment';
      v_prefix := 'workforce.job';
    when 'punch_events' then
      v_entity_type := 'punch_event';
      v_prefix := 'workforce.punch';
    when 'payroll_time_entries' then
      v_entity_type := 'payroll_time_entry';
      v_prefix := 'workforce.payroll_entry';
    when 'invoices' then
      v_entity_type := 'invoice';
      v_prefix := 'invoice';
    when 'invoice_versions' then
      v_entity_type := 'invoice_version';
      v_prefix := 'invoice.version';
    when 'payment_events' then
      v_entity_type := 'payment_event';
      v_prefix := 'invoice.payment';
    when 'bookings' then
      v_entity_type := 'booking';
      v_prefix := 'booking';
    when 'fleet_service_requests' then
      v_entity_type := 'fleet_service_request';
      v_prefix := 'fleet.service_request';
    when 'estimate_events' then
      v_entity_type := 'estimate_event';
      v_prefix := 'estimate';
    when 'ai_action_events' then
      v_entity_type := 'ai_action_event';
      v_prefix := 'ai';
    when 'portal_notifications' then
      v_entity_type := 'portal_notification';
      v_prefix := 'portal.notification';
    when 'conversations' then
      v_entity_type := 'conversation';
      v_prefix := 'messaging.conversation';
    when 'messages' then
      v_entity_type := 'message';
      v_prefix := 'messaging.message';
    else
      return new;
  end case;

  if tg_table_name = 'punch_events' then
    v_event_type := v_prefix || '.' || coalesce(
      private.operational_event_slug(v_row ->> 'event_type'),
      'recorded'
    );
  elsif tg_table_name = 'parts_disposition_events' then
    v_event_type := v_prefix || '.' || coalesce(
      private.operational_event_slug(v_row ->> 'disposition_kind'),
      'recorded'
    );
  elsif tg_table_name = 'payment_events' then
    v_event_type := v_prefix || '.' || coalesce(
      private.operational_event_slug(v_row ->> 'event_kind'),
      'recorded'
    );
  elsif tg_table_name = 'estimate_events' then
    v_event_type := v_prefix || '.' || coalesce(
      private.operational_event_path(v_row ->> 'event_type'),
      'recorded'
    );
  elsif tg_table_name = 'ai_action_events' then
    v_event_type := v_prefix || '.' || coalesce(
      private.operational_event_path(v_row ->> 'event_type'),
      'recorded'
    );
  elsif tg_table_name = 'work_order_line_labor_segments' then
    if tg_op = 'INSERT' then
      v_event_type := 'workforce.job.started';
    elsif (v_old ->> 'ended_at') is null and (v_row ->> 'ended_at') is not null then
      v_event_type := 'workforce.job.ended';
    elsif (v_old ->> 'ended_at') is distinct from (v_row ->> 'ended_at') then
      v_event_type := 'workforce.job.corrected';
    else
      return new;
    end if;
  elsif tg_table_name = 'work_order_lines'
    and tg_op = 'UPDATE'
    and (v_old ->> 'assigned_tech_id') is distinct from (v_row ->> 'assigned_tech_id')
  then
    v_event_type := 'work_order_line.assignment.changed';
  elsif tg_table_name = 'work_order_lines'
    and tg_op = 'UPDATE'
    and (
      (v_old ->> 'cause') is distinct from (v_row ->> 'cause')
      or (v_old ->> 'correction') is distinct from (v_row ->> 'correction')
    )
  then
    v_event_type := 'work_order_line.documentation.updated';
  elsif tg_op = 'INSERT' then
    v_event_type := v_prefix || '.created';
  elsif tg_op = 'DELETE' then
    v_event_type := v_prefix || '.deleted';
  elsif tg_table_name = 'work_order_parts'
    and (v_old ->> 'lifecycle_status') is distinct from (v_row ->> 'lifecycle_status')
  then
    v_event_type := 'parts.work_order_part.status.' ||
      coalesce(private.operational_event_slug(v_row ->> 'lifecycle_status'), 'updated');
  elsif tg_table_name = 'invoice_versions'
    and (v_old ->> 'lifecycle_status') is distinct from (v_row ->> 'lifecycle_status')
  then
    v_event_type := 'invoice.version.status.' ||
      coalesce(private.operational_event_slug(v_row ->> 'lifecycle_status'), 'updated');
  elsif tg_table_name = 'payroll_time_entries'
    and (v_old ->> 'approval_state') is distinct from (v_row ->> 'approval_state')
  then
    v_event_type := 'workforce.payroll_entry.approval.' ||
      coalesce(private.operational_event_slug(v_row ->> 'approval_state'), 'updated');
  elsif tg_table_name = 'conversations'
    and (v_old ->> 'archived_at') is null
    and (v_row ->> 'archived_at') is not null
  then
    v_event_type := 'messaging.conversation.archived';
  elsif v_old_status is distinct from v_new_status and v_new_status is not null then
    v_event_type := v_prefix || '.status.' || private.operational_event_slug(v_new_status);
  elsif v_old_stage is distinct from v_new_stage and v_new_stage is not null then
    v_event_type := v_prefix || '.stage.' || private.operational_event_slug(v_new_stage);
  else
    return new;
  end if;

  if v_work_order_id is not null and v_entity_type <> 'work_order' then
    v_parent_entity_type := 'work_order';
    v_parent_entity_id := v_work_order_id;
  elsif v_inspection_id is not null and v_entity_type = 'inspection_item' then
    v_parent_entity_type := 'inspection';
    v_parent_entity_id := v_inspection_id;
  elsif v_entity_type = 'punch_event' then
    v_parent_entity_type := 'profile';
    v_parent_entity_id := coalesce(
      private.operational_event_uuid(v_row ->> 'profile_id'),
      private.operational_event_uuid(v_row ->> 'user_id')
    );
  elsif v_entity_type = 'payroll_time_entry' then
    v_parent_entity_type := 'profile';
    v_parent_entity_id := private.operational_event_uuid(v_row ->> 'user_id');
  elsif v_entity_type = 'message' then
    v_parent_entity_type := 'conversation';
    v_parent_entity_id := private.operational_event_uuid(v_row ->> 'conversation_id');
  end if;

  v_occurred_at := coalesce(
    nullif(v_row ->> 'occurred_at', '')::timestamptz,
    nullif(v_row ->> 'timestamp', '')::timestamptz,
    nullif(v_row ->> 'sent_at', '')::timestamptz,
    nullif(v_row ->> 'created_at', '')::timestamptz,
    now()
  );

  v_idempotency_key := coalesce(
    nullif(v_row ->> 'operation_key', ''),
    nullif(v_row ->> 'idempotency_key', ''),
    concat_ws(
      ':',
      tg_table_name,
      coalesce(v_entity_id::text, 'na'),
      v_event_type,
      coalesce(
        nullif(v_row ->> 'updated_at', ''),
        nullif(v_row ->> 'created_at', ''),
        transaction_timestamp()::text
      )
    )
  );

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'operation', lower(tg_op),
    'table', tg_table_name,
    'old_status', v_old_status,
    'new_status', v_new_status,
    'old_stage', v_old_stage,
    'new_stage', v_new_stage,
    'work_order_id', v_work_order_id,
    'work_order_line_id', v_work_order_line_id,
    'inspection_id', v_inspection_id,
    'customer_id', private.operational_event_uuid(v_row ->> 'customer_id'),
    'vehicle_id', private.operational_event_uuid(v_row ->> 'vehicle_id'),
    'part_request_id', coalesce(
      private.operational_event_uuid(v_row ->> 'request_id'),
      private.operational_event_uuid(v_row ->> 'source_parts_request_id')
    ),
    'part_request_item_id', private.operational_event_uuid(v_row ->> 'part_request_item_id'),
    'purchase_order_id', coalesce(
      private.operational_event_uuid(v_row ->> 'po_id'),
      case when tg_table_name = 'purchase_orders' then v_entity_id else null end
    ),
    'invoice_id', private.operational_event_uuid(v_row ->> 'invoice_id'),
    'invoice_version_id', private.operational_event_uuid(v_row ->> 'invoice_version_id'),
    'technician_id', coalesce(
      private.operational_event_uuid(v_row ->> 'technician_id'),
      private.operational_event_uuid(v_row ->> 'assigned_tech_id')
    ),
    'quantity', case
      when v_row ? 'quantity' then v_row -> 'quantity'
      else null
    end,
    'schema_version', 1
  ));

  perform private.append_operational_event(
    v_shop_id,
    v_event_type,
    v_occurred_at,
    v_actor_user_id,
    v_actor_role,
    v_entity_type,
    v_entity_id,
    v_parent_entity_type,
    v_parent_entity_id,
    coalesce(v_work_order_id, v_parent_entity_id, v_entity_id),
    null,
    v_idempotency_key,
    v_source,
    case
      when v_event_type like '%.failed'
        or v_event_type like '%.blocked'
        or v_event_type like '%.declined'
        or v_event_type like '%.cancelled'
        or v_event_type like '%.voided'
      then 'warning'
      else 'info'
    end,
    v_metadata
  );

  perform private.resolve_operational_event_failure(
    v_shop_id,
    v_event_type,
    v_entity_type,
    v_entity_id,
    tg_table_name
  );

  return new;
exception
  when others then
    begin
      perform private.record_operational_event_failure(
        v_shop_id,
        v_event_type,
        v_entity_type,
        v_entity_id,
        tg_table_name,
        sqlstate,
        sqlerrm,
        jsonb_strip_nulls(jsonb_build_object(
          'operation', lower(tg_op),
          'table', tg_table_name,
          'work_order_id', v_work_order_id,
          'work_order_line_id', v_work_order_line_id
        ))
      );
    exception
      when others then
        null;
    end;
    return new;
end;
$$;

revoke all on function private.operational_event_uuid(text) from public, anon, authenticated;
revoke all on function private.operational_event_slug(text) from public, anon, authenticated;
revoke all on function private.operational_event_path(text) from public, anon, authenticated;
revoke all on function private.resolve_operational_event_failure(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.record_operational_event_failure(uuid, text, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.append_operational_event(uuid, text, timestamptz, uuid, text, text, uuid, text, uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.capture_operational_event() from public, anon, authenticated;

drop trigger if exists trg_operational_event_work_orders on public.work_orders;
create trigger trg_operational_event_work_orders
after insert or update of status on public.work_orders
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_work_order_lines on public.work_order_lines;
create trigger trg_operational_event_work_order_lines
after insert or update of status, assigned_tech_id, cause, correction on public.work_order_lines
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_inspections on public.inspections;
create trigger trg_operational_event_inspections
after insert or update of status on public.inspections
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_inspection_items on public.inspection_items;
create trigger trg_operational_event_inspection_items
after insert or update of status on public.inspection_items
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_quote_lines on public.work_order_quote_lines;
create trigger trg_operational_event_quote_lines
after insert or update of status, stage on public.work_order_quote_lines
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_part_requests on public.part_requests;
create trigger trg_operational_event_part_requests
after insert or update of status on public.part_requests
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_part_request_items on public.part_request_items;
create trigger trg_operational_event_part_request_items
after insert or update of status on public.part_request_items
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_purchase_orders on public.purchase_orders;
create trigger trg_operational_event_purchase_orders
after insert or update of status on public.purchase_orders
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_purchase_order_lines on public.purchase_order_lines;
create trigger trg_operational_event_purchase_order_lines
after insert on public.purchase_order_lines
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_work_order_parts on public.work_order_parts;
create trigger trg_operational_event_work_order_parts
after insert or update of lifecycle_status on public.work_order_parts
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_parts_dispositions on public.parts_disposition_events;
create trigger trg_operational_event_parts_dispositions
after insert on public.parts_disposition_events
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_labor_segments on public.work_order_line_labor_segments;
create trigger trg_operational_event_labor_segments
after insert or update of ended_at on public.work_order_line_labor_segments
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_punches on public.punch_events;
create trigger trg_operational_event_punches
after insert on public.punch_events
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_payroll_entries on public.payroll_time_entries;
create trigger trg_operational_event_payroll_entries
after insert or update of approval_state on public.payroll_time_entries
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_invoices on public.invoices;
create trigger trg_operational_event_invoices
after insert or update of status on public.invoices
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_invoice_versions on public.invoice_versions;
create trigger trg_operational_event_invoice_versions
after insert or update of lifecycle_status on public.invoice_versions
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_payments on public.payment_events;
create trigger trg_operational_event_payments
after insert on public.payment_events
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_bookings on public.bookings;
create trigger trg_operational_event_bookings
after insert or update of status on public.bookings
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_fleet_requests on public.fleet_service_requests;
create trigger trg_operational_event_fleet_requests
after insert or update of status on public.fleet_service_requests
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_estimates on public.estimate_events;
create trigger trg_operational_event_estimates
after insert on public.estimate_events
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_ai_actions on public.ai_action_events;
create trigger trg_operational_event_ai_actions
after insert on public.ai_action_events
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_portal_notifications on public.portal_notifications;
create trigger trg_operational_event_portal_notifications
after insert on public.portal_notifications
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_conversations on public.conversations;
create trigger trg_operational_event_conversations
after insert or update of archived_at on public.conversations
for each row execute function private.capture_operational_event();

drop trigger if exists trg_operational_event_messages on public.messages;
create trigger trg_operational_event_messages
after insert on public.messages
for each row execute function private.capture_operational_event();

drop trigger if exists trg_work_order_lines_log_ai on public.work_order_lines;

create or replace view public.operational_event_health
with (security_invoker = true)
as
select
  e.shop_id,
  max(e.occurred_at) as last_event_at,
  count(*) filter (where e.occurred_at >= now() - interval '24 hours')::bigint as events_last_24h,
  count(*) filter (where e.occurred_at >= now() - interval '7 days')::bigint as events_last_7d,
  count(distinct split_part(e.event_type, '.', 1))
    filter (where e.occurred_at >= now() - interval '7 days')::bigint as active_domains_last_7d,
  (
    select count(*)::bigint
    from public.operational_event_failures f
    where f.shop_id = e.shop_id
      and f.resolved_at is null
  ) as unresolved_failure_count
from public.operational_events e
group by e.shop_id;

revoke all on public.operational_event_health from anon;
grant select on public.operational_event_health to authenticated;

create or replace view public.unified_events
with (security_invoker = true)
as
select
  e.id,
  e.occurred_at as created_at,
  e.shop_id,
  e.event_type,
  e.metadata as payload,
  e.entity_id,
  e.entity_type as entity_table,
  e.source as source_system
from public.operational_events e;

revoke all on public.unified_events from public;
revoke all on public.unified_events from anon;
revoke all on public.unified_events from authenticated;
grant select on public.unified_events to authenticated;

comment on table public.operational_events is
  'Canonical append-only, tenant-scoped ProFixIQ operational event stream used for timelines, observability, AI context, validation, and simulation.';
comment on table public.operational_event_failures is
  'Durable non-blocking failure sink for operational event capture. Business writes remain authoritative while telemetry failures become visible.';
comment on view public.unified_events is
  'Compatibility view over the canonical operational_events stream. Uses caller permissions and underlying RLS.';
comment on view public.operational_event_health is
  'Tenant-safe operational event health summary for owner/admin/manager observability.';

commit;
