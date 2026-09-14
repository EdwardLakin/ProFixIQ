begin;

create unique index if not exists uq_work_order_quote_lines_maintenance_service
  on public.work_order_quote_lines (
    shop_id,
    work_order_id,
    ((metadata ->> 'maintenance_service_code'))
  )
  where metadata ->> 'source' = 'maintenance_suggestion'
    and nullif(metadata ->> 'maintenance_service_code', '') is not null;

create or replace function public.materialize_maintenance_quote_line_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_metadata jsonb :=
    coalesce(to_jsonb(new.intake_json) -> 'quote_line_metadata', '{}'::jsonb);
  mapped_menu_item_id_text text;
  mapped_menu_item_id uuid;
  mapped_inspection_template_id uuid;
  mapped_service_key text;
begin
  if quote_metadata ->> 'source' is distinct from 'maintenance_suggestion' then
    return new;
  end if;

  new.service_code := coalesce(
    nullif(quote_metadata ->> 'maintenance_service_code', ''),
    new.service_code
  );

  mapped_menu_item_id_text :=
    nullif(quote_metadata ->> 'maintenance_menu_item_id', '');
  if mapped_menu_item_id_text is null
     or mapped_menu_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;

  mapped_menu_item_id := mapped_menu_item_id_text::uuid;

  select
    menu_item.id,
    menu_item.inspection_template_id,
    menu_item.service_key
  into
    mapped_menu_item_id,
    mapped_inspection_template_id,
    mapped_service_key
  from public.menu_items as menu_item
  where menu_item.id = mapped_menu_item_id
    and (menu_item.shop_id = new.shop_id or menu_item.shop_id is null)
  order by (menu_item.shop_id = new.shop_id) desc
  limit 1;

  if found then
    new.menu_item_id := coalesce(new.menu_item_id, mapped_menu_item_id);
    new.inspection_template_id := coalesce(
      new.inspection_template_id,
      mapped_inspection_template_id
    );
    new.service_code := coalesce(new.service_code, mapped_service_key);
  end if;

  return new;
end;
$$;

revoke all on function public.materialize_maintenance_quote_line_identity()
  from public, anon, authenticated;

drop trigger if exists trg_materialize_maintenance_quote_line_identity
  on public.work_order_lines;
create trigger trg_materialize_maintenance_quote_line_identity
before insert on public.work_order_lines
for each row
execute function public.materialize_maintenance_quote_line_identity();

commit;
