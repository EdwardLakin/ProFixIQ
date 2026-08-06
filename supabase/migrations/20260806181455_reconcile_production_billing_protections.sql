begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Promote the production-only billing entitlement hotfixes into the ordered
-- repository history. The final guard intentionally does not assign or compare
-- shops.max_users because that column is generated from plan/user_limit.
alter table public.shops
  add column if not exists billing_entitlement_override text,
  add column if not exists billing_grace_until timestamptz,
  add column if not exists billing_entitlement_updated_at timestamptz not null default now(),
  add column if not exists location_type text not null default 'repair_facility';

alter table public.shops
  drop constraint if exists shops_billing_entitlement_override_check;

alter table public.shops
  add constraint shops_billing_entitlement_override_check
  check (
    billing_entitlement_override is null
    or billing_entitlement_override in (
      'active', 'internal_demo', 'read_only', 'suspended'
    )
  ) not valid;

alter table public.shops
  validate constraint shops_billing_entitlement_override_check;

alter table public.shops
  drop constraint if exists shops_location_type_check;

alter table public.shops
  add constraint shops_location_type_check
  check (
    location_type in (
      'repair_facility',
      'mobile_service_branch',
      'parts_depot',
      'administrative_office'
    )
  ) not valid;

alter table public.shops
  validate constraint shops_location_type_check;

comment on column public.shops.billing_entitlement_override is
  'Controlled internal override for shop write entitlement. Null defers to Stripe subscription state.';
comment on column public.shops.billing_grace_until is
  'Temporary date through which operational writes remain allowed while billing is resolved.';
comment on column public.shops.location_type is
  'Commercial location classification. Repair facilities and independent mobile branches are billable shop locations.';

drop policy if exists shops_insert_authenticated on public.shops;
drop policy if exists shops_insert_first_shop_only on public.shops;
create policy shops_insert_first_shop_only
on public.shops
for insert
to authenticated
with check (
  (created_by = (select auth.uid()) or owner_id = (select auth.uid()))
  and not exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id is not null
  )
);

create or replace function public.profixiq_mark_shop_billing_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
begin
  for v_shop_id in
    select distinct candidate_shop_id
    from (
      select case when tg_op <> 'DELETE' then new.shop_id else null end as candidate_shop_id
      union all
      select case when tg_op <> 'INSERT' then old.shop_id else null end as candidate_shop_id
    ) candidates
    where candidate_shop_id is not null
  loop
    update public.shops s
    set
      active_user_count = counts.user_count,
      billable_user_count = counts.user_count,
      stripe_billing_sync_required = true,
      stripe_billing_synced_at = null,
      billing_entitlement_updated_at = now()
    from (
      select count(*)::integer as user_count
      from public.profiles p
      where p.shop_id = v_shop_id
    ) counts
    where s.id = v_shop_id;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.profixiq_mark_shop_billing_sync()
  from public, anon, authenticated;
grant execute on function public.profixiq_mark_shop_billing_sync()
  to service_role;

drop trigger if exists profiles_mark_shop_billing_sync on public.profiles;
create trigger profiles_mark_shop_billing_sync
after insert or delete or update of shop_id
on public.profiles
for each row
execute function public.profixiq_mark_shop_billing_sync();

drop trigger if exists shops_protect_billing_identity on public.shops;
drop function if exists public.profixiq_protect_shop_billing_identity();

create or replace function public.prevent_client_shop_billing_identity_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_subscription_status is distinct from old.stripe_subscription_status
    or new.stripe_trial_end is distinct from old.stripe_trial_end
    or new.stripe_current_period_end is distinct from old.stripe_current_period_end
    or new.plan is distinct from old.plan
    or new.user_limit is distinct from old.user_limit
    or new.active_user_count is distinct from old.active_user_count
    or new.billable_user_count is distinct from old.billable_user_count
    or new.stripe_billing_sync_required is distinct from old.stripe_billing_sync_required
    or new.stripe_billing_sync_error is distinct from old.stripe_billing_sync_error
    or new.stripe_billing_synced_at is distinct from old.stripe_billing_synced_at
    or new.stripe_pricing_model is distinct from old.stripe_pricing_model
    or new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.stripe_details_submitted is distinct from old.stripe_details_submitted
    or new.stripe_onboarding_completed is distinct from old.stripe_onboarding_completed
    or new.stripe_default_currency is distinct from old.stripe_default_currency
    or new.stripe_platform_fee_bps is distinct from old.stripe_platform_fee_bps
    or new.stripe_connect_charge_model is distinct from old.stripe_connect_charge_model
    or new.stripe_connect_dashboard_type is distinct from old.stripe_connect_dashboard_type
    or new.stripe_connect_fees_collector is distinct from old.stripe_connect_fees_collector
    or new.stripe_connect_losses_collector is distinct from old.stripe_connect_losses_collector
    or new.billing_entitlement_override is distinct from old.billing_entitlement_override
    or new.billing_grace_until is distinct from old.billing_grace_until
    or new.billing_entitlement_updated_at is distinct from old.billing_entitlement_updated_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'shop billing, payment, and entitlement fields are server managed';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_client_shop_billing_identity_write()
  from public, anon, authenticated;
grant execute on function public.prevent_client_shop_billing_identity_write()
  to service_role;

drop trigger if exists prevent_client_shop_billing_identity_write
  on public.shops;
create trigger prevent_client_shop_billing_identity_write
before update on public.shops
for each row
execute function public.prevent_client_shop_billing_identity_write();

create or replace function public.normalize_client_shop_billing_identity_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  new.plan := 'starter';
  new.user_limit := 10;
  new.active_user_count := 0;
  new.billable_user_count := 0;
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  new.stripe_subscription_status := null;
  new.stripe_trial_end := null;
  new.stripe_current_period_end := null;
  new.stripe_checkout_session_id := null;
  new.stripe_pricing_model := 'base_plus_seats_v2';
  new.stripe_billing_sync_required := true;
  new.stripe_billing_sync_error := null;
  new.stripe_billing_synced_at := null;
  new.billing_entitlement_override := null;
  new.billing_grace_until := null;
  new.billing_entitlement_updated_at := now();
  return new;
end;
$$;

revoke all on function public.normalize_client_shop_billing_identity_insert()
  from public, anon, authenticated;
grant execute on function public.normalize_client_shop_billing_identity_insert()
  to service_role;

drop trigger if exists shops_normalize_client_billing_identity_insert
  on public.shops;
create trigger shops_normalize_client_billing_identity_insert
before insert on public.shops
for each row
execute function public.normalize_client_shop_billing_identity_insert();

-- Keep production and clean replay counts deterministic. This does not change
-- entitlement state; it only marks the authoritative count for resync.
update public.shops s
set
  active_user_count = counts.user_count,
  billable_user_count = counts.user_count,
  stripe_billing_sync_required = true,
  stripe_billing_synced_at = null,
  billing_entitlement_updated_at = now()
from (
  select s2.id as shop_id, count(p.id)::integer as user_count
  from public.shops s2
  left join public.profiles p on p.shop_id = s2.id
  group by s2.id
) counts
where s.id = counts.shop_id;

commit;
