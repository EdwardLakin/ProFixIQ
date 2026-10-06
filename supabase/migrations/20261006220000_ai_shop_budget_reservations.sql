-- PR 2 (AI cost controls): one funded budget per shop, with subpools, and
-- atomic durable reservations against it.
--
-- Isolated addition. Creates new private tables and new service-role-only RPCs.
-- No existing table, trigger, policy, grant, constraint or function is changed;
-- consume_ai_route_quota / complete_ai_route_quota and their receipts keep
-- running exactly as before. Nothing calls these RPCs yet.
--
-- Model
--   * Funding is an append-only signed ledger (private.ai_budget_entries). The
--     shop balance is sum(entries) minus what reservations have consumed.
--   * A reservation holds an upper-bound cost before a provider call, and is
--     then committed with the actual cost, or released if nothing was billed.
--   * Pools are named subpools (copilot, inspection, ...) with an optional
--     monthly (UTC) cap. A pool cap limits spend inside the shop balance; it
--     never adds to it.
--   * Every shop starts in 'shadow' mode: decisions are recorded with
--     would_deny, but nothing is denied until enforcement is set to 'enforce'.
--     Only reservations made while enforcing count against the balance.
--   * A late commit of an expired reservation is still recorded: the provider
--     call happened, so the spend is real and may overdraw the balance.
begin;

create schema if not exists private authorization postgres;
revoke all privileges on schema private
  from public, anon, authenticated, service_role;

create table if not exists private.ai_shop_budgets (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  enforcement text not null default 'shadow'
    check (enforcement in ('shadow', 'enforce')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.ai_budget_pools (
  shop_id uuid not null references public.shops(id) on delete cascade,
  pool text not null check (pool ~ '^[a-z][a-z0-9_]{1,39}$'),
  cap_usd numeric(14, 6) not null check (cap_usd >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (shop_id, pool)
);

create table if not exists private.ai_budget_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('grant', 'adjustment', 'expiry')),
  amount_usd numeric(14, 6) not null check (amount_usd <> 0),
  source text not null check (length(btrim(source)) between 1 and 80),
  source_ref text check (source_ref is null or length(source_ref) <= 200),
  idempotency_key text not null
    check (length(btrim(idempotency_key)) between 1 and 160),
  created_at timestamptz not null default clock_timestamp(),
  unique (shop_id, idempotency_key),
  check (
    (kind = 'grant' and amount_usd > 0)
    or (kind = 'expiry' and amount_usd < 0)
    or kind = 'adjustment'
  )
);

create table if not exists private.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid,
  pool text not null check (pool ~ '^[a-z][a-z0-9_]{1,39}$'),
  feature text not null check (length(btrim(feature)) between 1 and 80),
  idempotency_key text not null
    check (length(btrim(idempotency_key)) between 1 and 160),
  status text not null default 'reserved'
    check (status in ('reserved', 'committed', 'released', 'expired', 'denied')),
  enforcement text not null check (enforcement in ('shadow', 'enforce')),
  would_deny boolean not null default false,
  denial_reason text,
  reserved_usd numeric(14, 6) not null check (reserved_usd >= 0),
  actual_usd numeric(14, 6) check (actual_usd is null or actual_usd >= 0),
  cost_basis text check (cost_basis is null or cost_basis in ('actual', 'reserved_fallback')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  unique (shop_id, idempotency_key)
);

create index if not exists ai_budget_reservations_shop_pool_idx
  on private.ai_budget_reservations (shop_id, pool, created_at desc);
create index if not exists ai_budget_reservations_open_idx
  on private.ai_budget_reservations (shop_id, expires_at)
  where status = 'reserved';
create index if not exists ai_budget_entries_shop_idx
  on private.ai_budget_entries (shop_id, created_at desc);

alter table private.ai_shop_budgets enable row level security;
alter table private.ai_budget_pools enable row level security;
alter table private.ai_budget_entries enable row level security;
alter table private.ai_budget_reservations enable row level security;

revoke all privileges on table
  private.ai_shop_budgets,
  private.ai_budget_pools,
  private.ai_budget_entries,
  private.ai_budget_reservations
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Funding and configuration (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.grant_ai_budget(
  p_shop_id uuid,
  p_amount_usd numeric,
  p_kind text,
  p_source text,
  p_source_ref text,
  p_idempotency_key text
)
returns table (entry_id uuid, applied boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if p_shop_id is null
     or p_amount_usd is null or p_amount_usd = 0
     or p_kind is null or p_kind not in ('grant', 'adjustment', 'expiry')
     or (p_kind = 'grant' and p_amount_usd < 0)
     or (p_kind = 'expiry' and p_amount_usd > 0)
     or p_source is null or pg_catalog.length(pg_catalog.btrim(p_source)) not between 1 and 80
     or p_idempotency_key is null
     or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'AI_BUDGET_GRANT_INPUT_INVALID';
  end if;

  if not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = '42501', message = 'AI_BUDGET_SCOPE_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  insert into private.ai_budget_entries (
    shop_id, kind, amount_usd, source, source_ref, idempotency_key
  ) values (
    p_shop_id, p_kind, p_amount_usd, pg_catalog.btrim(p_source),
    p_source_ref, pg_catalog.btrim(p_idempotency_key)
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  return query
    select e.id, false
    from private.ai_budget_entries e
    where e.shop_id = p_shop_id
      and e.idempotency_key = pg_catalog.btrim(p_idempotency_key);
end
$function$;

create or replace function public.set_ai_budget_enforcement(
  p_shop_id uuid,
  p_enforcement text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_shop_id is null or p_enforcement is null
     or p_enforcement not in ('shadow', 'enforce') then
    raise exception using errcode = '22023', message = 'AI_BUDGET_CONFIG_INPUT_INVALID';
  end if;

  if not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = '42501', message = 'AI_BUDGET_SCOPE_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  insert into private.ai_shop_budgets (shop_id, enforcement)
  values (p_shop_id, p_enforcement)
  on conflict (shop_id) do update
    set enforcement = excluded.enforcement,
        updated_at = pg_catalog.clock_timestamp();

  return p_enforcement;
end
$function$;

-- A null cap removes the pool cap.
create or replace function public.set_ai_budget_pool_cap(
  p_shop_id uuid,
  p_pool text,
  p_cap_usd numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_shop_id is null or p_pool is null or p_pool !~ '^[a-z][a-z0-9_]{1,39}$'
     or (p_cap_usd is not null and p_cap_usd < 0) then
    raise exception using errcode = '22023', message = 'AI_BUDGET_CONFIG_INPUT_INVALID';
  end if;

  if not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = '42501', message = 'AI_BUDGET_SCOPE_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  if p_cap_usd is null then
    delete from private.ai_budget_pools
    where shop_id = p_shop_id and pool = p_pool;
    return null;
  end if;

  insert into private.ai_budget_pools (shop_id, pool, cap_usd)
  values (p_shop_id, p_pool, p_cap_usd)
  on conflict (shop_id, pool) do update
    set cap_usd = excluded.cap_usd,
        updated_at = pg_catalog.clock_timestamp();

  return p_cap_usd;
end
$function$;

-- ---------------------------------------------------------------------------
-- Reserve / commit / release
-- ---------------------------------------------------------------------------

create or replace function public.reserve_ai_budget(
  p_shop_id uuid,
  p_pool text,
  p_feature text,
  p_amount_usd numeric,
  p_idempotency_key text,
  p_actor_id uuid default null,
  p_ttl_seconds integer default 1800
)
returns table (
  decision text,
  denial_reason text,
  reservation_id uuid,
  available_usd numeric,
  pool_remaining_usd numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_month_start timestamptz := pg_catalog.date_trunc('month', v_now, 'UTC');
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_mode text;
  v_funded numeric(14, 6);
  v_consumed numeric(14, 6);
  v_available numeric(14, 6);
  v_pool_cap numeric(14, 6);
  v_pool_used numeric(14, 6);
  v_pool_remaining numeric(14, 6);
  v_reason text;
  v_existing private.ai_budget_reservations%rowtype;
  v_id uuid;
begin
  if p_shop_id is null
     or p_pool is null or p_pool !~ '^[a-z][a-z0-9_]{1,39}$'
     or p_feature is null or pg_catalog.length(pg_catalog.btrim(p_feature)) not between 1 and 80
     or p_amount_usd is null or p_amount_usd < 0
     or v_key is null or pg_catalog.length(v_key) not between 1 and 160
     or p_ttl_seconds is null or p_ttl_seconds not between 30 and 86400 then
    raise exception using errcode = '22023', message = 'AI_BUDGET_RESERVE_INPUT_INVALID';
  end if;

  if not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = '42501', message = 'AI_BUDGET_SCOPE_DENIED';
  end if;

  -- Compare at the stored precision so a sub-micro amount cannot slip past.
  p_amount_usd := pg_catalog.round(p_amount_usd, 6);

  -- Serialize every budget decision for a shop so parallel serverless
  -- instances cannot all pass the same balance check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  insert into private.ai_shop_budgets (shop_id)
  values (p_shop_id)
  on conflict (shop_id) do nothing;

  select r.* into v_existing
  from private.ai_budget_reservations r
  where r.shop_id = p_shop_id and r.idempotency_key = v_key;

  select b.enforcement into v_mode
  from private.ai_shop_budgets b
  where b.shop_id = p_shop_id;

  -- Crashed provider calls must not hold balance forever.
  update private.ai_budget_reservations r
  set status = 'expired'
  where r.shop_id = p_shop_id
    and r.status = 'reserved'
    and r.expires_at <= v_now;

  select coalesce(sum(e.amount_usd), 0)::numeric(14, 6)
  into v_funded
  from private.ai_budget_entries e
  where e.shop_id = p_shop_id;

  select coalesce(sum(
    case r.status
      when 'reserved' then r.reserved_usd
      when 'committed' then coalesce(r.actual_usd, r.reserved_usd)
      else 0
    end
  ), 0)::numeric(14, 6)
  into v_consumed
  from private.ai_budget_reservations r
  where r.shop_id = p_shop_id and r.enforcement = 'enforce';

  v_available := v_funded - v_consumed;

  select c.cap_usd into v_pool_cap
  from private.ai_budget_pools c
  where c.shop_id = p_shop_id and c.pool = p_pool;

  select coalesce(sum(
    case r.status
      when 'reserved' then r.reserved_usd
      when 'committed' then coalesce(r.actual_usd, r.reserved_usd)
      else 0
    end
  ), 0)::numeric(14, 6)
  into v_pool_used
  from private.ai_budget_reservations r
  where r.shop_id = p_shop_id
    and r.pool = p_pool
    and r.enforcement = 'enforce'
    and r.created_at >= v_month_start;

  v_pool_remaining := case
    when v_pool_cap is null then null
    else greatest(0, v_pool_cap - v_pool_used)
  end;

  if v_existing.id is not null then
    return query select
      case
        when v_existing.status = 'denied' then 'denied'
        when v_existing.status = 'released' then 'released'
        -- A hold whose time ran out is no longer safe to spend against.
        when v_existing.status = 'expired'
          or (v_existing.status = 'reserved' and v_existing.expires_at <= v_now) then 'expired'
        when v_existing.enforcement = 'shadow' then 'shadow_allowed'
        else 'allowed'
      end,
      v_existing.denial_reason,
      v_existing.id,
      v_available,
      v_pool_remaining,
      true;
    return;
  end if;

  if v_available < p_amount_usd then
    v_reason := 'insufficient_balance';
  elsif v_pool_cap is not null and v_pool_used + p_amount_usd > v_pool_cap then
    v_reason := 'pool_cap_exceeded';
  end if;

  if v_reason is not null and v_mode = 'enforce' then
    insert into private.ai_budget_reservations (
      shop_id, actor_id, pool, feature, idempotency_key, status, enforcement,
      would_deny, denial_reason, reserved_usd, expires_at, settled_at
    ) values (
      p_shop_id, p_actor_id, p_pool, pg_catalog.btrim(p_feature), v_key, 'denied',
      v_mode, true, v_reason, p_amount_usd, v_now, v_now
    )
    returning id into v_id;

    return query select 'denied'::text, v_reason, v_id, v_available, v_pool_remaining, false;
    return;
  end if;

  insert into private.ai_budget_reservations (
    shop_id, actor_id, pool, feature, idempotency_key, status, enforcement,
    would_deny, denial_reason, reserved_usd, expires_at
  ) values (
    p_shop_id, p_actor_id, p_pool, pg_catalog.btrim(p_feature), v_key, 'reserved',
    v_mode, v_reason is not null, v_reason, p_amount_usd,
    v_now + pg_catalog.make_interval(secs => p_ttl_seconds)
  )
  returning id into v_id;

  return query select
    case when v_mode = 'shadow' then 'shadow_allowed' else 'allowed' end,
    v_reason,
    v_id,
    case when v_mode = 'enforce' then v_available - p_amount_usd else v_available end,
    case
      when v_pool_remaining is null or v_mode = 'shadow' then v_pool_remaining
      else greatest(0, v_pool_remaining - p_amount_usd)
    end,
    false;
end
$function$;

-- p_actual_usd null means the provider returned no billable usage: the
-- reservation is kept as the cost (cost_basis = 'reserved_fallback') instead of
-- being treated as $0.
create or replace function public.commit_ai_budget(
  p_reservation_id uuid,
  p_shop_id uuid,
  p_actual_usd numeric
)
returns table (settled boolean, status text, actual_usd numeric)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row private.ai_budget_reservations%rowtype;
begin
  if p_reservation_id is null or p_shop_id is null
     or (p_actual_usd is not null and p_actual_usd < 0) then
    raise exception using errcode = '22023', message = 'AI_BUDGET_COMMIT_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  select r.* into v_row
  from private.ai_budget_reservations r
  where r.id = p_reservation_id and r.shop_id = p_shop_id
  for update;

  if not found then
    return query select false, 'not_found'::text, null::numeric;
    return;
  end if;

  if v_row.status in ('committed', 'released', 'denied') then
    return query select false, v_row.status, v_row.actual_usd;
    return;
  end if;

  update private.ai_budget_reservations r
  set status = 'committed',
      actual_usd = coalesce(p_actual_usd, r.reserved_usd),
      cost_basis = case when p_actual_usd is null then 'reserved_fallback' else 'actual' end,
      settled_at = pg_catalog.clock_timestamp()
  where r.id = p_reservation_id
  returning r.actual_usd into v_row.actual_usd;

  return query select true, 'committed'::text, v_row.actual_usd;
end
$function$;

-- Release is for calls that never reached the provider. A reservation that
-- already committed is left alone.
create or replace function public.release_ai_budget(
  p_reservation_id uuid,
  p_shop_id uuid
)
returns table (settled boolean, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row private.ai_budget_reservations%rowtype;
begin
  if p_reservation_id is null or p_shop_id is null then
    raise exception using errcode = '22023', message = 'AI_BUDGET_RELEASE_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  select r.* into v_row
  from private.ai_budget_reservations r
  where r.id = p_reservation_id and r.shop_id = p_shop_id
  for update;

  if not found then
    return query select false, 'not_found'::text;
    return;
  end if;

  if v_row.status in ('committed', 'released', 'denied') then
    return query select false, v_row.status;
    return;
  end if;

  update private.ai_budget_reservations r
  set status = 'released',
      actual_usd = 0,
      settled_at = pg_catalog.clock_timestamp()
  where r.id = p_reservation_id;

  return query select true, 'released'::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- Status
-- ---------------------------------------------------------------------------

create or replace function public.get_ai_budget_status(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_month_start timestamptz := pg_catalog.date_trunc('month', v_now, 'UTC');
  v_mode text;
  v_funded numeric(14, 6);
  v_committed numeric(14, 6);
  v_reserved numeric(14, 6);
  v_unsettled numeric(14, 6);
  v_pools jsonb;
begin
  if p_shop_id is null then
    raise exception using errcode = '22023', message = 'AI_BUDGET_STATUS_INPUT_INVALID';
  end if;

  select b.enforcement into v_mode
  from private.ai_shop_budgets b where b.shop_id = p_shop_id;

  select coalesce(sum(e.amount_usd), 0) into v_funded
  from private.ai_budget_entries e where e.shop_id = p_shop_id;

  select
    coalesce(sum(coalesce(r.actual_usd, r.reserved_usd)) filter (where r.status = 'committed'), 0),
    coalesce(sum(r.reserved_usd) filter (where r.status = 'reserved' and r.expires_at > v_now), 0),
    coalesce(sum(r.reserved_usd) filter (where r.status in ('reserved', 'expired') and r.expires_at <= v_now), 0)
  into v_committed, v_reserved, v_unsettled
  from private.ai_budget_reservations r
  where r.shop_id = p_shop_id and r.enforcement = 'enforce';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'pool', p.pool,
    'capUsd', p.cap_usd,
    'usedUsd', p.used,
    'remainingUsd', greatest(0, p.cap_usd - p.used)
  ) order by p.pool), '[]'::jsonb)
  into v_pools
  from (
    select c.pool, c.cap_usd,
      coalesce((
        select sum(case r.status
          when 'reserved' then r.reserved_usd
          when 'committed' then coalesce(r.actual_usd, r.reserved_usd)
          else 0 end)
        from private.ai_budget_reservations r
        where r.shop_id = c.shop_id and r.pool = c.pool
          and r.enforcement = 'enforce' and r.created_at >= v_month_start
      ), 0) as used
    from private.ai_budget_pools c
    where c.shop_id = p_shop_id
  ) p;

  return pg_catalog.jsonb_build_object(
    'shopId', p_shop_id,
    'enforcement', coalesce(v_mode, 'shadow'),
    'fundedUsd', v_funded,
    'committedUsd', v_committed,
    'reservedUsd', v_reserved,
    'unsettledExpiredUsd', v_unsettled,
    'availableUsd', v_funded - v_committed - v_reserved,
    'overdraftUsd', greatest(0, -(v_funded - v_committed - v_reserved)),
    'shadowWouldDeny30d', (
      select pg_catalog.count(*) from private.ai_budget_reservations r
      where r.shop_id = p_shop_id and r.enforcement = 'shadow'
        and r.would_deny and r.created_at >= v_now - interval '30 days'
    ),
    'deniedCount30d', (
      select pg_catalog.count(*) from private.ai_budget_reservations r
      where r.shop_id = p_shop_id and r.status = 'denied'
        and r.created_at >= v_now - interval '30 days'
    ),
    'pools', v_pools
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants: service_role execute only
-- ---------------------------------------------------------------------------

alter function public.grant_ai_budget(uuid, numeric, text, text, text, text) owner to postgres;
alter function public.set_ai_budget_enforcement(uuid, text) owner to postgres;
alter function public.set_ai_budget_pool_cap(uuid, text, numeric) owner to postgres;
alter function public.reserve_ai_budget(uuid, text, text, numeric, text, uuid, integer) owner to postgres;
alter function public.commit_ai_budget(uuid, uuid, numeric) owner to postgres;
alter function public.release_ai_budget(uuid, uuid) owner to postgres;
alter function public.get_ai_budget_status(uuid) owner to postgres;

revoke all privileges on function public.grant_ai_budget(uuid, numeric, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.set_ai_budget_enforcement(uuid, text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.set_ai_budget_pool_cap(uuid, text, numeric)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.reserve_ai_budget(uuid, text, text, numeric, text, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.commit_ai_budget(uuid, uuid, numeric)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.release_ai_budget(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.get_ai_budget_status(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.grant_ai_budget(uuid, numeric, text, text, text, text) to service_role;
grant execute on function public.set_ai_budget_enforcement(uuid, text) to service_role;
grant execute on function public.set_ai_budget_pool_cap(uuid, text, numeric) to service_role;
grant execute on function public.reserve_ai_budget(uuid, text, text, numeric, text, uuid, integer) to service_role;
grant execute on function public.commit_ai_budget(uuid, uuid, numeric) to service_role;
grant execute on function public.release_ai_budget(uuid, uuid) to service_role;
grant execute on function public.get_ai_budget_status(uuid) to service_role;

commit;
