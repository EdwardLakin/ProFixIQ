begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Every shop created after the scheduler cutover must receive compatibility
-- capacity immediately. Onboarding can later add real bays/trucks; the scheduler
-- automatically retires the fallback from capacity selection at that point.
create or replace function public.sync_shop_default_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_name text;
begin
  v_mode := case when new.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end;
  v_name := case when v_mode = 'mobile' then 'Mobile capacity' else 'Shop capacity' end;

  insert into public.scheduling_resources(
    shop_id, code, name, resource_type, mode,
    public_bookable, is_fallback, active, sort_order
  ) values (
    new.id, 'default-capacity', v_name, 'capacity', v_mode,
    true, true, true, 1000
  ) on conflict do nothing;

  update public.scheduling_resources
  set name = v_name,
      mode = v_mode,
      active = true,
      updated_at = now()
  where shop_id = new.id
    and is_fallback = true
    and code = 'default-capacity';

  return new;
end;
$$;

revoke all on function public.sync_shop_default_scheduling_resource()
  from public, anon, authenticated, service_role;

drop trigger if exists shops_sync_default_scheduling_resource on public.shops;
create trigger shops_sync_default_scheduling_resource
after insert or update of location_type
on public.shops
for each row execute function public.sync_shop_default_scheduling_resource();

notify pgrst, 'reload schema';

commit;
