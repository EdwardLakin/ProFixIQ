-- Every shop needs at least one stock location so receiving and inventory
-- movements work immediately. Existing locations and their stock history are
-- preserved; only shops without MAIN receive the default row.

create or replace function private.profixiq_seed_main_stock_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.stock_locations (shop_id, code, name)
  values (new.id, 'MAIN', 'Main Stock')
  on conflict (shop_id, code) do nothing;

  return new;
end;
$$;

revoke all privileges on function private.profixiq_seed_main_stock_location()
  from public, anon, authenticated, service_role;

drop trigger if exists shops_seed_main_stock_location on public.shops;
create trigger shops_seed_main_stock_location
after insert on public.shops
for each row
execute function private.profixiq_seed_main_stock_location();

insert into public.stock_locations (shop_id, code, name)
select shop.id, 'MAIN', 'Main Stock'
from public.shops as shop
on conflict (shop_id, code) do nothing;
