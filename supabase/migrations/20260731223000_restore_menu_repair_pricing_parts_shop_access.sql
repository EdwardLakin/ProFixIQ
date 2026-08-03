begin;

alter table public.menu_repair_item_pricing_parts enable row level security;

drop policy if exists menu_repair_item_pricing_parts_select_shop
  on public.menu_repair_item_pricing_parts;
create policy menu_repair_item_pricing_parts_select_shop
  on public.menu_repair_item_pricing_parts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.menu_repair_item_pricing_snapshots snapshot
      where snapshot.id = menu_repair_item_pricing_parts.pricing_snapshot_id
        and public.is_shop_member_v2(snapshot.shop_id)
    )
  );

drop policy if exists menu_repair_item_pricing_parts_insert_shop
  on public.menu_repair_item_pricing_parts;
create policy menu_repair_item_pricing_parts_insert_shop
  on public.menu_repair_item_pricing_parts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.menu_repair_item_pricing_snapshots snapshot
      where snapshot.id = menu_repair_item_pricing_parts.pricing_snapshot_id
        and public.is_shop_member_v2(snapshot.shop_id)
    )
  );

drop policy if exists menu_repair_item_pricing_parts_update_shop
  on public.menu_repair_item_pricing_parts;
create policy menu_repair_item_pricing_parts_update_shop
  on public.menu_repair_item_pricing_parts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.menu_repair_item_pricing_snapshots snapshot
      where snapshot.id = menu_repair_item_pricing_parts.pricing_snapshot_id
        and public.is_shop_member_v2(snapshot.shop_id)
    )
  )
  with check (
    exists (
      select 1
      from public.menu_repair_item_pricing_snapshots snapshot
      where snapshot.id = menu_repair_item_pricing_parts.pricing_snapshot_id
        and public.is_shop_member_v2(snapshot.shop_id)
    )
  );

drop policy if exists menu_repair_item_pricing_parts_delete_shop
  on public.menu_repair_item_pricing_parts;
create policy menu_repair_item_pricing_parts_delete_shop
  on public.menu_repair_item_pricing_parts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.menu_repair_item_pricing_snapshots snapshot
      where snapshot.id = menu_repair_item_pricing_parts.pricing_snapshot_id
        and public.is_shop_member_v2(snapshot.shop_id)
    )
  );

commit;
