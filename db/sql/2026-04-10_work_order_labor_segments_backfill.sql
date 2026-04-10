-- Backfill trustworthy historical labor segments from legacy line punches.
-- Safe rules:
-- 1) Only lines with assigned_tech_id, punched_in_at and punched_out_at.
-- 2) Require punch-out after punch-in.
-- 3) Skip lines that already have any segment history.
-- 4) Keep shop/work-order lineage intact.

insert into public.work_order_line_labor_segments (
  shop_id,
  work_order_id,
  work_order_line_id,
  technician_id,
  started_at,
  ended_at,
  source,
  created_by,
  metadata
)
select
  wol.shop_id,
  wol.work_order_id,
  wol.id as work_order_line_id,
  wol.assigned_tech_id as technician_id,
  wol.punched_in_at as started_at,
  wol.punched_out_at as ended_at,
  'legacy_line_backfill'::text as source,
  wol.assigned_tech_id as created_by,
  jsonb_build_object(
    'backfill', true,
    'from', 'work_order_lines',
    'backfilled_at', now()
  ) as metadata
from public.work_order_lines wol
where wol.shop_id is not null
  and wol.work_order_id is not null
  and wol.assigned_tech_id is not null
  and wol.punched_in_at is not null
  and wol.punched_out_at is not null
  and wol.punched_out_at > wol.punched_in_at
  and not exists (
    select 1
    from public.work_order_line_labor_segments seg
    where seg.work_order_line_id = wol.id
  );
