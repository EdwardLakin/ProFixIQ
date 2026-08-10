begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Purchase orders historically use their UUID as the durable internal
-- identity. Keep the new secondary PO reference on that same identity instead
-- of truncating it into a collision-prone parallel number.
create or replace function public.parts_assign_purchase_order_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if nullif(trim(new.po_number), '') is null then
    new.po_number := 'PO-' || upper(new.id::text);
  end if;

  return new;
end;
$$;

revoke all on function public.parts_assign_purchase_order_identity()
  from public, anon, authenticated;

commit;
