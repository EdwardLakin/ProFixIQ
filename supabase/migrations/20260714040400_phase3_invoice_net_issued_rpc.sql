begin;

create or replace function public.get_invoice_net_issued_parts(
  p_shop_id uuid,
  p_work_order_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'lineId', p.work_order_line_id,
        'partId', p.part_id,
        'name', coalesce(nullif(trim(p.description_snapshot), ''), 'Part'),
        'qty', p.net_issued_quantity,
        'unitPrice', p.unit_sell_price,
        'totalPrice', p.line_total,
        'manufacturer', p.manufacturer_snapshot,
        'supplier', p.supplier_snapshot,
        'vendor', p.vendor_snapshot,
        'partNumber', p.part_number_snapshot,
        'sku', p.sku_snapshot,
        'unitCost', p.unit_cost_snapshot,
        'source', 'work_order_part'
      ) order by p.work_order_line_id, p.id
    ),
    '[]'::jsonb
  )
  from public.invoice_net_issued_parts p
  where p.shop_id = p_shop_id
    and p.work_order_id = p_work_order_id;
$$;

revoke all on function public.get_invoice_net_issued_parts(uuid,uuid) from public;
grant execute on function public.get_invoice_net_issued_parts(uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
