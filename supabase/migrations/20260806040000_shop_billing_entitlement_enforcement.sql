begin;

alter table public.shops
  add column if not exists billing_entitlement_override text null,
  add column if not exists billing_grace_until timestamptz null,
  add column if not exists billing_entitlement_updated_at timestamptz not null default now(),
  add column if not exists location_type text not null default 'repair_facility';

alter table public.shops
  drop constraint if exists shops_billing_entitlement_override_check;

alter table public.shops
  add constraint shops_billing_entitlement_override_check
  check (
    billing_entitlement_override is null
    or billing_entitlement_override in ('active', 'internal_demo', 'read_only', 'suspended')
  );

alter table public.shops
  drop constraint if exists shops_location_type_check;

alter table public.shops
  add constraint shops_location_type_check
  check (location_type in ('repair_facility', 'mobile_service_branch', 'parts_depot', 'administrative_office'));

comment on column public.shops.billing_entitlement_override is
  'Controlled internal override for shop write entitlement. Null defers to Stripe subscription state.';
comment on column public.shops.billing_grace_until is
  'Temporary date through which operational writes remain allowed while billing is resolved.';
comment on column public.shops.location_type is
  'Commercial location classification. Repair facilities and independent mobile branches are billable shop locations.';

-- Direct browser/API creation is only permitted for a user who has not yet been
-- attached to a shop. Additional locations must be created by a server-owned
-- organization flow using the service role.
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

revoke all on function public.profixiq_mark_shop_billing_sync() from public, anon, authenticated;

drop trigger if exists profiles_mark_shop_billing_sync on public.profiles;
create trigger profiles_mark_shop_billing_sync
after insert or delete or update of shop_id
on public.profiles
for each row
execute function public.profixiq_mark_shop_billing_sync();

-- Reconcile current cached counts and ensure the five-minute Stripe worker sees
-- every shop after this contract change.
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
