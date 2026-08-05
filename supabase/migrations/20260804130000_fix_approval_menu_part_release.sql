begin;

-- Canonical request items are identified by the work-order part they came
-- from. Legacy/manual items without that source still use the line-level
-- part/description guards.
do $$
begin
  if exists (
    select 1
    from public.part_request_items
    where source_work_order_part_id is not null
    group by request_id, source_work_order_part_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce request/source work-order-part uniqueness: duplicates exist.';
  end if;
end
$$;

create unique index if not exists uq_pri_request_source_work_order_part
  on public.part_request_items(request_id, source_work_order_part_id)
  where source_work_order_part_id is not null;

drop index if exists public.uq_pri_line_part;
create unique index uq_pri_line_part
  on public.part_request_items(work_order_line_id, part_id)
  where part_id is not null
    and work_order_line_id is not null
    and source_work_order_part_id is null;

drop index if exists public.uq_pri_line_desc_nullpart;
create unique index uq_pri_line_desc_nullpart
  on public.part_request_items(
    work_order_line_id,
    lower(trim(description))
  )
  where part_id is null
    and work_order_line_id is not null
    and source_work_order_part_id is null;

-- Preserve menu-part identity on every new staged work-order part. This is
-- consumed by the approval-time Parts release and by quote/invoice display.
create or replace function public.wol_copy_menu_parts_to_work_order_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  v_shop := new.shop_id;

  insert into public.work_order_parts (
    work_order_id,
    work_order_line_id,
    part_id,
    quantity,
    unit_price,
    total_price,
    shop_id,
    description_snapshot,
    part_number_snapshot,
    manufacturer_snapshot,
    unit_cost_snapshot,
    unit_sell_price_snapshot
  )
  select
    new.work_order_id,
    new.id,
    mip.part_id,
    greatest(1, coalesce(round(mip.quantity)::int, 1)),
    prices.sell_price,
    greatest(1, coalesce(round(mip.quantity)::int, 1))
      * prices.sell_price,
    v_shop,
    coalesce(
      nullif(trim(mip.name), ''),
      nullif(trim(p.name), ''),
      'Menu part ' || left(mip.id::text, 8)
    ),
    nullif(trim(p.part_number), ''),
    nullif(trim(p.manufacturer), ''),
    coalesce(mip.unit_cost, p.default_cost, p.cost),
    prices.sell_price
  from public.menu_item_parts mip
  left join public.parts p
    on p.id = mip.part_id
   and (p.shop_id is null or p.shop_id = v_shop)
  cross join lateral (
    select case
      when mip.part_id is not null then
        coalesce(
          p.default_price,
          p.price,
          mip.unit_cost,
          p.default_cost,
          p.cost,
          0
        )::numeric
      else coalesce(mip.unit_cost, 0)::numeric
    end as sell_price
  ) prices
  where mip.menu_item_id = new.menu_item_id
    and (mip.shop_id is null or mip.shop_id = v_shop);

  return new;
end;
$$;

-- Repair historical menu-derived rows that were staged before the trigger
-- copied snapshots. Matching uses the same quantity and sell-price contract
-- as the trigger; an ordinal only disambiguates financially identical rows.
with menu_candidates as (
  select
    wol.id as work_order_line_id,
    mip.id as menu_item_part_id,
    greatest(1, coalesce(round(mip.quantity)::int, 1))::numeric
      as quantity,
    case
      when mip.part_id is not null then
        coalesce(
          p.default_price,
          p.price,
          mip.unit_cost,
          p.default_cost,
          p.cost,
          0
        )::numeric
      else coalesce(mip.unit_cost, 0)::numeric
    end as sell_price,
    coalesce(
      nullif(trim(mip.name), ''),
      nullif(trim(p.name), ''),
      'Menu part ' || left(mip.id::text, 8)
    ) as description_snapshot,
    nullif(trim(p.part_number), '') as part_number_snapshot,
    nullif(trim(p.manufacturer), '') as manufacturer_snapshot,
    coalesce(mip.unit_cost, p.default_cost, p.cost) as unit_cost_snapshot,
    row_number() over (
      partition by
        wol.id,
        greatest(1, coalesce(round(mip.quantity)::int, 1)),
        case
          when mip.part_id is not null then
            coalesce(
              p.default_price,
              p.price,
              mip.unit_cost,
              p.default_cost,
              p.cost,
              0
            )::numeric
          else coalesce(mip.unit_cost, 0)::numeric
        end
      order by mip.id
    ) as match_ordinal
  from public.work_order_lines wol
  join public.menu_item_parts mip
    on mip.menu_item_id = wol.menu_item_id
   and (mip.shop_id is null or mip.shop_id = wol.shop_id)
  left join public.parts p
    on p.id = mip.part_id
   and (p.shop_id is null or p.shop_id = wol.shop_id)
  where wol.menu_item_id is not null
), work_order_candidates as (
  select
    wop.id,
    wop.work_order_line_id,
    coalesce(wop.quantity, 0)::numeric as quantity,
    coalesce(wop.unit_price, 0)::numeric as sell_price,
    row_number() over (
      partition by
        wop.work_order_line_id,
        coalesce(wop.quantity, 0),
        coalesce(wop.unit_price, 0)
      order by wop.id
    ) as match_ordinal
  from public.work_order_parts wop
  where nullif(trim(wop.description_snapshot), '') is null
), matched as (
  select
    wop.id,
    menu.description_snapshot,
    menu.part_number_snapshot,
    menu.manufacturer_snapshot,
    menu.unit_cost_snapshot,
    menu.sell_price
  from work_order_candidates wop
  join menu_candidates menu
    on menu.work_order_line_id = wop.work_order_line_id
   and menu.quantity = wop.quantity
   and menu.sell_price = wop.sell_price
   and menu.match_ordinal = wop.match_ordinal
)
update public.work_order_parts wop
set description_snapshot = matched.description_snapshot,
    part_number_snapshot = coalesce(
      wop.part_number_snapshot,
      matched.part_number_snapshot
    ),
    manufacturer_snapshot = coalesce(
      wop.manufacturer_snapshot,
      matched.manufacturer_snapshot
    ),
    unit_cost_snapshot = coalesce(
      wop.unit_cost_snapshot,
      matched.unit_cost_snapshot
    ),
    unit_sell_price_snapshot = coalesce(
      wop.unit_sell_price_snapshot,
      matched.sell_price
    ),
    updated_at = now()
from matched
where wop.id = matched.id;

comment on function public.wol_copy_menu_parts_to_work_order_parts() is
  'Stages menu parts with durable identity and pricing snapshots for approval-time Parts release.';

commit;
