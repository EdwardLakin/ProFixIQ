begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Keep the read-only product gates callable by signed-in application clients,
-- but prevent entitlement probing outside the caller's own tenant boundary.
create or replace function public.profixiq_shop_has_product_access(
  p_shop_id uuid,
  p_capability text
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when shop.billing_entitlement_override in ('active', 'internal_demo') then true
      when shop.billing_entitlement_override in ('read_only', 'suspended') then false
      when not (
        lower(coalesce(shop.stripe_subscription_status, '')) in ('trialing', 'active', 'past_due')
        or coalesce(shop.billing_grace_until > now(), false)
      ) then false
      when shop.subscription_package is null
        and shop.stripe_pricing_model <> 'product_packages_v1' then true
      when p_capability = 'shop' then
        shop.subscription_package in ('shop_operations', 'complete_operations')
      when p_capability = 'field_service' then
        shop.subscription_package in ('field_service', 'complete_operations')
      when p_capability = 'fleet_maintenance' then
        shop.subscription_package in ('fleet_maintenance', 'complete_operations')
      else false
    end
    from public.shops shop
    where shop.id = p_shop_id
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.profiles profile
          where profile.shop_id = shop.id
            and (profile.id = auth.uid() or profile.user_id = auth.uid())
        )
        or exists (
          select 1
          from public.fleet_members member
          where member.shop_id = shop.id
            and member.user_id = auth.uid()
        )
      )
  ), false);
$$;

create or replace function public.profixiq_fleet_has_product_access(
  p_fleet_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      public.profixiq_shop_has_product_access(fleet.shop_id, 'fleet_maintenance')
      and (
        shop.subscription_package is distinct from 'complete_operations'
        or (
          select count(*)
          from public.fleet_vehicles fleet_vehicle
          where fleet_vehicle.fleet_id = fleet.id
            and fleet_vehicle.active
        ) <= 10
      )
    from public.fleets fleet
    join public.shops shop on shop.id = fleet.shop_id
    where fleet.id = p_fleet_id
      and fleet.active
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.fleet_members member
          where member.fleet_id = fleet.id
            and member.user_id = auth.uid()
        )
      )
  ), false);
$$;

revoke all on function public.profixiq_shop_has_product_access(uuid, text)
  from public, anon;
grant execute on function public.profixiq_shop_has_product_access(uuid, text)
  to authenticated, service_role;

revoke all on function public.profixiq_fleet_has_product_access(uuid)
  from public, anon;
grant execute on function public.profixiq_fleet_has_product_access(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
