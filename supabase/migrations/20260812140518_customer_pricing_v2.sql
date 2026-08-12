begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

alter table public.customer_pricing_agreements
  add column parts_markup_matrix jsonb not null default '[]'::jsonb,
  add column minimum_parts_margin_percent numeric(5,2) not null default 0,
  add column customer_fee_type text not null default 'none',
  add column customer_fee_value numeric(12,2) not null default 0,
  add column customer_fee_cap numeric(12,2),
  add column expiry_warning_days integer not null default 30;

alter table public.customer_pricing_agreements
  add constraint customer_pricing_agreements_parts_markup_matrix_array
    check (jsonb_typeof(parts_markup_matrix) = 'array'),
  add constraint customer_pricing_agreements_minimum_parts_margin_range
    check (minimum_parts_margin_percent between 0 and 99.99),
  add constraint customer_pricing_agreements_customer_fee_type_check
    check (customer_fee_type in ('none', 'flat', 'percentage')),
  add constraint customer_pricing_agreements_customer_fee_value_check
    check (
      customer_fee_value >= 0
      and (customer_fee_type <> 'percentage' or customer_fee_value <= 100)
      and (customer_fee_type <> 'none' or customer_fee_value = 0)
    ),
  add constraint customer_pricing_agreements_customer_fee_cap_check
    check (customer_fee_cap is null or customer_fee_cap >= 0),
  add constraint customer_pricing_agreements_expiry_warning_days_check
    check (expiry_warning_days between 0 and 365);

alter table public.customer_pricing_agreements
  drop constraint customer_pricing_agreements_has_adjustment,
  add constraint customer_pricing_agreements_has_adjustment
    check (
      labor_rate is not null
      or labor_discount_percent > 0
      or parts_discount_percent > 0
      or jsonb_array_length(parts_markup_matrix) > 0
      or minimum_parts_margin_percent > 0
      or customer_fee_type <> 'none'
    );

alter table public.work_orders
  add column customer_pricing_fee_agreement_id uuid
    references public.customer_pricing_agreements(id) on delete restrict,
  add column customer_pricing_fee_total numeric(12,2),
  add column customer_pricing_fee_resolved_at timestamptz;

alter table public.work_orders
  add constraint work_orders_customer_pricing_fee_total_nonnegative
    check (customer_pricing_fee_total is null or customer_pricing_fee_total >= 0);

create index work_orders_customer_pricing_fee_agreement_idx
  on public.work_orders (customer_pricing_fee_agreement_id)
  where customer_pricing_fee_agreement_id is not null;

create or replace function private.valid_parts_markup_matrix(p_matrix jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  with tiers as (
    select
      entry.ordinality,
      case when entry.value ->> 'cost_from' ~ '^[0-9]+([.][0-9]+)?$'
        then (entry.value ->> 'cost_from')::numeric end as cost_from,
      case when entry.value ->> 'cost_to' ~ '^[0-9]+([.][0-9]+)?$'
        then (entry.value ->> 'cost_to')::numeric end as cost_to,
      case when entry.value ->> 'markup_percent' ~ '^[0-9]+([.][0-9]+)?$'
        then (entry.value ->> 'markup_percent')::numeric end as markup_percent,
      entry.value ? 'cost_to' and entry.value -> 'cost_to' <> 'null'::jsonb as has_cost_to,
      lag(case when entry.value ->> 'cost_to' ~ '^[0-9]+([.][0-9]+)?$'
        then (entry.value ->> 'cost_to')::numeric end)
        over (order by entry.ordinality) as previous_cost_to,
      count(*) over () as tier_count
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_matrix, '[]'::jsonb)) = 'array'
          then coalesce(p_matrix, '[]'::jsonb)
        else '[]'::jsonb
      end
    )
      with ordinality entry(value, ordinality)
  )
  select
    jsonb_typeof(coalesce(p_matrix, '[]'::jsonb)) = 'array'
    and jsonb_array_length(
      case
        when jsonb_typeof(coalesce(p_matrix, '[]'::jsonb)) = 'array'
          then coalesce(p_matrix, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) <= 50
    and not exists (
      select 1
      from tiers tier
      where tier.cost_from is null
        or tier.cost_from < 0
        or tier.markup_percent is null
        or tier.markup_percent < 0
        or tier.markup_percent > 1000
        or (tier.has_cost_to and (tier.cost_to is null or tier.cost_to < tier.cost_from))
        or (tier.ordinality = 1 and tier.cost_from <> 0)
        or (tier.ordinality > 1 and (
          tier.previous_cost_to is null or tier.cost_from <= tier.previous_cost_to
        ))
        or (tier.ordinality < tier.tier_count and not tier.has_cost_to)
    );
$$;

create or replace function private.parts_matrix_markup_for_cost(
  p_matrix jsonb,
  p_unit_cost numeric
)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select (tier.value ->> 'markup_percent')::numeric
  from jsonb_array_elements(coalesce(p_matrix, '[]'::jsonb))
    with ordinality tier(value, ordinality)
  where p_unit_cost >= (tier.value ->> 'cost_from')::numeric
    and (
      not (tier.value ? 'cost_to')
      or tier.value -> 'cost_to' = 'null'::jsonb
      or p_unit_cost <= (tier.value ->> 'cost_to')::numeric
    )
  order by tier.ordinality
  limit 1;
$$;

revoke all on function private.valid_parts_markup_matrix(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.parts_matrix_markup_for_cost(jsonb, numeric)
  from public, anon, authenticated, service_role;

create or replace function private.guard_customer_pricing_agreement_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'CUSTOMER_PRICING_AGREEMENT_HISTORY_IS_APPEND_ONLY';
  end if;

  if old.status <> 'active' then
    raise exception using errcode = '55000',
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
     or new.parts_markup_matrix is distinct from old.parts_markup_matrix
     or new.minimum_parts_margin_percent is distinct from old.minimum_parts_margin_percent
     or new.customer_fee_type is distinct from old.customer_fee_type
     or new.customer_fee_value is distinct from old.customer_fee_value
     or new.customer_fee_cap is distinct from old.customer_fee_cap
     or new.expiry_warning_days is distinct from old.expiry_warning_days
     or new.effective_from is distinct from old.effective_from
     or new.effective_until is distinct from old.effective_until
     or new.approval_reason is distinct from old.approval_reason
     or new.notes is distinct from old.notes
     or new.operation_key is distinct from old.operation_key
     or new.supersedes_agreement_id is distinct from old.supersedes_agreement_id
     or new.approved_by is distinct from old.approved_by
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '55000',
      message = 'CUSTOMER_PRICING_AGREEMENT_TERMS_REQUIRE_A_NEW_VERSION';
  end if;

  return new;
end;
$$;

create or replace function public.create_customer_pricing_agreement_v2_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_source_type text,
  p_name text,
  p_currency text,
  p_labor_rate numeric,
  p_labor_discount_percent numeric,
  p_parts_discount_percent numeric,
  p_parts_markup_matrix jsonb,
  p_minimum_parts_margin_percent numeric,
  p_customer_fee_type text,
  p_customer_fee_value numeric,
  p_customer_fee_cap numeric,
  p_expiry_warning_days integer,
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
  v_labor_rate numeric := case when p_labor_rate is null then null else round(p_labor_rate, 2) end;
  v_labor_discount numeric := round(coalesce(p_labor_discount_percent, 0), 2);
  v_parts_discount numeric := round(coalesce(p_parts_discount_percent, 0), 2);
  v_matrix jsonb := coalesce(p_parts_markup_matrix, '[]'::jsonb);
  v_minimum_margin numeric := round(coalesce(p_minimum_parts_margin_percent, 0), 2);
  v_fee_type text := lower(btrim(coalesce(p_customer_fee_type, 'none')));
  v_fee_value numeric := round(coalesce(p_customer_fee_value, 0), 2);
  v_fee_cap numeric := case when p_customer_fee_cap is null then null else round(p_customer_fee_cap, 2) end;
  v_warning_days integer := coalesce(p_expiry_warning_days, 30);
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

  select agreement.* into v_existing
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
       or v_existing.parts_markup_matrix is distinct from v_matrix
       or v_existing.minimum_parts_margin_percent is distinct from v_minimum_margin
       or v_existing.customer_fee_type is distinct from v_fee_type
       or v_existing.customer_fee_value is distinct from v_fee_value
       or v_existing.customer_fee_cap is distinct from v_fee_cap
       or v_existing.expiry_warning_days is distinct from v_warning_days
       or v_existing.effective_from is distinct from coalesce(p_effective_from, v_now::date)
       or v_existing.effective_until is distinct from p_effective_until
       or v_existing.approval_reason is distinct from btrim(coalesce(p_approval_reason, '')) then
      raise exception using errcode = '22023', message = 'PRICING_OPERATION_KEY_CONFLICT';
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'agreement', to_jsonb(v_existing));
  end if;

  if nullif(btrim(coalesce(p_operation_key, '')), '') is null or length(btrim(p_operation_key)) > 200 then
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
  if v_labor_rate < 0 or v_labor_discount not between 0 and 100
     or v_parts_discount not between 0 and 100
     or v_minimum_margin not between 0 and 99.99 then
    raise exception using errcode = '22023', message = 'Pricing values are outside the supported range.';
  end if;
  if v_labor_rate is not null and v_labor_discount > 0 then
    raise exception using errcode = '22023', message = 'Choose a fixed labor rate or a labor discount, not both.';
  end if;
  if not private.valid_parts_markup_matrix(v_matrix) then
    raise exception using errcode = '22023', message = 'Parts matrix tiers are invalid, overlapping, or out of order.';
  end if;
  if v_fee_type not in ('none', 'flat', 'percentage')
     or v_fee_value < 0
     or (v_fee_type = 'percentage' and v_fee_value > 100)
     or (v_fee_type = 'none' and v_fee_value <> 0)
     or v_fee_cap < 0 then
    raise exception using errcode = '22023', message = 'Customer fee settings are invalid.';
  end if;
  if v_warning_days not between 0 and 365 then
    raise exception using errcode = '22023', message = 'Expiry warning days must be between 0 and 365.';
  end if;
  if v_labor_rate is null and v_labor_discount = 0 and v_parts_discount = 0
     and jsonb_array_length(v_matrix) = 0 and v_minimum_margin = 0 and v_fee_type = 'none' then
    raise exception using errcode = '22023', message = 'At least one customer pricing adjustment is required.';
  end if;
  if p_effective_until is not null and p_effective_until < coalesce(p_effective_from, v_now::date) then
    raise exception using errcode = '22023', message = 'Agreement end date cannot be before its start date.';
  end if;
  if not exists (
    select 1 from public.customers customer
    where customer.id = p_customer_id and customer.shop_id = p_shop_id
      and coalesce(customer.active, true)
  ) then
    raise exception using errcode = 'P0002', message = 'Customer account not found for shop.';
  end if;
  if v_source_type = 'fleet_contract' and not exists (
    select 1 from public.fleets fleet
    where fleet.shop_id = p_shop_id and fleet.customer_id = p_customer_id
      and coalesce(fleet.active, true)
  ) then
    raise exception using errcode = '23514', message = 'Fleet contract pricing requires a linked active Fleet account.';
  end if;

  select agreement.id into v_superseded_id
  from public.customer_pricing_agreements agreement
  where agreement.shop_id = p_shop_id and agreement.customer_id = p_customer_id
    and agreement.status = 'active'
    and (agreement.source_type = v_source_type or (
      agreement.source_type in ('customer_contract', 'fleet_contract')
      and v_source_type in ('customer_contract', 'fleet_contract')
    ))
  order by agreement.effective_from desc, agreement.created_at desc, agreement.id desc
  limit 1 for update;

  update public.customer_pricing_agreements agreement
  set status = 'superseded', retired_by = p_actor_user_id, retired_at = v_now,
      retired_reason = 'Superseded by a newer pricing agreement.', updated_at = v_now
  where agreement.shop_id = p_shop_id and agreement.customer_id = p_customer_id
    and agreement.status = 'active'
    and (agreement.source_type = v_source_type or (
      agreement.source_type in ('customer_contract', 'fleet_contract')
      and v_source_type in ('customer_contract', 'fleet_contract')
    ));

  insert into public.customer_pricing_agreements (
    shop_id, customer_id, source_type, name, status, currency, labor_rate,
    labor_discount_percent, parts_discount_percent, parts_markup_matrix,
    minimum_parts_margin_percent, customer_fee_type, customer_fee_value,
    customer_fee_cap, expiry_warning_days, effective_from, effective_until,
    approval_reason, notes, operation_key, supersedes_agreement_id, approved_by,
    created_by, created_at, updated_at
  ) values (
    p_shop_id, p_customer_id, v_source_type, btrim(p_name), 'active', v_currency,
    v_labor_rate, v_labor_discount, v_parts_discount, v_matrix, v_minimum_margin,
    v_fee_type, v_fee_value, v_fee_cap, v_warning_days,
    coalesce(p_effective_from, v_now::date), p_effective_until,
    btrim(p_approval_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    btrim(p_operation_key), v_superseded_id, p_actor_user_id, p_actor_user_id,
    v_now, v_now
  ) returning * into v_created;

  insert into public.operational_events (
    shop_id, event_type, actor_user_id, actor_role, entity_type, entity_id,
    source, idempotency_key, metadata
  ) values (
    p_shop_id, 'customer_pricing.v2_agreement_created', p_actor_user_id,
    v_actor_role, 'customer_pricing_agreement', v_created.id,
    'customer_pricing_engine', 'customer-pricing-agreement:' || btrim(p_operation_key),
    jsonb_build_object(
      'customer_id', p_customer_id, 'source_type', v_source_type,
      'supersedes_agreement_id', v_superseded_id,
      'matrix_tier_count', jsonb_array_length(v_matrix),
      'minimum_parts_margin_percent', v_minimum_margin,
      'customer_fee_type', v_fee_type,
      'effective_from', v_created.effective_from,
      'effective_until', v_created.effective_until
    )
  ) on conflict (shop_id, idempotency_key) where idempotency_key is not null do nothing;

  return jsonb_build_object('ok', true, 'idempotent', false, 'agreement', to_jsonb(v_created));
end;
$$;

revoke all on function public.create_customer_pricing_agreement_v2_atomic(
  uuid, uuid, text, text, text, numeric, numeric, numeric, jsonb, numeric,
  text, numeric, numeric, integer, date, date, text, text, text, uuid, timestamptz
) from public, anon;
grant execute on function public.create_customer_pricing_agreement_v2_atomic(
  uuid, uuid, text, text, text, numeric, numeric, numeric, jsonb, numeric,
  text, numeric, numeric, integer, date, date, text, text, text, uuid, timestamptz
) to authenticated, service_role;

-- Keep the V1 command authenticated during the expand/deploy window so the
-- currently deployed application remains compatible. Application routes move
-- to V2 in this change; a later contract migration can retire V1 safely.

create or replace function public.apply_customer_pricing_v2_to_quote_atomic(
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
  v_base_result jsonb;
  v_work_order public.work_orders%rowtype;
  v_agreement public.customer_pricing_agreements%rowtype;
  v_line public.work_order_quote_lines%rowtype;
  v_previous public.pricing_resolution_snapshots%rowtype;
  v_snapshot public.pricing_resolution_snapshots%rowtype;
  v_item public.part_request_items%rowtype;
  v_previous_part jsonb;
  v_part_prices jsonb;
  v_provenance jsonb;
  v_now timestamptz := coalesce(p_at, now());
  v_quantity numeric;
  v_unit_cost numeric;
  v_base_unit_price numeric;
  v_markup_percent numeric;
  v_matrix_unit_price numeric;
  v_discounted_unit_price numeric;
  v_margin_floor_unit_price numeric;
  v_resolved_unit_price numeric;
  v_resolved_parts_total numeric;
  v_floor_adjustment_total numeric;
  v_subtotal numeric;
  v_fee_total numeric := 0;
  v_fee_base numeric := 0;
  v_resolution_hash text;
  v_v2_applied jsonb := '[]'::jsonb;
begin
  v_base_result := public.apply_customer_pricing_to_quote_atomic(
    p_shop_id,
    p_work_order_id,
    p_quote_line_ids,
    p_actor_user_id,
    v_now
  );

  select work_order.* into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id and work_order.shop_id = p_shop_id
  for update;

  if not found or v_work_order.customer_id is null then
    return v_base_result || jsonb_build_object('pricing_v2', false);
  end if;

  select agreement.* into v_agreement
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

  if not found then
    if v_work_order.customer_pricing_fee_agreement_id is not null then
      update public.work_orders
      set shop_supplies_enabled_override = null,
          shop_supplies_amount_override = null,
          customer_pricing_fee_agreement_id = null,
          customer_pricing_fee_total = null,
          customer_pricing_fee_resolved_at = null,
          updated_at = v_now
      where id = p_work_order_id and shop_id = p_shop_id;
    end if;
    return v_base_result || jsonb_build_object('pricing_v2', false, 'customer_fee_total', 0);
  end if;

  if jsonb_array_length(v_agreement.parts_markup_matrix) > 0
     or v_agreement.minimum_parts_margin_percent > 0 then
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
      select snapshot.* into v_previous
      from public.pricing_resolution_snapshots snapshot
      where snapshot.id = v_line.customer_pricing_snapshot_id
        and snapshot.shop_id = p_shop_id;

      if not found or v_previous.agreement_id is distinct from v_agreement.id then
        continue;
      end if;

      v_part_prices := '[]'::jsonb;
      v_resolved_parts_total := 0;
      v_floor_adjustment_total := 0;

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
        v_quantity := greatest(
          coalesce(v_item.qty, 0), coalesce(v_item.qty_requested, 0),
          coalesce(v_item.qty_approved, 0), 0
        );
        if v_quantity <= 0 then continue; end if;

        select part.value into v_previous_part
        from jsonb_array_elements(v_previous.part_prices) part(value)
        where part.value ->> 'request_item_id' = v_item.id::text
        limit 1;

        if v_previous_part is null
           or coalesce(v_previous_part ->> 'base_unit_price', '') !~ '^[0-9]+([.][0-9]+)?$' then
          raise exception using errcode = '55000',
            message = 'PRICING_V2_PROVENANCE_MISSING',
            detail = format('Part request item %s has no immutable base sell price.', v_item.id);
        end if;

        v_base_unit_price := (v_previous_part ->> 'base_unit_price')::numeric;
        v_unit_cost := case
          when v_item.unit_cost is not null and v_item.unit_cost >= 0
            then round(v_item.unit_cost, 2)
          else null
        end;
        v_markup_percent := case when v_unit_cost is null then null else
          private.parts_matrix_markup_for_cost(v_agreement.parts_markup_matrix, v_unit_cost)
        end;
        v_matrix_unit_price := round(case
          when v_unit_cost is not null and v_markup_percent is not null
            then v_unit_cost * (1 + v_markup_percent / 100)
          else v_base_unit_price
        end, 2);
        v_discounted_unit_price := round(
          v_matrix_unit_price * (1 - v_agreement.parts_discount_percent / 100), 2
        );
        v_margin_floor_unit_price := case
          when v_unit_cost is not null and v_agreement.minimum_parts_margin_percent > 0
            then round(v_unit_cost / (1 - v_agreement.minimum_parts_margin_percent / 100), 2)
          else null
        end;
        v_resolved_unit_price := greatest(
          v_discounted_unit_price, coalesce(v_margin_floor_unit_price, 0)
        );

        if round(coalesce(v_item.quoted_price, v_item.unit_price, 0), 2)
             is distinct from v_resolved_unit_price then
          if v_item.work_order_line_id is not null
             or coalesce(v_item.qty_ordered, 0) > 0
             or coalesce(v_item.qty_received, 0) > 0
             or coalesce(v_item.qty_reserved, 0) > 0
             or coalesce(v_item.qty_consumed, 0) > 0
             or coalesce(v_item.qty_returned, 0) > 0
             or v_item.po_id is not null then
            raise exception using errcode = '55000',
              message = 'CUSTOMER_PRICING_PART_LIFECYCLE_LOCKED',
              detail = format('Part request item %s has operational activity.', v_item.id);
          end if;
          update public.part_request_items
          set quoted_price = v_resolved_unit_price,
              unit_price = v_resolved_unit_price,
              markup_pct = case when v_unit_cost > 0
                then round(((v_resolved_unit_price / v_unit_cost) - 1) * 100, 4)
                else markup_pct end,
              updated_at = v_now
          where id = v_item.id and shop_id = p_shop_id;
        end if;

        v_resolved_parts_total := round(
          v_resolved_parts_total + v_quantity * v_resolved_unit_price, 2
        );
        v_floor_adjustment_total := round(
          v_floor_adjustment_total
          + v_quantity * greatest(v_resolved_unit_price - v_discounted_unit_price, 0), 2
        );
        v_part_prices := v_part_prices || jsonb_build_array(jsonb_build_object(
          'request_item_id', v_item.id,
          'request_id', v_item.request_id,
          'description', v_item.description,
          'quantity', v_quantity,
          'unit_cost', v_unit_cost,
          'cost_known', v_unit_cost is not null,
          'base_unit_price', v_base_unit_price,
          'matrix_markup_percent', v_markup_percent,
          'matrix_unit_price', v_matrix_unit_price,
          'discount_percent', v_agreement.parts_discount_percent,
          'discounted_unit_price', v_discounted_unit_price,
          'minimum_margin_percent', v_agreement.minimum_parts_margin_percent,
          'margin_floor_unit_price', v_margin_floor_unit_price,
          'margin_floor_applied', v_margin_floor_unit_price is not null
            and v_margin_floor_unit_price > v_discounted_unit_price,
          'resolved_unit_price', v_resolved_unit_price,
          'resolved_line_total', round(v_quantity * v_resolved_unit_price, 2),
          'provenance', case when v_markup_percent is null then 'base_sell' else 'matrix' end
        ));
      end loop;

      if jsonb_array_length(v_part_prices) = 0 then
        if coalesce(v_previous.base_parts_total, 0) > 0 then
          raise exception using errcode = '55000',
            message = 'PRICING_V2_REQUIRES_CANONICAL_PART_ITEMS',
            detail = format('Quote line %s has parts totals without canonical request items.', v_line.id);
        end if;
        continue;
      end if;

      update public.work_order_quote_lines
      set parts_total = v_resolved_parts_total,
          subtotal = round(coalesce(labor_total, 0) + v_resolved_parts_total, 2),
          grand_total = round(coalesce(labor_total, 0) + v_resolved_parts_total + coalesce(tax_total, 0), 2),
          updated_at = v_now
      where id = v_line.id and shop_id = p_shop_id;

      v_provenance := jsonb_build_object(
        'version', 2,
        'agreement_id', v_agreement.id,
        'agreement_name', v_agreement.name,
        'parts_matrix', v_agreement.parts_markup_matrix,
        'minimum_parts_margin_percent', v_agreement.minimum_parts_margin_percent,
        'parts_discount_percent', v_agreement.parts_discount_percent,
        'margin_floor_adjustment_total', v_floor_adjustment_total,
        'resolved_at', v_now,
        'resolved_by', p_actor_user_id
      );

      update public.work_order_quote_lines
      set metadata = jsonb_set(
            coalesce(metadata, '{}'::jsonb), '{customer_pricing_v2}', v_provenance, true
          ),
          updated_at = v_now
      where id = v_line.id and shop_id = p_shop_id
      returning * into v_line;

      v_resolution_hash := encode(
        extensions.digest(
          convert_to(jsonb_build_object(
            'prior_snapshot_id', v_previous.id,
            'parts', v_part_prices,
            'provenance', v_provenance,
            'resolved_parts_total', v_resolved_parts_total
          )::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      );

      insert into public.pricing_resolution_snapshots (
        shop_id, customer_id, work_order_id, quote_line_id, agreement_id,
        supersedes_snapshot_id, source_type, precedence_rank, currency,
        base_labor_rate, resolved_labor_rate, labor_discount_percent,
        base_labor_total, resolved_labor_total, base_parts_total,
        resolved_parts_total, parts_discount_percent, part_prices,
        input_snapshot, result_snapshot, resolution_hash, resolved_by,
        resolved_at, created_at
      ) values (
        p_shop_id, v_previous.customer_id, p_work_order_id, v_line.id,
        v_agreement.id, v_previous.id, v_previous.source_type,
        v_previous.precedence_rank, v_previous.currency,
        v_previous.base_labor_rate, v_previous.resolved_labor_rate,
        v_previous.labor_discount_percent, v_previous.base_labor_total,
        v_previous.resolved_labor_total, v_previous.base_parts_total,
        v_resolved_parts_total, v_agreement.parts_discount_percent,
        v_part_prices,
        v_previous.input_snapshot || jsonb_build_object('pricing_v2', v_provenance),
        v_previous.result_snapshot || jsonb_build_object(
          'pricing_v2', v_provenance,
          'resolved_parts_total', v_resolved_parts_total
        ),
        v_resolution_hash, p_actor_user_id, v_now, v_now
      ) returning * into v_snapshot;

      update public.work_order_quote_lines
      set customer_pricing_snapshot_id = v_snapshot.id,
          metadata = jsonb_set(metadata, '{customer_pricing_v2,snapshot_id}', to_jsonb(v_snapshot.id), true),
          updated_at = v_now
      where id = v_line.id and shop_id = p_shop_id;

      v_v2_applied := v_v2_applied || jsonb_build_array(jsonb_build_object(
        'quote_line_id', v_line.id,
        'snapshot_id', v_snapshot.id,
        'supersedes_snapshot_id', v_previous.id,
        'resolved_parts_total', v_resolved_parts_total,
        'margin_floor_adjustment_total', v_floor_adjustment_total
      ));
    end loop;
  end if;

  select round(coalesce(sum(
    coalesce(quote_line.labor_total, 0) + coalesce(quote_line.parts_total, 0)
  ), 0), 2) into v_fee_base
  from public.work_order_quote_lines quote_line
  where quote_line.shop_id = p_shop_id
    and quote_line.work_order_id = p_work_order_id
    and lower(coalesce(quote_line.status::text, '')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'voided'
    );

  v_fee_total := round(case v_agreement.customer_fee_type
    when 'flat' then v_agreement.customer_fee_value
    when 'percentage' then v_fee_base * v_agreement.customer_fee_value / 100
    else 0
  end, 2);
  if v_agreement.customer_fee_cap is not null then
    v_fee_total := least(v_fee_total, v_agreement.customer_fee_cap);
  end if;

  if v_agreement.customer_fee_type = 'none' then
    if v_work_order.customer_pricing_fee_agreement_id is not null then
      update public.work_orders
      set shop_supplies_enabled_override = null,
          shop_supplies_amount_override = null,
          customer_pricing_fee_agreement_id = null,
          customer_pricing_fee_total = null,
          customer_pricing_fee_resolved_at = null,
          updated_at = v_now
      where id = p_work_order_id and shop_id = p_shop_id;
    end if;
  else
    update public.work_orders
    set shop_supplies_enabled_override = true,
        shop_supplies_amount_override = v_fee_total,
        customer_pricing_fee_agreement_id = v_agreement.id,
        customer_pricing_fee_total = v_fee_total,
        customer_pricing_fee_resolved_at = v_now,
        updated_at = v_now
    where id = p_work_order_id and shop_id = p_shop_id;
  end if;

  insert into public.operational_events (
    shop_id, event_type, actor_user_id, entity_type, entity_id, source, metadata
  ) values (
    p_shop_id, 'customer_pricing.v2_resolved', p_actor_user_id,
    'work_order', p_work_order_id, 'customer_pricing_engine',
    jsonb_build_object(
      'agreement_id', v_agreement.id,
      'quote_lines', v_v2_applied,
      'customer_fee_type', v_agreement.customer_fee_type,
      'customer_fee_base', v_fee_base,
      'customer_fee_total', v_fee_total
    )
  );

  return v_base_result || jsonb_build_object(
    'pricing_v2', true,
    'v2_applied', v_v2_applied,
    'customer_fee_type', v_agreement.customer_fee_type,
    'customer_fee_total', v_fee_total
  );
end;
$$;

revoke all on function public.apply_customer_pricing_v2_to_quote_atomic(
  uuid, uuid, uuid[], uuid, timestamptz
) from public, anon;
grant execute on function public.apply_customer_pricing_v2_to_quote_atomic(
  uuid, uuid, uuid[], uuid, timestamptz
) to authenticated, service_role;

comment on function public.apply_customer_pricing_v2_to_quote_atomic(
  uuid, uuid, uuid[], uuid, timestamptz
) is 'Canonical Pricing V2 quote resolver. Extends immutable V1 snapshots with cost-band parts matrices, margin floors, customer fees, and explicit provenance.';

commit;
