-- Existing stock history stays attached to its current locations. Add MAIN only
-- for shops that do not already have a case-insensitive MAIN location.
insert into public.stock_locations (shop_id, code, name)
select shop.id, 'MAIN', 'Main Stock'
from public.shops as shop
where not exists (
  select 1
  from public.stock_locations as location
  where location.shop_id = shop.id
    and upper(trim(coalesce(location.code, ''))) = 'MAIN'
)
on conflict (shop_id, code) do nothing;
