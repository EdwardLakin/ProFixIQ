begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create table public.customer_pricing_agreements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_type text not null check (
    source_type in ('customer_specific', 'customer_contract', 'fleet_contract')
  ),
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (
    status in ('active', 'superseded', 'retired')
  ),
  currency text not null default 'CAD' check (currency in ('CAD', 'USD')),
  labor_rate numeric(12,2),
  labor_discount_percent numeric(5,2) not null default 0,
  parts_discount_percent numeric(5,2) not null default 0,
  effective_from date not null default current_date,
  effective_until date,
  approval_reason text not null check (
    length(btrim(approval_reason)) between 3 and 500
  ),
  notes text,
  operation_key text not null check (length(btrim(operation_key)) between 1 and 200),
  supersedes_agreement_id uuid references public.customer_pricing_agreements(id) on delete restrict,
  approved_by uuid not null references auth.users(id) on delete restrict,
  retired_by uuid references auth.users(id) on delete restrict,
  retired_at timestamptz,
  retired_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_pricing_agreements_labor_rate_nonnegative
    check (labor_rate is null or labor_rate >= 0),
  constraint customer_pricing_agreements_labor_discount_range
    check (labor_discount_percent between 0 and 100),
  constraint customer_pricing_agreements_parts_discount_range
    check (parts_discount_percent between 0 and 100),
  constraint customer_pricing_agreements_single_labor_strategy
    check (labor_rate is null or labor_discount_percent = 0),
  constraint customer_pricing_agreements_has_adjustment
    check (
      labor_rate is not null
      or labor_discount_percent > 0
      or parts_discount_percent > 0
    ),
  constraint customer_pricing_agreements_effective_window
    check (effective_until is null or effective_until >= effective_from),
  constraint customer_pricing_agreements_retirement_shape
    check (
      (status = 'active' and retired_at is null and retired_by is null)
      or (
        status in ('superseded', 'retired')
        and retired_at is not null
        and retired_by is not null
        and length(btrim(coalesce(retired_reason, ''))) >= 3
      )
    ),
  unique (shop_id, operation_key)
);

create index customer_pricing_agreements_customer_lookup_idx
  on public.customer_pricing_agreements (
    shop_id,
    customer_id,
    status,
    source_type,
    effective_from desc,
    created_at desc
  );

create index customer_pricing_agreements_effective_until_idx
  on public.customer_pricing_agreements (shop_id, effective_until)
  where status = 'active' and effective_until is not null;

create table public.pricing_resolution_snapshots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  quote_line_id uuid not null references public.work_order_quote_lines(id) on delete restrict,
  agreement_id uuid references public.customer_pricing_agreements(id) on delete restrict,
  supersedes_snapshot_id uuid references public.pricing_resolution_snapshots(id) on delete restrict,
  source_type text not null check (
    source_type in (
      'manual_override',
      'fleet_contract',
      'customer_contract',
      'customer_specific',
      'shop_default'
    )
  ),
  precedence_rank integer not null check (precedence_rank between 100 and 1000),
  currency text not null check (currency in ('CAD', 'USD')),
  base_labor_rate numeric(12,2) not null check (base_labor_rate >= 0),
  resolved_labor_rate numeric(12,2) not null check (resolved_labor_rate >= 0),
  labor_discount_percent numeric(5,2) not null check (
    labor_discount_percent between 0 and 100
  ),
  base_labor_total numeric(12,2) not null check (base_labor_total >= 0),
  resolved_labor_total numeric(12,2) not null check (resolved_labor_total >= 0),
  base_parts_total numeric(12,2) not null check (base_parts_total >= 0),
  resolved_parts_total numeric(12,2) not null check (resolved_parts_total >= 0),
  parts_discount_percent numeric(5,2) not null check (
    parts_discount_percent between 0 and 100
  ),
  part_prices jsonb not null default '[]'::jsonb check (
    jsonb_typeof(part_prices) = 'array'
  ),
  input_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(input_snapshot) = 'object'
  ),
  result_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(result_snapshot) = 'object'
  ),
  resolution_hash text not null check (resolution_hash ~ '^[0-9a-f]{64}$'),
  resolved_by uuid not null references auth.users(id) on delete restrict,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index pricing_resolution_snapshots_quote_line_idx
  on public.pricing_resolution_snapshots (shop_id, quote_line_id, resolved_at desc);

create index pricing_resolution_snapshots_work_order_idx
  on public.pricing_resolution_snapshots (shop_id, work_order_id, resolved_at desc);

create index pricing_resolution_snapshots_customer_idx
  on public.pricing_resolution_snapshots (shop_id, customer_id, resolved_at desc);

alter table public.work_order_quote_lines
  add column customer_pricing_snapshot_id uuid;

alter table public.work_order_quote_lines
  add constraint work_order_quote_lines_customer_pricing_snapshot_id_fkey
  foreign key (customer_pricing_snapshot_id)
  references public.pricing_resolution_snapshots(id)
  on delete restrict;

create index work_order_quote_lines_customer_pricing_snapshot_idx
  on public.work_order_quote_lines (customer_pricing_snapshot_id)
  where customer_pricing_snapshot_id is not null;

alter table public.customer_pricing_agreements enable row level security;
alter table public.pricing_resolution_snapshots enable row level security;

create policy customer_pricing_agreements_staff_select
  on public.customer_pricing_agreements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.shop_id = customer_pricing_agreements.shop_id
        and (
          profile.id = (select auth.uid())
          or profile.user_id = (select auth.uid())
        )
        and public.canonical_shop_membership_role(profile.role::text) in (
          'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
        )
    )
  );

create policy pricing_resolution_snapshots_staff_select
  on public.pricing_resolution_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.shop_id = pricing_resolution_snapshots.shop_id
        and (
          profile.id = (select auth.uid())
          or profile.user_id = (select auth.uid())
        )
        and public.canonical_shop_membership_role(profile.role::text) in (
          'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
        )
    )
  );

revoke all on table public.customer_pricing_agreements
  from public, anon, authenticated;
grant select on table public.customer_pricing_agreements to authenticated;
grant all on table public.customer_pricing_agreements to service_role;

revoke all on table public.pricing_resolution_snapshots
  from public, anon, authenticated;
grant select on table public.pricing_resolution_snapshots to authenticated;
grant all on table public.pricing_resolution_snapshots to service_role;

create or replace function private.guard_customer_pricing_agreement_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'CUSTOMER_PRICING_AGREEMENT_HISTORY_IS_APPEND_ONLY';
  end if;

  if old.status <> 'active' then
    raise exception using
      errcode = '55000',
      message = 'CUSTOMER_PRICING_AGREEMENT_TERMINAL_STATE_IS_IMMUTABLE';
  end if;

  if new.status not in ('superseded', 'retired')
     or new.shop_id is distinct from old.shop_id
     or new.customer_id is distinct from old.customer_id
     or new.source_type is distinct from old.source_type
     or new.name is distinct from old.name
     or new.currency is distinct from old.currency
     or new.labor_rate is distinct from old.labor_rate
     or new.labor_discount_percent is distinct from old.labor_discount_percent
     or new.parts_discount_percent is distinct from old.parts_discount_percent
     or new.effective_from is distinct from old.effective_from
     or new.effective_until is distinct from old.effective_until
     or new.approval_reason is distinct from old.approval_reason
     or new.notes is distinct from old.notes
     or new.operation_key is distinct from old.operation_key
     or new.supersedes_agreement_id is distinct from old.supersedes_agreement_id
     or new.approved_by is distinct from old.approved_by
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '55000',
      message = 'CUSTOMER_PRICING_AGREEMENT_TERMS_REQUIRE_A_NEW_VERSION';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_customer_pricing_agreement_history()
  from public, anon, authenticated, service_role;

create trigger guard_customer_pricing_agreement_history
before update or delete on public.customer_pricing_agreements
for each row execute function private.guard_customer_pricing_agreement_history();

create or replace function private.guard_pricing_resolution_snapshot_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'PRICING_RESOLUTION_SNAPSHOTS_ARE_IMMUTABLE';
end;
$$;

revoke all on function private.guard_pricing_resolution_snapshot_history()
  from public, anon, authenticated, service_role;

create trigger guard_pricing_resolution_snapshot_history
before update or delete on public.pricing_resolution_snapshots
for each row execute function private.guard_pricing_resolution_snapshot_history();

create or replace function public.create_customer_pricing_agreement_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_source_type text,
  p_name text,
  p_currency text,
  p_labor_rate numeric,
  p_labor_discount_percent numeric,
  p_parts_discount_percent numeric,
  p_effective_from date,
  p_effective_until date,
  p_approval_reason text,
  p_notes text,
  p_operation_key text,
  p_actor_user_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_existing public.customer_pricing_agreements%rowtype;
  v_superseded_id uuid;
  v_created public.customer_pricing_agreements%rowtype;
  v_now timestamptz := coalesce(p_at, now());
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency, 'CAD')));
  v_labor_rate numeric := case
    when p_labor_rate is null then null
    else round(p_labor_rate, 2)
  end;
  v_labor_discount numeric := round(coalesce(p_labor_discount_percent, 0), 2);
  v_parts_discount numeric := round(coalesce(p_parts_discount_percent, 0), 2);
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_actor_user_id) then
    raise exception using errcode = '42501', message = 'PRICING_ACTOR_MISMATCH';
  end if;

  select public.canonical_shop_membership_role(profile.role::text)
    into v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by case when profile.user_id = p_actor_user_id then 0 else 1 end
  limit 1;

  if coalesce(v_actor_role, '') not in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'PRICING_MANAGER_ROLE_REQUIRED';
  end if;

  select agreement.*
    into v_existing
  from public.customer_pricing_agreements agreement
  where agreement.shop_id = p_shop_id
    and agreement.operation_key = btrim(coalesce(p_operation_key, ''));

  if found then
    if v_existing.customer_id is distinct from p_customer_id
       or v_existing.source_type is distinct from v_source_type
       or v_existing.name is distinct from btrim(coalesce(p_name, ''))
       or v_existing.currency is distinct from v_currency
       or v_existing.labor_rate is distinct from v_labor_rate
       or v_existing.labor_discount_percent is distinct from v_labor_discount
       or v_existing.parts_discount_percent is distinct from v_parts_discount
       or v_existing.effective_from is distinct from coalesce(p_effective_from, v_now::date)
       or v_existing.effective_until is distinct from p_effective_until
       or v_existing.approval_reason is distinct from btrim(coalesce(p_approval_reason, '')) then
      raise exception using errcode = '22023', message = 'PRICING_OPERATION_KEY_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'agreement', to_jsonb(v_existing)
    );
  end if;

  if nullif(btrim(coalesce(p_operation_key, '')), '') is null
     or length(btrim(p_operation_key)) > 200 then
    raise exception using errcode = '22023', message = 'A valid pricing operation key is required.';
  end if;
  if v_source_type not in ('customer_specific', 'customer_contract', 'fleet_contract') then
    raise exception using errcode = '22023', message = 'Unsupported customer pricing source.';
  end if;
  if v_currency not in ('CAD', 'USD') then
    raise exception using errcode = '22023', message = 'Pricing currency must be CAD or USD.';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Agreement name is required and must be 120 characters or fewer.';
  end if;
  if length(btrim(coalesce(p_approval_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Approval reason must be between 3 and 500 characters.';
  end if;
  if v_labor_rate < 0
     or v_labor_discount not between 0 and 100
     or v_parts_discount not between 0 and 100 then
    raise exception using errcode = '22023', message = 'Pricing values are outside the supported range.';
  end if;
  if v_labor_rate is not null and v_labor_discount > 0 then
    raise exception using errcode = '22023', message = 'Choose a fixed labor rate or a labor discount, not both.';
  end if;
  if v_labor_rate is null and v_labor_discount = 0 and v_parts_discount = 0 then
    raise exception using errcode = '22023', message = 'At least one customer pricing adjustment is required.';
  end if;
  if p_effective_until is not null
     and p_effective_until < coalesce(p_effective_from, v_now::date) then
    raise exception using errcode = '22023', message = 'Agreement end date cannot be before its start date.';
  end if;
  if not exists (
    select 1
    from public.customers customer
    where customer.id = p_customer_id
      and customer.shop_id = p_shop_id
      and coalesce(customer.active, true)
  ) then
    raise exception using errcode = 'P0002', message = 'Customer account not found for shop.';
  end if;
  if v_source_type = 'fleet_contract'
     and not exists (
       select 1
       from public.fleets fleet
       where fleet.shop_id = p_shop_id
         and fleet.customer_id = p_customer_id
         and coalesce(fleet.active, true)
     ) then
    raise exception using errcode = '23514', message = 'Fleet contract pricing requires a linked active Fleet account.';
  end if;

  select agreement.id
    into v_superseded_id
  from public.customer_pricing_agreements agreement
  where agreement.shop_id = p_shop_id
    and agreement.customer_id = p_customer_id
    and agreement.status = 'active'
    and (
      agreement.source_type = v_source_type
      or (
        agreement.source_type in ('customer_contract', 'fleet_contract')
        and v_source_type in ('customer_contract', 'fleet_contract')
      )
    )
  order by agreement.effective_from desc, agreement.created_at desc, agreement.id desc
  limit 1
  for update;

  update public.customer_pricing_agreements agreement
  set status = 'superseded',
      retired_by = p_actor_user_id,
      retired_at = v_now,
      retired_reason = 'Superseded by a newer pricing agreement.',
      updated_at = v_now
  where agreement.shop_id = p_shop_id
    and agreement.customer_id = p_customer_id
    and agreement.status = 'active'
    and (
      agreement.source_type = v_source_type
      or (
        agreement.source_type in ('customer_contract', 'fleet_contract')
        and v_source_type in ('customer_contract', 'fleet_contract')
      )
    );

  insert into public.customer_pricing_agreements (
    shop_id,
    customer_id,
    source_type,
    name,
    status,
    currency,
    labor_rate,
    labor_discount_percent,
    parts_discount_percent,
    effective_from,
    effective_until,
    approval_reason,
    notes,
    operation_key,
    supersedes_agreement_id,
    approved_by,
    created_by,
    created_at,
    updated_at
  ) values (
    p_shop_id,
    p_customer_id,
    v_source_type,
    btrim(p_name),
    'active',
    v_currency,
    v_labor_rate,
    v_labor_discount,
    v_parts_discount,
    coalesce(p_effective_from, v_now::date),
    p_effective_until,
    btrim(p_approval_reason),
    nullif(btrim(coalesce(p_notes, '')), ''),
    btrim(p_operation_key),
    v_superseded_id,
    p_actor_user_id,
    p_actor_user_id,
    v_now,
    v_now
  )
  returning * into v_created;

  insert into public.operational_events (
    shop_id,
    event_type,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    source,
    idempotency_key,
    metadata
  ) values (
    p_shop_id,
    'customer_pricing.agreement_created',
    p_actor_user_id,
    v_actor_role,
    'customer_pricing_agreement',
    v_created.id,
    'customer_pricing_engine',
    'customer-pricing-agreement:' || btrim(p_operation_key),
    jsonb_build_object(
      'customer_id', p_customer_id,
      'source_type', v_source_type,
      'supersedes_agreement_id', v_superseded_id,
      'effective_from', v_created.effective_from,
      'effective_until', v_created.effective_until
    )
  )
  on conflict (shop_id, idempotency_key) where idempotency_key is not null
  do nothing;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'agreement', to_jsonb(v_created)
  );
end;
$$;

revoke all on function public.create_customer_pricing_agreement_atomic(
  uuid, uuid, text, text, text, numeric, numeric, numeric, date, date,
  text, text, text, uuid, timestamptz
) from public, anon;
grant execute on function public.create_customer_pricing_agreement_atomic(
  uuid, uuid, text, text, text, numeric, numeric, numeric, date, date,
  text, text, text, uuid, timestamptz
) to authenticated, service_role;

create or replace function public.retire_customer_pricing_agreement_atomic(
  p_shop_id uuid,
  p_agreement_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_agreement public.customer_pricing_agreements%rowtype;
  v_now timestamptz := coalesce(p_at, now());
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_actor_user_id) then
    raise exception using errcode = '42501', message = 'PRICING_ACTOR_MISMATCH';
  end if;

  select public.canonical_shop_membership_role(profile.role::text)
    into v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by case when profile.user_id = p_actor_user_id then 0 else 1 end
  limit 1;

  if coalesce(v_actor_role, '') not in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'PRICING_MANAGER_ROLE_REQUIRED';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Retirement reason must be between 3 and 500 characters.';
  end if;

  select agreement.*
    into v_agreement
  from public.customer_pricing_agreements agreement
  where agreement.id = p_agreement_id
    and agreement.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pricing agreement not found for shop.';
  end if;
  if v_agreement.status <> 'active' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'agreement', to_jsonb(v_agreement)
    );
  end if;

  update public.customer_pricing_agreements
  set status = 'retired',
      retired_by = p_actor_user_id,
      retired_at = v_now,
      retired_reason = btrim(p_reason),
      updated_at = v_now
  where id = p_agreement_id
    and shop_id = p_shop_id
  returning * into v_agreement;

  insert into public.operational_events (
    shop_id,
    event_type,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    source,
    metadata
  ) values (
    p_shop_id,
    'customer_pricing.agreement_retired',
    p_actor_user_id,
    v_actor_role,
    'customer_pricing_agreement',
    p_agreement_id,
    'customer_pricing_engine',
    jsonb_build_object(
      'customer_id', v_agreement.customer_id,
      'reason', btrim(p_reason)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'agreement', to_jsonb(v_agreement)
  );
end;
$$;

revoke all on function public.retire_customer_pricing_agreement_atomic(
  uuid, uuid, uuid, text, timestamptz
) from public, anon;
grant execute on function public.retire_customer_pricing_agreement_atomic(
  uuid, uuid, uuid, text, timestamptz
) to authenticated, service_role;

create or replace function public.get_customer_pricing_account_summary(
  p_shop_id uuid,
  p_customer_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_role text;
  v_customer public.customers%rowtype;
  v_effective public.customer_pricing_agreements%rowtype;
  v_agreements jsonb := '[]'::jsonb;
  v_has_fleet boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select public.canonical_shop_membership_role(profile.role::text)
    into v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = (select auth.uid())
      or profile.user_id = (select auth.uid())
    )
  order by case when profile.user_id = (select auth.uid()) then 0 else 1 end
  limit 1;

  if coalesce(v_actor_role, '') not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'Customer pricing access denied.';
  end if;

  select customer.*
    into v_customer
  from public.customers customer
  where customer.id = p_customer_id
    and customer.shop_id = p_shop_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Customer account not found for shop.';
  end if;

  select exists (
    select 1
    from public.fleets fleet
    where fleet.shop_id = p_shop_id
      and fleet.customer_id = p_customer_id
      and coalesce(fleet.active, true)
  ) into v_has_fleet;

  select coalesce(
    jsonb_agg(to_jsonb(agreement) order by
      case agreement.status when 'active' then 0 else 1 end,
      agreement.effective_from desc,
      agreement.created_at desc,
      agreement.id desc
    ),
    '[]'::jsonb
  )
  into v_agreements
  from public.customer_pricing_agreements agreement
  where agreement.shop_id = p_shop_id
    and agreement.customer_id = p_customer_id;

  select agreement.*
    into v_effective
  from public.customer_pricing_agreements agreement
  where agreement.shop_id = p_shop_id
    and agreement.customer_id = p_customer_id
    and agreement.status = 'active'
    and agreement.effective_from <= coalesce(p_at, now())::date
    and (
      agreement.effective_until is null
      or agreement.effective_until >= coalesce(p_at, now())::date
    )
  order by
    case agreement.source_type
      when 'fleet_contract' then 800
      when 'customer_contract' then 800
      when 'customer_specific' then 700
      else 100
    end desc,
    agreement.effective_from desc,
    agreement.created_at desc,
    agreement.id desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'customer_id', p_customer_id,
    'account_type', v_customer.account_type,
    'is_fleet', coalesce(v_customer.is_fleet, false),
    'has_linked_fleet', v_has_fleet,
    'can_manage', v_actor_role in ('owner', 'admin', 'manager'),
    'precedence', jsonb_build_array(
      'manual_override',
      'fleet_or_customer_contract',
      'customer_specific',
      'shop_default'
    ),
    'effective_agreement', case
      when v_effective.id is null then null
      else to_jsonb(v_effective)
    end,
    'agreements', v_agreements
  );
end;
$$;

revoke all on function public.get_customer_pricing_account_summary(
  uuid, uuid, timestamptz
) from public, anon;
grant execute on function public.get_customer_pricing_account_summary(
  uuid, uuid, timestamptz
) to authenticated, service_role;

create or replace function public.apply_customer_pricing_to_quote_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_actor_user_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_agreement public.customer_pricing_agreements%rowtype;
  v_line public.work_order_quote_lines%rowtype;
  v_previous public.pricing_resolution_snapshots%rowtype;
  v_item public.part_request_items%rowtype;
  v_snapshot public.pricing_resolution_snapshots%rowtype;
  v_now timestamptz := coalesce(p_at, now());
  v_shop_labor_rate numeric := 0;
  v_currency text := 'CAD';
  v_source_type text;
  v_precedence_rank integer;
  v_labor_discount numeric := 0;
  v_parts_discount numeric := 0;
  v_current_labor_rate numeric := 0;
  v_base_labor_rate numeric := 0;
  v_resolved_labor_rate numeric := 0;
  v_labor_hours numeric := 0;
  v_base_labor_total numeric := 0;
  v_resolved_labor_total numeric := 0;
  v_current_sell numeric;
  v_base_sell numeric;
  v_resolved_sell numeric;
  v_qty numeric;
  v_previous_part jsonb;
  v_part_prices jsonb;
  v_base_parts_total numeric;
  v_resolved_parts_total numeric;
  v_line_metadata jsonb;
  v_input_snapshot jsonb;
  v_result_snapshot jsonb;
  v_resolution_hash text;
  v_changed boolean;
  v_item_count integer;
  v_applied jsonb := '[]'::jsonb;
  v_unchanged jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_actor_user_id) then
    raise exception using errcode = '42501', message = 'PRICING_ACTOR_MISMATCH';
  end if;

  select public.canonical_shop_membership_role(profile.role::text)
    into v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by case when profile.user_id = p_actor_user_id then 0 else 1 end
  limit 1;

  if coalesce(v_actor_role, '') not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'QUOTE_PRICING_ROLE_REQUIRED';
  end if;

  select work_order.*
    into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Work order not found for shop.';
  end if;
  if v_work_order.customer_id is null then
    return jsonb_build_object(
      'ok', true,
      'agreement', null,
      'applied', v_applied,
      'unchanged', v_unchanged,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'no_customer'))
    );
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = '55000', message = 'FINANCIALLY_LOCKED: customer pricing cannot change after invoice finalization.';
  end if;

  if coalesce(cardinality(p_quote_line_ids), 0) > 0
     and (
       select count(distinct quote_line.id)
       from public.work_order_quote_lines quote_line
       where quote_line.shop_id = p_shop_id
         and quote_line.work_order_id = p_work_order_id
         and quote_line.id = any(p_quote_line_ids)
     ) <> (
       select count(distinct requested.id)
       from unnest(p_quote_line_ids) requested(id)
       where requested.id is not null
     ) then
    raise exception using errcode = 'P0002', message = 'One or more quote lines were not found for this work order.';
  end if;

  select
    coalesce(shop.labor_rate, 0),
    case when upper(coalesce(shop.country, 'CA')) in ('US', 'USA') then 'USD' else 'CAD' end
  into v_shop_labor_rate, v_currency
  from public.shops shop
  where shop.id = p_shop_id;

  select agreement.*
    into v_agreement
  from public.customer_pricing_agreements agreement
  where agreement.shop_id = p_shop_id
    and agreement.customer_id = v_work_order.customer_id
    and agreement.status = 'active'
    and agreement.effective_from <= v_now::date
    and (agreement.effective_until is null or agreement.effective_until >= v_now::date)
  order by
    case agreement.source_type
      when 'fleet_contract' then 800
      when 'customer_contract' then 800
      when 'customer_specific' then 700
      else 100
    end desc,
    agreement.effective_from desc,
    agreement.created_at desc,
    agreement.id desc
  limit 1;

  if found then
    v_source_type := v_agreement.source_type;
    v_precedence_rank := case v_agreement.source_type
      when 'fleet_contract' then 800
      when 'customer_contract' then 800
      when 'customer_specific' then 700
      else 100
    end;
    v_labor_discount := v_agreement.labor_discount_percent;
    v_parts_discount := v_agreement.parts_discount_percent;
    v_currency := v_agreement.currency;
  else
    v_agreement := null;
    v_source_type := 'shop_default';
    v_precedence_rank := 100;
    v_labor_discount := 0;
    v_parts_discount := 0;
  end if;

  for v_line in
    select quote_line.*
    from public.work_order_quote_lines quote_line
    where quote_line.shop_id = p_shop_id
      and quote_line.work_order_id = p_work_order_id
      and (
        coalesce(cardinality(p_quote_line_ids), 0) = 0
        or quote_line.id = any(p_quote_line_ids)
      )
    order by quote_line.created_at, quote_line.id
    for update
  loop
    if public.quote_line_pricing_is_protected(
      v_line.status::text,
      v_line.stage::text,
      v_line.sent_to_customer_at,
      v_line.sent_at,
      v_line.approved_at,
      v_line.declined_at,
      v_line.deferred_at,
      v_line.converted_at,
      v_line.work_order_line_id
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'quote_line_id', v_line.id,
        'reason', 'protected_quote_line_state'
      ));
      continue;
    end if;

    v_previous := null;
    if v_line.customer_pricing_snapshot_id is not null then
      select snapshot.*
        into v_previous
      from public.pricing_resolution_snapshots snapshot
      where snapshot.id = v_line.customer_pricing_snapshot_id
        and snapshot.shop_id = p_shop_id
        and snapshot.quote_line_id = v_line.id;
    end if;

    if v_agreement.id is null and v_previous.id is null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'quote_line_id', v_line.id,
        'reason', 'shop_default_already_applies'
      ));
      continue;
    end if;

    v_line_metadata := case
      when jsonb_typeof(v_line.metadata) = 'object' then v_line.metadata
      else '{}'::jsonb
    end;
    v_current_labor_rate := coalesce(
      v_line.labor_rate,
      case
        when coalesce(v_line_metadata ->> 'labor_rate', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (v_line_metadata ->> 'labor_rate')::numeric
        else null
      end,
      v_shop_labor_rate,
      0
    );
    v_base_labor_rate := case
      when v_previous.id is not null
        and round(v_current_labor_rate, 2) = v_previous.resolved_labor_rate
        then v_previous.base_labor_rate
      else round(v_current_labor_rate, 2)
    end;
    v_resolved_labor_rate := case
      when v_agreement.id is not null and v_agreement.labor_rate is not null
        then v_agreement.labor_rate
      else round(v_base_labor_rate * (1 - v_labor_discount / 100), 2)
    end;
    v_labor_hours := greatest(
      coalesce(v_line.labor_hours, 0),
      coalesce(v_line.est_labor_hours, 0),
      0
    );
    v_base_labor_total := round(v_labor_hours * v_base_labor_rate, 2);
    v_resolved_labor_total := round(v_labor_hours * v_resolved_labor_rate, 2);
    v_base_parts_total := 0;
    v_resolved_parts_total := 0;
    v_part_prices := '[]'::jsonb;
    v_item_count := 0;
    v_changed := round(v_current_labor_rate, 2) is distinct from v_resolved_labor_rate
      or round(coalesce(v_line.labor_total, 0), 2) is distinct from v_resolved_labor_total;

    for v_item in
      select item.*
      from public.part_request_items item
      join public.part_requests request on request.id = item.request_id
      where item.shop_id = p_shop_id
        and item.work_order_id = p_work_order_id
        and item.quote_line_id = v_line.id
        and request.shop_id = item.shop_id
        and lower(coalesce(request.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
        and lower(coalesce(item.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
      order by request.created_at, request.id, item.id
      for update of item
    loop
      v_qty := greatest(
        coalesce(v_item.qty, 0),
        coalesce(v_item.qty_requested, 0),
        coalesce(v_item.qty_approved, 0),
        0
      );
      v_current_sell := case
        when v_item.quoted_price is not null and v_item.quoted_price >= 0
          then v_item.quoted_price
        when v_item.unit_price is not null and v_item.unit_price >= 0
          then v_item.unit_price
        else null
      end;

      if v_qty <= 0 or v_current_sell is null then
        continue;
      end if;

      v_previous_part := null;
      if v_previous.id is not null then
        select part.value
          into v_previous_part
        from jsonb_array_elements(v_previous.part_prices) part(value)
        where part.value ->> 'request_item_id' = v_item.id::text
        limit 1;
      end if;

      v_base_sell := case
        when v_previous_part is not null
          and coalesce(v_previous_part ->> 'resolved_unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
          and round(v_current_sell, 2) = (v_previous_part ->> 'resolved_unit_price')::numeric
          and coalesce(v_previous_part ->> 'base_unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (v_previous_part ->> 'base_unit_price')::numeric
        else round(v_current_sell, 2)
      end;
      v_resolved_sell := round(v_base_sell * (1 - v_parts_discount / 100), 2);

      if round(v_current_sell, 2) is distinct from v_resolved_sell then
        if v_item.work_order_line_id is not null
           or coalesce(v_item.qty_ordered, 0) > 0
           or coalesce(v_item.qty_received, 0) > 0
           or coalesce(v_item.qty_reserved, 0) > 0
           or coalesce(v_item.qty_consumed, 0) > 0
           or coalesce(v_item.qty_returned, 0) > 0
           or v_item.po_id is not null then
          raise exception using
            errcode = '55000',
            message = 'CUSTOMER_PRICING_PART_LIFECYCLE_LOCKED',
            detail = format('Part request item %s has operational activity.', v_item.id);
        end if;

        update public.part_request_items
        set quoted_price = v_resolved_sell,
            unit_price = v_resolved_sell,
            updated_at = v_now
        where id = v_item.id
          and shop_id = p_shop_id;
        v_changed := true;
      end if;

      v_base_parts_total := round(v_base_parts_total + v_qty * v_base_sell, 2);
      v_resolved_parts_total := round(
        v_resolved_parts_total + v_qty * v_resolved_sell,
        2
      );
      v_item_count := v_item_count + 1;
      v_part_prices := v_part_prices || jsonb_build_array(jsonb_build_object(
        'request_item_id', v_item.id,
        'request_id', v_item.request_id,
        'description', v_item.description,
        'quantity', v_qty,
        'base_unit_price', v_base_sell,
        'resolved_unit_price', v_resolved_sell,
        'base_line_total', round(v_qty * v_base_sell, 2),
        'resolved_line_total', round(v_qty * v_resolved_sell, 2)
      ));
    end loop;

    if v_item_count = 0 then
      v_base_parts_total := case
        when v_previous.id is not null
          and round(coalesce(v_line.parts_total, 0), 2) = v_previous.resolved_parts_total
          then v_previous.base_parts_total
        else round(coalesce(v_line.parts_total, 0), 2)
      end;
      v_resolved_parts_total := round(
        v_base_parts_total * (1 - v_parts_discount / 100),
        2
      );
      if v_base_parts_total > 0 and v_parts_discount > 0 then
        raise exception using
          errcode = '55000',
          message = 'CUSTOMER_PRICING_REQUIRES_CANONICAL_PART_ITEMS',
          detail = format(
            'Quote line %s has an aggregate parts total without canonical request-item sell prices.',
            v_line.id
          );
      end if;
      v_changed := v_changed
        or round(coalesce(v_line.parts_total, 0), 2) is distinct from v_resolved_parts_total;
    end if;

    if v_previous.id is not null
       and v_previous.agreement_id is not distinct from v_agreement.id
       and v_previous.source_type = v_source_type
       and v_previous.precedence_rank = v_precedence_rank
       and v_previous.currency = v_currency
       and v_previous.base_labor_rate = v_base_labor_rate
       and v_previous.resolved_labor_rate = v_resolved_labor_rate
       and v_previous.labor_discount_percent = v_labor_discount
       and v_previous.base_labor_total = v_base_labor_total
       and v_previous.resolved_labor_total = v_resolved_labor_total
       and v_previous.base_parts_total = v_base_parts_total
       and v_previous.resolved_parts_total = v_resolved_parts_total
       and v_previous.parts_discount_percent = v_parts_discount
       and v_previous.part_prices = v_part_prices
       and not v_changed then
      v_unchanged := v_unchanged || jsonb_build_array(jsonb_build_object(
        'quote_line_id', v_line.id,
        'snapshot_id', v_previous.id,
        'source_type', v_source_type
      ));
      continue;
    end if;

    v_line_metadata := jsonb_set(
      v_line_metadata,
      '{labor_rate}',
      to_jsonb(v_resolved_labor_rate),
      true
    );
    v_line_metadata := jsonb_set(
      v_line_metadata,
      '{customer_pricing}',
      jsonb_strip_nulls(jsonb_build_object(
        'agreement_id', v_agreement.id,
        'agreement_name', v_agreement.name,
        'source_type', v_source_type,
        'precedence_rank', v_precedence_rank,
        'currency', v_currency,
        'base_labor_rate', v_base_labor_rate,
        'resolved_labor_rate', v_resolved_labor_rate,
        'labor_discount_percent', v_labor_discount,
        'base_parts_total', v_base_parts_total,
        'resolved_parts_total', v_resolved_parts_total,
        'parts_discount_percent', v_parts_discount,
        'resolved_at', v_now,
        'resolved_by', p_actor_user_id
      )),
      true
    );

    update public.work_order_quote_lines
    set labor_rate = v_resolved_labor_rate,
        labor_total = v_resolved_labor_total,
        parts_total = v_resolved_parts_total,
        subtotal = round(v_resolved_labor_total + v_resolved_parts_total, 2),
        grand_total = round(
          v_resolved_labor_total
          + v_resolved_parts_total
          + coalesce(v_line.tax_total, 0),
          2
        ),
        metadata = v_line_metadata,
        updated_at = v_now
    where id = v_line.id
      and shop_id = p_shop_id;

    if v_item_count > 0 then
      perform public.sync_quote_line_pricing_from_parts(p_shop_id, v_line.id);
    end if;

    select quote_line.*
      into v_line
    from public.work_order_quote_lines quote_line
    where quote_line.id = v_line.id
      and quote_line.shop_id = p_shop_id;

    v_input_snapshot := jsonb_build_object(
      'shop_id', p_shop_id,
      'customer_id', v_work_order.customer_id,
      'work_order_id', p_work_order_id,
      'quote_line_id', v_line.id,
      'agreement_id', v_agreement.id,
      'source_type', v_source_type,
      'labor_hours', v_labor_hours,
      'base_labor_rate', v_base_labor_rate,
      'base_parts_total', v_base_parts_total,
      'part_prices', v_part_prices
    );
    v_result_snapshot := jsonb_build_object(
      'resolved_labor_rate', v_resolved_labor_rate,
      'resolved_labor_total', v_resolved_labor_total,
      'resolved_parts_total', v_resolved_parts_total,
      'subtotal', round(v_resolved_labor_total + v_resolved_parts_total, 2),
      'grand_total', v_line.grand_total,
      'labor_discount_percent', v_labor_discount,
      'parts_discount_percent', v_parts_discount,
      'precedence_rank', v_precedence_rank
    );
    v_resolution_hash := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'input', v_input_snapshot,
            'result', v_result_snapshot,
            'currency', v_currency
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.pricing_resolution_snapshots (
      shop_id,
      customer_id,
      work_order_id,
      quote_line_id,
      agreement_id,
      supersedes_snapshot_id,
      source_type,
      precedence_rank,
      currency,
      base_labor_rate,
      resolved_labor_rate,
      labor_discount_percent,
      base_labor_total,
      resolved_labor_total,
      base_parts_total,
      resolved_parts_total,
      parts_discount_percent,
      part_prices,
      input_snapshot,
      result_snapshot,
      resolution_hash,
      resolved_by,
      resolved_at,
      created_at
    ) values (
      p_shop_id,
      v_work_order.customer_id,
      p_work_order_id,
      v_line.id,
      v_agreement.id,
      v_previous.id,
      v_source_type,
      v_precedence_rank,
      v_currency,
      v_base_labor_rate,
      v_resolved_labor_rate,
      v_labor_discount,
      v_base_labor_total,
      v_resolved_labor_total,
      v_base_parts_total,
      v_resolved_parts_total,
      v_parts_discount,
      v_part_prices,
      v_input_snapshot,
      v_result_snapshot,
      v_resolution_hash,
      p_actor_user_id,
      v_now,
      v_now
    )
    returning * into v_snapshot;

    update public.work_order_quote_lines
    set customer_pricing_snapshot_id = v_snapshot.id,
        metadata = jsonb_set(
          metadata,
          '{customer_pricing,snapshot_id}',
          to_jsonb(v_snapshot.id),
          true
        ),
        updated_at = v_now
    where id = v_line.id
      and shop_id = p_shop_id;

    v_applied := v_applied || jsonb_build_array(jsonb_build_object(
      'quote_line_id', v_line.id,
      'snapshot_id', v_snapshot.id,
      'agreement_id', v_agreement.id,
      'source_type', v_source_type,
      'base_labor_rate', v_base_labor_rate,
      'resolved_labor_rate', v_resolved_labor_rate,
      'base_parts_total', v_base_parts_total,
      'resolved_parts_total', v_resolved_parts_total
    ));
  end loop;

  insert into public.operational_events (
    shop_id,
    event_type,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    source,
    metadata
  )
  select
    p_shop_id,
    'customer_pricing.resolved',
    p_actor_user_id,
    v_actor_role,
    'work_order',
    p_work_order_id,
    'customer_pricing_engine',
    jsonb_build_object(
      'customer_id', v_work_order.customer_id,
      'agreement_id', v_agreement.id,
      'source_type', v_source_type,
      'applied', v_applied,
      'unchanged', v_unchanged,
      'skipped', v_skipped
    )
  where jsonb_array_length(v_applied) > 0;

  return jsonb_build_object(
    'ok', true,
    'agreement', case
      when v_agreement.id is null then null
      else to_jsonb(v_agreement)
    end,
    'source_type', v_source_type,
    'precedence_rank', v_precedence_rank,
    'applied', v_applied,
    'unchanged', v_unchanged,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.apply_customer_pricing_to_quote_atomic(
  uuid, uuid, uuid[], uuid, timestamptz
) from public, anon;
grant execute on function public.apply_customer_pricing_to_quote_atomic(
  uuid, uuid, uuid[], uuid, timestamptz
) to authenticated, service_role;

comment on table public.customer_pricing_agreements is
  'Shop-owned, versioned pricing terms for customer and Fleet accounts. Terms are replaced by creating a new version, never edited in place.';

comment on table public.pricing_resolution_snapshots is
  'Immutable quote pricing provenance. Each row records the fixed-precedence winner, base values, and customer-facing resolved values.';

comment on function public.apply_customer_pricing_to_quote_atomic(
  uuid, uuid, uuid[], uuid, timestamptz
) is
  'Applies the fixed customer pricing precedence to editable quote lines and canonical part sell prices, then records immutable resolution snapshots.';

notify pgrst, 'reload schema';

commit;
