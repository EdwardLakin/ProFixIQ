-- Phase 5D-5B: trace menu repair learning/pricing snapshots back to canonical quote lines.
-- Additive and nullable only; no destructive or uniqueness constraints are introduced.

do $$
begin
  if to_regclass('public.menu_repair_items') is not null then
    alter table public.menu_repair_items
      add column if not exists source_quote_line_id uuid;

    comment on column public.menu_repair_items.source_quote_line_id is
      'Canonical work_order_quote_lines row most recently used to learn/update this menu repair item. Nullable for legacy/manual items.';
  else
    raise notice 'Skipping menu_repair_items source_quote_line_id: public.menu_repair_items does not exist.';
  end if;
end $$;

do $$
begin
  if to_regclass('public.menu_repair_item_pricing_snapshots') is not null then
    alter table public.menu_repair_item_pricing_snapshots
      add column if not exists source_quote_line_id uuid,
      add column if not exists source_work_order_line_id uuid;

    comment on column public.menu_repair_item_pricing_snapshots.source_quote_line_id is
      'Canonical work_order_quote_lines row whose approved/materialized pricing created this snapshot, when applicable.';
    comment on column public.menu_repair_item_pricing_snapshots.source_work_order_line_id is
      'Materialized work_order_lines row associated with this pricing snapshot, when applicable.';
  else
    raise notice 'Skipping menu_repair_item_pricing_snapshots trace columns: public.menu_repair_item_pricing_snapshots does not exist.';
  end if;
end $$;

do $$
begin
  if to_regclass('public.menu_repair_items') is not null then
    create index if not exists idx_menu_repair_items_shop_source_quote_line
      on public.menu_repair_items (shop_id, source_quote_line_id)
      where source_quote_line_id is not null;
  end if;

  if to_regclass('public.menu_repair_item_pricing_snapshots') is not null then
    create index if not exists idx_menu_repair_pricing_snapshots_shop_source_quote_line
      on public.menu_repair_item_pricing_snapshots (shop_id, source_quote_line_id)
      where source_quote_line_id is not null;

    create index if not exists idx_menu_repair_pricing_snapshots_shop_source_wol
      on public.menu_repair_item_pricing_snapshots (shop_id, source_work_order_line_id)
      where source_work_order_line_id is not null;
  end if;
end $$;
