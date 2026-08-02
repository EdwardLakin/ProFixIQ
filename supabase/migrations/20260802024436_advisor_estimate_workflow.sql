begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- The legacy helper read a transaction-local GUC populated by a separate RPC.
-- PostgREST requests do not share that transaction, so later estimate reads
-- could fail RLS even after the server had authenticated the same staff user.
-- Resolve the shop and role from the authenticated profile instead. Imported
-- profiles can retain their own primary key and link auth.users via user_id.
create or replace function public.current_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.shop_id
  from public.profiles p
  where p.id = (select auth.uid())
     or p.user_id = (select auth.uid())
  order by
    case when p.id = (select auth.uid()) then 0 else 1 end,
    p.id
  limit 1;
$$;

comment on function public.current_shop_id() is
  'Returns the authenticated staff profile shop without relying on mutable request-local settings.';

create or replace function public.profixiq_current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p.role::text, '')))
    when 'tech' then 'mechanic'
    when 'technician' then 'mechanic'
    when 'service_advisor' then 'service'
    when 'service advisor' then 'service'
    when 'lead' then 'lead_hand'
    when 'leadhand' then 'lead_hand'
    when 'lead hand' then 'lead_hand'
    else lower(btrim(coalesce(p.role::text, 'unknown')))
  end
  from public.profiles p
  where p.id = (select auth.uid())
     or p.user_id = (select auth.uid())
  order by
    case when p.id = (select auth.uid()) then 0 else 1 end,
    p.id
  limit 1;
$$;

-- Preserve compatibility for existing callers that establish shop context
-- before a write. The setting is no longer trusted by current_shop_id(), but
-- the requested shop must still belong to either supported profile identity.
create or replace function public.set_current_shop_id(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_shop_id is null or not exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (
        p.id = (select auth.uid())
        or p.user_id = (select auth.uid())
      )
  ) then
    raise exception 'Not allowed to set current shop to %', p_shop_id
      using errcode = '42501';
  end if;

  perform set_config('app.current_shop_id', p_shop_id::text, true);
end;
$$;

revoke all on function public.current_shop_id() from public, anon;
revoke all on function public.profixiq_current_role() from public, anon;
revoke all on function public.set_current_shop_id(uuid) from public, anon;
grant execute on function public.current_shop_id() to authenticated, service_role;
grant execute on function public.profixiq_current_role() to authenticated, service_role;
grant execute on function public.set_current_shop_id(uuid) to authenticated, service_role;

-- Estimate list/detail reads embed customer information and the shop labor
-- rate. Add narrow policies for imported staff identities without broadening
-- either relation to roles that cannot enter the estimate workspace.
drop policy if exists estimate_staff_shop_read on public.shops;
create policy estimate_staff_shop_read
on public.shops
for select
to authenticated
using (
  id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman', 'parts', 'lead_hand'
  )
);

drop policy if exists estimate_staff_customer_read on public.customers;
create policy estimate_staff_customer_read
on public.customers
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman', 'parts', 'lead_hand'
  )
);

-- Estimates are the pre-authorization state of the canonical work order. The
-- existing work_order_quote_lines, part_requests, and customer approval RPCs
-- remain the commercial and operational source of truth.
alter table public.work_orders
  add column if not exists record_type text not null default 'work_order',
  add column if not exists estimate_number text,
  add column if not exists estimate_status text,
  add column if not exists estimate_revision integer not null default 1,
  add column if not exists estimate_created_at timestamptz,
  add column if not exists estimate_created_by uuid,
  add column if not exists estimate_parts_completed_at timestamptz,
  add column if not exists estimate_parts_completed_by uuid,
  add column if not exists estimate_sent_at timestamptz,
  add column if not exists estimate_sent_by uuid,
  add column if not exists estimate_authorized_at timestamptz,
  add column if not exists estimate_converted_at timestamptz,
  add column if not exists estimate_expires_at timestamptz;

alter table public.part_requests
  add column if not exists source_context text,
  add column if not exists source_revision integer;

alter table public.part_request_items
  add column if not exists source_row_id text;

-- The quote-line baseline used CREATE TABLE IF NOT EXISTS, so older linked
-- projects can have the table without the columns that were added to the
-- clean-bootstrap definition. Reconcile the canonical quote contract before
-- estimate indexes and RPCs depend on it.
alter table public.work_order_quote_lines
  add column if not exists external_id text,
  add column if not exists title text,
  add column if not exists line_type text not null default 'job',
  add column if not exists decision text,
  add column if not exists decline_reason text,
  add column if not exists defer_reason text,
  add column if not exists labor_rate numeric(12,2),
  add column if not exists discount_total numeric(14,2) not null default 0,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_by uuid references auth.users(id) on delete set null,
  add column if not exists deferred_by uuid references auth.users(id) on delete set null,
  add column if not exists sent_by uuid references auth.users(id) on delete set null,
  add column if not exists deferred_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists converted_at timestamptz;

do $$
declare
  v_source_row_id_type regtype;
begin
  select a.atttypid::regtype
  into v_source_row_id_type
  from pg_attribute a
  where a.attrelid = 'public.work_order_quote_lines'::regclass
    and a.attname = 'source_row_id'
    and not a.attisdropped;

  if v_source_row_id_type is null then
    alter table public.work_order_quote_lines
      add column source_row_id text;
  elsif v_source_row_id_type = 'uuid'::regtype then
    alter table public.work_order_quote_lines
      alter column source_row_id type text
      using source_row_id::text;
  elsif v_source_row_id_type <> 'text'::regtype then
    raise exception
      'work_order_quote_lines.source_row_id has unsupported type %, expected uuid or text',
      v_source_row_id_type;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_orders'::regclass
      and conname = 'work_orders_record_type_check'
  ) then
    alter table public.work_orders
      add constraint work_orders_record_type_check
      check (record_type in ('work_order', 'estimate'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_orders'::regclass
      and conname = 'work_orders_estimate_status_check'
  ) then
    alter table public.work_orders
      add constraint work_orders_estimate_status_check
      check (
        estimate_status is null
        or estimate_status in (
          'draft', 'waiting_for_parts', 'ready_for_advisor', 'sent',
          'partially_approved', 'approved', 'declined', 'deferred', 'expired'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_orders'::regclass
      and conname = 'work_orders_estimate_revision_check'
  ) then
    alter table public.work_orders
      add constraint work_orders_estimate_revision_check
      check (estimate_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_orders'::regclass
      and conname = 'work_orders_estimate_created_by_fkey'
  ) then
    alter table public.work_orders
      add constraint work_orders_estimate_created_by_fkey
      foreign key (estimate_created_by) references public.profiles(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_orders'::regclass
      and conname = 'work_orders_estimate_parts_completed_by_fkey'
  ) then
    alter table public.work_orders
      add constraint work_orders_estimate_parts_completed_by_fkey
      foreign key (estimate_parts_completed_by) references public.profiles(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_orders'::regclass
      and conname = 'work_orders_estimate_sent_by_fkey'
  ) then
    alter table public.work_orders
      add constraint work_orders_estimate_sent_by_fkey
      foreign key (estimate_sent_by) references public.profiles(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.part_requests'::regclass
      and conname = 'part_requests_source_context_check'
  ) then
    alter table public.part_requests
      add constraint part_requests_source_context_check
      check (source_context is null or source_context = 'estimate');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.part_requests'::regclass
      and conname = 'part_requests_source_revision_check'
  ) then
    alter table public.part_requests
      add constraint part_requests_source_revision_check
      check (source_revision is null or source_revision >= 1);
  end if;
end;
$$;

alter table public.work_orders
  validate constraint work_orders_estimate_created_by_fkey;
alter table public.work_orders
  validate constraint work_orders_estimate_parts_completed_by_fkey;
alter table public.work_orders
  validate constraint work_orders_estimate_sent_by_fkey;

create unique index if not exists work_orders_shop_estimate_number_key
  on public.work_orders(shop_id, estimate_number)
  where estimate_number is not null;

create index if not exists idx_work_orders_estimate_queue
  on public.work_orders(shop_id, estimate_status, updated_at desc)
  where estimate_number is not null;

create unique index if not exists work_order_quote_lines_estimate_source_key
  on public.work_order_quote_lines(shop_id, work_order_id, source_row_id)
  where source_row_id like 'estimate:%';

create unique index if not exists part_requests_estimate_revision_key
  on public.part_requests(shop_id, quote_line_id, source_context, source_revision)
  where source_context = 'estimate' and quote_line_id is not null;

create unique index if not exists part_request_items_request_source_key
  on public.part_request_items(request_id, source_row_id)
  where source_row_id is not null;

create table if not exists public.estimate_internal_details (
  work_order_id uuid primary key references public.work_orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  notes text check (notes is null or length(notes) <= 8000),
  line_notes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(line_notes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estimate_internal_details_shop
  on public.estimate_internal_details(shop_id, work_order_id);

alter table public.estimate_internal_details enable row level security;
revoke all on table public.estimate_internal_details
  from public, anon, authenticated;
grant select on table public.estimate_internal_details to authenticated;
grant all on table public.estimate_internal_details to service_role;

comment on table public.estimate_internal_details is
  'Staff-only estimate notes kept outside customer-readable work-order and quote-line rows.';

create table if not exists public.estimate_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  revision integer not null check (revision >= 1),
  event_type text not null check (
    event_type in (
      'created', 'draft_saved', 'submitted_to_parts',
      'parts_completed', 'returned_to_parts',
      'send_reserved', 'send_failed', 'sent'
    )
  ),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  reason_code text check (
    reason_code is null
    or reason_code in (
      'lower_cost_option', 'confirm_availability', 'correct_quantity',
      'incorrect_application', 'missing_parts', 'review_price',
      'customer_alternative', 'other'
    )
  ),
  note text,
  changed_quote_line_ids uuid[] not null default array[]::uuid[],
  snapshot jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  idempotency_key text not null check (
    length(btrim(idempotency_key)) between 1 and 200
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

alter table public.estimate_events
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_estimate_events_work_order_created
  on public.estimate_events(shop_id, work_order_id, created_at desc);
create index if not exists idx_estimate_events_actor
  on public.estimate_events(actor_profile_id)
  where actor_profile_id is not null;
drop index if exists public.estimate_events_sent_revision_key;
create unique index estimate_events_sent_revision_key
  on public.estimate_events(shop_id, work_order_id, revision)
  where event_type in ('send_reserved', 'send_failed', 'sent');

alter table public.estimate_events enable row level security;

drop policy if exists estimate_events_shop_read on public.estimate_events;
create policy estimate_events_shop_read
  on public.estimate_events for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.shop_id = estimate_events.shop_id
        and (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and lower(coalesce(p.role::text, '')) in (
          'owner', 'admin', 'manager', 'advisor', 'service',
          'service_advisor', 'service advisor', 'foreman', 'parts',
          'lead_hand', 'lead', 'leadhand', 'lead hand'
        )
    )
  );

revoke all on table public.estimate_events from public, anon, authenticated;
grant select on table public.estimate_events to authenticated;
grant all on table public.estimate_events to service_role;

comment on table public.estimate_events is
  'Estimate workflow audit and idempotency ledger. Workflow writes use guarded RPCs; customer-send reservations use the shop-scoped server boundary.';

create or replace function public.estimate_actor_for_shop(
  p_shop_id uuid,
  p_allowed_roles text[]
)
returns table(profile_id uuid, canonical_role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select candidate.id, candidate.canonical_role
  from (
    select
      p.id,
      case lower(btrim(coalesce(p.role::text, '')))
        when 'service_advisor' then 'service'
        when 'service advisor' then 'service'
        when 'lead' then 'lead_hand'
        when 'leadhand' then 'lead_hand'
        when 'lead hand' then 'lead_hand'
        else lower(btrim(coalesce(p.role::text, '')))
      end as canonical_role,
      case when p.id = (select auth.uid()) then 0 else 1 end as priority
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
  ) candidate
  where candidate.canonical_role = any(coalesce(p_allowed_roles, array[]::text[]))
  order by candidate.priority, candidate.id
  limit 1;
$$;

revoke all on function public.estimate_actor_for_shop(uuid, text[])
  from public, anon, authenticated, service_role;

create or replace function public.can_read_estimate_internal_details(
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and case lower(btrim(coalesce(p.role::text, '')))
        when 'service_advisor' then 'service'
        when 'service advisor' then 'service'
        when 'lead' then 'lead_hand'
        when 'leadhand' then 'lead_hand'
        when 'lead hand' then 'lead_hand'
        else lower(btrim(coalesce(p.role::text, '')))
      end in ('owner', 'admin', 'manager', 'advisor', 'service', 'foreman', 'parts', 'lead_hand')
  );
$$;

revoke all on function public.can_read_estimate_internal_details(uuid)
  from public, anon;
grant execute on function public.can_read_estimate_internal_details(uuid)
  to authenticated, service_role;

drop policy if exists estimate_internal_details_staff_read
  on public.estimate_internal_details;
create policy estimate_internal_details_staff_read
on public.estimate_internal_details
for select
to authenticated
using (
  public.can_read_estimate_internal_details(shop_id)
);

create or replace function public.can_access_estimate_quote_line(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_metadata jsonb,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id;

  if not found then
    return false;
  end if;
  if v_work_order.estimate_number is null then
    return true;
  end if;

  if v_action = 'select' then
    return exists (
      select 1
      from public.estimate_actor_for_shop(
        p_shop_id,
        array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman', 'parts', 'lead_hand']
      )
    ) or exists (
      select 1
      from public.customers c
      where c.id = v_work_order.customer_id
        and c.shop_id = p_shop_id
        and c.user_id = (select auth.uid())
    );
  end if;

  if v_action in ('insert', 'update') then
    if v_work_order.estimate_status = 'draft' then
      return exists (
        select 1
        from public.estimate_actor_for_shop(
          p_shop_id,
          array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman']
        )
      );
    end if;

    if v_work_order.estimate_status = 'waiting_for_parts'
       and coalesce(p_metadata ->> 'estimate_revision', '') =
         v_work_order.estimate_revision::text then
      return exists (
        select 1
        from public.estimate_actor_for_shop(
          p_shop_id,
          array['owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman']
        )
      );
    end if;
    return false;
  end if;

  if v_action = 'delete' then
    return v_work_order.estimate_status = 'draft'
      and exists (
        select 1
        from public.estimate_actor_for_shop(
          p_shop_id,
          array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman']
        )
      );
  end if;

  return false;
end;
$$;

revoke all on function public.can_access_estimate_quote_line(uuid, uuid, jsonb, text)
  from public, anon;
grant execute on function public.can_access_estimate_quote_line(uuid, uuid, jsonb, text)
  to authenticated, service_role;

create or replace function public.can_select_estimate_quote_line(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_status text,
  p_stage text,
  p_sent_to_customer_at timestamptz,
  p_approved_at timestamptz,
  p_declined_at timestamptz,
  p_deferred_at timestamptz,
  p_work_order_line_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_stage text := lower(btrim(coalesce(p_stage, '')));
begin
  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id;

  if not found or v_work_order.estimate_number is null then
    return true;
  end if;

  if exists (
    select 1
    from public.estimate_actor_for_shop(
      p_shop_id,
      array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman', 'parts', 'lead_hand']
    )
  ) then
    return true;
  end if;

  -- A portal customer can see only rows that were deliberately handed off or
  -- have a recorded customer decision. Draft, Parts, and superseded revisions
  -- remain hidden even if another permissive portal policy matches the work
  -- order.
  return exists (
    select 1
    from public.customers c
    where c.id = v_work_order.customer_id
      and c.shop_id = p_shop_id
      and c.user_id = (select auth.uid())
  )
  and v_status not in ('cancelled', 'canceled', 'rejected', 'superseded', 'voided')
  and (
    p_sent_to_customer_at is not null
    or p_approved_at is not null
    or p_declined_at is not null
    or p_deferred_at is not null
    or p_work_order_line_id is not null
    or v_status in ('sent', 'approved', 'converted', 'declined', 'deferred')
    or v_stage in (
      'sent', 'customer_review', 'customer_approved',
      'customer_declined', 'customer_deferred'
    )
  );
end;
$$;

revoke all on function public.can_select_estimate_quote_line(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz,
  timestamptz, uuid
) from public, anon;
grant execute on function public.can_select_estimate_quote_line(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz,
  timestamptz, uuid
) to authenticated, service_role;

create or replace function public.can_select_estimate_work_order(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_customer_id uuid,
  p_estimate_number text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_estimate_number is null then
    return true;
  end if;

  if exists (
    select 1
    from public.estimate_actor_for_shop(
      p_shop_id,
      array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman', 'parts', 'lead_hand']
    )
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.shop_id = p_shop_id
      and c.user_id = (select auth.uid())
  ) and exists (
    select 1
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and lower(btrim(coalesce(q.status::text, ''))) not in (
        'cancelled', 'canceled', 'rejected', 'superseded', 'voided'
      )
      and (
        q.sent_to_customer_at is not null
        or q.approved_at is not null
        or q.declined_at is not null
        or q.deferred_at is not null
        or q.work_order_line_id is not null
        or lower(btrim(coalesce(q.status::text, ''))) in (
          'sent', 'approved', 'converted', 'declined', 'deferred'
        )
        or lower(btrim(coalesce(q.stage::text, ''))) in (
          'sent', 'customer_review', 'customer_approved',
          'customer_declined', 'customer_deferred'
        )
      )
  );
end;
$$;

revoke all on function public.can_select_estimate_work_order(
  uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.can_select_estimate_work_order(
  uuid, uuid, uuid, text
) to authenticated, service_role;

-- The ordinary work-order policies remain authoritative after an estimate has
-- approved work and becomes operational. Before that conversion, all writes
-- must use the guarded estimate RPCs (or the shop-scoped service boundary for
-- customer send), so a direct table update cannot skip lifecycle validation.
drop policy if exists work_orders_estimate_select on public.work_orders;
create policy work_orders_estimate_select
on public.work_orders
as restrictive
for select
to authenticated
using (
  public.can_select_estimate_work_order(
    shop_id, id, customer_id, estimate_number
  )
);

drop policy if exists work_orders_estimate_insert on public.work_orders;
create policy work_orders_estimate_insert
on public.work_orders
as restrictive
for insert
to authenticated
with check (
  estimate_number is null
  and record_type = 'work_order'
);

drop policy if exists work_orders_estimate_update on public.work_orders;
create policy work_orders_estimate_update
on public.work_orders
as restrictive
for update
to authenticated
using (
  estimate_number is null
  or record_type = 'work_order'
)
with check (
  estimate_number is null
  or record_type = 'work_order'
);

drop policy if exists work_orders_estimate_delete on public.work_orders;
create policy work_orders_estimate_delete
on public.work_orders
as restrictive
for delete
to authenticated
using (
  estimate_number is null
  or record_type = 'work_order'
);

-- Existing quote-line policies remain available for ordinary work orders. The
-- restrictive policies below add the estimate role/state contract to every
-- otherwise-permitted direct table operation, including customer portal reads.
drop policy if exists work_order_quote_lines_estimate_select
  on public.work_order_quote_lines;
create policy work_order_quote_lines_estimate_select
on public.work_order_quote_lines
as restrictive
for select
to authenticated
using (
  public.can_select_estimate_quote_line(
    shop_id,
    work_order_id,
    status::text,
    stage::text,
    sent_to_customer_at,
    approved_at,
    declined_at,
    deferred_at,
    work_order_line_id
  )
);

drop policy if exists work_order_quote_lines_estimate_insert
  on public.work_order_quote_lines;
create policy work_order_quote_lines_estimate_insert
on public.work_order_quote_lines
as restrictive
for insert
to authenticated
with check (
  public.can_access_estimate_quote_line(
    shop_id, work_order_id, metadata, 'insert'
  )
);

drop policy if exists work_order_quote_lines_estimate_update
  on public.work_order_quote_lines;
create policy work_order_quote_lines_estimate_update
on public.work_order_quote_lines
as restrictive
for update
to authenticated
using (
  public.can_access_estimate_quote_line(
    shop_id, work_order_id, metadata, 'update'
  )
)
with check (
  public.can_access_estimate_quote_line(
    shop_id, work_order_id, metadata, 'update'
  )
);

drop policy if exists work_order_quote_lines_estimate_delete
  on public.work_order_quote_lines;
create policy work_order_quote_lines_estimate_delete
on public.work_order_quote_lines
as restrictive
for delete
to authenticated
using (
  public.can_access_estimate_quote_line(
    shop_id, work_order_id, metadata, 'delete'
  )
);

create or replace function public.prevent_estimate_quote_commercial_changes_after_handoff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimate_number text;
  v_estimate_status text;
begin
  select w.estimate_number, w.estimate_status
  into v_estimate_number, v_estimate_status
  from public.work_orders w
  where w.id = old.work_order_id
    and w.shop_id = old.shop_id;

  if v_estimate_number is null or v_estimate_status = 'draft' then
    return new;
  end if;

  -- Parts may roll canonical item pricing into the active revision, but Parts
  -- cannot alter advisor-authored scope, labor, or stable revision identity.
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.notes is distinct from old.notes
     or new.labor_hours is distinct from old.labor_hours
     or new.est_labor_hours is distinct from old.est_labor_hours
     or new.labor_rate is distinct from old.labor_rate
     or coalesce(new.metadata, '{}'::jsonb) -> 'requested_parts'
          is distinct from coalesce(old.metadata, '{}'::jsonb) -> 'requested_parts'
     or coalesce(new.metadata, '{}'::jsonb) -> 'customer_description'
          is distinct from coalesce(old.metadata, '{}'::jsonb) -> 'customer_description'
     or coalesce(new.metadata, '{}'::jsonb) -> 'client_key'
          is distinct from coalesce(old.metadata, '{}'::jsonb) -> 'client_key'
     or coalesce(new.metadata, '{}'::jsonb) -> 'estimate_revision'
          is distinct from coalesce(old.metadata, '{}'::jsonb) -> 'estimate_revision'
     or coalesce(new.metadata, '{}'::jsonb) -> 'labor_rate'
          is distinct from coalesce(old.metadata, '{}'::jsonb) -> 'labor_rate' then
    raise exception using errcode = '55000',
      message = 'Estimate scope and labor are locked after submission to Parts.';
  end if;

  if v_estimate_status is distinct from 'waiting_for_parts'
     and (
       new.labor_total is distinct from old.labor_total
       or new.parts_total is distinct from old.parts_total
       or new.subtotal is distinct from old.subtotal
       or new.tax_total is distinct from old.tax_total
       or new.grand_total is distinct from old.grand_total
     ) then
    raise exception using errcode = '55000',
      message = 'Estimate pricing is locked after the Parts handoff is complete.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_estimate_quote_commercial_changes_after_handoff()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_prevent_estimate_quote_commercial_changes
  on public.work_order_quote_lines;
create trigger trg_prevent_estimate_quote_commercial_changes
before update of title, description, notes, labor_hours, est_labor_hours,
  labor_rate, labor_total, parts_total, subtotal, tax_total, grand_total, metadata
on public.work_order_quote_lines
for each row execute function public.prevent_estimate_quote_commercial_changes_after_handoff();

-- Keep direct Parts item updates aligned with the profile identity fallback
-- used by the server authorization boundary.
create or replace function public.can_update_part_request_items(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and case lower(btrim(coalesce(p.role::text, '')))
        when 'lead' then 'lead_hand'
        when 'leadhand' then 'lead_hand'
        when 'lead hand' then 'lead_hand'
        else lower(btrim(coalesce(p.role::text, '')))
      end in ('owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman')
  );
$$;

revoke all on function public.can_update_part_request_items(uuid)
  from public, anon;
grant execute on function public.can_update_part_request_items(uuid)
  to authenticated, service_role;

create or replace function public.can_update_estimate_part_request_items(
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and case lower(btrim(coalesce(p.role::text, '')))
        when 'lead' then 'lead_hand'
        when 'leadhand' then 'lead_hand'
        when 'lead hand' then 'lead_hand'
        else lower(btrim(coalesce(p.role::text, '')))
      end in ('owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman')
  );
$$;

revoke all on function public.can_update_estimate_part_request_items(uuid)
  from public, anon;
grant execute on function public.can_update_estimate_part_request_items(uuid)
  to authenticated, service_role;

-- The legacy policy joined profiles.id directly even though imported staff can
-- authenticate through profiles.user_id. Delegate the identity check to the
-- guarded helper so both profile shapes retain the same narrow Parts role set.
drop policy if exists part_request_items_update_same_shop_parent_request
  on public.part_request_items;
create policy part_request_items_update_same_shop_parent_request
on public.part_request_items
for update
to authenticated
using (
  exists (
    select 1
    from public.part_requests pr
    where pr.id = part_request_items.request_id
      and public.can_update_part_request_items(pr.shop_id)
      and (
        part_request_items.shop_id is null
        or part_request_items.shop_id = pr.shop_id
      )
  )
)
with check (
  exists (
    select 1
    from public.part_requests pr
    where pr.id = part_request_items.request_id
      and public.can_update_part_request_items(pr.shop_id)
      and (
        part_request_items.shop_id is null
        or part_request_items.shop_id = pr.shop_id
      )
  )
);

-- The baseline item policies are intentionally permissive for ordinary shop
-- work. Add restrictive policies so rows attached to an estimate can only be
-- changed by Parts-capable roles, while leaving non-estimate requests alone.
drop policy if exists part_request_items_estimate_role_insert
  on public.part_request_items;
create policy part_request_items_estimate_role_insert
on public.part_request_items
as restrictive
for insert
to authenticated
with check (
  not exists (
    select 1
    from public.part_requests pr
    join public.work_orders w
      on w.id = pr.work_order_id
     and w.shop_id = pr.shop_id
    where pr.id = part_request_items.request_id
      and w.estimate_number is not null
  )
  or exists (
    select 1
    from public.part_requests pr
    where pr.id = part_request_items.request_id
      and public.can_update_estimate_part_request_items(pr.shop_id)
  )
);

drop policy if exists part_request_items_estimate_role_update
  on public.part_request_items;
create policy part_request_items_estimate_role_update
on public.part_request_items
as restrictive
for update
to authenticated
using (
  not exists (
    select 1
    from public.part_requests pr
    join public.work_orders w
      on w.id = pr.work_order_id
     and w.shop_id = pr.shop_id
    where pr.id = part_request_items.request_id
      and w.estimate_number is not null
  )
  or exists (
    select 1
    from public.part_requests pr
    where pr.id = part_request_items.request_id
      and public.can_update_estimate_part_request_items(pr.shop_id)
  )
)
with check (
  not exists (
    select 1
    from public.part_requests pr
    join public.work_orders w
      on w.id = pr.work_order_id
     and w.shop_id = pr.shop_id
    where pr.id = part_request_items.request_id
      and w.estimate_number is not null
  )
  or exists (
    select 1
    from public.part_requests pr
    where pr.id = part_request_items.request_id
      and public.can_update_estimate_part_request_items(pr.shop_id)
  )
);

drop policy if exists part_request_items_estimate_role_delete
  on public.part_request_items;
create policy part_request_items_estimate_role_delete
on public.part_request_items
as restrictive
for delete
to authenticated
using (
  not exists (
    select 1
    from public.part_requests pr
    join public.work_orders w
      on w.id = pr.work_order_id
     and w.shop_id = pr.shop_id
    where pr.id = part_request_items.request_id
      and w.estimate_number is not null
  )
  or exists (
    select 1
    from public.part_requests pr
    where pr.id = part_request_items.request_id
      and public.can_update_estimate_part_request_items(pr.shop_id)
  )
);

create or replace function public.prevent_estimate_part_item_structure_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_id uuid;
  v_is_estimate boolean := false;
  v_source_context text;
  v_source_revision integer;
  v_estimate_status text;
  v_estimate_revision integer;
begin
  if tg_op = 'UPDATE' then
    if new.request_id is not distinct from old.request_id
       and new.shop_id is not distinct from old.shop_id
       and new.work_order_id is not distinct from old.work_order_id
       and new.quote_line_id is not distinct from old.quote_line_id
       and new.source_row_id is not distinct from old.source_row_id then
      return new;
    end if;

    if exists (
      select 1
      from public.part_requests pr
      join public.work_orders w
        on w.id = pr.work_order_id
       and w.shop_id = pr.shop_id
      where pr.id in (old.request_id, new.request_id)
        and w.estimate_number is not null
    ) then
      raise exception using errcode = '55000',
        message = 'Estimate part request provenance cannot be changed in place.';
    end if;
    return new;
  end if;

  v_request_id := case when tg_op = 'DELETE' then old.request_id else new.request_id end;

  select
    w.estimate_number is not null,
    pr.source_context,
    pr.source_revision,
    w.estimate_status,
    w.estimate_revision
  into
    v_is_estimate,
    v_source_context,
    v_source_revision,
    v_estimate_status,
    v_estimate_revision
  from public.part_requests pr
  join public.work_orders w
    on w.id = pr.work_order_id
   and w.shop_id = pr.shop_id
  where pr.id = v_request_id;

  if v_is_estimate and (
    v_source_context is distinct from 'estimate'
    or v_estimate_status is distinct from 'waiting_for_parts'
    or v_estimate_revision is distinct from v_source_revision
  ) then
    raise exception using errcode = '55000',
      message = 'Estimate parts can only change inside the active Parts revision.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_estimate_part_item_structure_changes()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_prevent_estimate_part_item_insert_delete
  on public.part_request_items;
create trigger trg_prevent_estimate_part_item_insert_delete
before insert or delete
on public.part_request_items
for each row execute function public.prevent_estimate_part_item_structure_changes();

drop trigger if exists trg_prevent_estimate_part_item_reparent
  on public.part_request_items;
create trigger trg_prevent_estimate_part_item_reparent
before update of request_id, shop_id, work_order_id, quote_line_id, source_row_id
on public.part_request_items
for each row execute function public.prevent_estimate_part_item_structure_changes();

create or replace function public.prevent_estimate_part_quote_changes_after_handoff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_context text;
  v_source_revision integer;
  v_estimate_status text;
  v_estimate_revision integer;
begin
  if new.description is not distinct from old.description
     and new.qty is not distinct from old.qty
     and new.qty_requested is not distinct from old.qty_requested
     and new.quoted_price is not distinct from old.quoted_price
     and new.unit_price is not distinct from old.unit_price
     and new.requested_part_number is not distinct from old.requested_part_number
     and new.requested_manufacturer is not distinct from old.requested_manufacturer then
    return new;
  end if;

  select pr.source_context, pr.source_revision,
         w.estimate_status, w.estimate_revision
  into v_source_context, v_source_revision,
       v_estimate_status, v_estimate_revision
  from public.part_requests pr
  left join public.work_orders w
    on w.id = pr.work_order_id
   and w.shop_id = pr.shop_id
  where pr.id = old.request_id
    and pr.shop_id = old.shop_id;

  if v_source_context = 'estimate'
     and (
       v_estimate_status is distinct from 'waiting_for_parts'
       or v_estimate_revision is distinct from v_source_revision
     ) then
    raise exception using errcode = '55000',
      message = 'Estimate pricing is locked. Return the current revision to Parts before changing it.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_estimate_part_quote_changes_after_handoff()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_prevent_estimate_part_quote_changes_after_handoff
  on public.part_request_items;
create trigger trg_prevent_estimate_part_quote_changes_after_handoff
before update of description, qty, qty_requested, quoted_price, unit_price,
  requested_part_number, requested_manufacturer
on public.part_request_items
for each row execute function public.prevent_estimate_part_quote_changes_after_handoff();

create or replace function public.validate_estimate_lines(p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_line jsonb;
  v_part jsonb;
  v_parts jsonb;
  v_value text;
  v_number numeric;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'Estimate repair lines must be an array.';
  end if;
  if jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 50 then
    raise exception using errcode = '22023',
      message = 'An estimate requires between 1 and 50 repair lines.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) entry
    group by lower(btrim(coalesce(entry ->> 'clientKey', '')))
    having count(*) > 1
  ) then
    raise exception using errcode = '22023',
      message = 'Estimate repair line keys must be unique.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) is distinct from 'object'
       or nullif(btrim(v_line ->> 'clientKey'), '') is null
       or length(btrim(v_line ->> 'clientKey')) > 80 then
      raise exception using errcode = '22023',
        message = 'Every estimate line requires a stable client key.';
    end if;

    if nullif(btrim(coalesce(v_line ->> 'title', v_line ->> 'description')), '') is null then
      raise exception using errcode = '22023',
        message = 'Every estimate line requires a service title.';
    end if;

    if length(btrim(coalesce(v_line ->> 'title', v_line ->> 'description', ''))) > 500
       or length(coalesce(v_line ->> 'customerDescription', '')) > 4000
       or length(coalesce(v_line ->> 'advisorNotes', '')) > 4000 then
      raise exception using errcode = '22023',
        message = 'Estimate line text exceeds the supported length.';
    end if;

    v_value := nullif(btrim(v_line ->> 'laborHours'), '');
    if v_value is not null then
      begin
        v_number := v_value::numeric;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Labor hours must be numeric.';
      end;
      if v_number < 0 or v_number > 1000 then
        raise exception using errcode = '22023', message = 'Labor hours are outside the supported range.';
      end if;
    end if;

    v_value := nullif(btrim(v_line ->> 'laborRate'), '');
    if v_value is not null then
      begin
        v_number := v_value::numeric;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Labor rate must be numeric.';
      end;
      if v_number < 0 or v_number > 100000 then
        raise exception using errcode = '22023', message = 'Labor rate is outside the supported range.';
      end if;
    end if;

    v_parts := coalesce(v_line -> 'parts', '[]'::jsonb);
    if jsonb_typeof(v_parts) is distinct from 'array' then
      raise exception using errcode = '22023',
        message = 'Estimate parts must be an array.';
    end if;
    if jsonb_array_length(v_parts) > 100 then
      raise exception using errcode = '22023',
        message = 'Estimate parts must be an array with no more than 100 items per line.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_parts) entry
      group by lower(btrim(coalesce(entry ->> 'clientKey', '')))
      having count(*) > 1
    ) then
      raise exception using errcode = '22023',
        message = 'Estimate part keys must be unique within a repair line.';
    end if;

    for v_part in
      select value from jsonb_array_elements(v_parts)
    loop
      if jsonb_typeof(v_part) is distinct from 'object'
         or nullif(btrim(v_part ->> 'clientKey'), '') is null
         or length(btrim(v_part ->> 'clientKey')) > 80
         or nullif(btrim(v_part ->> 'description'), '') is null then
        raise exception using errcode = '22023',
          message = 'Every requested part requires a stable key and description.';
      end if;

      if length(btrim(coalesce(v_part ->> 'description', ''))) > 500
         or length(coalesce(v_part ->> 'partNumber', '')) > 200
         or length(coalesce(v_part ->> 'manufacturer', '')) > 200 then
        raise exception using errcode = '22023',
          message = 'Estimate part text exceeds the supported length.';
      end if;

      begin
        v_number := coalesce(nullif(v_part ->> 'quantity', '')::numeric, 1);
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Part quantity must be numeric.';
      end;
      if v_number <= 0 or v_number > 10000 then
        raise exception using errcode = '22023', message = 'Part quantity is outside the supported range.';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.validate_estimate_lines(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.recalculate_estimate_work_order_totals(
  p_shop_id uuid,
  p_work_order_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.work_orders w
  set labor_total = totals.labor_total,
      parts_total = totals.parts_total,
      updated_at = now()
  from (
    select
      coalesce(round(sum(coalesce(q.labor_total, 0)), 2), 0) as labor_total,
      coalesce(round(sum(coalesce(q.parts_total, 0)), 2), 0) as parts_total
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and lower(coalesce(q.status::text, '')) not in ('cancelled', 'superseded')
  ) totals
  where w.id = p_work_order_id
    and w.shop_id = p_shop_id;
$$;

revoke all on function public.recalculate_estimate_work_order_totals(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.sync_estimate_state_from_quote_lines()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_total integer := 0;
  v_approved integer := 0;
  v_declined integer := 0;
  v_deferred integer := 0;
  v_sent integer := 0;
begin
  select * into v_work_order
  from public.work_orders
  where id = new.work_order_id
    and shop_id = new.shop_id
    and estimate_number is not null
  for update;

  if not found then
    return new;
  end if;

  select
    count(*),
    count(*) filter (
      where q.approved_at is not null
         or q.work_order_line_id is not null
         or lower(coalesce(q.status::text, '')) in ('approved', 'converted')
         or lower(coalesce(q.stage::text, '')) = 'customer_approved'
    ),
    count(*) filter (
      where lower(coalesce(q.status::text, '')) in ('declined', 'rejected')
         or lower(coalesce(q.stage::text, '')) = 'customer_declined'
    ),
    count(*) filter (
      where lower(coalesce(q.status::text, '')) = 'deferred'
         or lower(coalesce(q.stage::text, '')) = 'customer_deferred'
    ),
    count(*) filter (
      where q.sent_to_customer_at is not null
         or lower(coalesce(q.status::text, '')) = 'sent'
         or lower(coalesce(q.stage::text, '')) = 'sent'
    )
  into v_total, v_approved, v_declined, v_deferred, v_sent
  from public.work_order_quote_lines q
  where q.shop_id = new.shop_id
    and q.work_order_id = new.work_order_id
    and lower(coalesce(q.status::text, '')) not in ('cancelled', 'superseded');

  -- A partially approved estimate can still have unapproved lines in a Parts
  -- adjustment revision. Pricing updates must not pull that revision out of
  -- the Parts queue before the explicit completion gate runs.
  if v_work_order.estimate_status = 'waiting_for_parts' then
    perform public.recalculate_estimate_work_order_totals(new.shop_id, new.work_order_id);
    return new;
  end if;

  if v_approved > 0 then
    update public.work_orders
    set record_type = 'work_order',
        estimate_status = case
          when v_approved = v_total then 'approved'
          else 'partially_approved'
        end,
        approval_state = case
          when v_approved = v_total then 'approved'
          else 'partial'
        end,
        estimate_authorized_at = coalesce(estimate_authorized_at, now()),
        estimate_converted_at = coalesce(estimate_converted_at, now()),
        updated_at = now()
    where id = new.work_order_id and shop_id = new.shop_id;
  elsif v_total > 0 and v_declined + v_deferred = v_total then
    update public.work_orders
    set estimate_status = case when v_declined > 0 then 'declined' else 'deferred' end,
        approval_state = case when v_declined > 0 then 'declined' else approval_state end,
        updated_at = now()
    where id = new.work_order_id and shop_id = new.shop_id;
  elsif v_sent > 0 then
    update public.work_orders
    set estimate_status = 'sent',
        estimate_sent_at = coalesce(estimate_sent_at, new.sent_to_customer_at, new.sent_at, now()),
        updated_at = now()
    where id = new.work_order_id and shop_id = new.shop_id;
  end if;

  perform public.recalculate_estimate_work_order_totals(new.shop_id, new.work_order_id);
  return new;
end;
$$;

revoke all on function public.sync_estimate_state_from_quote_lines()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_sync_estimate_state_from_quote_lines
  on public.work_order_quote_lines;
create trigger trg_sync_estimate_state_from_quote_lines
after insert or update of status, stage, sent_to_customer_at, sent_at, sent_by,
  approved_at, declined_at, deferred_at, work_order_line_id, labor_total, parts_total
on public.work_order_quote_lines
for each row execute function public.sync_estimate_state_from_quote_lines();

create or replace function public.create_estimate_atomic(
  p_shop_id uuid,
  p_customer jsonb,
  p_vehicle jsonb,
  p_lines jsonb,
  p_notes text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_event_id uuid;
  v_existing_event_type text;
  v_existing_result jsonb;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_customer_id_text text := nullif(btrim(p_customer ->> 'id'), '');
  v_vehicle_id_text text := nullif(btrim(p_vehicle ->> 'id'), '');
  v_customer_email text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_customer_phone_raw text := nullif(btrim(p_customer ->> 'phone'), '');
  v_customer_phone text := coalesce(
    nullif(regexp_replace(coalesce(v_customer_phone_raw, ''), '[^0-9]', '', 'g'), ''),
    v_customer_phone_raw
  );
  v_customer_name text;
  v_vehicle_vin_raw text := nullif(upper(btrim(p_vehicle ->> 'vin')), '');
  v_vehicle_vin text := case
    when length(v_vehicle_vin_raw) = 17 then v_vehicle_vin_raw
    else null
  end;
  v_vehicle_plate text := nullif(upper(btrim(p_vehicle ->> 'licensePlate')), '');
  v_vehicle_unit text := nullif(btrim(p_vehicle ->> 'unitNumber'), '');
  v_existing_vehicle_customer_id uuid;
  v_year integer;
  v_shop_labor_rate numeric := 0;
  v_work_order_id uuid;
  v_candidate_work_order_id uuid;
  v_custom_id text;
  v_estimate_number text;
  v_line jsonb;
  v_line_id uuid;
  v_labor_hours numeric;
  v_labor_rate numeric;
  v_labor_total numeric;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_notes jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_shop_id is null
     or jsonb_typeof(p_customer) is distinct from 'object'
     or jsonb_typeof(p_vehicle) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Shop, customer, and vehicle are required.';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A stable idempotency key is required.';
  end if;
  if length(coalesce(p_notes, '')) > 8000 then
    raise exception using errcode = '22023', message = 'Estimate notes exceed the supported length.';
  end if;

  select profile_id, canonical_role
  into v_actor_profile_id, v_actor_role
  from public.estimate_actor_for_shop(
    p_shop_id,
    array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman']
  );
  if v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'Actor cannot create estimates for this shop.';
  end if;

  v_customer_name := coalesce(
    nullif(btrim(p_customer ->> 'businessName'), ''),
    nullif(btrim(p_customer ->> 'name'), ''),
    nullif(btrim(concat_ws(' ', p_customer ->> 'firstName', p_customer ->> 'lastName')), '')
  );

  perform public.validate_estimate_lines(p_lines);
  select coalesce(jsonb_object_agg(line_key, line_note), '{}'::jsonb)
  into v_line_notes
  from (
    select
      btrim(entry ->> 'clientKey') as line_key,
      nullif(btrim(entry ->> 'advisorNotes'), '') as line_note
    from jsonb_array_elements(p_lines) entry
  ) internal_notes
  where line_note is not null;

  insert into public.estimate_events(
    shop_id, revision, event_type, actor_profile_id, idempotency_key
  ) values (
    p_shop_id, 1, 'created', v_actor_profile_id, p_idempotency_key
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select event_type, result into v_existing_event_type, v_existing_result
    from public.estimate_events
    where shop_id = p_shop_id
      and idempotency_key = p_idempotency_key;
    if v_existing_event_type = 'created' and coalesce(v_existing_result, '{}'::jsonb) <> '{}'::jsonb then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used for another estimate operation.';
  end if;

  if v_customer_id_text is not null then
    if v_customer_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Customer id must be a UUID.';
    end if;
    v_customer_id := v_customer_id_text::uuid;
    if not exists (
      select 1 from public.customers c
      where c.id = v_customer_id and c.shop_id = p_shop_id
    ) then
      raise exception using errcode = '23503', message = 'Customer does not belong to this shop.';
    end if;

    update public.customers c
    set business_name = coalesce(nullif(btrim(p_customer ->> 'businessName'), ''), c.business_name),
        name = coalesce(v_customer_name, c.name),
        first_name = coalesce(nullif(btrim(p_customer ->> 'firstName'), ''), c.first_name),
        last_name = coalesce(nullif(btrim(p_customer ->> 'lastName'), ''), c.last_name),
        email = coalesce(v_customer_email, c.email),
        phone = coalesce(v_customer_phone, c.phone),
        phone_number = coalesce(v_customer_phone, c.phone_number),
        address = coalesce(nullif(btrim(p_customer ->> 'address'), ''), c.address),
        city = coalesce(nullif(btrim(p_customer ->> 'city'), ''), c.city),
        province = coalesce(nullif(btrim(p_customer ->> 'province'), ''), c.province),
        postal_code = coalesce(nullif(btrim(p_customer ->> 'postalCode'), ''), c.postal_code)
    where c.id = v_customer_id
      and c.shop_id = p_shop_id;
  else
    if v_customer_name is null then
      raise exception using errcode = '22023', message = 'A customer name or business name is required.';
    end if;

    select c.id into v_customer_id
    from public.customers c
    where c.shop_id = p_shop_id
      and (
        (v_customer_email is not null and lower(btrim(coalesce(c.email, ''))) = v_customer_email)
        or (
          v_customer_phone is not null
          and coalesce(
            nullif(regexp_replace(coalesce(c.phone, c.phone_number, ''), '[^0-9]', '', 'g'), ''),
            nullif(btrim(coalesce(c.phone, c.phone_number, '')), '')
          ) = v_customer_phone
        )
      )
    order by
      case when v_customer_email is not null
        and lower(btrim(coalesce(c.email, ''))) = v_customer_email then 0 else 1 end,
      c.created_at,
      c.id
    limit 1
    for update;

    if v_customer_id is not null then
      update public.customers c
      set business_name = coalesce(nullif(btrim(p_customer ->> 'businessName'), ''), c.business_name),
          name = coalesce(v_customer_name, c.name),
          first_name = coalesce(nullif(btrim(p_customer ->> 'firstName'), ''), c.first_name),
          last_name = coalesce(nullif(btrim(p_customer ->> 'lastName'), ''), c.last_name),
          email = coalesce(v_customer_email, c.email),
          phone = coalesce(v_customer_phone, c.phone),
          phone_number = coalesce(v_customer_phone, c.phone_number),
          address = coalesce(nullif(btrim(p_customer ->> 'address'), ''), c.address),
          city = coalesce(nullif(btrim(p_customer ->> 'city'), ''), c.city),
          province = coalesce(nullif(btrim(p_customer ->> 'province'), ''), c.province),
          postal_code = coalesce(nullif(btrim(p_customer ->> 'postalCode'), ''), c.postal_code)
      where c.id = v_customer_id
        and c.shop_id = p_shop_id;
    else
      insert into public.customers(
        shop_id, business_name, name, first_name, last_name, email,
        phone, phone_number, address, city, province, postal_code
      ) values (
        p_shop_id,
        nullif(btrim(p_customer ->> 'businessName'), ''),
        v_customer_name,
        nullif(btrim(p_customer ->> 'firstName'), ''),
        nullif(btrim(p_customer ->> 'lastName'), ''),
        v_customer_email,
        v_customer_phone,
        v_customer_phone,
        nullif(btrim(p_customer ->> 'address'), ''),
        nullif(btrim(p_customer ->> 'city'), ''),
        nullif(btrim(p_customer ->> 'province'), ''),
        nullif(btrim(p_customer ->> 'postalCode'), '')
      ) returning id into v_customer_id;
    end if;
  end if;

  if nullif(btrim(p_vehicle ->> 'year'), '') is not null then
    begin
      v_year := (p_vehicle ->> 'year')::integer;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Vehicle year must be numeric.';
    end;
    if v_year < 1886 or v_year > extract(year from now())::integer + 2 then
      raise exception using errcode = '22023', message = 'Vehicle year is outside the supported range.';
    end if;
  end if;

  if v_vehicle_id_text is not null then
    if v_vehicle_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Vehicle id must be a UUID.';
    end if;
    v_vehicle_id := v_vehicle_id_text::uuid;
    if not exists (
      select 1 from public.vehicles v
      where v.id = v_vehicle_id
        and v.shop_id = p_shop_id
        and v.customer_id = v_customer_id
    ) then
      raise exception using errcode = '23503', message = 'Vehicle does not belong to this customer and shop.';
    end if;

    update public.vehicles v
    set year = coalesce(v_year, v.year),
        make = coalesce(nullif(btrim(p_vehicle ->> 'make'), ''), v.make),
        model = coalesce(nullif(btrim(p_vehicle ->> 'model'), ''), v.model),
        vin = coalesce(v_vehicle_vin, v.vin),
        license_plate = coalesce(v_vehicle_plate, v.license_plate),
        mileage = coalesce(nullif(btrim(p_vehicle ->> 'mileage'), ''), v.mileage),
        unit_number = coalesce(v_vehicle_unit, v.unit_number),
        color = coalesce(nullif(btrim(p_vehicle ->> 'color'), ''), v.color),
        engine = coalesce(nullif(btrim(p_vehicle ->> 'engine'), ''), v.engine),
        transmission = coalesce(nullif(btrim(p_vehicle ->> 'transmission'), ''), v.transmission),
        fuel_type = coalesce(nullif(btrim(p_vehicle ->> 'fuelType'), ''), v.fuel_type),
        drivetrain = coalesce(nullif(btrim(p_vehicle ->> 'drivetrain'), ''), v.drivetrain)
    where v.id = v_vehicle_id
      and v.shop_id = p_shop_id
      and v.customer_id = v_customer_id;
  else
    if nullif(btrim(p_vehicle ->> 'make'), '') is null
       or nullif(btrim(p_vehicle ->> 'model'), '') is null then
      raise exception using errcode = '22023', message = 'Vehicle make and model are required.';
    end if;

    if v_vehicle_vin is not null then
      select v.id, v.customer_id
      into v_vehicle_id, v_existing_vehicle_customer_id
      from public.vehicles v
      where v.shop_id = p_shop_id
        and upper(btrim(coalesce(v.vin, ''))) = v_vehicle_vin
      order by v.created_at, v.id
      limit 1
      for update;

      if v_vehicle_id is not null
         and v_existing_vehicle_customer_id is distinct from v_customer_id then
        raise exception using errcode = '23505',
          message = 'This VIN is already assigned to another customer. Contact shop/admin to move vehicle.';
      end if;
    end if;

    if v_vehicle_id is null and (v_vehicle_plate is not null or v_vehicle_unit is not null) then
      select v.id, v.customer_id
      into v_vehicle_id, v_existing_vehicle_customer_id
      from public.vehicles v
      where v.shop_id = p_shop_id
        and v.customer_id = v_customer_id
        and (
          (v_vehicle_plate is not null
            and upper(btrim(coalesce(v.license_plate, ''))) = v_vehicle_plate)
          or (v_vehicle_unit is not null
            and upper(btrim(coalesce(v.unit_number, ''))) = upper(v_vehicle_unit))
        )
      order by
        case when v_vehicle_plate is not null
          and upper(btrim(coalesce(v.license_plate, ''))) = v_vehicle_plate then 0 else 1 end,
        v.created_at,
        v.id
      limit 1
      for update;
    end if;

    if v_vehicle_id is not null then
      update public.vehicles v
      set year = coalesce(v_year, v.year),
          make = coalesce(nullif(btrim(p_vehicle ->> 'make'), ''), v.make),
          model = coalesce(nullif(btrim(p_vehicle ->> 'model'), ''), v.model),
          vin = coalesce(v_vehicle_vin, v.vin),
          license_plate = coalesce(v_vehicle_plate, v.license_plate),
          mileage = coalesce(nullif(btrim(p_vehicle ->> 'mileage'), ''), v.mileage),
          unit_number = coalesce(v_vehicle_unit, v.unit_number),
          color = coalesce(nullif(btrim(p_vehicle ->> 'color'), ''), v.color),
          engine = coalesce(nullif(btrim(p_vehicle ->> 'engine'), ''), v.engine),
          transmission = coalesce(nullif(btrim(p_vehicle ->> 'transmission'), ''), v.transmission),
          fuel_type = coalesce(nullif(btrim(p_vehicle ->> 'fuelType'), ''), v.fuel_type),
          drivetrain = coalesce(nullif(btrim(p_vehicle ->> 'drivetrain'), ''), v.drivetrain)
      where v.id = v_vehicle_id
        and v.shop_id = p_shop_id
        and v.customer_id = v_customer_id;
    else
      insert into public.vehicles(
        shop_id, customer_id, year, make, model, vin, license_plate,
        mileage, unit_number, color, engine, transmission, fuel_type, drivetrain
      ) values (
        p_shop_id, v_customer_id, v_year,
        nullif(btrim(p_vehicle ->> 'make'), ''),
        nullif(btrim(p_vehicle ->> 'model'), ''),
        v_vehicle_vin,
        v_vehicle_plate,
        nullif(btrim(p_vehicle ->> 'mileage'), ''),
        v_vehicle_unit,
        nullif(btrim(p_vehicle ->> 'color'), ''),
        nullif(btrim(p_vehicle ->> 'engine'), ''),
        nullif(btrim(p_vehicle ->> 'transmission'), ''),
        nullif(btrim(p_vehicle ->> 'fuelType'), ''),
        nullif(btrim(p_vehicle ->> 'drivetrain'), '')
      ) returning id into v_vehicle_id;
    end if;
  end if;

  select coalesce(s.labor_rate, 0) into v_shop_labor_rate
  from public.shops s where s.id = p_shop_id;

  loop
    v_candidate_work_order_id := gen_random_uuid();
    v_work_order_id := null;
    v_custom_id := 'WO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_estimate_number := 'EST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.work_orders(
      id, shop_id, customer_id, vehicle_id, advisor_id, created_by,
      custom_id, status, type, record_type, estimate_number, estimate_status,
      estimate_revision, estimate_created_at, estimate_created_by,
      estimate_expires_at, notes, approval_state
    ) values (
      v_candidate_work_order_id, p_shop_id, v_customer_id, v_vehicle_id,
      v_actor_profile_id, v_actor_user_id, v_custom_id, 'new', 'repair',
      'estimate', v_estimate_number, 'draft', 1, now(), v_actor_profile_id,
      p_expires_at, null, 'pending'
    )
    on conflict do nothing
    returning id into v_work_order_id;

    exit when v_work_order_id is not null;
  end loop;

  insert into public.estimate_internal_details(
    work_order_id, shop_id, notes, line_notes
  ) values (
    v_work_order_id, p_shop_id,
    nullif(btrim(coalesce(p_notes, '')), ''), v_line_notes
  );

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_labor_hours := coalesce(nullif(v_line ->> 'laborHours', '')::numeric, 0);
    v_labor_rate := coalesce(nullif(v_line ->> 'laborRate', '')::numeric, v_shop_labor_rate, 0);
    v_labor_total := round(v_labor_hours * v_labor_rate, 2);

    insert into public.work_order_quote_lines(
      shop_id, work_order_id, vehicle_id, description, title, notes,
      labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
      subtotal, tax_total, grand_total, status, stage, job_type, line_type,
      source_row_id, metadata, created_by
    ) values (
      p_shop_id, v_work_order_id, v_vehicle_id,
      coalesce(nullif(btrim(v_line ->> 'customerDescription'), ''), btrim(v_line ->> 'title')),
      btrim(v_line ->> 'title'),
      null,
      v_labor_hours, v_labor_hours, v_labor_rate, v_labor_total, 0,
      v_labor_total, 0, v_labor_total, 'draft', null, 'repair', 'estimate',
      'estimate:' || v_work_order_id::text || ':' || btrim(v_line ->> 'clientKey'),
      jsonb_build_object(
        'source', 'estimate_builder',
        'estimate_revision', 1,
        'client_key', btrim(v_line ->> 'clientKey'),
        'labor_rate', v_labor_rate,
        'customer_description', nullif(btrim(v_line ->> 'customerDescription'), ''),
        'requested_parts', coalesce(v_line -> 'parts', '[]'::jsonb)
      ),
      v_actor_user_id
    ) returning id into v_line_id;
    v_line_ids := array_append(v_line_ids, v_line_id);
  end loop;

  perform public.recalculate_estimate_work_order_totals(p_shop_id, v_work_order_id);

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'workOrderId', v_work_order_id,
    'estimateNumber', v_estimate_number,
    'estimateStatus', 'draft',
    'estimateRevision', 1,
    'customerId', v_customer_id,
    'vehicleId', v_vehicle_id,
    'quoteLineIds', to_jsonb(v_line_ids)
  );

  update public.estimate_events
  set work_order_id = v_work_order_id,
      changed_quote_line_ids = v_line_ids,
      snapshot = jsonb_build_object('customerId', v_customer_id, 'vehicleId', v_vehicle_id),
      result = v_result
  where id = v_event_id;

  return v_result;
end;
$$;

create or replace function public.save_estimate_draft_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_expected_revision integer,
  p_lines jsonb,
  p_notes text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_event_id uuid;
  v_existing_event_type text;
  v_existing_result jsonb;
  v_line jsonb;
  v_line_id uuid;
  v_line_source text;
  v_labor_hours numeric;
  v_labor_rate numeric;
  v_labor_total numeric;
  v_shop_labor_rate numeric := 0;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_notes jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A stable idempotency key is required.';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'A valid expected revision is required.';
  end if;
  if length(coalesce(p_notes, '')) > 8000 then
    raise exception using errcode = '22023', message = 'Estimate notes exceed the supported length.';
  end if;
  select profile_id, canonical_role into v_actor_profile_id, v_actor_role
  from public.estimate_actor_for_shop(
    p_shop_id,
    array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman']
  );
  if v_actor_user_id is null or v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'Actor cannot edit estimates for this shop.';
  end if;
  perform public.validate_estimate_lines(p_lines);
  select coalesce(jsonb_object_agg(line_key, line_note), '{}'::jsonb)
  into v_line_notes
  from (
    select
      btrim(entry ->> 'clientKey') as line_key,
      nullif(btrim(entry ->> 'advisorNotes'), '') as line_note
    from jsonb_array_elements(p_lines) entry
  ) internal_notes
  where line_note is not null;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is null then
    raise exception using errcode = 'P0002', message = 'Estimate not found for this shop.';
  end if;

  select event_type, result into v_existing_event_type, v_existing_result
  from public.estimate_events
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_event_type = 'draft_saved'
       and coalesce(v_existing_result, '{}'::jsonb) <> '{}'::jsonb then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used.';
  end if;

  if v_work_order.estimate_status <> 'draft'
     or v_work_order.estimate_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Estimate draft is stale or no longer editable.';
  end if;

  insert into public.estimate_events(
    shop_id, work_order_id, revision, event_type, actor_profile_id, idempotency_key
  ) values (
    p_shop_id, p_work_order_id, v_work_order.estimate_revision,
    'draft_saved', v_actor_profile_id, p_idempotency_key
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select event_type, result into v_existing_event_type, v_existing_result
    from public.estimate_events
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and idempotency_key = p_idempotency_key;
    if v_existing_event_type = 'draft_saved' then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used.';
  end if;

  select coalesce(s.labor_rate, 0) into v_shop_labor_rate
  from public.shops s where s.id = p_shop_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_id := null;
    v_line_source := 'estimate:' || p_work_order_id::text || ':' || btrim(v_line ->> 'clientKey');
    v_labor_hours := coalesce(nullif(v_line ->> 'laborHours', '')::numeric, 0);
    v_labor_rate := coalesce(nullif(v_line ->> 'laborRate', '')::numeric, v_shop_labor_rate, 0);
    v_labor_total := round(v_labor_hours * v_labor_rate, 2);

    insert into public.work_order_quote_lines(
      shop_id, work_order_id, vehicle_id, description, title, notes,
      labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
      subtotal, tax_total, grand_total, status, stage, job_type, line_type,
      source_row_id, metadata, created_by
    ) values (
      p_shop_id, p_work_order_id, v_work_order.vehicle_id,
      coalesce(nullif(btrim(v_line ->> 'customerDescription'), ''), btrim(v_line ->> 'title')),
      btrim(v_line ->> 'title'), null,
      v_labor_hours, v_labor_hours, v_labor_rate, v_labor_total, 0,
      v_labor_total, 0, v_labor_total, 'draft', null, 'repair', 'estimate',
      v_line_source,
      jsonb_build_object(
        'source', 'estimate_builder',
        'estimate_revision', v_work_order.estimate_revision,
        'client_key', btrim(v_line ->> 'clientKey'),
        'labor_rate', v_labor_rate,
        'customer_description', nullif(btrim(v_line ->> 'customerDescription'), ''),
        'requested_parts', coalesce(v_line -> 'parts', '[]'::jsonb)
      ),
      v_actor_user_id
    )
    on conflict (shop_id, work_order_id, source_row_id)
      where source_row_id like 'estimate:%'
    do update set
      description = excluded.description,
      title = excluded.title,
      notes = excluded.notes,
      labor_hours = excluded.labor_hours,
      est_labor_hours = excluded.est_labor_hours,
      labor_rate = excluded.labor_rate,
      labor_total = excluded.labor_total,
      parts_total = 0,
      subtotal = excluded.subtotal,
      tax_total = 0,
      grand_total = excluded.grand_total,
      status = 'draft',
      stage = null,
      metadata = excluded.metadata,
      updated_at = now()
    where public.work_order_quote_lines.status in ('draft', 'cancelled')
      and public.work_order_quote_lines.sent_to_customer_at is null
      and public.work_order_quote_lines.work_order_line_id is null
    returning id into v_line_id;
    if v_line_id is null then
      raise exception using errcode = '55000',
        message = 'A repair line is no longer editable in this estimate draft.';
    end if;
    v_line_ids := array_append(v_line_ids, v_line_id);
  end loop;

  update public.work_order_quote_lines q
  set status = 'cancelled', stage = null,
      metadata = coalesce(q.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelled_from_estimate_draft', true,
        'cancelled_at', now()
      ),
      updated_at = now()
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.status = 'draft'
    and q.source_row_id like 'estimate:%'
    and not (q.id = any(v_line_ids));

  insert into public.estimate_internal_details(
    work_order_id, shop_id, notes, line_notes, updated_at
  ) values (
    p_work_order_id, p_shop_id,
    nullif(btrim(coalesce(p_notes, '')), ''), v_line_notes, now()
  )
  on conflict (work_order_id) do update set
    notes = excluded.notes,
    line_notes = excluded.line_notes,
    updated_at = now();

  update public.work_orders
  set notes = null,
      estimate_expires_at = p_expires_at,
      updated_at = now()
  where id = p_work_order_id and shop_id = p_shop_id;
  perform public.recalculate_estimate_work_order_totals(p_shop_id, p_work_order_id);

  v_result := jsonb_build_object(
    'ok', true, 'idempotent', false, 'workOrderId', p_work_order_id,
    'estimateStatus', 'draft', 'estimateRevision', v_work_order.estimate_revision,
    'quoteLineIds', to_jsonb(v_line_ids)
  );
  update public.estimate_events
  set changed_quote_line_ids = v_line_ids, result = v_result
  where id = v_event_id;
  return v_result;
end;
$$;

create or replace function public.submit_estimate_to_parts_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_expected_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_event_id uuid;
  v_existing_event_type text;
  v_existing_result jsonb;
  v_quote public.work_order_quote_lines%rowtype;
  v_part jsonb;
  v_parts jsonb;
  v_request_id uuid;
  v_has_parts boolean := false;
  v_line_ids uuid[] := array[]::uuid[];
  v_next_status text;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A stable idempotency key is required.';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'A valid expected revision is required.';
  end if;
  select profile_id, canonical_role into v_actor_profile_id, v_actor_role
  from public.estimate_actor_for_shop(
    p_shop_id,
    array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman']
  );
  if v_actor_user_id is null or v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'Actor cannot submit estimates for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is null then
    raise exception using errcode = 'P0002', message = 'Estimate not found for this shop.';
  end if;
  if v_work_order.estimate_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Estimate revision is stale.';
  end if;

  if v_work_order.estimate_status in ('waiting_for_parts', 'ready_for_advisor') then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'workOrderId', p_work_order_id,
      'estimateStatus', v_work_order.estimate_status,
      'estimateRevision', v_work_order.estimate_revision
    );
  end if;
  if v_work_order.estimate_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Estimate cannot be submitted from its current state.';
  end if;

  insert into public.estimate_events(
    shop_id, work_order_id, revision, event_type, actor_profile_id, idempotency_key
  ) values (
    p_shop_id, p_work_order_id, v_work_order.estimate_revision,
    'submitted_to_parts', v_actor_profile_id, p_idempotency_key
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select event_type, result into v_existing_event_type, v_existing_result
    from public.estimate_events
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and idempotency_key = p_idempotency_key;
    if v_existing_event_type = 'submitted_to_parts' then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used.';
  end if;

  if not exists (
    select 1 from public.work_order_quote_lines q
    where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
      and q.status = 'draft'
  ) then
    raise exception using errcode = '22023', message = 'Estimate has no draft repair lines.';
  end if;

  select exists (
    select 1
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and q.status = 'draft'
      and jsonb_typeof(coalesce(q.metadata -> 'requested_parts', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(q.metadata -> 'requested_parts', '[]'::jsonb)) > 0
  ) into v_has_parts;

  -- Item-structure guards permit writes only while the current revision is
  -- owned by Parts. Move the row first; the transaction rolls this back if any
  -- request or quote-line write fails.
  if v_has_parts then
    update public.work_orders
    set estimate_status = 'waiting_for_parts',
        estimate_parts_completed_at = null,
        estimate_parts_completed_by = null,
        updated_at = now()
    where id = p_work_order_id and shop_id = p_shop_id;
  end if;

  for v_quote in
    select * from public.work_order_quote_lines q
    where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
      and q.status = 'draft'
    order by q.created_at, q.id
    for update
  loop
    v_line_ids := array_append(v_line_ids, v_quote.id);
    v_parts := coalesce(v_quote.metadata -> 'requested_parts', '[]'::jsonb);

    if jsonb_typeof(v_parts) = 'array' and jsonb_array_length(v_parts) > 0 then
      insert into public.part_requests(
        shop_id, work_order_id, quote_line_id, requested_by, notes,
        status, source_context, source_revision
      ) values (
        p_shop_id, p_work_order_id, v_quote.id, v_actor_user_id,
        'Estimate ' || v_work_order.estimate_number || ' · ' || coalesce(v_quote.title, v_quote.description),
        'requested', 'estimate', v_work_order.estimate_revision
      )
      on conflict (shop_id, quote_line_id, source_context, source_revision)
        where source_context = 'estimate' and quote_line_id is not null
      do update set notes = excluded.notes
      returning id into v_request_id;

      for v_part in select value from jsonb_array_elements(v_parts)
      loop
        insert into public.part_request_items(
          request_id, shop_id, work_order_id, quote_line_id, description,
          qty, qty_requested, requested_part_number, requested_manufacturer,
          status, source_row_id
        ) values (
          v_request_id, p_shop_id, p_work_order_id, v_quote.id,
          btrim(v_part ->> 'description'),
          coalesce(nullif(v_part ->> 'quantity', '')::numeric, 1),
          coalesce(nullif(v_part ->> 'quantity', '')::numeric, 1),
          nullif(btrim(v_part ->> 'partNumber'), ''),
          nullif(btrim(v_part ->> 'manufacturer'), ''),
          'requested', btrim(v_part ->> 'clientKey')
        )
        on conflict (request_id, source_row_id) where source_row_id is not null
        do update set
          description = excluded.description,
          qty = excluded.qty,
          qty_requested = excluded.qty_requested,
          requested_part_number = excluded.requested_part_number,
          requested_manufacturer = excluded.requested_manufacturer,
          updated_at = now();
      end loop;

      update public.work_order_quote_lines
      set status = 'pending_parts', stage = 'advisor_pending', updated_at = now()
      where id = v_quote.id and shop_id = p_shop_id;
    else
      update public.work_order_quote_lines
      set status = 'quoted', stage = 'ready_to_send',
          parts_total = 0,
          subtotal = coalesce(labor_total, 0),
          grand_total = coalesce(labor_total, 0) + coalesce(tax_total, 0),
          updated_at = now()
      where id = v_quote.id and shop_id = p_shop_id;
    end if;
  end loop;

  v_next_status := case when v_has_parts then 'waiting_for_parts' else 'ready_for_advisor' end;
  update public.work_orders
  set estimate_status = v_next_status,
      estimate_parts_completed_at = case when v_has_parts then null else now() end,
      estimate_parts_completed_by = case when v_has_parts then null else v_actor_profile_id end,
      updated_at = now()
  where id = p_work_order_id and shop_id = p_shop_id;
  perform public.recalculate_estimate_work_order_totals(p_shop_id, p_work_order_id);

  v_result := jsonb_build_object(
    'ok', true, 'idempotent', false, 'workOrderId', p_work_order_id,
    'estimateStatus', v_next_status,
    'estimateRevision', v_work_order.estimate_revision,
    'quoteLineIds', to_jsonb(v_line_ids)
  );
  update public.estimate_events
  set changed_quote_line_ids = v_line_ids, result = v_result
  where id = v_event_id;
  return v_result;
end;
$$;

create or replace function public.complete_estimate_parts_quote_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_expected_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_event_id uuid;
  v_existing_event_type text;
  v_existing_result jsonb;
  v_quote_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A stable idempotency key is required.';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'A valid expected revision is required.';
  end if;
  select profile_id, canonical_role into v_actor_profile_id, v_actor_role
  from public.estimate_actor_for_shop(
    p_shop_id, array['owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman']
  );
  if v_actor_user_id is null or v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'Actor cannot complete estimate parts quotes for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is null then
    raise exception using errcode = 'P0002', message = 'Estimate not found for this shop.';
  end if;
  if v_work_order.estimate_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Estimate revision is stale.';
  end if;
  if v_work_order.estimate_status = 'ready_for_advisor' then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'workOrderId', p_work_order_id,
      'estimateStatus', 'ready_for_advisor',
      'estimateRevision', v_work_order.estimate_revision
    );
  end if;
  if v_work_order.estimate_status <> 'waiting_for_parts' then
    raise exception using errcode = '55000', message = 'Estimate is not waiting for Parts.';
  end if;

  insert into public.estimate_events(
    shop_id, work_order_id, revision, event_type, actor_profile_id, idempotency_key
  ) values (
    p_shop_id, p_work_order_id, v_work_order.estimate_revision,
    'parts_completed', v_actor_profile_id, p_idempotency_key
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select event_type, result into v_existing_event_type, v_existing_result
    from public.estimate_events
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and idempotency_key = p_idempotency_key;
    if v_existing_event_type = 'parts_completed' then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used.';
  end if;

  if not exists (
    select 1 from public.part_requests pr
    where pr.shop_id = p_shop_id and pr.work_order_id = p_work_order_id
      and pr.source_context = 'estimate'
      and pr.source_revision = v_work_order.estimate_revision
      and lower(coalesce(pr.status::text, '')) <> 'cancelled'
  ) then
    raise exception using errcode = '22023', message = 'No current estimate parts requests were found.';
  end if;

  if exists (
    select 1
    from public.part_requests pr
    left join public.part_request_items pri
      on pri.request_id = pr.id
     and pri.shop_id = p_shop_id
     and pri.work_order_id = p_work_order_id
     and pri.quote_line_id = pr.quote_line_id
     and lower(coalesce(pri.status::text, 'requested')) not in (
       'cancelled', 'canceled', 'rejected', 'declined', 'voided'
     )
    where pr.shop_id = p_shop_id
      and pr.work_order_id = p_work_order_id
      and pr.source_context = 'estimate'
      and pr.source_revision = v_work_order.estimate_revision
      and lower(coalesce(pr.status::text, '')) <> 'cancelled'
    group by pr.id
    having count(pri.id) = 0
       or bool_or(
         nullif(btrim(coalesce(pri.description, '')), '') is null
         or greatest(coalesce(pri.qty, 0), coalesce(pri.qty_requested, 0), 0) <= 0
         or coalesce(pri.quoted_price, pri.unit_price) is null
         or coalesce(pri.quoted_price, pri.unit_price) < 0
       )
  ) then
    raise exception using errcode = '23514',
      message = 'Every requested part needs a description, quantity, and selling price before completion.';
  end if;

  for v_quote_line_id in
    select distinct pr.quote_line_id
    from public.part_requests pr
    where pr.shop_id = p_shop_id and pr.work_order_id = p_work_order_id
      and pr.source_context = 'estimate'
      and pr.source_revision = v_work_order.estimate_revision
      and pr.quote_line_id is not null
      and lower(coalesce(pr.status::text, '')) <> 'cancelled'
    order by pr.quote_line_id
  loop
    perform public.sync_quote_line_pricing_from_parts(p_shop_id, v_quote_line_id);
    update public.work_order_quote_lines q
    set metadata = jsonb_set(
      coalesce(q.metadata, '{}'::jsonb),
      '{parts_quote}',
      jsonb_build_object(
        'required_count', coalesce(q.metadata #> '{parts_quote,required_count}', '0'::jsonb),
        'quoted_count', coalesce(q.metadata #> '{parts_quote,quoted_count}', '0'::jsonb),
        'pending_count', coalesce(q.metadata #> '{parts_quote,pending_count}', '0'::jsonb),
        'parts_total', coalesce(q.metadata #> '{parts_quote,parts_total}', '0'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'description', item -> 'description',
            'qty', item -> 'qty',
            'unit_price', item -> 'unit_price',
            'line_total', item -> 'line_total',
            'status', item -> 'status',
            'requested_part_number', item -> 'requested_part_number',
            'requested_manufacturer', item -> 'requested_manufacturer',
            'selected_name', item -> 'selected_name',
            'selected_part_number', item -> 'selected_part_number',
            'manufacturer', item -> 'manufacturer'
          )))
          from jsonb_array_elements(
            coalesce(q.metadata #> '{parts_quote,items}', '[]'::jsonb)
          ) item
        ), '[]'::jsonb)
      ),
      true
    )
    where q.id = v_quote_line_id
      and q.shop_id = p_shop_id;
    v_line_ids := array_append(v_line_ids, v_quote_line_id);
  end loop;

  if exists (
    select 1
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
      and q.id = any(v_line_ids)
      and (
        lower(coalesce(q.status::text, '')) <> 'quoted'
        or lower(coalesce(q.stage::text, '')) <> 'ready_to_send'
      )
  ) then
    raise exception using errcode = '23514',
      message = 'Every requested part needs a description, quantity, and selling price before completion.';
  end if;

  update public.part_requests
  set status = 'quoted', updated_at = now()
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and source_context = 'estimate'
    and source_revision = v_work_order.estimate_revision
    and lower(coalesce(status::text, '')) <> 'cancelled';

  update public.work_orders
  set estimate_status = 'ready_for_advisor',
      estimate_parts_completed_at = now(),
      estimate_parts_completed_by = v_actor_profile_id,
      updated_at = now()
  where id = p_work_order_id and shop_id = p_shop_id;
  perform public.recalculate_estimate_work_order_totals(p_shop_id, p_work_order_id);

  v_result := jsonb_build_object(
    'ok', true, 'idempotent', false, 'workOrderId', p_work_order_id,
    'estimateStatus', 'ready_for_advisor',
    'estimateRevision', v_work_order.estimate_revision,
    'quoteLineIds', to_jsonb(v_line_ids)
  );
  update public.estimate_events
  set changed_quote_line_ids = v_line_ids, result = v_result
  where id = v_event_id;
  return v_result;
end;
$$;

create or replace function public.return_estimate_to_parts_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_expected_revision integer,
  p_reason_code text,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_event_id uuid;
  v_existing_event_type text;
  v_existing_result jsonb;
  v_selected uuid[];
  v_old public.work_order_quote_lines%rowtype;
  v_new_quote_line_id uuid;
  v_new_request_id uuid;
  v_new_revision integer;
  v_parts jsonb;
  v_part jsonb;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_map jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  v_selected := array(
    select distinct value
    from unnest(coalesce(p_quote_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  if coalesce(cardinality(v_selected), 0) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one repair line to return.';
  end if;
  if cardinality(v_selected) > 50 then
    raise exception using errcode = '22023', message = 'No more than 50 repair lines can be returned at once.';
  end if;
  if lower(btrim(coalesce(p_reason_code, ''))) <> all(array[
    'lower_cost_option', 'confirm_availability', 'correct_quantity',
    'incorrect_application', 'missing_parts', 'review_price',
    'customer_alternative', 'other'
  ]::text[]) then
    raise exception using errcode = '22023', message = 'A return reason is required.';
  end if;
  if length(coalesce(p_note, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Return instructions exceed the supported length.';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A stable idempotency key is required.';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'A valid expected revision is required.';
  end if;

  select profile_id, canonical_role into v_actor_profile_id, v_actor_role
  from public.estimate_actor_for_shop(
    p_shop_id,
    array['owner', 'admin', 'manager', 'advisor', 'service', 'foreman']
  );
  if v_actor_user_id is null or v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'Actor cannot return estimates to Parts for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is null then
    raise exception using errcode = 'P0002', message = 'Estimate not found for this shop.';
  end if;

  select event_type, result into v_existing_event_type, v_existing_result
  from public.estimate_events
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_event_type = 'returned_to_parts'
       and coalesce(v_existing_result, '{}'::jsonb) <> '{}'::jsonb then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used.';
  end if;

  if v_work_order.estimate_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Estimate revision is stale.';
  end if;
  if v_work_order.estimate_status not in ('ready_for_advisor', 'sent', 'partially_approved') then
    raise exception using errcode = '55000', message = 'Estimate cannot be returned from its current state.';
  end if;
  if exists (
    select 1
    from public.estimate_events e
    where e.shop_id = p_shop_id
      and e.work_order_id = p_work_order_id
      and e.revision = v_work_order.estimate_revision
      and (
        e.event_type = 'send_reserved'
        or (
          e.event_type = 'send_failed'
          and (
            nullif(btrim(coalesce(e.result ->> 'accepted_at', '')), '') is not null
            or exists (
              select 1
              from public.email_logs el
              where el.shop_id = p_shop_id
                and el.template_key = 'quote_ready'
                and lower(btrim(coalesce(el.status, ''))) <> 'suppressed'
                and el.metadata @> jsonb_build_object(
                  'estimate_send_key', e.idempotency_key,
                  'work_order_id', p_work_order_id,
                  'estimate_revision', v_work_order.estimate_revision
                )
            )
          )
        )
      )
  ) then
    raise exception using errcode = '55000',
      message = 'Estimate delivery is in progress. Retry the adjustment after delivery finishes.';
  end if;
  if (
    select count(*) from public.work_order_quote_lines q
    where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
      and q.id = any(v_selected)
  ) <> cardinality(v_selected) then
    raise exception using errcode = 'P0002', message = 'One or more selected repair lines were not found.';
  end if;
  if exists (
    select 1 from public.work_order_quote_lines q
    where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
      and q.id = any(v_selected)
      and (
        q.approved_at is not null or q.work_order_line_id is not null
        or lower(coalesce(q.status::text, '')) in (
          'approved', 'converted', 'declined', 'deferred', 'cancelled', 'superseded'
        )
      )
  ) then
    raise exception using errcode = '55000', message = 'Approved, decided, or superseded lines cannot be returned to Parts.';
  end if;
  if exists (
    select 1 from public.part_request_items pri
    where pri.shop_id = p_shop_id and pri.work_order_id = p_work_order_id
      and pri.quote_line_id = any(v_selected)
      and (
        coalesce(pri.qty_ordered, 0) > 0 or coalesce(pri.qty_received, 0) > 0
        or coalesce(pri.qty_reserved, 0) > 0 or coalesce(pri.qty_picked, 0) > 0
        or coalesce(pri.qty_consumed, 0) > 0 or coalesce(pri.qty_returned, 0) > 0
        or pri.po_id is not null or pri.work_order_line_id is not null
      )
  ) then
    raise exception using errcode = '55000', message = 'Lines with inventory or purchase activity cannot be revised.';
  end if;

  v_new_revision := v_work_order.estimate_revision + 1;
  insert into public.estimate_events(
    shop_id, work_order_id, revision, event_type, actor_profile_id,
    reason_code, note, changed_quote_line_ids, idempotency_key
  ) values (
    p_shop_id, p_work_order_id, v_new_revision, 'returned_to_parts',
    v_actor_profile_id, lower(btrim(p_reason_code)), nullif(btrim(coalesce(p_note, '')), ''),
    v_selected, p_idempotency_key
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select event_type, result into v_existing_event_type, v_existing_result
    from public.estimate_events
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and idempotency_key = p_idempotency_key;
    if v_existing_event_type = 'returned_to_parts' then
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was already used.';
  end if;

  -- Activate the new Parts-owned revision before its request items are
  -- inserted. This also keeps quote-line sync triggers from pulling the row
  -- back into a customer/advisor state mid-revision.
  update public.work_orders
  set estimate_revision = v_new_revision,
      estimate_status = 'waiting_for_parts',
      estimate_parts_completed_at = null,
      estimate_parts_completed_by = null,
      updated_at = now()
  where id = p_work_order_id and shop_id = p_shop_id;

  for v_old in
    select * from public.work_order_quote_lines q
    where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
      and q.id = any(v_selected)
    order by q.id
    for update
  loop
    -- Rebuild from the canonical current request items, not only the advisor's
    -- original requested_parts snapshot. Parts may have added or removed a
    -- necessary component while sourcing; the next revision must preserve
    -- that reviewed scope while clearing its prior commercial quote.
    select coalesce(jsonb_agg(jsonb_build_object(
      'clientKey', coalesce(
        nullif(btrim(pri.source_row_id), ''),
        'item:' || pri.id::text
      ),
      'description', btrim(pri.description),
      'quantity', greatest(coalesce(pri.qty, 0), coalesce(pri.qty_requested, 0), 1),
      'partNumber', coalesce(pri.requested_part_number, ''),
      'manufacturer', coalesce(pri.requested_manufacturer, '')
    ) order by pri.created_at, pri.id), '[]'::jsonb)
    into v_parts
    from public.part_requests pr
    join public.part_request_items pri
      on pri.request_id = pr.id
     and pri.shop_id = p_shop_id
     and pri.work_order_id = p_work_order_id
     and pri.quote_line_id = v_old.id
    where pr.shop_id = p_shop_id
      and pr.work_order_id = p_work_order_id
      and pr.quote_line_id = v_old.id
      and pr.source_context = 'estimate'
      and pr.source_revision = v_work_order.estimate_revision
      and lower(coalesce(pr.status::text, '')) not in (
        'cancelled', 'canceled', 'rejected', 'voided'
      )
      and lower(coalesce(pri.status::text, '')) not in (
        'cancelled', 'canceled', 'rejected', 'declined', 'voided'
      );

    if jsonb_array_length(v_parts) = 0 then
      raise exception using errcode = '22023', message = 'Labor-only lines do not need a Parts adjustment.';
    end if;

    insert into public.work_order_quote_lines(
      shop_id, work_order_id, vehicle_id, description, title, notes,
      ai_complaint, ai_cause, ai_correction,
      labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
      subtotal, tax_total, grand_total, status, stage, job_type, line_type,
      source_row_id, metadata, created_by
    ) values (
      p_shop_id, p_work_order_id, v_old.vehicle_id, v_old.description,
      v_old.title, null, v_old.ai_complaint, v_old.ai_cause, v_old.ai_correction,
      v_old.labor_hours, v_old.est_labor_hours, v_old.labor_rate,
      coalesce(v_old.labor_total, 0), 0, coalesce(v_old.labor_total, 0), 0,
      coalesce(v_old.labor_total, 0), 'pending_parts', 'advisor_pending',
      v_old.job_type, v_old.line_type,
      'estimate:' || p_work_order_id::text || ':' ||
        coalesce(v_old.metadata ->> 'client_key', v_old.id::text) || ':r' || v_new_revision::text,
      (coalesce(v_old.metadata, '{}'::jsonb) - 'parts_quote') || jsonb_build_object(
        'estimate_revision', v_new_revision,
        'revision_of_quote_line_id', v_old.id,
        'requested_parts', v_parts
      ),
      v_actor_user_id
    ) returning id into v_new_quote_line_id;

    insert into public.part_requests(
      shop_id, work_order_id, quote_line_id, requested_by, notes,
      status, source_context, source_revision
    ) values (
      p_shop_id, p_work_order_id, v_new_quote_line_id, v_actor_user_id,
      'Adjustment ' || v_new_revision::text || ' · ' || lower(btrim(p_reason_code)) ||
        coalesce(' · ' || nullif(btrim(coalesce(p_note, '')), ''), ''),
      'requested', 'estimate', v_new_revision
    ) returning id into v_new_request_id;

    for v_part in select value from jsonb_array_elements(v_parts)
    loop
      insert into public.part_request_items(
        request_id, shop_id, work_order_id, quote_line_id, description,
        qty, qty_requested, requested_part_number, requested_manufacturer,
        status, source_row_id
      ) values (
        v_new_request_id, p_shop_id, p_work_order_id, v_new_quote_line_id,
        btrim(v_part ->> 'description'),
        coalesce(nullif(v_part ->> 'quantity', '')::numeric, 1),
        coalesce(nullif(v_part ->> 'quantity', '')::numeric, 1),
        nullif(btrim(v_part ->> 'partNumber'), ''),
        nullif(btrim(v_part ->> 'manufacturer'), ''),
        'requested', btrim(v_part ->> 'clientKey')
      );
    end loop;

    update public.part_requests
    set status = 'cancelled'
    where shop_id = p_shop_id and work_order_id = p_work_order_id
      and quote_line_id = v_old.id
      and source_context = 'estimate'
      and lower(coalesce(status::text, '')) not in ('cancelled', 'fulfilled', 'returned');

    update public.work_order_quote_lines
    set status = 'cancelled', stage = null,
        sent_to_customer_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'superseded_at', now(),
          'superseded_by_quote_line_id', v_new_quote_line_id,
          'superseded_in_revision', v_new_revision,
          'superseded_prior_sent_to_customer_at', sent_to_customer_at
        ),
        updated_at = now()
    where id = v_old.id and shop_id = p_shop_id;

    v_line_ids := array_append(v_line_ids, v_new_quote_line_id);
    v_line_map := v_line_map || jsonb_build_array(jsonb_build_object(
      'previousQuoteLineId', v_old.id,
      'quoteLineId', v_new_quote_line_id,
      'requestId', v_new_request_id
    ));
  end loop;

  perform public.recalculate_estimate_work_order_totals(p_shop_id, p_work_order_id);

  v_result := jsonb_build_object(
    'ok', true, 'idempotent', false, 'workOrderId', p_work_order_id,
    'estimateStatus', 'waiting_for_parts',
    'estimateRevision', v_new_revision,
    'quoteLineIds', to_jsonb(v_line_ids),
    'lineRevisions', v_line_map
  );
  update public.estimate_events
  set changed_quote_line_ids = v_line_ids,
      snapshot = jsonb_build_object(
        'previousRevision', v_work_order.estimate_revision,
        'lineRevisions', v_line_map
      ),
      result = v_result
  where id = v_event_id;
  return v_result;
end;
$$;

-- Customer delivery crosses an external provider boundary. Reserve the exact
-- estimate revision and quote-line snapshot in one short database transaction
-- before making that external call. The service-only grant below keeps this
-- function behind the already-authenticated, shop-scoped server route.
create or replace function public.reserve_estimate_send_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_revision integer,
  p_idempotency_key text,
  p_actor_profile_id uuid,
  p_actor_user_id uuid,
  p_quote_line_ids uuid[],
  p_allow_resend boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_event public.estimate_events%rowtype;
  v_selected uuid[];
  v_valid_line_count integer := 0;
  v_attempt_count integer := 0;
  v_uncertain_attempt_count integer := 0;
  v_reclaimable boolean := false;
  v_attempt_key text;
begin
  if p_shop_id is null or p_work_order_id is null or p_revision is null or p_revision < 1 then
    raise exception using errcode = '22023', message = 'A shop, estimate, and revision are required.';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A stable estimate send key is required.';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and case lower(btrim(coalesce(p.role::text, '')))
        when 'service_advisor' then 'service'
        when 'service advisor' then 'service'
        else lower(btrim(coalesce(p.role::text, '')))
      end in ('owner', 'admin', 'manager', 'advisor', 'service', 'foreman')
  ) then
    raise exception using errcode = '42501', message = 'Actor cannot send estimates for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders w
  where w.id = p_work_order_id
    and w.shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is null then
    raise exception using errcode = 'P0002', message = 'Estimate not found for this shop.';
  end if;
  if v_work_order.estimate_revision <> p_revision then
    raise exception using errcode = '40001', message = 'Estimate revision is stale.';
  end if;
  if v_work_order.estimate_status not in ('ready_for_advisor', 'sent') then
    raise exception using errcode = '55000', message = 'Estimate is not ready for customer delivery.';
  end if;

  select * into v_event
  from public.estimate_events e
  where e.shop_id = p_shop_id
    and e.idempotency_key = p_idempotency_key
  for update;

  if v_event.id is null then
    select * into v_event
    from public.estimate_events e
    where e.shop_id = p_shop_id
      and e.work_order_id = p_work_order_id
      and e.revision = p_revision
      and e.event_type in ('send_reserved', 'send_failed', 'sent')
    for update;
  elsif v_event.work_order_id is distinct from p_work_order_id
     or v_event.revision <> p_revision
     or v_event.event_type not in ('send_reserved', 'send_failed', 'sent') then
    raise exception using errcode = '23505',
      message = 'Idempotency key was already used for another estimate operation.';
  end if;

  if v_event.id is not null then
    if v_event.event_type = 'sent' then
      return jsonb_build_object(
        'ok', true, 'eventId', v_event.id, 'eventType', 'sent', 'replay', true
      );
    end if;

    v_attempt_key := v_event.idempotency_key;
    select
      count(*),
      count(*) filter (
        where lower(btrim(coalesce(el.status, ''))) <> 'suppressed'
      )
    into v_attempt_count, v_uncertain_attempt_count
    from public.email_logs el
    where el.shop_id = p_shop_id
      and el.template_key = 'quote_ready'
      and el.metadata @> jsonb_build_object(
        'estimate_send_key', v_attempt_key,
        'work_order_id', p_work_order_id,
        'estimate_revision', p_revision
      );

    v_reclaimable := nullif(btrim(coalesce(v_event.result ->> 'accepted_at', '')), '') is null
      and v_uncertain_attempt_count = 0
      and (
        (v_event.event_type = 'send_failed' and v_attempt_count = 0)
        or v_attempt_count > 0
        or coalesce(v_event.updated_at, v_event.created_at) <= now() - interval '15 minutes'
      );

    if not v_reclaimable then
      return jsonb_build_object(
        'ok', true,
        'eventId', v_event.id,
        'eventType', v_event.event_type,
        'replay', true,
        'deliveryState', case
          when v_uncertain_attempt_count > 0 then 'delivery_uncertain'
          else 'in_progress'
        end
      );
    end if;
  end if;

  v_selected := array(
    select distinct value
    from unnest(coalesce(p_quote_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  if coalesce(cardinality(v_selected), 0) = 0 then
    raise exception using errcode = '22023', message = 'At least one quote line is required for delivery.';
  end if;
  if cardinality(v_selected) > 50 then
    raise exception using errcode = '22023', message = 'No more than 50 quote lines can be sent at once.';
  end if;

  perform q.id
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(v_selected)
  order by q.id
  for update;

  select count(*) into v_valid_line_count
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(v_selected)
    and q.approved_at is null
    and q.declined_at is null
    and q.deferred_at is null
    and q.work_order_line_id is null
    and (
      (
        q.sent_to_customer_at is null
        and coalesce(q.metadata ->> 'estimate_revision', '') = p_revision::text
        and (
          lower(btrim(coalesce(q.status::text, ''))) in (
            'advisor_pending', 'ready_to_send', 'quoted'
          )
          or lower(btrim(coalesce(q.stage::text, ''))) in (
            'advisor_pending', 'ready_to_send'
          )
        )
      )
      or (
        coalesce(p_allow_resend, false)
        and q.sent_to_customer_at is not null
        and lower(btrim(coalesce(q.status::text, ''))) = 'sent'
      )
    );

  if v_valid_line_count <> cardinality(v_selected) then
    raise exception using errcode = '40001',
      message = 'Estimate pricing changed before delivery could be reserved.';
  end if;

  if v_event.id is not null then
    update public.estimate_events e
    set event_type = 'send_reserved',
        actor_profile_id = p_actor_profile_id,
        idempotency_key = p_idempotency_key,
        snapshot = jsonb_build_object(
          'quote_line_ids', to_jsonb(v_selected),
          'request_allows_resend', coalesce(p_allow_resend, false),
          'actor_user_id', p_actor_user_id
        ),
        result = jsonb_build_object('delivery_state', 'sending'),
        updated_at = now()
    where e.id = v_event.id
      and e.shop_id = p_shop_id;

    return jsonb_build_object(
      'ok', true, 'eventId', v_event.id, 'eventType', 'send_reserved',
      'replay', false, 'reclaimed', true
    );
  end if;

  insert into public.estimate_events(
    shop_id, work_order_id, revision, event_type, actor_profile_id,
    snapshot, result, idempotency_key
  ) values (
    p_shop_id, p_work_order_id, p_revision, 'send_reserved', p_actor_profile_id,
    jsonb_build_object(
      'quote_line_ids', to_jsonb(v_selected),
      'request_allows_resend', coalesce(p_allow_resend, false),
      'actor_user_id', p_actor_user_id
    ),
    jsonb_build_object('delivery_state', 'sending'),
    p_idempotency_key
  )
  returning * into v_event;

  return jsonb_build_object(
    'ok', true, 'eventId', v_event.id, 'eventType', 'send_reserved',
    'replay', false, 'reclaimed', false
  );
end;
$$;

-- After the provider accepts delivery, publish the reserved lines and complete
-- the idempotency event together. Replays repair interrupted local persistence
-- without sending another customer email.
create or replace function public.finalize_estimate_send_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_revision integer,
  p_event_id uuid,
  p_sent_at timestamptz,
  p_quote_url text,
  p_actor_profile_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_event public.estimate_events%rowtype;
  v_selected uuid[];
  v_line_count integer := 0;
  v_updated_count integer := 0;
  v_decided_count integer := 0;
  v_has_approved_lines boolean := false;
begin
  if p_sent_at is null then
    raise exception using errcode = '22023', message = 'Provider acceptance time is required.';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and case lower(btrim(coalesce(p.role::text, '')))
        when 'service_advisor' then 'service'
        when 'service advisor' then 'service'
        else lower(btrim(coalesce(p.role::text, '')))
      end in ('owner', 'admin', 'manager', 'advisor', 'service', 'foreman')
  ) then
    raise exception using errcode = '42501', message = 'Actor cannot finalize estimate delivery for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders w
  where w.id = p_work_order_id
    and w.shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is null then
    raise exception using errcode = 'P0002', message = 'Estimate not found for this shop.';
  end if;
  if v_work_order.estimate_revision <> p_revision then
    raise exception using errcode = '40001', message = 'Estimate revision changed before delivery finalized.';
  end if;

  select * into v_event
  from public.estimate_events e
  where e.id = p_event_id
    and e.shop_id = p_shop_id
    and e.work_order_id = p_work_order_id
    and e.revision = p_revision
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate send reservation was not found.';
  end if;
  if v_event.event_type = 'sent' then
    return coalesce(v_event.result, '{}'::jsonb) || jsonb_build_object(
      'ok', true, 'idempotent', true, 'eventId', v_event.id
    );
  end if;
  if v_event.event_type <> 'send_reserved' then
    raise exception using errcode = '55000', message = 'Estimate send reservation is not active.';
  end if;

  begin
    v_selected := array(
      select distinct value::uuid
      from jsonb_array_elements_text(
        coalesce(v_event.snapshot -> 'quote_line_ids', '[]'::jsonb)
      ) value
      order by value::uuid
    );
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Estimate send reservation contains invalid quote lines.';
  end;
  if coalesce(cardinality(v_selected), 0) = 0 then
    raise exception using errcode = '22023', message = 'Estimate send reservation has no quote lines.';
  end if;

  perform q.id
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(v_selected)
  order by q.id
  for update;

  select count(*) into v_line_count
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(v_selected)
    and lower(btrim(coalesce(q.status::text, ''))) not in (
      'cancelled', 'canceled', 'rejected', 'superseded', 'voided'
    );
  if v_line_count <> cardinality(v_selected) then
    raise exception using errcode = '40001', message = 'Reserved estimate lines changed before delivery finalized.';
  end if;

  update public.work_order_quote_lines q
  set status = 'sent',
      stage = 'sent',
      sent_to_customer_at = coalesce(q.sent_to_customer_at, p_sent_at),
      sent_at = coalesce(q.sent_at, p_sent_at),
      sent_by = coalesce(q.sent_by, p_actor_user_id),
      updated_at = p_sent_at
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(v_selected)
    and q.approved_at is null
    and q.declined_at is null
    and q.deferred_at is null
    and q.work_order_line_id is null
    and (
      lower(btrim(coalesce(q.status::text, ''))) in (
        'advisor_pending', 'ready_to_send', 'quoted', 'sent'
      )
      or lower(btrim(coalesce(q.stage::text, ''))) in (
        'advisor_pending', 'ready_to_send', 'sent'
      )
    );
  get diagnostics v_updated_count = row_count;

  select count(*) into v_decided_count
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(v_selected)
    and (
      q.approved_at is not null
      or q.declined_at is not null
      or q.deferred_at is not null
      or q.work_order_line_id is not null
      or lower(btrim(coalesce(q.status::text, ''))) in (
        'approved', 'converted', 'declined', 'deferred'
      )
    );
  if v_updated_count + v_decided_count <> cardinality(v_selected) then
    raise exception using errcode = '40001', message = 'Reserved estimate lines are no longer sendable.';
  end if;

  select exists (
    select 1
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and (
        q.approved_at is not null
        or q.work_order_line_id is not null
        or lower(btrim(coalesce(q.status::text, ''))) in ('approved', 'converted')
      )
  ) into v_has_approved_lines;

  update public.work_orders w
  set quote_url = coalesce(nullif(btrim(coalesce(p_quote_url, '')), ''), w.quote_url),
      approval_state = case
        when v_updated_count = 0 then w.approval_state
        when v_has_approved_lines then 'partial'
        else 'pending'
      end,
      estimate_status = case when v_updated_count > 0 then 'sent' else w.estimate_status end,
      estimate_sent_at = coalesce(w.estimate_sent_at, p_sent_at),
      estimate_sent_by = coalesce(w.estimate_sent_by, p_actor_profile_id),
      updated_at = p_sent_at
  where w.id = p_work_order_id
    and w.shop_id = p_shop_id
    and w.estimate_revision = p_revision;

  update public.estimate_events e
  set event_type = 'sent',
      result = jsonb_build_object(
        'delivery_state', 'completed',
        'sent_at', p_sent_at,
        'quote_line_ids', to_jsonb(v_selected),
        'already_decided_count', v_decided_count
      ),
      updated_at = now()
  where e.id = v_event.id
    and e.shop_id = p_shop_id
    and e.event_type = 'send_reserved';

  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'eventId', v_event.id,
    'workOrderId', p_work_order_id, 'estimateRevision', p_revision,
    'quoteLineIds', to_jsonb(v_selected)
  );
end;
$$;

revoke all on function public.create_estimate_atomic(uuid, jsonb, jsonb, jsonb, text, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.save_estimate_draft_atomic(uuid, uuid, integer, jsonb, text, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_estimate_to_parts_atomic(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_estimate_parts_quote_atomic(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.return_estimate_to_parts_atomic(uuid, uuid, uuid[], integer, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_estimate_send_atomic(uuid, uuid, integer, text, uuid, uuid, uuid[], boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_estimate_send_atomic(uuid, uuid, integer, uuid, timestamptz, text, uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_estimate_atomic(uuid, jsonb, jsonb, jsonb, text, timestamptz, text)
  to authenticated;
grant execute on function public.save_estimate_draft_atomic(uuid, uuid, integer, jsonb, text, timestamptz, text)
  to authenticated;
grant execute on function public.submit_estimate_to_parts_atomic(uuid, uuid, integer, text)
  to authenticated;
grant execute on function public.complete_estimate_parts_quote_atomic(uuid, uuid, integer, text)
  to authenticated;
grant execute on function public.return_estimate_to_parts_atomic(uuid, uuid, uuid[], integer, text, text, text)
  to authenticated;
grant execute on function public.reserve_estimate_send_atomic(uuid, uuid, integer, text, uuid, uuid, uuid[], boolean)
  to service_role;
grant execute on function public.finalize_estimate_send_atomic(uuid, uuid, integer, uuid, timestamptz, text, uuid, uuid)
  to service_role;

comment on function public.create_estimate_atomic(uuid, jsonb, jsonb, jsonb, text, timestamptz, text) is
  'Creates one canonical pre-authorization work order, customer/vehicle when needed, and draft quote lines atomically.';
comment on function public.submit_estimate_to_parts_atomic(uuid, uuid, integer, text) is
  'Idempotently creates estimate-sourced part requests for the current revision; labor-only lines bypass Parts.';
comment on function public.complete_estimate_parts_quote_atomic(uuid, uuid, integer, text) is
  'Parts-only completion gate that validates canonical quote pricing before returning the estimate to its advisor.';
comment on function public.return_estimate_to_parts_atomic(uuid, uuid, uuid[], integer, text, text, text) is
  'Creates an audited immutable revision for selected unapproved estimate lines and reopens only those parts requests.';
comment on function public.reserve_estimate_send_atomic(uuid, uuid, integer, text, uuid, uuid, uuid[], boolean) is
  'Service-only reservation for one immutable customer delivery snapshot per estimate revision.';
comment on function public.finalize_estimate_send_atomic(uuid, uuid, integer, uuid, timestamptz, text, uuid, uuid) is
  'Service-only atomic publication of provider-accepted estimate lines and completion of the delivery ledger.';

notify pgrst, 'reload schema';

commit;
