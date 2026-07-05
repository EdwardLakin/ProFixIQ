-- Add user-entered catalog request fields without changing existing rows.
alter table public.part_request_items
  add column if not exists requested_part_number text,
  add column if not exists requested_manufacturer text;

create index if not exists idx_part_request_items_shop_requested_part_number
  on public.part_request_items (shop_id, requested_part_number)
  where requested_part_number is not null;

create index if not exists idx_part_request_items_shop_requested_manufacturer
  on public.part_request_items (shop_id, requested_manufacturer)
  where requested_manufacturer is not null;

-- Preserve the existing RPC signature while allowing callers to include optional
-- partNumber/requested_part_number and manufacturer/requested_manufacturer keys
-- in each JSON item. Existing description + qty callers continue to work.
create or replace function public.create_part_request_with_items(
  p_work_order_id uuid,
  p_items jsonb,
  p_job_id text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_request_id uuid;
  v_item jsonb;
  v_description text;
  v_part_number text;
  v_manufacturer text;
  v_qty numeric;
begin
  select wo.shop_id into v_shop_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_shop_id is null then
    raise exception 'Work order not found or missing shop_id';
  end if;

  insert into public.part_requests (work_order_id, shop_id, job_id, notes, status)
  values (p_work_order_id, v_shop_id, nullif(p_job_id, ''), nullif(p_notes, ''), 'requested')
  returning id into v_request_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_part_number := nullif(btrim(coalesce(v_item->>'partNumber', v_item->>'requested_part_number', '')), '');
    v_manufacturer := nullif(btrim(coalesce(v_item->>'manufacturer', v_item->>'requested_manufacturer', '')), '');
    v_qty := greatest(1, coalesce(nullif(v_item->>'qty', '')::numeric, 1));

    if v_description <> '' then
      insert into public.part_request_items (
        request_id,
        shop_id,
        work_order_id,
        description,
        qty,
        qty_requested,
        requested_part_number,
        requested_manufacturer
      ) values (
        v_request_id,
        v_shop_id,
        p_work_order_id,
        v_description,
        v_qty,
        v_qty,
        v_part_number,
        v_manufacturer
      );
    end if;
  end loop;

  return v_request_id;
end;
$$;
